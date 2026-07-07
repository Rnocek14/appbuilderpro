// src/lib/preview/engine.ts
// Impure half of the Business Website Preview Engine: the model call that turns a BusinessProfile
// into a SiteSpec (validated through the pure normalizer — the model decides content and
// parameters, never markup), pitch-copy generation for the outreach email, and Supabase
// persistence. `ingestBusinessProfile` is THE handoff the future scraper/lead-engine calls:
// profile JSON in → saved profile + generated spec + public preview URL + pitch out.

import { supabase } from '../supabase';
import { rawComplete } from '../aiClient';
import {
  parseBusinessProfile, pickRecipe, assembleFallbackSpec, normalizeSpec, navFor, previewSlug,
  usablePhotos, usableReviews, SECTION_TYPES, RECIPES,
  type BusinessProfile, type SiteSpec,
} from './spec';

function extractJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response.');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

const SPEC_SYSTEM = `You are the art director and conversion copywriter of an elite local-business
web agency. You produce a WEBSITE SPEC as JSON — copy, theme, and section choices for a
component-based renderer. You never write HTML/CSS/code.

HARD RULES:
- Ground EVERY claim in the provided business profile. Never invent reviews, ratings, years in
  business, certifications, or services that aren't in the profile. Confident, specific copy —
  but only from facts you were given (plus universally safe lines like "free estimates").
- Voice: a premium local agency — direct, warm, zero clichés ("Welcome to our website" is banned).
  Headlines sell the OUTCOME (a dry roof, a full table, glowing skin), not the company.
- Theme colors are HSL triplets "H S% L%". Pick a palette that fits the business's trade and
  brand_style — distinctive, never default blue. bg is the page paper (subtle tint reads premium).
- Sections: choose ONLY from the allowed list, in a persuasive order (hero first; a quote/ctaBanner
  must appear). Skip sections the profile has no content for.
- SEO title ≤ 60 chars with the location; description ≤ 155 chars with a call to action.

Output ONLY the JSON object — no prose, no fences.`;

function specPrompt(profile: BusinessProfile): string {
  const recipe = pickRecipe(profile);
  const photos = usablePhotos(profile);
  const reviews = usableReviews(profile);
  return `BUSINESS PROFILE:
${JSON.stringify({ ...profile, photos: photos.map((p) => p.url), review_snippets: reviews }, null, 1)}

RECIPE: ${recipe.id} (${recipe.label}) — CTA verb: "${recipe.cta}"
ALLOWED SECTION TYPES: ${SECTION_TYPES.join(', ')}
SUGGESTED ORDER (adapt, don't slavishly follow): ${recipe.sections.join(' → ')}

Section prop shapes (fill ALL copy):
- hero: { eyebrow, heading, sub, cta, secondaryCta?, image? (one of the photo urls), rating?, reviewCount? }
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
           "displayFont": "Google Font", "bodyFont": "Google Font", "tone": str},
 "sections": [{"type": str, "props": {…}}],
 "seo": {"title": str, "description": str, "keywords": [str]},
 "footer": {"line": str}}`;
}

/** Model → validated SiteSpec. Falls back to the deterministic assembly on ANY failure, so the
 *  engine always produces a complete site (the no-key/dev path uses the same fallback). */
export async function generateSiteSpec(profile: BusinessProfile): Promise<{ spec: SiteSpec; source: 'ai' | 'fallback' }> {
  try {
    const r = await rawComplete([
      { role: 'system', content: SPEC_SYSTEM },
      { role: 'user', content: specPrompt(profile) },
    ], 8000);
    const spec = normalizeSpec(extractJson(r.text), profile);
    spec.nav = navFor(spec.sections, pickRecipe(profile).cta);
    return { spec, source: 'ai' };
  } catch {
    return { spec: assembleFallbackSpec(profile), source: 'fallback' };
  }
}

/** The outreach email body for this preview — stored on the row so the future email automation
 *  just reads it (per the pipeline contract: preview URL + screenshot + business name + pitch). */
export async function generatePitch(profile: BusinessProfile, previewUrl: string): Promise<string> {
  const fallback = `Hi${profile.business_name ? ` ${profile.business_name} team` : ''},

I came across ${profile.business_name} while researching ${profile.industry.toLowerCase()} businesses${profile.location ? ` in ${profile.location}` : ''}${profile.current_website_score != null ? ` and noticed your current website may be costing you leads` : ''}.

Rather than just tell you that, I built you a new one:

${previewUrl}

If you like it, publishing it takes a day. No obligation either way.`;
  try {
    const r = await rawComplete([
      { role: 'system', content: 'You write short, human cold-outreach emails for a web agency that BUILDS the website before pitching it. 90-130 words, plain text, no subject line, no placeholders like [Name], no hype adjectives, one link only, friendly and specific to the business. Mention one concrete observed issue only if provided. End with a no-pressure close.' },
      { role: 'user', content: `Business: ${profile.business_name} (${profile.industry}${profile.location ? `, ${profile.location}` : ''}). Observed issues: ${profile.issues?.slice(0, 3).join('; ') || 'n/a'}. Preview link to include verbatim: ${previewUrl}` },
    ], 500);
    return r.text.trim() || fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface PreviewSiteRow {
  id: string;
  slug: string;
  business_name: string;
  industry: string;
  spec: SiteSpec;
  pitch: string;
  status: string;
  spec_source: string;
  profile_id: string | null;
  created_at: string;
}

/** Public preview URL for a row (the route is public — no login, clean URL for emails). */
export function previewUrlFor(slug: string): string {
  return `${window.location.origin}/preview-site/${slug}`;
}

/**
 * THE SCRAPER HANDOFF. Takes raw Business Profile JSON (from the future lead engine, or pasted
 * in the admin UI), validates it, saves the profile, generates + saves the site spec and pitch,
 * and returns everything the email automation will need. Errors are returned, not thrown, so
 * callers can surface exactly what was wrong with a payload.
 */
export async function ingestBusinessProfile(raw: unknown): Promise<
  { ok: true; row: PreviewSiteRow; previewUrl: string; specSource: 'ai' | 'fallback' } |
  { ok: false; errors: string[] }
> {
  const { profile, errors } = parseBusinessProfile(raw);
  if (!profile) return { ok: false, errors };

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, errors: ['Sign in to generate previews.'] };

  const { data: profileRow, error: pErr } = await supabase.from('business_profiles').insert({
    user_id: userId,
    business_name: profile.business_name,
    industry: profile.industry,
    website_score: profile.current_website_score ?? null,
    profile,
  }).select('id').single();
  if (pErr) return { ok: false, errors: [`Could not save profile: ${pErr.message}`] };

  const { spec, source } = await generateSiteSpec(profile);

  // unique slug: joes-roofing, joes-roofing-2, …
  const base = previewSlug(profile.business_name);
  let slug = base;
  for (let i = 2; i <= 20; i++) {
    const { data: clash } = await supabase.from('preview_sites').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  const pitch = await generatePitch(profile, previewUrlFor(slug));
  const { data: row, error: sErr } = await supabase.from('preview_sites').insert({
    user_id: userId,
    profile_id: (profileRow as { id: string }).id,
    slug,
    business_name: profile.business_name,
    industry: profile.industry,
    spec,
    pitch,
    spec_source: source,
    status: 'preview',
  }).select('*').single();
  if (sErr) return { ok: false, errors: [`Could not save preview site: ${sErr.message}`] };

  return { ok: true, row: row as PreviewSiteRow, previewUrl: previewUrlFor(slug), specSource: source };
}

/** Regenerate the spec (and pitch) for an existing preview from its stored profile. */
export async function regeneratePreviewSite(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: site } = await supabase.from('preview_sites').select('id, slug, profile_id').eq('id', id).single();
  if (!site) return { ok: false, error: 'Preview not found.' };
  const { data: prof } = await supabase.from('business_profiles').select('profile').eq('id', (site as { profile_id: string }).profile_id).single();
  const parsed = parseBusinessProfile((prof as { profile: unknown } | null)?.profile);
  if (!parsed.profile) return { ok: false, error: 'Stored profile is invalid.' };
  const { spec, source } = await generateSiteSpec(parsed.profile);
  const pitch = await generatePitch(parsed.profile, previewUrlFor((site as { slug: string }).slug));
  const { error } = await supabase.from('preview_sites').update({ spec, pitch, spec_source: source }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Public fetch for the no-login preview route — matches by slug first, then id. */
export async function getPreviewSite(slugOrId: string): Promise<PreviewSiteRow | null> {
  const bySlug = await supabase.from('preview_sites').select('*').eq('slug', slugOrId).maybeSingle();
  if (bySlug.data) return bySlug.data as PreviewSiteRow;
  if (/^[0-9a-f-]{36}$/i.test(slugOrId)) {
    const byId = await supabase.from('preview_sites').select('*').eq('id', slugOrId).maybeSingle();
    if (byId.data) return byId.data as PreviewSiteRow;
  }
  return null;
}

export async function listPreviewSites(): Promise<PreviewSiteRow[]> {
  const { data } = await supabase.from('preview_sites').select('*').order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as PreviewSiteRow[];
}

export async function deletePreviewSite(id: string): Promise<void> {
  await supabase.from('preview_sites').delete().eq('id', id);
}

export { RECIPES };
