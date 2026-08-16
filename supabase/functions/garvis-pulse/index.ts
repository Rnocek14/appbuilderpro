// supabase/functions/garvis-pulse/index.ts
// THE MORNING BRIEF — Garvis working while you sleep, honestly. Runs on the heartbeat (pg_cron,
// hourly; arm once with garvis_arm_heartbeat — app_0043). For each owner it checks whether it's
// their morning (7–9am in THEIR timezone, once per day) and, if anything actually happened,
// pushes a digest to their notification webhook: new leads, new replies, approvals waiting,
// reminders due. Every number is a count of real owner-scoped rows since the last brief.
//
// HONESTY RULES:
//  - A quiet night sends NOTHING (no "all good!" noise, no invented activity).
//  - This function never acts outward — it only tells the OWNER what's waiting. Anything that
//    sends/deploys/spends still goes through the approval queue.
//  - Each brief also lands as a mind_event (source 'pulse') so the waking moment shows the same
//    record that was pushed.
//
// Secrets: WORKER_SECRET (header x-worker-secret must match — same gate as garvis-worker).
// Deploy: supabase functions deploy garvis-pulse --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { stampHeartbeat } from '../_shared/heartbeat.ts';
import { notifyText } from '../_shared/notify.ts';
import { observe, pickToSay, type ProactiveFacts } from '../../../src/lib/garvis/proactive.ts';
import { safeFetch } from '../_shared/safeFetch.ts';
import { parseIcsEvents, calendarLine } from '../_shared/icsCore.ts';
// SW8.2 — the overnight read: one metered call connecting the brief's facts, additive and
// optional (pure core + acceptance gate verified by overnightRead.verify.ts).
import { READ_SYSTEM, READ_MIN_FACTS, buildReadUser, acceptOvernightRead } from '../../../src/lib/garvis/overnightRead.ts';
import { complete, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, getUserPlan } from '../_shared/credits.ts';
import { quarantineExternal } from '../_shared/untrustedText.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-worker-secret' };

const MORNING_START = 7;   // owner-local hour window for the brief
const MORNING_END = 9;

function localParts(now: Date, tz: string): { hour: number; date: string } {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return { hour: Number.isFinite(hour) ? hour : now.getUTCHours(), date };
  } catch {
    return { hour: now.getUTCHours(), date: now.toISOString().slice(0, 10) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('WORKER_SECRET');
  if (!secret || req.headers.get('x-worker-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await stampHeartbeat(admin, 'garvis-pulse'); // liveness: the hourly pulse is the clock's proof of life
  const now = new Date();

  // Owners who can receive a brief (webhook set). Paged conservatively.
  const { data: profiles, error } = await admin.from('profiles')
    .select('id, full_name, webhook_url, last_pulse_at, calendar_ics_url').not('webhook_url', 'is', null).limit(500);
  if (error) return json({ error: error.message }, 500);

  let sent = 0, checked = 0;
  for (const p of (profiles ?? []) as { id: string; full_name: string | null; webhook_url: string; last_pulse_at: string | null; calendar_ics_url?: string | null }[]) {
    checked++;
    try {
      // ── HOT-REPLY ESCALATION — every hourly tick, NOT just the morning ─────────────────────
      // A reply is the single most perishable object in the funnel: answer inside the hour and
      // it's a conversation, answer tomorrow and it's a stranger again. The morning brief counts
      // replies once a day, which is exactly the wrong cadence for the one thing where hours
      // decide the outcome. So: any human reply that CROSSED THE 4-HOUR MARK during the last
      // hour, with no send back on its campaign since, pings the owner NOW. The crossing window
      // is the dedupe — the pulse runs hourly, so each reply crosses [now-5h, now-4h] exactly
      // once and is never nagged twice. 'auto' replies (OOO, bounce bodies) never escalate.
      try {
        const { data: aging } = await admin.from('replies')
          .select('id, campaign_id, from_address, subject, received_at')
          .eq('owner_id', p.id).neq('classification', 'auto')
          .gte('received_at', new Date(now.getTime() - 5 * 3_600_000).toISOString())
          .lt('received_at', new Date(now.getTime() - 4 * 3_600_000).toISOString())
          .limit(5);
        const hot: string[] = [];
        for (const r of (aging ?? []) as { id: string; campaign_id: string | null; from_address: string | null; subject: string | null; received_at: string }[]) {
          if (r.campaign_id) {
            const { count: answered } = await admin.from('outreach_messages')
              .select('id', { count: 'exact', head: true })
              .eq('campaign_id', r.campaign_id).eq('status', 'sent').gte('sent_at', r.received_at);
            if ((answered ?? 0) > 0) continue;           // already answered — nothing to nag
          }
          hot.push(`${r.from_address ?? 'someone'}${r.subject ? ` — “${r.subject.slice(0, 60)}”` : ''}`);
        }
        if (hot.length > 0) {
          await notifyText(p.webhook_url,
            `🔥 ${hot.length === 1 ? 'A reply has' : `${hot.length} replies have`} sat unanswered for 4 hours:\n` +
            hot.map((h) => `  • ${h}`).join('\n') +
            `\nEvery hour it cools. Open the inbox: /garvis/inbox`);
        }
      } catch { /* escalation is best-effort; the brief below must never be lost to it */ }

      // Their timezone (outreach settings hold it; default matches the send-cap default).
      const { data: os } = await admin.from('outreach_settings').select('timezone').eq('owner_id', p.id).maybeSingle();
      const tz = (os as { timezone?: string } | null)?.timezone ?? 'America/Chicago';
      const { hour, date: today } = localParts(now, tz);
      if (hour < MORNING_START || hour >= MORNING_END) continue;                       // not their morning
      if (p.last_pulse_at && localParts(new Date(p.last_pulse_at), tz).date === today) continue; // already briefed today

      const since = p.last_pulse_at ?? new Date(now.getTime() - 24 * 3_600_000).toISOString();
      const [leads, touched, replies, approvals, reminders, stalledArcs, staleDemos, lastSend] = await Promise.all([
        admin.from('leads').select('id', { count: 'exact', head: true }).eq('owner_id', p.id).gte('created_at', since),
        admin.from('leads').select('id', { count: 'exact', head: true }).eq('owner_id', p.id).gte('first_touch_at', since),
        admin.from('replies').select('id', { count: 'exact', head: true }).eq('owner_id', p.id).gte('received_at', since),
        admin.from('approvals').select('id', { count: 'exact', head: true }).eq('owner_id', p.id).eq('status', 'pending'),
        admin.from('reminders').select('id', { count: 'exact', head: true }).eq('owner_id', p.id).eq('done', false).lte('due_at', now.toISOString()),
        // THE PROJECT LOOP'S NAG: arcs parked 'waiting' for over a day — each is one approval +
        // one Resume click away from continuing, and forgetting them is how arcs die.
        admin.from('orchestrator_plans').select('title, waiting_reason')
          .eq('owner_id', p.id).eq('status', 'waiting')
          .lt('last_activity_at', new Date(now.getTime() - 24 * 3_600_000).toISOString()).limit(3),
        // THE ACCOUNTABILITY PAIR — what the funnel is holding vs. how long since anything left.
        // The brief's "quiet night stays quiet" rule is about not inventing activity; a stalled
        // funnel is not invented, it is real rows sitting still, and the operator's consistency —
        // not the machine's — is the variable that decides whether any of this makes money.
        admin.from('preview_sites').select('id', { count: 'exact', head: true })
          .eq('user_id', p.id).eq('status', 'preview')
          .lt('created_at', new Date(now.getTime() - 48 * 3_600_000).toISOString()),
        admin.from('outreach_messages').select('sent_at')
          .eq('owner_id', p.id).eq('status', 'sent')
          .order('sent_at', { ascending: false }).limit(1),
      ]);
      const nLeads = leads.count ?? 0, nTouched = touched.count ?? 0, nReplies = replies.count ?? 0,
        nApprovals = approvals.count ?? 0, nReminders = reminders.count ?? 0;
      const arcs = (stalledArcs.data ?? []) as { title: string; waiting_reason: string | null }[];
      const nStaleDemos = staleDemos.count ?? 0;
      // Days since anything was actually sent. Only speaks when the funnel is HOLDING work (built
      // demos or pending approvals) — silence with nothing to send is rest; silence with a loaded
      // funnel is the leak.
      const lastSentAt = ((lastSend.data ?? []) as { sent_at: string | null }[])[0]?.sent_at ?? null;
      const sendGapDays = lastSentAt ? Math.floor((now.getTime() - Date.parse(lastSentAt)) / 86_400_000) : null;
      const funnelStalled = sendGapDays !== null && sendGapDays >= 3 && (nStaleDemos > 0 || nApprovals > 0);

      // THE CALENDAR SENSE (app_0098): today's real events, read from the operator's own ICS
      // feed. Fail-soft — a broken feed contributes nothing, never a guess or an error line.
      let calendar: { line: string }[] = [];
      if (p.calendar_ics_url && /^https:\/\//.test(p.calendar_ics_url)) {
        try {
          const res = await safeFetch(p.calendar_ics_url, { signal: AbortSignal.timeout(10_000) });
          if (res.ok) {
            const events = parseIcsEvents(await res.text(), now.toISOString(), new Date(now.getTime() + 24 * 3_600_000).toISOString(), 6);
            calendar = events.map((e) => ({ line: calendarLine(e, tz) }));
          }
        } catch { /* the sense degrades to silence, never noise */ }
      }

      // Always stamp the brief-check so tomorrow's window works; only SPEAK when something's real.
      await admin.from('profiles').update({ last_pulse_at: now.toISOString() }).eq('id', p.id);
      if (nLeads + nReplies + nApprovals + nReminders + arcs.length + calendar.length + nStaleDemos + (funnelStalled ? 1 : 0) === 0) continue;   // quiet night stays quiet

      const lines = [
        `Morning brief${p.full_name ? `, ${p.full_name.split(' ')[0]}` : ''} — while you were away:`,
        nLeads > 0 && `• ${nLeads} new lead${nLeads === 1 ? '' : 's'} from your sites — answer while it's warm`,
        nTouched > 0 && `⚡ ${nTouched} of them answered INSTANTLY with your first-touch template (thread is warm)`,
        nReplies > 0 && `• ${nReplies} new repl${nReplies === 1 ? 'y' : 'ies'} to your outreach`,
        nApprovals > 0 && `• ${nApprovals} action${nApprovals === 1 ? '' : 's'} waiting on your approval`,
        nReminders > 0 && `• ${nReminders} reminder${nReminders === 1 ? '' : 's'} due`,
        ...arcs.map((a) => `⏸ Arc "${a.title}" has been waiting a day+: ${a.waiting_reason ?? 'a prerequisite'} — one approval + Resume continues it`),
        nStaleDemos > 0 && `▲ ${nStaleDemos} finished demo${nStaleDemos === 1 ? ' has' : 's have'} sat unsent for 2+ days — a demo only earns in an inbox`,
        funnelStalled && `▲ Nothing has gone out in ${sendGapDays} days while work sits ready. The funnel compounds only when something leaves daily.`,
        ...calendar.map((c) => c.line),
        `Open Garvis → Command to act on all of it.`,
      ].filter(Boolean) as string[];

      // THE OVERNIGHT READ (SW8.2): one metered call connecting the facts above — additive and
      // optional by construction. The quiet-night gate already passed (real activity exists);
      // the deterministic lines are the spine either way. Failure of ANY kind (no credits, model
      // down, rejected read) degrades to the brief as-is — never a blocked morning.
      let readLine: string | null = null;
      const factLines = lines.slice(1, -1);            // the real facts, minus header/footer
      if (factLines.length >= READ_MIN_FACTS) {
        try {
          await checkCredits(admin, p.id, 'garvis');
          const [{ data: blf }, { data: wi }] = await Promise.all([
            admin.from('mind_beliefs').select('statement').eq('owner_id', p.id).eq('status', 'active').limit(5),
            admin.from('world_intelligence').select('open_questions').eq('owner_id', p.id).limit(3),
          ]);
          const beliefs = ((blf ?? []) as { statement: string }[]).map((b) => b.statement.slice(0, 160));
          const openQs = ((wi ?? []) as { open_questions?: string[] | null }[])
            .flatMap((w) => w.open_questions ?? []).slice(0, 5).map((q) => String(q).slice(0, 160));
          const m = modelForPlan(await getUserPlan(admin, p.id));
          // Fact lines can carry EXTERNAL text (reply subjects, arc reasons) — quarantined.
          const res = await complete([
            { role: 'system', content: READ_SYSTEM },
            { role: 'user', content: quarantineExternal(buildReadUser(factLines, beliefs, openQs), 6_000).text },
          ], { provider: m.provider, model: m.model, maxTokens: 300 });
          await spendCredits(admin, p.id, { costUsd: res.costUsd, kind: 'garvis', provider: m.provider, model: m.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
          const verdict = acceptOvernightRead(res.text, factLines);
          if (verdict.ok) {
            readLine = verdict.read;
            await admin.from('mind_events').insert({
              owner_id: p.id, event_type: 'note', source: 'overnight-read',
              subject: readLine.slice(0, 300),
              payload: { key: `overnight-read:${today}`, date: today },
            }).then(() => {}, () => {});
          }
        } catch { /* out of credits / model down → the deterministic brief stands alone */ }
      }
      if (readLine) lines.splice(1, 0, `» ${readLine}`);

      await notifyText(p.webhook_url, lines.join('\n'));
      await admin.from('mind_events').insert({
        owner_id: p.id, event_type: 'note', source: 'pulse',
        subject: `Morning brief sent — ${nLeads} leads (${nTouched} answered instantly), ${nReplies} replies, ${nApprovals} approvals waiting, ${nReminders} reminders due`,
        payload: { leads: nLeads, first_touch: nTouched, replies: nReplies, approvals: nApprovals, reminders: nReminders, since },
      }).then(() => {}, () => {});
      sent++;
    } catch { /* one owner's failure never blocks the rest */ }
  }

  // ---- GARVIS TEXTS FIRST (SW5.2) --------------------------------------------------------
  // The proactive rules are the dock's, verbatim (proactive.ts: real rows only, ranked, once
  // ever) — with the SERVER ledger (app_0145, channel 'sms') as the once-ever cursor and a
  // claim-by-insert so a line can never send twice. One text per waking hour at most: a text
  // is dearer than a dock line. Only VERIFIED numbers with proactive_enabled, only waking
  // hours in the owner's own timezone, and STOP compliance rides Twilio + the Line's own
  // opt-out (unbind). Nothing here acts outward — a text SAYS; the app still does.
  let texted = 0;
  try {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const token = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNum = Deno.env.get('TWILIO_FROM_NUMBER');
    if (sid && token && fromNum) {
      const { data: linesData } = await admin.from('garvis_line')
        .select('owner_id, phone_e164').eq('proactive_enabled', true).not('verified_at', 'is', null).limit(500);
      for (const line of (linesData ?? []) as { owner_id: string; phone_e164: string }[]) {
        try {
          const owner = line.owner_id;
          const { data: os2 } = await admin.from('outreach_settings').select('timezone').eq('owner_id', owner).maybeSingle();
          const tz2 = (os2 as { timezone?: string } | null)?.timezone ?? 'America/Chicago';
          const { hour: localHour } = localParts(now, tz2);
          if (localHour < 8 || localHour >= 21) continue;                    // waking hours only

          const probe = async <T,>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> => {
            try { const { data, error } = await run(); return error ? null : ((data ?? []) as T); } catch { return null; }
          };
          const facts: ProactiveFacts = {
            now: now.toISOString(),
            approvals: await probe(() => admin.from('approvals').select('id, title, created_at').eq('owner_id', owner).eq('status', 'pending').order('created_at', { ascending: true }).limit(20)),
            waiting: await probe<{ id: string; title: string; reason: string | null }[]>(() => admin.from('orchestrator_plans').select('id, title, waiting_reason').eq('owner_id', owner).eq('status', 'waiting').order('last_activity_at', { ascending: false }).limit(10))
              .then((rows) => rows ? (rows as unknown as { id: string; title: string; waiting_reason: string | null }[]).map((r) => ({ id: r.id, title: r.title, reason: r.waiting_reason })) : null),
            finished: await probe<{ id: string; title: string; last_activity_at: string }[]>(() => admin.from('orchestrator_plans').select('id, title, last_activity_at').eq('owner_id', owner).eq('status', 'done').order('last_activity_at', { ascending: false }).limit(10))
              .then((rows) => rows ? rows.map((r) => ({ id: r.id, title: r.title, at: r.last_activity_at })) : null),
            watches: await probe<{ id: string; label: string; last_result: { status?: string; line?: string; excerpt?: string | null } | null; last_run_at: string | null }[]>(() => admin.from('standing_orders').select('id, label, last_result, last_run_at').eq('owner_id', owner).eq('status', 'active').limit(20))
              .then((rows) => rows ? rows.map((r) => ({ id: r.id, label: r.label, status: String(r.last_result?.status ?? ''), line: String(r.last_result?.line ?? ''), excerpt: r.last_result?.excerpt ?? null, at: r.last_run_at })) : null),
            opportunities: await probe(() => admin.from('opportunities').select('id, title, found_at').eq('owner_id', owner).eq('status', 'new').order('found_at', { ascending: false }).limit(10)),
          };

          const { data: spokenRows } = await admin.from('proactive_spoken')
            .select('key').eq('owner_id', owner).eq('channel', 'sms')
            .order('said_at', { ascending: false }).limit(400);
          const spoken = ((spokenRows ?? []) as { key: string }[]).map((r) => r.key);
          const [say] = pickToSay(observe(facts), spoken, 1);
          if (!say) continue;                                               // silence is a valid report

          const { data: claimed } = await admin.from('proactive_spoken')
            .upsert({ owner_id: owner, key: say.key, channel: 'sms' },
              { onConflict: 'owner_id,key,channel', ignoreDuplicates: true }).select('id');
          if (!(claimed ?? []).length) continue;                            // another tick beat us to it

          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: line.phone_e164, From: fromNum, Body: say.text.slice(0, 1000) }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) continue;                                            // ledger row stands; no retry storm
          await admin.from('command_messages').insert({ owner_id: owner, role: 'garvis', text: say.text, channel: 'sms' }).then(() => {}, () => {});
          texted++;
        } catch { /* one owner's failure never blocks the rest */ }
      }
    }
  } catch { /* proactive texting must never fail the brief */ }

  return json({ ok: true, checked, sent, texted });
});
