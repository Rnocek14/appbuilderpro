// supabase/functions/send-sms/index.ts
// THE ONE SMS SEND PATH — the SMS twin of send-email. Takes an APPROVED approval row (kind='send_sms')
// whose payload references an outreach_message (channel='sms', to_address = the E.164 phone, body_text =
// the text), re-checks every gate at send time, sends via Twilio, and writes the execution_runs ledger.
// Sending outside an approval is impossible; two callers (owner JWT / garvis-auto worker) share one path.
//
// Gates: SMS kill switch (outreach_settings.sms_enabled, OFF by default), Twilio configured, valid E.164,
// contact TCPA consent + not unsubscribed, non-empty body, daily cap. Fails CLOSED on consent.
//
// Deploy: npx supabase functions deploy send-sms
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { payloadMatches } from '../_shared/payloadHash.ts';
import { toE164, validSmsBody, smsConsentOk, resolveSmsFrom, type SmsConsent } from '../../../src/lib/garvis/sms.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { approval_id } = (await req.json().catch(() => ({}))) as { approval_id?: string };
    if (!approval_id) return json({ error: 'approval_id is required.' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Two callers, one path (mirrors send-email): owner JWT, or the garvis-auto worker via x-worker-secret.
    const workerSecret = Deno.env.get('WORKER_SECRET');
    const byWorker = !!workerSecret && req.headers.get('x-worker-secret') === workerSecret;

    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result, requested_by').eq('id', approval_id).single();
    if (!approval) return json({ error: 'Approval not found' }, 404);
    if (approval.kind !== 'send_sms') return json({ error: 'Approval is not a send_sms.' }, 400);
    if (approval.status !== 'approved') return json({ error: `Approval is ${approval.status}, not approved.` }, 409);
    if (!(await payloadMatches(approval.payload, approval.payload_hash as string | null))) {
      return json({ error: 'Approval payload changed since it was approved — refusing to send.' }, 409);
    }

    let uid: string;
    if (byWorker) {
      if (approval.requested_by !== 'garvis-auto') return json({ error: 'Worker sends are limited to garvis-auto approvals.' }, 403);
      uid = approval.owner_id as string;
    } else {
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (approval.owner_id !== user.id) return json({ error: 'Approval not found' }, 404);
      uid = user.id;
    }

    const payload = (approval.payload ?? {}) as { message_id?: string; sms_kind?: 'marketing' | 'transactional'; from_number?: string };
    const messageId = payload.message_id;
    if (!messageId) return json({ error: 'Approval payload is missing message_id.' }, 400);
    const smsKind = payload.sms_kind === 'transactional' ? 'transactional' : 'marketing';   // default to the stricter gate

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    // PER-CLIENT ROUTING: the enqueuer stamps payload.from_number with the client's own number when
    // they've connected one, so the text comes from THEIR line (recognizable to their customer). We
    // still fall back to the operator's shared TWILIO_FROM_NUMBER. Both sit on the one Twilio account,
    // so accountSid/authToken stay global. Refuse only when neither sender is usable.
    const fromNumber = resolveSmsFrom(payload.from_number, Deno.env.get('TWILIO_FROM_NUMBER'));
    if (!accountSid || !authToken) return json({ error: 'SMS is not configured (Twilio secrets missing).' }, 400);
    if (!fromNumber) return json({ error: 'No SMS sender number configured (client or default).' }, 400);

    const { data: msg } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id, contact_id, channel, body_text, to_address, status, sent_at')
      .eq('id', messageId).single();
    if (!msg || msg.owner_id !== uid) return json({ error: 'Message not found' }, 404);
    if (msg.channel !== 'sms') return json({ error: 'Message is not an SMS.' }, 400);
    if (msg.sent_at || msg.status === 'sent') return json({ error: 'Message already sent.' }, 409);

    const priorResult = (approval.result as Record<string, unknown> | null) ?? {};
    // Atomic double-send claim (same pattern as send-email).
    const { data: claimRows, error: claimErr } = await admin.from('approvals')
      .update({ result: { ...priorResult, send_claimed_at: new Date().toISOString() } })
      .eq('id', approval_id).eq('status', 'approved').is('result->>send_claimed_at', null).select('id');
    if (claimErr || !claimRows?.length) return json({ error: 'This send is already in flight.' }, 409);
    const releaseClaim = (extra: Record<string, unknown> = {}) =>
      admin.from('approvals').update({ result: { ...priorResult, ...extra, send_claimed_at: null } }).eq('id', approval_id);
    const ledger = (row: Record<string, unknown>) =>
      admin.from('execution_runs').insert({ owner_id: uid, approval_id, connector: 'twilio', action: 'send_sms', ...row });
    const block = async (reason: string): Promise<Response> => {
      await admin.from('outreach_messages').update({ status: 'blocked' }).eq('id', messageId);
      await ledger({ status: 'skipped', request: { message_id: messageId }, error: reason });
      await releaseClaim({ blocked: reason, blocked_at: new Date().toISOString() });
      return json({ ok: false, error: reason }, 422);
    };

    // ----- gates -----
    const { data: settings } = await admin.from('outreach_settings').select('sms_enabled, sms_daily_cap').eq('owner_id', uid).maybeSingle();
    if (!settings?.sms_enabled) return block('SMS sending is off (flip sms_enabled in settings to opt in).');

    const to = toE164(msg.to_address as string | null);
    if (!to) return block('Recipient phone is missing or not a valid number.');
    if (!validSmsBody(msg.body_text as string | null)) return block('SMS body is empty or too long.');
    // PLACEHOLDER GATE (fail-closed): never text a real person a literal "[YOU FILL …]" / "[EDIT …]" hole.
    if (/\[(?:YOU FILL|EDIT)\b/i.test((msg.body_text as string | null) ?? '')) return block('SMS still has an unfilled [YOU FILL]/[EDIT] placeholder — refusing to send.');

    // TCPA consent — fails CLOSED. Load the contact this text is going to.
    if (!msg.contact_id) return block('No consented contact on the message — refusing to text.');
    const { data: contact } = await admin.from('contacts').select('id, phone_status, sms_consent').eq('id', msg.contact_id).maybeSingle();
    if (!contact) return block('Contact not found — refusing to text.');
    if (contact.phone_status === 'unsubscribed') return block('Recipient has opted out of texts (STOP).');
    if (!smsConsentOk(contact.sms_consent as SmsConsent, smsKind)) return block(`No ${smsKind} SMS consent on file for this contact.`);

    // Daily cap (SMS only).
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const { count: sentToday } = await admin.from('outreach_messages')
      .select('id', { count: 'exact', head: true }).eq('owner_id', uid).eq('channel', 'sms').eq('status', 'sent').gte('sent_at', startOfDay.toISOString());
    if ((sentToday ?? 0) >= (settings.sms_daily_cap ?? 50)) return block(`Daily SMS cap reached (${settings.sms_daily_cap}).`);

    // ----- send via Twilio -----
    const body = new URLSearchParams({ To: to, From: fromNumber, Body: (msg.body_text as string).trim() });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !data.sid) {
      const reason = `Twilio ${res.status}: ${(data.message ?? 'send failed').slice(0, 200)}`;
      await ledger({ status: 'failed', request: { message_id: messageId }, error: reason });
      await releaseClaim({ last_error: reason });   // retryable — do NOT mark the message sent
      return json({ ok: false, error: reason }, 502);
    }

    await admin.from('outreach_messages').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: data.sid }).eq('id', messageId);
    await ledger({ status: 'ok', request: { message_id: messageId }, result: { sid: data.sid } });
    await releaseClaim({ sent_sid: data.sid, sent_at: new Date().toISOString() });
    return json({ ok: true, sid: data.sid });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
