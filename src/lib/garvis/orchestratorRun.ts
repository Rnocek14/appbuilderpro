// src/lib/garvis/orchestratorRun.ts
// Orchestrator, impure half: compile an intent into a plan (one credit-metered model call through
// the cluster-chat chokepoint, same rail genesis uses) and execute an approved plan through the
// action registry — sequentially, dependency-aware, with honest per-step outcomes.
//
// Failure discipline: a failed step never reverts what came before (completed work stands and is
// reported), and steps that depended on it are SKIPPED with the reason — never attempted blind.
// Every compile and every run lands a mind_event, so the brain's own record shows what the
// orchestrator did and the consolidation loop can learn from it.

import { supabase } from '../supabase';
import {
  COMPILER_SYSTEM, catalogContext, parsePlan, orderSteps, stepSucceeded,
  type CompiledPlan, type ParsePlanResult, type StepStatus,
} from './orchestrator';
import { actionSpecs } from './actionCatalog';
import { actionById } from './actionRegistry';
import { recordMindEvent } from './mindStore';

async function reason(system: string, context: string, message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system, context, history: [], message },
  });
  if (error) throw new Error(error.message);
  return ((data as { text?: string })?.text ?? '').trim();
}

/** Intent → compiled plan (reviewable; nothing executes here). */
export async function compileIntent(intent: string): Promise<ParsePlanResult> {
  const clean = intent.trim();
  if (clean.length < 12) {
    return { plan: null, problems: ['Say the whole thing — a sentence or three about what you want set up.'], warnings: [] };
  }
  const specs = actionSpecs();
  const raw = await reason(COMPILER_SYSTEM, catalogContext(specs), clean);
  const parsed = parsePlan(raw, specs);
  if (parsed.plan) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      void recordMindEvent(auth.user.id, {
        event_type: 'note', source: 'orchestrator',
        subject: `Compiled plan "${parsed.plan.title}" — ${parsed.plan.steps.length} step(s), ${parsed.plan.holes.length} hole(s)`,
        payload: { intent: clean.slice(0, 300), steps: parsed.plan.steps.map((s) => s.action) },
      });
    }
  }
  return parsed;
}

export interface RunReport {
  statuses: StepStatus[];
  succeeded: number;
  failed: number;
  skipped: number;
  cycleWarning: boolean;
}

/**
 * Execute an approved plan. `onUpdate` fires after every status change so the review card renders
 * live progress. Sequential on purpose: most steps are model calls or DB writes where order and
 * legibility beat parallel speed, and dependencies stay simple.
 */
export async function executePlan(
  plan: CompiledPlan, onUpdate: (statuses: StepStatus[]) => void,
): Promise<RunReport> {
  const { order, cycleWarning } = orderSteps(plan.steps);
  const statuses: StepStatus[] = plan.steps.map(() => ({ kind: 'pending', note: '' }));
  const push = () => onUpdate([...statuses]);
  push();

  for (const i of order) {
    const step = plan.steps[i];
    // A dependency that didn't succeed poisons this step — skip with the reason, never run blind.
    const badDep = step.after.find((a) => !stepSucceeded(statuses[a].kind));
    if (badDep !== undefined) {
      const depTitle = actionById(plan.steps[badDep].action)?.title ?? plan.steps[badDep].action;
      statuses[i] = { kind: 'skipped', note: `Skipped — depends on "${depTitle}", which ${statuses[badDep].kind === 'skipped' ? 'was skipped' : 'did not complete'}.` };
      push();
      continue;
    }
    const def = actionById(step.action);
    if (!def) { // registry drift (should be impossible post-gauntlet) — honest failure, not a crash
      statuses[i] = { kind: 'failed', note: `Action "${step.action}" is no longer in the registry.` };
      push();
      continue;
    }
    statuses[i] = { kind: 'running', note: `${def.title}…` };
    push();
    try {
      statuses[i] = await def.execute(step.params);
    } catch (e) {
      statuses[i] = { kind: 'failed', note: e instanceof Error ? e.message : `${def.title} failed.` };
    }
    push();
  }

  const report: RunReport = {
    statuses,
    succeeded: statuses.filter((s) => stepSucceeded(s.kind)).length,
    failed: statuses.filter((s) => s.kind === 'failed').length,
    skipped: statuses.filter((s) => s.kind === 'skipped').length,
    cycleWarning,
  };
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    void recordMindEvent(auth.user.id, {
      event_type: 'note', source: 'orchestrator',
      subject: `Ran plan "${plan.title}" — ${report.succeeded} succeeded, ${report.failed} failed, ${report.skipped} skipped`,
      payload: { steps: plan.steps.map((s, i) => ({ action: s.action, outcome: statuses[i].kind })) },
    });
  }
  return report;
}
