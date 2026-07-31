// src/lib/garvis/prospects/areaSweep.ts
// THE COUNTY MACHINE — one run that discovers, audits, persists, and files every business in an
// area into a study.
//
// What existed before this: findBusinesses answered ONE phrase ("plumbers in Lake Geneva" — Google
// answers that phrase, not the county), and sweepNation fanned one phrase across many CITIES but
// was discovery-only: nothing audited, nothing persisted, no cohort. So "collect the rating data
// for every location" meant an operator manually searching town after town and hoping the browser
// tab survived. This module is that loop, made a machine:
//
//   towns × trade synonyms  →  findBusinesses (paginated Places)
//        → dedupe across the whole area (a shop serving three towns is ONE prospect)
//        → scrapeAndAudit every one (deep scan v1.4+; unreachable stays an honest unknown)
//        → recordProspectAudit (audit + findings rows — the lead pool grows)
//        → addCohortMembers (reachable/scan_version/trade FROZEN at measurement — the study grows)
//        → completeCohort at the end (single scan version stamped; cohortStats can refuse a mix)
//
// So one button press yields BOTH products of a sweep: a worked lead list ready to pitch, and a
// publishable-or-refusable county index (cohortStats decides which — small samples and version
// mixes refuse themselves). Nothing here emails anyone.
//
// SYNONYM FAN-OUT, and its honesty rule: "plumbers", "plumbing company" and "drain cleaning" reach
// different Places results for the same town, so a single phrase undercounts the frame. The synonym
// table below widens the NET; it never widens the CLAIM — every business still passes through the
// same dedupe, and the cohort frame records exactly which queries were asked, so the study can say
// "every business Places returned for these N queries" and mean it. Synonyms are data anyone can
// read, not cleverness buried in code.
//
// PACING: Places pagination made each query up to 3 billed calls; a 12-town × 3-synonym sweep is up
// to ~108 searches. Concurrency is capped low and progress streams, and shouldStop() is checked
// between queries so the operator can bail without losing what's already recorded — every audit and
// membership is persisted the moment it happens, so a stopped sweep is a smaller study, not a lost one.

import { findBusinesses, scrapeAndAudit, recordProspectAudit, type FoundBusiness } from '../clientHuntRun';
import { registerDomain } from '../nationalSweepCore';
import { createCohort, addCohortMembers, completeCohort, type Cohort } from './cohortStore';
import { SCAN_VERSION } from '../../../../supabase/functions/_shared/scanTypes.ts';

// ---------------------------------------------------------------------------------------------
// The pure planning half (verified by areaSweep.verify.ts).
// ---------------------------------------------------------------------------------------------

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
// The impure runner.
// ---------------------------------------------------------------------------------------------

export interface AreaSweepProgress {
  phase: 'searching' | 'auditing';
  queriesDone: number; queriesTotal: number;
  found: number; audited: number; failed: number;
  current: string;                       // the town or business under the cursor
}

export interface AreaSweepResult {
  cohort: Cohort | null;                 // null when app_0117 isn't applied — the sweep still ran
  found: FoundBusiness[];
  audited: number;
  failed: number;
  lastError: string | null;
}

/**
 * Sweep an area: discover in every town, audit EVERYTHING found, persist every reading, and file
 * the lot into one cohort. The lead pool and the study accrue together, row by row, so stopping
 * early loses nothing already done.
 */
export async function sweepArea(args: {
  ownerId: string;
  niche: string;
  areaLabel: string;                     // 'Walworth County, WI' — appears verbatim in the study + pitch
  towns: string[];
  worldId?: string | null;
  concurrency?: number;                  // search/audit pool, 1-4; default 2 — a county is not a race
  onFound?: (b: FoundBusiness) => void;  // stream each NEW business as it lands (display; the run persists regardless)
  onProgress?: (p: AreaSweepProgress) => void;
  shouldStop?: () => boolean;
}): Promise<AreaSweepResult> {
  const plan = areaSweepPlan(args.niche, args.towns);
  const conc = Math.max(1, Math.min(args.concurrency ?? 2, 4));
  const progress: AreaSweepProgress = { phase: 'searching', queriesDone: 0, queriesTotal: plan.length, found: 0, audited: 0, failed: 0, current: '' };
  const emit = () => args.onProgress?.({ ...progress });

  const result: AreaSweepResult = { cohort: null, found: [], audited: 0, failed: 0, lastError: null };
  if (plan.length === 0) return result;

  // The study opens BEFORE the first result, with a frame written from the plan — the only moment
  // a frame is honestly writable. A failed create (migration not applied) degrades to a plain
  // sweep: leads still collected, study skipped, and the result says so via cohort:null.
  const stamp = new Date().toISOString().slice(0, 10);
  result.cohort = await createCohort({
    ownerId: args.ownerId,
    name: `${args.niche.trim()} — ${args.areaLabel.trim()} — ${stamp}`,
    area: args.areaLabel.trim(),
    frame: frameSentence(args.niche, args.towns),
    trade: args.niche.trim().toLowerCase(),
    frameNoun: frameNounFor(args.niche),
    worldId: args.worldId ?? null,
  });

  // ---- discover: towns × synonyms, area-wide dedupe ----
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  let qi = 0;
  const searchWorker = async () => {
    while (qi < plan.length) {
      if (args.shouldStop?.()) return;
      const q = plan[qi++];
      progress.current = q.town; emit();
      try {
        for (const b of await findBusinesses(q.niche, q.town)) {
          if (b.url) { if (!registerDomain(seenDomains, b.url)) continue; }
          else {
            const key = b.name.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!key || seenNames.has(key)) continue;
            seenNames.add(key);
          }
          result.found.push(b);
          args.onFound?.(b);
          progress.found = result.found.length;
        }
      } catch (e) {
        result.failed++; progress.failed = result.failed;
        result.lastError = e instanceof Error ? e.message : String(e);
      }
      progress.queriesDone++; emit();
    }
  };
  await Promise.all(Array.from({ length: conc }, () => searchWorker()));

  // ---- audit EVERY find + file it into the study, row by row ----
  progress.phase = 'auditing'; emit();
  let bi = 0;
  const auditWorker = async () => {
    while (bi < result.found.length) {
      if (args.shouldStop?.()) return;
      const b = result.found[bi++];
      progress.current = b.name; emit();
      try {
        let auditId: string | null = null;
        let reachable = false;
        if (b.url) {
          const { audit, scrape } = await scrapeAndAudit(b.url);
          b.audit = audit;
          reachable = audit.reachable;
          auditId = await recordProspectAudit({
            url: b.url, audit, scrape, source: 'sweep',
            businessName: b.name, niche: args.niche, area: args.areaLabel, worldId: args.worldId ?? null,
          });
        }
        // A no-website business is a lead, and it is honestly OUTSIDE the website study: there is
        // no site to measure, so it joins the pool (has_website:false is its own pitch) but not the
        // cohort — the frame is "business WEBSITES", and a frame kept narrow is a frame kept true.
        if (auditId && result.cohort) {
          await addCohortMembers({
            ownerId: args.ownerId,
            cohortId: result.cohort.id,
            members: [{ auditId, reachable, scanVersion: reachable ? SCAN_VERSION : null, trade: args.niche.trim().toLowerCase() }],
          });
        }
        progress.audited = ++result.audited;
      } catch (e) {
        result.failed++; progress.failed = result.failed;
        result.lastError = e instanceof Error ? e.message : String(e);
      }
      emit();
    }
  };
  await Promise.all(Array.from({ length: conc }, () => auditWorker()));

  // Close the study under the one scan version its readings were taken with. A stopped-early sweep
  // still completes honestly — it is a smaller study, and cohortStats will refuse it if too small.
  if (result.cohort) await completeCohort(result.cohort.id, SCAN_VERSION);
  return result;
}
