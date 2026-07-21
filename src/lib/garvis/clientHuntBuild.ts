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
import { restraintFor } from '../../../supabase/functions/_shared/previewSpec.ts';
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

/** High-LTV verticals whose owners plausibly pay premium rates — the ONLY prospects worth an
 *  upgraded (more expensive) model. The worker uses this with the AI_PREMIUM_MODEL env: unset
 *  (the default) → everyone gets the standard plan model; set → these verticals get the premium
 *  one. Never hardcode an expensive model here. */
export function premiumProspect(industry: string): boolean {
  return /law|attorney|legal|medical|dental|orthodont|surgeon|real estate|realtor|med spa|financ|wealth|account/i.test(industry);
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
export function huntArtPrompts(industry: string, tone?: string | null, paletteHint?: string | null): { backdrop: string; object: string } | null {
  if (restraintFor(industry)) return null;     // dignified categories never get generated imagery
  const obj = HERO_OBJECTS.find(([re]) => re.test(industry))?.[1];
  if (!obj) return null;                       // no iconic object → no layered hero for this trade
  const mood = tone && /calm|airy|luxur|soft|clinical/i.test(tone)
    ? 'soft luminous palette, generous negative space'
    : 'deep dramatic palette, bold sweeping forms';
  // Palette tie-in: the backdrop art carries the SITE's hue family so the hero and theme read
  // as one designed brand instead of a stock image dropped onto a palette it never met.
  const hueName = paletteHint ? paletteHueName(paletteHint) : null;
  const colorLine = hueName ? ` Dominant color family: ${hueName}.` : '';
  return {
    // Deliberate contrast: painterly ART behind, PHOTOREAL object in front — the tactile-object-
    // over-atmosphere composition premium sites use. Never a cartoon object.
    backdrop: `Atmospheric editorial poster artwork: abstract dramatic clouds and sweeping light, ${mood}, painterly illustration style.${colorLine} No people, no text, no words, no logos, no buildings, no recognizable places.`,
    object: `${obj}, photorealistic high-detail studio product photography, floating at a slight angle, crisp edge lighting, sharp focus. Real physical object — not illustrated, not cartoon, not 3D render style. Isolated object only, transparent background, no people, no hands, no text, no logos.`,
  };
}

/** "H S% L%" → a color-family phrase an image model understands. Exported for tests. */
export function paletteHueName(hsl: string): string | null {
  const h = parseFloat(hsl.trim().split(/\s+/)[0]);
  if (!Number.isFinite(h)) return null;
  if (h < 15 || h >= 345) return 'deep red and crimson';
  if (h < 45) return 'burnt orange, copper and amber';
  if (h < 70) return 'warm gold and ochre';
  if (h < 165) return 'deep green and forest tones';
  if (h < 200) return 'teal and sea glass';
  if (h < 250) return 'deep blue and slate';
  if (h < 290) return 'indigo and violet';
  return 'plum and berry tones';
}

/** Two honest, generic still-life prompts (wide hero + tight detail) for a trade with no usable
 *  photos of its own. Hard rules ride in every prompt: no people, no text, no logos, no places —
 *  concept imagery, never fake evidence of "their work". Pure; the worker executes them. */
export function huntImagePrompts(industry: string, tone?: string | null, paletteHint?: string | null): [string, string] | null {
  if (restraintFor(industry)) return null;     // dignified categories never get generated imagery
  const hit = IMAGE_SUBJECTS.find(([re]) => re.test(industry));
  const wide = hit?.[1] ?? `the tools and materials of the ${industry.toLowerCase()} trade arranged as a considered still life`;
  const tight = hit?.[2] ?? `a single tool of the ${industry.toLowerCase()} trade in dramatic close-up`;
  const mood = tone && /calm|airy|luxur|soft|clinical/i.test(tone)
    ? 'Bright, airy editorial photography, generous negative space, soft daylight.'
    : 'Moody editorial photography, deep shadows, one warm key light, cinematic contrast.';
  const hueName = paletteHint ? paletteHueName(paletteHint) : null;
  const colorLine = hueName ? ` Color accents in ${hueName}.` : '';
  const rules = 'No people, no faces, no hands, no text, no words, no logos, no storefronts, no vehicles with markings. Photorealistic.';
  return [
    `Professional wide editorial photograph: ${wide}. ${mood}${colorLine} ${rules}`,
    `Professional macro detail photograph: ${tight}. ${mood}${colorLine} ${rules}`,
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
 *  website+automation offer — the pitch sells the monthly relationship, not just the rebuild.
 *  This is the PLAIN-TEXT body (the email's `text` part + deliverability fallback); the HTML body
 *  that SHOWS the site as a screenshot is buildHuntPitchEmailHtml below. */
export function buildHuntPitch(profile: BusinessProfile, previewUrl: string, upsells: PitchUpsell[] = []): string {
  return `Hi${profile.business_name ? ` ${profile.business_name} team` : ''},

I came across ${profile.business_name} while researching ${profile.industry.toLowerCase()} businesses${profile.location ? ` in ${profile.location}` : ''}${profile.current_website_score != null ? ` and noticed your current website may be costing you leads` : ''}.

Rather than just tell you that, I built you a new one:

${previewUrl}${automationUpsellParagraph(upsells)}

If you like it, publishing it takes a day. No obligation either way.`;
}

// ---------------------------------------------------------------------------
// The HTML pitch — SHOW the site (a real screenshot), don't just link it
// ---------------------------------------------------------------------------

/** Escape text for safe interpolation into the email HTML. Pure (no DOM) so it is Deno-safe and
 *  runs identically in the standing-worker edge function and the browser. Covers the five metachars
 *  that matter in element bodies AND double-quoted attributes, so the same helper is used for both. */
export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The grounded automation offer as an HTML list — the HTML twin of automationUpsellParagraph. Same
 *  honesty rule: every line is anchored to an observed signal (u.evidence); zero upsells → '' (the
 *  email simply omits the block, never shows an empty heading). */
export function automationUpsellHtml(upsells: PitchUpsell[]): string {
  const picks = upsells.filter((u) => u.title && u.evidence).slice(0, 2);   // 2 max — an email, not a catalog
  if (!picks.length) return '';
  const items = picks.map((u) =>
    `<li style="margin:0 0 8px">${escHtml(u.evidence)} <strong>${escHtml(u.pitch)}</strong> <span style="color:#8a8a8f">(from ${escHtml(u.monthlyPrice)})</span></li>`,
  ).join('');
  return `<p style="margin:20px 0 6px;font-size:15px;color:#1c1c1e">While I was looking, I noticed a couple of things the new site could handle on autopilot:</p>
<ul style="margin:0 0 8px;padding-left:20px;font-size:15px;line-height:1.5;color:#3a3a3c">${items}</ul>`;
}

/** The website-in-the-email pitch as an HTML body — the SCREENSHOT of the actual generated site is
 *  the hero (a clickable image, so a prospect SEES the new site in the inbox instead of trusting a
 *  bare link), the same honest copy as buildHuntPitch, and the grounded automation offer underneath.
 *  Pure string-building (Deno-safe, no DOM); the send path appends the CAN-SPAM footer as HTML.
 *
 *  Honesty rails: `screenshotUrl` is a REAL hosted shot of the real preview (never a mockup) — the
 *  worker only calls this when it actually produced one, and falls back to the text pitch otherwise,
 *  so there is never a broken or invented image. `beforeShotUrl`, when present, adds the honest
 *  before/after of their CURRENT live site. The automation line offers only lead_followup — the one
 *  GA capability (registry) — never SMS/missed-call text, which does not exist yet. Email-safe HTML:
 *  inline styles only (clients strip <style>), table-wrapped image, width attr + max-width. */
export function buildHuntPitchEmailHtml(
  profile: BusinessProfile,
  previewUrl: string,
  screenshotUrl: string,
  upsells: PitchUpsell[] = [],
  beforeShotUrl?: string | null,
): string {
  const name = escHtml(profile.business_name);
  const greetName = profile.business_name ? ` ${name} team` : '';
  const industry = escHtml(profile.industry.toLowerCase());
  const where = profile.location ? ` in ${escHtml(profile.location)}` : '';
  const concern = profile.current_website_score != null
    ? ' and noticed your current website may be costing you leads'
    : '';
  const url = escHtml(previewUrl);

  const before = beforeShotUrl
    ? `<p style="margin:22px 0 6px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#8a8a8f">For comparison — your site today</p>
<img src="${escHtml(beforeShotUrl)}" width="360" alt="${name} — current website" style="display:block;width:100%;max-width:360px;border:1px solid #e0e0e4;border-radius:8px"/>`
    : '';

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,system-ui,sans-serif;font-size:15px;line-height:1.55;color:#1c1c1e;max-width:600px;margin:0 auto">
<p style="margin:0 0 12px">Hi${greetName},</p>
<p style="margin:0 0 16px">I came across ${name} while researching ${industry} businesses${where}${concern}. Rather than just tell you that, I built you a new one this week — here it is:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td style="padding:0">
<a href="${url}" style="display:block;border:1px solid #dcdce0;border-radius:10px;overflow:hidden;text-decoration:none">
<img src="${escHtml(screenshotUrl)}" width="600" alt="${name} — new website preview" style="display:block;width:100%;max-width:600px;border:0"/>
</a></td></tr></table>
<p style="margin:16px 0 8px;text-align:center">
<a href="${url}" style="display:inline-block;background:#c8501e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:10px">See the full site (mobile too) &rarr;</a>
</p>
${before}
${automationUpsellHtml(upsells)}
<p style="margin:18px 0 12px">If you like it, publishing it takes a day. I can also set it up to <strong>acknowledge every new enquiry and follow up the quiet ones automatically</strong> — reply and tell me how you run things and I&#39;ll show you exactly what I&#39;d automate.</p>
<p style="margin:0 0 4px">No obligation either way.</p>
</div>`;
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
