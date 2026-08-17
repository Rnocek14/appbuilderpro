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
  const worlds = (worldRows ?? []) as { id: string; title: string }[];

  // Each signal is independent and fail-soft — a broken source contributes nothing, never a guess.
  const working = new Set<string>();
  try {
    const { data } = await supabase.from('orchestrator_plans')
      .select('world_id').in('status', ['running', 'ready']).not('world_id', 'is', null).limit(100);
    for (const r of (data ?? []) as { world_id: string | null }[]) if (r.world_id) working.add(r.world_id);
  } catch { /* no arcs signal */ }
  try {
    const { data } = await supabase.from('standing_orders')
      .select('world_id').eq('status', 'active').not('world_id', 'is', null).limit(100);
    for (const r of (data ?? []) as { world_id: string | null }[]) if (r.world_id) working.add(r.world_id);
  } catch { /* no orders signal */ }

  let totalPending = 0;
  const approvalsByWorld = new Map<string, number>();
  try {
    const { data } = await supabase.from('approvals')
      .select('world_id').eq('status', 'pending').limit(200);
    const rows = (data ?? []) as { world_id: string | null }[];
    totalPending = rows.length;
    for (const r of rows) if (r.world_id) approvalsByWorld.set(r.world_id, (approvalsByWorld.get(r.world_id) ?? 0) + 1);
  } catch { /* no approvals signal */ }

  const newsByWorld = new Map<string, number>();
  try {
    const sinceIso = new Date(Date.now() - NEWS_WINDOW_HOURS * 3_600_000).toISOString();
    const { data } = await supabase.from('mind_events')
      .select('payload').gte('created_at', sinceIso).limit(300);
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
