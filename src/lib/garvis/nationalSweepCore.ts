// src/lib/garvis/nationalSweepCore.ts
// PURE core of the national sweep (no network; verified by nationalSweep.verify.ts). Turns a niche +
// a set of cities into an ordered, capped, deduped list of per-city search queries, and provides the
// national dedupe (one business shouldn't be pitched twice because it ranked in two nearby cities).

import type { UsCity } from './usCities';

export interface SweepQuery { niche: string; city: string; state: string; area: string }

/** Build the per-city search plan: one query per city ("niche" + "City, ST"), city-deduped and
 *  capped. cap bounds the number of Google searches — each query is one paid search. */
export function sweepPlan(niche: string, cities: UsCity[], cap: number): SweepQuery[] {
  const trimmed = niche.trim();
  const seen = new Set<string>();
  const out: SweepQuery[] = [];
  for (const c of cities) {
    const key = `${c.city}|${c.state}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ niche: trimmed, city: c.city, state: c.state, area: `${c.city}, ${c.state}` });
    if (out.length >= Math.max(1, cap)) break;
  }
  return out;
}

/** The dedupe key for a business — its registrable-ish domain (hostname minus a leading www). Two
 *  results that resolve to the same site (found in different cities) collapse to one prospect. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Register a business's domain in the seen-set; returns true if it's NEW (first time nationwide). */
export function registerDomain(seen: Set<string>, url: string | null | undefined): boolean {
  const d = domainOf(url);
  if (!d || seen.has(d)) return false;
  seen.add(d);
  return true;
}

/** A rough, honest cost line for a plan: one Google search per city. */
export function sweepCostLine(queryCount: number): string {
  return `${queryCount} cit${queryCount === 1 ? 'y' : 'ies'} → ${queryCount} Google search${queryCount === 1 ? '' : 'es'} (one per city). Search credits are used; nothing is emailed.`;
}
