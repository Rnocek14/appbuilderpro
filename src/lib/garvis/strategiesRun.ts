// src/lib/garvis/strategiesRun.ts
// Impure half of the strategies spine (pure core: strategies.ts). List, propose (through the
// credits-gated edge fn), adopt, retire. Adopt/retire only shapes nextMove/briefing inputs —
// nothing in this file can send anything.

import { supabase } from '../supabase';
import { normalizeStatus, type StrategyStatus } from './strategies';

export interface StrategyRow {
  id: string; world_id: string | null; title: string; rationale: string;
  basis: 'measured' | 'heuristic'; evidence: string[]; status: StrategyStatus; created_at: string;
}
const COLS = 'id, world_id, title, rationale, basis, evidence, status, created_at';

export async function listStrategies(worldId: string): Promise<StrategyRow[]> {
  const { data, error } = await supabase.from('strategies').select(COLS)
    .eq('world_id', worldId).neq('status', 'retired')
    .order('created_at', { ascending: false }).limit(12);
  if (error) throw new Error(error.message);
  return ((data ?? []) as StrategyRow[]).map((r) => ({ ...r, status: normalizeStatus(r.status), evidence: Array.isArray(r.evidence) ? r.evidence : [] }));
}

export async function proposeStrategies(worldId: string, objective?: string): Promise<{ ok: boolean; error: string | null; strategies: StrategyRow[] }> {
  const { data, error } = await supabase.functions.invoke('propose-strategies', { body: { world_id: worldId, objective } });
  if (error) throw new Error(error.message);
  const r = data as { ok?: boolean; error?: string; strategies?: StrategyRow[] };
  return { ok: !!r.ok, error: r.error ?? null, strategies: r.strategies ?? [] };
}

/** Adopt or retire — a CAS-free single flip; the row stays on the record either way. */
export async function setStrategyStatus(id: string, status: 'adopted' | 'retired'): Promise<void> {
  const { error } = await supabase.from('strategies').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
