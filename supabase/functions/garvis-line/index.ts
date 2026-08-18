// supabase/functions/garvis-line/index.ts
// THE GARVIS LINE's write path (SW4.3) — the ONLY thing that ever writes garvis_line rows, so
// verified_at cannot be self-granted (RLS gives owners read + delete, nothing else).
//
// Actions (JWT-authed, always the caller's own row):
//   start    {phone}   → validate E.164, rate-limit (garvisLine.ts), text a 6-digit code via
//                        Twilio, store its PEPPERED hash + expiry. The raw code exists only in
//                        the SMS — never in a row, a log, or this response.
//   confirm  {code}    → constant-time hash compare; wrong guesses count and lock; a match sets
//                        verified_at and clears the code state.
//   proactive {enabled}→ flip proactive_enabled — only while verified.
//   status   {}        → binding state for the Settings card (the row's hash never leaves).
//
// Honesty spine: unconfigured Twilio names the setup step; every refusal says why.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { timingSafeEqual } from '../_shared/cronGate.ts';
import { twilioCreds } from '../_shared/connections.ts';
import { toE164 } from '../../../src/lib/garvis/sms.ts';
import {
  MAX_CODE_ATTEMPTS, bindingState, codeExpiryFrom, codeFormatOk, hashCode, maskPhone,
  nextStartCounters, startAllowed, type LineRow,
} from '../../../src/lib/garvis/garvisLine.ts';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const pepper = Deno.env.get('WORKER_SECRET') ?? '';
    if (!pepper) return json({ error: 'The Garvis Line needs WORKER_SECRET set (the heartbeat secret) — it peppers the verification codes.' }, 500);

    const body = (await req.json().catch(() => ({}))) as { action?: string; phone?: string; code?: string; enabled?: boolean };
    const nowIso = new Date().toISOString();
    const { data: rowData } = await admin.from('garvis_line').select('*').eq('owner_id', user.id).maybeSingle();
    const row = rowData as LineRow | null;

    if (body.action === 'status') {
      return json({
        state: bindingState(row, nowIso),
        phone: row ? maskPhone(row.phone_e164) : null,
        proactive_enabled: row?.proactive_enabled ?? false,
        attempts_left: row ? Math.max(0, MAX_CODE_ATTEMPTS - row.code_attempts) : null,
      });
    }

    if (body.action === 'start') {
      const phone = toE164(body.phone);
      if (!phone) return json({ error: 'That does not read as a phone number — use international format, like +1 555 010 1234.' }, 400);
      if (row && !startAllowed(row.last_start_at, row.starts_in_hour, nowIso)) {
        return json({ error: 'Too many code requests this hour — wait a bit and try again.' }, 429);
      }
      // Connection-first (API manager): the caller's own Twilio rail, platform fallback.
      const creds = await twilioCreds(admin, user.id);
      if (!creds?.from) {
        return json({ error: 'Texting is not set up yet — connect Twilio in Settings → Connections first.' }, 503);
      }
      const { sid, token, from } = creds;

      // The code is born, texted, hashed, and forgotten — it exists in plaintext only inside
      // the SMS body below.
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      const code = String(buf[0] % 1_000_000).padStart(6, '0');
      const counters = nextStartCounters(row?.last_start_at ?? null, row?.starts_in_hour ?? 0, nowIso);

      const { error: upErr } = await admin.from('garvis_line').upsert({
        owner_id: user.id, phone_e164: phone,
        verify_code_hash: await hashCode(code, user.id, pepper),
        code_expires_at: codeExpiryFrom(nowIso), code_attempts: 0,
        ...counters, verified_at: null, updated_at: nowIso,
      }, { onConflict: 'owner_id' });
      if (upErr) {
        return /unique|duplicate/i.test(upErr.message)
          ? json({ error: 'That number is already bound to another account.' }, 409)
          : json({ error: `Could not save the binding: ${upErr.message}` }, 500);
      }

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phone, From: from, Body: `Garvis here. Your verification code is ${code}. It expires in 10 minutes.` }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { message?: string };
        return json({ error: `Twilio refused the code text: ${detail.message ?? `HTTP ${res.status}`}` }, 502);
      }
      return json({ ok: true, sent_to: maskPhone(phone) });
    }

    if (body.action === 'confirm') {
      if (!codeFormatOk(body.code)) return json({ error: 'The code is six digits.' }, 400);
      const state = bindingState(row, nowIso);
      if (state === 'unbound') return json({ error: 'No code is pending — start by adding your number.' }, 400);
      if (state === 'verified') return json({ ok: true, already: true });
      if (state === 'locked') return json({ error: 'Too many wrong guesses — request a fresh code.' }, 423);
      if (state === 'code_expired') return json({ error: 'That code expired — request a fresh one.' }, 410);

      const expected = row!.verify_code_hash!;
      const got = await hashCode(body.code!.trim(), user.id, pepper);
      if (!timingSafeEqual(expected, got)) {
        const attempts = row!.code_attempts + 1;
        await admin.from('garvis_line').update({ code_attempts: attempts, updated_at: nowIso }).eq('owner_id', user.id);
        const left = MAX_CODE_ATTEMPTS - attempts;
        return json({ error: left > 0 ? `Wrong code — ${left} attempt(s) left.` : 'Too many wrong guesses — request a fresh code.' }, left > 0 ? 401 : 423);
      }
      await admin.from('garvis_line').update({
        verified_at: nowIso, verify_code_hash: null, code_expires_at: null, code_attempts: 0, updated_at: nowIso,
      }).eq('owner_id', user.id);
      return json({ ok: true, verified: true });
    }

    if (body.action === 'proactive') {
      if (bindingState(row, nowIso) !== 'verified') return json({ error: 'Verify your number first — proactive texts only go to a proven phone.' }, 400);
      await admin.from('garvis_line').update({ proactive_enabled: body.enabled === true, updated_at: nowIso }).eq('owner_id', user.id);
      return json({ ok: true, proactive_enabled: body.enabled === true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
