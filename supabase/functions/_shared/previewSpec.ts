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
  'serviceArea', 'faq', 'hours', 'map', 'quote', 'ctaBanner', 'seoText',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface SectionSpec {
  type: SectionType;
  variant?: string;
  /** All copy/data the section renders — filled by the model (or the fallback assembler). */
  props: Record<string, unknown>;
}

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
}

const HSL_RE = /^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/;
const FONT_RE = /^[a-zA-Z0-9 ]{2,40}$/;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
}

export const RECIPES: Recipe[] = [
  {
    id: 'contractor_lead_gen',
    label: 'Contractor / Home Services',
    match: ['roof', 'contractor', 'hvac', 'plumb', 'landscap', 'electric', 'construction', 'remodel', 'paint', 'garage', 'fence', 'concrete', 'handyman', 'pest', 'clean'],
    sections: ['hero', 'trust', 'services', 'showcase', 'about', 'reviews', 'serviceArea', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '16 78% 44%', primaryInk: '24 40% 98%', bg: '36 30% 97%', ink: '24 24% 12%',
      muted: '24 10% 40%', card: '36 20% 99.5%', border: '30 18% 88%', radius: 8,
      displayFont: 'Sora', bodyFont: 'Inter', tone: 'trustworthy local craftsman — bold, direct, proof-forward',
    },
    cta: 'Get a Free Quote',
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Café',
    match: ['restaurant', 'cafe', 'café', 'pizzeria', 'diner', 'bistro', 'bakery', 'bar', 'grill', 'taco', 'sushi', 'coffee', 'food'],
    sections: ['hero', 'about', 'services', 'gallery', 'reviews', 'hours', 'map', 'faq', 'ctaBanner', 'seoText'],
    theme: {
      primary: '350 62% 38%', primaryInk: '30 40% 97%', bg: '38 42% 96%', ink: '20 30% 13%',
      muted: '24 14% 38%', card: '40 40% 99%', border: '34 24% 87%', radius: 4,
      displayFont: 'Fraunces', bodyFont: 'Hanken Grotesk', tone: 'warm, appetizing, editorial — food photography leads',
    },
    cta: 'Reserve a Table',
  },
  {
    id: 'salon_spa',
    label: 'Med Spa / Salon / Wellness',
    match: ['spa', 'salon', 'beauty', 'nail', 'hair', 'lash', 'massage', 'wellness', 'aesthetic', 'skin', 'barber', 'yoga'],
    sections: ['hero', 'services', 'about', 'gallery', 'reviews', 'trust', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '160 30% 32%', primaryInk: '150 20% 98%', bg: '80 20% 97%', ink: '160 18% 14%',
      muted: '160 8% 42%', card: '80 24% 99.5%', border: '90 12% 88%', radius: 20,
      displayFont: 'Cormorant Garamond', bodyFont: 'Figtree', tone: 'calm, luxurious, airy — whitespace and softness',
    },
    cta: 'Book Now',
  },
  {
    id: 'auto_services',
    label: 'Auto Repair / Detailing / Tires',
    match: ['auto', 'mechanic', 'tire', 'detail', 'car wash', 'body shop', 'transmission', 'oil change', 'towing', 'collision'],
    sections: ['hero', 'trust', 'services', 'showcase', 'reviews', 'about', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '210 90% 40%', primaryInk: '210 30% 98%', bg: '220 14% 96%', ink: '220 24% 12%',
      muted: '220 8% 40%', card: '220 10% 99.5%', border: '220 12% 87%', radius: 6,
      displayFont: 'Archivo', bodyFont: 'Inter', tone: 'competent, no-nonsense shop — steel blue, bold type, proof up front',
    },
    cta: 'Get an Estimate',
  },
  {
    id: 'dental_medical',
    label: 'Dental / Medical / Clinics',
    match: ['dental', 'dentist', 'orthodont', 'medical', 'clinic', 'chiro', 'physio', 'therapy', 'optom', 'veterinar', 'pediatric', 'urgent care'],
    sections: ['hero', 'trust', 'services', 'about', 'reviews', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '190 65% 34%', primaryInk: '190 30% 98%', bg: '195 35% 97.5%', ink: '200 30% 13%',
      muted: '200 12% 42%', card: '195 30% 99.5%', border: '195 20% 89%', radius: 12,
      displayFont: 'Schibsted Grotesk', bodyFont: 'Hanken Grotesk', tone: 'calm clinical trust — clean teal, generous whitespace, credentials visible',
    },
    cta: 'Book an Appointment',
  },
  {
    id: 'legal_professional',
    label: 'Legal / Accounting / Professional',
    match: ['law', 'attorney', 'legal', 'account', 'cpa', 'tax', 'insurance', 'financ', 'consult', 'notary', 'advisor'],
    sections: ['hero', 'about', 'services', 'trust', 'reviews', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '222 40% 24%', primaryInk: '40 40% 96%', bg: '40 25% 97%', ink: '222 30% 12%',
      muted: '222 10% 40%', card: '40 20% 99.5%', border: '40 14% 88%', radius: 2,
      displayFont: 'Newsreader', bodyFont: 'Figtree', tone: 'established counsel — ink navy on warm paper, serif authority, restraint',
    },
    cta: 'Request a Consultation',
  },
  {
    id: 'real_estate',
    label: 'Real Estate / Property',
    match: ['real estate', 'realtor', 'realty', 'property', 'broker', 'homes', 'apartment', 'mortgage'],
    sections: ['hero', 'showcase', 'about', 'trust', 'reviews', 'serviceArea', 'faq', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '30 45% 38%', primaryInk: '36 40% 97%', bg: '36 22% 97.5%', ink: '28 26% 12%',
      muted: '28 10% 42%', card: '36 24% 99.5%', border: '32 16% 88%', radius: 0,
      displayFont: 'Fraunces', bodyFont: 'Figtree', tone: 'quiet luxury listing — bronze on cream, editorial serif, photography leads',
    },
    cta: 'Schedule a Showing',
  },
  {
    id: 'fitness',
    label: 'Gym / Fitness / Martial Arts',
    match: ['gym', 'fitness', 'crossfit', 'martial', 'karate', 'jiu', 'boxing', 'pilates', 'training', 'dance', 'swim'],
    sections: ['hero', 'services', 'trust', 'showcase', 'reviews', 'about', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '80 85% 45%', primaryInk: '80 60% 8%', bg: '220 12% 10%', ink: '60 15% 95%',
      muted: '220 6% 62%', card: '220 12% 14%', border: '220 10% 22%', radius: 8,
      displayFont: 'Archivo', bodyFont: 'Inter', tone: 'committed-dark energy — near-black, one electric lime accent, hard type',
    },
    cta: 'Start Free Trial',
  },
  {
    id: 'retail_boutique',
    label: 'Retail / Boutique / Florist',
    match: ['boutique', 'retail', 'store', 'shop', 'florist', 'flower', 'gift', 'jewel', 'antique', 'bookstore', 'furniture'],
    sections: ['hero', 'gallery', 'about', 'services', 'reviews', 'hours', 'map', 'faq', 'ctaBanner', 'seoText'],
    theme: {
      primary: '335 45% 40%', primaryInk: '340 30% 98%', bg: '30 30% 97.5%', ink: '335 20% 14%',
      muted: '335 8% 44%', card: '30 26% 99.5%', border: '30 16% 89%', radius: 14,
      displayFont: 'Bricolage Grotesque', bodyFont: 'Onest', tone: 'warm curated shop — berry accent on cream, product photography first',
    },
    cta: 'Visit the Shop',
  },
  {
    id: 'pet_care',
    label: 'Pet Care / Grooming / Boarding',
    match: ['pet', 'dog', 'cat', 'groom', 'kennel', 'boarding', 'daycare', 'walker', 'animal'],
    sections: ['hero', 'services', 'gallery', 'reviews', 'about', 'trust', 'faq', 'hours', 'quote', 'map', 'ctaBanner', 'seoText'],
    theme: {
      primary: '25 85% 50%', primaryInk: '30 50% 98%', bg: '45 40% 97%', ink: '30 26% 13%',
      muted: '30 10% 42%', card: '45 36% 99.5%', border: '40 20% 87%', radius: 18,
      displayFont: 'Bricolage Grotesque', bodyFont: 'Figtree', tone: 'joyful and trustworthy — sunny orange, rounded softness, real pet photos',
    },
    cta: 'Book a Visit',
  },
  {
    id: 'photography_events',
    label: 'Photography / Events / Venues',
    match: ['photo', 'videograph', 'wedding', 'event', 'venue', 'dj', 'catering', 'planner', 'studio'],
    sections: ['hero', 'gallery', 'about', 'showcase', 'reviews', 'faq', 'quote', 'ctaBanner', 'seoText'],
    theme: {
      primary: '42 50% 52%', primaryInk: '40 40% 8%', bg: '240 8% 8%', ink: '40 20% 94%',
      muted: '240 5% 60%', card: '240 8% 12%', border: '240 6% 20%', radius: 0,
      displayFont: 'Gloock', bodyFont: 'Hanken Grotesk', tone: 'gallery dark — near-black stage, champagne accent, the work IS the site',
    },
    cta: 'Check My Date',
  },
];

/** Pick the recipe for a profile — recommended_site_type wins, then industry/category keywords,
 *  else the contractor recipe (the most universal local-service layout). */
export function pickRecipe(profile: BusinessProfile): Recipe {
  const hints = [profile.recommended_site_type, profile.industry, profile.category]
    .filter(Boolean).join(' ').toLowerCase();
  const byId = RECIPES.find((r) => hints.includes(r.id));
  if (byId) return byId;
  for (const r of RECIPES) if (r.match.some((m) => hints.includes(m))) return r;
  return RECIPES[0];
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
  const hsl = (v: unknown, dflt: string) => (typeof v === 'string' && HSL_RE.test(v.trim()) ? v.trim() : dflt);
  const font = (v: unknown, dflt: string) => (typeof v === 'string' && FONT_RE.test(v.trim()) ? v.trim() : dflt);
  const theme: ThemeSpec = {
    primary: hsl(t.primary, recipe.theme.primary),
    primaryInk: hsl(t.primaryInk, recipe.theme.primaryInk),
    bg: hsl(t.bg, recipe.theme.bg),
    ink: hsl(t.ink, recipe.theme.ink),
    muted: hsl(t.muted, recipe.theme.muted),
    card: hsl(t.card, recipe.theme.card),
    border: hsl(t.border, recipe.theme.border),
    radius: typeof t.radius === 'number' ? clamp(t.radius, 0, 28) : recipe.theme.radius,
    displayFont: font(t.displayFont, recipe.theme.displayFont),
    bodyFont: font(t.bodyFont, recipe.theme.bodyFont),
    tone: str(t.tone, recipe.theme.tone),
  };

  // sections: keep known types only, in given order; re-inject photo/review data from the
  // PROFILE with usage flags applied (never trust the model to have honored them).
  const photos = usablePhotos(profile);
  const reviews = usableReviews(profile);
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  let sections: SectionSpec[] = rawSections
    .map((s): SectionSpec | null => {
      const o = s as Record<string, unknown>;
      const type = o?.type as SectionType;
      if (!SECTION_TYPES.includes(type)) return null;
      const props = (typeof o.props === 'object' && o.props !== null ? o.props : {}) as Record<string, unknown>;
      return { type, variant: typeof o.variant === 'string' ? o.variant : undefined, props };
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
      s.props.image = img && photos.some((p) => p.url === img) ? img : photos[0]?.url;
    }
    if (s.type === 'gallery' || s.type === 'showcase') {
      s.props.photos = photos.map((p) => ({ url: p.url, alt: p.alt ?? profile.business_name }));
    }
    if (s.type === 'reviews') {
      s.props.reviews = reviews.map((x) => ({ author: x.author ?? 'Verified customer', rating: x.rating ?? 5, text: x.text }));
      if (!reviews.length) s.props.summary = profile.reviews_summary ?? '';
      s.props.googleRating = profile.google_rating;
      s.props.reviewCount = profile.review_count;
    }
  }
  // sections that render scraped media but have none to render get dropped, not left empty
  sections = sections.filter((s) => {
    if ((s.type === 'gallery' || s.type === 'showcase') && photos.length === 0) return false;
    if (s.type === 'reviews' && reviews.length === 0 && !profile.reviews_summary) return false;
    return true;
  });

  const seoRaw = (r.seo ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    recipe: recipe.id,
    business_name: profile.business_name,
    logoText: str(r.logoText, fallback.logoText),
    tagline: str(r.tagline, fallback.tagline),
    theme,
    nav: fallback.nav, // deterministic — derived from the final section list below
    sections,
    seo: {
      title: str(seoRaw.title, fallback.seo.title),
      description: str(seoRaw.description, fallback.seo.description),
      keywords: Array.isArray(seoRaw.keywords) ? (seoRaw.keywords as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 12) : fallback.seo.keywords,
    },
    footer: { line: str((r.footer as Record<string, unknown>)?.line, fallback.footer.line) },
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

export function assembleFallbackSpec(profile: BusinessProfile): SiteSpec {
  const recipe = pickRecipe(profile);
  const photos = usablePhotos(profile);
  const reviews = usableReviews(profile);
  const loc = profile.location ?? '';
  const name = profile.business_name;
  const cta = recipe.cta;

  const sections: SectionSpec[] = [];
  for (const type of recipe.sections) {
    switch (type) {
      case 'hero':
        sections.push({ type, props: {
          eyebrow: loc ? `${profile.industry} · ${loc}` : profile.industry,
          heading: `${profile.industry} done right${loc ? ` in ${loc.split(',')[0]}` : ''}.`,
          sub: profile.description ?? `${name} — ${profile.services.slice(0, 3).join(', ')}${profile.services.length > 3 ? ' and more' : ''}.`,
          cta, secondaryCta: profile.phone ? `Call ${profile.phone}` : undefined,
          image: photos[0]?.url,
          rating: profile.google_rating, reviewCount: profile.review_count,
        } });
        break;
      case 'trust':
        sections.push({ type, props: { items: [
          profile.google_rating ? `${profile.google_rating.toFixed(1)}★ on Google` : 'Locally owned & operated',
          profile.review_count ? `${profile.review_count}+ customer reviews` : 'Satisfaction guaranteed',
          'Licensed & insured', 'Free estimates',
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
        if (photos.length) sections.push({ type, props: { heading: 'Recent work', photos: photos.map((p) => ({ url: p.url, alt: p.alt ?? name })) } });
        break;
      case 'gallery':
        if (photos.length) sections.push({ type, props: { heading: 'Gallery', photos: photos.map((p) => ({ url: p.url, alt: p.alt ?? name })) } });
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
          { q: 'Are you licensed and insured?', a: 'Yes — fully licensed and insured for your protection.' },
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
          heading: `Ready to get started${loc ? ` in ${loc.split(',')[0]}` : ''}?`,
          sub: profile.phone ? `Call ${profile.phone} or request a quote online.` : 'Request a quote online — it takes 30 seconds.',
          cta,
        } });
        break;
      case 'seoText':
        sections.push({ type, props: {
          heading: `${profile.industry} in ${loc || 'your area'}`,
          body: `${name} provides ${profile.services.join(', ').toLowerCase()}${loc ? ` throughout ${loc}` : ''}. ${profile.seo_keywords?.length ? `Popular searches: ${profile.seo_keywords.slice(0, 5).join(', ')}.` : ''}`,
        } });
        break;
    }
  }

  const spec: SiteSpec = {
    version: 1,
    recipe: recipe.id,
    business_name: name,
    logoText: name,
    tagline: `${profile.industry}${loc ? ` · ${loc}` : ''}`,
    theme: { ...recipe.theme },
    nav: [],
    sections,
    seo: {
      title: `${name} | ${profile.industry}${loc ? ` in ${loc}` : ''}`,
      description: profile.description ?? `${name} — ${profile.services.slice(0, 3).join(', ')}${loc ? ` in ${loc}` : ''}. ${cta} today.`,
      keywords: profile.seo_keywords?.slice(0, 12) ?? [],
    },
    footer: { line: `© ${name}. ${loc}` },
  };
  spec.nav = navFor(spec.sections, recipe.cta);
  return spec;
}

/** URL-safe slug for preview routes: "Joe's Roofing" → "joes-roofing". */
export function previewSlug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preview';
}
