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
  COMPILER_SYSTEM, catalogContext, parsePlan, orderSteps, stepSucceeded, derivePlanStatus,
  WaitingError, type CompiledPlan, type ParsePlanResult, type StepStatus, type PlanStep, type WaitingOn,
} from './orchestrator';
import { actionSpecs } from './actionCatalog';
import { actionById } from './actionRegistry';
import { recordMindEvent } from './mindStore';

async function reason(system: string, context: string, message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    // format:'raw' — the compiler's system prompt defines its own JSON schema; the studio
    // decision-JSON suffix would contradict it.
    body: { system, context, history: [], message, format: 'raw' },
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

// ---------------------------------------------------------------------------
// Durable arcs — plans persist, wait at seams, and resume. The project loop.
// ---------------------------------------------------------------------------

export interface ArcRow {
  id: string;
  title: string;
  summary: string;
  intent: string;
  steps: PlanStep[];
  statuses: StepStatus[];
  holes: string[];
  questions: string[];
  status: 'draft' | 'running' | 'waiting' | 'ready' | 'done' | 'failed' | 'abandoned';
  waiting_reason: string | null;
  last_activity_at: string;
  created_at: string;
}

/** How long one runArc invocation owns an arc before the claim lapses (renewed per step). */
const CLAIM_MS = 10 * 60_000;

/** Persist a compiled plan as a durable arc (status draft — running starts on approval). */
export async function savePlan(intent: string, plan: CompiledPlan): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('orchestrator_plans').insert({
    owner_id: uid, title: plan.title, summary: plan.summary, intent: intent.trim().slice(0, 2000),
    steps: plan.steps, statuses: plan.steps.map(() => ({ kind: 'pending', note: '' })),
    holes: plan.holes, questions: plan.questions, status: 'draft',
  }).select('id').single();
  if (error || !data) throw new Error(`Could not save the plan: ${error?.message ?? 'unknown'}`);
  return (data as { id: string }).id;
}

export async function listArcs(): Promise<ArcRow[]> {
  const { data } = await supabase.from('orchestrator_plans')
    .select('*').neq('status', 'abandoned')
    .order('last_activity_at', { ascending: false }).limit(30);
  return (data as ArcRow[]) ?? [];
}

export async function abandonArc(id: string): Promise<void> {
  await supabase.from('orchestrator_plans')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', id);
}

export interface RunReport {
  statuses: StepStatus[];
  state: 'done' | 'waiting' | 'failed' | 'running';
  waitingReason: string | null;
}

/**
 * Run (or RESUME) an arc: already-succeeded steps keep their outcomes; pending/waiting/failed
 * steps get attempted; a WaitingError parks the step 'waiting' (a seam — the operator approves
 * the prerequisite and resumes); a dependency that is waiting/pending leaves this step pending
 * (not skipped — its turn comes on resume); only a TERMINALLY failed/skipped dependency skips
 * dependents. Statuses persist to the row after every step, so an arc survives anything.
 */
export async function runArc(planId: string, onUpdate: (statuses: StepStatus[]) => void): Promise<RunReport> {
  // ATOMIC CLAIM (scan gap: two tabs could run the same arc, statuses last-writer-wins). One
  // conditional update takes ownership for CLAIM_MS; a live claim elsewhere refuses honestly.
  const { data: claimed } = await supabase.from('orchestrator_plans')
    .update({ claimed_until: new Date(Date.now() + CLAIM_MS).toISOString() })
    .eq('id', planId)
    .or(`claimed_until.is.null,claimed_until.lt.${new Date().toISOString()}`)
    .select('id').maybeSingle();
  if (!claimed) throw new Error('This arc is already running (another tab or a moment ago) — give it a minute, then try again.');

  const { data: row, error } = await supabase.from('orchestrator_plans').select('*').eq('id', planId).single();
  if (error || !row) throw new Error('That arc no longer exists.');
  const arc = row as ArcRow;
  const steps = arc.steps;
  const statuses: StepStatus[] = steps.map((_, i) => arc.statuses[i] ?? { kind: 'pending', note: '' });
  const persist = async (patch: Record<string, unknown> = {}) => {
    await supabase.from('orchestrator_plans').update({
      statuses, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      claimed_until: new Date(Date.now() + CLAIM_MS).toISOString(),  // renewed per step while running
      ...patch,
    }).eq('id', planId).then(() => {}, () => { /* persistence is best-effort mid-run; final write matters */ });
  };
  const push = () => onUpdate([...statuses]);
  await persist({ status: 'running', waiting_reason: null, waiting_on: null });
  push();

  let firstWaitingOn: WaitingOn | null = null;
  const { order } = orderSteps(steps);
  for (const i of order) {
    if (stepSucceeded(statuses[i].kind)) continue; // resume: completed work stands
    const step = steps[i];
    // Terminal dep failure → skip. A dep merely waiting/pending → leave THIS step pending too.
    const deps = step.after;
    if (deps.some((a) => statuses[a].kind === 'failed' || statuses[a].kind === 'skipped')) {
      const bad = deps.find((a) => statuses[a].kind === 'failed' || statuses[a].kind === 'skipped')!;
      const depTitle = actionById(steps[bad].action)?.title ?? steps[bad].action;
      statuses[i] = { kind: 'skipped', note: `Skipped — depends on "${depTitle}", which did not complete.` };
      push(); await persist();
      continue;
    }
    if (deps.some((a) => !stepSucceeded(statuses[a].kind))) {
      statuses[i] = { kind: 'pending', note: 'Waiting for an earlier step — resumes with the arc.' };
      push();
      continue;
    }
    const def = actionById(step.action);
    if (!def) {
      statuses[i] = { kind: 'failed', note: `Action "${step.action}" is no longer in the registry.` };
      push(); await persist();
      continue;
    }
    statuses[i] = { kind: 'running', note: `${def.title}…` };
    push();
    try {
      statuses[i] = await def.execute(step.params);
    } catch (e) {
      if (e instanceof WaitingError) {
        statuses[i] = { kind: 'waiting', note: e.message };
        if (!firstWaitingOn) firstWaitingOn = e.waitingOn;
      } else {
        statuses[i] = { kind: 'failed', note: e instanceof Error ? e.message : `${def.title} failed.` };
      }
    }
    push(); await persist();
  }

  const state = derivePlanStatus(statuses);
  const waitingReason = statuses.find((s) => s.kind === 'waiting')?.note ?? null;
  // Release the claim; store the structured blocker so the worker's wake sweep can re-check it.
  await persist({ status: state, waiting_reason: waitingReason, waiting_on: state === 'waiting' ? (firstWaitingOn ?? { kind: 'other' }) : null, claimed_until: null });

  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    void recordMindEvent(auth.user.id, {
      event_type: 'note', source: 'orchestrator',
      subject: `Arc "${arc.title}" → ${state}${waitingReason ? ` (waiting: ${waitingReason.slice(0, 120)})` : ''}`,
      payload: { plan_id: planId, steps: steps.map((s, i) => ({ action: s.action, outcome: statuses[i].kind })) },
    });
  }
  return { statuses, state, waitingReason };
}
