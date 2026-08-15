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
import { complete, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';
import { quarantineExternal } from '../_shared/untrustedText.ts';
import { COMMANDER_SYSTEM, buildCommanderUser, parseCommand } from '../../../src/lib/garvis/commander.ts';
import { OUT_OF_CREDITS_REPLY, nextReplyCounters, replyAllowed, smsAnswerFor } from '../../../src/lib/garvis/smsConcierge.ts';

const XML = { 'content-type': 'text/xml; charset=utf-8' };
// Empty TwiML: acknowledge without auto-replying (replies are the operator's to make).
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

Deno.serve(async (req) => {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const twiml = (message?: string) => new Response(
    message ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(message)}</Message></Response>` : EMPTY,
    { status: 200, headers: XML },
  );
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

    // ---- THE GARVIS LINE (SW4.4): a VERIFIED operator number gets an ANSWER ----------------
    // Identity is the app_0143 binding, not the webhook signature (that authenticates Twilio,
    // not the human). STRICTLY read-only by construction: smsAnswerFor() maps every Command
    // kind to a sentence — classification never becomes execution, and no approval is ever
    // created or decided from a text. From-spoofing therefore buys an attacker at most a
    // rate-limited, quarantined READ — and the turn lands provenance-stamped so replayed
    // history knows it arrived over SMS.
    const { data: lineRow } = await admin.from('garvis_line')
      .select('owner_id, verified_at, last_reply_at, replies_in_hour')
      .eq('phone_e164', from).maybeSingle();
    const line = lineRow as { owner_id: string; verified_at: string | null; last_reply_at: string | null; replies_in_hour: number } | null;
    if (line?.verified_at && body) {
      const nowIso = new Date().toISOString();
      if (!replyAllowed(line.last_reply_at, line.replies_in_hour, nowIso)) return twiml();   // cap hit: silence, never a loop
      const owner = line.owner_id;

      // Both turns land in the ONE conversation record, channel-stamped (app_0144), so the
      // command page shows the exchange and later prompts know a texted line's origin.
      const say = async (role: 'user' | 'garvis', text: string) => {
        await admin.from('command_messages').insert({ owner_id: owner, role, text, channel: 'sms' }).then(() => {}, () => {});
      };
      await say('user', body.slice(0, 1000));
      await admin.from('garvis_line').update({ ...nextReplyCounters(line.last_reply_at, line.replies_in_hour, nowIso), updated_at: nowIso }).eq('owner_id', owner);

      // Metered like every judgment path (kind 'garvis'); out of credits degrades to the
      // fixed no-model floor — a spoofed stream can never spend outside the caps.
      try { await checkCredits(admin, owner, 'garvis'); }
      catch (e) {
        const floor = e instanceof InsufficientCreditsError ? OUT_OF_CREDITS_REPLY : 'I hit a snag reading that — try again in a minute.';
        await say('garvis', floor);
        return twiml(floor);
      }

      try {
        // Grounding: portfolio snapshot + recent conversation (its own SMS turns included).
        const [{ data: apps }, { data: recent }] = await Promise.all([
          admin.from('apps').select('name, stage, description').eq('owner_id', owner).is('deleted_at', null).limit(20),
          admin.from('command_messages').select('role, text').eq('owner_id', owner).order('created_at', { ascending: false }).limit(12),
        ]);
        const snapshot = ((apps ?? []) as { name: string; stage: string | null; description: string | null }[])
          .map((a) => `- ${a.name}${a.stage ? ` (${a.stage})` : ''}: ${a.description ?? 'no description'}`).join('\n');
        const history = (((recent ?? []) as { role: 'user' | 'garvis'; text: string }[]).reverse()).slice(0, -1);

        // INJECTION QUARANTINE (SW4.2): the texted body is external text — neutralized and
        // fenced BEFORE the commander reads it, and before it replays as history it is already
        // stored channel-stamped.
        const q = quarantineExternal(body, 1_000);
        const m = modelForPlan(await getUserPlan(admin, owner));
        const r = await complete([
          { role: 'system', content: COMMANDER_SYSTEM },
          { role: 'user', content: buildCommanderUser(`(texted in) ${q.text}`, snapshot, history, '') },
        ], { provider: m.provider, model: m.model, maxTokens: 700 });
        await spendCredits(admin, owner, {
          costUsd: r.costUsd, kind: 'garvis', provider: m.provider, model: m.model,
          inputTokens: r.inputTokens, outputTokens: r.outputTokens,
        });

        const answer = smsAnswerFor(parseCommand(r.text));
        await say('garvis', answer);
        return twiml(answer);
      } catch {
        const fallback = 'I hit a snag reading that — try again in a minute, or open the app.';
        await say('garvis', fallback);
        return twiml(fallback);
      }
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
