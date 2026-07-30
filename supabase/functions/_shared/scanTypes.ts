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

/** The current detection-logic version. Bump on ANY change to what a scanner detects. */
export const SCAN_VERSION = '1.0.0';

/** Cap for an evidence snippet — enough to prove the point, small enough to store and show. */
export const EVIDENCE_MAX = 300;

/** Trim a markup snippet to a safe, single-line, capped form for `Finding.evidence`. */
export function snippet(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > EVIDENCE_MAX ? `${flat.slice(0, EVIDENCE_MAX - 1)}…` : flat;
}

/**
 * Strip the parts of an HTML document that must not be scanned as content:
 * script/style bodies, comments, and noscript. Sub-scanners that look for markup patterns
 * (labels, alt text, headings) run against this so a code sample inside a <script> string or a
 * commented-out block can never produce a phantom finding.
 */
export function stripNonContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Every `<tag ...>` opening tag of a given name, with its raw attribute string. */
export function openTags(html: string, tag: string): { raw: string; attrs: string }[] {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
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
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html);
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Every element of a tag with its inner HTML — for "is this link/button empty?" checks. */
export function elements(html: string, tag: string): { attrs: string; inner: string; raw: string }[] {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out: { attrs: string; inner: string; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ attrs: m[1] ?? '', inner: m[2] ?? '', raw: m[0] });
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
