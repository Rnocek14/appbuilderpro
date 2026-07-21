// src/lib/garvis/orchestrator.ts
// THE ORCHESTRATOR (pure core) — the organ that turns ANY spoken intent into a composed,
// reviewable plan over the system's real capabilities, so "do Jane's marketing" or "found the
// company and set up the watches" becomes one approved card that populates everything.
//
// This is the difference between capability and agency: the machinery (genesis, plans, campaigns,
// standing orders, the builder) already exists — what never existed is the layer that maps an
// arbitrary sentence onto ALL of it and composes the steps. Same architecture religion as genesis:
//   - The model composes ONLY from a fixed, executable action catalog (the registry) — a step
//     naming an unknown action is DROPPED by the parse gauntlet, never improvised.
//   - HONESTY HOLES are first-class: what the intent asks for that no action covers goes in
//     `holes` (visible amber in the review card), never faked as a step. Missing info becomes
//     `questions`, never invented params.
//   - Nothing executes until the operator approves the whole plan; outbound/spend steps STILL go
//     through their own approval spine downstream — plan approval is structural consent, not
//     send consent.
//
// Pure: no DB, no network. The impure half (compile via cluster-chat, execute via the registry)
// lives in orchestratorRun.ts / actionRegistry.ts. Verified by orchestrator.verify.ts.

export type ActionCategory = 'company' | 'planning' | 'marketing' | 'automation' | 'app' | 'setup';
/** safe = creates internal drafts/records · spend = burns model credits · outbound = can lead to sends (still approval-gated downstream) */
export type RiskClass = 'safe' | 'spend' | 'outbound';

export interface ActionParamSpec { name: string; required: boolean; hint: string }

/** The describable half of a registry action — what the compiler prompt sees. */
export interface ActionSpec {
  id: string;
  title: string;
  category: ActionCategory;
  risk: RiskClass;
  /** What it does and when to reach for it — written for the model. */
  description: string;
  params: ActionParamSpec[];
  /** What EXISTS after it runs — outcome language, not promise language. */
  produces: string;
}

export interface PlanStep {
  action: string;
  params: Record<string, string>;
  /** Per-step rationale — required, like genesis's per-area rationale. */
  why: string;
  /** Indexes (0-based, into the steps array) that must complete first. */
  after: number[];
}

export interface CompiledPlan {
  title: string;
  /** The model's 2-3 sentence read of the intent — the operator checks understanding here first. */
  summary: string;
  steps: PlanStep[];
  /** What the intent asked for that NO catalog action covers. Honesty, rendered amber. */
  holes: string[];
  /** What the plan needs from the operator that the intent didn't say. */
  questions: string[];
}

export interface ParsePlanResult {
  plan: CompiledPlan | null;
  /** Fatal: nothing usable came back. */
  problems: string[];
  /** Non-fatal: steps dropped/coerced — shown so the gauntlet is never silent. */
  warnings: string[];
}

export const MAX_STEPS = 12;
const MIN_WHY = 12;

/** Render the catalog for the compiler prompt — one block per action, params spelled out. */
export function catalogContext(specs: ActionSpec[]): string {
  const byCat = new Map<string, ActionSpec[]>();
  for (const s of specs) {
    const list = byCat.get(s.category) ?? [];
    list.push(s);
    byCat.set(s.category, list);
  }
  const blocks: string[] = ['ACTION CATALOG (the ONLY actions that exist — never invent others):'];
  for (const [cat, list] of byCat) {
    blocks.push(`\n[${cat.toUpperCase()}]`);
    for (const s of list) {
      const params = s.params.length
        ? s.params.map((p) => `${p.name}${p.required ? ' (required)' : ''} — ${p.hint}`).join('; ')
        : 'none';
      blocks.push(`- ${s.id} · ${s.title} · risk:${s.risk}\n  ${s.description}\n  params: ${params}\n  produces: ${s.produces}`);
    }
  }
  return blocks.join('\n');
}

export const COMPILER_SYSTEM = `You are the ORCHESTRATOR of a single-operator business operating system. The operator
speaks one intent — often a whole venture — and you compile it into an ordered plan of concrete steps drawn ONLY
from the ACTION CATALOG provided as context.

When a SITUATION block is provided, plan from it: reference existing businesses by their EXACT titles (never
invent or re-found one that already exists), do not duplicate work an existing arc is already doing or waiting
to finish, and prefer steps that advance what is actually in flight.

Return STRICT JSON only (no fences, no preamble):
{"title":"<=60 chars naming the plan",
 "summary":"2-3 sentences: your read of what the operator wants — they verify understanding here",
 "steps":[{"action":"<catalog id>","params":{"<name>":"<value>"},"why":"one sentence: why this step serves THIS intent","after":[<0-based indexes of prerequisite steps>]}],
 "holes":["anything the intent asks for that NO catalog action can do — name it plainly"],
 "questions":["anything you need from the operator that the intent didn't say — instead of inventing it"]}

HARD RULES:
- Compose ONLY from catalog action ids. A capability the catalog lacks goes in "holes" — NEVER fake a step for it.
- Every step carries a real "why" tied to this intent, not a restatement of the action's description.
- Use ONLY the listed param names. A required param you cannot fill from the intent → put what you need in
  "questions" and OMIT that step (never invent names, URLs, subjects, or worlds).
- Order with "after": company founding before anything that needs the company; plans before campaigns that use them.
- At most ${MAX_STEPS} steps. Fewer, well-chosen steps beat padding. Do not add steps the intent didn't ask for and
  doesn't clearly need — recommendations belong in "summary" phrasing, not surprise steps.
- risk:spend steps cost model credits and risk:outbound steps can lead to real sends (each still individually
  approval-gated later) — include them only when the intent genuinely calls for them.
- If the intent is a question or too thin to act on, return steps:[] with your read in "summary" and what you'd
  need in "questions".`;

/** Strip markdown fences defensively (same discipline as every other parser here). */
function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```[a-z]*\n?([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1].trim() : t;
}

/**
 * The parse gauntlet — the model proposes, this validates. Unknown actions and why-less steps are
 * DROPPED (with visible warnings), unknown params are stripped, missing required params demote the
 * step to a question, `after` references are cleaned, and cycles fall back to array order.
 */
export function parsePlan(raw: string, specs: ActionSpec[]): ParsePlanResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  let obj: unknown;
  try { obj = JSON.parse(stripFences(raw)); } catch {
    return { plan: null, problems: ['The compiler returned unparseable output — try rephrasing the intent.'], warnings };
  }
  const o = (obj ?? {}) as Record<string, unknown>;
  const specById = new Map(specs.map((s) => [s.id, s]));

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 60) : 'Compiled plan';
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  if (!summary) problems.push('The plan came back without a summary — nothing to verify understanding against.');

  const holes = Array.isArray(o.holes) ? o.holes.filter((h): h is string => typeof h === 'string' && !!h.trim()).map((h) => h.trim()) : [];
  const questions = Array.isArray(o.questions) ? o.questions.filter((q): q is string => typeof q === 'string' && !!q.trim()).map((q) => q.trim()) : [];

  const rawSteps = Array.isArray(o.steps) ? o.steps : [];
  if (rawSteps.length > MAX_STEPS) warnings.push(`Plan had ${rawSteps.length} steps — trimmed to the first ${MAX_STEPS}.`);

  // First pass: validate each step standalone; remember the original index of every survivor so
  // `after` references can be remapped after drops.
  const survivors: { step: PlanStep; origIndex: number }[] = [];
  rawSteps.slice(0, MAX_STEPS).forEach((s, i) => {
    const st = (s ?? {}) as Record<string, unknown>;
    const actionId = typeof st.action === 'string' ? st.action.trim() : '';
    const spec = specById.get(actionId);
    if (!spec) { warnings.push(`Dropped step ${i + 1}: "${actionId || '(no action)'}" is not in the catalog.`); return; }
    const why = typeof st.why === 'string' ? st.why.trim() : '';
    if (why.length < MIN_WHY) { warnings.push(`Dropped ${spec.title}: no real rationale for it in this plan.`); return; }

    const rawParams = (st.params ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = {};
    const known = new Set(spec.params.map((p) => p.name));
    for (const [k, v] of Object.entries(rawParams)) {
      if (!known.has(k)) { warnings.push(`${spec.title}: dropped unknown param "${k}".`); continue; }
      if (typeof v === 'string' && v.trim()) params[k] = v.trim();
    }
    const missing = spec.params.filter((p) => p.required && !params[p.name]).map((p) => p.name);
    if (missing.length) {
      questions.push(`${spec.title}: needs ${missing.join(', ')} — say it and re-compile.`);
      warnings.push(`Dropped ${spec.title}: required param(s) ${missing.join(', ')} not derivable from the intent.`);
      return;
    }
    const after = Array.isArray(st.after) ? st.after.filter((x): x is number => Number.isInteger(x) && x >= 0) : [];
    survivors.push({ step: { action: actionId, params, why, after }, origIndex: i });
  });

  // Second pass: a survivor that depended on a DROPPED step must not silently run without its
  // prerequisite — cascade the drop, transitively. (References to indexes that never existed are
  // model noise and are simply removed below, as before.)
  const droppedIdx = new Set<number>();
  rawSteps.slice(0, MAX_STEPS).forEach((_, i) => { if (!survivors.some((s) => s.origIndex === i)) droppedIdx.add(i); });
  let remaining = survivors;
  let cascaded = true;
  while (cascaded) {
    cascaded = false;
    remaining = remaining.filter(({ step, origIndex }) => {
      if (step.after.some((a) => droppedIdx.has(a))) {
        warnings.push(`Dropped ${specById.get(step.action)?.title ?? step.action}: it depended on a step that was dropped.`);
        droppedIdx.add(origIndex);
        cascaded = true;
        return false;
      }
      return true;
    });
  }

  // Remap `after` from original indexes to survivor indexes; dangling references are dropped.
  const newIndex = new Map(remaining.map((s, idx) => [s.origIndex, idx]));
  const steps = remaining.map(({ step }) => ({
    ...step,
    after: step.after.map((a) => newIndex.get(a)).filter((a): a is number => a !== undefined),
  }));

  if (steps.length === 0 && holes.length === 0 && questions.length === 0) {
    problems.push('Nothing in the intent mapped to an available action — say more, or ask what the system can do.');
  }
  if (problems.length) return { plan: null, problems, warnings };
  return { plan: { title, summary, steps, holes, questions }, problems: [], warnings };
}

/**
 * Execution order: topological over `after`, stable by array position. A cycle (model error) falls
 * back to plain array order with a warning rather than refusing to run.
 */
export function orderSteps(steps: PlanStep[]): { order: number[]; cycleWarning: boolean } {
  const n = steps.length;
  const indeg = new Array(n).fill(0);
  const dependents: number[][] = Array.from({ length: n }, () => []);
  steps.forEach((s, i) => {
    for (const a of s.after) {
      if (a >= 0 && a < n && a !== i) { indeg[i]++; dependents[a].push(i); }
    }
  });
  const order: number[] = [];
  const ready: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
  while (ready.length) {
    const i = ready.shift()!;
    order.push(i);
    for (const d of dependents[i]) { if (--indeg[d] === 0) ready.push(d); }
  }
  if (order.length !== n) return { order: steps.map((_, i) => i), cycleWarning: true };
  return { order, cycleWarning: false };
}

// ---- execution status vocabulary (shared by the runner + review card) ----

export type StepStatusKind = 'pending' | 'running' | 'done' | 'needs_review' | 'handoff' | 'waiting' | 'failed' | 'skipped';

export interface StepStatus {
  kind: StepStatusKind;
  /** Outcome language — what exists / what happened, never what was promised. */
  note: string;
  /** Where to go next (review page, canvas, health) when the outcome has a home. */
  link?: string;
}

/** True when the status means "this step finished its part" (dependents may proceed). */
export function stepSucceeded(kind: StepStatusKind): boolean {
  return kind === 'done' || kind === 'needs_review' || kind === 'handoff';
}

/**
 * What a parked step is actually waiting FOR, in machine-checkable form. The standing-worker's
 * wake sweep re-checks these on the clock and flips the arc to 'ready' the moment the blocker
 * clears — the system notices instead of the operator remembering.
 *   world_exists — a business with (roughly) this title must exist (approve its draft)
 *   world_area   — the world exists but has no chartered areas yet (approving the draft creates them)
 *   world_named  — ambiguity only the operator can resolve (exact naming); never auto-cleared
 *   other        — humanly described in the message; never auto-cleared
 */
export interface WaitingOn {
  kind: 'world_exists' | 'world_area' | 'world_named' | 'other';
  title?: string;
  world_id?: string;
}

/**
 * A step blocked on something the OPERATOR must do first (approve a draft, link a world) — a
 * seam, not a failure. The durable runner parks the step 'waiting' and the arc resumes after the
 * prerequisite lands, instead of burying a retryable state as a terminal error.
 */
export class WaitingError extends Error {
  readonly waitingOn: WaitingOn;
  constructor(message: string, waitingOn?: WaitingOn) {
    super(message);
    this.name = 'WaitingError';
    this.waitingOn = waitingOn ?? { kind: 'other' };
  }
}

export type PlanRunState = 'running' | 'waiting' | 'done' | 'failed';

/**
 * The arc's overall state from its step statuses: any waiting → 'waiting' (resumable); else any
 * terminal failure/skip → 'failed' (honest: something in the arc will never finish); else all
 * succeeded → 'done'; else still 'running' (pending work remains, nothing blocks it).
 */
export function derivePlanStatus(statuses: StepStatus[]): PlanRunState {
  if (statuses.some((s) => s.kind === 'waiting')) return 'waiting';
  if (statuses.length && statuses.every((s) => stepSucceeded(s.kind))) return 'done';
  if (statuses.some((s) => s.kind === 'failed' || s.kind === 'skipped')) return 'failed';
  return 'running';
}

/** Compact progress counts for arc cards. */
export function planProgress(statuses: StepStatus[]): { succeeded: number; waiting: number; failed: number; total: number } {
  return {
    succeeded: statuses.filter((s) => stepSucceeded(s.kind)).length,
    waiting: statuses.filter((s) => s.kind === 'waiting').length,
    failed: statuses.filter((s) => s.kind === 'failed' || s.kind === 'skipped').length,
    total: statuses.length,
  };
}
