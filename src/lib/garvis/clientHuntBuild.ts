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
): ExtractedFields {
  const name = cleanBusinessName(page.title) ?? cleanBusinessName(fallbackName) ?? fallbackName.trim();
  const trade = titleCase(niche.trim());
  return {
    business_name: name.slice(0, 120),
    industry: trade || 'Local business',
    // One honest, generic service = the trade itself. We never invent a named service list.
    services: [trade || 'Services'],
    location: null,
    hours: null,
    reviews_summary: null,
    google_rating: null,
    review_count: null,
  };
}

export interface HuntProfileInput {
  url: string;
  niche: string;
  fallbackName: string;                                   // the Serper result name (always present)
  page: { title?: string | null; description?: string | null };
  images: string[];                                       // photo URLs from their own site (mode 'images')
  email: string | null;                                   // their published contact email (mode 'contact')
  audit: SiteAudit;                                       // the honest siteAudit of their current site
}

/** Merge the deterministic fields + scraped assets + audit into a raw BusinessProfile object for
 *  parseBusinessProfile to validate. Reuses the exact same buildProfile the interactive scraper uses
 *  (one implementation), so photo provenance + honesty are identical. */
export function buildHuntProfileRaw(input: HuntProfileInput): Record<string, unknown> {
  const fields = fieldsFromPage(input.page, input.niche, input.fallbackName);
  const ctx: ScrapeContext = {
    url: input.url,
    images: input.images,
    email: input.email,
    auditScore: input.audit.reachable ? input.audit.score : null,
    auditIssues: auditIssues(input.audit),
  };
  return buildProfile(fields, ctx);
}

/** The deterministic outreach pitch — a byte-for-byte match of engine.ts's generatePitch FALLBACK
 *  (the honest, no-AI copy). A daily automatic order must not depend on a model call to write mail;
 *  this text is specific, truthful, links once, and closes with no pressure. */
export function buildHuntPitch(profile: BusinessProfile, previewUrl: string): string {
  return `Hi${profile.business_name ? ` ${profile.business_name} team` : ''},

I came across ${profile.business_name} while researching ${profile.industry.toLowerCase()} businesses${profile.location ? ` in ${profile.location}` : ''}${profile.current_website_score != null ? ` and noticed your current website may be costing you leads` : ''}.

Rather than just tell you that, I built you a new one:

${previewUrl}

If you like it, publishing it takes a day. No obligation either way.`;
}

/** The honest one-line record of a day's run for the order's history + the owner's digest. */
export function huntRunLine(label: string, built: number, queued: number): string {
  if (built === 0) return `${label}: no beatable prospects turned up today — nothing built. Will sweep fresh markets tomorrow.`;
  const pitched = queued === 0
    ? 'none had a public email, so nothing was queued to send'
    : `${queued} had a public email and ${queued === 1 ? 'was' : 'were'} queued for your approval`;
  return `${label}: built ${built} demo${built === 1 ? '' : 's'} today — ${pitched}. Nothing sent on its own.`;
}
