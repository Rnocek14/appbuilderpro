// src/lib/garvis/briefingRun.ts
// The briefing's impure half: gather the facts from real rows, fail-soft PER PROBE — a broken
// query becomes null (the pure core stays honestly silent about that section), never a fake
// zero and never a dead briefing. Due-ness is one look per calendar day, tracked locally.

import { supabase } from '../supabase';
import type { BriefingFacts } from './briefing';

const DAY_KEY = 'ff:brief-day';
const LOOK_KEY = 'ff:brief-last-look';

/** One auto-briefing per calendar day (the operator can always ASK for another). */
export function briefingDue(): boolean {
  try { return localStorage.getItem(DAY_KEY) !== new Date().toDateString(); } catch { return false; }
}

export function markBriefed(): void {
  try {
    localStorage.setItem(DAY_KEY, new Date().toDateString());
    localStorage.setItem(LOOK_KEY, new Date().toISOString());
  } catch { /* local-only */ }
}

const lastLook = (): string => {
  try {
    const v = localStorage.getItem(LOOK_KEY);
    if (v && !Number.isNaN(Date.parse(v))) return v;
  } catch { /* fall through */ }
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
};

export async function gatherBriefing(): Promise<BriefingFacts> {
  const since = lastLook();
  const sinceHours = Math.max(1, Math.round((Date.now() - Date.parse(since)) / 3600_000));

  const episodes = (async (): Promise<BriefingFacts['episodes']> => {
    const { data: eps, error } = await supabase.from('channel_episodes')
      .select('title, channel_id').gte('created_at', since)
      .order('created_at', { ascending: false }).limit(12);
    if (error) return null;
    const rows = (eps ?? []) as { title: string | null; channel_id: string | null }[];
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.channel_id).filter(Boolean))] as string[];
    const { data: chans } = ids.length
      ? await supabase.from('growth_channels').select('id, name').in('id', ids).limit(50)
      : { data: [] };
    const names = new Map(((chans ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    return rows.map((r) => ({ channel: names.get(r.channel_id ?? '') ?? 'channel', title: r.title ?? 'untitled' }));
  })().catch(() => null);

  const countOf = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> => {
    try { const { count, error } = await q; return error ? null : count ?? 0; } catch { return null; }
  };

  const opportunities = countOf(supabase.from('opportunities')
    .select('id', { count: 'exact', head: true }).gte('found_at', since));

  const arcs = (async () => {
    const { data, error } = await supabase.from('orchestrator_plans')
      .select('title, status, waiting_reason, last_activity_at')
      .neq('status', 'abandoned').order('last_activity_at', { ascending: false }).limit(30);
    if (error) return { finished: null, waiting: null };
    const rows = (data ?? []) as { title: string; status: string; waiting_reason: string | null; last_activity_at: string }[];
    return {
      finished: rows.filter((r) => r.status === 'done' && r.last_activity_at >= since).map((r) => r.title),
      waiting: rows.filter((r) => r.status === 'waiting')
        .map((r) => ({ title: r.title, reason: r.waiting_reason ?? 'a prerequisite needs you' })),
    };
  })().catch(() => ({ finished: null, waiting: null }));

  const approvals = countOf(supabase.from('approvals')
    .select('id', { count: 'exact', head: true }).eq('status', 'pending'));

  const clocks = countOf(supabase.from('standing_orders')
    .select('id', { count: 'exact', head: true }).eq('status', 'active'));

  const channels = countOf(supabase.from('growth_channels')
    .select('id', { count: 'exact', head: true }));

  // The prediction record (SW7.2): CLOSED decisions with a recorded verdict, straight through
  // the verified decisionHitRate reducer. Fail-soft like every probe.
  const predictions = (async (): Promise<BriefingFacts['predictions']> => {
    const { data, error } = await supabase.from('mind_decisions')
      .select('outcome, outcome_hit').not('outcome', 'is', null).limit(500);
    if (error) return null;
    const { decisionHitRate } = await import('./mind');
    const r = decisionHitRate((data ?? []) as { outcome: string | null; outcome_hit: boolean | null }[]);
    return { closed: r.closed, hits: r.hits };
  })().catch(() => null);

  // The overnight read (SW8.2): today's accepted synthesis from the pulse, if one exists.
  const read = (async (): Promise<BriefingFacts['read']> => {
    const t = new Date();
    const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString();
    const { data, error } = await supabase.from('mind_events').select('subject')
      .eq('source', 'overnight-read').gte('created_at', dayStart)
      .order('created_at', { ascending: false }).limit(1);
    if (error) return null;
    return ((data ?? [])[0] as { subject?: string | null } | undefined)?.subject ?? null;
  })().catch(() => null);

  const [eps, opps, arcRes, appr, clk, chan, preds, rd] = await Promise.all([episodes, opportunities, arcs, approvals, clocks, channels, predictions, read]);
  return {
    hour: new Date().getHours(),
    sinceHours,
    episodes: eps,
    opportunities: opps,
    arcsFinished: arcRes.finished,
    arcsWaiting: arcRes.waiting,
    approvals: appr,
    clocks: clk,
    channels: chan,
    predictions: preds,
    read: rd,
  };
}
