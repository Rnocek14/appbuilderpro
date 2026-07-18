// src/lib/garvis/clientHuntRun.ts
// The impure half of "win new clients": find REAL businesses for a niche + area (Google/Serper
// organic results — never invented), then LOOK at each one's site and audit it honestly (auditSite).
// Nothing here fabricates a business, a URL, or a verdict; an unreachable site is an honest unknown.

import { supabase } from '../supabase';
import { parsePlace, type PlaceRaw } from './placesDiscovery';
import { deriveSignals, proposeFromSignals } from './automation/detect';
import { auditSite, type SiteAudit, type AuditSignal, type Verdict } from './siteAudit';
import { sweepPlan, registerDomain } from './nationalSweepCore';
import { detectVertical } from './verticals';
import type { UsCity } from './usCities';

export interface FoundBusiness {
  name: string;
  url: string | null;
  snippet: string;
  audit: SiteAudit | null;   // filled once we've looked at their site
  auditing?: boolean;
}

/** The REAL error behind a failed functions.invoke. supabase-js flattens every non-2xx to a generic
 *  "Edge Function returned a non-2xx status code" — but the function's JSON body carries the honest
 *  message (402 out of credits, "Places 403", …). Read it so the user sees why, not just that. */
async function realInvokeError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json() as { error?: string };
      if (body?.error) return body.error;
    } catch { /* non-JSON body — fall through */ }
  }
  const msg = (error as { message?: string })?.message;
  return msg && !/non-2xx status code/i.test(msg) ? msg : fallback;
}

/** Real businesses for "niche + area", from Google Places (the SAME backend as the daily hunt).
 *  Places returns structured leads — real name, website, address, category — so there are no
 *  directory snippets to filter out. Deduped by normalized website (falling back to name). */
export async function findBusinesses(niche: string, area: string): Promise<FoundBusiness[]> {
  const q = [niche.trim(), area.trim()].filter(Boolean).join(' in ');
  if (!q) throw new Error('Add a niche and an area first.');
  const { data, error } = await supabase.functions.invoke('discover-media', {
    body: { provider: 'places', q },
  });
  if (error) throw new Error(await realInvokeError(error, 'The search call failed — check /garvis/health and that discover-media is deployed.'));
  const payload = data as { available?: boolean; data?: { places?: PlaceRaw[] }; error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.available) throw new Error('Search isn’t set up on the server yet (GOOGLE_PLACES_API_KEY missing).');

  const seen = new Set<string>();
  const out: FoundBusiness[] = [];
  for (const raw of payload.data?.places ?? []) {
    const biz = parsePlace(raw, niche);
    if (!biz) continue;
    const key = (biz.website_normalized ?? biz.company_name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // The snippet carries what Places knows: address + category (never invented).
    const snippet = [biz.address, biz.category?.replace(/_/g, ' ')].filter(Boolean).join(' · ');
    out.push({ name: biz.company_name, url: biz.website, snippet, audit: null });
    if (out.length >= 12) break;
  }
  return out;
}

export interface SweepProgress { done: number; total: number; found: number; failed: number; city: string }
export interface SweepResult { found: FoundBusiness[]; failed: number; lastError: string | null }

/** NATIONAL SWEEP — fan the same honest "niche + city" Places search across many US cities, dedupe
 *  the businesses nationwide (a shop found in two cities is one prospect), and stream them back as
 *  they arrive. One search per city; a small concurrency pool + the cap keep it gentle + bounded.
 *  Discovery only — nothing is built or emailed here.
 *  Honesty rules: a business with NO website is KEPT (it's the strongest "build you a site"
 *  prospect — deduped by name instead of domain), and failed city searches are COUNTED and the
 *  last real error reported — a sweep that failed everywhere never poses as "found 0". */
export async function sweepNation(
  niche: string,
  cities: UsCity[],
  opts: {
    cap?: number;                              // max cities to search (= max Places searches)
    concurrency?: number;                      // parallel searches (1-5; default 3, gentle on the API)
    onFound?: (b: FoundBusiness) => void;      // stream each NEW business as it's discovered
    onProgress?: (p: SweepProgress) => void;   // per-city progress
    shouldStop?: () => boolean;                // cooperative cancel (checked before each city)
  } = {},
): Promise<SweepResult> {
  const plan = sweepPlan(niche, cities, opts.cap ?? cities.length);
  const seen = new Set<string>();              // registrable domains found so far (national dedupe)
  const seenNames = new Set<string>();         // no-website businesses dedupe by normalized name
  const found: FoundBusiness[] = [];
  const conc = Math.max(1, Math.min(opts.concurrency ?? 3, 5));
  let i = 0; let done = 0; let failed = 0; let lastError: string | null = null;
  const worker = async () => {
    while (i < plan.length) {
      if (opts.shouldStop?.()) return;
      const qy = plan[i++];
      try {
        const biz = await findBusinesses(qy.niche, qy.area);
        for (const b of biz) {
          if (b.url) {
            if (!registerDomain(seen, b.url)) continue;          // already found nationwide → skip
          } else {
            const key = b.name.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!key || seenNames.has(key)) continue;
            seenNames.add(key);
          }
          found.push(b);
          opts.onFound?.(b);
        }
      } catch (e) {
        // One city failing never sinks the sweep — but it is never silent either.
        failed++;
        lastError = e instanceof Error ? e.message : String(e);
      }
      done++;
      opts.onProgress?.({ done, total: plan.length, found: found.length, failed, city: `${qy.city}, ${qy.state}` });
    }
  };
  await Promise.all(Array.from({ length: conc }, () => worker()));
  return { found, failed, lastError };
}

/** The first publicly-listed email on a business's site (or its contact page), or null. Never
 *  invents an address — returns only what the site itself publishes. */
export async function findContactEmail(url: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url, mode: 'contact' } });
    if (error) return null;
    const emails = (data as { emails?: string[] })?.emails ?? [];
    return emails[0] ?? null;
  } catch { return null; }
}

/** The tech a business runs, read from their own page markup by fetch-url (see _shared/techFingerprint). */
export interface TechFingerprint {
  builder: string | null;
  diyBuilder: boolean;
  booking: string | null;
  analytics: string[];
  chat: string | null;
  ecommerce: string | null;
}

/** The raw page context behind an audit — fetched anyway, kept so we can persist + detect on it later. */
export interface ScrapeContext {
  reachable: boolean;
  title: string | null;
  description: string | null;
  text: string;                 // readable page text (capped by fetch-url)
  checks: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean };
  tech: TechFingerprint | null; // the tech fingerprint, when fetch-url returned one
}

/** Fetch a business's site ONCE and return both the honest audit and the raw scrape context (so the
 *  caller can persist it — the page text/checks are fetched regardless and were being discarded).
 *  Unreachable → an honest 'unknown' audit + an empty context, never faked. */
export async function scrapeAndAudit(url: string): Promise<{ audit: SiteAudit; scrape: ScrapeContext }> {
  const nowYear = new Date().getFullYear();
  const empty: ScrapeContext = { reachable: false, title: null, description: null, text: '', checks: {}, tech: null };
  try {
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url, mode: 'text' } });
    if (error) throw new Error(error.message);
    const d = data as { url?: string; title?: string; description?: string; text?: string; error?: string; checks?: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean }; tech?: TechFingerprint };
    if (!d || d.error) return { audit: auditSite({ url, reachable: false }, nowYear), scrape: empty };
    const c = d.checks ?? {};
    const scrape: ScrapeContext = {
      reachable: true, title: d.title ?? null, description: d.description ?? null, text: d.text ?? '', checks: c,
      tech: d.tech ?? null,
    };
    const audit = auditSite({
      url: d.url || url, reachable: true, title: d.title ?? null, description: d.description ?? null,
      text: d.text ?? '', hasViewport: !!c.viewport, hasForm: !!c.form, emailFound: !!c.email,
    }, nowYear);
    return { audit, scrape };
  } catch {
    return { audit: auditSite({ url, reachable: false }, nowYear), scrape: empty };
  }
}

/** Look at one business's site and audit it honestly. Unreachable → an honest 'unknown', never faked. */
export async function auditBusiness(url: string): Promise<SiteAudit> {
  return (await scrapeAndAudit(url)).audit;
}

/** Persist an audit we just ran, so it stops being thrown away (Phase 0 — see app_0074_prospect_audits.sql).
 *  Best-effort by design: the honest audit UI must never break because a write failed. Records only what
 *  was really observed; `vertical` is a deterministic read of the scraped text, never invented. */
export interface RecordAuditInput {
  url: string;
  audit: SiteAudit;
  scrape?: ScrapeContext | null;
  source: 'find' | 'scan' | 'sweep' | 'manual';
  businessName?: string | null;
  niche?: string | null;
  area?: string | null;
}
export async function recordProspectAudit(input: RecordAuditInput): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) return;                                   // not signed in — nothing to scope the row to
    const url = input.url.trim();
    if (!url) return;
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw url as host */ }

    const a = input.audit;
    const sc = input.scrape ?? null;
    // Vertical = a deterministic classification of whatever text we actually have (null when none).
    const verticalText = [input.businessName, input.niche, a.headline, sc?.title, sc?.description, sc?.text]
      .filter(Boolean).join(' ').trim();
    const vertical = verticalText ? detectVertical(verticalText) : null;

    // AUTOMATION SEARCH at write time (app_0082): which catalog automations does THIS prospect's
    // audit ground? Stored as capability ids so the saved-audit pool is queryable by need.
    const view = {
      vertical: (vertical ?? null) as Parameters<typeof proposeFromSignals>[1],
      checks: (sc?.checks ?? {}) as { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean },
      siteSignalIds: a.signals.map((s) => s.id),
      text: sc?.text || null,
      tech: sc?.tech ?? null,
    };
    const proposals = proposeFromSignals(deriveSignals(view), view.vertical).proposals.map((p) => p.capabilityId);

    const row = {
      owner_id: uid,
      url,
      host,
      proposals,
      business_name: input.businessName ?? null,
      niche: input.niche?.trim() || null,
      area: input.area?.trim() || null,
      source: input.source,
      reachable: a.reachable,
      score: a.score,
      verdict: a.verdict,
      headline: a.headline,
      signals: a.signals,
      strengths: a.strengths,
      vertical,
      checks: sc?.checks ?? {},
      tech: sc?.tech ?? {},
      meta_title: sc?.title ?? null,
      meta_description: sc?.description ?? null,
      text_snippet: sc?.text ? sc.text.slice(0, 8000) : null,
      last_audited_at: new Date().toISOString(),
    };

    // SELECT-FIRST (house rule): refresh an existing prospect's audit rather than duplicate it.
    // If app_0082 isn't applied yet, retry without `proposals` — never lose the audit over a column.
    const { data: existing } = await supabase.from('prospect_audits')
      .select('id').eq('owner_id', uid).eq('url', url).maybeSingle();
    const write = async (r: Record<string, unknown>) =>
      existing
        ? supabase.from('prospect_audits').update(r).eq('id', (existing as { id: string }).id)
        : supabase.from('prospect_audits').insert(r);
    const { error: wErr } = await write(row);
    if (wErr && /proposals/.test(wErr.message)) {
      const { proposals: _drop, ...legacy } = row;
      await write(legacy);
    }
  } catch { /* best-effort: persistence never breaks the audit UI */ }
}

/** A saved audit row, as read back from prospect_audits (the accumulating prospect intelligence). */
export interface ProspectAuditRow {
  id: string;
  url: string;
  host: string | null;
  business_name: string | null;
  niche: string | null;
  area: string | null;
  source: string;
  reachable: boolean;
  score: number | null;
  verdict: Verdict;
  headline: string | null;
  signals: AuditSignal[];
  strengths: string[];
  vertical: string | null;
  proposals?: string[];          // detected automation capability ids (app_0082)
  checks: Record<string, boolean>;
  tech: Partial<TechFingerprint>;
  meta_title: string | null;
  meta_description: string | null;
  text_snippet: string | null;
  created_at: string;
  last_audited_at: string;
}

/** Read back the audits we've kept, newest first. Best-effort: returns [] when signed out or when the
 *  table hasn't been migrated yet, so the UI degrades to "nothing saved" instead of erroring. */
export async function listProspectAudits(
  opts: { verdict?: Verdict | 'all'; vertical?: string | 'all'; limit?: number } = {},
): Promise<ProspectAuditRow[]> {
  try {
    const { data: sess } = await supabase.auth.getUser();
    const uid = sess.user?.id;
    if (!uid) return [];
    let q = supabase.from('prospect_audits').select('*')
      .eq('owner_id', uid)
      .order('last_audited_at', { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.verdict && opts.verdict !== 'all') q = q.eq('verdict', opts.verdict);
    if (opts.vertical && opts.vertical !== 'all') q = q.eq('vertical', opts.vertical);
    const { data, error } = await q;
    if (error || !data) return [];
    return data as ProspectAuditRow[];
  } catch {
    return [];
  }
}
