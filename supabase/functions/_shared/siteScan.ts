// supabase/functions/_shared/siteScan.ts
// SITE-LEVEL CORROBORATION — read more than one page, so an absence can be said plainly.
//
// Why this exists: the deep scan is deliberately per-page, and per-page honesty forced the outreach
// email to close with a three-sentence hedge ("reads one page… cannot see JavaScript… not an
// audit"). The operator's verdict on that paragraph was right: a hedge that broad reads as "maybe
// none of this is true". The fix is not softer wording — it is EARNING the plain sentence. This
// layer makes an absence claim pass three gates before it may reach a pitch:
//
//   1. EVERY PAGE READ. "No contact form" must hold on the homepage AND the contact page AND every
//      other page we fetched. One page with a form kills the claim (as it should — it was false).
//   2. NOTHING LEFT UNREAD. If the homepage links a contact/booking page we could not fetch, no
//      absence ships at all. An absence with an unread door behind it is a guess.
//   3. NOTHING COULD MOUNT IT LATER. If any page loads a tag manager or is built by an app
//      framework (React/Next/Vue/…), a form or booking widget could appear after load where the
//      static read sees none — so no absence ships. Builder sites (GoDaddy/Wix/Squarespace render
//      their forms server-side) pass this gate; SPA shells and GTM-wired pages do not.
//
// A claim that passes all three is stated without the JavaScript hedge (removed verbatim via the
// shared constants — see conversionScan.ts) and is upgraded to 'detected', because the stated
// reason for 'likely' was precisely the blind spot these gates rule out. A claim that fails any
// gate is DROPPED from the pitch, never rewritten softer: the report layer still carries the full
// per-page scan with its limits, so nothing is hidden — it just doesn't get said to a stranger.
//
// Findings that point at something PRESENT on the homepage (missing alt text, no viewport tag, a
// form posting over http://) pass through untouched — they were never hedged, because they are
// directly observable in the bytes.
//
// Pure + deterministic. Runs in Deno (fetch-url) and under tsx (siteScan.verify.ts).

import { deepScan } from './deepScan.ts';
import { BOOKING_WIDGET_HEDGE, CONTACT_LINK_HEDGE, JS_APP, JS_INJECTION_HEDGE } from './conversionScan.ts';
import type { Finding } from './scanTypes.ts';

/** Versioned separately from SCAN_VERSION: per-page detection is unchanged; this layer only
 *  decides which per-page findings are corroborated enough to say to a prospect. */
export const SITE_SCAN_VERSION = '1.0.0';

/** One fetched page: its path (for provenance wording) and its raw HTML. Homepage first. */
export interface SitePage { path: string; html: string }

export interface SiteScanSummary {
  version: string;
  /** Paths actually read, homepage first — the provenance the email states. */
  pagesChecked: string[];
  /** Contact/booking-page links we found but could not read. Non-empty ⇒ no absence claims. */
  unreached: string[];
  /** True when some page could mount content after load (tag manager / app framework). */
  jsInjection: boolean;
  /** The pitch-grade findings: corroborated absences (de-hedged) + the homepage's presence findings. */
  findings: Finding[];
}

// ─── Which same-site pages are worth reading before claiming an absence ──────────────────────────
// The pages where a way-in would live if the homepage doesn't show one: contact, quote, booking.
// Matched on the path with segment-ish boundaries ("/book" and "/contact-us", not "/facebook-feed"
// — though same-origin filtering already excludes social links) and on the link's visible label.

const TARGET_PATH =
  /(?:^|[/._-])(?:contact(?:-?us)?|get-in-touch|reach-us|get-a-quote|request-a-quote|quote|estimate|book(?:ing|-online|-now)?|book-us|schedule|scheduling|appointments?|reservations?)(?:$|[/._?#-])/i;
const TARGET_LABEL =
  /\b(?:contact|get in touch|reach (?:us|out)|book(?: now| online)?|schedule|appointment|reservation|get a quote|request a quote|free estimate)\b/i;
/** Files a browser downloads rather than renders — never scan targets. */
const SKIP_EXT = /\.(?:pdf|jpe?g|png|gif|webp|svg|avif|mp4|mov|zip|docx?|xlsx?|pptx?)(?:$|\?)/i;
const MAX_TARGETS = 2;

/**
 * The same-origin contact/booking/quote pages the homepage links, absolutized — the pages that must
 * be read before any absence may be claimed. Capped, deduped, contact-ish paths first (the contact
 * page is the one that most often falsifies "no way in"). Returns [] on unparseable input.
 */
export function siteScanTargets(html: string, baseUrl: string): string[] {
  const src = typeof html === 'string' ? html : '';
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const seen = new Set<string>([base.href]);
  const contact: string[] = [];
  const other: string[] = [];
  for (const m of src.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, ' ');
    let abs: URL;
    try { abs = new URL(href, base); } catch { continue; }
    if (abs.hostname !== base.hostname) continue;
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (SKIP_EXT.test(abs.pathname)) continue;
    if (!TARGET_PATH.test(abs.pathname) && !TARGET_LABEL.test(label)) continue;
    abs.hash = '';
    if (seen.has(abs.href)) continue;
    seen.add(abs.href);
    (/contact|get-in-touch|reach/i.test(abs.pathname) ? contact : other).push(abs.href);
  }
  return [...contact, ...other].slice(0, MAX_TARGETS);
}

// ─── The injection gate ──────────────────────────────────────────────────────────────────────────
// A tag manager or an app framework is the standard way a form or booking widget appears only
// after the page loads. Matched generously — every hit can only SUPPRESS a claim, never fire one,
// so a false positive here costs a quieter email, not a false sentence.

const TAG_MANAGER =
  /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]{4,}\b|assets\.adobedtm\.com|tags\.tiqcdn\.com|cdn\.segment\.com\/analytics\.js/i;

/** True when this page could be putting content on screen after load — so a static absence on it
 *  is not a fact about what a visitor sees. */
export function couldInjectContent(html: string): boolean {
  const src = typeof html === 'string' ? html : '';
  return TAG_MANAGER.test(src) || JS_APP.test(src);
}

// ─── Corroboration ───────────────────────────────────────────────────────────────────────────────

/**
 * Which finding codes on ANOTHER page count as agreement with a homepage absence. Mostly the same
 * code — but "the phone is the only way in" is not contradicted by a page with NO way in at all
 * (the homepage's phone link is still the site's only door), so no_contact_path corroborates it.
 * A page where neither fires has some other way in, and correctly kills the claim.
 */
const ABSENCE_AGREES: Record<string, string[]> = {
  'conv.no_contact_path': ['conv.no_contact_path'],
  'conv.no_booking': ['conv.no_booking'],
  'conv.phone_only': ['conv.phone_only', 'conv.no_contact_path'],
};

/** Owner-facing names for the paths we read, for provenance sentences. First match wins. */
const PAGE_NAMES: [RegExp, string][] = [
  [/contact|get-in-touch|reach/i, 'your contact page'],
  [/book|schedul|appoint|reserv/i, 'your booking page'],
  [/quote|estimate/i, 'your quote page'],
  [/about|team|staff/i, 'your about page'],
  [/service/i, 'your services page'],
  [/gallery|portfolio|our-work|project|photo/i, 'your gallery page'],
  [/menu/i, 'your menu page'],
  [/pricing/i, 'your pricing page'],
  [/area|location/i, 'your service-area page'],
  [/hour/i, 'your hours page'],
];

/** "/contact, /about" → "your contact page and your about page". Deduped; '' for no paths. */
export function describePages(paths: string[]): string {
  const names: string[] = [];
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p !== 'string' || !p) continue;
    const hit = PAGE_NAMES.find(([re]) => re.test(p));
    const name = hit ? hit[1] : `the ${p} page`;
    if (!names.includes(name)) names.push(name);
  }
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The corroborated form of an absence finding: hedges removed (they were just ruled out), the
 *  other pages named, and the injection gate's result stated as the fact it is. */
function siteScoped(f: Finding, pagesChecked: string[]): Finding {
  const others = pagesChecked.slice(1);
  let detail = f.detail.replace(JS_INJECTION_HEDGE, '').replace(BOOKING_WIDGET_HEDGE, '');
  if (others.length) {
    // "Only this one page was read" stops being true the moment we read the others; the
    // corroboration sentence below states what replaced it.
    detail = detail.replace(CONTACT_LINK_HEDGE, '');
    detail += ` The same is true on ${describePages(others)} — every page we read, not just the front page.`;
  }
  detail +=
    ' The site loads no tag manager and no app framework — the usual ways a form or booking tool ' +
    'appears only after a page loads — so what was checked here is what a visitor’s browser receives.';
  return {
    ...f,
    confidence: 'detected',
    title: others.length ? f.title.replace(/on the page$/, 'on any page we read') : f.title,
    detail,
  };
}

/**
 * Scan every fetched page and return the findings solid enough to say to a prospect.
 *
 * `pages[0]` is the homepage; presence findings come from it alone (a count must be reproducible by
 * viewing one URL). Absence findings survive only through the three gates described at the top of
 * this file. Empty input claims nothing.
 */
export function corroborateScan(pages: SitePage[], unreached: string[] = []): SiteScanSummary {
  const list = (Array.isArray(pages) ? pages : []).filter((p) => p && typeof p.html === 'string');
  const missed = (Array.isArray(unreached) ? unreached : []).filter((u) => typeof u === 'string' && u);
  if (list.length === 0) {
    return { version: SITE_SCAN_VERSION, pagesChecked: [], unreached: missed, jsInjection: false, findings: [] };
  }

  const home = deepScan(list[0].html);
  const others = list.slice(1).map((p) => ({
    path: p.path || '/',
    codes: new Set(deepScan(p.html).findings.map((f) => f.code)),
  }));
  const jsInjection = list.some((p) => couldInjectContent(p.html));
  const pagesChecked = [list[0].path || '/', ...others.map((o) => o.path)];

  const findings: Finding[] = [];
  for (const f of home.findings) {
    const agrees = ABSENCE_AGREES[f.code];
    if (!agrees) { findings.push(f); continue; }              // presence finding — never hedged, passes through
    if (missed.length > 0) continue;                          // gate 2: an unread door behind the claim
    if (jsInjection) continue;                                // gate 3: something could mount it after load
    if (!others.every((o) => agrees.some((code) => o.codes.has(code)))) continue; // gate 1: must hold everywhere
    findings.push(siteScoped(f, pagesChecked));
  }

  return { version: SITE_SCAN_VERSION, pagesChecked, unreached: missed, jsInjection, findings };
}
