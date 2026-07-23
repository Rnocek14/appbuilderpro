// src/lib/garvis/claudeScout.ts
// PURE core of the Claude-driven discovery scout (no network/DOM; verified by claudeScout.verify.ts).
//
// "Claude runs the scraping." Instead of the Google Places API (a Cloud project + billing + key
// restrictions), we hand Claude the web_search tool and ask it to find REAL local businesses of a
// given type in a given city — and, in the same pass, judge whether each one's website is BAD or
// MISSING. That site-quality verdict is the actual sell signal Places can't give: Places only tells
// you a website field exists, never that it's a broken 2009 template.
//
// This module is the deterministic half: build the search prompt, and — the part that matters most
// for the never-invent rule — PARSE + GROUND Claude's answer. A business is kept ONLY if it is tied
// to a real citation URL that Anthropic's web search actually returned. Anything the model asserts
// without a matching source is dropped, never persisted — so we can never pitch a business that
// doesn't exist. The edge fn (discover-run, source:'claude') does the metered completeWithWebSearch
// call + the DB writes around these.
//
// Value import uses the .ts extension because this module is pulled into a Deno edge function
// (same discipline as billing/clientSale.ts → clientTiers.ts).

import { normalizeHost, isDirectoryOrSocialUrl } from './placesDiscovery.ts';

export const SCOUT_SYSTEM = `You are a local-business prospector for a web-design agency. Your job is to
find REAL small businesses of a given type in a given city and judge the state of each one's website.
The agency sells websites, so businesses with NO website or a BAD/outdated website are the valuable
finds.

Hard rules:
- Use web search. Only report businesses you actually find in real search results. NEVER invent a
  business, a phone number, or a website. If you are unsure a business is real, leave it out.
- For every business, include the "source" URL: the page you found it on (its own site, a Google/Maps
  listing, Yelp, a directory — whatever you actually read). No source ⇒ do not include it.
- Judge the website honestly in "site_verdict": one short phrase, e.g. "no website", "outdated",
  "not mobile-friendly", "template/DIY", "just a Facebook page", or "modern/good".
- Prefer businesses with weak, missing, or outdated websites, but report every real one you find.

Return ONLY strict JSON, no prose, in exactly this shape:
{"businesses":[{"name":"...","website":"https://... or null","phone":"... or null","address":"... or null","city":"...","state":"XX","site_verdict":"...","source":"https://..."}]}`;

/** The search instruction for one (business type × city) combo. */
export function buildScoutPrompt(keyword: string, city: string, state: string): string {
  const where = [city, state].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  return `Find real "${keyword.trim()}" businesses in ${where}. For each, give its website (or null if it
has none), phone and address if you find them, and an honest one-phrase verdict on its website. Focus on
independent local businesses — the ones most likely to have a weak or missing website. Return the JSON.`;
}

/** One grounded lead the scout kept — shaped for a discovered_businesses insert (place_id is null:
 *  these come from the open web, not Places). `category` carries Claude's site verdict so the "bad
 *  site" judgment is persisted, not just "has a site / doesn't". */
export interface ScoutLead {
  company_name: string;
  keyword: string;
  website: string | null;
  website_normalized: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  category: string | null;   // site verdict ("outdated", "no website", …)
  has_website: boolean;      // false ⇒ the strongest "I'll build you a site" prospect
  source_url: string | null; // the citation this lead is grounded on (audit trail)
}

export interface ScoutParse {
  leads: ScoutLead[];
  parsed: number;    // business rows Claude returned
  grounded: number;  // rows tied to a real citation (kept)
  dropped: number;   // rows with no matching citation (never persisted)
}

/** Pull the JSON payload out of a model response (tolerant of fences / leading prose). Returns the
 *  businesses array, or [] on any garbage — a bad response must never throw. */
function extractBusinesses(raw: string): unknown[] {
  const clean = (raw ?? '').replace(/```json|```/g, '').trim();
  const candidates: string[] = [];
  const oStart = clean.indexOf('{'); const oEnd = clean.lastIndexOf('}');
  if (oStart !== -1 && oEnd > oStart) candidates.push(clean.slice(oStart, oEnd + 1));
  const aStart = clean.indexOf('['); const aEnd = clean.lastIndexOf(']');
  if (aStart !== -1 && aEnd > aStart) candidates.push(clean.slice(aStart, aEnd + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object' && Array.isArray((v as { businesses?: unknown }).businesses)) {
        return (v as { businesses: unknown[] }).businesses;
      }
    } catch { /* try the next candidate */ }
  }
  return [];
}

/** The set of hosts Anthropic actually cited. `sources` come back as "Title — https://url" strings
 *  (completeWithWebSearch's format); we pull the URL and normalize it to a bare host. */
export function citationHosts(sources: string[]): Set<string> {
  const hosts = new Set<string>();
  for (const s of sources ?? []) {
    const m = String(s).match(/https?:\/\/[^\s)]+/);
    const h = normalizeHost(m ? m[0] : null);
    if (h) hosts.add(h);
  }
  return hosts;
}

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || /^(null|n\/a|none|unknown)$/i.test(t)) return null;
  return t;
};

/** Parse Claude's answer into grounded leads. A row survives ONLY if a real citation host backs it —
 *  either the business's own website is a cited host, or the source URL it was found on is. Rows with
 *  no citation match are dropped (anti-hallucination floor). Deterministic + fully unit-testable. */
export function groundScoutLeads(
  rawText: string,
  sources: string[],
  keyword: string,
  fallbackCity: string,
  fallbackState: string,
): ScoutParse {
  const hosts = citationHosts(sources);
  const rows = extractBusinesses(rawText);
  const leads: ScoutLead[] = [];
  let dropped = 0;

  for (const r of rows) {
    if (!r || typeof r !== 'object') { dropped++; continue; }
    const o = r as Record<string, unknown>;
    const name = str(o.name) ?? str(o.company_name) ?? str(o.company);
    if (!name) { dropped++; continue; }

    const website = str(o.website) ?? str(o.url) ?? str(o.site);
    const website_normalized = normalizeHost(website);
    const source = str(o.source) ?? str(o.source_url) ?? str(o.cited_from);
    const sourceHost = normalizeHost(source);

    // GROUNDING: the business's own site is a cited host, OR the page it was found on is. No citation
    // match ⇒ we have no proof this business is real ⇒ drop it. A Facebook citation still counts —
    // it proves the business exists — so grounding uses the ORIGINAL url before we reclassify below.
    const grounded = (website_normalized !== null && hosts.has(website_normalized)) ||
      (sourceHost !== null && hosts.has(sourceHost));
    if (!grounded) { dropped++; continue; }

    // A social/directory URL isn't THEIR website: null it so this is a clean has_website:false
    // prospect (the best rebuild target) and the scraper never hits a social login wall.
    const social = isDirectoryOrSocialUrl(website);

    leads.push({
      company_name: name,
      keyword: keyword.trim(),
      website: social ? null : website,
      website_normalized: social ? null : website_normalized,
      phone: str(o.phone),
      address: str(o.address),
      city: str(o.city) ?? (fallbackCity.trim() || null),
      state: str(o.state) ?? (fallbackState.trim() || null),
      category: (str(o.site_verdict) ?? str(o.verdict) ?? str(o.site_quality))?.slice(0, 80) ?? null,
      has_website: !social && website_normalized !== null,
      source_url: source ?? (website && website_normalized && hosts.has(website_normalized) ? website : null),
    });
  }

  return { leads, parsed: rows.length, grounded: leads.length, dropped };
}
