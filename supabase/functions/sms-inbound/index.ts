// supabase/functions/sms-inbound/index.ts
// INBOUND SMS — the Twilio Messaging webhook, and the piece that makes SMS STOP suppression REAL.
// Until this existed, contacts.phone_status='unsubscribed' was checked everywhere (send-sms,
// voice-inbound) but written NOWHERE — app-level opt-out rested entirely on Twilio's carrier
// filtering. Now a STOP lands here and is recorded where every send gate already looks.
//
// What it does per message:
//   * STOP/UNSUBSCRIBE/CANCEL/END/QUIT (optOutKeyword → 'stop'): set phone_status='unsubscribed'
//     on EVERY contact carrying that number, across all owners. Suppression is sacred and
//     over-suppression is the safe direction — one human said stop; no tenant keeps texting them.
//   * START/YES ('start'): set phone_status='ok' — but ONLY for the owner the receiving number
//     resolves to (missed_call_configs / client_subscriptions / the operator's default). Re-consent
//     is narrow; a START to one business is not consent for every tenant in the database.
//   * Anything else: recorded as a mind_event for the resolved owner (an SMS reply is a warm human;
//     it must never land silently) — no auto-reply, no state change.
//
// Twilio's own Advanced Opt-Out still auto-blocks at the carrier level; this webhook is the
// APP-level ledger that keeps our other numbers and channels honest about the same human.
//
// SECURITY: public unauthenticated webhook → every request Twilio-signature-validated (fail-closed),
// same as voice-inbound. Deploy --no-verify-jwt. Point each Twilio number's Messaging webhook here.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { twilioSignatureOk } from '../_shared/twilioSig.ts';
import { notifyText } from '../_shared/notify.ts';
import { optOutKeyword, toE164 } from '../../../src/lib/garvis/sms.ts';

const XML = { 'content-type': 'text/xml; charset=utf-8' };
// Empty TwiML: acknowledge without auto-replying (replies are the operator's to make).
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

Deno.serve(async (req) => {
  const twiml = () => new Response(EMPTY, { status: 200, headers: XML });
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  try {
    const url = new URL(req.url);
    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';

    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!authToken) return twiml();   // not configured → acknowledge and do nothing

    const signature = req.headers.get('x-twilio-signature') ?? '';
    const base = Deno.env.get('SMS_WEBHOOK_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/sms-inbound`;
    const candidateUrls = [req.url, base, url.search ? `${base}${url.search}` : base];
    if (!signature || !(await twilioSignatureOk(authToken, signature, candidateUrls, params))) {
      return new Response('Invalid signature', { status: 403 });
    }

    const from = toE164(params.From ?? '');
    const to = params.To ?? '';
    const body = (params.Body ?? '').trim();
    if (!from) return twiml();

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Resolve which owner this number belongs to — missed-call config first (per-client numbers),
    // then client subscriptions, then the operator's shared default. Best-effort: an unresolved
    // owner still gets the STOP recorded (suppression never waits on attribution).
    let ownerId: string | null = null;
    const { data: mcc } = await admin.from('missed_call_configs')
      .select('owner_id').eq('twilio_number', to).maybeSingle();
    if (mcc) ownerId = mcc.owner_id as string;
    if (!ownerId) {
      const { data: sub } = await admin.from('client_subscriptions')
        .select('owner_id').eq('twilio_number', to).limit(1).maybeSingle();
      if (sub) ownerId = (sub as { owner_id: string }).owner_id;
    }

    const keyword = optOutKeyword(body);

    if (keyword === 'stop') {
      // Across ALL owners — one human said stop; nobody keeps texting them from any tenant.
      await admin.from('contacts')
        .update({ phone_status: 'unsubscribed' }).eq('phone_e164', from);
      if (ownerId) {
        await admin.from('mind_events').insert({
          owner_id: ownerId, event_type: 'note', source: 'sms',
          subject: `SMS opt-out: ${from} texted STOP`,
          payload: { kind: 'sms_stop', from, to },
        }).then(() => {}, () => {});
      }
      return twiml();
    }

    if (keyword === 'start') {
      // Narrow: re-consent applies only to the owner this number resolves to.
      if (ownerId) {
        await admin.from('contacts')
          .update({ phone_status: 'ok' }).eq('owner_id', ownerId).eq('phone_e164', from);
      }
      return twiml();
    }

    // A real human reply — surface it in the waking moment + ring the owner's webhook. Never silent.
    if (ownerId) {
      await admin.from('mind_events').insert({
        owner_id: ownerId, event_type: 'note', source: 'sms',
        subject: `SMS reply from ${from}`,
        payload: { kind: 'sms_reply', from, to, body: body.slice(0, 500) },
      }).then(() => {}, () => {});
      try {
        const { data: owner } = await admin.from('profiles').select('webhook_url').eq('id', ownerId).single();
        await notifyText(
          (owner as { webhook_url?: string } | null)?.webhook_url,
          `💬 SMS REPLY — ${from}\n"${body.slice(0, 300)}"\n(to your number ${to})`,
        );
      } catch { /* best-effort */ }
    }
    return twiml();
  } catch {
    return new Response(EMPTY, { status: 200, headers: XML });   // never make Twilio retry-storm
  }
});
