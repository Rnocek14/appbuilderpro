// src/lib/garvis/verdictsRun.ts
// Impure half of kept-vs-rewritten: one row per verdict (RLS owner-scoped, world pinned to an
// owned world by the policy), and the real counts the ledger line is computed from.

import { supabase } from '../supabase';
import type { VerdictCounts } from './verdicts';

export async function recordVerdict(input: {
  worldId: string; kind: 'assist' | 'deliver'; verdict: 'kept' | 'rewritten'; topic?: string;
}): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('draft_verdicts').insert({
    owner_id: uid, world_id: input.worldId, kind: input.kind, verdict: input.verdict,
    topic: (input.topic ?? '').trim().slice(0, 120) || null,
  });
  if (error) throw new Error(error.message);
}

export async function countVerdicts(worldId: string, kind: 'assist' | 'deliver'): Promise<VerdictCounts> {
  const { data, error } = await supabase.from('draft_verdicts')
    .select('verdict').eq('world_id', worldId).eq('kind', kind).limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { verdict: string }[];
  return {
    kept: rows.filter((r) => r.verdict === 'kept').length,
    rewritten: rows.filter((r) => r.verdict === 'rewritten').length,
  };
}
