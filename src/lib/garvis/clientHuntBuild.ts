// src/lib/garvis/clientHuntBuild.ts
// PURE server-side builders for the DAILY AUTOMATIC client hunt (no network/DOM; verified by
// clientHuntBuild.verify.ts). The standing-worker's `client_hunt` case is thin I/O glue wrapped
// around these: from a city's Google results pick the real businesses worth a demo, turn ONE
// scraped site into an honest BusinessProfile (deterministic — NO AI, no invented facts), and write
// the outreach pitch. Same honesty rules as the interactive scrape path (scrapeProfileCore):
//   - only facts we actually observed survive; unknowns are omitted, never guessed;
//   - a prospect's own photos ride into the DEMO (can_use_in_preview) but are never publishable
//     (can_publish:false) — publishing a real site needs owner-provided/licensed assets;
//   - nothing here sends. The worker queues each pitch as a PENDING approval for the owner.

// .ts extensions on the VALUE imports: this module is also imported by the standing-worker EDGE
// function (Deno), whose strict resolver requires explicit extensions. The type-only import from
// '../preview/spec' is erased, so it needs none. Every leaf here imports only types (Deno-safe).
import { parseSerperOrganic } from './marketIntel.ts';
import { domainOf } from './nationalSweepCore.ts';
import { auditIssues, type SiteAudit } from './siteAudit.ts';
import { buildProfile, type ExtractedFields, type ScrapeContext } from '../preview/scrapeProfileCore.ts';
import type { BusinessProfile } from '../preview/spec';

// Big aggregators/directories aren't prospects — we want a business's OWN (beatable) site.
const DIRECTORY = /(yelp\.|facebook\.|instagram\.|linkedin\.|yellowpages\.|bbb\.org|mapquest\.|tripadvisor\.|angi\.com|thumbtack\.|google\.[a-z.]+\/maps|houzz\.|nextdoor\.|wikipedia\.|amazon\.|reddit\.)/i;

export interface HuntTarget { name: string; url: string; snippet: string }

/** From one city's Serper results, the real businesses worth a demo: has its OWN site URL, isn't a
 *  directory, and hasn't already been picked (domain-deduped against `seen`, shared across the day so
 *  a shop ranking in two cities is built once). Capped. Never invents a business or a URL. */
export function pickHuntTargets(serperData: unknown, cap: number, seen: Set<string> = new Set()): HuntTarget[] {
  const out: HuntTarget[] = [];
  for (const c of parseSerperOrganic(serperData, 20)) {
    if (!c.url || DIRECTORY.test(c.url)) continue;
    const d = domainOf(c.url);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push({ name: c.name, url: c.url, snippet: c.snippet });
    if (out.length >= Math.max(1, cap)) break;
  }
  return out;
}

const titleCase = (s: string): string =>
  s.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

// SEARCH KEYWORD → TRADE NAME. The keyword we hunt with ("roofers") is a person-plural; copy that
// reuses it verbatim reads broken ("serves Austin with roofers", "Roofers done right"). Map the
// whole LOCAL_NICHES catalog to the industry noun a human would write; unknown keywords fall back
// to a safe singular + "Services" ("notaries" → "Notary Services").
const TRADE_NAMES: Record<string, string> = {
  roofers: 'Roofing', plumbers: 'Plumbing', 'hvac contractors': 'HVAC', electricians: 'Electrical',
  landscapers: 'Landscaping', 'lawn care services': 'Lawn Care', painters: 'Painting',
  'pressure washing services': 'Pressure Washing', 'house cleaning services': 'House Cleaning',
  'pest control companies': 'Pest Control', 'tree service companies': 'Tree Service',
  'fencing contractors': 'Fencing', 'concrete contractors': 'Concrete Work',
  'garage door repair': 'Garage Door Repair', 'handyman services': 'Handyman Services',
  'remodeling contractors': 'Remodeling', 'flooring companies': 'Flooring',
  'window installers': 'Window Installation', 'gutter installers': 'Gutter Installation',
  'pool service companies': 'Pool Service', 'appliance repair': 'Appliance Repair',
  locksmiths: 'Locksmith Services', 'moving companies': 'Moving Services',
  'junk removal services': 'Junk Removal', 'auto repair shops': 'Auto Repair',
  'auto detailing': 'Auto Detailing', 'towing companies': 'Towing', dentists: 'Dental Care',
  chiropractors: 'Chiropractic Care', 'med spas': 'Med Spa Services', 'dog groomers': 'Dog Grooming',
  veterinarians: 'Veterinary Care', 'hair salons': 'Hair & Beauty', 'barber shops': 'Barbering',
  'nail salons': 'Nail Care', 'massage therapists': 'Massage Therapy',
  'personal trainers': 'Personal Training', optometrists: 'Eye Care', 'law firms': 'Legal Services',
  'accounting firms': 'Accounting', 'insurance agencies': 'Insurance', florists: 'Floral Design',
};

/** The industry noun for a search keyword — mapped for the catalog, safely singularized otherwise. */
export function tradeName(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  if (!k) return 'Local Business';
  if (TRADE_NAMES[k]) return TRADE_NAMES[k];
  const singular = k.endsWith('ies') ? `${k.slice(0, -3)}y` : (k.endsWith('s') && !k.endsWith('ss')) ? k.slice(0, -1) : k;
  return /\b(service|repair|care|work)s?\b/.test(singular) ? titleCase(singular) : `${titleCase(singular)} Services`;
}

/** A business name from the page's <title>, stripped of the tagline half most titles carry
 *  ("Joe's Roofing | Austin's #1 Roofer" → "Joe's Roofing"). Empty/junk → null so the caller can
 *  fall back to the search-result name. */
export function cleanBusinessName(title: string | null | undefined): string | null {
  const raw = (title ?? '').trim();
  if (!raw) return null;
  // Split on the first strong separator; keep the leading segment (the name, not the slogan).
  const head = raw.split(/\s*[|–—·:]\s*|\s-\s/)[0].trim();
  const name = (head.length >= 2 ? head : raw).slice(0, 120).trim();
  return name || null;
}

/** Deterministic factual fields from a scraped page — NO model call. We honestly know only two
 *  things without reading marketing copy: who they are (the page title) and their trade (the niche
 *  we searched). Everything else is left unknown for buildProfile to omit. `fallbackName` (the
 *  search-result title) guarantees a non-empty business_name when the page title is junk. */
export function fieldsFromPage(
  page: { title?: string | null; description?: string | null },
  niche: string,
  fallbackName: string,
  location?: string | null,   // a REAL location (e.g. from Google Places city/state) — honest, not guessed
  rating?: { rating: number | null; count: number | null } | null,  // REAL Places rating — display-at-use
): ExtractedFields {
  const name = cleanBusinessName(page.title) ?? cleanBusinessName(fallbackName) ?? fallbackName.trim();
  const trade = niche.trim() ? tradeName(niche) : '';
  return {
    business_name: name.slice(0, 120),
    industry: trade || 'Local business',
    // One honest, generic service = the trade itself. We never invent a named service list.
    services: [trade || 'Services'],
    location: (location && location.trim()) ? location.trim().slice(0, 120) : null,
    hours: null,
    reviews_summary: null,
    // Real Google rating when Places returned one THIS run (display-at-use, never persisted).
    google_rating: rating?.rating ?? null,
    review_count: rating?.count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Honest fact extraction from the prospect's own page text
// ---------------------------------------------------------------------------

/** Facts a page LITERALLY states about the business — no inference, no model call. Everything here
 *  is quotable back to the owner ("your site says…"), which is what makes the rebuilt demo read as
 *  THEIR business instead of a template with their name pasted in. Absent facts stay absent. */
export interface SiteFacts {
  services: string[];              // the named services their page lists, verbatim (title-cased)
  establishedYear: number | null;  // "Since 1987" / "Established 2003" — bounds-checked
  serviceArea: string[];           // "Serving Fox Lake and the Chain O'Lakes" → the named places
  familyOwned: boolean;            // the page says family-owned / family owned & operated
  description: string | null;      // one honest line assembled ONLY from the facts above
}

const cleanListItem = (s: string, maxWords: number): string | null => {
  const t = s.replace(/^\s*(?:and|&|\+|the)\s+/i, '').replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');
  if (t.length < 3 || t.length > 40 || !/[a-z]/i.test(t) || t.split(' ').length > maxWords) return null;
  return t;
};

/** Deterministic extraction from scraped page text. The services pattern is colon/verb-gated
 *  ("Services: …", "we offer …") so a nav menu's bare "Services" link never yields fake items —
 *  a page that doesn't name its services yields none and the caller keeps the generic trade name. */
export function extractSiteFacts(text: string | null | undefined, nowYear: number): SiteFacts {
  const t = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 20_000);
  const facts: SiteFacts = { services: [], establishedYear: null, serviceArea: [], familyOwned: false, description: null };
  if (!t) return facts;

  for (const m of t.matchAll(/(?:services(?:\s+include[sd]?)?\s*:|we offer|we provide|we specialize in|specializing in)\s+([^.!?]{8,300})/gi)) {
    for (const part of m[1].split(/[,;•·|]|\band\b/i)) {
      const item = cleanListItem(part, 5);
      const cased = item ? titleCase(item) : null;
      if (cased && !facts.services.includes(cased)) facts.services.push(cased);
      if (facts.services.length >= 8) break;
    }
    if (facts.services.length >= 8) break;
  }

  const yearM = t.match(/\b(?:since|established(?:\s+in)?|est\.?|founded(?:\s+in)?)\s+((?:19|20)\d{2})\b/i);
  if (yearM) {
    const y = parseInt(yearM[1], 10);
    if (y >= 1900 && y <= nowYear) facts.establishedYear = y;
  }

  const areaM = t.match(/\bserving\s+([A-Za-z][^.!?]{2,90}?)(?=\s+since\s+(?:19|20)\d{2}\b|[.!?]|$)/i);
  if (areaM) {
    for (const part of areaM[1].split(/,|\band\b|&/i)) {
      const a = cleanListItem(part, 5);
      // Proper-noun places only ("Fox Lake"), so "serving homeowners across the county" adds nothing.
      if (a && /^[A-Z]/.test(a) && !facts.serviceArea.includes(a)) facts.serviceArea.push(a);
      if (facts.serviceArea.length >= 6) break;
    }
  }

  facts.familyOwned = /family[-\s]owned/i.test(t);

  const areaPhrase = facts.serviceArea.length
    ? `serving ${facts.serviceArea.length > 1
        ? `${facts.serviceArea.slice(0, -1).join(', ')} and ${facts.serviceArea[facts.serviceArea.length - 1]}`
        : facts.serviceArea[0]}`
    : '';
  const sincePhrase = facts.establishedYear ? `since ${facts.establishedYear}` : '';
  const tail = [areaPhrase, sincePhrase].filter(Boolean).join(' ');
  if (facts.familyOwned && tail) facts.description = `Family-owned, ${tail}.`;
  else if (facts.familyOwned) facts.description = 'Family-owned and operated.';
  else if (tail) facts.description = `${tail[0].toUpperCase()}${tail.slice(1)}.`;

  return facts;
}

// ---------------------------------------------------------------------------
// AI concept imagery — prompts only (pure); the worker generates + stores
// ---------------------------------------------------------------------------

// Trade → still-life subject matter. Deliberately OBJECT photography (materials and tools of the
// trade), never people, places, or "their work" — an AI image must not impersonate reality.
const IMAGE_SUBJECTS: [RegExp, string, string][] = [
  [/plumb|sewer|drain/i, 'copper pipes, brass fittings and a steel pipe wrench arranged on dark slate', 'water droplets beading on a polished copper pipe joint, macro'],
  [/electric/i, 'coiled copper wire, cable spools and a voltage tester on matte black steel', 'the filament of a warm vintage bulb glowing, macro on black'],
  [/roof|gutter/i, 'overlapping architectural shingles and copper flashing in low dramatic light', 'rain droplets bouncing off a dark shingle edge, macro'],
  [/hvac|heating|cooling|furnace/i, 'brushed-steel ventilation fins, ducting and an analog pressure gauge', 'frost crystals forming on a copper coil, macro'],
  [/auto|mechanic|tire|transmission/i, 'a chrome socket set and torque wrench on a dark workshop bench', 'tread of a new tire catching rim light, macro on black'],
  [/landscap|lawn|tree/i, 'fresh-cut turf, pruning shears and leather work gloves on weathered wood', 'morning dew on blades of deep-green grass, macro'],
  [/paint/i, 'a paint-loaded brush and rollers beside pooled paint in one brand color', 'a single thick brushstroke of wet paint across raw canvas, macro'],
  [/clean/i, 'folded white towels, glass spray bottles and citrus on bright marble', 'soap bubbles catching iridescent light, macro'],
  [/law|attorney|legal|account|tax|insur/i, 'a fountain pen on heavy cream paper beside an embossed blind seal', 'the nib of a fountain pen mid-stroke on cotton paper, macro'],
  [/dental|medical|clinic|chiro|optom/i, 'clean instruments on a pale tray with soft depth of field', 'light refracting through clear glass and water, airy macro'],
];

// Trade → the ONE iconic object for the layered depth-sandwich hero (floats over the wordmark).
const HERO_OBJECTS: [RegExp, string][] = [
  [/plumb|sewer|drain/i, 'a professional steel pipe wrench'],
  [/electric/i, 'a vintage glass filament bulb'],
  [/roof|gutter/i, 'a steel framing hammer'],
  [/hvac|heating|cooling|furnace/i, 'an analog brass pressure gauge'],
  [/auto|mechanic|tire|transmission/i, 'a chrome torque wrench'],
  [/landscap|lawn|tree/i, 'a pair of steel pruning shears'],
  [/paint/i, 'a wide paint brush loaded with paint'],
  [/law|attorney|legal|account|tax|insur/i, 'a classic fountain pen'],
  [/clean/i, 'an amber glass spray bottle'],
];

/** The layered-hero pair: an illustrated atmospheric backdrop + ONE iconic trade object isolated
 *  on a transparent background (gpt-image-1 background:'transparent'). Same hard honesty rules —
 *  poster art and an object, never fake evidence of their work. Pure; the worker executes. */
export function huntArtPrompts(industry: string, tone?: string | null): { backdrop: string; object: string } | null {
  const obj = HERO_OBJECTS.find(([re]) => re.test(industry))?.[1];
  if (!obj) return null;                       // no iconic object → no layered hero for this trade
  const mood = tone && /calm|airy|luxur|soft|clinical/i.test(tone)
    ? 'soft luminous palette, generous negative space'
    : 'deep dramatic palette, bold sweeping forms';
  return {
    backdrop: `Atmospheric editorial poster artwork: abstract dramatic clouds and sweeping light, ${mood}, painterly illustration style. No people, no text, no words, no logos, no buildings, no recognizable places.`,
    object: `${obj}, dramatic studio product photography, floating at a slight angle, crisp edge lighting. Isolated object only, transparent background, no people, no hands, no text, no logos.`,
  };
}

/** Two honest, generic still-life prompts (wide hero + tight detail) for a trade with no usable
 *  photos of its own. Hard rules ride in every prompt: no people, no text, no logos, no places —
 *  concept imagery, never fake evidence of "their work". Pure; the worker executes them. */
export function huntImagePrompts(industry: string, tone?: string | null): [string, string] {
  const hit = IMAGE_SUBJECTS.find(([re]) => re.test(industry));
  const wide = hit?.[1] ?? `the tools and materials of the ${industry.toLowerCase()} trade arranged as a considered still life`;
  const tight = hit?.[2] ?? `a single tool of the ${industry.toLowerCase()} trade in dramatic close-up`;
  const mood = tone && /calm|airy|luxur|soft|clinical/i.test(tone)
    ? 'Bright, airy editorial photography, generous negative space, soft daylight.'
    : 'Moody editorial photography, deep shadows, one warm key light, cinematic contrast.';
  const rules = 'No people, no faces, no hands, no text, no words, no logos, no storefronts, no vehicles with markings. Photorealistic.';
  return [
    `Professional wide editorial photograph: ${wide}. ${mood} ${rules}`,
    `Professional macro detail photograph: ${tight}. ${mood} ${rules}`,
  ];
}

export interface HuntProfileInput {
  url: string;
  niche: string;
  fallbackName: string;                                   // the discovered business name (always present)
  page: { title?: string | null; description?: string | null };
  images: string[];                                       // photo URLs from their own site (mode 'images')
  email: string | null;                                   // their published contact email (mode 'contact')
  audit: SiteAudit;                                       // the honest siteAudit of their current site
  location?: string | null;                               // real city/state (e.g. from Places) — optional
  phone?: string | null;                                  // real phone (e.g. from Places) — optional
  rating?: { rating: number | null; count: number | null } | null;  // real Places rating — optional
  facts?: SiteFacts | null;                               // extractSiteFacts(pageText) — literal page facts
}

/** Merge the deterministic fields + scraped assets + audit into a raw BusinessProfile object for
 *  parseBusinessProfile to validate. Reuses the exact same buildProfile the interactive scraper uses
 *  (one implementation), so photo provenance + honesty are identical. A real location/phone (from
 *  Google Places) rides through when provided — never invented. When page facts were extracted, the
 *  services THEY list replace the generic trade placeholder and their own claims become the
 *  description/service_area — the profile carries their words, not ours. */
export function buildHuntProfileRaw(input: HuntProfileInput): Record<string, unknown> {
  const fields = fieldsFromPage(input.page, input.niche, input.fallbackName, input.location, input.rating ?? null);
  const ctx: ScrapeContext = {
    url: input.url,
    images: input.images,
    email: input.email,
    auditScore: input.audit.reachable ? input.audit.score : null,
    auditIssues: auditIssues(input.audit),
  };
  const raw = buildProfile(fields, ctx);
  if (input.phone && input.phone.trim()) raw.phone = input.phone.trim().slice(0, 40);  // real Places phone
  if (input.facts) {
    if (input.facts.services.length) raw.services = input.facts.services;
    if (input.facts.serviceArea.length) raw.service_area = input.facts.serviceArea;
    if (input.facts.description) raw.description = input.facts.description;
  }
  return raw;
}

/** One automation the audit GROUNDS for this prospect — a structural slice of AutomationProposal
 *  (kept import-free so this Deno-shared module adds no new import chain). `evidence` is what was
 *  actually observed; the paragraph never claims anything without it. */
export interface PitchUpsell { title: string; pitch: string; monthlyPrice: string; evidence: string }

/** The grounded automation upsell paragraph — "website + automation" in one email. Every line is
 *  anchored to an observed signal (the honesty rule); zero upsells → empty string, never filler. */
export function automationUpsellParagraph(upsells: PitchUpsell[]): string {
  const picks = upsells.filter((u) => u.title && u.evidence).slice(0, 2);   // 2 max — an email, not a catalog
  if (!picks.length) return '';
  const lines = picks.map((u) => `— ${u.evidence} ${u.pitch} (from ${u.monthlyPrice})`);
  return `\n\nWhile I was looking, I noticed a couple of things the new site could fix on autopilot:\n${lines.join('\n')}`;
}

/** REPLY-GATED first touch — the deliverability-correct opener. 2025-26 sender data is unambiguous:
 *  a link in email #1 raises spam scores; the winning sequence is teaser → reply → link. Same honest
 *  voice as buildHuntPitch, zero URLs; the link goes out (approval-gated) once they answer. */
export function buildHuntPitchTeaser(profile: BusinessProfile, upsells: PitchUpsell[] = []): string {
  return `Hi${profile.business_name ? ` ${profile.business_name} team` : ''},

I came across ${profile.business_name} while researching ${profile.industry.toLowerCase()} businesses${profile.location ? ` in ${profile.location}` : ''}${profile.current_website_score != null ? ` and noticed your current website may be costing you leads` : ''}.

Rather than just tell you that, I went ahead and built you a new one this week.${automationUpsellParagraph(upsells)}

Want the link? Just reply "send it" and it's yours. No obligation either way.`;
}

/** The deterministic outreach pitch — a byte-for-byte match of engine.ts's generatePitch FALLBACK
 *  (the honest, no-AI copy) when no upsells are passed. A daily automatic order must not depend on
 *  a model call to write mail; this text is specific, truthful, links once, and closes with no
 *  pressure. `upsells` (from detect.ts, each grounded in an observed signal) appends the
 *  website+automation offer — the pitch sells the monthly relationship, not just the rebuild. */
export function buildHuntPitch(profile: BusinessProfile, previewUrl: string, upsells: PitchUpsell[] = []): string {
  return `Hi${profile.business_name ? ` ${profile.business_name} team` : ''},

I came across ${profile.business_name} while researching ${profile.industry.toLowerCase()} businesses${profile.location ? ` in ${profile.location}` : ''}${profile.current_website_score != null ? ` and noticed your current website may be costing you leads` : ''}.

Rather than just tell you that, I built you a new one:

${previewUrl}${automationUpsellParagraph(upsells)}

If you like it, publishing it takes a day. No obligation either way.`;
}

/** The honest one-line record of a day's run for the order's history + the owner's digest.
 *  Reports what was DISCOVERED (real Places businesses added to the lead pool) and what was BUILT
 *  (demos + queued pitches) — the two phases of a daily run. */
export function huntRunLine(label: string, discovered: number, built: number, queued: number): string {
  if (discovered === 0 && built === 0) {
    return `${label}: no new businesses turned up today — those markets look tapped. Will try fresh ones next run.`;
  }
  const parts = [`found ${discovered} new business${discovered === 1 ? '' : 'es'}`];
  if (built > 0) {
    const pitched = queued === 0
      ? 'none had a public email, so nothing was queued to send'
      : `${queued} had a public email and ${queued === 1 ? 'was' : 'were'} queued for your approval`;
    parts.push(`built ${built} demo${built === 1 ? '' : 's'} — ${pitched}`);
  }
  return `${label}: ${parts.join('; ')}. Nothing sent on its own.`;
}
