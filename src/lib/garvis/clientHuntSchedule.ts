// src/lib/garvis/clientHuntSchedule.ts
// The PURE brain of an AUTOMATIC daily client-hunt (no network; verified by clientHuntSchedule.verify.ts).
// A standing order runs this each day: it slices the campaign's geography with a rolling CURSOR so every
// day sweeps NEW markets (and wraps around the country), and it bounds how much the day may spend
// (cities searched + demos built) so an autonomous machine can never run away. The impure daily worker
// executes the plan; sending still waits for the owner's approval (the clock owns work, not the trigger out).

// .ts extensions: this module is also imported by the standing-worker EDGE function (Deno), whose
// strict resolver requires explicit extensions. The leaf modules import only types, so Deno is happy.
import { citiesFor, type SweepScope, type UsCity } from './usCities.ts';
import { sweepPlan, type SweepQuery } from './nationalSweepCore.ts';

/** The standing-order kind for a daily automatic hunt (added to the clock's OrderKind vocabulary). */
export const CLIENT_HUNT_KIND = 'client_hunt' as const;

export interface HuntConfig {
  niche: string;
  scope: SweepScope;
  citiesPerDay: number;   // how many cities to search per day (each = one Google search)
  demoQuota: number;      // max demos to auto-build per day (the expensive step — hard daily cap)
}

export interface DailyHunt {
  queries: SweepQuery[];  // the per-city searches to run today
  nextCursor: number;     // where tomorrow's slice starts (persisted on the order)
  wrapped: boolean;       // true when today's slice rolled past the end back to the start
}

const clampInt = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = typeof n === 'number' && isFinite(n) ? Math.floor(n) : dflt;
  return Math.max(lo, Math.min(v, hi));
};

/** Tolerant parse of a stored config (jsonb on the standing order) → a bounded HuntConfig, or null
 *  when it can't name a niche. Caps keep an autonomous order sane even if the row is edited by hand. */
export function parseHuntConfig(raw: unknown): HuntConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const niche = typeof r.niche === 'string' ? r.niche.trim() : '';
  if (!niche) return null;
  const scope = (r.scope && typeof r.scope === 'object' ? r.scope : { mode: 'topN', n: 50 }) as SweepScope;
  return {
    niche,
    scope,
    citiesPerDay: clampInt(r.citiesPerDay, 1, 40, 10),   // ≤40 searches/day
    demoQuota: clampInt(r.demoQuota, 1, 25, 5),          // ≤25 demos/day (real credit cost)
  };
}

/** Today's slice of the campaign: `citiesPerDay` cities starting at `cursor`, wrapping around the
 *  scope's city list so a daily order keeps finding FRESH markets instead of re-sweeping the same
 *  ones. Returns the queries to run and the cursor to store for tomorrow. */
export function plannedHuntToday(config: HuntConfig, cursor: number): DailyHunt {
  const cities = citiesFor(config.scope);
  if (!cities.length) return { queries: [], nextCursor: 0, wrapped: false };
  const per = Math.max(1, Math.min(config.citiesPerDay, cities.length));
  const start = ((Math.floor(cursor) % cities.length) + cities.length) % cities.length;
  const slice: UsCity[] = [];
  let wrapped = false;
  for (let k = 0; k < per; k++) {
    const idx = start + k;
    if (idx >= cities.length) wrapped = true;
    slice.push(cities[idx % cities.length]);
  }
  return { queries: sweepPlan(config.niche, slice, per), nextCursor: (start + per) % cities.length, wrapped };
}

/** A human line describing the standing order for the panel + the audit trail. */
export function huntSummary(config: HuntConfig): string {
  const where = config.scope.mode === 'topN' ? `the top ${config.scope.n} US markets`
    : config.scope.mode === 'state' ? config.scope.state
    : `the ${config.scope.region}`;
  return `Every day: sweep ${config.citiesPerDay} new ${where.startsWith('the') ? '' : 'city in '}${where} for "${config.niche}", build up to ${config.demoQuota} demos + pitches, and queue them for your approval. Nothing sends on its own.`;
}
