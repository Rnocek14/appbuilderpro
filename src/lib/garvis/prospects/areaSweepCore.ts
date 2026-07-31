// src/lib/garvis/prospects/areaSweepCore.ts
// PURE planning half of the county machine — a LEAF with zero imports, on purpose: the
// standing-worker edge function (Deno) imports this to run area studies on the server, and the
// browser runner (areaSweep.ts) imports it for the interactive sweep. One plan, two executors,
// no drift — the frame sentence a study publishes is computed by the same code everywhere.
// Verified by areaSweep.verify.ts (which imports via areaSweep.ts re-exports).

/** How different trades are actually SEARCHED FOR, in the words real people use. First entry is
 *  the canonical trade noun (used as the cohort's frame noun). Plain data on purpose — the frame
 *  of a study should be readable by anyone, and extendable without touching logic. */
export const TRADE_SYNONYMS: Record<string, string[]> = {
  // ---- high-ticket home services: one job pays for a year of the subscription. These are the
  // trades the whole revenue model leans on, so their nets are the widest. ----
  plumbers: ['plumbers', 'plumbing company', 'drain cleaning', 'water heater repair'],
  roofers: ['roofers', 'roofing contractor', 'roof repair', 'storm damage roof repair'],
  hvac: ['hvac', 'heating and cooling', 'furnace repair', 'air conditioning repair'],
  electricians: ['electricians', 'electrical contractor'],
  restoration: ['water damage restoration', 'fire damage restoration', 'mold remediation'],
  remodelers: ['remodeling contractor', 'kitchen remodeling', 'bathroom remodeling', 'basement finishing'],
  contractors: ['general contractor', 'home builder', 'construction company'],
  concrete: ['concrete contractor', 'paving company', 'asphalt paving', 'driveway contractor'],
  excavation: ['excavation contractor', 'septic system service', 'well drilling'],
  foundation: ['foundation repair', 'basement waterproofing'],
  siding: ['siding contractor', 'window replacement', 'gutter installation'],
  fencing: ['fence company', 'fence installation', 'deck builder'],
  pools: ['pool builder', 'pool service', 'hot tub dealer'],
  solar: ['solar installer', 'solar company'],
  masonry: ['masonry contractor', 'chimney repair', 'brick repair'],
  flooring: ['flooring company', 'carpet installation', 'tile contractor', 'epoxy flooring'],
  painters: ['painting contractor', 'house painters'],
  garagedoors: ['garage door repair', 'garage door installation'],
  treeservice: ['tree service', 'tree removal', 'stump grinding'],
  landscapers: ['landscapers', 'landscaping company', 'lawn care', 'irrigation company'],
  pestcontrol: ['pest control', 'exterminator', 'wildlife removal'],
  cleaning: ['cleaning service', 'house cleaning', 'commercial cleaning', 'carpet cleaning'],
  movers: ['moving company', 'movers'],
  towing: ['towing service', 'tow truck'],
  // ---- health & professional: high lifetime value, appointment-driven — the booking and
  // reminder automations sell themselves here. ----
  dentists: ['dentists', 'dental clinic', 'orthodontist'],
  chiropractors: ['chiropractor', 'chiropractic clinic'],
  physicaltherapy: ['physical therapy', 'sports rehab'],
  optometrists: ['optometrist', 'eye doctor'],
  veterinarians: ['veterinarian', 'animal hospital', 'vet clinic'],
  medspas: ['med spa', 'medical spa', 'aesthetics clinic', 'laser hair removal'],
  lawyers: ['law firm', 'attorney', 'personal injury lawyer', 'estate planning attorney'],
  accountants: ['accountant', 'cpa firm', 'tax preparation', 'bookkeeping service'],
  insurance: ['insurance agency', 'insurance agent'],
  realestate: ['real estate agency', 'property management company'],
  // ---- main street: lower ticket, but dense — the volume floor of a county study. ----
  restaurants: ['restaurants', 'catering company'],
  salons: ['hair salon', 'nail salon', 'barber shop', 'day spa'],
  gyms: ['gym', 'fitness studio', 'martial arts school', 'yoga studio'],
  autorepair: ['auto repair', 'mechanic', 'auto body shop', 'auto detailing'],
  storage: ['self storage', 'storage units'],
  childcare: ['daycare', 'child care center', 'preschool'],
  photographers: ['photographer', 'photography studio'],
};

/** The synonym set for a niche: the table's when we have one, else the niche itself — an unknown
 *  trade still sweeps, it just doesn't fan out. Matching is forgiving on case/whitespace only;
 *  no stemming, no guessing. */
export function synonymsFor(niche: string): string[] {
  const key = niche.trim().toLowerCase().replace(/\s+/g, '');
  for (const [k, v] of Object.entries(TRADE_SYNONYMS)) {
    if (k === key || v.some((s) => s.replace(/\s+/g, '') === key)) return v;
  }
  const clean = niche.trim();
  return clean ? [clean] : [];
}

export interface AreaQuery { niche: string; town: string }

/** The full query plan: every synonym in every town, deterministic order (towns outer, so progress
 *  reads geographically). Empty towns or an empty niche plan nothing — a sweep of nowhere is not a
 *  sweep. Towns are deduped case-insensitively; a pasted list with "Delavan, delavan" asks once. */
export function areaSweepPlan(niche: string, towns: string[]): AreaQuery[] {
  const syns = synonymsFor(niche);
  const seen = new Set<string>();
  const cleanTowns: string[] = [];
  for (const t of towns) {
    const clean = t.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    cleanTowns.push(clean);
  }
  const plan: AreaQuery[] = [];
  for (const town of cleanTowns) for (const n of syns) plan.push({ niche: n, town });
  return plan;
}

/** The frame sentence for the cohort — written by the PLAN, before any result exists, which is the
 *  only time a frame can honestly be written. States exactly what was asked. */
export function frameSentence(niche: string, towns: string[]): string {
  const syns = synonymsFor(niche);
  const plan = areaSweepPlan(niche, towns);
  const townCount = new Set(plan.map((q) => q.town.toLowerCase())).size;
  return `Every business Google Places returned for ${plan.length} searches ` +
    `(${syns.map((s) => `"${s}"`).join(', ')}) across ${townCount} town${townCount === 1 ? '' : 's'}, ` +
    `deduplicated by website domain and business name.`;
}

/** The canonical singular noun for the pitch line ("one of N <noun> websites"). */
export function frameNounFor(niche: string): string {
  const syns = synonymsFor(niche);
  const first = (syns[0] ?? niche).trim().toLowerCase();
  // "plumbers" → "plumber"; multiword phrases keep their head form ("roofing contractor").
  return first.endsWith('s') && !first.includes(' ') ? first.slice(0, -1) : first;
}


// ---------------------------------------------------------------------------------------------
// Town-list parsing — where the operator's raw string becomes the study's geography.
// ---------------------------------------------------------------------------------------------

/** The two-letter USPS state codes. A Set so membership is a lookup, not a regex guess. */
const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA',
  'RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]);

/**
 * Parse the operator's comma-separated area string into a clean town list.
 *
 * The naive split has a trap the UI's own placeholder walks people into: it teaches
 * "Lake Geneva, WI", and a comma-split of that yields the towns ["Lake Geneva", "WI"] — the study
 * would then sweep the two-letter abbreviation of Wisconsin as if it were a town, and the "this is
 * a town list" heuristic would fire on every ordinary single-town search. Caught by driving the UI
 * as an operator would, typing exactly what the placeholder suggests.
 *
 * Rules, in order:
 *   1. A token that is exactly a state code re-attaches to the PREVIOUS town ("Lake Geneva","WI"
 *      → "Lake Geneva, WI"). A leading state code with no town before it is dropped.
 *   2. If any town carries a state (trailing ", XX" or " XX") and others don't, that state is
 *      applied to the stateless ones — "Lake Geneva, Delavan, Elkhorn WI" means all three are in
 *      Wisconsin, and an unqualified "Delavan" would otherwise let Places answer with Delavan,
 *      Illinois. When towns disagree about the state, nothing is inferred — ambiguity must never
 *      be resolved by guessing.
 *   3. Dedupe case-insensitively; drop empties.
 */
export function parseTownList(raw: string): string[] {
  const tokens = raw.split(',').map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean);

  // Rule 1: re-attach bare state codes to the town they belong to.
  const towns: string[] = [];
  for (const t of tokens) {
    if (STATE_CODES.has(t.toUpperCase())) {
      if (towns.length > 0) towns[towns.length - 1] = `${towns[towns.length - 1]}, ${t.toUpperCase()}`;
      continue;                                  // a state with no preceding town names nothing
    }
    towns.push(t);
  }

  // Rule 2: one town's explicit state extends to the stateless ones — unless towns disagree.
  const stateOf = (town: string): string | null => {
    const m = /(?:,\s*|\s+)([A-Za-z]{2})$/.exec(town);
    return m && STATE_CODES.has(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
  };
  const states = [...new Set(towns.map(stateOf).filter((s): s is string => !!s))];
  const applied = states.length === 1
    ? towns.map((t) => (stateOf(t) ? t : `${t}, ${states[0]}`))
    : towns;

  // Rule 3: dedupe, preserving first spelling.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of applied) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
