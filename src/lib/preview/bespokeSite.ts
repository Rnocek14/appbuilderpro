// src/lib/preview/bespokeSite.ts
// PURE core of the BESPOKE site generator (no network/DOM; verified by bespokeSite.verify.ts).
//
// The spec system (previewSpec.ts) is a honesty engine: the AI picks copy/theme/sections and a
// component renderer draws the page, so 500 sites/day stay consistent AND can never invent a claim.
// Its ceiling, though, is "a very good template" — the renderer, not the model, owns the layout.
//
// This module is the OTHER path: Claude writes a bespoke, custom-designed HTML page (uncapped
// ceiling — a real agency-quality site, not a themed template). The danger is that free-form HTML
// bypasses every honesty guard the spec system enforces by construction — a raw generator will
// happily stamp "Licensed & insured", a made-up license number, "22 years", a 5-star rating, or a
// "2-year warranty" onto a REAL business it knows none of those facts about. That is dishonest and a
// liability.
//
// So the honesty is re-imposed here as a GATE, not a hope: buildBespokePrompt hands Claude a strict
// honesty contract, and bespokeHonest() inspects the result. If the HTML asserts any credential,
// rating, tenure, or guarantee that isn't grounded in the prospect's real profile, it is REJECTED —
// the caller falls back to the honest spec. A lie can never ship; worst case we render the safe
// template. The impure side (the vision model call + persistence + publish) wraps these.
//
// Deno-safe leaf (imported by the standing-worker edge function): the value import carries a .ts
// extension, same discipline as billing/clientSale.ts → clientTiers.ts.

import type { BusinessProfile } from '../../../supabase/functions/_shared/previewSpec.ts';

export const BESPOKE_SYSTEM = `You are a senior web designer at a boutique studio. You design a single,
bespoke, conversion-focused landing page for ONE local business and output it as a complete,
self-contained HTML document. This is a custom design — NOT a template. Make deliberate, subject-specific
choices in layout, palette, and type that fit THIS business and trade.

OUTPUT
- Return ONLY a complete HTML document starting with <!doctype html>. No markdown, no code fences, no prose.
- Everything inline: one <style> in <head>, all CSS inline, no external stylesheets, scripts, fonts, or
  images from other hosts (they will be blocked). Use system font stacks. Use only image URLs explicitly
  provided in the brief; if none, design with CSS/type only — never hotlink or invent an image.
- Responsive (mobile-first, flexbox/grid), accessible (labels, visible focus, good contrast), and it must
  look like a real $3–5k agency site, not a page builder.

HONESTY CONTRACT — this is not optional. The business is REAL; you know only what the brief states.
- NEVER claim the business is licensed, insured, bonded, certified, accredited, award-winning, or
  "family-owned since YYYY" unless the brief states it. Do not invent a license number.
- NEVER invent a star rating, review count, years in business, number of jobs, or "trusted by N".
  Use rating/review numbers ONLY if the brief provides them, exactly as given.
- NEVER promise a warranty, guarantee, "money-back", "satisfaction guaranteed", free trip, or specific
  response time unless the brief states it.
- Use the EXACT phone, email, address, hours, and service list from the brief. Put the real phone in
  every tel: link. Do not fabricate an address or hours.
- Trust/credibility copy must be behavioral and true (e.g. "Free, no-obligation quotes", "Serving <the
  real area>", the real services) — not manufactured credentials. When in doubt, leave it out.
The whole point of this demo is to honestly show the owner a better version of THEIR site — a demo that
lies about them is worthless and a liability.`;

/** Compact, grounded brief for one prospect — only real, publishable facts reach the model. */
export function buildBespokePrompt(profile: BusinessProfile): string {
  const pubPhotos = (profile.photos ?? [])
    .filter((p) => p.can_use_in_preview !== false && p.can_publish === true && p.source_type !== 'ai_generated')
    .map((p) => p.url).slice(0, 8);
  const brief: Record<string, unknown> = {
    business_name: profile.business_name,
    industry: profile.industry,
    location: profile.location ?? null,
    service_area: profile.service_area ?? [],
    phone: profile.phone ?? null,
    email: profile.email ?? null,
    hours: profile.hours ?? null,
    services: profile.services ?? [],
    description: profile.description ?? null,
    google_rating: profile.google_rating ?? null,     // use ONLY if present
    review_count: profile.review_count ?? null,        // use ONLY if present
    review_snippets: (profile.review_snippets ?? []).filter((r) => r.can_use_in_preview !== false).slice(0, 4).map((r) => ({ author: r.author ?? 'Customer', text: r.text })),
    publishable_photo_urls: pubPhotos,                 // the ONLY images you may use; [] ⇒ CSS/type only
  };
  return `Design a bespoke landing page for this business. Use ONLY these facts — anything not here is
unknown, so do not state it (re-read the honesty contract). A screenshot of the business's CURRENT
website may be attached; your job is to design a clearly better replacement — modern, mobile, trustworthy —
while keeping every claim grounded in the brief.

BRIEF (JSON):
${JSON.stringify(brief, null, 2)}

Return the complete HTML document now.`;
}

export interface HonestyResult { ok: boolean; violations: string[] }

/** The honesty GATE. Inspect generated HTML for claims not grounded in the profile. Any violation ⇒
 *  ok:false ⇒ the caller must NOT ship this HTML (fall back to the honest spec). Heuristic on purpose,
 *  and it fails toward safety: a false positive costs a bespoke page (we render the template instead),
 *  a lie never reaches a real business. Deterministic + fully unit-testable. */
export function bespokeHonest(html: string, profile: BusinessProfile): HonestyResult {
  const v: string[] = [];
  const hay = (html ?? '').toLowerCase();
  const grounded = [
    profile.description, profile.brand_style, profile.reviews_summary,
    ...(profile.services ?? []), ...(profile.issues ?? []),
    ...(profile.review_snippets ?? []).map((r) => r.text),
  ].filter(Boolean).join(' ').toLowerCase();

  // 1. Credential claims the brief never made.
  for (const term of ['licensed', 'insured', 'bonded', 'certified', 'accredited']) {
    if (hay.includes(term) && !grounded.includes(term)) v.push(`unverified credential: "${term}"`);
  }
  // 2. A made-up license/permit number (codes often start with a letter, e.g. "Lic. #C36-000000").
  if (/\blic(?:ense)?\.?\s*(?:#|no\.?|number)\s*[:#]?\s*[a-z0-9]{2,}/i.test(html) && !/\blic/i.test(grounded)) {
    v.push('invented license number');
  }
  // 3. Tenure ("22 years", "since 1998") with nothing in the brief to support it.
  const tenure = /\b(\d{1,3})\+?\s*(?:years|yrs)\b/i.exec(html) || /\bsince\s+((?:19|20)\d{2})\b/i.exec(html);
  if (tenure && !/\b(?:years|yrs|since\s+(?:19|20)\d{2}|est\.?\s*(?:19|20)\d{2}|decades?)\b/i.test(grounded)) {
    v.push(`unverified tenure: "${tenure[0].trim()}"`);
  }
  // 4. Ratings / review counts the brief doesn't provide.
  if (/\b\d(?:\.\d)?\s*(?:★|stars?\b|\/\s*5\b)/i.test(html) && profile.google_rating == null) v.push('invented star rating');
  if (/\b[\d,]{1,7}\+?\s*(?:reviews|ratings)\b/i.test(html) && !(profile.review_count && profile.review_count > 0)) v.push('invented review count');
  // 5. Warranties / guarantees the brief never promised.
  for (const term of ['warrant', 'guarantee', 'money-back', 'money back', 'satisfaction guaranteed']) {
    if (hay.includes(term) && !grounded.includes(term)) v.push(`unverified promise: "${term}"`);
  }

  // de-dupe while preserving order
  const seen = new Set<string>();
  const violations = v.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
  return { ok: violations.length === 0, violations };
}

/** A generated document is only usable if it's a real, self-contained HTML page (a truncated or
 *  fenced reply must not be published). */
export function looksLikeHtmlDoc(html: string): boolean {
  const s = (html ?? '').trim();
  return /<!doctype html>/i.test(s.slice(0, 200)) && /<\/html>\s*$/i.test(s) && s.length > 200;
}
