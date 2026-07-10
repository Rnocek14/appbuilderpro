// supabase/functions/send-email/index.ts
// THE ONE SEND PATH (docs/garvis-system-architecture.md §7). Nothing else in Garvis sends email.
// Ported + generalized from swift-prep-pros' outreach.functions.ts. It takes an APPROVED approval row
// (kind='send_email') whose payload references an outreach_message, re-checks every safety gate at
// send time, sends via Resend, and writes the execution_runs ledger + a mind_event. Sending outside
// an approval is impossible: the approval must exist, be owned by the caller, be kind=send_email, and
// be status=approved.
//
// Safety gates (all from the original, now owner-scoped): kill switch (outreach_settings.outbound_enabled),
// CAN-SPAM physical address + List-Unsubscribe, valid recipient, suppression list (email+domain),
// contact email_status, campaign state, daily cap (+ optional warmup ramp).
//
// Deploy: npx supabase functions deploy send-email
// Secrets: RESEND_API_KEY. (Sends direct to api.resend.com — no Lovable gateway dependency.)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function paragraphsToHtml(text: string): string {
  return text.split(/\n\n+/).map((p) => `<p>${p.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`).join('\n');
}
function addBusinessDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { approval_id } = (await req.json().catch(() => ({}))) as { approval_id?: string };
    if (!approval_id) return json({ error: 'approval_id is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // The approval is the authority to send. Verify it: owned by caller, correct kind, approved.
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, result').eq('id', approval_id).single();
    if (!approval || approval.owner_id !== user.id) return json({ error: 'Approval not found' }, 404);
    if (approval.kind !== 'send_email') return json({ error: 'Approval is not a send_email.' }, 400);
    if (approval.status !== 'approved') return json({ error: `Approval is ${approval.status}, not approved.` }, 409);

    const messageId = (approval.payload as { message_id?: string })?.message_id;
    if (!messageId) return json({ error: 'Approval payload is missing message_id.' }, 400);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured (RESEND_API_KEY missing).' }, 400);

    const { data: msg } = await admin.from('outreach_messages')
      .select('id, owner_id, campaign_id, contact_id, preview_site_id, subject, body_text, to_address, status, sent_at')
      .eq('id', messageId).single();
    if (!msg || msg.owner_id !== user.id) return json({ error: 'Message not found' }, 404);
    if (msg.sent_at || msg.status === 'sent') return json({ error: 'Message already sent.' }, 409);

    const priorResult = (approval.result as Record<string, unknown> | null) ?? {};

    // Atomic claim (double-send guard): stamp send_claimed_at on the approval ONLY where it is
    // still unclaimed — the WHERE is evaluated atomically per row, so two concurrent calls with
    // the same approval cannot both pass; the loser matches zero rows and stops here. block()
    // and the failure path release the claim so a legitimate retry stays possible.
    const { data: claimRows, error: claimErr } = await admin.from('approvals')
      .update({ result: { ...priorResult, send_claimed_at: new Date().toISOString() } })
      .eq('id', approval_id).eq('status', 'approved').is('result->>send_claimed_at', null)
      .select('id');
    if (claimErr || !claimRows?.length) return json({ error: 'This send is already in flight (or was already claimed).' }, 409);
    const releaseClaim = (extra: Record<string, unknown> = {}) =>
      admin.from('approvals').update({ result: { ...priorResult, ...extra, send_claimed_at: null } }).eq('id', approval_id);

    const ledger = (row: Record<string, unknown>) =>
      admin.from('execution_runs').insert({ owner_id: user.id, approval_id, connector: 'resend', action: 'send_email', ...row });
    const block = async (reason: string): Promise<Response> => {
      await admin.from('outreach_messages').update({ status: 'blocked' }).eq('id', messageId);
      await ledger({ status: 'skipped', request: { message_id: messageId }, error: reason });
      // Record integrity: the human's decision STAYS on the record — the approval remains
      // 'approved'; the gate outcome lives in result.blocked (+ the ledger row above).
      // Overwriting status to 'rejected' would erase who decided what.
      await releaseClaim({ blocked: reason, blocked_at: new Date().toISOString() });
      return json({ ok: false, error: reason }, 422);
    };

    // ----- safety gates (owner-scoped) -----
    const { data: settings } = await admin.from('outreach_settings')
      .select('from_name, from_email, reply_to, company_name, physical_address, unsubscribe_url_template, daily_send_cap, warmup_start_date, warmup_daily_step, outbound_enabled, timezone')
      .eq('owner_id', user.id).maybeSingle();
    if (!settings) return block('Outreach settings not configured (Settings → Outreach).');
    if (!settings.outbound_enabled) return block('Outbound is DISABLED (kill switch is off).');
    if (!settings.from_email) return block('Set a from_email in Outreach settings before sending.');
    if (!settings.physical_address?.trim()) return block('Missing CAN-SPAM physical address in Outreach settings.');
    if ((settings.daily_send_cap ?? 0) <= 0) return block('Daily send cap must be greater than zero.');

    const to = (msg.to_address ?? '').trim().toLowerCase();
    if (!to) return block('Recipient email is missing.');
    if (!EMAIL_RE.test(to)) return block('Recipient email is invalid.');

    // contact-level evidence
    if (msg.contact_id) {
      const { data: contact } = await admin.from('contacts').select('email_status').eq('id', msg.contact_id).maybeSingle();
      const st = contact?.email_status;
      if (st === 'unsubscribed') return block('Contact previously unsubscribed.');
      if (st === 'bounced') return block('Contact email previously bounced.');
      if (st === 'invalid' || st === 'complained') return block(`Contact email marked ${st}.`);
    }

    // suppression (email + domain), owner-scoped. Two exact-match queries — no string-built
    // .or() filter, so a crafted address can't corrupt it and a double match can't error out.
    // Any lookup error BLOCKS the send: the suppression list fails closed, never open.
    const domain = to.split('@')[1] ?? '';
    const [suppEmail, suppDomain] = await Promise.all([
      admin.from('suppression').select('reason').eq('owner_id', user.id).eq('email', to).limit(1),
      admin.from('suppression').select('reason').eq('owner_id', user.id).eq('domain', domain).is('email', null).limit(1), // explicit domain blocks ONLY — a per-address row must never silence a whole domain
    ]);
    if (suppEmail.error || suppDomain.error) return block('Suppression list could not be checked — refusing to send.');
    const supp = suppEmail.data?.[0] ?? suppDomain.data?.[0];
    if (supp) return block(`Recipient is on your suppression list (${supp.reason}).`);

    // campaign state
    if (msg.campaign_id) {
      const { data: camp } = await admin.from('outreach_campaigns').select('state').eq('id', msg.campaign_id).maybeSingle();
      if (camp && ['replied', 'unsubscribed', 'bounced', 'stopped', 'won', 'lost'].includes(camp.state as string)) {
        return block(`Campaign is "${camp.state}" — cannot send.`);
      }
    }

    // daily cap (+ optional warmup ramp), measured against the operator's timezone midnight.
    const tz = settings.timezone || 'America/Chicago';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date()).reduce<Record<string, string>>((a, p) => { if (p.type !== 'literal') a[p.type] = p.value; return a; }, {});
    const y = Number(parts.year), mo = Number(parts.month) - 1, dd = Number(parts.day);
    const wallAsUtc = Date.UTC(y, mo, dd, Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second));
    const offsetMs = wallAsUtc - Date.now();
    const since = new Date(Date.UTC(y, mo, dd, 0, 0, 0) - offsetMs);

    let cap = settings.daily_send_cap ?? 25;
    if (settings.warmup_start_date) {
      const daysIn = Math.floor((Date.now() - new Date(settings.warmup_start_date as string).getTime()) / 86_400_000);
      if (daysIn >= 0) cap = Math.min(cap, Math.max(1, (daysIn + 1) * (settings.warmup_daily_step ?? 5)));
    }
    const { count } = await admin.from('outreach_messages')
      .select('id', { count: 'exact', head: true }).eq('owner_id', user.id).gte('sent_at', since.toISOString());
    if ((count ?? 0) >= cap) return block(`Daily send cap (${cap}) reached.`);

    // ----- compose + send -----
    const unsub = settings.unsubscribe_url_template?.trim()
      || `mailto:${settings.from_email}?subject=unsubscribe&body=Please%20remove%20${encodeURIComponent(to)}`;
    // CAN-SPAM requires a clear, conspicuous opt-out IN THE BODY — headers alone aren't enough.
    const optOut = settings.unsubscribe_url_template?.trim()
      ? `To stop receiving these emails, visit ${settings.unsubscribe_url_template.trim()} or reply "unsubscribe".`
      : 'To stop receiving these emails, reply "unsubscribe".';
    const footer = `\n\n--\n${settings.company_name ?? ''}\n${settings.physical_address}\n${optOut}`;
    const finalText = (msg.body_text ?? '') + footer;
    const bodyHtml = paragraphsToHtml(msg.body_text ?? '') + paragraphsToHtml(footer);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: `${settings.from_name ?? settings.company_name ?? 'Garvis'} <${settings.from_email}>`,
        to: [to],
        reply_to: settings.reply_to || settings.from_email,
        subject: (msg.subject ?? '').trim(),
        text: finalText,
        html: bodyHtml,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: [{ name: 'campaign_id', value: msg.campaign_id ?? 'none' }],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      await admin.from('outreach_messages').update({ status: 'failed' }).eq('id', messageId);
      await ledger({ status: 'failed', request: { to, subject: msg.subject }, response: { status: res.status, body: txt.slice(0, 500) }, error: `resend ${res.status}` });
      await releaseClaim({ failed: `resend ${res.status}` }); // a retry after a provider error stays possible
      return json({ ok: false, error: `Resend error ${res.status}: ${txt.slice(0, 300)}` }, 502);
    }
    const out = await res.json().catch(() => ({}));
    const resendId = (out as { id?: string; data?: { id?: string } })?.id ?? (out as { data?: { id?: string } })?.data?.id ?? null;
    const sentAt = new Date().toISOString();

    await admin.from('outreach_messages').update({
      status: 'sent', sent_at: sentAt, provider_message_id: resendId, from_address: settings.from_email,
    }).eq('id', messageId);

    if (msg.campaign_id) {
      await admin.from('outreach_campaigns').update({
        state: 'sent', last_send_at: sentAt, next_followup_at: addBusinessDaysIso(sentAt, 3),
      }).eq('id', msg.campaign_id);
    }

    await ledger({ status: 'ok', request: { to, subject: msg.subject }, response: { resend_id: resendId } });
    // status is already 'approved' (checked at entry) — only the outcome lands in result.
    await admin.from('approvals').update({ result: { ...priorResult, send_claimed_at: sentAt, resend_id: resendId, sent_at: sentAt } }).eq('id', approval_id);
    await admin.from('mind_events').insert({
      owner_id: user.id, source: 'execution', event_type: 'email_sent',
      subject: `Sent "${(msg.subject ?? '').slice(0, 120)}" to ${to}`,
      payload: { message_id: messageId, resend_id: resendId, campaign_id: msg.campaign_id },
    }).then(() => {}, () => {});

    return json({ ok: true, resend_id: resendId, sent_at: sentAt });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
