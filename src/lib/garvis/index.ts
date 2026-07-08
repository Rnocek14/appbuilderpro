// src/lib/garvis/index.ts
// Public surface of the shared Garvis agent runtime.
//
// What this is: the execution chassis for cross-portfolio work — a mode-gated tool loop
// (observe → plan → act) over apps / app_metrics / agent_runs, with queued, leased,
// checkpointed, budget-capped runs. Lifted from fableforge-core's runtime-agnostic core and
// the job-worker execution pattern.
//
// The reasoning engine plugs into `GarvisModelClient`: `diagnosticModel` is a no-LLM stand-in for
// validating the plumbing; `brainModel` is the real LLM-backed brain (via the garvis-brain edge
// function). `recommendNextAction` runs the first real, read-only capability — Garvis reasoning
// over the live portfolio in `plan` mode and recording a grounded recommendation.

export * from './types';
export { GARVIS_TOOLS, toolsFor, isToolAllowed } from './tools';
export { executeTool } from './executeTool';
export { claimNextRun, runGarvisTask, drainQueue } from './runtime';
export { diagnosticModel } from './diagnosticModel';
export { brainModel } from './brainModel';

export { selectApproved, buildKnowledgeDigest, normalizeShortScript } from './knowledge';
export {
  MIND_EVENT_TYPES, MIN_EVIDENCE, normalizeMindEvent, beliefEvidence, attachEvidence,
  isBeliefStale, isDecisionOpen, decisionHitRate, compileMindContext,
} from './mind';
export type { MindEventType, MindEventInput, NormalizedMindEvent, BeliefVerdict, BeliefEvidence, MindContextInput } from './mind';
export { recordMindEvent } from './mindStore';
export { selectActiveGoals, selectApprovedCapabilities, buildGoalsDigest, buildCapabilitiesDigest } from './objective';
export {
  buildProfilesDigest, buildProfileUser, parseProfileResponse, isProfileEmpty, isProfileStale, PROFILE_SYSTEM,
} from './profiles';
export type { ProfileGenInput, ParsedProfile } from './profiles';
export { classifyLiveness, latestByApp, buildLivenessDigest, livenessLabel } from './liveness';
export type { LivenessClass } from './liveness';
export { daysSince, isLoopStale, buildCheckInLine, buildOpenLoopsDigest } from './followup';
export type { OpenLoop, LoopSignal } from './followup';
export { TRIAGE_SYSTEM, buildTriageUser, parseTriageResponse, groupVerdicts, applyStrategicGuard } from './triage';
export type { Verdict, TriageVerdict, TriageReport, TriageAppInput, TriageInput } from './triage';

import { supabase } from '../supabase';
import { claimNextRun, runGarvisTask } from './runtime';
import { diagnosticModel } from './diagnosticModel';
import { brainModel } from './brainModel';
import { buildKnowledgeDigest } from './knowledge';
import { buildGoalsDigest, buildCapabilitiesDigest } from './objective';
import { buildProfilesDigest } from './profiles';
import { buildLivenessDigest, latestByApp } from './liveness';
import { buildOpenLoopsDigest } from './followup';
import type { AgentRun, AppLiveness, GarvisAppProfile, GarvisCapability, GarvisConstraints, GarvisGoal, GarvisKnowledge } from '../../types';
import type { RuntimeEvent } from './types';

const SCOPE_FILTER = (appId: string) => `app_id.eq.${appId},app_id.is.null`;

/**
 * Fetch the owner's APPROVED knowledge and render it as a context digest to prepend to a run's input.
 * This is the deterministic half of the "Learn" feedback loop — every run sees approved lessons/
 * decisions, even if the brain never calls recall_knowledge. Returns '' when there's nothing approved.
 */
async function approvedKnowledgeDigest(appId?: string | null): Promise<string> {
  let q = supabase
    .from('garvis_knowledge')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(12);
  // Portfolio-wide runs see all approved knowledge; app-scoped runs see that app's + portfolio-wide.
  if (appId) q = q.or(SCOPE_FILTER(appId));
  const { data } = await q;
  return buildKnowledgeDigest((data as GarvisKnowledge[]) ?? []);
}

/**
 * The objective-function context: active goals + global constraints + approved capabilities. Injected
 * ahead of knowledge so the brain knows what it is optimizing for (and within which limits) and what
 * resources exist before it reasons. Returns '' when nothing is set.
 */
async function objectiveContext(appId?: string | null): Promise<string> {
  let goalsQ = supabase.from('garvis_goals').select('*').eq('status', 'active').order('priority', { ascending: true });
  if (appId) goalsQ = goalsQ.or(SCOPE_FILTER(appId));
  let capsQ = supabase.from('garvis_capabilities').select('*').eq('status', 'approved');
  if (appId) capsQ = capsQ.or(SCOPE_FILTER(appId));

  const [{ data: goals }, { data: constraints }, { data: caps }, { data: apps }] = await Promise.all([
    goalsQ,
    supabase.from('garvis_constraints').select('*').maybeSingle(),
    capsQ,
    supabase.from('apps').select('id, name').is('deleted_at', null),
  ]);

  const appNameById: Record<string, string> = {};
  for (const a of (apps as { id: string; name: string }[] | null) ?? []) appNameById[a.id] = a.name;

  return [
    buildGoalsDigest((goals as GarvisGoal[]) ?? [], (constraints as GarvisConstraints) ?? null),
    buildCapabilitiesDigest((caps as GarvisCapability[]) ?? [], appNameById),
  ].filter(Boolean).join('\n\n');
}

/**
 * The app-intelligence context: a compact profile of each product (what it is, where it stands, the
 * next milestone). Injected so the brain reasons over WHAT EACH PRODUCT IS — not just commit activity.
 * App-scoped runs see that app's profile; portfolio-wide runs see all profiles. Returns '' when none.
 */
async function profilesContext(appId?: string | null): Promise<string> {
  let q = supabase.from('garvis_app_profiles').select('*');
  if (appId) q = q.eq('app_id', appId);
  const [{ data: profiles }, { data: apps }] = await Promise.all([
    q,
    supabase.from('apps').select('id, name').is('deleted_at', null),
  ]);
  const appNameById: Record<string, string> = {};
  for (const a of (apps as { id: string; name: string }[] | null) ?? []) appNameById[a.id] = a.name;
  return buildProfilesDigest((profiles as GarvisAppProfile[]) ?? [], appNameById);
}

/** Assemble a run's input: objective (what/limits) → profiles (what each product is) → knowledge (lessons) → task. */
async function livenessContext(appId?: string | null): Promise<string> {
  let appsQ = supabase.from('apps').select('id, name, deploy_url').is('deleted_at', null);
  if (appId) appsQ = appsQ.eq('id', appId);
  let liveQ = supabase.from('app_liveness').select('*').order('checked_at', { ascending: false }).limit(300);
  if (appId) liveQ = liveQ.eq('app_id', appId);
  const [{ data: apps }, { data: live }] = await Promise.all([appsQ, liveQ]);
  const latest = latestByApp((live as AppLiveness[]) ?? []);
  return buildLivenessDigest((apps as { id: string; name: string; deploy_url: string | null }[]) ?? [], latest);
}

/**
 * Open commitments (active goals) + their age, so reasoning is accountability-aware: weigh
 * follow-through before recommending new work. DB-only (no GitHub) to keep the recommend path cheap;
 * the richer per-loop progress signal is computed in the follow-up UI.
 */
async function openLoopsContext(appId?: string | null): Promise<string> {
  let goalsQ = supabase.from('garvis_goals').select('*').eq('status', 'active');
  if (appId) goalsQ = goalsQ.or(SCOPE_FILTER(appId));
  const [{ data: goals }, { data: apps }] = await Promise.all([
    goalsQ,
    supabase.from('apps').select('id, name').is('deleted_at', null),
  ]);
  const appNameById: Record<string, string> = {};
  for (const a of (apps as { id: string; name: string }[] | null) ?? []) appNameById[a.id] = a.name;
  return buildOpenLoopsDigest((goals as GarvisGoal[]) ?? [], appNameById);
}

async function assembleRunInput(appId: string | null | undefined, baseInput: string): Promise<string> {
  const [objective, profiles, liveness, openLoops, knowledge] = await Promise.all([
    objectiveContext(appId),
    profilesContext(appId),
    livenessContext(appId),
    openLoopsContext(appId),
    approvedKnowledgeDigest(appId),
  ]);
  return [objective, profiles, liveness, openLoops, knowledge, baseInput].filter(Boolean).join('\n\n');
}

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

/**
 * The first REAL Garvis capability: ask the brain "what should I work on?" against the live
 * portfolio. Runs in `plan` mode — strictly read-only (the gate withholds every write tool), so it
 * can inspect apps/metrics and propose, but cannot mutate anything. Enqueues a `recommend` run,
 * executes it with brainModel, and returns the terminal row whose `recommendation` holds the answer.
 *
 * @param appId  scope to one product, or null/omit for a portfolio-wide recommendation.
 * @param budgetUsd  hard spend cap for this run (defense-in-depth alongside the step cap).
 */
export async function recommendNextAction(
  opts: { appId?: string | null; budgetUsd?: number; onEvent?: (e: RuntimeEvent) => void } = {},
): Promise<AgentRun | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('recommendNextAction requires an authenticated user.');

  const scope = opts.appId ? 'this product' : 'the portfolio';
  const baseInput =
    'Inspect the relevant apps and their recent metrics, then recommend the single highest-leverage ' +
    'next action THAT MOVES AN ACTIVE GOAL within the stated constraints. Ground every claim in the ' +
    'data you fetch; if metrics are missing, say so plainly.';
  await supabase.from('agent_runs').insert({
    owner_id: userId,
    app_id: opts.appId ?? null,
    kind: 'recommend',
    title: `What should I focus on next for ${scope}?`,
    status: 'queued',
    phase: 'plan', // read-only + propose_recommendation; no write tools are exposed here
    budget_usd: opts.budgetUsd ?? 0.25,
    input: await assembleRunInput(opts.appId, baseInput),
  });

  const run = await claimNextRun();
  if (!run) return null;
  await runGarvisTask(run, { model: brainModel, onEvent: opts.onEvent });

  const { data } = await supabase.from('agent_runs').select('*').eq('id', run.id).maybeSingle();
  return (data as AgentRun) ?? null;
}

/**
 * Run Garvis in `act` mode — the execute half of the loop. Here the brain can use the write/capability
 * tools (log_decision, record_outcome, generate_short_script, update_app, enqueue_run). Knowledge writes
 * land as PROPOSALS awaiting approval; capabilities (script) produce drafts. Approved knowledge is
 * injected into the run's context so acting is informed by what's been learned.
 */
export async function runGarvisAct(
  opts: { title: string; input: string; appId?: string | null; budgetUsd?: number; onEvent?: (e: RuntimeEvent) => void },
): Promise<AgentRun | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('runGarvisAct requires an authenticated user.');

  await supabase.from('agent_runs').insert({
    owner_id: userId,
    app_id: opts.appId ?? null,
    kind: 'content',
    title: opts.title,
    status: 'queued',
    phase: 'act',
    budget_usd: opts.budgetUsd ?? 0.5,
    input: await assembleRunInput(opts.appId, opts.input),
  });

  const run = await claimNextRun();
  if (!run) return null;
  await runGarvisTask(run, { model: brainModel, onEvent: opts.onEvent });

  const { data } = await supabase.from('agent_runs').select('*').eq('id', run.id).maybeSingle();
  return (data as AgentRun) ?? null;
}
