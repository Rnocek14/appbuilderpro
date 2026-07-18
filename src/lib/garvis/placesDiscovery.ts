// src/lib/garvis/placesDiscovery.ts
// PURE core of the Google-Places daily hunt (no network/DOM; verified by placesDiscovery.verify.ts).
// This is the swift-prep-pros discovery model ported into Garvis: turn a niche + city into a Places
// text query, parse a raw Places result into a structured lead (name, phone, address, website,
// category, geo — never invented), seed + drive a SELF-EXHAUSTING work queue (pick the next-best
// non-exhausted query; mark a market drained after two zero-insert runs), and dedupe by normalized
// website. The impure worker (standing-worker/index.ts) does the fetch + the DB writes around these.
//
// Zero runtime imports on purpose — this is a leaf module the edge worker imports directly.

/** The Places fields we ask for (X-Goog-FieldMask). Structured business data, not a search snippet. */
export const PLACES_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.primaryType', 'places.types',
  'places.location', 'places.addressComponents', 'places.rating', 'places.userRatingCount', 'nextPageToken',
].join(',');

export interface PlaceRaw {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryType?: string;
  types?: string[];
  location?: { latitude: number; longitude: number };
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  rating?: number;
  userRatingCount?: number;
}

/** One real business the hunt discovered — exactly what Places returned, nothing invented. */
export interface DiscoveredBiz {
  place_id: string | null;
  company_name: string;
  keyword: string;
  website: string | null;
  website_normalized: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  has_website: boolean;   // false ⇒ the strongest "I'll build you a website" prospect
  // DISPLAY-AT-USE ONLY (Places ToS): real rating/count for the demo built in this run —
  // never persisted to the lead pool. Null when Places has none.
  rating: number | null;
  rating_count: number | null;
}

/** Host, lowercased, without scheme / www / path — the persistent dedupe key for a website. */
export function normalizeHost(url?: string | null): string | null {
  if (!url) return null;
  try {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null;
  } catch {
    return null;
  }
}

/** City + state from a Places result: prefer the structured addressComponents, fall back to parsing
 *  the formatted address ("…, Austin, TX 78701, USA"). Unknown → null, never guessed. */
export function extractCityState(
  addr?: string | null,
  components?: PlaceRaw['addressComponents'],
): { city: string | null; state: string | null } {
  let city: string | null = null;
  let state: string | null = null;
  if (components) {
    for (const c of components) {
      if (c.types?.includes('locality')) city = c.longText;
      if (c.types?.includes('administrative_area_level_1')) state = c.shortText;
    }
  }
  if ((!city || !state) && addr) {
    const parts = addr.split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      city = city || parts[parts.length - 3];
      const stZip = parts[parts.length - 2] || '';
      state = state || stZip.split(' ')[0] || null;
    }
  }
  return { city, state };
}

/** Parse ONE raw Places result into a structured lead, or null if it has no name (unusable). */
export function parsePlace(raw: PlaceRaw, keyword: string): DiscoveredBiz | null {
  const name = raw.displayName?.text?.trim();
  if (!name) return null;
  const website = raw.websiteUri?.trim() || null;
  const website_normalized = normalizeHost(website);
  const { city, state } = extractCityState(raw.formattedAddress, raw.addressComponents);
  return {
    place_id: raw.id ?? null,
    company_name: name,
    keyword: keyword.trim(),
    website,
    website_normalized,
    phone: raw.nationalPhoneNumber ?? raw.internationalPhoneNumber ?? null,
    address: raw.formattedAddress ?? null,
    city, state,
    category: raw.primaryType ?? null,
    lat: raw.location?.latitude ?? null,
    lng: raw.location?.longitude ?? null,
    has_website: !!website_normalized,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    rating_count: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
  };
}

/** The Places textQuery for a (type, city) combo. */
export function placesQueryText(keyword: string, city: string, state: string): string {
  return `${keyword.trim()} in ${city.trim()}, ${state.trim()}`;
}

export interface SeedRow { keyword: string; city: string; state: string; query_text: string }

/** Seed the discovery queue: one (type × city) combo per row. Deduped by query_text so re-seeding an
 *  existing hunt is a no-op. `niches` empty is a caller error here — the worker passes the catalog. */
export function buildDiscoveryQueries(niches: string[], cities: Array<{ city: string; state: string }>): SeedRow[] {
  const seen = new Set<string>();
  const rows: SeedRow[] = [];
  for (const kwRaw of niches) {
    const keyword = kwRaw.trim();
    if (!keyword) continue;
    for (const c of cities) {
      const query_text = placesQueryText(keyword, c.city, c.state);
      if (seen.has(query_text)) continue;
      seen.add(query_text);
      rows.push({ keyword, city: c.city, state: c.state, query_text });
    }
  }
  return rows;
}

export interface QueryRow {
  id: string;
  query_text: string;
  keyword: string;
  last_run_at: string | null;
  exhausted: boolean;
  total_inserted: number;
  run_count: number;
  consecutive_zero_runs: number;
}

/** The next-best query to run: skip exhausted markets, prefer one never run yet, otherwise the
 *  least-recently-run. Deterministic (no RNG) so it's fully testable. Null when everything is
 *  exhausted (the whole scope has been drained — the worker reports that honestly). */
export function pickNextQuery<T extends { last_run_at: string | null; exhausted: boolean }>(rows: T[]): T | null {
  const live = rows.filter((r) => !r.exhausted);
  if (!live.length) return null;
  const neverRun = live.filter((r) => !r.last_run_at);
  if (neverRun.length) return neverRun[0];
  return live.reduce((best, r) => (Date.parse(r.last_run_at!) < Date.parse(best.last_run_at!) ? r : best));
}

export interface ExhaustionUpdate {
  last_inserted: number;
  total_inserted: number;
  run_count: number;
  consecutive_zero_runs: number;
  exhausted: boolean;
}

/** The counter update for a query row after a run inserted `inserted` NEW businesses. Two consecutive
 *  zero-insert runs mark the market exhausted (it keeps returning the same already-known places). */
export function exhaustionUpdate(
  row: { total_inserted: number; run_count: number; consecutive_zero_runs: number },
  inserted: number,
): ExhaustionUpdate {
  const zeroStreak = inserted === 0 ? row.consecutive_zero_runs + 1 : 0;
  return {
    last_inserted: inserted,
    total_inserted: row.total_inserted + inserted,
    run_count: row.run_count + 1,
    consecutive_zero_runs: zeroStreak,
    exhausted: zeroStreak >= 2,
  };
}
