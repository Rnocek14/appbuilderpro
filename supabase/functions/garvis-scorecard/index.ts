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

      // REVENUE — the money loop's contribution: sums of invoices YOU marked paid (payment truth
      // lives in your processor; these are your own confirmations, never guesses).
      const { data: paidRows } = await admin.from('invoices')
        .select('paid_at, amount_usd').eq('owner_id', p.id).eq('status', 'paid').gte('paid_at', prevStart).limit(500);
      let revNow = 0, revPrev = 0;
      for (const r of (paidRows ?? []) as { paid_at: string; amount_usd: number }[]) {
        if (r.paid_at >= thisStart) revNow += Number(r.amount_usd) || 0;
        else revPrev += Number(r.amount_usd) || 0;
      }
      const { count: overdue } = await admin.from('invoices')
        .select('id', { count: 'exact', head: true }).eq('owner_id', p.id).eq('status', 'sent')
        .not('due_date', 'is', null).lt('due_date', nowIso.slice(0, 10));

      // Ad spend: summed from synced daily rows (real platform numbers, when connected).
      const { data: adRows } = await admin.from('ad_metrics')
        .select('date, spend_usd').eq('owner_id', p.id).gte('date', prevDate).limit(3000);
      let adNow = 0, adPrev = 0;
      for (const r of (adRows ?? []) as { date: string; spend_usd: number }[]) {
        if (r.date >= thisDate) adNow += Number(r.spend_usd) || 0;
        else if (r.date >= prevDate) adPrev += Number(r.spend_usd) || 0;
      }

      const total = leadsNow + leadsPrev + visitsNow + visitsPrev + repliesNow + repliesPrev
        + sentNow + sentPrev + contactsNow + contactsPrev + adNow + adPrev + pendingApprovals
        + revNow + revPrev + (overdue ?? 0);
      if (total === 0) continue; // an empty fortnight sends nothing

      // PER-BUSINESS BREAKDOWN (multi-business audit): owner totals hide which brand moved.
      // Leads, visits, and new contacts are world-stamped (app_0036 / app_0082), so each business
      // gets its own line of the same fixed-window arithmetic. Honesty rules unchanged: only
      // businesses and signals with something in either week appear, and the section appears at
      // all only when 2+ businesses had activity — one business IS the totals above.
      let worldLines: string[] = [];
      try {
        const { data: worlds } = await admin.from('knowledge_worlds')
          .select('id, title').eq('owner_id', p.id).limit(12);
        if ((worlds ?? []).length >= 2) {
          const per = await Promise.all((worlds ?? []).map(async (w: { id: string; title: string }) => {
            const wcnt = (table: string, col: string, from: string, to: string, extra?: (q: unknown) => unknown) => {
              // deno-lint-ignore no-explicit-any
              let q: any = admin.from(table).select('id', { count: 'exact', head: true })
                .eq('owner_id', p.id).eq('world_id', w.id).gte(col, from).lt(col, to);
              if (extra) q = extra(q);
              return q.then((r: { count: number | null }) => r.count ?? 0);
            };
            const [ln, lp, vn, vp, cn, cp] = await Promise.all([
              wcnt('leads', 'created_at', thisStart, nowIso), wcnt('leads', 'created_at', prevStart, thisStart),
              // deno-lint-ignore no-explicit-any
              wcnt('site_events', 'created_at', thisStart, nowIso, (q: any) => q.eq('kind', 'visit')), wcnt('site_events', 'created_at', prevStart, thisStart, (q: any) => q.eq('kind', 'visit')),
              wcnt('contacts', 'created_at', thisStart, nowIso), wcnt('contacts', 'created_at', prevStart, thisStart),
            ]);
            return { title: w.title, ln, lp, vn, vp, cn, cp, any: ln + lp + vn + vp + cn + cp > 0 };
          }));
          const active = per.filter((x) => x.any);
          if (active.length >= 2) {
            const seg = (label: string, n: number, pv: number) => (n + pv > 0 ? `${label} ${arrow(n, pv)} ${n} (was ${pv})` : null);
            worldLines = [
              'By business:',
              ...active.map((x) => `• ${x.title}: ${[seg('leads', x.ln, x.lp), seg('visits', x.vn, x.vp), seg('contacts', x.cn, x.cp)].filter(Boolean).join(' · ')}`),
            ];
          }
        }
      } catch { /* the breakdown is additive — its failure never blocks the scorecard */ }

      const line = (label: string, nowV: number, prevV: number, fmt: (n: number) => string = String) =>
        nowV + prevV > 0 ? `${arrow(nowV, prevV)} ${label}: ${fmt(nowV)} (last week ${fmt(prevV)})` : null;
      const lines = [
        `📊 Weekly scorecard${p.full_name ? `, ${p.full_name.split(' ')[0]}` : ''} — this week vs last:`,
        line('Revenue collected', revNow, revPrev, (n) => `$${n.toFixed(2)}`),
        (overdue ?? 0) > 0 ? `⚠️ ${overdue} invoice${overdue === 1 ? '' : 's'} past due — the chaser has reminders in your queue` : null,
        line('Leads', leadsNow, leadsPrev),
        touchesNow + touchesPrev > 0 ? `${arrow(touchesNow, touchesPrev)} …answered instantly: ${touchesNow} (last week ${touchesPrev})` : null,
        line('Site visits', visitsNow, visitsPrev),
        line('Replies', repliesNow, repliesPrev),
        line('Emails sent', sentNow, sentPrev),
        line('New contacts', contactsNow, contactsPrev),
        line('Ad spend', adNow, adPrev, (n) => `$${n.toFixed(2)}`),
        pendingApprovals > 0 ? `⏳ ${pendingApprovals} action${pendingApprovals === 1 ? '' : 's'} waiting in Approvals` : null,
        ...worldLines,
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
