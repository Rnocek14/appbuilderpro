// supabase/functions/docusign-webhook/index.ts
// DocuSign Connect receiver — envelope status updates land here. Deployed --no-verify-jwt (it is
// open to the internet), so it FAILS CLOSED: no configured secret → reject everything (the poll in
// docusign-send keeps statuses honest instead); missing/invalid HMAC → reject. The lakegen source
// accepted unsigned payloads — anyone could forge a "completed" status; this never does.
//
// Deploy: in package.json functions:deploy:webhooks (--no-verify-jwt).
// Secrets: DOCUSIGN_WEBHOOK_SECRET (the SAME value configured as the Connect HMAC key in DocuSign).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapDocusignStatus, mapRecipientStatus, type EsignRecipient } from '../_shared/esignCore.ts';
import { freshProviderToken } from '../_shared/oauth.ts';

const AUTH_BASE = Deno.env.get('DOCUSIGN_AUTH_BASE') ?? 'https://account-d.docusign.com';

/** FILE THE SIGNED DOCUMENT (app_0099 back half): pull the completed envelope's combined PDF
 *  with the OWNER's own DocuSign token and land it in storage — the signed artifact reaches the
 *  system of record instead of living only in DocuSign's inbox. Best-effort: any miss leaves
 *  signed_pdf_path null and the envelope still completes (the operator can re-poll later). */
// deno-lint-ignore no-explicit-any
async function fileSignedPdf(admin: any, ownerId: string, rowId: string, envelopeId: string): Promise<void> {
  try {
    const token = await freshProviderToken(admin, ownerId, 'docusign');
    if (!token) return;
    const ui = await fetch(`${AUTH_BASE}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (!ui.ok) return;
    const u = await ui.json() as { accounts?: { account_id?: string; base_uri?: string; is_default?: boolean }[] };
    const acct = (u.accounts ?? []).find((a) => a.is_default) ?? (u.accounts ?? [])[0];
    if (!acct?.account_id || !acct?.base_uri) return;
    const doc = await fetch(`${acct.base_uri}/restapi/v2.1/accounts/${acct.account_id}/envelopes/${envelopeId}/documents/combined`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000),
    });
    if (!doc.ok) return;
    const bytes = new Uint8Array(await doc.arrayBuffer());
    if (bytes.length < 500) return; // not a real PDF — never file junk
    const path = `${ownerId}/esign/${envelopeId}.pdf`;
    const { error: upErr } = await admin.storage.from('project-assets')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) return;
    await admin.from('esign_envelopes').update({ signed_pdf_path: path }).eq('id', rowId);
  } catch { /* filing is best-effort by contract */ }
}

async function hmacBase64(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Constant-time compare — a non-timing-safe compare was one of the lakegen findings. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a); const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const secret = Deno.env.get('DOCUSIGN_WEBHOOK_SECRET');
    const raw = await req.text();
    // FAIL CLOSED on every path: unconfigured, unsigned, or mis-signed → 401.
    if (!secret) return json({ error: 'webhook not configured' }, 401);
    const sig = req.headers.get('x-docusign-signature-1') ?? '';
    if (!sig) return json({ error: 'missing signature' }, 401);
    const expected = await hmacBase64(secret, raw);
    if (!timingSafeEqual(sig, expected)) return json({ error: 'bad signature' }, 401);

    const payload = JSON.parse(raw) as {
      event?: string;
      data?: { envelopeId?: string; envelopeSummary?: { status?: string; completedDateTime?: string; recipients?: { signers?: { email?: string; status?: string; signedDateTime?: string }[] } } };
    };
    const envelopeId = payload.data?.envelopeId;
    if (!envelopeId) return json({ ok: true, note: 'no envelopeId — ignored' });

    const mapped = mapDocusignStatus(payload.event ?? payload.data?.envelopeSummary?.status ?? '');
    if (!mapped) return json({ ok: true, note: 'unrecognized status — ignored, never guessed' });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: row } = await admin.from('esign_envelopes')
      .select('id, owner_id, title, recipients, status').eq('envelope_id', envelopeId).maybeSingle();
    if (!row) return json({ ok: true, note: 'envelope unknown to this system — ignored' });

    let recipients = (row.recipients ?? []) as EsignRecipient[];
    const signers = payload.data?.envelopeSummary?.recipients?.signers ?? [];
    if (signers.length > 0) {
      recipients = recipients.map((r) => {
        const match = signers.find((s) => (s.email ?? '').toLowerCase() === r.email.toLowerCase());
        if (!match) return r;
        const st = mapRecipientStatus(match.status ?? '');
        return { ...r, status: st ?? r.status, signedAt: match.signedDateTime ?? r.signedAt };
      });
    }

    // Monotonic guard (scan B18): DocuSign Connect redelivers and reorders — a stale 'sent'
    // event must never drag a completed/declined/voided envelope back to life. Terminal states
    // only ever advance to other terminal states.
    const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, completed: 3, declined: 3, voided: 3 };
    const current = String(row.status ?? '');
    if ((RANK[mapped] ?? 0) < (RANK[current] ?? 0)) {
      return json({ ok: true, note: `stale event (${mapped} after ${current}) — ignored` });
    }
    const patch: Record<string, unknown> = { status: mapped, recipients };
    if (mapped === 'completed') patch.completed_at = payload.data?.envelopeSummary?.completedDateTime ?? new Date().toISOString();
    await admin.from('esign_envelopes').update(patch).eq('id', row.id);

    if (mapped === 'completed') await fileSignedPdf(admin, row.owner_id, row.id, envelopeId);

    if (mapped === 'completed' || mapped === 'declined') {
      await admin.from('mind_events').insert({
        owner_id: row.owner_id, source: 'execution', event_type: 'note',
        subject: mapped === 'completed'
          ? `Signed ✓ "${String(row.title).slice(0, 120)}"`
          : `Declined: "${String(row.title).slice(0, 120)}"`,
        payload: { key: `esign-${mapped}:${row.id}`, envelope_row_id: row.id, envelope_id: envelopeId },
      }).then(() => {}, () => {});
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
