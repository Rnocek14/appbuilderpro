// supabase/functions/_shared/scanTypes.ts
// THE DEEP-SCAN CONTRACT — the shared vocabulary every sub-scanner speaks.
//
// Why this exists: siteAudit.ts answers "does this business need a new website?" from six static
// heuristics (https, viewport, a form, an email, text volume, copyright year). That is honest but
// far too shallow to say anything a serious prospect cares about. The deep scan adds the findings
// that carry real, checkable consequence — accessibility barriers, trackers running with no consent
// mechanism, a site that can't be used on a phone, no way to book, no machine-readable business
// identity — each one traceable to a specific thing really present (or really absent) in the markup.
//
// THE HONESTY RULE, restated for this layer (same discipline as techFingerprint + siteAudit):
// every Finding must trace to a signature really observed in the fetched HTML. We report what was
// DETECTED. We never claim conformance, compliance, or legal safety, and we never guess. A scanner
// that cannot see something emits nothing — absence of a finding is NOT evidence of absence, and
// `ScanResult.limits` says so in words that ship with the result.
//
// Static-HTML only, by design: the fetch path (fetch-url) has raw bytes, not a rendered DOM — Deno
// edge functions can't run a browser. That bounds what is knowable, and the bound is stated rather
// than papered over. Five of WebAIM's six most common failure types (missing alt text, empty links,
// missing form labels, empty buttons, missing document language) ARE statically detectable; the
// sixth (low contrast) largely is not, and we say so instead of pretending.
//
// Runs in Deno (fetch-url) and under tsx (*.verify.ts) — keep this file type-only and import-free.

/** Which lens produced a finding. */
export type ScanCategory =
  | 'accessibility'   // barriers that stop real people using the page (WCAG-referenced)
  | 'tracking'        // pixels/session-replay and whether ANY consent mechanism is present
  | 'mobile'          // can it actually be used on a phone
  | 'conversion'      // is there a working path to contact, book, or buy
  | 'presence';       // machine-readable identity: schema.org, NAP, canonical, social cards

/** How much the finding should move a buyer. Drives ordering and the score penalty. */
export type ScanSeverity = 'high' | 'med' | 'low';

/**
 * How sure we are, stated on every finding so the operator never overstates it in a pitch.
 *  - 'detected'     the signature is unambiguously present/absent in the markup. Safe to state plainly.
 *  - 'likely'       strong static signal, but a rendered page could differ (e.g. JS injects the label).
 *  - 'needs_review' worth a human look before it is ever said to a prospect.
 */
export type ScanConfidence = 'detected' | 'likely' | 'needs_review';

/** One checkable thing observed about a page. */
export interface Finding {
  /** Stable machine code, e.g. 'a11y.img_missing_alt'. NEVER renumber — outcomes join on this. */
  code: string;
  category: ScanCategory;
  severity: ScanSeverity;
  confidence: ScanConfidence;
  /** Short owner-facing label. Plain language, no jargon, no legal claim. */
  title: string;
  /** One honest sentence: what was observed and why it costs them. */
  detail: string;
  /** How many times it occurs, when counting is meaningful (e.g. 14 images without alt). */
  count?: number;
  /** A short verbatim snippet of the offending markup — the proof, capped for safety. */
  evidence?: string;
  /** WCAG 2.2 success criterion, when the finding maps to one (e.g. '1.1.1'). Reference only. */
  wcag?: string;
}

/** What one sub-scanner returns. */
export interface ScanResult {
  findings: Finding[];
  /** Plain-language statements of what this scanner could NOT see. Ships with the result. */
  limits: string[];
}

/** The composed result across every sub-scanner. */
export interface DeepScan {
  /** Bump when detection logic changes, so a trend line never compares unlike readings. */
  version: string;
  findings: Finding[];
  limits: string[];
  /** Rolled-up counts by category, for the index/report layer. */
  counts: Record<ScanCategory, number>;
  /** Accessibility barrier instances (sum of counts), the headline number for that lens. */
  a11yInstances: number;
}

/**
 * The current detection-logic version. Bump on ANY change to what a scanner detects.
 *
 * 1.1.0 — the tag matcher became quote-aware (a `>` inside an attribute value no longer truncates a
 * tag and turns the attributes after it into phantom absences), and the accessibility lens stopped
 * counting images that are named by aria-label/aria-labelledby or plainly not rendered (tracking
 * pixels, spacers, `hidden`). The tracking lens stopped reading the Facebook JS SDK as a Meta pixel,
 * a link to a vendor's blog as that vendor's session recorder, a CSP allow-list or a preconnect hint
 * as a load, and an escaped code sample in <pre>/<code>/<textarea> as installed script; it also
 * learned a dozen more consent platforms, so pages previously reported as having no consent
 * mechanism may now correctly report none. Counts from 1.0.0 are NOT comparable with counts
 * from 1.1.0.
 */
export const SCAN_VERSION = '1.1.0';

/** Cap for an evidence snippet — enough to prove the point, small enough to store and show. */
export const EVIDENCE_MAX = 300;

/** Trim a markup snippet to a safe, single-line, capped form for `Finding.evidence`. */
export function snippet(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > EVIDENCE_MAX ? `${flat.slice(0, EVIDENCE_MAX - 1)}…` : flat;
}

/**
 * ASCII-only lowercase. Length-preserving, unlike String#toLowerCase (which can GROW a string —
 * 'İ'.toLowerCase() is two code units), so an index into the lowered copy is always a valid index
 * into the original. That property is what makes the linear scanners below safe.
 */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * Remove HTML comments, linearly.
 *
 * NOT a regex, on purpose. `/<!--[\s\S]*?-->/g` re-scans the entire tail of the document from every
 * `<!--` that never closes, which is quadratic: a malformed page fetched from the wild — and a page
 * fetched from the wild can be anything — stalled this scan for 15+ seconds on 400KB of input. An
 * edge function that times out returns nothing at all.
 *
 * An unterminated comment swallows the rest of the document, which is exactly what a browser does.
 * That is also the honest direction: markup a browser treats as a comment never loads, so it must
 * never be reported as something the page loads.
 */
export function stripComments(html: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const s = html.indexOf('<!--', i);
    if (s < 0) return out + html.slice(i);
    out += `${html.slice(i, s)} `;
    let end = html.indexOf('-->', s + 4);
    let width = 3;
    const bang = html.indexOf('--!>', s + 4); // the spec's other, rarer terminator
    if (bang >= 0 && (end < 0 || bang < end)) { end = bang; width = 4; }
    if (end < 0) return out; // unterminated: everything after is inside the comment
    i = end + width;
  }
}

/**
 * Remove whole `<tag …>…</tag>` elements, body included. Linear for the same reason as
 * stripComments, case-insensitive, tolerant of `</tag >`, and — unlike the regex it replaces —
 * it will not treat `<scripting>` as a `<script>`. An element that never closes swallows the rest
 * of the document, as a browser would.
 */
export function stripElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) out = stripOneElement(out, tag);
  return out;
}

function stripOneElement(html: string, tag: string): string {
  const lower = asciiLower(html);
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = '';
  let i = 0;
  for (;;) {
    const s = lower.indexOf(open, i);
    if (s < 0) return out + html.slice(i);
    const next = lower.charCodeAt(s + open.length);
    // A real tag ends the name here: whitespace, '>' or '/'. Anything else is a different tag.
    if (!(Number.isNaN(next) || next === 62 || next === 47 || next <= 32)) {
      out += html.slice(i, s + open.length);
      i = s + open.length;
      continue;
    }
    out += `${html.slice(i, s)} `;
    const end = lower.indexOf(close, s + open.length);
    if (end < 0) return out; // unterminated: the rest of the document is inside the element
    const gt = html.indexOf('>', end + close.length);
    if (gt < 0) return out;
    i = gt + 1;
  }
}

/**
 * Strip the parts of an HTML document that must not be scanned as content:
 * script/style bodies, comments, and noscript. Sub-scanners that look for markup patterns
 * (labels, alt text, headings) run against this so a code sample inside a <script> string or a
 * commented-out block can never produce a phantom finding.
 */
export function stripNonContent(html: string): string {
  return stripComments(stripElements(html, ['script', 'style', 'noscript']));
}

/**
 * The attribute-list portion of an opening tag, QUOTE-AWARE.
 *
 * Why this is not simply `[^>]*`: `>` is legal, unescaped, inside a quoted attribute value, and real
 * sites ship it constantly — `onchange="if(v.length>2)go()"`, `data-target="ul > li"`,
 * `alt="Small > Large"`. A matcher that stops at the first `>` truncates the tag and then reports the
 * attributes it never reached as ABSENT: an image with perfect alt text gets accused of having none.
 * That false accusation is the single worst thing this codebase can do, so the tag matcher has to
 * understand quoting.
 *
 * The second branch is a deliberate fallback. On markup with an UNBALANCED quote (`<img src="a.jpg>`)
 * the quote-aware branch cannot reach the closing `>` at all, and dropping the tag entirely would
 * silently blind every scanner on sloppy pages. Regex alternation is ordered, so the strict branch is
 * tried first and the permissive old behaviour only applies where the strict one cannot match.
 * Neither branch can cross a `>` that is genuinely outside quotes, and neither is ambiguous with
 * itself, so matching stays linear — no backtracking blow-up.
 */
const TAG_ATTRS = `(?:(?:"[^"]*"|'[^']*'|[^>"'])*|[^>]*)`;

/** Every `<tag ...>` opening tag of a given name, with its raw attribute string. */
export function openTags(html: string, tag: string): { raw: string; attrs: string }[] {
  const re = new RegExp(`<${tag}\\b(${TAG_ATTRS})>`, 'gi');
  const out: { raw: string; attrs: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ raw: m[0], attrs: m[1] ?? '' });
  return out;
}

/** Read one attribute's value out of a raw attribute string. Null when absent or valueless. */
export function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

/** True when the attribute is present at all (even valueless, e.g. `<input required>`). */
export function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, 'i').test(attrs);
}

/** Inner text of the FIRST occurrence of an element, tags stripped. Null when the element is absent. */
export function innerText(html: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b${TAG_ATTRS}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html);
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Every element of a tag with its inner HTML — for "is this link/button empty?" checks.
 *
 * Written as an open-scan plus a forward close-scan rather than one `<a…>([\s\S]*?)</a>` regex,
 * because that regex is QUADRATIC on the input we actually get. An unclosed `<a>` makes the engine
 * scan to end-of-document before giving up, and then do it again for the next one; a 1.3MB page of
 * never-closed anchors — routine broken-CMS output — took thirteen seconds and stalled the function.
 * Here each closing tag is found by a cursor that only ever moves forward, and the first open tag
 * with no closing tag anywhere after it ends the scan (nothing later can have one either), so the
 * whole pass is linear. Results are identical to the old regex, including which `</tag>` pairs with
 * which `<tag>`: the nearest following one, and no overlapping matches.
 */
export function elements(html: string, tag: string): { attrs: string; inner: string; raw: string }[] {
  const openRe = new RegExp(`<${tag}\\b(${TAG_ATTRS})>`, 'gi');
  const closeRe = new RegExp(`<\\/${tag}>`, 'gi');
  const out: { attrs: string; inner: string; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) {
    const innerStart = openRe.lastIndex;
    if (closeRe.lastIndex < innerStart) closeRe.lastIndex = innerStart;
    const c = closeRe.exec(html);
    if (!c) break; // no closing tag left in the document — no later open tag can have one either
    out.push({ attrs: m[1] ?? '', inner: html.slice(innerStart, c.index), raw: html.slice(m.index, closeRe.lastIndex) });
    openRe.lastIndex = closeRe.lastIndex; // matches never overlap, exactly as the old regex behaved
  }
  return out;
}

/** An element's accessible name from inner text or the usual attribute fallbacks. */
export function accessibleName(attrs: string, inner: string): string {
  const label = attr(attrs, 'aria-label') ?? attr(attrs, 'title') ?? '';
  if (label.trim()) return label.trim();
  // An <img alt="…"> or an icon-font span inside counts as the name.
  const imgAlt = openTags(inner, 'img').map((t) => attr(t.attrs, 'alt') ?? '').join(' ').trim();
  if (imgAlt) return imgAlt;
  if (attr(attrs, 'aria-labelledby')) return '(labelledby)'; // referenced elsewhere — not empty
  return inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
