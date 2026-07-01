// src/lib/garvis/followup.ts
// Pure helpers for the Garvis follow-through loop — the return arc that closes the cycle: a
// recommendation you accepted becomes an active goal (a COMMITMENT); follow-up revisits each open
// commitment, weighs elapsed time against an observed progress signal, and asks "did it happen?".
//
// No new table — "open loops" are derived from active goals + run history (compute-not-store). This
// module owns the staleness logic, the deterministic check-in line, and the brain digest so they're
// unit-testable; the signal-gathering (GitHub/liveness) lives in useFollowup.

import type { GarvisGoal } from '../../types';
import type { LivenessClass } from './liveness';

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 7;

/** Observed progress on a commitment since it opened. Any field may be null if unmeasurable. */
export interface LoopSignal {
  commitsSince: number | null; // commits to the app's repo since the goal opened
  liveness: LivenessClass;
}

/** An open commitment (an active goal) plus how it's tracking. */
export interface OpenLoop {
  goalId: string;
  title: string;
  appId: string | null;
  appName: string | null;
  priority: number;
  ageDays: number;
  targetDate: string | null;
  signal: LoopSignal | null;
  stale: boolean;
}

/** Whole days elapsed since an ISO timestamp. Injectable clock for tests. 0 on bad input. */
export function daysSince(iso: string | null | undefined, nowMs = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/**
 * A loop is stale when it's been open a while with NO observed progress. Progress = some commits since
 * it opened, OR the app is now reachable (shipped). Without a signal, an old loop is treated as stale
 * (we can't see progress, so it warrants a check-in). Fresh loops (< staleDays) are never stale.
 */
export function isLoopStale(ageDays: number, signal: LoopSignal | null, staleDays = STALE_DAYS): boolean {
  if (ageDays < staleDays) return false;
  if (!signal) return true;
  const progressed = (signal.commitsSince ?? 0) > 0 || signal.liveness === 'live';
  return !progressed;
}

/** The deterministic check-in line shown to the founder. No LLM needed — it's elapsed time + signal. */
export function buildCheckInLine(loop: OpenLoop): string {
  const head = `${loop.ageDays === 0 ? 'Today' : `${loop.ageDays} day${loop.ageDays === 1 ? '' : 's'} ago`} you committed: ${loop.title}.`;
  if (!loop.signal) return `${head} No progress signal available — what's the status?`;
  const parts: string[] = [];
  if (loop.signal.commitsSince != null) {
    parts.push(loop.signal.commitsSince === 0 ? 'no commits since' : `${loop.signal.commitsSince} commit${loop.signal.commitsSince === 1 ? '' : 's'} since`);
  }
  if (loop.signal.liveness === 'live') parts.push('now reachable');
  else if (loop.signal.liveness === 'down') parts.push('deploy unreachable');
  else if (loop.signal.liveness === 'not_deployed') parts.push('still not deployed');
  return parts.length ? `${head} Since then: ${parts.join(', ')}.` : head;
}

/**
 * The brain digest — DB-derivable only (age + active goals), no GitHub calls. Injected into
 * recommend/act so reasoning is accountability-aware: weigh follow-through before new work, and call
 * out commitments left open a long time. Returns '' when there are no active goals.
 */
export function buildOpenLoopsDigest(activeGoals: GarvisGoal[], appNameById?: Record<string, string>, nowMs = Date.now()): string {
  const active = activeGoals.filter((g) => g.status === 'active');
  if (active.length === 0) return '';
  const lines = active
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((g) => {
      const age = daysSince(g.created_at, nowMs);
      const where = g.app_id ? ` (${appNameById?.[g.app_id] ?? 'app'})` : '';
      const old = age >= STALE_DAYS ? ', LONG-OPEN — check follow-through' : '';
      return `- [P${g.priority}, open ${age}d${old}]${where} ${g.title}`;
    });
  return `OPEN COMMITMENTS (active goals the founder has accepted — weigh follow-through before recommending NEW work; flag any left open a long time with no progress):\n${lines.join('\n')}`;
}
