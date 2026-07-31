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

