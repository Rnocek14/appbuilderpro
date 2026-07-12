// src/lib/garvis/goals.ts
// THE GOALS CORE — pure (no Supabase, no DOM; verified by goals.verify.ts).
//
// "It has to adapt all functions toward project goals." This is that adaptation, done honestly:
// a goal is the OWNER'S OWN statement of what a world is for. This module turns goals + real
// measured facts into (1) honest progress (never a percentage without a real numerator AND
// denominator), (2) a deterministic Next-Move focus boost (moves that advance an active goal
// rank higher, with the goal named in the why), and (3) prompt context lines for the brains and
// producers (always labeled owner-stated vs measured).
//
// No-Theater rules: progress basis is 'measured' ONLY from this account's rows; 'manual' when the
// owner typed the number (and it says so); a goal with no metric is "directional — not measured",
// never a fake meter.

import type { NextMove } from './nextMove';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoalMetric = 'leads' | 'visits' | 'manual' | 'none';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'dropped';

export interface WorldGoal {
  id: string;
  world_id: string;
  title: string;
  why: string;
  metric_kind: GoalMetric;
  target_value: number | null;
  current_manual: number | null;
  target_date: string | null;   // ISO date
  status: GoalStatus;
  created_at: string;
}

/** Real counts measured from the account's own rows since the goal was set.
 *  null = that signal is not instrumented for this world (an honest state, shown as such). */
export interface GoalFacts {
  leads: number | null;
  visits: number | null;
}

export interface GoalProgress {
  measurable: boolean;
  current: number | null;
  target: number | null;
  pct: number | null;                          // 0–100, only when both sides are real
  basis: 'measured' | 'manual' | 'none';
  note: string;                                // one honest line for the UI
}

// ---------------------------------------------------------------------------
// 1) Honest progress
// ---------------------------------------------------------------------------

export function goalProgress(goal: WorldGoal, facts: GoalFacts): GoalProgress {
  if (goal.metric_kind === 'none') {
    return { measurable: false, current: null, target: null, pct: null, basis: 'none', note: 'Directional — not measured. Add a metric to track it.' };
  }
  if (goal.metric_kind === 'manual') {
    const current = goal.current_manual;
    const target = goal.target_value;
    if (current == null) {
      return { measurable: false, current: null, target, pct: null, basis: 'manual', note: 'You track this one — log your progress to see it here.' };
    }
    const pct = target && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;
    return { measurable: true, current, target, pct, basis: 'manual', note: `${current}${target ? ` of ${target}` : ''} — your own count.` };
  }
  // measured metrics: leads | visits
  const current = goal.metric_kind === 'leads' ? facts.leads : facts.visits;
  const target = goal.target_value;
  if (current == null) {
    return { measurable: false, current: null, target, pct: null, basis: 'none', note: 'Not instrumented yet — build/rebuild the site to wire reporting.' };
  }
  const pct = target && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;
  return {
    measurable: true, current, target, pct, basis: 'measured',
    note: `${current} ${goal.metric_kind}${target ? ` of ${target}` : ''} since the goal was set — measured, not guessed.`,
  };
}

// ---------------------------------------------------------------------------
// 2) Next-Move focus — deterministic, named, never silent
// ---------------------------------------------------------------------------

const GOAL_FOCUS_BOOST = 15;       // a move in a goal-world outranks an equal move elsewhere
const GOAL_DEADLINE_BOOST = 10;    // …more so inside the deadline window
const DEADLINE_WINDOW_MS = 14 * 24 * 3_600_000;

/** The world a move points at, parsed from its route (moves don't carry worldId directly). */
export function worldIdFromRoute(route: string): string | null {
  const m = /\/garvis\/(?:webs|system)\/([0-9a-f-]{36})/i.exec(route);
  return m ? m[1] : null;
}

/** Re-score ranked moves toward ACTIVE goals: a move that advances a goal-world gains a
 *  deterministic boost and names the goal in its why. Order is re-derived from the new scores.
 *  Pure and stable: same inputs → same output. */
export function applyGoalFocus(moves: NextMove[], goals: WorldGoal[], now: Date): NextMove[] {
  const active = goals.filter((g) => g.status === 'active');
  if (!active.length) return moves;
  const byWorld = new Map<string, WorldGoal>();
  for (const g of active) if (!byWorld.has(g.world_id)) byWorld.set(g.world_id, g);

  return moves
    .map((m) => {
      const worldId = worldIdFromRoute(m.action.route);
      const goal = worldId ? byWorld.get(worldId) : undefined;
      if (!goal) return m;
      const deadlineSoon = !!goal.target_date &&
        new Date(goal.target_date).getTime() - now.getTime() <= DEADLINE_WINDOW_MS &&
        new Date(goal.target_date).getTime() >= now.getTime();
      const boost = GOAL_FOCUS_BOOST + (deadlineSoon ? GOAL_DEADLINE_BOOST : 0);
      const deadlineNote = deadlineSoon ? ` (due ${goal.target_date})` : '';
      return {
        ...m,
        score: m.score + boost,
        why: `${m.why} Advances your goal “${goal.title.slice(0, 60)}”${deadlineNote}.`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 3) Prompt context — labeled, budgeted, honest
// ---------------------------------------------------------------------------

/** One prompt-ready line for a world's active goal ('' when none). Labeled owner-stated; progress
 *  appears only with a real basis. Used by producers, Ask, and the studio brains. */
export function goalContextLine(goal: WorldGoal | null, progress?: GoalProgress | null): string {
  if (!goal || goal.status !== 'active') return '';
  const parts = [`GOAL for this world (owner-stated): ${goal.title.trim()}`];
  if (goal.why.trim()) parts.push(`Why: ${goal.why.trim()}`);
  if (goal.target_date) parts.push(`Target date: ${goal.target_date}`);
  if (progress?.measurable && progress.current != null) {
    parts.push(`Progress: ${progress.current}${progress.target ? ` of ${progress.target}` : ''} (${progress.basis}).`);
  }
  parts.push('Aim every recommendation and produced asset at this goal.');
  return parts.join(' ');
}
