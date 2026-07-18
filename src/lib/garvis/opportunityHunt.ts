// src/lib/garvis/opportunityHunt.ts
// THE OPPORTUNITY HUNT (pure core) — the missing concept, made real: an OPPORTUNITY is a job/
// RFP/grant/commission as a structured object (title, source, location, budget, deadline), found
// by scheduled search sweeps and accumulated in a deduped feed the operator triages. Before this,
// "scrape the internet for mural jobs" had no home: the fetcher read one URL, the hunter found
// businesses (not jobs), and nothing extracted or kept anything.
//
// Pure logic only (query building, the extraction contract, the parse gauntlet, dedupe identity)
// so both the client (registry action, feed page) and the standing-worker import ONE truth —
// same pattern as clientHuntSchedule. Verified by opportunityHunt.verify.ts.
//
// HONESTY RULES:
//  - Extraction returns ONLY what a fetched page actually says; a page with no real opportunity
//    yields nothing — the model is forbidden from inventing budgets/deadlines to fill fields.
//  - Every extracted item must point at a URL we actually fetched (the gauntlet enforces the
//    allowlist) — hallucinated links cannot enter the feed.
//  - Unknown fields stay null, never guessed.

export interface HuntSpec {
  /** What to hunt, in the operator's words ("mural commissions, public art RFPs, custom art jobs"). */
  focus: string;
  /** Optional geography ("Wisconsin", "Chicago area"). */
  region?: string | null;
  /** Derived search queries (buildQueries) — stored in the order config so runs are inspectable. */
  queries: string[];
}

export interface FoundOpportunity {
  title: string;
  source_url: string;
  summary: string;
  kind: string;               // e.g. 'mural' | 'public-art' | 'grant' | 'commission' | 'job' | 'other'
  location: string | null;
  budget_text: string | null;
  deadline_text: string | null;
}

export const MAX_QUERIES = 4;
export const MAX_FOUND_PER_RUN = 12;

/**
 * Deterministic query set from focus + region. Angle-diverse on purpose (open calls, RFPs,
 * commissions, applications) — one search phrasing misses what another catches.
 */
export function buildQueries(focus: string, region?: string | null): string[] {
  const f = focus.trim().replace(/\s+/g, ' ');
  const r = (region ?? '').trim();
  const geo = r ? ` ${r}` : '';
  const qs = [
    `${f} open call${geo}`,
    `${f} RFP application deadline${geo}`,
    `"call for artists" ${f}${geo}`,
    `${f} commission opportunity apply${geo}`,
  ];
  return [...new Set(qs.map((q) => q.replace(/\s+/g, ' ').trim()))].slice(0, MAX_QUERIES);
}

export const EXTRACT_SYSTEM = `You extract real, currently-open OPPORTUNITIES (jobs, RFPs, grants, commissions,
open calls) from fetched web pages, for one operator hunting work.

You receive pages as blocks: "PAGE <n> · <url>" followed by that page's text. Return STRICT JSON only — an array:
[{"title":"<the opportunity, <=100 chars>","source_url":"<the PAGE url it came from, verbatim>",
  "summary":"1-2 sentences of what it actually is, from the page text only",
  "kind":"mural"|"public-art"|"grant"|"commission"|"job"|"other",
  "location":"<place if the page states one, else null>",
  "budget_text":"<budget/fee exactly as the page states it, else null>",
  "deadline_text":"<deadline exactly as the page states it, else null>"}]

RULES:
- ONLY opportunities the page text actually describes. A listing INDEX page with multiple items → extract each
  item you can see. A page that is a company site, article, or expired listing → contribute NOTHING.
- source_url must be one of the given PAGE urls, verbatim. Never construct or guess a deeper link.
- Unknown location/budget/deadline stay null — never invent, never estimate.
- If nothing on any page is a real opportunity, return [].
No preamble, no markdown fences.`;

/** Stable identity for dedupe: host + path (query/hash stripped) + normalized title. */
export function dedupeKey(sourceUrl: string, title: string): string {
  let urlPart = sourceUrl.trim().toLowerCase();
  try {
    const u = new URL(sourceUrl);
    urlPart = `${u.host}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch { /* keep raw */ }
  const titlePart = title.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  return `${urlPart}::${titlePart}`;
}

/**
 * Parse gauntlet for the extraction. `allowedUrls` is the set of pages we actually fetched —
 * any item pointing elsewhere is DROPPED (hallucinated links cannot enter the feed). Unusable
 * output → [] (a failed extraction finds nothing; it never breaks the run).
 */
export function parseOpportunities(raw: string, allowedUrls: string[]): FoundOpportunity[] {
  const t = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
  let arr: unknown;
  try { arr = JSON.parse(t); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const allowed = new Set(allowedUrls.map((u) => u.trim()));
  const out: FoundOpportunity[] = [];
  const seen = new Set<string>();
  for (const item of arr.slice(0, MAX_FOUND_PER_RUN * 2)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 100) : '';
    const url = typeof o.source_url === 'string' ? o.source_url.trim() : '';
    const summary = typeof o.summary === 'string' ? o.summary.trim().slice(0, 400) : '';
    if (!title || !summary || !allowed.has(url)) continue;
    const key = dedupeKey(url, title);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = typeof o.kind === 'string' && ['mural', 'public-art', 'grant', 'commission', 'job', 'other'].includes(o.kind) ? o.kind : 'other';
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : null);
    out.push({ title, source_url: url, summary, kind, location: str(o.location), budget_text: str(o.budget_text), deadline_text: str(o.deadline_text) });
    if (out.length >= MAX_FOUND_PER_RUN) break;
  }
  return out;
}

/** The run's honest one-liner (last_result / webhook / mind_event). */
export function huntLine(focus: string, searched: number, fetched: number, found: number, thin: number): string {
  if (found > 0) {
    return `Opportunity hunt "${focus}": ${found} new opportunit${found === 1 ? 'y' : 'ies'} from ${searched} search${searched === 1 ? '' : 'es'} — review them in the feed.${thin ? ` (${thin} page(s) unreadable — likely JS-rendered; open manually.)` : ''}`;
  }
  return `Opportunity hunt "${focus}": nothing new (${searched} search${searched === 1 ? '' : 'es'}, ${fetched} page${fetched === 1 ? '' : 's'} read${thin ? `, ${thin} unreadable` : ''}).`;
}
