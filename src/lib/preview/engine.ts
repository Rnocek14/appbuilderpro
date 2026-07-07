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
import {
  fallbackStrategy, normalizeStrategy, fallbackAudit, normalizeAudit, normalizeCritique,
  critiqueWarrantsRefine, type WebsiteStrategy, type AuditReport, type OwnerCritique,
} from './strategy';

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

// ---------------------------------------------------------------------------
// The intelligence chain: strategy → spec → owner critique → refine → audit
// ---------------------------------------------------------------------------

const STRATEGY_SYSTEM = `You are a senior marketing strategist at an elite local-business agency.
Given a business profile, produce the MARKETING BRIEF a website must execute: who actually buys,
what would make them pick THIS business, what the hero must communicate in 3 seconds, which proof
elements to lead with, and which hesitations the copy must pre-empt. Ground everything in the
profile — never invent facts, awards, or claims. Be specific to this trade and town, never generic.
Output ONLY JSON:
{"positioning": str, "ideal_customer": str, "tone": str, "hero_strategy": str,
 "differentiators": [str], "trust_builders": [str], "objections": [str],
 "offer_strategy": str, "photo_strategy": str, "color_rationale": str, "local_keywords": [str]}`;

/** The marketing brief the spec executes. Deterministic fallback on any failure. */
export async function deriveStrategy(profile: BusinessProfile): Promise<WebsiteStrategy> {
  try {
    const r = await rawComplete([
      { role: 'system', content: STRATEGY_SYSTEM },
      { role: 'user', content: JSON.stringify(profile, null, 1) },
    ], 1800);
    return normalizeStrategy(extractJson(r.text), profile);
  } catch {
    return fallbackStrategy(profile);
  }
}

/** Model → validated SiteSpec, EXECUTING the strategy (and optionally an owner critique — the
 *  refine pass). Falls back to the deterministic assembly on ANY failure. */
export async function generateSiteSpec(
  profile: BusinessProfile, strategy?: WebsiteStrategy, critique?: OwnerCritique,
): Promise<{ spec: SiteSpec; source: 'ai' | 'fallback' }> {
  const strategyBlock = strategy
    ? `\n\nMARKETING STRATEGY — the spec must EXECUTE this brief (hero follows hero_strategy, copy speaks to ideal_customer in the given tone, trust_builders surfaced, objections pre-empted):\n${JSON.stringify(strategy, null, 1)}`
    : '';
  const critiqueBlock = critique?.issues.length
    ? `\n\nOWNER CRITIQUE OF THE PREVIOUS DRAFT — fix every issue in this revision:\n${critique.issues.map((i) => `- [${i.section}] ${i.problem} → ${i.fix}`).join('\n')}${critique.weakest_part ? `\nWeakest part overall: ${critique.weakest_part}` : ''}`
    : '';
  try {
    const r = await rawComplete([
      { role: 'system', content: SPEC_SYSTEM },
      { role: 'user', content: specPrompt(profile) + strategyBlock + critiqueBlock },
    ], 8000);
    const spec = normalizeSpec(extractJson(r.text), profile);
    spec.nav = navFor(spec.sections, pickRecipe(profile).cta);
    return { spec, source: 'ai' };
  } catch {
    return { spec: assembleFallbackSpec(profile), source: 'fallback' };
  }
}

const CRITIQUE_SYSTEM = `You ARE the owner of this business — busy, skeptical, protective of your
reputation, allergic to marketing fluff. An agency you never hired just sent you this website spec
they built for you. React honestly:
- Would you pay $299 to publish it?
- Does it feel like YOUR business or a template with your name pasted in?
- What's factually off, generically written, or missing that you'd notice immediately?
Judge the COPY and CHOICES (headlines, claims, section order, tone) — not the technology.
Output ONLY JSON:
{"would_buy": bool, "feels_like_my_business": int(1-10), "weakest_part": str,
 "issues": [{"section": str, "problem": str, "fix": str}]}`;

/** Owner-simulation review of a spec. Fails soft to a clean critique (no refine pass). */
export async function critiqueSpec(profile: BusinessProfile, spec: SiteSpec): Promise<OwnerCritique> {
  try {
    const r = await rawComplete([
      { role: 'system', content: CRITIQUE_SYSTEM },
      { role: 'user', content: `YOUR BUSINESS (ground truth):\n${JSON.stringify({ ...profile, photos: undefined }, null, 1)}\n\nTHE WEBSITE THEY BUILT (spec):\n${JSON.stringify({ tagline: spec.tagline, theme: { tone: spec.theme.tone }, sections: spec.sections.map((s) => ({ type: s.type, props: s.props })), seo: spec.seo }, null, 1)}` },
    ], 1500);
    return normalizeCritique(extractJson(r.text));
  } catch {
    return { would_buy: true, feels_like_my_business: 8, weakest_part: '', issues: [] };
  }
}

const AUDIT_SYSTEM = `You write website audit reports for small-business owners — plain English,
zero jargon, zero hype. Every problem gets an IMPACT in owner language (lost leads, lost trust,
lost rankings — never "suboptimal viewport meta"). Ground problems in the observed issues given;
add at most 2 universally-true gaps (e.g. no online quote path) if clearly applicable. Honest tone:
respectful of the business, direct about the website. Output ONLY JSON:
{"score": int(0-100, their CURRENT site), "headline": str,
 "problems": [{"issue": str, "impact": str}], "gains": [str], "summary": str}`;

/** The before/after value framing shown to the owner. Deterministic fallback on failure. */
export async function generateAudit(profile: BusinessProfile): Promise<AuditReport> {
  try {
    const r = await rawComplete([
      { role: 'system', content: AUDIT_SYSTEM },
      { role: 'user', content: JSON.stringify({
        business_name: profile.business_name, industry: profile.industry, location: profile.location,
        website: profile.website ?? 'NONE FOUND', current_website_score: profile.current_website_score,
        observed_issues: profile.issues ?? [], google_rating: profile.google_rating, review_count: profile.review_count,
      }, null, 1) },
    ], 1500);
    return normalizeAudit(extractJson(r.text), profile);
  } catch {
    return fallbackAudit(profile);
  }
}

/** The outreach email body for this preview — stored on the row so the future email automation
 *  just reads it (per the pipeline contract: preview URL + screenshot + business name + pitch).
 *  Audit-aware: the strongest cold emails name ONE specific observed problem, then show the fix. */
export async function generatePitch(profile: BusinessProfile, previewUrl: string, audit?: AuditReport): Promise<string> {
  const fallback = `Hi${profile.business_name ? ` ${profile.business_name} team` : ''},

I came across ${profile.business_name} while researching ${profile.industry.toLowerCase()} businesses${profile.location ? ` in ${profile.location}` : ''}${profile.current_website_score != null ? ` and noticed your current website may be costing you leads` : ''}.

Rather than just tell you that, I built you a new one:

${previewUrl}

If you like it, publishing it takes a day. No obligation either way.`;
  try {
    const r = await rawComplete([
      { role: 'system', content: 'You write short, human cold-outreach emails for a web agency that BUILDS the website before pitching it. 90-130 words, plain text, no subject line, no placeholders like [Name], no hype adjectives, one link only, friendly and specific to the business. Mention one concrete observed issue only if provided. End with a no-pressure close.' },
      { role: 'user', content: `Business: ${profile.business_name} (${profile.industry}${profile.location ? `, ${profile.location}` : ''}). Observed issues: ${(audit?.problems.slice(0, 3).map((p) => p.issue) ?? profile.issues?.slice(0, 3) ?? []).join('; ') || 'n/a'}.${audit ? ` Their current site scores ${audit.score}/100.` : ''} Preview link to include verbatim: ${previewUrl}` },
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
  strategy: WebsiteStrategy | null;
  critique: OwnerCritique | null;
  audit: AuditReport | null;
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

  // THE INTELLIGENCE CHAIN — strategist → generator → simulated owner → (refine) → auditor.
  // Audit runs concurrently with the spec work (it only reads the profile). Every stage fails
  // soft, so a complete site always comes out.
  const auditPromise = generateAudit(profile);
  const strategy = await deriveStrategy(profile);
  let { spec, source } = await generateSiteSpec(profile, strategy);
  let critique: OwnerCritique | null = null;
  if (source === 'ai') {
    critique = await critiqueSpec(profile, spec);
    if (critiqueWarrantsRefine(critique)) {
      const refined = await generateSiteSpec(profile, strategy, critique);
      if (refined.source === 'ai') spec = refined.spec; // keep the draft if the refine call failed
    }
  }
  const audit = await auditPromise;

  // unique slug: joes-roofing, joes-roofing-2, …
  const base = previewSlug(profile.business_name);
  let slug = base;
  for (let i = 2; i <= 20; i++) {
    const { data: clash } = await supabase.from('preview_sites').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  const pitch = await generatePitch(profile, previewUrlFor(slug), audit);
  const { data: row, error: sErr } = await supabase.from('preview_sites').insert({
    user_id: userId,
    profile_id: (profileRow as { id: string }).id,
    slug,
    business_name: profile.business_name,
    industry: profile.industry,
    spec,
    pitch,
    strategy,
    critique,
    audit,
    spec_source: source,
    status: 'preview',
  }).select('*').single();
  if (sErr) return { ok: false, errors: [`Could not save preview site: ${sErr.message}`] };

  return { ok: true, row: row as PreviewSiteRow, previewUrl: previewUrlFor(slug), specSource: source };
}

/** Regenerate everything (strategy → spec → critique/refine → audit → pitch) from the stored profile. */
export async function regeneratePreviewSite(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: site } = await supabase.from('preview_sites').select('id, slug, profile_id').eq('id', id).single();
  if (!site) return { ok: false, error: 'Preview not found.' };
  const { data: prof } = await supabase.from('business_profiles').select('profile').eq('id', (site as { profile_id: string }).profile_id).single();
  const parsed = parseBusinessProfile((prof as { profile: unknown } | null)?.profile);
  if (!parsed.profile) return { ok: false, error: 'Stored profile is invalid.' };
  const profile = parsed.profile;
  const auditPromise = generateAudit(profile);
  const strategy = await deriveStrategy(profile);
  let { spec, source } = await generateSiteSpec(profile, strategy);
  let critique: OwnerCritique | null = null;
  if (source === 'ai') {
    critique = await critiqueSpec(profile, spec);
    if (critiqueWarrantsRefine(critique)) {
      const refined = await generateSiteSpec(profile, strategy, critique);
      if (refined.source === 'ai') spec = refined.spec;
    }
  }
  const audit = await auditPromise;
  const pitch = await generatePitch(profile, previewUrlFor((site as { slug: string }).slug), audit);
  const { error } = await supabase.from('preview_sites').update({ spec, pitch, strategy, critique, audit, spec_source: source }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Purchase intent — the "yes" button on public previews
// ---------------------------------------------------------------------------

/** An interested owner clicked "Claim this website" on the PUBLIC preview — no login, so this
 *  insert runs as anon (RLS allows insert-only). The agency sees these in the admin list. */
export async function submitPublishRequest(args: { previewSiteId: string; name: string; contact: string; message?: string }): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('publish_requests').insert({
    preview_site_id: args.previewSiteId,
    name: args.name.trim().slice(0, 120),
    contact: args.contact.trim().slice(0, 200),
    message: (args.message ?? '').trim().slice(0, 2000),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Engagement tracking — the validation instrument (view / engaged / return)
// ---------------------------------------------------------------------------

/** Stable per-browser visitor id so repeat visits show as RETURNS, not new views. */
function visitorId(): string {
  try {
    let v = localStorage.getItem('pv:visitor');
    if (!v) { v = Math.random().toString(36).slice(2, 12); localStorage.setItem('pv:visitor', v); }
    return v;
  } catch { return 'anon'; }
}

/** Fire-and-forget event from the PUBLIC preview pages (anon insert). Deduped per session so a
 *  re-render doesn't inflate counts; a NEW browser session on the same site logs again (a return). */
export function recordPreviewEvent(previewSiteId: string, event: 'view' | 'engaged' | 'report_view' | 'claim_open'): void {
  try {
    const key = `pv:${event}:${previewSiteId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* private mode — log anyway */ }
  void supabase.from('preview_events').insert({ preview_site_id: previewSiteId, event, visitor: visitorId() })
    .then(() => {}, () => { /* best-effort — analytics never breaks the preview */ });
}

export interface PreviewStats { views: number; engaged: number; returns: number; reportViews: number }

/** Per-site engagement rollup for the admin list. */
export async function getPreviewStats(): Promise<Record<string, PreviewStats>> {
  const { data } = await supabase.from('preview_events').select('preview_site_id, event, visitor').limit(5000);
  const out: Record<string, PreviewStats> = {};
  const seenVisitors: Record<string, Set<string>> = {};
  for (const r of (data ?? []) as { preview_site_id: string; event: string; visitor: string }[]) {
    const s = (out[r.preview_site_id] ??= { views: 0, engaged: 0, returns: 0, reportViews: 0 });
    if (r.event === 'view') {
      const seen = (seenVisitors[r.preview_site_id] ??= new Set());
      if (seen.has(r.visitor)) s.returns++; else { seen.add(r.visitor); s.views++; }
    } else if (r.event === 'engaged') s.engaged++;
    else if (r.event === 'report_view') s.reportViews++;
  }
  return out;
}

export interface PublishRequestRow {
  id: string; preview_site_id: string; name: string; contact: string; message: string; created_at: string;
}

export async function listPublishRequests(): Promise<(PublishRequestRow & { business_name?: string; slug?: string })[]> {
  const { data } = await supabase
    .from('publish_requests')
    .select('*, preview_sites(business_name, slug)')
    .order('created_at', { ascending: false })
    .limit(100);
  return ((data ?? []) as (PublishRequestRow & { preview_sites?: { business_name: string; slug: string } })[])
    .map((r) => ({ ...r, business_name: r.preview_sites?.business_name, slug: r.preview_sites?.slug }));
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
