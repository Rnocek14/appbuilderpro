// src/lib/garvis/forgeScoreRun.ts
// Impure half of the scorecard (pure core: forgeScore.ts): fetch the real rows, reduce, return.
// Fail-soft per probe — a broken query is a null section, never a fake zero.

import { supabase } from '../supabase';
import { forgeScore, auditRuns, type ForgeScore, type LedgerAudit } from './forgeScore';

export interface ScorecardFacts {
  forge: ForgeScore | null;
  ledger: LedgerAudit | null;
  /** Approvals auto-decided by earned autonomy in the last 24h. Null = probe failed. */
  unattendedLastDay: number | null;
}

export async function loadScorecard(): Promise<ScorecardFacts> {
  const forge = await supabase.from('project_generations')
    .select('kind, status, stages, summary')
    .order('created_at', { ascending: false }).limit(50)
    .then(({ data, error }) => error ? null : forgeScore((data ?? []) as Parameters<typeof forgeScore>[0]), () => null);

  const ledger = await supabase.from('execution_runs')
    .select('id, connector, status, approval_id')
    .order('created_at', { ascending: false }).limit(200)
    .then(({ data, error }) => error ? null : auditRuns((data ?? []) as Parameters<typeof auditRuns>[0]), () => null);

  const unattendedLastDay = await supabase.from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('decided_via', 'autonomy_grant')
    .gte('decided_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
    .then(({ count, error }) => error ? null : count ?? 0, () => null);

  return { forge, ledger, unattendedLastDay };
}
