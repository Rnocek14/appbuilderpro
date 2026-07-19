// supabase/functions/_shared/previewSpec.ts (canonical; src/lib/preview/spec.ts re-exports this)
// PURE core of the Business Website Preview Engine — the receiving side of the future
// scraper → builder pipeline. A scraper (or a human pasting JSON) supplies a BusinessProfile;
// this module validates it, and assembles/normalizes a SiteSpec: a JSON description of a
// finished website built ONLY from registered sections. The AI decides content and parameters
// (copy, tone, theme, section choice) — it NEVER writes markup, which is what keeps 500
// sites/day consistent, cheap, and impossible to break. No supabase, no model calls here —
// unit-testable (spec.verify.ts).

// ---------------------------------------------------------------------------
// Business profile — the scraper handoff contract
// ---------------------------------------------------------------------------

/** Where a piece of scraped content came from and what we're allowed to do with it.
 *  can_publish=false content may inform summaries/copy but is never reproduced directly. */
export interface ContentSource {
  source_url?: string;
  source_type?: string; // 'google' | 'yelp' | 'facebook' | 'website' | 'owner' | ...
  can_use_in_preview?: boolean; // default true
  can_publish?: boolean;        // default false — publishing needs owner-provided/licensed assets
  attribution_required?: boolean;
  notes?: string;
}

export interface SourcedPhoto extends ContentSource { url: string; alt?: string }
export interface SourcedReview extends ContentSource { author?: string; rating?: number; text: string }

export interface BusinessProfile {
  business_name: string;
  industry: string;
  category?: string;
  location?: string;
  service_area?: string[];
  phone?: string;
  email?: string;
  website?: string;
  social?: Record<string, string>;
  hours?: string | Record<string, string>;
  services: string[];
  photos: SourcedPhoto[];
  logo?: string;
  reviews_summary?: string;
  review_snippets?: SourcedReview[];
  google_rating?: number;
  review_count?: number;
  description?: string;
  current_website_score?: number;
  issues?: string[];
  competitors?: string[];
  brand_style?: string;
  seo_keywords?: string[];
  recommended_site_type?: string;
  recommended_pages?: string[];
  source?: ContentSource; // provenance of the profile itself
}

/** Validate + coerce arbitrary JSON into a BusinessProfile. Returns errors instead of throwing
 *  so the admin UI can show exactly what's wrong with a pasted payload. */
export function parseBusinessProfile(raw: unknown): { profile: BusinessProfile | null; errors: string[] } {
  const errors: string[] = [];
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);

  const business_name = str(r.business_name) ?? str(r.name);
  if (!business_name) errors.push('business_name is required');
  const industry = str(r.industry) ?? str(r.category);
  if (!industry) errors.push('industry is required');
  const services = strArr(r.services);
  if (!services.length) errors.push('services must be a non-empty array of strings');

  const photos: SourcedPhoto[] = (Array.isArray(r.photos) ? r.photos : [])
    .map((p): SourcedPhoto | null => {
      if (typeof p === 'string') return p.trim() ? { url: p.trim() } : null;
      const o = p as Record<string, unknown>;
      const url = str(o?.url);
      return url ? { url, alt: str(o.alt), source_url: str(o.source_url), source_type: str(o.source_type),
        can_use_in_preview: o.can_use_in_preview !== false, can_publish: o.can_publish === true,
        attribution_required: o.attribution_required === true, notes: str(o.notes) } : null;
    })
    .filter((p): p is SourcedPhoto => p !== null);

  const review_snippets: SourcedReview[] = (Array.isArray(r.review_snippets) ? r.review_snippets : [])
    .map((p): SourcedReview | null => {
      const o = p as Record<string, unknown>;
      const text = str(o?.text);
      return text ? { text, author: str(o.author), rating: typeof o.rating === 'number' ? o.rating : undefined,
        source_url: str(o.source_url), source_type: str(o.source_type),
        can_use_in_preview: o.can_use_in_preview !== false, can_publish: o.can_publish === true } : null;
    })
    .filter((p): p is SourcedReview => p !== null);

  if (errors.length) return { profile: null, errors };
  return {
    profile: {
      business_name: business_name!,
      industry: industry!,
      category: str(r.category),
      location: str(r.location),
      service_area: strArr(r.service_area),
      phone: str(r.phone),
      email: str(r.email),
      website: str(r.website),
      social: (typeof r.social === 'object' && r.social ? r.social : undefined) as Record<string, string> | undefined,
      hours: (typeof r.hours === 'string' || (typeof r.hours === 'object' && r.hours)) ? (r.hours as BusinessProfile['hours']) : undefined,
      services,
      photos,
      logo: str(r.logo),
      reviews_summary: str(r.reviews_summary),
      review_snippets,
      google_rating: typeof r.google_rating === 'number' ? r.google_rating : undefined,
      review_count: typeof r.review_count === 'number' ? r.review_count : undefined,
      description: str(r.description),
      current_website_score: typeof r.current_website_score === 'number' ? r.current_website_score : undefined,
      issues: strArr(r.issues),
      competitors: strArr(r.competitors),
      brand_style: str(r.brand_style),
      seo_keywords: strArr(r.seo_keywords),
      recommended_site_type: str(r.recommended_site_type),
      recommended_pages: strArr(r.recommended_pages),
    },
    errors,
  };
}

/** Photos the preview is allowed to show (usage flags honored; can_use_in_preview defaults true). */
export function usablePhotos(profile: BusinessProfile): SourcedPhoto[] {
  return profile.photos.filter((p) => p.can_use_in_preview !== false);
}

/** Review snippets the preview may quote verbatim. When none are usable, sections fall back to
 *  the reviews_summary (a paraphrase — always safe to show). */
export function usableReviews(profile: BusinessProfile): SourcedReview[] {
  return (profile.review_snippets ?? []).filter((r) => r.can_use_in_preview !== false);
}

// ---------------------------------------------------------------------------
// Site spec — what the renderer consumes
// ---------------------------------------------------------------------------

export const SECTION_TYPES = [
  'hero', 'trust', 'services', 'about', 'showcase', 'gallery', 'reviews',
  'serviceArea', 'faq', 'hours', 'map', 'quote', 'ctaBanner', 'seoText', 'scene',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** TRADE SCENES — hand-built scroll-scrubbed vignettes (a pipe that fills, springs a leak, and
 *  gets clamped; a wire that lights a bulb; rain deflecting off new shingles…). The AI writes ONLY
 *  the punchline copy; the visual is picked deterministically from the trade here, so quality is
 *  guaranteed by construction and a trade with no scene simply gets none. Max one per page. */
export const SCENE_KINDS = ['pipe', 'circuit', 'rain', 'thermostat', 'gauge', 'glass', 'ribbon'] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** The universal chapter for trades without a hand-built vignette: the business name hashes
 *  into 'glass' (observed stats staged as 3D panels) or 'ribbon' (drifting brand-hue paper
 *  strips behind a poster-scale claim). Glass needs 2+ real stats to earn its runway — thin
 *  data falls to ribbon, which stages the CLAIM, so every eligible page still gets a
 *  showpiece. Deterministic: the same business always renders the same chapter. */
export function universalChapter(businessName: string, statCount: number): SceneKind {
  const pick = nameHash(`${businessName}:chapter`) % 2 === 0 ? 'glass' : 'ribbon';
  return pick === 'glass' && statCount < 2 ? 'ribbon' : pick;
}

/** APPROPRIATENESS GUARD — some businesses must never get spectacle. For grief-adjacent
 *  categories the page is calm by construction: no marquee, no scenes, no giant type, no
 *  showpiece heroes, no sales-y verbs, no generated imagery. Enforced in normalizeSpec AND the
 *  fallback — a model choice can never override it. */
export function restraintFor(industry: string): 'dignified' | null {
  return /funeral|cremation|cremator|memorial|hospice|grief|bereave|cemetery|mortuar|obituar|palliative/i.test(industry)
    ? 'dignified' : null;
}

/** In-place enforcement of the dignified guard on a theme + section list (shared by the
 *  normalizer and the fallback assembler). Returns the filtered section list. */
export function applyRestraint(theme: ThemeSpec, sections: SectionSpec[], industry: string): SectionSpec[] {
  if (!restraintFor(industry)) return sections;
  theme.motion = 'calm';
  theme.flair = (theme.flair ?? []).filter((f) => f === 'dots' || f === 'ruled').slice(0, 1);
  const out = sections.filter((s) => s.type !== 'scene');
  for (const s of out) {
    if (s.type === 'hero') s.variant = s.variant === 'split' ? 'split' : 'editorial';
    if (s.type === 'ctaBanner') s.variant = 'band';
  }
  return out;
}

export function sceneKindFor(industry: string): SceneKind | null {
  const s = industry.toLowerCase();
  if (/plumb|sewer|drain|septic/.test(s)) return 'pipe';
  if (/electric/.test(s)) return 'circuit';
  if (/roof|gutter/.test(s)) return 'rain';
  if (/hvac|heating|cooling|air condition|furnace/.test(s)) return 'thermostat';
  if (/auto|mechanic|tire|transmission|oil change|brake/.test(s)) return 'gauge';
  // Every other trade gets THE QUANT CHAPTER — floating glass stat cards built from the
  // business's observed numbers. Universal because the data rides in from the profile; the
  // normalizer drops the scene when there aren't at least two real stats to stage, and
  // restraint strips it entirely for dignified categories.
  return 'glass';
}

/** The observed numbers the glass chapter may stage — every card is a fact from the profile,
 *  never a synthesized claim. Fewer than two facts → the chapter doesn't earn its runway. */
export function glassStats(profile: BusinessProfile): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  if (profile.google_rating != null) {
    out.push({ value: `${profile.google_rating.toFixed(1)}★`, label: 'Google rating' });
  }
  if (profile.review_count != null && profile.review_count > 0) {
    out.push({ value: String(profile.review_count), label: 'Google reviews' });
  }
  const since = /\bsince\s+((?:19|20)\d{2})\b/i.exec(profile.description ?? '')?.[1];
  if (since) out.push({ value: `Since ${since}`, label: 'serving the area' });
  if (profile.services.length >= 3) {
    out.push({ value: String(profile.services.length), label: 'services offered' });
  }
  if (profile.service_area && profile.service_area.length >= 2) {
    out.push({ value: String(profile.service_area.length), label: 'communities served' });
  }
  return out.slice(0, 4);
}

/** Deterministic scene copy — behavioral punchlines, no claims. The floor when the model writes
 *  none; the model may sharpen them but the visual choreography is fixed per kind. */
export const SCENE_COPY: Record<SceneKind, { headline: string; sub: string }> = {
  pipe: { headline: "Leaks don't wait.", sub: 'A slow drip becomes a flood on its own schedule — and gets fixed on ours.' },
  circuit: { headline: 'Power, back where it belongs.', sub: 'From dead outlet to lit room — done safely, the first time.' },
  rain: { headline: 'Ready before the next storm.', sub: 'New shingles shed the weather your old roof lets through.' },
  thermostat: { headline: 'Comfort, dialed in.', sub: 'From sweltering to just right — and it holds.' },
  gauge: { headline: 'Green across the board.', sub: 'From warning light to road-ready.' },
  glass: { headline: 'The numbers speak first.', sub: 'What the neighbors already know.' },
  ribbon: { headline: "Some things you can't fake.", sub: 'Reputation is earned one job at a time.' },
};

export interface SectionSpec {
  type: SectionType;
  variant?: string;
  /** All copy/data the section renders — filled by the model (or the fallback assembler). */
  props: Record<string, unknown>;
}

/** SIGNATURE DEVICES — the personality toolkit ported from the app builder's theme system
 *  (themePresets.ts PERSONALITY_CSS). A site that uses 2-3 of these stops reading as "AI
 *  template"; the renderer activates each purely presentationally. Whitelist-validated. */
export const FLAIR_DEVICES = ['grain', 'marquee', 'dots', 'ruled', 'outline', 'hard-shadow'] as const;
export type FlairDevice = (typeof FLAIR_DEVICES)[number];

/** MOTION TIER — "know when to use the scroll effects" as a contract, not taste. The renderer
 *  gates the award-kit moves by tier (DESIGN_GUIDE restraint: one signature move, calm trades
 *  stay calm): calm = reveals only (medical, legal); lively = TextReveal headline + CountUp
 *  stats + image wipes (default); cinematic = lively + aurora/parallax hero + magnetic CTA +
 *  tilt cards + scroll progress (photo-led and bold trades). */
export const MOTION_TIERS = ['calm', 'lively', 'cinematic'] as const;
export type MotionTier = (typeof MOTION_TIERS)[number];

/** Structural variants per section — different COMPOSITIONS, not palette swaps. Whitelisted here;
 *  normalizeSpec drops anything else and falls back to the recipe's default composition. */
export const SECTION_VARIANTS: Partial<Record<string, readonly string[]>> = {
  hero: ['fullbleed', 'split', 'stacked', 'editorial', 'portal', 'layers'],
  services: ['cards', 'rows'],
  reviews: ['grid', 'spotlight'],
  ctaBanner: ['band', 'giant'],
};

export interface ThemeSpec {
  /** HSL triplets, "H S% L%" (token style) — validated; renderer wraps in hsl(). */
  primary: string;
  primaryInk: string;   // text on primary
  bg: string;           // page background (the "paper")
  ink: string;          // primary text
  muted: string;        // secondary text
  card: string;         // raised surface
  border: string;
  radius: number;       // px 0-28
  displayFont: string;  // Google Font
  bodyFont: string;     // Google Font
  tone: string;         // one-line art direction ("trustworthy local craftsman")
  /** 0-3 signature devices; the AI picks to fit the trade, recipes carry defaults. */
  flair?: FlairDevice[];
  /** Scroll/motion tier — gates the award-kit moves per DESIGN_GUIDE restraint rules. */
  motion?: MotionTier;
}

export interface SiteSpec {
  version: 1;
  recipe: string;
  business_name: string;
  logoText: string;      // wordmark text (may include an accent split, e.g. "Joe's|Roofing")
  tagline: string;
  theme: ThemeSpec;
  nav: { label: string; anchor: string }[];
  sections: SectionSpec[];
  seo: { title: string; description: string; keywords: string[] };
  footer: { line: string };
  /** Any photo in the spec is AI-generated concept imagery → the footer discloses it. */
  aiImagery?: boolean;
}

const HSL_RE = /^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Vetted Google Fonts the renderer can actually load. A model-invented face used to pass the
 *  old shape-only regex, 404 at fonts.googleapis.com, and silently render as system sans — the
 *  worst possible outcome for a "premium" demo. Off-list → the recipe's pairing. */
export const FONT_LIBRARY: readonly string[] = [
  // display serifs / didones / slabs
  'Playfair Display', 'Cormorant Garamond', 'Fraunces', 'DM Serif Display', 'Newsreader',
  'Gloock', 'Libre Caslon Text', 'Lora', 'Bitter', 'Source Serif 4', 'Spectral', 'Marcellus',
  'Libre Bodoni', 'Instrument Serif', 'Young Serif', 'Abril Fatface', 'Zilla Slab',
  // display sans / grotesks / condensed
  'Sora', 'Archivo', 'Oswald', 'Barlow Condensed', 'Bricolage Grotesque', 'Schibsted Grotesk',
  'Space Grotesk', 'Anton', 'Bebas Neue', 'Unbounded', 'Syne', 'Clash Display', 'Outfit',
  // body faces
  'Inter', 'Figtree', 'Hanken Grotesk', 'Onest', 'Source Sans 3', 'DM Sans', 'Lato', 'Jost',
  'Nunito', 'Work Sans', 'Manrope', 'Public Sans', 'Karla', 'Epilogue', 'Mulish', 'Albert Sans',
];
const FONT_SET = new Set(FONT_LIBRARY.map((f) => f.toLowerCase()));

// ---------------------------------------------------------------------------
// Industry recipes — section order + default art direction per vertical
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string;
  label: string;
  /** Match against profile.industry/category/recommended_site_type (lowercased substring). */
  match: string[];
  sections: SectionType[];
  theme: ThemeSpec;
  /** Section CTA verb — "Get a Free Quote" vs "Book a Table" vs "Book Now". */
  cta: string;
  /** Default structural compositions per section — the fallback's look and the normalizer's
   *  floor when the model names no (or an invalid) variant. Different verticals get genuinely
   *  different page architecture, not a palette swap. */
  variants?: Partial<Record<SectionType, string>>;
}

export const RECIPES: Recipe[] = [
  {
    id: 'contractor_lead_gen',
    label: 'Contractor / Home Services',
    match: ['roof', 'contractor', 'hvac', 'plumb', 'landscap', 'electric', 'construction', 'remodel', 'paint', 'garage', 'fence', 'concrete', 'handyman', 'pest', 'clean', 'lawn', 'tree', 'gutter', 'window', 'floor', 'carpet', 'junk', 'moving', 'pressure wash', 'appliance', 'locksmith', 'pool'],
    sections: ['hero', 'trust', 'services', 'scene', 'showcase', 'about', 'reviews', 'serviceArea', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '16 78% 44%', primaryInk: '24 40% 98%', bg: '36 30% 97%', ink: '24 24% 12%',
      muted: '24 10% 40%', card: '36 20% 99.5%', border: '30 18% 88%', radius: 8,
      displayFont: 'Sora', bodyFont: 'Inter', tone: 'trustworthy local craftsman — bold, direct, proof-forward', flair: ['marquee', 'hard-shadow'], motion: 'cinematic',
    },
    cta: 'Get a Free Quote',
    variants: { services: 'cards', ctaBanner: 'band' },
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Café',
    match: ['restaurant', 'cafe', 'café', 'pizzeria', 'diner', 'bistro', 'bakery', 'bar', 'grill', 'taco', 'sushi', 'coffee', 'food'],
    sections: ['hero', 'about', 'services', 'gallery', 'reviews', 'hours', 'map', 'faq', 'ctaBanner', 'seoText'],
    theme: {
      primary: '350 62% 38%', primaryInk: '30 40% 97%', bg: '38 42% 96%', ink: '20 30% 13%',
      muted: '24 14% 38%', card: '40 40% 99%', border: '34 24% 87%', radius: 4,
      displayFont: 'Fraunces', bodyFont: 'Hanken Grotesk', tone: 'warm, appetizing, editorial — food photography leads', flair: ['grain', 'marquee'], motion: 'cinematic',
    },
    cta: 'Reserve a Table',
    variants: { hero: 'stacked', reviews: 'spotlight', ctaBanner: 'giant' },
  },
  {
    id: 'salon_spa',
    label: 'Med Spa / Salon / Wellness',
    match: ['spa', 'salon', 'beauty', 'nail', 'hair', 'lash', 'massage', 'wellness', 'aesthetic', 'skin', 'barber', 'yoga'],
    sections: ['hero', 'services', 'about', 'gallery', 'reviews', 'trust', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '160 30% 32%', primaryInk: '150 20% 98%', bg: '80 20% 97%', ink: '160 18% 14%',
      muted: '160 8% 42%', card: '80 24% 99.5%', border: '90 12% 88%', radius: 20,
      displayFont: 'Cormorant Garamond', bodyFont: 'Figtree', tone: 'calm, luxurious, airy — whitespace and softness', flair: ['grain', 'dots'], motion: 'lively',
    },
    cta: 'Book Now',
    variants: { hero: 'stacked', reviews: 'spotlight' },
  },
  {
    id: 'auto_services',
    label: 'Auto Repair / Detailing / Tires',
    match: ['auto', 'mechanic', 'tire', 'detail', 'car wash', 'body shop', 'transmission', 'oil change', 'towing', 'collision'],
    sections: ['hero', 'trust', 'services', 'scene', 'showcase', 'reviews', 'about', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '210 90% 40%', primaryInk: '210 30% 98%', bg: '220 14% 96%', ink: '220 24% 12%',
      muted: '220 8% 40%', card: '220 10% 99.5%', border: '220 12% 87%', radius: 6,
      displayFont: 'Archivo', bodyFont: 'Inter', tone: 'competent, no-nonsense shop — steel blue, bold type, proof up front', flair: ['hard-shadow', 'marquee'], motion: 'lively',
    },
    cta: 'Get an Estimate',
    variants: { services: 'rows' },
  },
  {
    id: 'dental_medical',
    label: 'Dental / Medical / Clinics',
    match: ['dental', 'dentist', 'orthodont', 'medical', 'clinic', 'chiro', 'physio', 'therapy', 'optom', 'veterinar', 'pediatric', 'urgent care', 'eye care'],
    sections: ['hero', 'trust', 'services', 'about', 'reviews', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '190 65% 34%', primaryInk: '190 30% 98%', bg: '195 35% 97.5%', ink: '200 30% 13%',
      muted: '200 12% 42%', card: '195 30% 99.5%', border: '195 20% 89%', radius: 12,
      displayFont: 'Schibsted Grotesk', bodyFont: 'Hanken Grotesk', tone: 'calm clinical trust — clean teal, generous whitespace, credentials visible', flair: ['dots'], motion: 'calm',
    },
    cta: 'Book an Appointment',
    variants: { services: 'cards' },
  },
  {
    id: 'care_services',
    label: 'Funeral / Memorial / Care',
    match: ['funeral', 'cremation', 'memorial', 'hospice', 'grief', 'bereavement', 'cemetery', 'mortuary', 'palliative'],
    sections: ['hero', 'about', 'services', 'reviews', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '210 20% 30%', primaryInk: '40 30% 97%', bg: '40 22% 97.5%', ink: '215 22% 15%',
      muted: '215 10% 44%', card: '40 18% 99.5%', border: '40 12% 89%', radius: 4,
      displayFont: 'Cormorant Garamond', bodyFont: 'Source Sans 3', tone: 'quiet dignity — slate on warm paper, serif calm, nothing raised above a whisper', flair: ['ruled'], motion: 'calm',
    },
    cta: 'Contact Us',
    variants: { hero: 'editorial', services: 'rows', reviews: 'spotlight', ctaBanner: 'band' },
  },
  {
    id: 'legal_professional',
    label: 'Legal / Accounting / Professional',
    match: ['law', 'attorney', 'legal', 'account', 'cpa', 'tax', 'insurance', 'financ', 'consult', 'notary', 'advisor'],
    sections: ['hero', 'about', 'services', 'trust', 'reviews', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '222 40% 24%', primaryInk: '40 40% 96%', bg: '40 25% 97%', ink: '222 30% 12%',
      muted: '222 10% 40%', card: '40 20% 99.5%', border: '40 14% 88%', radius: 2,
      displayFont: 'Newsreader', bodyFont: 'Figtree', tone: 'established counsel — ink navy on warm paper, serif authority, restraint', flair: ['ruled', 'outline'], motion: 'calm',
    },
    cta: 'Request a Consultation',
    variants: { hero: 'editorial', services: 'rows', reviews: 'spotlight' },
  },
  {
    id: 'real_estate',
    label: 'Real Estate / Property',
    match: ['real estate', 'realtor', 'realty', 'property', 'broker', 'homes', 'apartment', 'mortgage'],
    sections: ['hero', 'showcase', 'about', 'trust', 'reviews', 'serviceArea', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '30 45% 38%', primaryInk: '36 40% 97%', bg: '36 22% 97.5%', ink: '28 26% 12%',
      muted: '28 10% 42%', card: '36 24% 99.5%', border: '32 16% 88%', radius: 0,
      displayFont: 'Fraunces', bodyFont: 'Figtree', tone: 'quiet luxury listing — bronze on cream, editorial serif, photography leads', flair: ['outline', 'grain'], motion: 'lively',
    },
    cta: 'Schedule a Showing',
    variants: { hero: 'editorial', reviews: 'spotlight', ctaBanner: 'giant' },
  },
  {
    id: 'fitness',
    label: 'Gym / Fitness / Martial Arts',
    match: ['gym', 'fitness', 'crossfit', 'martial', 'karate', 'jiu', 'boxing', 'pilates', 'training', 'dance', 'swim'],
    sections: ['hero', 'services', 'trust', 'showcase', 'reviews', 'about', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '80 85% 45%', primaryInk: '80 60% 8%', bg: '220 12% 10%', ink: '60 15% 95%',
      muted: '220 6% 62%', card: '220 12% 14%', border: '220 10% 22%', radius: 8,
      displayFont: 'Archivo', bodyFont: 'Inter', tone: 'committed-dark energy — near-black, one electric lime accent, hard type', flair: ['outline', 'grain', 'marquee'], motion: 'cinematic',
    },
    cta: 'Start Free Trial',
    variants: { hero: 'stacked', ctaBanner: 'giant' },
  },
  {
    id: 'retail_boutique',
    label: 'Retail / Boutique / Florist',
    match: ['boutique', 'retail', 'store', 'shop', 'florist', 'floral', 'flower', 'gift', 'jewel', 'antique', 'bookstore', 'furniture'],
    sections: ['hero', 'gallery', 'about', 'services', 'reviews', 'hours', 'map', 'faq', 'ctaBanner', 'seoText'],
    theme: {
      primary: '335 45% 40%', primaryInk: '340 30% 98%', bg: '30 30% 97.5%', ink: '335 20% 14%',
      muted: '335 8% 44%', card: '30 26% 99.5%', border: '30 16% 89%', radius: 14,
      displayFont: 'Bricolage Grotesque', bodyFont: 'Onest', tone: 'warm curated shop — berry accent on cream, product photography first', flair: ['dots', 'marquee'], motion: 'lively',
    },
    cta: 'Visit the Shop',
    variants: { hero: 'stacked' },
  },
  {
    id: 'pet_care',
    label: 'Pet Care / Grooming / Boarding',
    match: ['pet', 'dog', 'cat', 'groom', 'kennel', 'boarding', 'daycare', 'walker', 'animal', 'dog training', 'dog train'],
    sections: ['hero', 'services', 'gallery', 'reviews', 'about', 'trust', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '25 85% 50%', primaryInk: '30 50% 98%', bg: '45 40% 97%', ink: '30 26% 13%',
      muted: '30 10% 42%', card: '45 36% 99.5%', border: '40 20% 87%', radius: 18,
      displayFont: 'Bricolage Grotesque', bodyFont: 'Figtree', tone: 'joyful and trustworthy — sunny orange, rounded softness, real pet photos', flair: ['dots', 'marquee'], motion: 'lively',
    },
    cta: 'Book a Visit',
    variants: { services: 'cards' },
  },
  {
    id: 'photography_events',
    label: 'Photography / Events / Venues',
    match: ['photo', 'videograph', 'wedding', 'event', 'venue', 'dj', 'catering', 'planner', 'studio'],
    sections: ['hero', 'gallery', 'about', 'showcase', 'reviews', 'faq', 'quote', 'ctaBanner', 'seoText'],
    theme: {
      primary: '42 50% 52%', primaryInk: '40 40% 8%', bg: '240 8% 8%', ink: '40 20% 94%',
      muted: '240 5% 60%', card: '240 8% 12%', border: '240 6% 20%', radius: 0,
      displayFont: 'Gloock', bodyFont: 'Hanken Grotesk', tone: 'gallery dark — near-black stage, champagne accent, the work IS the site', flair: ['grain', 'outline'], motion: 'cinematic',
    },
    cta: 'Check My Date',
    variants: { hero: 'editorial', ctaBanner: 'giant' },
  },
];

/** Pick the recipe for a profile — recommended_site_type wins, then industry/category keywords,
 *  else the contractor recipe (the most universal local-service layout).
 *  Keywords match only at WORD START and the LONGEST match wins: raw substring matching sent
 *  barbers to the restaurant recipe ('bar' inside "Barbering"), lawn care to the law firm
 *  ('law' inside "Lawn"), and carpet cleaners to pet care ('pet' inside "carpet"). */
export function pickRecipe(profile: BusinessProfile): Recipe {
  const hints = [profile.recommended_site_type, profile.industry, profile.category]
    .filter(Boolean).join(' ').toLowerCase();
  const byId = RECIPES.find((r) => hints.includes(r.id));
  if (byId) return byId;
  const wordStart = (m: string) => {
    const i = hints.indexOf(m);
    for (let at = i; at !== -1; at = hints.indexOf(m, at + 1)) {
      const before = at === 0 ? ' ' : hints[at - 1];
      if (!/[a-z0-9]/.test(before)) return true;
    }
    return false;
  };
  let best: Recipe | null = null;
  let bestLen = 0;
  for (const r of RECIPES) {
    for (const m of r.match) {
      if (m.length > bestLen && wordStart(m)) { best = r; bestLen = m.length; }
    }
  }
  return best ?? RECIPES[0];
}

/** Deterministic per-business variant rotation — the anti-sameness seed. When the model names
 *  no (or an invalid) variant, the OLD behavior collapsed every site in a vertical to the
 *  recipe's single default composition (20-run finding: ctaBanner "giant" on 20/20). Now the
 *  business name hashes into the valid pool, so neighbors get different skeletons by
 *  construction while the same business always re-renders identically. The showpiece heroes
 *  (portal/layers) stay opt-in — they need specific assets/motion and are chosen by intent. */
export function seededVariant(businessName: string, type: SectionType, recipe: Recipe): string | undefined {
  const opts = SECTION_VARIANTS[type];
  if (!opts?.length) return recipe.variants?.[type];
  const pool = type === 'hero' ? opts.filter((v) => v !== 'portal' && v !== 'layers') : opts;
  if (!pool.length) return recipe.variants?.[type];
  return pool[nameHash(`${businessName}:${type}`) % pool.length];
}

// ---------------------------------------------------------------------------
// Normalization — the safety net between the model and the renderer
// ---------------------------------------------------------------------------

/**
 * Coerce a model-produced (or hand-written) spec into something the renderer can ALWAYS draw:
 * unknown section types are dropped, the theme is validated field-by-field against the recipe's
 * defaults, usage-flagged photos/reviews are re-filtered from the PROFILE (the model may not be
 * trusted to honor flags), a hero is guaranteed first and a conversion CTA guaranteed present.
 */
export function normalizeSpec(raw: unknown, profile: BusinessProfile): SiteSpec {
  const recipe = pickRecipe(profile);
  const fallback = assembleFallbackSpec(profile);
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, dflt: string): string => (typeof v === 'string' && v.trim() ? v.trim() : dflt);

  // theme: accept only valid fields, else recipe default
  const t = (r.theme ?? {}) as Record<string, unknown>;
  // HSL: shape AND range — "720 300% 50%" hue-wraps into a color the model never intended.
  const hsl = (v: unknown, dflt: string) => {
    if (typeof v !== 'string' || !HSL_RE.test(v.trim())) return dflt;
    const [h, sPct, l] = v.trim().split(/\s+/).map(parseFloat);
    return h <= 360 && sPct <= 100 && l <= 100 ? v.trim() : dflt;
  };
  // Fonts: must be in the vetted library — an invented face 404s at Google Fonts and silently
  // renders as system sans, which is worse than any real fallback.
  const font = (v: unknown, dflt: string) => {
    if (typeof v !== 'string') return dflt;
    const name = v.trim();
    return FONT_SET.has(name.toLowerCase())
      ? FONT_LIBRARY.find((f) => f.toLowerCase() === name.toLowerCase()) ?? dflt
      : dflt;
  };
  // flair: whitelist-filtered signature devices, capped at 3; absent OR entirely invalid → the
  // recipe's defaults (never zero personality). An unknown device name is dropped, never rendered.
  const flairFiltered = Array.isArray(t.flair)
    ? (t.flair as unknown[]).filter((f): f is FlairDevice => FLAIR_DEVICES.includes(f as FlairDevice)).slice(0, 3)
    : null;
  const rawFlair = flairFiltered?.length ? flairFiltered : null;
  const theme: ThemeSpec = {
    primary: hsl(t.primary, recipe.theme.primary),
    primaryInk: hsl(t.primaryInk, recipe.theme.primaryInk),
    bg: hsl(t.bg, recipe.theme.bg),
    ink: hsl(t.ink, recipe.theme.ink),
    muted: hsl(t.muted, recipe.theme.muted),
    card: hsl(t.card, recipe.theme.card),
    border: hsl(t.border, recipe.theme.border),
    radius: Number.isFinite(t.radius as number) ? clamp(t.radius as number, 0, 28) : recipe.theme.radius,
    displayFont: font(t.displayFont, recipe.theme.displayFont),
    bodyFont: font(t.bodyFont, recipe.theme.bodyFont),
    tone: str(t.tone, recipe.theme.tone),
    flair: rawFlair ?? recipe.theme.flair ?? [],
    motion: MOTION_TIERS.includes(t.motion as MotionTier) ? (t.motion as MotionTier) : (recipe.theme.motion ?? 'lively'),
  };

  // sections: keep known types only, in given order; re-inject photo/review data from the
  // PROFILE with usage flags applied (never trust the model to have honored them).
  const allUsable = usablePhotos(profile);
  // Dignified categories never show generated imagery — not as backdrop, object, OR still-life.
  const photos = restraintFor(profile.industry)
    ? allUsable.filter((p) => p.source_type !== 'ai_generated')
    : allUsable;
  // Role-tagged AI assets belong to the layers hero ONLY. The transparent object must never
  // appear as a "content photo" (a floating wrench in the about section — 20-site review
  // finding); the abstract backdrop may serve as a hero background but never galleries/about.
  const contentPhotos = photos.filter((p) => p.alt !== 'ai-backdrop' && p.alt !== 'ai-object');
  const heroBackdrop = photos.find((p) => p.alt === 'ai-backdrop');
  const reviews = usableReviews(profile);
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  const seenTypes = new Set<SectionType>();
  let sections: SectionSpec[] = rawSections
    .map((s): SectionSpec | null => {
      const o = s as Record<string, unknown>;
      const type = o?.type as SectionType;
      if (!SECTION_TYPES.includes(type)) return null;
      if (seenTypes.has(type)) return null; // two heroes / three ctaBanners never render
      seenTypes.add(type);
      const props = (typeof o.props === 'object' && o.props !== null ? o.props : {}) as Record<string, unknown>;
      // A model-written props.variant would ride the props spread past the whitelist — strip it.
      delete props.variant;
      // variant: whitelist-checked; unknown/absent → seeded rotation through the valid pool, so
      // unspecified choices produce per-business VARIETY instead of one per-vertical default.
      const allowed = SECTION_VARIANTS[type];
      const variant = (typeof o.variant === 'string' && allowed?.includes(o.variant))
        ? o.variant
        : seededVariant(profile.business_name, type, recipe);
      return { type, variant, props };
    })
    .filter((s): s is SectionSpec => s !== null);
  if (!sections.length) sections = fallback.sections;

  // conversion floor: hero first, at least one quote/ctaBanner present
  if (sections[0]?.type !== 'hero') {
    const heroIdx = sections.findIndex((s) => s.type === 'hero');
    if (heroIdx > 0) sections.unshift(...sections.splice(heroIdx, 1));
    else sections.unshift(fallback.sections[0]);
  }
  if (!sections.some((s) => s.type === 'quote' || s.type === 'ctaBanner')) {
    sections.push(fallback.sections.find((s) => s.type === 'ctaBanner') ?? { type: 'ctaBanner', props: { heading: recipe.cta, cta: recipe.cta } });
  }

  // enforce usage-flag data on the sections that show scraped content
  for (const s of sections) {
    if (s.type === 'hero') {
      const img = typeof s.props.image === 'string' ? s.props.image : undefined;
      s.props.image = img && (contentPhotos.some((p) => p.url === img) || img === heroBackdrop?.url)
        ? img
        : contentPhotos[0]?.url ?? heroBackdrop?.url;
      // Layered depth-sandwich assets ride in by ROLE, never by model-supplied URL: the worker
      // tags the generated pair alt 'ai-backdrop'/'ai-object'; both present → the 'layers' hero
      // can render. A layers variant without both falls back in the renderer.
      s.props.bgImage = heroBackdrop?.url;
      s.props.objectImage = photos.find((p) => p.alt === 'ai-object')?.url;
      // The REAL phone rides into the hero so the call button dials it — never digits parsed out
      // of an AI-written button label ("Call us today" → dead tel: link).
      if (profile.phone) s.props.phone = profile.phone;
    }
    if (s.type === 'about') {
      // about.image is model-suggested — allow only real content photos (no role assets).
      const aImg = typeof s.props.image === 'string' ? s.props.image : undefined;
      s.props.image = aImg && contentPhotos.some((p) => p.url === aImg)
        ? aImg
        : contentPhotos[1]?.url ?? contentPhotos[0]?.url;
    }
    if (s.type === 'gallery' || s.type === 'showcase') {
      s.props.photos = contentPhotos.map((p) => ({ url: p.url, alt: p.alt ?? profile.business_name }));
    }
    if (s.type === 'reviews') {
      s.props.reviews = reviews.map((x) => ({ author: x.author ?? 'Verified customer', rating: x.rating ?? 5, text: x.text }));
      if (!reviews.length) s.props.summary = profile.reviews_summary ?? '';
      s.props.googleRating = profile.google_rating;
      s.props.reviewCount = profile.review_count;
    }
    // Contact/data sections carry PROFILE truth, never model transcription — a mistyped phone
    // is a dead tel: link on the one section built to convert. (The prompt has promised this
    // injection since day one; it now actually happens.)
    if (s.type === 'hours' && profile.hours) s.props.hours = profile.hours;
    if (s.type === 'quote') {
      if (profile.phone) s.props.phone = profile.phone;
      if (profile.email) s.props.email = profile.email;
    }
    if (s.type === 'map') {
      if (profile.location) s.props.address = profile.location;
      if (profile.phone) s.props.phone = profile.phone;
    }
    if (s.type === 'serviceArea' && profile.service_area?.length) s.props.areas = profile.service_area;
  }
  // sections that render scraped media/data but have none to render get dropped, not left empty
  // (role-tagged AI assets don't count as gallery content)
  sections = sections.filter((s) => {
    if ((s.type === 'gallery' || s.type === 'showcase') && contentPhotos.length === 0) return false;
    if (s.type === 'reviews' && reviews.length === 0 && !profile.reviews_summary) return false;
    if (s.type === 'hours' && !profile.hours) return false;
    if (s.type === 'map' && !profile.location && typeof s.props.address !== 'string') return false;
    if (s.type === 'serviceArea' && !profile.service_area?.length && !Array.isArray(s.props.areas)) return false;
    return true;
  });

  // TRADE SCENE: the visual is never model-chosen — the deterministic kind for this trade is
  // stamped onto the props; no scene exists for the trade (or a second scene appears) → dropped.
  // Trade vignettes win; 'glass' from sceneKindFor is the UNIVERSAL marker, resolved by name
  // hash into glass (2+ observed stats required) or ribbon (stages the claim, needs none).
  const tradeKind = sceneKindFor(profile.industry);
  const uniStats = tradeKind === 'glass' ? glassStats(profile) : null;
  const sceneKind = tradeKind === 'glass'
    ? universalChapter(profile.business_name, uniStats?.length ?? 0)
    : tradeKind;
  let sceneSeen = false;
  sections = sections.filter((s) => {
    if (s.type !== 'scene') return true;
    if (!sceneKind || sceneSeen) return false;
    sceneSeen = true;
    s.props = {
      headline: str(s.props.headline, SCENE_COPY[sceneKind].headline),
      sub: str(s.props.sub, SCENE_COPY[sceneKind].sub),
      cta: str(s.props.cta, recipe.cta),
      scene: sceneKind,
      ...(sceneKind === 'glass' ? { stats: uniStats } : {}),
    };
    return true;
  });

  // Dignity is not a model choice — grief-adjacent categories are forced calm here.
  sections = applyRestraint(theme, sections, profile.industry);

  // marquee needs a trust section to live on — flair pointing at a host that doesn't exist is
  // a silent no-op that reads as "this site has no personality".
  if (theme.flair?.includes('marquee') && !sections.some((s) => s.type === 'trust')) {
    theme.flair = theme.flair.filter((f) => f !== 'marquee');
    if (!theme.flair.length) theme.flair = ['grain'];
  }

  const seoRaw = (r.seo ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    recipe: recipe.id,
    business_name: profile.business_name,
    logoText: str(r.logoText, fallback.logoText),
    tagline: str(r.tagline, fallback.tagline),
    theme,
    // nav derived from the FINAL section list — the fallback's nav pointed at sections the
    // normalized page may not have (dead anchors) and missed ones it does.
    nav: navFor(sections, recipe.cta),
    sections,
    seo: {
      title: str(seoRaw.title, fallback.seo.title),
      description: str(seoRaw.description, fallback.seo.description),
      keywords: Array.isArray(seoRaw.keywords) ? (seoRaw.keywords as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 12) : fallback.seo.keywords,
    },
    footer: { line: str((r.footer as Record<string, unknown>)?.line, fallback.footer.line) },
    aiImagery: profile.photos.some((p) => p.source_type === 'ai_generated') || undefined,
  };
}

/** Nav derived from the sections that actually made it into the spec. */
export function navFor(sections: SectionSpec[], cta: string): { label: string; anchor: string }[] {
  const labels: Partial<Record<SectionType, string>> = {
    services: 'Services', about: 'About', gallery: 'Gallery', showcase: 'Our Work',
    reviews: 'Reviews', faq: 'FAQ', quote: cta, map: 'Find Us', hours: 'Hours',
  };
  const out: { label: string; anchor: string }[] = [];
  for (const s of sections) {
    const label = labels[s.type];
    if (label && !out.some((n) => n.anchor === s.type)) out.push({ label, anchor: s.type });
  }
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Deterministic fallback assembly — a complete, decent site with ZERO model calls.
// This is both the no-key/dev path and the floor the normalizer patches holes with.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-vertical VOICE for the fallback assembler. One formula for every trade read like a
// template ("X done right in City.") — and two competitors in one town could receive
// near-identical demos. Each class of business gets its own language, and the variant is
// picked deterministically from the business NAME hash, so the same business always gets the
// same site while neighbors get different ones. Copy stays behavioral/observed — no claims.
// ---------------------------------------------------------------------------

const nameHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

interface Voice { heading: string; sub: string; bannerHeading: string }

function voiceFor(industry: string, name: string, city: string | null): Voice {
  const ind = industry.trim();
  const indLc = ind.toLowerCase();
  const inCity = city ? ` in ${city}` : '';
  const cityOr = city ?? 'your area';
  const pick = (arr: string[]): string => arr[nameHash(name) % arr.length];

  if (/(roof|plumb|hvac|electric|landscap|lawn|paint|pressure|cleaning|pest|tree|fenc|concrete|garage|handyman|remodel|floor|window|gutter|pool|appliance|junk|moving|towing|locksmith)/.test(indLc)) {
    return {
      heading: pick([
        `${ind} you can count on${inCity}.`,
        `${cityOr}'s straightforward ${indLc} crew.`,
        `${ind} done right${inCity}. The first time.`,
      ]),
      sub: pick([
        `${name} shows up when promised, quotes it straight, and stands behind the work.`,
        `Fast quotes, tidy job sites, and work built to last — that's ${name}.`,
      ]),
      bannerHeading: pick([`Need ${indLc}${inCity}? Let's talk.`, `Your ${indLc} project starts with one quote.`]),
    };
  }
  if (/(dental|chiropractic|veterinary|eye care|optometr|medical|clinic|therapy)/.test(indLc)) {
    return {
      heading: pick([`Care that puts you first${inCity}.`, `${cityOr}'s neighborhood ${indLc} practice.`]),
      sub: pick([
        `${name} — modern care, clear answers, and appointments that respect your time.`,
        `From first visit to follow-up, ${name} makes ${indLc} feel easy.`,
      ]),
      bannerHeading: pick([`Ready to book your visit${inCity}?`, `New patients welcome at ${name}.`]),
    };
  }
  if (/(hair|barber|nail|salon|spa|beauty|grooming|massage|training|fitness)/.test(indLc)) {
    return {
      heading: pick([`Look forward to your next appointment.`, `${cityOr} comes to ${name} for a reason.`]),
      sub: pick([
        `${name} — skilled hands, easy booking, and a chair you'll come back to.`,
        `Walk out feeling like the best version of yourself. That's the ${name} standard.`,
      ]),
      bannerHeading: pick([`Book your spot at ${name}.`, `Your next appointment is one click away.`]),
    };
  }
  if (/(legal|law|accounting|insurance|real estate|financial|consult)/.test(indLc)) {
    return {
      heading: pick([`${ind}, explained in plain English${inCity}.`, `Steady hands for the decisions that matter.`]),
      sub: pick([
        `${name} gives you straight answers, clear fees, and someone who picks up the phone.`,
        `When it matters, ${cityOr} calls ${name}.`,
      ]),
      bannerHeading: pick([`Talk it through with ${name}.`, `Get clarity on your next step.`]),
    };
  }
  // Default voice — still name-varied, still behavioral.
  return {
    heading: pick([`${ind} done right${inCity}.`, `${cityOr}'s go-to for ${indLc}.`]),
    sub: `${name} — ${indLc}${inCity}.`,
    bannerHeading: `Ready to get started${inCity}?`,
  };
}

export function assembleFallbackSpec(profile: BusinessProfile): SiteSpec {
  const recipe = pickRecipe(profile);
  // Dignified categories never show generated imagery (same rule as the normalizer).
  const allPhotos = restraintFor(profile.industry)
    ? usablePhotos(profile).filter((p) => p.source_type !== 'ai_generated')
    : usablePhotos(profile);
  // Same role rule as the normalizer: the AI object/backdrop pair never masquerades as content.
  const photos = allPhotos.filter((p) => p.alt !== 'ai-backdrop' && p.alt !== 'ai-object');
  const heroBackdrop = allPhotos.find((p) => p.alt === 'ai-backdrop');
  // AI still-lifes are concept art — a gallery of them must never claim to be the business's
  // own portfolio ("Recent work" over generated images is a lie).
  const aiOnlyPhotos = photos.length > 0 && photos.every((p) => p.source_type === 'ai_generated');
  const reviews = usableReviews(profile);
  const loc = profile.location ?? '';
  const name = profile.business_name;
  const cta = recipe.cta;

  const voice = voiceFor(profile.industry, name, loc ? loc.split(',')[0] : null);

  const sections: SectionSpec[] = [];
  for (const type of recipe.sections) {
    switch (type) {
      case 'hero':
        sections.push({ type, props: {
          eyebrow: loc ? `${profile.industry} · ${loc}` : profile.industry,
          heading: voice.heading,
          sub: profile.description ?? voice.sub,
          cta, secondaryCta: profile.phone ? `Call ${profile.phone}` : undefined,
          image: photos[0]?.url ?? heroBackdrop?.url,
          bgImage: heroBackdrop?.url,
          objectImage: allPhotos.find((p) => p.alt === 'ai-object')?.url,
          rating: profile.google_rating, reviewCount: profile.review_count,
        } });
        break;
      case 'trust':
        // HONESTY: every line is either observed (rating, review count, location, phone) or
        // behavioral (what the site itself offers). Never 'Licensed & insured' or 'Satisfaction
        // guaranteed' — claims nobody verified have no place on a pitched demo.
        sections.push({ type, props: { items: [
          profile.google_rating ? `${profile.google_rating.toFixed(1)}★ on Google` : `Professional ${profile.industry.toLowerCase()}`,
          profile.review_count ? `${profile.review_count}+ customer reviews` : (loc ? `Serving ${loc.split(',')[0]} & nearby` : 'Serving the local area'),
          'Free, no-obligation quotes',
          profile.phone ? `Call ${profile.phone}` : 'Fast online quotes',
        ] } });
        break;
      case 'services':
        sections.push({ type, props: {
          heading: 'What we do',
          sub: `Every job backed by ${name}'s reputation.`,
          services: profile.services.slice(0, 8).map((s) => ({ name: s, blurb: `Professional ${s.toLowerCase()} — done on time, done right.` })),
          cta,
        } });
        break;
      case 'about':
        sections.push({ type, props: {
          heading: `About ${name}`,
          body: profile.description ?? `${name} serves ${loc || 'the local community'} with ${profile.services.slice(0, 2).join(' and ').toLowerCase()}. ${profile.brand_style ? `Known for being ${profile.brand_style}.` : ''}`,
          image: photos[1]?.url ?? photos[0]?.url,
        } });
        break;
      case 'showcase':
        if (photos.length) sections.push({ type, props: { heading: aiOnlyPhotos ? 'The look and feel' : 'Recent work', photos: photos.map((p) => ({ url: p.url, alt: p.alt ?? name })) } });
        break;
      case 'gallery':
        if (photos.length) sections.push({ type, props: { heading: aiOnlyPhotos ? 'The look and feel' : 'Gallery', photos: photos.map((p) => ({ url: p.url, alt: p.alt ?? name })) } });
        break;
      case 'reviews':
        if (reviews.length || profile.reviews_summary) sections.push({ type, props: {
          heading: 'What customers say',
          reviews: reviews.map((x) => ({ author: x.author ?? 'Verified customer', rating: x.rating ?? 5, text: x.text })),
          summary: reviews.length ? undefined : profile.reviews_summary,
          googleRating: profile.google_rating, reviewCount: profile.review_count,
        } });
        break;
      case 'serviceArea':
        if (profile.service_area?.length || loc) sections.push({ type, props: {
          heading: 'Areas we serve',
          areas: profile.service_area?.length ? profile.service_area : [loc],
        } });
        break;
      case 'faq':
        sections.push({ type, props: { heading: 'Common questions', faqs: [
          { q: 'How do I get a quote?', a: `Use the form below or call${profile.phone ? ` ${profile.phone}` : ' us'} — quotes are free and carry no obligation.` },
          { q: 'What areas do you cover?', a: profile.service_area?.length ? profile.service_area.join(', ') : (loc || 'Our local area and surrounding communities.') },
          // No invented licensing claim — the one question a fallback site can answer honestly is
          // how the site itself behaves.
          { q: 'How quickly will I hear back?', a: `Your request goes straight to ${name} the moment you send it.` },
        ] } });
        break;
      case 'hours':
        if (profile.hours) sections.push({ type, props: { heading: 'Hours', hours: profile.hours } });
        break;
      case 'map':
        if (loc) sections.push({ type, props: { heading: 'Find us', address: loc, phone: profile.phone } });
        break;
      case 'quote':
        sections.push({ type, props: {
          heading: cta,
          sub: 'Tell us what you need — we typically respond the same day.',
          phone: profile.phone, email: profile.email, cta,
        } });
        break;
      case 'ctaBanner':
        sections.push({ type, props: {
          heading: voice.bannerHeading,
          sub: profile.phone ? `Call ${profile.phone} or request a quote online.` : 'Request a quote online — it takes 30 seconds.',
          cta,
        } });
        break;
      case 'seoText':
        // No "Popular searches:" keyword dump — that's the one line every owner burned by a
        // cheap SEO vendor recognizes as spam. Keywords belong woven into prose, or nowhere.
        sections.push({ type, props: {
          heading: `${profile.industry} in ${loc || 'your area'}`,
          body: `${name} provides ${profile.services.slice(0, 6).join(', ').toLowerCase()}${loc ? ` throughout ${loc} and nearby communities` : ''}.`,
        } });
        break;
      case 'scene': {
        // Trade vignettes first; every other trade rotates into glass (stats-staged, needs
        // two+ observed numbers) or ribbon (claim-staged) — never a generic placeholder.
        const tKind = sceneKindFor(profile.industry);
        if (tKind === 'glass') {
          const stats = glassStats(profile);
          const kind = universalChapter(name, stats.length);
          sections.push({ type, props: { ...SCENE_COPY[kind], cta, scene: kind, ...(kind === 'glass' ? { stats } : {}) } });
        } else if (tKind) {
          sections.push({ type, props: { ...SCENE_COPY[tKind], cta, scene: tKind } });
        }
        break;
      }
    }
  }

  // Seeded structural compositions ride into the fallback — the floor is architecturally
  // distinct per BUSINESS, not one skeleton per vertical with different paint.
  for (const s of sections) s.variant = s.variant ?? seededVariant(name, s.type, recipe);

  const fbTheme: ThemeSpec = { ...recipe.theme };
  const restrainedSections = applyRestraint(fbTheme, sections, profile.industry);
  // marquee with no trust section to host it is a silent no-op (restaurant/retail/pet recipes).
  if (fbTheme.flair?.includes('marquee') && !restrainedSections.some((s) => s.type === 'trust')) {
    fbTheme.flair = fbTheme.flair.filter((f) => f !== 'marquee');
    if (!fbTheme.flair.length) fbTheme.flair = ['grain'];
  }

  const spec: SiteSpec = {
    version: 1,
    recipe: recipe.id,
    business_name: name,
    logoText: name,
    tagline: `${profile.industry}${loc ? ` · ${loc}` : ''}`,
    theme: fbTheme,
    nav: [],
    sections: restrainedSections,
    seo: {
      title: `${name} | ${profile.industry}${loc ? ` in ${loc}` : ''}`,
      description: profile.description ?? `${name} — ${profile.services.slice(0, 3).join(', ')}${loc ? ` in ${loc}` : ''}. ${cta} today.`,
      keywords: profile.seo_keywords?.slice(0, 12) ?? [],
    },
    footer: { line: `© ${name}. ${loc}` },
    aiImagery: profile.photos.some((p) => p.source_type === 'ai_generated') || undefined,
  };
  spec.nav = navFor(spec.sections, recipe.cta);
  return spec;
}

/** URL-safe slug for preview routes: "Joe's Roofing" → "joes-roofing". */
export function previewSlug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preview';
}
