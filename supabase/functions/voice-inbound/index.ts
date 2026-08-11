// supabase/functions/voice-inbound/index.ts
// MISSED-CALL TEXT-BACK — the Twilio Voice webhook. Two stages, one function:
//   stage=inbound (default): a call hits the client's Twilio number → we return TwiML that rings the
//     business's REAL line for `ring_seconds`, with a dial-action callback pointed back here.
//   stage=status: Twilio POSTs the dial outcome → if the call was MISSED (no-answer/busy/failed/
//     canceled) we text the caller back within seconds via Twilio, and log the event either way.
//
// The config row (missed_call_configs) IS the pre-authorization — the operator set a fixed transactional
// template + numbers once; each missed call auto-sends that exact template to the person who just called
// (caller-initiated, a single reply). We still honor a prior STOP (contact.phone_status='unsubscribed').
//
// SECURITY: this is a public, unauthenticated webhook that triggers OUTBOUND texts, so every request is
// Twilio-signature-validated (HMAC-SHA1 of the request URL + sorted params, base64 == X-Twilio-Signature).
// Forged/unsigned requests are rejected. Deploy --no-verify-jwt (Twilio can't send a Supabase JWT).
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (+ the Twilio number's Voice webhook → this URL).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildInboundTwiml, buildHangupTwiml, dialWasMissed, textBackTarget, renderMissedCallSms,
} from '../../../src/lib/garvis/missedCall.ts';
import { toE164 } from '../../../src/lib/garvis/sms.ts';
import { twilioSignatureOk } from '../_shared/twilioSig.ts';

const XML = { 'content-type': 'text/xml; charset=utf-8' };

// RUNAWAY GUARD: text-backs per config per UTC day. The reply is transactional and caller-initiated
// (the config row is the pre-authorization, so it deliberately does NOT ride outreach's sms_enabled
// switch or marketing cap) — but a war-dialer hitting the number would otherwise convert every robo-
// call into a paid outbound text. No legitimate small business misses 100 calls in a day; past the
// cap we log honestly and stay quiet.
const DAILY_TEXTBACK_CAP = 100;

Deno.serve(async (req) => {
  const twiml = (body: string) => new Response(body, { status: 200, headers: XML });
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  try {
    const url = new URL(req.url);
    const stage = url.searchParams.get('stage') === 'status' ? 'status' : 'inbound';

    // Twilio sends application/x-www-form-urlencoded. Read every field as a flat string map.
    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');

    // ── signature check (fail closed) ──────────────────────────────────────
    // Twilio signs over the EXACT URL configured in its console. Behind Supabase's proxy that can differ
    // from req.url, so the operator can pin it with VOICE_WEBHOOK_URL; otherwise we derive it from
    // SUPABASE_URL. We try req.url and the base (with/without the incoming query) and accept any match.
    const signature = req.headers.get('x-twilio-signature') ?? '';
    if (!authToken) return twiml(buildHangupTwiml());   // not configured → do nothing, never crash a call
    const base = Deno.env.get('VOICE_WEBHOOK_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/voice-inbound`;
    const candidateUrls = [req.url, base, url.search ? `${base}${url.search}` : base];
    if (!signature || !(await twilioSignatureOk(authToken, signature, candidateUrls, params))) {
      return new Response('Invalid signature', { status: 403 });
    }

    const To = params.To ?? params.Called ?? '';
    const From = params.From ?? params.Caller ?? '';
    const callSid = params.CallSid ?? '';

    // The config is looked up by the CALLED number (globally unique). No config → nothing to do.
    const { data: cfg } = await admin.from('missed_call_configs')
      .select('id, owner_id, twilio_number, forward_to, template, business_name, ring_seconds, enabled')
      .eq('twilio_number', To).maybeSingle();

    // ── stage: inbound → ring the business's real line, callback here on completion ──
    if (stage === 'inbound') {
      if (!cfg || !cfg.enabled || !cfg.forward_to) return twiml(buildHangupTwiml());
      const actionUrl = `${base}?stage=status`;
      return twiml(buildInboundTwiml({
        forwardTo: cfg.forward_to as string,
        ringSeconds: (cfg.ring_seconds as number) ?? 20,
        actionUrl,
      }));
    }

    // ── stage: status → text back on a missed call ──
    const dialStatus = params.DialCallStatus ?? params.CallStatus ?? '';
    const logEvent = (row: Record<string, unknown>) =>
      admin.from('missed_call_events').insert({
        owner_id: cfg?.owner_id ?? null, config_id: cfg?.id ?? null,
        call_sid: callSid, from_number: From, to_number: To, dial_status: dialStatus, ...row,
      }).then(() => {}, () => {});

    if (!cfg || !cfg.enabled) { await logEvent({ texted_back: false, note: 'no active config' }); return twiml(buildHangupTwiml()); }
    if (!dialWasMissed(dialStatus)) { await logEvent({ texted_back: false, note: `connected (${dialStatus})` }); return twiml(buildHangupTwiml()); }

    const fromE164 = toE164(From);
    const to = textBackTarget({ enabled: !!cfg.enabled, twilioNumber: cfg.twilio_number as string }, fromE164);
    if (!to) { await logEvent({ texted_back: false, note: 'caller not textable' }); return twiml(buildHangupTwiml()); }

    // Honor a prior STOP — never text a caller who has opted out.
    const { data: contact } = await admin.from('contacts')
      .select('id, phone_status').eq('owner_id', cfg.owner_id).eq('phone_e164', to).limit(1);
    if (contact && contact.length && (contact[0] as { phone_status?: string }).phone_status === 'unsubscribed') {
      await logEvent({ texted_back: false, note: 'caller opted out (STOP)' });
      return twiml(buildHangupTwiml());
    }

    if (!accountSid) { await logEvent({ texted_back: false, note: 'twilio not configured' }); return twiml(buildHangupTwiml()); }

    // Daily cap per config (see DAILY_TEXTBACK_CAP above). Fail-open on a count error — a metrics
    // hiccup must not silence a real missed caller.
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const { count: textedToday, error: capErr } = await admin.from('missed_call_events')
      .select('id', { count: 'exact', head: true })
      .eq('config_id', cfg.id).eq('texted_back', true).gte('created_at', dayStart.toISOString());
    if (!capErr && (textedToday ?? 0) >= DAILY_TEXTBACK_CAP) {
      await logEvent({ texted_back: false, note: `daily text-back cap reached (${DAILY_TEXTBACK_CAP})` });
      return twiml(buildHangupTwiml());
    }

    // IDEMPOTENCY on call_sid: Twilio retries a dial-action callback whose 200 it didn't receive in time
    // (a slow response, a network blip) — always sequentially, after a timeout. Without a guard each retry
    // re-sends the text, so the caller gets the same "sorry we missed you" two or three times. Before
    // sending, refuse if we've already texted back for THIS call (call_sid is globally unique per Twilio
    // call). Skip the check only when Twilio sent no CallSid — then we have nothing to dedupe on.
    if (callSid) {
      const { data: prior } = await admin.from('missed_call_events')
        .select('id').eq('call_sid', callSid).eq('texted_back', true).limit(1);
      if (prior && prior.length) {
        await logEvent({ texted_back: false, note: 'already texted back for this call (duplicate callback)' });
        return twiml(buildHangupTwiml());
      }
    }

    const body = renderMissedCallSms(cfg.template as string, { business: cfg.business_name as string | null });
    // Text FROM the number they called (same number → recognizable), TO the caller.
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: cfg.twilio_number as string, Body: body }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok || !data.sid) {
      await logEvent({ texted_back: false, note: `twilio ${res.status}: ${(data.message ?? 'send failed').slice(0, 160)}` });
      return twiml(buildHangupTwiml());
    }
    await logEvent({ texted_back: true, message_sid: data.sid });
    // The waking moment's signal: a missed call IS a warm lead — it must never live only in the
    // missed_call_events ledger where nothing surfaces it. Best-effort, never blocks the call.
    await admin.from('mind_events').insert({
      owner_id: cfg.owner_id, event_type: 'note', source: 'sms',
      subject: `Missed call from ${From} — texted back${cfg.business_name ? ` (${cfg.business_name})` : ''}`,
      payload: { kind: 'missed_call_textback', from: From, to: To, call_sid: callSid },
    }).then(() => {}, () => {});
    return twiml(buildHangupTwiml());
  } catch (_e) {
    // Never crash a live phone call — return valid TwiML on any error.
    return twiml(buildHangupTwiml());
  }
});
