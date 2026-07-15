// src/lib/garvis/clientHuntRun.ts
// The impure half of "win new clients": find REAL businesses for a niche + area (Google/Serper
// organic results — never invented), then LOOK at each one's site and audit it honestly (auditSite).
// Nothing here fabricates a business, a URL, or a verdict; an unreachable site is an honest unknown.

import { supabase } from '../supabase';
import { parseSerperOrganic } from './marketIntel';
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

// Big aggregators/directories aren't prospects — we want a business's OWN site (a weak one we can beat).
const DIRECTORY = /(yelp\.|facebook\.|instagram\.|linkedin\.|yellowpages\.|bbb\.org|mapquest\.|tripadvisor\.|angi\.com|thumbtack\.|google\.[a-z.]+\/maps|houzz\.|nextdoor\.|wikipedia\.|amazon\.|reddit\.)/i;

/** Real businesses for "niche + area", from Google organic results. Skips directories; deduped. */
export async function findBusinesses(niche: string, area: string): Promise<FoundBusiness[]> {
  const q = [niche.trim(), area.trim()].filter(Boolean).join(' ');
  if (!q) throw new Error('Add a niche and an area first.');
  const { data, error } = await supabase.functions.invoke('discover-media', {
    body: { provider: 'serper', path: 'search', q },
  });
  if (error) throw new Error(error.message);
  const payload = data as { available?: boolean; data?: unknown; error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.available) throw new Error('Search isn’t set up on the server yet (SERPER_API_KEY missing).');

  const seen = new Set<string>();
  const out: FoundBusiness[] = [];
  for (const c of parseSerperOrganic(payload.data, 20)) {
    const url = c.url;
    if (url && DIRECTORY.test(url)) continue;
    const key = (url ?? c.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: c.name, url, snippet: c.snippet, audit: null });
    if (out.length >= 12) break;
  }
  return out;
}

export interface SweepProgress { done: number; total: number; found: number; city: string }

/** NATIONAL SWEEP — fan the same honest "niche + city" Google search across many US cities, dedupe
 *  the businesses nationwide (a shop found in two cities is one prospect), and stream them back as
 *  they arrive. One search per city; a small concurrency pool + the cap keep it gentle + bounded.
 *  Discovery only — nothing is built or emailed here. Returns every unique business found. */
export async function sweepNation(
  niche: string,
  cities: UsCity[],
  opts: {
    cap?: number;                              // max cities to search (= max Google searches)
    concurrency?: number;                      // parallel searches (1-5; default 3, gentle on the API)
    onFound?: (b: FoundBusiness) => void;      // stream each NEW business as it's discovered
    onProgress?: (p: SweepProgress) => void;   // per-city progress
    shouldStop?: () => boolean;                // cooperative cancel (checked before each city)
  } = {},
): Promise<FoundBusiness[]> {
  const plan = sweepPlan(niche, cities, opts.cap ?? cities.length);
  const seen = new Set<string>();              // registrable domains found so far (national dedupe)
  const found: FoundBusiness[] = [];
  const conc = Math.max(1, Math.min(opts.concurrency ?? 3, 5));
  let i = 0; let done = 0;
  const worker = async () => {
    while (i < plan.length) {
      if (opts.shouldStop?.()) return;
      const qy = plan[i++];
      try {
        const biz = await findBusinesses(qy.niche, qy.area);
        for (const b of biz) {
          if (!registerDomain(seen, b.url)) continue;   // already found nationwide → skip
          found.push(b);
          opts.onFound?.(b);
        }
      } catch { /* one city's search failing never sinks the national sweep */ }
      done++;
      opts.onProgress?.({ done, total: plan.length, found: found.length, city: `${qy.city}, ${qy.state}` });
    }
  };
  await Promise.all(Array.from({ length: conc }, () => worker()));
  return found;
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

/** The raw page context behind an audit — fetched anyway, kept so we can persist + detect on it later. */
export interface ScrapeContext {
  reachable: boolean;
  title: string | null;
  description: string | null;
  text: string;                 // readable page text (capped by fetch-url)
  checks: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean };
}

/** Fetch a business's site ONCE and return both the honest audit and the raw scrape context (so the
 *  caller can persist it — the page text/checks are fetched regardless and were being discarded).
 *  Unreachable → an honest 'unknown' audit + an empty context, never faked. */
export async function scrapeAndAudit(url: string): Promise<{ audit: SiteAudit; scrape: ScrapeContext }> {
  const nowYear = new Date().getFullYear();
  const empty: ScrapeContext = { reachable: false, title: null, description: null, text: '', checks: {} };
  try {
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url, mode: 'text' } });
    if (error) throw new Error(error.message);
    const d = data as { url?: string; title?: string; description?: string; text?: string; error?: string; checks?: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean } };
    if (!d || d.error) return { audit: auditSite({ url, reachable: false }, nowYear), scrape: empty };
    const c = d.checks ?? {};
    const scrape: ScrapeContext = {
      reachable: true, title: d.title ?? null, description: d.description ?? null, text: d.text ?? '', checks: c,
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

/** Persist an audit we just ran, so it stops being thrown away (Phase 0 — see app_0072_prospect_audits.sql).
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

    const row = {
      owner_id: uid,
      url,
      host,
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
      meta_title: sc?.title ?? null,
      meta_description: sc?.description ?? null,
      text_snippet: sc?.text ? sc.text.slice(0, 8000) : null,
      last_audited_at: new Date().toISOString(),
    };

    // SELECT-FIRST (house rule): refresh an existing prospect's audit rather than duplicate it.
    const { data: existing } = await supabase.from('prospect_audits')
      .select('id').eq('owner_id', uid).eq('url', url).maybeSingle();
    if (existing) {
      await supabase.from('prospect_audits').update(row).eq('id', (existing as { id: string }).id);
    } else {
      await supabase.from('prospect_audits').insert(row);
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
  checks: Record<string, boolean>;
  meta_title: string | null;
  meta_description: string | null;
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
