// supabase/functions/outreach-reactivate/index.ts
// THE REACTIVATION SWEEP — dormant contacts are the highest-ROI asset a solo operator forgets
// (reactivated contacts convert ~10–25% vs ~3–8% cold, at near-zero acquisition cost). Runs
// monthly on the heartbeat: finds contacts who were once in a REAL conversation (≥1 sent
// message) that went quiet 60–365 days ago, and stages a short, human check-in as a DRAFT +
// PENDING approval. Nothing sends — the drafts wait in the morning queue like everything else.
//
// HONESTY + SAFETY:
//   - Drafts are deterministic templates referencing the real prior thread — no AI invention,
//     no fake "just following up on our call" theater.
//   - Only contacts with email_status unknown/valid; the suppression table is checked per
//     contact and FAIL-CLOSED (a lookup error skips the contact, never includes it).
//   - Skips anyone with an open thread, a pending draft, or a reply on record in the window.
//   - Hard cap per owner per sweep (10) — reactivation is a trickle, not a blast; the daily
//     send cap still governs anything the owner approves.
//
// Secrets: CRON_SECRET (header x-cron-secret — same gate as outreach-followups).
// Deploy: supabase functions deploy outreach-reactivate --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cronAuthorized } from '../_shared/cronGate.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';
import { hashPayload } from '../_shared/payloadHash.ts';
import { autonomyAllowed, executeSendNow } from '../_shared/autonomyGate.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-secret, x-worker-secret' };

const MAX_PER_OWNER = 10;
const DORMANT_MIN_DAYS = 60;
const DORMANT_MAX_DAYS = 365;

const firstName = (full: string | null | undefined): string =>
  (full ?? '').trim().split(/\s+/)[0] || 'there';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!cronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await stampHeartbeat(admin, 'garvis-reactivate-monthly');
  const now = Date.now();
  const dormantAfter = new Date(now - DORMANT_MAX_DAYS * 24 * 3_600_000).toISOString();
  const dormantBefore = new Date(now - DORMANT_MIN_DAYS * 24 * 3_600_000).toISOString();

  // Owners with outbound properly configured — a sweep for someone who can't send is noise.
  const { data: owners, error } = await admin.from('outreach_settings')
    .select('owner_id, company_name, from_name')
    .eq('outbound_enabled', true).not('from_email', 'is', null).limit(500);
  if (error) return json({ error: error.message }, 500);

  let ownersSwept = 0, drafted = 0;
  for (const o of (owners ?? []) as { owner_id: string; company_name: string | null; from_name: string | null }[]) {
    try {
      const uid = o.owner_id;

      // The once-real conversations: last SENT message per contact, inside the dormant window.
      const { data: sentRows } = await admin.from('outreach_messages')
        .select('contact_id, to_address, subject, sent_at')
        .eq('owner_id', uid).eq('status', 'sent').not('contact_id', 'is', null)
        .order('sent_at', { ascending: false }).limit(1000);
      const lastByContact = new Map<string, { to: string; subject: string | null; sentAt: string }>();
      for (const m of (sentRows ?? []) as { contact_id: string; to_address: string | null; subject: string | null; sent_at: string }[]) {
        if (!lastByContact.has(m.contact_id)) {
          lastByContact.set(m.contact_id, { to: (m.to_address ?? '').toLowerCase(), subject: m.subject, sentAt: m.sent_at });
        }
      }
      const dormantIds = [...lastByContact.entries()]
        .filter(([, v]) => v.sentAt >= dormantAfter && v.sentAt <= dormantBefore)
        .map(([id]) => id);
      if (!dormantIds.length) continue;
      ownersSwept++;

      // Exclusions in bulk: contacts who replied since the window opened, and open drafts.
      // Replies carry only campaign_id — resolve to contacts through their campaigns (scan B18:
      // the replied set used to be fetched and discarded, so a replied-then-quiet contact could
      // be re-drafted).
      const [{ data: replied }, { data: openDrafts }] = await Promise.all([
        admin.from('replies').select('campaign_id').eq('owner_id', uid).gte('received_at', dormantAfter).limit(1000),
        admin.from('outreach_messages').select('contact_id').eq('owner_id', uid).in('status', ['draft', 'scheduled']).limit(1000),
      ]);
      const repliedCampaigns = [...new Set(((replied ?? []) as { campaign_id: string | null }[]).map((r) => r.campaign_id).filter(Boolean))] as string[];
      const repliedContacts = new Set<string>();
      if (repliedCampaigns.length) {
        const { data: camps } = await admin.from('outreach_campaigns')
          .select('contact_id').eq('owner_id', uid).in('id', repliedCampaigns).limit(1000);
        for (const c of (camps ?? []) as { contact_id: string | null }[]) if (c.contact_id) repliedContacts.add(c.contact_id);
      }
      const hasDraft = new Set(((openDrafts ?? []) as { contact_id: string | null }[]).map((d) => d.contact_id).filter(Boolean));

      let made = 0;
      for (const contactId of dormantIds) {
        if (made >= MAX_PER_OWNER) break;
        if (hasDraft.has(contactId) || repliedContacts.has(contactId)) continue;
        const last = lastByContact.get(contactId)!;

        // Contact must still be contactable — and the suppression check FAILS CLOSED.
        const { data: contact } = await admin.from('contacts')
          .select('id, full_name, email, email_status').eq('id', contactId).eq('owner_id', uid).maybeSingle();
        const email = ((contact as { email?: string } | null)?.email ?? last.to).toLowerCase();
        const status = (contact as { email_status?: string } | null)?.email_status ?? 'unknown';
        if (!contact || !email || !['unknown', 'valid'].includes(status)) continue;
        const { data: sup, error: supErr } = await admin.from('suppression')
          .select('reason').eq('owner_id', uid).eq('email', email).limit(1);
        if (supErr || (sup ?? []).length > 0) continue;   // fail closed: error = skip, never include

        // The draft — deterministic, referencing the REAL prior thread.
        const fn = firstName((contact as { full_name?: string | null }).full_name);
        const biz = (o.company_name ?? '').trim() || (o.from_name ?? '').trim() || 'my shop';
        const about = (last.subject ?? '').trim();
        const subject = about ? `Picking back up: ${about.slice(0, 120)}` : 'Picking our conversation back up';
        const monthsAgo = Math.max(2, Math.round((now - new Date(last.sentAt).getTime()) / (30 * 24 * 3_600_000)));
        const body =
          `Hi ${fn},\n\nIt's been about ${monthsAgo} months since we last spoke${about ? ` about "${about}"` : ''}, and you crossed my mind.\n\n` +
          `A lot can change in that time — if it's still on your radar, I'd genuinely like to hear where things stand. And if the timing's wrong or it's a no, just say so and I'll close the loop on my end.\n\n` +
          `Either way, thanks for the earlier conversation.\n\n— ${(o.from_name ?? biz).trim()}`;

        const { data: camp } = await admin.from('outreach_campaigns').insert({
          owner_id: uid, contact_id: contactId, kind: 're_nurture', state: 'pending_approval',
        }).select('id').single();
        if (!camp) continue;
        const { data: msg } = await admin.from('outreach_messages').insert({
          owner_id: uid, campaign_id: camp.id, contact_id: contactId,
          sequence_step: 0, subject, body_text: body, to_address: email, status: 'draft',
        }).select('id').single();
        if (!msg) continue;
        // Earned autonomy (app_0097): a granted 'reactivation' class self-approves under its
        // daily cap and executes through the one send path. Otherwise: pending, as ever.
        const auto = await autonomyAllowed(admin, uid, 'reactivation');
        const apPayload: Record<string, unknown> = { message_id: msg.id, sweep: 'reactivation' };
        if (auto) apPayload.autonomy_class = 'reactivation';
        const { data: apRow } = await admin.from('approvals').insert({
          owner_id: uid, kind: 'send_email',
          ...(auto
            ? { requested_by: 'garvis-auto', status: 'approved', decided_via: 'autonomy_grant', decided_at: new Date().toISOString() }
            : { status: 'pending', requested_by: 'garvis' }),
          title: `Reactivation draft → ${email}`,
          preview: `${subject}\n\n${body.slice(0, 400)}`,
          payload: apPayload, payload_hash: await hashPayload(apPayload),
        }).select('id').maybeSingle();
        if (auto && apRow) await executeSendNow((apRow as { id: string }).id);
        made++; drafted++;
      }

      if (made > 0) {
        await admin.from('mind_events').insert({
          owner_id: uid, event_type: 'note', source: 'reactivate',
          subject: `Staged ${made} reactivation draft${made === 1 ? '' : 's'} — dormant threads worth one honest check-in (waiting in Approvals)`,
          payload: { drafted: made, window_days: [DORMANT_MIN_DAYS, DORMANT_MAX_DAYS] },
        }).then(() => {}, () => {});
      }
    } catch { /* one owner's failure never blocks the rest */ }
  }

  return json({ ok: true, owners: ownersSwept, drafted });
});
