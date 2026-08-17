// src/lib/garvis/fieldRun.ts
// Impure half of the Field (pure core: field.ts): load the real rows — worlds, running arcs,
// pending approvals, recent mind events — and compose orb states. Fail-soft per source: one
// broken table dims its SIGNAL, never fakes a state; a total load failure surfaces as a load
// failure (the page renders it as such, not as a quiet field).

import { supabase } from '../supabase';
import { composeField, approvalsWhisper, type FieldWorld } from './field';

export interface FieldSnapshot {
  worlds: FieldWorld[];
  whisper: string;
  totalPending: number;
}

const NEWS_WINDOW_HOURS = 24;

export async function loadField(): Promise<FieldSnapshot> {
  const { data: worldRows, error: wErr } = await supabase.from('knowledge_worlds')
    .select('id, title').order('updated_at', { ascending: false }).limit(24);
  if (wErr) throw new Error(wErr.message);
  let worlds = (worldRows ?? []) as { id: string; title: string }[];

  // Only worlds the world surface can actually RENDER become orbs (deep review: a cluster-less
  // world — every close-won client births one — dead-ends on tap). Fail-soft: if the check
  // itself breaks, keep all worlds rather than blank the field.
  try {
    const { data: cl } = await supabase.from('knowledge_clusters')
      .select('world_id').in('world_id', worlds.map((w) => w.id));
    const renderable = new Set(((cl ?? []) as { world_id: string }[]).map((c) => c.world_id));
    worlds = worlds.filter((w) => renderable.has(w.id));
  } catch { /* keep all */ }

  // Each signal is independent and fail-soft — a broken source contributes nothing, never a guess.
  // 'Working' means actively RUNNING (deep review: an enabled-but-idle standing order made every
  // world permanently ember, which buried news and made quiet unreachable).
  const working = new Set<string>();
  try {
    const { data } = await supabase.from('orchestrator_plans')
      .select('world_id').eq('status', 'running').not('world_id', 'is', null).limit(100);
    for (const r of (data ?? []) as { world_id: string | null }[]) if (r.world_id) working.add(r.world_id);
  } catch { /* no arcs signal */ }

  let totalPending = 0;
  const approvalsByWorld = new Map<string, number>();
  try {
    // count:'exact' carries the queue's TRUE total even when the attribution rows are capped
    // (deep review: rows.length silently capped the whisper at 200).
    const { data, count } = await supabase.from('approvals')
      .select('world_id', { count: 'exact' }).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(200);
    const rows = (data ?? []) as { world_id: string | null }[];
    totalPending = count ?? rows.length;
    for (const r of rows) if (r.world_id) approvalsByWorld.set(r.world_id, (approvalsByWorld.get(r.world_id) ?? 0) + 1);
  } catch { /* no approvals signal */ }

  const newsByWorld = new Map<string, number>();
  try {
    const sinceIso = new Date(Date.now() - NEWS_WINDOW_HOURS * 3_600_000).toISOString();
    const { data } = await supabase.from('mind_events')
      .select('payload').gte('created_at', sinceIso)
      .order('created_at', { ascending: false }).limit(300);
    for (const r of (data ?? []) as { payload: Record<string, unknown> | null }[]) {
      const wid = r.payload?.world_id;
      if (typeof wid === 'string') newsByWorld.set(wid, (newsByWorld.get(wid) ?? 0) + 1);
    }
  } catch { /* no news signal */ }

  return {
    worlds: composeField(worlds, working, approvalsByWorld, newsByWorld),
    whisper: approvalsWhisper(totalPending),
    totalPending,
  };
}
