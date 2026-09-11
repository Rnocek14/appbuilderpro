// src/lib/garvis/huntTick.ts
// THE HUNT'S CLOCK MATH — pure (verified by huntTick.verify.ts). Deno-safe: no imports beyond
// types, so the standing-worker consumes it directly.
//
// Why this exists: the daily client hunt used to run ONCE per day inside one edge-function
// invocation with a 90-second budget. A bespoke demo (five model calls, three scrapes, two
// screenshots) takes most of that window, so the real throughput was ~1 demo/day regardless of
// the operator's quota. This core turns the day's quota into a BUDGET the order spends across the
// 15-minute standing ticks: a slice of searches and at most ONE demo per tick, until the day's
// numbers are met, then it sleeps until the next cadence. Same quota, ~96 chances a day to meet it.
//
// The day state rides in the order's config (`dayState`) so it survives across invocations and
// is visible to the operator ("today: 3 of 5 demos, 12 of 20 searches").

export interface HuntDayState {
  day: string;          // the budget period this state belongs to (the caller's key — by default the
                        // UTC date; the worker passes the order's cadence boundary) — a new period resets every counter
  searches: number;     // discovery searches spent today
  demos: number;        // demos BUILT today (only real builds count against the quota)
  checks: number;       // cheap email pre-checks spent today (never gated; informational)
  discovered: number;   // businesses inserted today
  queued: number;       // pitches queued for approval (or auto-sent) today
  noEmail: number;      // leads set aside today because no public email could be found
  poolEmpty: boolean;   // the last tick found nothing left to build — sleep until new discovery
}

/** Per-tick slices. One demo per tick keeps every invocation short enough to finish inside the
 *  platform's wall clock; searches are cheap and spread so the pool refills while demos build. */
export const DEMOS_PER_TICK = 1;
export const SEARCHES_PER_TICK = 4;
/** How many leads a tick may pre-check for an email before building (each check is one fetch). */
export const EMAIL_CHECKS_PER_TICK = 8;

export function dayKey(nowIso: string): string {
  return nowIso.slice(0, 10);
}

function nonNeg(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Read the persisted day state; a missing/malformed/stale (different period) state is a fresh
 *  period. `periodKey` names the budget window — pass the order's cadence boundary so a daily order
 *  anchored at 20:00 does not get a second quota at UTC midnight; it defaults to the UTC date. */
export function dayStateFor(raw: unknown, nowIso: string, periodKey: string = dayKey(nowIso)): HuntDayState {
  const fresh: HuntDayState = {
    day: periodKey, searches: 0, demos: 0, checks: 0, discovered: 0, queued: 0, noEmail: 0, poolEmpty: false,
  };
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Record<string, unknown>;
  if (r.day !== fresh.day) return fresh;
  return {
    day: fresh.day,
    searches: nonNeg(r.searches), demos: nonNeg(r.demos), checks: nonNeg(r.checks),
    discovered: nonNeg(r.discovered), queued: nonNeg(r.queued), noEmail: nonNeg(r.noEmail),
    poolEmpty: r.poolEmpty === true,
  };
}

export interface TickPlan {
  searches: number;   // searches to run this tick
  demos: number;      // demos to build this tick (0 or 1)
  checks: number;     // email pre-checks allowed this tick
  /** Nothing left to spend today — the caller should sleep the order until the next cadence. */
  dayDone: boolean;
}

/** What THIS tick may spend, given the day's quota and what's already been spent. */
export function planTick(cfg: { searchesPerDay: number; demoQuota: number }, state: HuntDayState): TickPlan {
  const searchesLeft = Math.max(0, cfg.searchesPerDay - state.searches);
  const demosLeft = Math.max(0, cfg.demoQuota - state.demos);
  const searches = Math.min(searchesLeft, SEARCHES_PER_TICK);
  // An empty pool with no searches left cannot produce a demo — the day is done. With searches
  // left, this tick's discovery may refill the pool, so the demo slot stays open.
  const demos = demosLeft > 0 && !(state.poolEmpty && searchesLeft === 0) ? Math.min(demosLeft, DEMOS_PER_TICK) : 0;
  const checks = demos > 0 ? EMAIL_CHECKS_PER_TICK : 0;
  const dayDone = searches === 0 && demos === 0;
  return { searches, demos, checks, dayDone };
}

export interface TickResult {
  searches?: number; demos?: number; checks?: number; discovered?: number; queued?: number; noEmail?: number;
  poolEmpty?: boolean;
}

/** Fold a tick's actuals into the day state. Counters only ever grow within a day. */
export function advanceDay(state: HuntDayState, r: TickResult): HuntDayState {
  return {
    ...state,
    searches: state.searches + nonNeg(r.searches),
    demos: state.demos + nonNeg(r.demos),
    checks: state.checks + nonNeg(r.checks),
    discovered: state.discovered + nonNeg(r.discovered),
    queued: state.queued + nonNeg(r.queued),
    noEmail: state.noEmail + nonNeg(r.noEmail),
    // A refilled pool (discovery inserted rows) clears the empty flag; otherwise carry the tick's read.
    poolEmpty: nonNeg(r.discovered) > 0 ? false : (r.poolEmpty ?? state.poolEmpty),
  };
}

/** When the order runs next: as soon as the next tick if the day still has budget, otherwise the
 *  next cadence boundary (the caller passes nextRunAfter's answer). */
export function nextHuntRunIso(cfg: { searchesPerDay: number; demoQuota: number }, state: HuntDayState, nowIso: string, cadenceNextIso: string): string {
  return planTick(cfg, state).dayDone ? cadenceNextIso : nowIso;
}

/** True when this tick closed the day's books (so the day summary is written exactly once). */
export function dayJustFinished(cfg: { searchesPerDay: number; demoQuota: number }, before: HuntDayState, after: HuntDayState): boolean {
  return !planTick(cfg, before).dayDone && planTick(cfg, after).dayDone;
}

/** The honest one-line day summary. Never claims a send: pitches wait for approval unless the
 *  operator granted cold-pitch autonomy, and that path reports itself. */
export function huntDayLine(label: string, s: HuntDayState, cfg: { demoQuota: number }): string {
  const parts: string[] = [];
  parts.push(`found ${s.discovered} new business${s.discovered === 1 ? '' : 'es'}`);
  if (s.demos > 0) {
    const pitched = s.queued === 0
      ? 'none had a public email, so nothing was queued'
      : `${s.queued} ${s.queued === 1 ? 'pitch is' : 'pitches are'} waiting for your approval`;
    parts.push(`built ${s.demos} of ${cfg.demoQuota} demo${cfg.demoQuota === 1 ? '' : 's'} — ${pitched}`);
  } else if (s.poolEmpty) {
    parts.push('no buildable prospects were left (every lead with a website was already worked)');
  } else {
    parts.push('built no demos');
  }
  if (s.noEmail > 0) parts.push(`${s.noEmail} set aside with no public email (phone or postcard only)`);
  return `${label}: ${parts.join('; ')}. Nothing sent on its own.`;
}

/** The operator-facing progress line for the Win Clients card ("today: 3/5 demos · 12/20 searches"). */
export function huntProgressLine(s: HuntDayState | null | undefined, cfg: { searchesPerDay: number; demoQuota: number }): string {
  if (!s) return `today: 0/${cfg.demoQuota} demos · 0/${cfg.searchesPerDay} searches`;
  return `today: ${Math.min(s.demos, cfg.demoQuota)}/${cfg.demoQuota} demos · ${Math.min(s.searches, cfg.searchesPerDay)}/${cfg.searchesPerDay} searches`
    + (s.queued > 0 ? ` · ${s.queued} pitch${s.queued === 1 ? '' : 'es'} queued` : '');
}
