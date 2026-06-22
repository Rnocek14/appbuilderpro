// src/lib/garvis/index.ts
// Public surface of the shared Garvis agent runtime.
//
// What this is: the execution chassis for cross-portfolio work — a mode-gated tool loop
// (observe → plan → act) over apps / app_metrics / agent_runs, with queued, leased,
// checkpointed, budget-capped runs. Lifted from fableforge-core's runtime-agnostic core and
// the job-worker execution pattern.
//
// What this is NOT (yet): a reasoning engine. `GarvisModelClient` is the seam where the brain
// plugs in (Week 4). `diagnosticModel` is a no-LLM stand-in used only to validate the plumbing.

export * from './types';
export { GARVIS_TOOLS, toolsFor, isToolAllowed } from './tools';
export { executeTool } from './executeTool';
export { claimNextRun, runGarvisTask, drainQueue } from './runtime';
export { diagnosticModel } from './diagnosticModel';

import { supabase } from '../supabase';
import { claimNextRun, runGarvisTask } from './runtime';
import { diagnosticModel } from './diagnosticModel';
import type { AgentRun } from '../../types';
import type { RuntimeEvent } from './types';

/**
 * Plumbing self-test (no LLM): enqueue a diagnostic run, claim it, execute it with the
 * diagnosticModel, and return the terminal row. Use this once app_0004 is applied to confirm the
 * chassis works end-to-end before wiring the real model. Requires an authenticated session.
 */
export async function runtimeSelfTest(onEvent?: (e: RuntimeEvent) => void): Promise<AgentRun | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('runtimeSelfTest requires an authenticated user.');

  await supabase.from('agent_runs').insert({
    owner_id: userId,
    kind: 'analyze',
    title: 'Garvis runtime self-test',
    status: 'queued',
    phase: 'observe',
    budget_usd: 0,
    input: 'Diagnostic: verify gate + tool dispatch + checkpoint + logging.',
  });

  const run = await claimNextRun();
  if (!run) return null;
  await runGarvisTask(run, { model: diagnosticModel, onEvent });

  const { data } = await supabase.from('agent_runs').select('*').eq('id', run.id).maybeSingle();
  return (data as AgentRun) ?? null;
}
