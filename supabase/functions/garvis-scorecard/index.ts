// supabase/functions/garvis-scorecard/index.ts
// THE SUNDAY SCORECARD — the EOS-style weekly review, assembled by the heartbeat instead of a
// tired founder: this week vs last week on the handful of LEADING indicators that actually
// steer a small business, pushed Sunday evening so Monday starts with judgment, not archaeology.
//
// HONESTY RULES (same as the morning brief):
//   - Every number is a count/sum of the owner's real rows over two fixed 7-day windows.
//   - A signal with nothing in EITHER week isn't shown (no wall of zeros); a week with nothing
//     anywhere sends nothing at all.
//   - Deltas are arrows on real arithmetic, never judgment words ("up 40%!!") the data didn't earn.
//   - Goals show measured progress only (the same goalProgress discipline — no meter without a
//     real numerator and denominator).
//
// Secrets: WORKER_SECRET (x-worker-secret). Scheduled weekly (Sunday 22:00 UTC) by the heartbeat.
// Deploy: supabase functions deploy garvis-scorecard --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { notifyText } from '../_shared/notify.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-worker-secret' };

const arrow = (now: number, prev: number) => (now > prev ? '↑' : now < prev ? '↓' : '→');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('WORKER_SECRET');
  if (!secret || req.headers.get('x-worker-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date();
  const wk = 7 * 24 * 3_600_000;
  const thisStart = new Date(now.getTime() - wk).toISOString();
  const prevStart = new Date(now.getTime() - 2 * wk).toISOString();
  const thisDate = thisStart.slice(0, 10);
  const prevDate = prevStart.slice(0, 10);

  const { data: profiles, error } = await admin.from('profiles')
    .select('id, full_name, webhook_url').not('webhook_url', 'is', null).limit(500);
  if (error) return json({ error: error.message }, 500);

  let sent = 0, checked = 0;
  for (const p of (profiles ?? []) as { id: string; full_name: string | null; webhook_url: string }[]) {
    checked++;
    try {
      const cnt = (table: string, col: string, from: string, to: string, extra?: (q: unknown) => unknown) => {
        // deno-lint-ignore no-explicit-any
        let q: any = admin.from(table).select('id', { count: 'exact', head: true })
          .eq('owner_id', p.id).gte(col, from).lt(col, to);
        if (extra) q = extra(q);
        return q.then((r: { count: number | null }) => r.count ?? 0);
      };
      const nowIso = now.toISOString();
      const [
        leadsNow, leadsPrev, visitsNow, visitsPrev, repliesNow, repliesPrev,
        sentNow, sentPrev, contactsNow, contactsPrev, touchesNow, touchesPrev, pendingApprovals,
      ] = await Promise.all([
        cnt('leads', 'created_at', thisStart, nowIso), cnt('leads', 'created_at', prevStart, thisStart),
        // deno-lint-ignore no-explicit-any
        cnt('site_events', 'created_at', thisStart, nowIso, (q: any) => q.eq('kind', 'visit')), cnt('site_events', 'created_at', prevStart, thisStart, (q: any) => q.eq('kind', 'visit')),
        cnt('replies', 'received_at', thisStart, nowIso), cnt('replies', 'received_at', prevStart, thisStart),
        // deno-lint-ignore no-explicit-any
        cnt('outreach_messages', 'sent_at', thisStart, nowIso, (q: any) => q.eq('status', 'sent')), cnt('outreach_messages', 'sent_at', prevStart, thisStart, (q: any) => q.eq('status', 'sent')),
        cnt('contacts', 'created_at', thisStart, nowIso), cnt('contacts', 'created_at', prevStart, thisStart),
        cnt('leads', 'first_touch_at', thisStart, nowIso), cnt('leads', 'first_touch_at', prevStart, thisStart),
        // deno-lint-ignore no-explicit-any
        (admin.from('approvals').select('id', { count: 'exact', head: true }).eq('owner_id', p.id).eq('status', 'pending') as any).then((r: { count: number | null }) => r.count ?? 0),
      ]);

      // Ad spend: summed from synced daily rows (real platform numbers, when connected).
      const { data: adRows } = await admin.from('ad_metrics')
        .select('date, spend_usd').eq('owner_id', p.id).gte('date', prevDate).limit(3000);
      let adNow = 0, adPrev = 0;
      for (const r of (adRows ?? []) as { date: string; spend_usd: number }[]) {
        if (r.date >= thisDate) adNow += Number(r.spend_usd) || 0;
        else if (r.date >= prevDate) adPrev += Number(r.spend_usd) || 0;
      }

      const total = leadsNow + leadsPrev + visitsNow + visitsPrev + repliesNow + repliesPrev
        + sentNow + sentPrev + contactsNow + contactsPrev + adNow + adPrev + pendingApprovals;
      if (total === 0) continue; // an empty fortnight sends nothing

      const line = (label: string, nowV: number, prevV: number, fmt: (n: number) => string = String) =>
        nowV + prevV > 0 ? `${arrow(nowV, prevV)} ${label}: ${fmt(nowV)} (last week ${fmt(prevV)})` : null;
      const lines = [
        `📊 Weekly scorecard${p.full_name ? `, ${p.full_name.split(' ')[0]}` : ''} — this week vs last:`,
        line('Leads', leadsNow, leadsPrev),
        touchesNow + touchesPrev > 0 ? `${arrow(touchesNow, touchesPrev)} …answered instantly: ${touchesNow} (last week ${touchesPrev})` : null,
        line('Site visits', visitsNow, visitsPrev),
        line('Replies', repliesNow, repliesPrev),
        line('Emails sent', sentNow, sentPrev),
        line('New contacts', contactsNow, contactsPrev),
        line('Ad spend', adNow, adPrev, (n) => `$${n.toFixed(2)}`),
        pendingApprovals > 0 ? `⏳ ${pendingApprovals} action${pendingApprovals === 1 ? '' : 's'} waiting in Approvals` : null,
        `Every number is your own rows over two fixed 7-day windows. Open Garvis → Command to steer the week.`,
      ].filter(Boolean) as string[];

      await notifyText(p.webhook_url, lines.join('\n'));
      await admin.from('mind_events').insert({
        owner_id: p.id, event_type: 'note', source: 'scorecard',
        subject: `Weekly scorecard — leads ${leadsNow} (${arrow(leadsNow, leadsPrev)}), visits ${visitsNow}, replies ${repliesNow}, sent ${sentNow}, ad spend $${adNow.toFixed(2)}`,
        payload: {
          week: { leads: leadsNow, visits: visitsNow, replies: repliesNow, sent: sentNow, contacts: contactsNow, ad_spend: adNow, instant_touches: touchesNow },
          prev: { leads: leadsPrev, visits: visitsPrev, replies: repliesPrev, sent: sentPrev, contacts: contactsPrev, ad_spend: adPrev, instant_touches: touchesPrev },
        },
      }).then(() => {}, () => {});
      sent++;
    } catch { /* one owner's failure never blocks the rest */ }
  }

  return json({ ok: true, checked, sent });
});
