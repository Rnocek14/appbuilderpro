// src/lib/preview/engine.ts
// Impure half of the Business Website Preview Engine: the model call that turns a BusinessProfile
// into a SiteSpec (validated through the pure normalizer — the model decides content and
// parameters, never markup), pitch-copy generation for the outreach email, and Supabase
// persistence. `ingestBusinessProfile` is THE handoff the future scraper/lead-engine calls:
// profile JSON in → saved profile + generated spec + public preview URL + pitch out.

import { supabase } from '../supabase';
import { rawComplete } from '../aiClient';
import {
  parseBusinessProfile, assembleFallbackSpec, normalizeSpec, previewSlug,
  RECIPES,
  type BusinessProfile, type SiteSpec,
} from './spec';
import {
  fallbackStrategy, normalizeStrategy, fallbackAudit, normalizeAudit, normalizeCritique,
  critiqueWarrantsRefine, type WebsiteStrategy, type AuditReport, type OwnerCritique,
} from './strategy';
// The chain's prompts live in specPrompts.ts (pure, Deno-safe) so the standing-worker's automated
// client hunt runs the IDENTICAL strategist/art-director/owner-critique brief as this browser path.
import {
  extractJson, SPEC_SYSTEM, specPrompt, STRATEGY_SYSTEM, CRITIQUE_SYSTEM,
  strategyBlock, critiqueBlock, critiqueUserPrompt,
} from './specPrompts';

// ---------------------------------------------------------------------------
// The intelligence chain: strategy → spec → owner critique → refine → audit
// ---------------------------------------------------------------------------

/** One JSON re-ask on a prose reply — the most common degradation becomes a retry instead of a
 *  straight fall to the deterministic floor (same discipline as the standing-worker chain). */
async function completeJson(msgs: Parameters<typeof rawComplete>[0], maxTokens: number): Promise<unknown> {
  const r1 = await rawComplete(msgs, maxTokens);
  try { return extractJson(r1.text); } catch {
    const r2 = await rawComplete([...msgs,
      { role: 'assistant', content: r1.text.slice(0, 4000) },
      { role: 'user', content: 'Return ONLY the JSON object — no prose, no code fences, nothing else.' },
    ], maxTokens);
    return extractJson(r2.text);
  }
}

/** The marketing brief the spec executes. Deterministic fallback on any failure. */
export async function deriveStrategy(profile: BusinessProfile): Promise<WebsiteStrategy> {
  try {
    return normalizeStrategy(await completeJson([
      { role: 'system', content: STRATEGY_SYSTEM },
      { role: 'user', content: JSON.stringify(profile, null, 1) },
    ], 1800), profile);
  } catch {
    return fallbackStrategy(profile);
  }
}

/** Model → validated SiteSpec, EXECUTING the strategy (and optionally an owner critique — the
 *  refine pass). Falls back to the deterministic assembly on ANY failure. */
export async function generateSiteSpec(
  profile: BusinessProfile, strategy?: WebsiteStrategy, critique?: OwnerCritique,
): Promise<{ spec: SiteSpec; source: 'ai' | 'fallback' }> {
  try {
    const spec = normalizeSpec(await completeJson([
      { role: 'system', content: SPEC_SYSTEM },
      { role: 'user', content: specPrompt(profile) + strategyBlock(strategy) + critiqueBlock(critique) },
    ], 8000), profile);
    return { spec, source: 'ai' };
  } catch {
    return { spec: assembleFallbackSpec(profile), source: 'fallback' };
  }
}

/** Owner-simulation review of a spec. Fails soft to a clean critique (no refine pass). */
export async function critiqueSpec(profile: BusinessProfile, spec: SiteSpec): Promise<OwnerCritique> {
  try {
    return normalizeCritique(await completeJson([
      { role: 'system', content: CRITIQUE_SYSTEM },
      { role: 'user', content: critiqueUserPrompt(profile, spec) },
    ], 1500));
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
    return normalizeAudit(await completeJson([
      { role: 'system', content: AUDIT_SYSTEM },
      { role: 'user', content: JSON.stringify({
        business_name: profile.business_name, industry: profile.industry, location: profile.location,
        website: profile.website ?? 'NONE FOUND', current_website_score: profile.current_website_score,
        observed_issues: profile.issues ?? [], google_rating: profile.google_rating, review_count: profile.review_count,
      }, null, 1) },
    ], 1500), profile);
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

  // Slug = name + a short nonce ("joes-roofing-k3x9p2") — readable in the outreach email, but
  // pitches aren't enumerable by guessing business names. Nonce also guarantees uniqueness.
  const slug = `${previewSlug(profile.business_name)}-${Math.random().toString(36).slice(2, 8)}`;

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

/** An interested owner clicked "Claim this website" on the PUBLIC preview — no login. Preferred
 *  path is the claim-submit edge function (inserts AND notifies the agency's webhook — a raised
 *  hand must never land silently); falls back to the direct anon insert if the function isn't
 *  deployed yet, so the claim is never lost. */
export async function submitPublishRequest(args: { previewSiteId: string; name: string; contact: string; message?: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('claim-submit', { body: args });
    if (!error && (data as { ok?: boolean } | null)?.ok) return { ok: true };
  } catch { /* fall through to the direct insert */ }
  const { error } = await supabase.from('publish_requests').insert({
    preview_site_id: args.previewSiteId,
    name: args.name.trim().slice(0, 120),
    contact: args.contact.trim().slice(0, 200),
    message: (args.message ?? '').trim().slice(0, 2000),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Update a claim's lifecycle state (new → contacted → won/lost) — the CRM seed. */
export async function setPublishRequestStatus(id: string, status: 'new' | 'contacted' | 'won' | 'lost'): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('publish_requests').update({ status }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Ingest tokens — API keys for the external scraper → ingest-profile endpoint
// ---------------------------------------------------------------------------

export interface IngestToken { id: string; token: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

export async function listIngestTokens(): Promise<IngestToken[]> {
  const { data } = await supabase.from('ingest_tokens').select('*').order('created_at', { ascending: false });
  return (data as IngestToken[]) ?? [];
}

export async function createIngestToken(label = 'scraper'): Promise<IngestToken | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  const token = 'ffi_' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0').slice(0, 1)).join('')
    + Math.random().toString(36).slice(2, 12);
  const { data } = await supabase.from('ingest_tokens')
    .insert({ user_id: auth.user.id, token, label: label.slice(0, 60) }).select('*').single();
  return (data as IngestToken) ?? null;
}

export async function revokeIngestToken(id: string): Promise<void> {
  await supabase.from('ingest_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id);
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
  status: 'new' | 'contacted' | 'won' | 'lost';
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

/** Public fetch for the no-login preview route. Goes through the get_preview_by_slug RPC
 *  (app_0041): the table itself is owner-read-only now, and the ONLY anonymous door returns
 *  exactly one row for an exact (unguessable) slug — never the whole pipeline. */
export async function getPreviewSite(slugOrId: string): Promise<PreviewSiteRow | null> {
  const { data } = await supabase.rpc('get_preview_by_slug', { p_slug: slugOrId });
  return (data as PreviewSiteRow | null) ?? null;
}

export async function listPreviewSites(): Promise<PreviewSiteRow[]> {
  const { data } = await supabase.from('preview_sites').select('*').order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as PreviewSiteRow[];
}

export async function deletePreviewSite(id: string): Promise<void> {
  await supabase.from('preview_sites').delete().eq('id', id);
}

export { RECIPES };
