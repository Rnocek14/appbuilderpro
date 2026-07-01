// src/lib/garvis/triage.ts
// Pure, supabase-free helpers for Garvis portfolio TRIAGE — the "what should I stop doing" reasoning.
// A single structured pass (no agent loop, no new table) that reads what Garvis already knows and
// returns a keep/reconsider/archive verdict per app + the one app to focus on. The orchestration
// (gather data → rawComplete → log) lives in useTriage; this module owns the prompt, the tolerant
// parse, and the grouping so they're unit-testable.

import type { LivenessClass } from './liveness';
import type { StrategicImportance } from '../../types';

export type Verdict = 'keep' | 'reconsider' | 'archive';
const VERDICTS = new Set<Verdict>(['keep', 'reconsider', 'archive']);
const IMPORTANCES = new Set<StrategicImportance>(['core', 'supporting', 'experimental']);

export interface TriageVerdict {
  appId: string;
  verdict: Verdict;
  reason: string;
  confidence: number | null;
  suggestedImportance?: StrategicImportance | null; // proposed only when the app's importance is unset
  guarded?: boolean; // true when the strategic guard overrode the model's verdict
}

export interface TriageReport {
  summary: string;
  focusAppId: string | null;
  verdicts: TriageVerdict[];
}

/** One app's evidence, assembled from the app row + its profile + its latest liveness. */
export interface TriageAppInput {
  id: string;
  name: string;
  stage: string;
  deployUrl: string | null;
  monthlyRevenue: number;
  lastActivity: string | null; // app.updated_at (or repo push, when available)
  liveness: LivenessClass;
  importance?: StrategicImportance | null; // owner's strategic judgment (null = unclassified)
  strategicRole?: string | null;
  profile?: { purpose?: string | null; current_state?: string | null; blocker?: string | null; next_milestone?: string | null } | null;
}

export interface TriageInput {
  apps: TriageAppInput[];
  goals: string[]; // active goal titles (+ metric), for goal-aware triage
}

export const TRIAGE_SYSTEM = `You are Garvis acting as a ruthless-but-fair Chief of Staff doing PORTFOLIO TRIAGE for a solo founder.

You must weigh TWO lenses — not one:
- OPERATIONAL lens (what the data shows): deployment, reachability/liveness, recent activity, revenue.
- STRATEGIC lens (what the founder has DECLARED matters): each app may carry a strategic_importance
  (core | supporting | experimental) and a strategic_role note. These are the founder's JUDGMENT and they
  OUTRANK the operational signals.

The operational lens alone is misleading: a core platform component or a dormant strategic asset can be
quiet, undeployed, and revenue-free yet be the most important thing in the portfolio. Never recommend
archiving something strategically important just because it looks operationally idle. That mistake — killing
the foundation because it isn't shipping today — is exactly what you exist to prevent.

HARD RULES (do not violate):
- strategic_importance = "core": verdict MUST be "keep". Never "archive" or "reconsider" it.
- strategic_importance = "supporting": never "archive". "keep" if there's any path; otherwise "reconsider".
- strategic_importance = "experimental" or UNSET: judge primarily on the operational lens.
- When an app's importance is UNSET, you MAY propose one in "suggested_importance" (core|supporting|
  experimental) from its purpose/role — but that is a SUGGESTION for the founder, never a fact you act on.

For each app return: a verdict, a one-sentence grounded reason, confidence (0..1), and — only when importance
is unset — a suggested_importance. Then name the SINGLE focus app (focus_app_id): the best return on the
founder's next block of hours, weighed against active goals and strategic importance.

CALIBRATION:
- Ground every verdict in the evidence given. Do not invent activity or traction. If evidence is thin and
  no strategic importance is set, prefer "reconsider" over a confident wrong call.
- A learning project that has served its purpose (and isn't strategically important) is an archive, not a
  failure — frame it that way. Be decisive: triage means fewer things, not a balanced survey.

OUTPUT: respond with EXACTLY ONE JSON object and nothing else (no prose, no markdown fences):
{
  "summary": "2-3 sentences: the shape of the portfolio and the single most important move",
  "focus_app_id": "<id of the one app to focus on, or null>",
  "verdicts": [
    { "app_id": "<id>", "verdict": "keep|archive|reconsider", "reason": "one sentence, grounded", "confidence": 0.0, "suggested_importance": "core|supporting|experimental|null" }
  ]
}`;

function fmtApp(a: TriageAppInput): string {
  const p = a.profile;
  return [
    `- id: ${a.id}`,
    `  name: ${a.name}`,
    `  STRATEGIC IMPORTANCE: ${a.importance ?? 'UNSET'}`,
    a.strategicRole ? `  strategic role: ${a.strategicRole}` : '',
    `  stage (stored): ${a.stage}`,
    `  deployed: ${a.deployUrl ? a.deployUrl : 'no'}`,
    `  liveness: ${a.liveness}`,
    `  monthly revenue: $${a.monthlyRevenue}`,
    `  last activity: ${a.lastActivity ? a.lastActivity.slice(0, 10) : 'unknown'}`,
    p?.purpose ? `  purpose: ${p.purpose}` : '',
    p?.current_state ? `  state: ${p.current_state}` : '',
    p?.blocker ? `  blocker: ${p.blocker}` : '',
    p?.next_milestone ? `  next milestone: ${p.next_milestone}` : '',
  ].filter(Boolean).join('\n');
}

export function buildTriageUser(input: TriageInput): string {
  const goals = input.goals.length
    ? `ACTIVE GOALS (weigh focus against these):\n${input.goals.map((g) => `- ${g}`).join('\n')}`
    : 'ACTIVE GOALS: none set — judge on signs of life and momentum.';
  return [
    goals,
    '',
    `PORTFOLIO (${input.apps.length} apps):`,
    input.apps.map(fmtApp).join('\n'),
    '',
    'Return the single JSON triage object now.',
  ].join('\n');
}

function clampConf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
}

/** Tolerant JSON extract + normalize. Never throws — unknown verdicts/ids are dropped, not guessed. */
export function parseTriageResponse(rawText: string, knownAppIds?: Set<string>): TriageReport {
  let obj: Record<string, unknown> = {};
  try {
    const clean = rawText.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) obj = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    /* fall through to empty report */
  }
  const rawVerdicts = Array.isArray(obj.verdicts) ? (obj.verdicts as Record<string, unknown>[]) : [];
  const verdicts: TriageVerdict[] = [];
  for (const v of rawVerdicts) {
    const appId = typeof v.app_id === 'string' ? v.app_id : '';
    const verdict = v.verdict as Verdict;
    if (!appId || !VERDICTS.has(verdict)) continue;
    if (knownAppIds && !knownAppIds.has(appId)) continue; // ignore hallucinated ids
    const sugg = v.suggested_importance;
    verdicts.push({
      appId,
      verdict,
      reason: typeof v.reason === 'string' ? v.reason : '',
      confidence: clampConf(v.confidence),
      suggestedImportance: typeof sugg === 'string' && IMPORTANCES.has(sugg as StrategicImportance) ? (sugg as StrategicImportance) : null,
    });
  }
  let focusAppId = typeof obj.focus_app_id === 'string' ? obj.focus_app_id : null;
  if (focusAppId && knownAppIds && !knownAppIds.has(focusAppId)) focusAppId = null;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    focusAppId,
    verdicts,
  };
}

/**
 * The strategic guard — defense-in-depth in CODE, not just the prompt. Even if the model ignores the
 * hard rules, a 'core' app can never be archived/reconsidered and a 'supporting' app can never be
 * archived. Overridden verdicts are flagged `guarded` so the UI can show the override happened.
 */
export function applyStrategicGuard(
  verdicts: TriageVerdict[],
  importanceByApp: Record<string, StrategicImportance | null | undefined>,
): TriageVerdict[] {
  return verdicts.map((v) => {
    const imp = importanceByApp[v.appId];
    if (imp === 'core' && v.verdict !== 'keep') return { ...v, verdict: 'keep', guarded: true };
    if (imp === 'supporting' && v.verdict === 'archive') return { ...v, verdict: 'reconsider', guarded: true };
    return v;
  });
}

/** Group verdicts for display, preserving input order within each bucket. */
export function groupVerdicts(verdicts: TriageVerdict[]): Record<Verdict, TriageVerdict[]> {
  const out: Record<Verdict, TriageVerdict[]> = { keep: [], reconsider: [], archive: [] };
  for (const v of verdicts) out[v.verdict].push(v);
  return out;
}
