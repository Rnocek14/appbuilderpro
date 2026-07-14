// src/lib/garvis/clientHuntRun.ts
// The impure half of "win new clients": find REAL businesses for a niche + area (Google/Serper
// organic results — never invented), then LOOK at each one's site and audit it honestly (auditSite).
// Nothing here fabricates a business, a URL, or a verdict; an unreachable site is an honest unknown.

import { supabase } from '../supabase';
import { parseSerperOrganic } from './marketIntel';
import { auditSite, type SiteAudit } from './siteAudit';

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

/** Look at one business's site and audit it honestly. Unreachable → an honest 'unknown', never faked. */
export async function auditBusiness(url: string): Promise<SiteAudit> {
  const nowYear = new Date().getFullYear();
  try {
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url, mode: 'text' } });
    if (error) throw new Error(error.message);
    const d = data as { url?: string; title?: string; description?: string; text?: string; error?: string; checks?: { viewport?: boolean; form?: boolean; email?: boolean; https?: boolean } };
    if (!d || d.error) return auditSite({ url, reachable: false }, nowYear);
    const c = d.checks ?? {};
    return auditSite({
      url: d.url || url, reachable: true, title: d.title ?? null, description: d.description ?? null,
      text: d.text ?? '', hasViewport: !!c.viewport, hasForm: !!c.form, emailFound: !!c.email,
    }, nowYear);
  } catch {
    return auditSite({ url, reachable: false }, nowYear);
  }
}
