// src/lib/preview/scrapeProfileCore.ts
// PURE core of the scrape → profile assembler (no supabase/DOM; verified by scrapeProfile.verify.ts).
// The extraction prompt + the two pure transforms — page text → factual fields, and fields + scraped
// assets + audit → a BusinessProfile object. Honest by construction: only extracted facts survive;
// unknowns are omitted, never invented. The impure half (fetch-url + model + ingest) lives in
// scrapeProfile.ts and calls these.

import type { SourcedPhoto } from './spec';

export const EXTRACT_SYSTEM = `You read the scraped text of ONE local business's website and extract a
factual profile. You are NOT writing marketing copy — you are recording only what the page states.

HARD RULES:
- Use ONLY facts present on the page. NEVER invent services, ratings, review counts, years in
  business, certifications, awards, or a location that isn't shown. Unknown → omit the field.
- google_rating / review_count: include ONLY if an actual rating/number of reviews appears on the
  page. If not shown, omit them — do not estimate.
- reviews_summary: only if real testimonials/reviews appear on the page; paraphrase them. If none, omit.
- industry is the trade in 1-3 words (e.g. "Roofing", "Dental practice", "Italian restaurant", "Law firm").
- services: the actual services/offerings named on the page (3-8 short items). If none are named,
  return the single most obvious one for the trade.

Output ONLY this JSON (omit any field you can't ground):
{"business_name": str, "industry": str, "location": str, "services": [str],
 "hours": str, "reviews_summary": str, "google_rating": number, "review_count": number}`;

export interface ExtractedFields {
  business_name: string | null;
  industry: string | null;
  location: string | null;
  services: string[];
  hours: string | null;
  reviews_summary: string | null;
  google_rating: number | null;
  review_count: number | null;
}

const s = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** Tolerant parse of the extractor's JSON into the factual fields (coercion only — no invention). */
export function extractProfileFields(modelText: string): ExtractedFields {
  let p: Record<string, unknown> = {};
  try {
    const clean = modelText.replace(/```json|```/g, '').trim();
    const a = clean.indexOf('{'); const b = clean.lastIndexOf('}');
    if (a !== -1 && b > a) p = JSON.parse(clean.slice(a, b + 1)) as Record<string, unknown>;
  } catch { /* keep {} — buildProfile will report missing required fields */ }
  const services = (Array.isArray(p.services) ? p.services : [])
    .map((x) => s(x, 80)).filter((x): x is string => !!x).slice(0, 8);
  return {
    business_name: s(p.business_name, 120),
    industry: s(p.industry, 60),
    location: s(p.location, 120),
    services,
    hours: s(p.hours, 300),
    reviews_summary: s(p.reviews_summary, 600),
    google_rating: num(p.google_rating),
    review_count: num(p.review_count),
  };
}

export interface ScrapeContext {
  url: string;
  images: string[];          // photo URLs from the prospect's own site (fetch-url 'images')
  email: string | null;      // their published contact email (fetch-url 'contact')
  auditScore: number | null; // siteAudit score
  auditIssues: string[];     // siteAudit signal labels (honest, real checks)
}

/** Merge the extracted fields with the scraped assets + audit into a raw BusinessProfile object.
 *  Photos are can_publish:false — a demo may SHOW the prospect's own images back to them, but
 *  publishing a real site needs owner-provided/licensed assets. Invented facts never appear because
 *  they were never extracted. Returns a raw object for parseBusinessProfile to validate. */
export function buildProfile(fields: ExtractedFields, ctx: ScrapeContext): Record<string, unknown> {
  const photos: SourcedPhoto[] = ctx.images.slice(0, 12).map((url) => ({
    url, source_type: 'website', can_use_in_preview: true, can_publish: false,
  }));
  const raw: Record<string, unknown> = {
    business_name: fields.business_name,
    industry: fields.industry,
    services: fields.services,
    website: ctx.url,
    photos,
  };
  if (fields.location) raw.location = fields.location;
  if (fields.hours) raw.hours = fields.hours;
  if (fields.reviews_summary) raw.reviews_summary = fields.reviews_summary;
  if (fields.google_rating != null) raw.google_rating = fields.google_rating;
  if (fields.review_count != null) raw.review_count = fields.review_count;
  if (ctx.email) raw.email = ctx.email;
  if (ctx.auditScore != null) raw.current_website_score = ctx.auditScore;
  if (ctx.auditIssues.length) raw.issues = ctx.auditIssues.slice(0, 6);
  return raw;
}
