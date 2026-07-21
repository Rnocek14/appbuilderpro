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
import { safeFetch } from '../_shared/safeFetch.ts';
import { parseIcsEvents, calendarLine } from '../_shared/icsCore.ts';

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
      // Their timezone (outreach settings hold it; default matches the send-cap default).
      const { data: os } = await admin.from('outreach_settings').select('timezone').eq('owner_id', p.id).maybeSingle();
      const tz = (os as { timezone?: string } | null)?.timezone ?? 'America/Chicago';
      const { hour, date: today } = localParts(now, tz);
      if (hour < MORNING_START || hour >= MORNING_END) continue;                       // not their morning
      if (p.last_pulse_at && localParts(new Date(p.last_pulse_at), tz).date === today) continue; // already briefed today

      const since = p.last_pulse_at ?? new Date(now.getTime() - 24 * 3_600_000).toISOString();
      const [leads, touched, replies, approvals, reminders, stalledArcs] = await Promise.all([
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
      ]);
      const nLeads = leads.count ?? 0, nTouched = touched.count ?? 0, nReplies = replies.count ?? 0,
        nApprovals = approvals.count ?? 0, nReminders = reminders.count ?? 0;
      const arcs = (stalledArcs.data ?? []) as { title: string; waiting_reason: string | null }[];

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
      if (nLeads + nReplies + nApprovals + nReminders + arcs.length + calendar.length === 0) continue;   // quiet night stays quiet

      const lines = [
        `Morning brief${p.full_name ? `, ${p.full_name.split(' ')[0]}` : ''} — while you were away:`,
        nLeads > 0 && `• ${nLeads} new lead${nLeads === 1 ? '' : 's'} from your sites — answer while it's warm`,
        nTouched > 0 && `⚡ ${nTouched} of them answered INSTANTLY with your first-touch template (thread is warm)`,
        nReplies > 0 && `• ${nReplies} new repl${nReplies === 1 ? 'y' : 'ies'} to your outreach`,
        nApprovals > 0 && `• ${nApprovals} action${nApprovals === 1 ? '' : 's'} waiting on your approval`,
        nReminders > 0 && `• ${nReminders} reminder${nReminders === 1 ? '' : 's'} due`,
        ...arcs.map((a) => `⏸ Arc "${a.title}" has been waiting a day+: ${a.waiting_reason ?? 'a prerequisite'} — one approval + Resume continues it`),
        ...calendar.map((c) => c.line),
        `Open Garvis → Command to act on all of it.`,
      ].filter(Boolean) as string[];

      await notifyText(p.webhook_url, lines.join('\n'));
      await admin.from('mind_events').insert({
        owner_id: p.id, event_type: 'note', source: 'pulse',
        subject: `Morning brief sent — ${nLeads} leads (${nTouched} answered instantly), ${nReplies} replies, ${nApprovals} approvals waiting, ${nReminders} reminders due`,
        payload: { leads: nLeads, first_touch: nTouched, replies: nReplies, approvals: nApprovals, reminders: nReminders, since },
      }).then(() => {}, () => {});
      sent++;
    } catch { /* one owner's failure never blocks the rest */ }
  }

  return json({ ok: true, checked, sent });
});
