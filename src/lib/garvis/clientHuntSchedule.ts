// src/lib/garvis/clientHuntSchedule.ts
// The PURE brain of an AUTOMATIC daily client-hunt (no network; verified by clientHuntSchedule.verify.ts).
// A standing order runs this each day. Fully hands-off by default: with NO niche set it hunts EVERY
// kind of local business (the LOCAL_NICHES catalog) across the country, rolling a CURSOR over the
// whole (business-type × city) grid so each day sweeps FRESH combinations and wraps around forever.
// Typing a niche just narrows the catalog. It bounds the day's spend (searches + demos) so an
// autonomous machine can never run away. The impure daily worker executes the plan; sending still
// waits for the owner's approval (the clock owns the work, not the trigger out).

import { citiesFor, type SweepScope, type UsCity } from './usCities.ts';
import type { SweepQuery } from './nationalSweepCore.ts';

/** The standing-order kind for a daily automatic hunt (added to the clock's OrderKind vocabulary). */
export const CLIENT_HUNT_KIND = 'client_hunt' as const;

/** The local-business types agencies target: they exist in every town, commonly run weak/dated
 *  websites, and pay for leads. A hands-off hunt rotates through ALL of these — real business
 *  categories, not invented ones (the searches still return only real businesses). Search-phrased
 *  (each becomes "<type> <City, ST>"). */
export const LOCAL_NICHES: readonly string[] = [
  'roofers', 'plumbers', 'hvac contractors', 'electricians', 'landscapers', 'lawn care services',
  'painters', 'pressure washing services', 'house cleaning services', 'pest control companies',
  'tree service companies', 'fencing contractors', 'concrete contractors', 'garage door repair',
  'handyman services', 'remodeling contractors', 'flooring companies', 'window installers',
  'gutter installers', 'pool service companies', 'appliance repair', 'locksmiths',
  'moving companies', 'junk removal services', 'auto repair shops', 'auto detailing',
  'towing companies', 'dentists', 'chiropractors', 'med spas', 'dog groomers', 'veterinarians',
  'hair salons', 'barber shops', 'nail salons', 'massage therapists', 'personal trainers',
  'optometrists', 'law firms', 'accounting firms', 'insurance agencies', 'florists',
];

export interface HuntConfig {
  niches: string[];        // which business types to hunt — [] means the whole LOCAL_NICHES catalog
  scope: SweepScope;       // where to hunt (top-N markets, a state, a region)
  searchesPerDay: number;  // how many (type × city) searches per day (each = one Google search)
  demoQuota: number;       // max demos to auto-build per day (the expensive step — hard daily cap)
}

export interface DailyHunt {
  queries: SweepQuery[];  // the per-(type, city) searches to run today
  nextCursor: number;     // where tomorrow's slice starts (persisted on the order)
  wrapped: boolean;       // true when today's slice rolled past the end back to the start
}

const clampInt = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = typeof n === 'number' && isFinite(n) ? Math.floor(n) : dflt;
  return Math.max(lo, Math.min(v, hi));
};

/** Tolerant parse of a stored config (jsonb on the standing order) → a bounded HuntConfig. Returns
 *  null only for non-object junk — a hunt with NO niche is valid (it means "hunt everything").
 *  Accepts the legacy singular `niche` and `citiesPerDay` fields so old rows keep working. Caps keep
 *  an autonomous order sane even if the row is hand-edited. */
export function parseHuntConfig(raw: unknown): HuntConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  let niches: string[] = [];
  if (Array.isArray(r.niches)) {
    niches = r.niches.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim());
  } else if (typeof r.niche === 'string' && r.niche.trim()) {
    niches = [r.niche.trim()];                         // legacy single-niche config
  }
  const scope = (r.scope && typeof r.scope === 'object' ? r.scope : { mode: 'topN', n: 50 }) as SweepScope;
  const searchesRaw = r.searchesPerDay ?? r.citiesPerDay;  // legacy field name tolerated
  return {
    niches,                                            // [] ⇒ the whole catalog (fully hands-off)
    scope,
    searchesPerDay: clampInt(searchesRaw, 1, 40, 10),  // ≤40 searches/day
    demoQuota: clampInt(r.demoQuota, 1, 25, 5),        // ≤25 demos/day (real credit cost)
  };
}

/** Today's slice of the campaign: `searchesPerDay` searches starting at `cursor`, rolled over the
 *  full (business-type × city) grid — CITY-MAJOR, so each day mixes business types within the
 *  biggest markets first — and wrapping around so a daily order keeps finding FRESH combinations
 *  instead of re-sweeping the same ones. Returns the queries to run and the cursor for tomorrow. */
export function plannedHuntToday(config: HuntConfig, cursor: number): DailyHunt {
  const cities = citiesFor(config.scope);
  const niches = (config.niches.length ? config.niches : LOCAL_NICHES).map((n) => n.trim()).filter(Boolean);
  if (!cities.length || !niches.length) return { queries: [], nextCursor: 0, wrapped: false };

  const gridLen = cities.length * niches.length;        // every (type, city) pair
  const per = Math.max(1, Math.min(config.searchesPerDay, gridLen));
  const start = ((Math.floor(cursor) % gridLen) + gridLen) % gridLen;
  const queries: SweepQuery[] = [];
  let wrapped = false;
  for (let k = 0; k < per; k++) {
    const idx = start + k;
    if (idx >= gridLen) wrapped = true;
    const g = idx % gridLen;
    const city: UsCity = cities[Math.floor(g / niches.length)]; // city-major: outer city, inner niche
    const niche = niches[g % niches.length];
    queries.push({ niche, city: city.city, state: city.state, area: `${city.city}, ${city.state}` });
  }
  return { queries, nextCursor: (start + per) % gridLen, wrapped };
}

/** A human line describing the standing order for the panel + the audit trail. */
export function huntSummary(config: HuntConfig): string {
  const what = config.niches.length === 0 ? 'every kind of local business'
    : config.niches.length === 1 ? `"${config.niches[0]}"`
    : `${config.niches.length} business types`;
  const where = config.scope.mode === 'topN' ? `the top ${config.scope.n} US markets`
    : config.scope.mode === 'state' ? config.scope.state
    : `the ${config.scope.region}`;
  return `Every day: run ${config.searchesPerDay} searches across ${where} for ${what}, build up to ${config.demoQuota} demos + pitches, and queue them for your approval. Nothing sends on its own.`;
}
