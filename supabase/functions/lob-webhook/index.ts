// supabase/functions/lob-webhook/index.ts
// Lob's tracking events land here (SW10.4): HMAC-verified (constant-time), freshness-windowed,
// and applied MONOTONICALLY through the pure lobCore mapping — a piece only ever advances, so a
// replayed or out-of-order event is rejected as already-applied and 'delivered' never regresses.
// A returned-to-sender piece marks its household undeliverable in mail_recipients, so the next
// partition holds it back automatically.
//
// FAIL-CLOSED: with no LOB_WEBHOOK_SECRET set this endpoint refuses ALL events (500) — an
// unverifiable webhook is an attack surface, not a convenience (the stripe-webhook posture).
//
// Deploy: npx supabase functions deploy lob-webhook --no-verify-jwt
// Secrets: LOB_WEBHOOK_SECRET (from the Lob dashboard's webhook settings).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapLobEvent, advancePiece } from '../_shared/lobCore.ts';

const FRESHNESS_MS = 5 * 60 * 1000;

/** Constant-time hex comparison — length leak only, never contents. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const secret = Deno.env.get('LOB_WEBHOOK_SECRET');
    if (!secret) {
      // Refusing ALL events until the secret exists beats accepting forgeries while it doesn't.
      return json({ error: 'LOB_WEBHOOK_SECRET is not set — refusing all events until it is.' }, 500);
    }

    const raw = await req.text();
    const sig = req.headers.get('lob-signature') ?? '';
    const ts = req.headers.get('lob-signature-timestamp') ?? '';
    if (!sig || !ts) return json({ error: 'Missing signature headers.' }, 400);
    const tsMs = Number(ts);
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > FRESHNESS_MS) {
      return json({ error: 'Stale or invalid timestamp.' }, 400);
    }
    const expected = await hmacHex(secret, `${ts}.${raw}`);
    if (!timingSafeEqualHex(expected, sig.toLowerCase())) {
      return json({ error: 'Bad signature.' }, 401);
    }

    const event = JSON.parse(raw) as {
      id?: string;
      event_type?: { id?: string };
      body?: { id?: string };
    };
    const target = mapLobEvent(event.event_type?.id);
    const lobId = event.body?.id;
    if (!target || !lobId) return json({ ok: true, applied: false, reason: 'event type not tracked' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: piece } = await admin.from('mail_pieces')
      .select('id, owner_id, drop_id, household_key, status').eq('lob_id', lobId).maybeSingle();
    if (!piece) return json({ ok: true, applied: false, reason: 'unknown piece' });

    const next = advancePiece(piece.status as string, target);
    if (!next) {
      // Replay or out-of-order — the monotonic guard rejects it; delivered never regresses.
      return json({ ok: true, applied: false, reason: 'already applied or would regress' });
    }

    // CAS on the exact status we read — two concurrent deliveries of the same event collapse to one.
    const { data: cas } = await admin.from('mail_pieces')
      .update({ status: next, last_event: event.event_type?.id ?? next })
      .eq('id', piece.id).eq('status', piece.status).select('id');
    if (!cas?.length) return json({ ok: true, applied: false, reason: 'raced — re-read on the next event' });

    // A returned piece is EVIDENCE: mark the household undeliverable everywhere this owner has it,
    // so the next partition holds it back without anyone having to remember.
    if (next === 'returned') {
      await admin.from('mail_recipients').update({
        verify_status: 'undeliverable',
        verify_detail: 'a mailed piece came back returned-to-sender',
        verified_at: new Date().toISOString(),
      }).eq('owner_id', piece.owner_id).eq('household_key', piece.household_key).then(() => {}, () => {});
    }

    return json({ ok: true, applied: true, status: next });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
