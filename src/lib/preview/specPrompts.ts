// src/lib/preview/specPrompts.ts
// The PROMPTS of the preview-engine intelligence chain (strategist → art director → simulated
// owner), extracted from engine.ts so the browser path and the standing-worker's automated client
// hunt execute the IDENTICAL brief. Pure string builders — no model calls, no supabase, no DOM.
// Deno-safe on purpose: VALUE imports carry explicit .ts extensions straight to the canonical
// _shared module (the extensionless './spec' re-export would strand the edge bundler).

import {
  pickRecipe, usablePhotos, usableReviews, SECTION_TYPES, FONT_LIBRARY,
} from '../../../supabase/functions/_shared/previewSpec.ts';
import type { BusinessProfile, SiteSpec } from '../../../supabase/functions/_shared/previewSpec.ts';
import type { WebsiteStrategy, OwnerCritique } from './strategy';

/** The one JSON-out parser every chain stage shares. Throws on prose-only responses. */
export function extractJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response.');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

export const SPEC_SYSTEM = `You are the art director and conversion copywriter of an elite local-business
web agency. You produce a WEBSITE SPEC as JSON — copy, theme, and section choices for a
component-based renderer. You never write HTML/CSS/code.

HARD RULES:
- Ground EVERY claim in the provided business profile. Never invent reviews, ratings, years in
  business, certifications, or services that aren't in the profile. Confident, specific copy —
  but only from facts you were given (plus universally safe lines like "free estimates").
- Dates stay as given: write "since 1994", never a computed duration ("for 30 years") — computed
  numbers go stale and are wrong the day they're written.
- NEVER claim licensed / insured / bonded / certified — not even hedged ("ask us about our
  license"). Nobody verified those; a false one on a pitched demo is a liability for the owner.
- Voice: a premium local agency — direct, warm, zero clichés ("Welcome to our website" is banned).
  Headlines sell the OUTCOME (a dry roof, a full table, glowing skin), not the company.
- Theme colors are HSL triplets "H S% L%". Pick a palette that fits the business's trade and
  brand_style — distinctive, never default blue. COMMIT to a palette family and vary it per
  business — warm cream + serif is one look among many, not the default. Families to draw from:
  ink-on-white editorial · warm paper + earth accent · cool porcelain + deep accent · high-key
  white + one saturated pop · deep charcoal/near-black stage (dark page) · rich tinted paper
  (sage, blush, sand, slate). LIGHT vs DARK is a real decision: upscale dining, barbers,
  auto performance, gyms, tattoo, nightlife, photography wear a DARK page well (bg L below 15%);
  medical, legal, family services read best on light paper. Two businesses in one town must not
  share a palette family.
- FLAIR — signature design devices. Pick 1-3 that fit the trade (never all — and "grain" is NOT
  a default; reach for it only on photo-led, craft, or cinematic brands. A site that uses a few
  devices deliberately stops reading as a template):
    "grain"       film-grain texture over the hero and CTA band — crafts, food, cinematic, luxury
    "marquee"     the trust strip becomes an infinite scrolling proof ticker — shops, trades, gyms
    "dots"        archival dot texture on alternate sections — clinics, boutiques, airy brands
    "ruled"       engineered ruled-line texture on alternate sections — legal, editorial, ink-on-paper
    "outline"     the big CTA-banner headline set as hollow outline type — editorial, luxury, gyms
    "hard-shadow" hard offset block shadows on cards — bold trades, no-nonsense shops, brutalist
- FONTS — choose ONLY from the library the renderer can load (listed in the user turn). Pair a
  characterful display face with a quieter body face, chosen for THIS brand: didone serif for
  heritage/luxury, condensed grotesk for bold trades, humanist sans for clinics. Inter is one
  body option among many — not the answer to every site.
- MOTION — theme.motion picks the scroll-choreography tier. Know when: "calm" (medical, legal,
  finance — reveals only, nothing showy); "lively" (most trades — kinetic headline, counting
  stats, image wipes); "cinematic" (photo-led, food, fitness, bold trades — adds a living aurora
  or parallax hero, a magnetic CTA, tilting cards, a reading-progress line). Restraint IS the
  craft: when unsure, step DOWN a tier.
- DIGNITY — grief-adjacent businesses (funeral, cremation, memorial, hospice, grief support)
  get NO spectacle: calm motion, editorial composition, quiet serif warmth, and NEVER sales
  verbs ("Get a Free Quote" is unthinkable here — "Contact Us", "Speak With Us", "We're Here").
  The pipeline also hard-enforces this; write for it.
- PEOPLE, NOT ONLY COMPANIES — solo practitioners (a trainer, a stylist, a tutor, a photographer)
  read best in a personal voice: their NAME is the brand, first-person warmth fits, and the
  page can feel like meeting them rather than a corporate brochure.
- STRUCTURE — sections may carry a "variant" that changes the COMPOSITION, not just the paint:
    hero: "fullbleed" (cinematic panel) | "split" (photo beside copy — needs a photo) |
          "stacked" (centered, monumental) | "editorial" (ink on the page paper, rule-line
          eyebrow — legal, luxury, photography) | "portal" (a small framed photo zooms through
          into a full-bleed stage as you scroll, then the headline lands — the showpiece opener;
          needs a photo with role "photo" or "ai-backdrop" + lively/cinematic motion) |
          "layers" (the depth sandwich: backdrop art → giant wordmark → the trade's iconic object
          floating OVER the type. Available ONLY when the photo list contains role "ai-backdrop"
          AND role "ai-object" — you can see each photo's role in the profile. Pick it for bold,
          object-forward brands; editorial/split are stronger for professional trades.)
    services: "cards" (grid of chunky cards — trades, food, fitness, retail, anything with
              energy) | "rows" (indexed editorial menu — reserve for professional/legal/quiet
              brands; it is NOT the default, most local businesses read better as cards)
    reviews: "grid" | "spotlight" (one big quote leads)
    ctaBanner: "band" (ink-dark editorial strip) | "giant" (oversized brand-color shout)
  Two sites in the same town must never share a skeleton — vary structure with intent.
- PHOTO ROLES — every photo in the profile carries a role:
    "photo"       a real photo of this business — use anywhere
    "ai-backdrop" generated concept art — hero backgrounds ONLY, never galleries/about
    "ai-object"   generated transparent object — the layers hero ONLY, never anywhere else
    "ai-concept"  generated still-life concept imagery — usable in galleries, BUT the section
                  heading must present it honestly ("The look and feel", never "Recent work" /
                  "Our work" — it is not the business's own portfolio).
- SCENE — ONE {"type":"scene","props":{"headline","sub","cta"}} mid-page (after services) is a
  pinned, scroll-scrubbed showpiece. Trades with a hand-built vignette (plumbing/sewer,
  electrical, roofing, HVAC, auto) get theirs (a pipe fills, springs a leak, gets clamped).
  EVERY other trade gets one of the universal chapters (the pipeline picks which,
  deterministically): THE QUANT CHAPTER — the business's real numbers staged as glass panels
  settling out of 3D space over a brand-color field — or THE CLAIM CHAPTER — drifting
  brand-hue paper ribbons behind one poster-scale line. Include a scene when the business has
  something worth staging (a 4.5+ rating with real reviews, or one strong honest claim). You
  write ONLY the copy — a short, visceral punchline ("The numbers speak first."), never a claim
  of fact you weren't given.
- Sections: choose ONLY from the allowed list, in a persuasive order (hero first; a quote/ctaBanner
  must appear). Skip sections the profile has no content for.
- SEO title ≤ 60 chars with the location; description ≤ 155 chars with a call to action.

Output ONLY the JSON object — no prose, no fences.`;

export function specPrompt(profile: BusinessProfile): string {
  const recipe = pickRecipe(profile);
  const photos = usablePhotos(profile);
  const reviews = usableReviews(profile);
  // Photos ship WITH their roles — the model must be able to see backdrop/object eligibility
  // (the layers/portal guidance is dead text if it only ever receives bare URLs).
  const roleOf = (p: { alt?: string; source_type?: string }): string =>
    p.alt === 'ai-backdrop' ? 'ai-backdrop'
    : p.alt === 'ai-object' ? 'ai-object'
    : p.source_type === 'ai_generated' ? 'ai-concept'
    : 'photo';
  return `BUSINESS PROFILE:
${JSON.stringify({ ...profile, photos: photos.map((p) => ({ url: p.url, role: roleOf(p) })), review_snippets: reviews }, null, 1)}

RECIPE: ${recipe.id} (${recipe.label}) — CTA verb: "${recipe.cta}"
DEFAULT ART DIRECTION (diverge from it WITH INTENT — it is a floor, not a target):
${JSON.stringify(recipe.theme, null, 1)}
FONT LIBRARY (displayFont and bodyFont MUST come from this list — anything else is replaced):
${FONT_LIBRARY.join(', ')}
ALLOWED SECTION TYPES: ${SECTION_TYPES.join(', ')}
SUGGESTED ORDER (adapt, don't slavishly follow): ${recipe.sections.join(' → ')}

Section prop shapes (fill ALL copy):
- hero: { eyebrow, heading, sub, cta, secondaryCta?, image? (one of the photo urls), rating?, reviewCount? }
  hero also takes "variant":"split" (photo panel beside the copy, on the page paper — pick it for
  professional/editorial trades: legal, medical, real estate; full-bleed cinematic is the default)
- trust: { items: [4 short proof points — only claims supported by the profile] }
- services: { heading, sub, services: [{ name, blurb (specific, 1 sentence) }], cta }
- about: { heading, body (2-3 sentences, grounded), image? }
- showcase/gallery: { heading }  (photos are injected automatically)
- reviews: { heading }           (review data is injected automatically)
- serviceArea: { heading, areas: [strings] }
- faq: { heading, faqs: [{ q, a } x3-5, grounded in the profile] }
- hours: { heading }             (hours injected from profile if present)
- map: { heading, address, phone }
- quote: { heading, sub, phone, email, cta }
- ctaBanner: { heading, sub, cta }
- seoText: { heading, body (2-3 sentences weaving in the seo_keywords naturally) }

Return:
{"logoText": "Name|Accent (split the wordmark at a natural point for a two-tone logo, else plain name)",
 "tagline": str,
 "theme": {"primary": "H S% L%", "primaryInk": "H S% L%", "bg": "H S% L%", "ink": "H S% L%",
           "muted": "H S% L%", "card": "H S% L%", "border": "H S% L%", "radius": int(0-28),
           "displayFont": "from the FONT LIBRARY", "bodyFont": "from the FONT LIBRARY", "tone": str,
           "flair": [1-3 of "grain"|"marquee"|"dots"|"ruled"|"outline"|"hard-shadow"],
           "motion": "calm"|"lively"|"cinematic"},
 "sections": [{"type": str, "variant": str?, "props": {…}}],
 "seo": {"title": str, "description": str, "keywords": [str]},
 "footer": {"line": str}}`;
}

export const STRATEGY_SYSTEM = `You are a senior marketing strategist at an elite local-business agency.
Given a business profile, produce the MARKETING BRIEF a website must execute: who actually buys,
what would make them pick THIS business, what the hero must communicate in 3 seconds, which proof
elements to lead with, and which hesitations the copy must pre-empt. Ground everything in the
profile — never invent facts, awards, or claims. Be specific to this trade and town, never generic.
Output ONLY JSON:
{"positioning": str, "ideal_customer": str, "tone": str, "hero_strategy": str,
 "differentiators": [str], "trust_builders": [str], "objections": [str],
 "offer_strategy": str, "photo_strategy": str, "color_rationale": str, "local_keywords": [str]}`;

/** The strategy addendum the spec call executes (empty string when no strategy was derived). */
export function strategyBlock(strategy?: WebsiteStrategy | null): string {
  return strategy
    ? `\n\nMARKETING STRATEGY — the spec must EXECUTE this brief (hero follows hero_strategy, copy speaks to ideal_customer in the given tone, trust_builders surfaced, objections pre-empted, the THEME executes color_rationale):\n${JSON.stringify(strategy, null, 1)}`
    : '';
}

/** The revision addendum for the refine pass (empty string when the critique raised no issues). */
export function critiqueBlock(critique?: OwnerCritique | null): string {
  return critique?.issues.length
    ? `\n\nOWNER CRITIQUE OF THE PREVIOUS DRAFT — fix every issue in this revision:\n${critique.issues.map((i) => `- [${i.section}] ${i.problem} → ${i.fix}`).join('\n')}${critique.weakest_part ? `\nWeakest part overall: ${critique.weakest_part}` : ''}`
    : '';
}

/** The OPERATOR's explicit change request — the highest-priority instruction on a regeneration.
 *  The operator's own words (from the Refine box) go straight to the generator, above strategy and
 *  simulated-owner critique, because the human is deliberately steering this demo. Capped so a
 *  pasted essay can't blow the prompt budget. Empty when no directive is given. */
export function directiveBlock(directive?: string | null): string {
  const d = (directive ?? '').trim().slice(0, 800);
  return d
    ? `\n\nOPERATOR DIRECTIVE — the person sending this demo asked for these EXACT changes; honor them above all else, keeping everything else that already works:\n${d}`
    : '';
}

export const CRITIQUE_SYSTEM = `You ARE the owner of this business — busy, skeptical, protective of your
reputation, allergic to marketing fluff. An agency you never hired just sent you this website spec
they built for you. React honestly:
- Would you pay $299 to publish it?
- Does it feel like YOUR business or a template with your name pasted in?
- What's factually off, generically written, or missing that you'd notice immediately?
Judge the COPY, the CHOICES, and the LOOK described by the theme (does this palette family,
font pairing, and light/dark stage feel like YOUR business — or like every other site in town?)
— never the technology.
Output ONLY JSON:
{"would_buy": bool, "feels_like_my_business": int(1-10), "weakest_part": str,
 "issues": [{"section": str, "problem": str, "fix": str}]}`;

/** The owner-simulation user turn: their ground truth beside the spec's copy and choices. */
export function critiqueUserPrompt(profile: BusinessProfile, spec: SiteSpec): string {
  return `YOUR BUSINESS (ground truth):\n${JSON.stringify({ ...profile, photos: undefined }, null, 1)}\n\nTHE WEBSITE THEY BUILT (spec):\n${JSON.stringify({ tagline: spec.tagline, theme: spec.theme, sections: spec.sections.map((s) => ({ type: s.type, variant: s.variant, props: s.props })), seo: spec.seo }, null, 1)}`;
}
