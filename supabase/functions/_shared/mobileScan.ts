// supabase/functions/_shared/mobileScan.ts
// The mobile lens of the deep scan: can this page actually be used on a phone, read from the raw
// HTML the prospect's own server sent us. Pure + deterministic — the only import is the contract.
//
// Why this exists: most of a small business's traffic arrives on a phone, and the owner almost
// always looks at their own site on a desktop. "Your site isn't mobile friendly" is an opinion they
// have heard before and ignored. "There is no viewport tag in your HTML, so a phone lays the page
// out at about 980 pixels wide and then shrinks the whole thing to fit" is one line they can check
// in their own view-source in thirty seconds, and it is either there or it is not. This module only
// ever produces the second kind of statement.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//  - It does not measure the rendered layout. Whether the page actually reflows at 375px, whether a
//    nav overflows, whether anything overlaps — those are properties of a rendered box tree, and a
//    Deno edge function has bytes, not a browser. We do not simulate it and we do not guess it.
//  - It does not measure tap-target size. A 24px button and a 48px button are the same markup here.
//    Every "touch targets are too small" claim from a static scan is invented; we make none.
//  - It does not read stylesheets. The width and font-size declarations we can see are the inline
//    ones, which on a modern site are the minority. A responsive external stylesheet — the normal
//    place for a media query — may already fix everything flagged here, which is exactly why the
//    layout findings carry 'likely' and never 'detected', and why `limits` says it out loud.
//  - It does not judge a page as "mobile friendly" or "not mobile friendly", and it produces no
//    score. Google retired its own mobile-friendly grade; we are not going to invent a replacement
//    from seven regexes. These are observations about specific markup, not a verdict about a site.
//  - It NEVER says a business is non-compliant, at legal risk, or failing a standard. mobile.zoom_disabled
//    references WCAG 1.4.4 in its `wcag` field because that is the criterion the barrier maps to —
//    a pointer for a human, not a ruling. No prose in this file claims conformance either way.
//
// THE HONESTY RULE for this file specifically: a finding fires only when the signature is really in
// the bytes. Where the answer is genuinely unknowable we emit NOTHING and add a sentence to `limits`
// instead — see the viewport branch below, where a viewport tag that appears only inside a script
// (DIY builders manage <head> in JavaScript all the time) buys silence rather than a false "there is
// no viewport tag" sent to a business whose page is fine. Suppression is always the safe direction:
// a missed finding costs us a talking point, a false finding costs us the prospect.
//
// Runs in Deno (fetch-url) and under tsx (mobileScan.verify.ts) — the .ts extension on the import is
// required by Deno and harmless under tsx.

import {
  type Finding,
  type ScanResult,
  attr,
  openTags,
  snippet,
  stripNonContent,
} from './scanTypes.ts';

/** Every code this scanner can emit. Exported so the report layer can enumerate without string-hunting. */
export const MOBILE_CODES = [
  'mobile.no_viewport',
  'mobile.viewport_not_device',
  'mobile.zoom_disabled',
  'mobile.fixed_width_layout',
  'mobile.tiny_text',
  'mobile.no_click_to_call',
  'mobile.legacy_table_layout',
] as const;

// ─── Thresholds, named so the prose and the code can never drift apart ───────────────────────────
// 900px: comfortably wider than any phone in portrait and wider than most tablets too, so a layout
// element pinned at or above it cannot fit a phone screen without scaling or sideways scrolling.
// Deliberately not 768 or 800 — a 768px container is a tablet breakpoint, not a 1990s fixed layout,
// and flagging one would be the kind of technically-true-but-useless noise that gets a report binned.
const FIXED_WIDTH_MIN_PX = 900;
// Below 12px is where body copy stops being comfortably readable at arm's length on a phone. 12px
// itself is not flagged: it is small but it is a choice a designer really makes.
const TINY_TEXT_MAX_PX = 12;
// WCAG 1.4.4 asks for 200% resize. A maximum-scale under 1.5 is a hard cap well short of that.
const MIN_ZOOM_SCALE = 1.5;

// Layout elements: the ones whose width decides how the PAGE is shaped. Deliberately excludes <img>,
// <video>, <iframe> and <canvas> — a 1200px-wide image is normal markup that a one-line CSS rule
// (`img { max-width: 100% }`) makes responsive, and counting it would fire this finding on nearly
// every page on the internet.
const LAYOUT_TAGS = ['table', 'div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'body'];
// The legacy `width` ATTRIBUTE only means a fixed layout on these two. On <img> or <td> it is
// routine, and on <input>/<col> it isn't even pixels.
const WIDTH_ATTR_TAGS = ['table', 'div'];

// These keep the owner-facing prose grammatical at a count of one. A finding that reads "1 element
// declare a fixed width" looks automated, and an automated-looking true statement gets deleted just
// as fast as a false one.
const s = (n: number) => (n === 1 ? '' : 's');
const v = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Read an attribute that is REALLY on the element, not a `data-`/vendor look-alike.
 *
 * Same reason a11yScan.ts carries its own copy: attr() anchors on `\b`, so asking it for `width` on
 * `<div data-width="1200">` matches inside `data-width` and hands back 1200. For this file that
 * would invent a fixed-width finding out of a layout library's bookkeeping attribute — precisely the
 * false positive that must never reach a real business. So isolate a bare `name="value"` pair first
 * (one not glued to a preceding word character or hyphen), then hand that slice to attr() so the
 * quoting rules stay in exactly one place.
 */
function bareAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|[\\s"'/])(${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))`, 'i');
  const m = re.exec(attrs);
  return m ? attr(m[1], name) : null;
}

/**
 * Split a viewport `content` string into its key/value pairs, lowercased.
 * `width=device-width, initial-scale=1` → `{ width: 'device-width', 'initial-scale': '1' }`.
 * Commas and semicolons are both accepted as separators because both appear in the wild and both
 * work in every shipping browser.
 */
function viewportProps(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of content.split(/[,;]/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key) out[key] = part.slice(eq + 1).trim().toLowerCase();
  }
  return out;
}

/** A viewport property parsed as a number, or NaN when it is absent or not numeric. */
function numProp(props: Record<string, string>, key: string): number {
  const raw = props[key];
  if (raw === undefined) return NaN;
  const m = /^-?\d+(?:\.\d+)?/.exec(raw);
  return m ? parseFloat(m[0]) : NaN;
}

/**
 * Does this viewport actually hand the layout the width of the device?
 *
 * `width=device-width` is the plain answer. The second clause is the important one: a viewport of
 * just `initial-scale=1` with no width at all DOES render at device width — the browser derives the
 * layout width from the scale factor, and has since the original iPhone. Firing "this page renders
 * at desktop width" on such a page would be a flatly false statement about a site that works fine on
 * a phone, so it is excluded here rather than counted as a technicality.
 */
function adaptsToDevice(props: Record<string, string>): boolean {
  const width = props['width'];
  if (width === 'device-width') return true;
  if (width !== undefined) return false; // an explicit width=1024 is an explicit desktop layout
  return numProp(props, 'initial-scale') === 1;
}

/** True when the viewport switches zoom off outright or caps it short of a useful magnification. */
function zoomIsBlocked(props: Record<string, string>): boolean {
  const scalable = props['user-scalable'];
  // 'no', '0' and 'false' are the three spellings browsers treat as off. 'yes'/'1' must not fire.
  if (scalable === 'no' || scalable === '0' || scalable === 'false') return true;
  const max = numProp(props, 'maximum-scale');
  return Number.isFinite(max) && max < MIN_ZOOM_SCALE;
}

/** Pixel widths declared in an inline style. `max-width` is excluded — see below. */
function fixedPxWidths(style: string): number[] {
  // `max-width: 1200px` is the RESPONSIVE pattern — a container that caps its growth but still
  // shrinks below the cap — and counting it would fire this finding on every well-built page there
  // is. The leading `(?:^|[;\s])` is what refuses it: inside `max-width` the word `width` is
  // preceded by a hyphen, so no match can start there. `min-width` IS counted, because a minimum is
  // a floor the layout is not allowed to go below on a narrow screen.
  // Built fresh on each call: a module-level /g regex carries lastIndex between scans, which would
  // make this scanner's output depend on what it was handed previously.
  const re = /(?:^|[;\s])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)\s*px/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(style))) out.push(parseFloat(m[1]));
  return out;
}

/** Font sizes declared in px in an inline style. Other units are not converted — see `limits`. */
function pxFontSizes(style: string): number[] {
  const re = /(?:^|[;\s])font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(style))) out.push(parseFloat(m[1]));
  return out;
}

/**
 * A legacy `width="…"` attribute read as pixels, or null when it is not a fixed pixel count.
 * `width="100%"` is fluid markup and must never be counted — that is the single most likely false
 * positive in the fixed-width check, because percentage widths are all over old-but-fluid pages.
 */
function pxAttrValue(raw: string | null): number | null {
  if (raw === null) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(raw);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Every inline `style="…"` attribute in the markup.
 *
 * openTags() needs a tag name and tiny text can sit on any element at all, so this walks the style
 * attributes themselves — a declaration-level read, which is exactly what the finding's `count`
 * means. The leading `(?:^|[\s"'/])` keeps `data-style="…"` and friends out. This only ever runs
 * against stripped content, so a style attribute inside a JS template string or a commented-out
 * block cannot reach it.
 */
function inlineStyles(clean: string): { raw: string; style: string }[] {
  const re = /(?:^|[\s"'/])style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const out: { raw: string; style: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) out.push({ raw: m[0].trim(), style: m[1] ?? m[2] ?? '' });
  return out;
}

/**
 * Find a `<table>` opened inside a `<td>` that is itself inside a `<table>` — the 1990s layout
 * grid, which has no way to reflow because the cell geometry IS the layout.
 *
 * Done with a small tag stack rather than a regex because the shape being looked for is nesting, and
 * the lazy element regexes in scanTypes.ts stop at the first inner `</td>`/`</table>` — they cannot
 * tell an outer cell from an inner one. Closing a tag pops back to its own opening, which also
 * closes any children left unclosed (omitted `</td>` is legal HTML and extremely common in exactly
 * the vintage pages this looks for), so one sloppy table cannot leak state into the next one.
 */
function findNestedTable(clean: string): string | null {
  const re = /<(\/?)(table|td|th)\b[^>]*>/gi;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const name = m[2].toLowerCase();
    if (m[1] === '/') {
      const at = stack.lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    if (name === 'table') {
      const cell = stack.lastIndexOf('td');
      const outer = stack.indexOf('table');
      // Both halves required: an enclosing table AND a cell of it. A bare `<td>` fragment with no
      // table around it is malformed markup, not a nested layout, and must not fire.
      if (cell >= 0 && outer >= 0 && outer < cell) {
        return snippet(clean.slice(Math.max(0, m.index - 60), m.index + m[0].length));
      }
    }
    stack.push(name);
  }
  return null;
}

// ─── Phone numbers ───────────────────────────────────────────────────────────────────────────────
// Conservative North American patterns, shaped by what must NOT match far more than by what must.
// Both enforce the NANP rule that an area code and an exchange code start 2-9, which alone throws
// out most numeric prose ("123 456 7890" cannot be a phone number). Neither matches a bare run of
// ten digits, because that is as likely to be an order number as a phone number.
// No /g flag: these are module constants and a sticky lastIndex would make the scan non-deterministic.

// Parenthesised area code is unmistakable, so spaces are allowed as separators here.
const PHONE_PAREN = /(?<!\d)\(\s*[2-9]\d{2}\s*\)[\s.\-]{0,2}[2-9]\d{2}[\s.\-]{0,2}\d{4}(?!\d)/;
// Unparenthesised, the separator must be a hyphen or a dot AND the same one both times — the
// backreference is what refuses "300 500 1000" and "Suite 200-300, Building 4000". A bare space
// separator is not accepted at all in this form: it is the shape most easily produced by ordinary
// numeric prose, and missing a real number written that way costs us only silence.
const PHONE_PLAIN = /(?<![\d.\-])(?:\+?1[\s.\-])?[2-9]\d{2}([.\-])[2-9]\d{2}\1\d{4}(?!\d)/;

/** The first thing in the page's visible text that reads as a phone number, with its context. */
function findPhone(text: string): { number: string; context: string } | null {
  const hits = [PHONE_PAREN.exec(text), PHONE_PLAIN.exec(text)].filter((m): m is RegExpExecArray => m !== null);
  if (!hits.length) return null;
  // Earliest in the text wins, so the evidence is stable regardless of which pattern matched.
  const best = hits.reduce((a, b) => (b.index < a.index ? b : a));
  return {
    number: best[0],
    context: snippet(text.slice(Math.max(0, best.index - 40), best.index + best[0].length + 40)),
  };
}

// A viewport declaration ANYWHERE in the raw bytes, including script strings and comments. Used only
// to BUY SILENCE, never to raise a finding — see observe().
const VIEWPORT_ANYWHERE = /name\s*=\s*["']?\s*viewport/i;
// Any tel:/callto:/sms: link anywhere in the raw bytes. Also suppression-only, and deliberately
// generous: a builder that ships its header as a JS config blob still renders a tappable number, and
// telling that owner their number is not tappable would be a false statement about their own page.
// `[=:]` so the JSON form a builder emits (`"href":"tel:+15551234567"`) counts as much as the HTML
// one — same reasoning as trackingScan.ts's privacy-link check. It stays anchored on an href/url/link
// KEY rather than matching a bare `tel:` anywhere, because "Tel: 555-867-5309" is ordinary prose and
// treating that as a link would silence the finding on exactly the pages that have it.
const TEL_LINK = /(?:href|url|link)\s*["']?\s*[=:]\s*["']?\s*(?:tel|callto|sms):/i;

/** What was really observed, as data. Same input always yields the same observations. */
export interface MobileFacts {
  /** The first viewport meta's content string verbatim, or null when there is no viewport meta. */
  viewport: string | null;
  /** True when that viewport hands the layout the device's own width. False when there is none. */
  viewportAdapts: boolean;
  /** True when that viewport switches off or hard-caps pinch zoom. */
  zoomDisabled: boolean;
  /** True when SOME tel:/callto: link exists anywhere in the raw markup. */
  clickToCall: boolean;
  /** Fixed pixel width declarations of FIXED_WIDTH_MIN_PX or more on layout elements. */
  fixedWidthDeclarations: number;
  /** True when a cell of one table was found containing another table. */
  nestedTableLayout: boolean;
}

interface Observations {
  isDocument: boolean;
  hasHead: boolean;
  /** Real viewport metas in the rendered markup, in document order. */
  viewports: { raw: string; content: string }[];
  /** A viewport declaration seen ONLY off-stage (script/comment) — unknowable, never a finding. */
  viewportOffstage: boolean;
  props: Record<string, string>;
  fixed: { raw: string; px: number }[];
  tiny: { raw: string; px: number }[];
  phone: { number: string; context: string } | null;
  telLink: boolean;
  nestedTable: string | null;
}

function observe(raw: string): Observations {
  // Everything that reads MARKUP reads `clean`: script bodies, style bodies, <noscript> and comments
  // are gone, so a `<table width="1200">` in a JS template literal or a commented-out block can never
  // produce a finding about markup the browser never renders.
  const clean = stripNonContent(raw);

  const isDocument = /<(?:html|head|body)\b/i.test(clean);
  const hasHead = /<(?:html|head)\b/i.test(clean);

  const viewports = openTags(clean, 'meta')
    .filter((t) => (bareAttr(t.attrs, 'name') ?? '').trim().toLowerCase() === 'viewport')
    .map((t) => ({ raw: t.raw, content: (bareAttr(t.attrs, 'content') ?? '').trim() }));

  const fixed: { raw: string; px: number }[] = [];
  for (const tag of WIDTH_ATTR_TAGS) {
    for (const t of openTags(clean, tag)) {
      const px = pxAttrValue(bareAttr(t.attrs, 'width'));
      if (px !== null && px >= FIXED_WIDTH_MIN_PX) fixed.push({ raw: t.raw, px });
    }
  }
  for (const tag of LAYOUT_TAGS) {
    for (const t of openTags(clean, tag)) {
      for (const px of fixedPxWidths(bareAttr(t.attrs, 'style') ?? '')) {
        if (px >= FIXED_WIDTH_MIN_PX) fixed.push({ raw: t.raw, px });
      }
    }
  }

  const tiny: { raw: string; px: number }[] = [];
  for (const st of inlineStyles(clean)) {
    for (const px of pxFontSizes(st.style)) {
      if (px < TINY_TEXT_MAX_PX) tiny.push({ raw: st.raw, px });
    }
  }

  // Visible text only. A number sitting in an alt/title attribute or a meta tag is not something a
  // visitor reads off the page, so tags go before the phone patterns run.
  const text = clean
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ');

  return {
    isDocument,
    hasHead,
    viewports,
    viewportOffstage: viewports.length === 0 && VIEWPORT_ANYWHERE.test(raw),
    props: viewportProps(viewports[0]?.content ?? ''),
    fixed,
    tiny,
    phone: findPhone(text),
    telLink: TEL_LINK.test(raw),
    nestedTable: findNestedTable(clean),
  };
}

/** The storable facts behind the findings, for a caller that wants to group or trend without re-parsing. */
export function mobileFacts(html: string): MobileFacts {
  const o = observe(typeof html === 'string' ? html : '');
  return {
    viewport: o.viewports.length ? o.viewports[0].content : null,
    viewportAdapts: o.viewports.length > 0 && adaptsToDevice(o.props),
    zoomDisabled: o.viewports.length > 0 && zoomIsBlocked(o.props),
    clickToCall: o.telLink,
    fixedWidthDeclarations: o.fixed.length,
    nestedTableLayout: o.nestedTable !== null,
  };
}

// The standing statement of what a static read of one page cannot see. It ships with every result,
// including an empty one, so nobody downstream mistakes a quiet scan for a page that works on a phone.
const LIMITS: string[] = [
  'The actual rendered layout cannot be measured from HTML. Whether the page really reflows at phone width, whether anything overflows or overlaps, and whether tap targets are big enough to hit with a thumb all need the page loaded in a real browser at a real viewport size, and none of them were measured here.',
  'A responsive CSS file this scan cannot read may already fix issues that look fixed-width in the markup. External stylesheets and their media queries are not fetched, so a page flagged for a fixed width can still reflow correctly once its CSS loads.',
  'Only inline style attributes and legacy width attributes are read. Widths and font sizes set in a stylesheet — the normal place for them on a modern site — are invisible here, so a page with real problems can look clean in this scan.',
  'Anything JavaScript adds after load is not in the HTML as delivered: a viewport tag written by a site builder\'s head manager, a phone link rendered by a component, or an entire layout mounted into an empty div would all be missed.',
  'Phone numbers are matched with a conservative North American pattern. A number in another country\'s format, written unusually, or drawn inside an image is not recognised, and no finding is raised about what was not recognised.',
  'Nothing here establishes that a page is or is not usable on a phone. These are observations about specific markup, and the absence of a finding only means this scan did not detect one.',
];

/**
 * Screen a page's HTML for mobile-usability signals.
 *
 * Empty, tiny or non-HTML input yields zero findings by construction: every check keys off a tag or
 * a text pattern that simply is not there. That is the honest answer — we looked and saw nothing to
 * report, which is not the same as "the page is fine", and `limits` ships that sentence alongside.
 */
export function scanMobile(html: string): ScanResult {
  const raw = typeof html === 'string' ? html : '';
  const o = observe(raw);

  const findings: Finding[] = [];
  const limits: string[] = [];

  // ── Viewport ───────────────────────────────────────────────────────────────────────────────────
  // The whole viewport branch is gated on there being a <html>/<head> to look inside. A body-only
  // fragment legitimately has no head, and "this fragment has no viewport tag" is a statement about
  // our input, not about their site.
  if (!o.hasHead) {
    if (o.isDocument) {
      limits.push(
        'The markup supplied contained no <html> or <head> element, so the viewport declaration — the tag that decides how the page is laid out on a phone — could not be checked at all.',
      );
    }
  } else if (o.viewports.length === 0 && o.viewportOffstage) {
    // A viewport declaration exists in the bytes but not in the rendered markup: it is inside a
    // script, or inside a comment, and from here those two look identical. One means the page is
    // fine, the other means it is not, and we cannot tell which — so we claim NOTHING and say why.
    limits.push(
      'A viewport declaration appears in this page\'s scripts or comments but not in its rendered markup. That is either a site builder writing the tag at runtime or a tag someone commented out, and the two are indistinguishable from the HTML source, so no finding was raised either way.',
    );
  } else if (o.viewports.length === 0) {
    findings.push({
      code: 'mobile.no_viewport',
      category: 'mobile',
      severity: 'high',
      confidence: 'detected',
      title: 'No mobile viewport tag in the page source',
      detail:
        'The page contains no <meta name="viewport"> element. Without it a phone browser lays the ' +
        'page out at roughly 980 pixels wide and then shrinks the whole thing down to fit the ' +
        'screen, so the text arrives too small to read and the visitor has to pinch and drag to get ' +
        'anywhere. It is the one line of markup every responsive layout starts from.',
    });
  } else {
    const first = o.viewports[0];

    if (o.viewports.length > 1) {
      // Browsers merge repeated viewport declarations in source order and the rules for which wins
      // are neither simple nor uniform. Rather than pick a winner and be confidently wrong, we
      // evaluate the first and disclose that we did.
      limits.push(
        `This page carries ${o.viewports.length} separate viewport declarations. Browsers combine repeated declarations in ways that differ between them, so only the first was evaluated and the others were left alone.`,
      );
    }

    if (!adaptsToDevice(o.props)) {
      findings.push({
        code: 'mobile.viewport_not_device',
        category: 'mobile',
        severity: 'high',
        confidence: 'detected',
        title: 'The viewport tag does not use the device width',
        detail:
          'A <meta name="viewport"> is present but its content ' +
          (first.content ? `(${snippet(first.content)}) ` : '(which is empty) ') +
          'does not set width=device-width, and does not set initial-scale=1 for the browser to ' +
          'work the width out for itself. The layout is sized to a fixed number rather than to the ' +
          'phone holding it, which is what produces sideways scrolling and a shrunken page.',
        evidence: snippet(first.raw),
      });
    }

    if (zoomIsBlocked(o.props)) {
      findings.push({
        code: 'mobile.zoom_disabled',
        category: 'mobile',
        severity: 'med',
        confidence: 'detected',
        title: 'The viewport tag switches off pinch-to-zoom',
        detail:
          `The viewport content (${snippet(first.content)}) stops a visitor enlarging the page — ` +
          'either user-scalable=no, or a maximum-scale that caps zoom short of useful ' +
          'magnification. Someone with low vision, or anyone reading small print in bright sun, ' +
          'cannot pinch to make the text bigger. Safari on iOS has ignored this setting for years, ' +
          'but Chrome on Android still honours it unless the visitor has turned on forced zoom, so ' +
          'it really does block people.',
        evidence: snippet(first.raw),
        // Reference only, for a human to follow up. It is a pointer to the criterion this barrier
        // maps to, not a statement that anything passes or fails it.
        wcag: '1.4.4',
      });
    }
  }

  // ── Fixed pixel widths on layout elements ──────────────────────────────────────────────────────
  // 'likely', never 'detected': the declaration is unambiguously in the markup, but whether it
  // survives to the rendered page depends on a stylesheet we did not fetch. The finding states what
  // is declared; the confidence states that we did not watch it render.
  if (o.fixed.length) {
    const widest = o.fixed.reduce((a, b) => (b.px > a.px ? b : a));
    findings.push({
      code: 'mobile.fixed_width_layout',
      category: 'mobile',
      severity: 'med',
      confidence: 'likely',
      title: `${o.fixed.length} fixed pixel width${s(o.fixed.length)} of ${FIXED_WIDTH_MIN_PX}px or more in the layout`,
      detail:
        `${o.fixed.length} layout element${s(o.fixed.length)} ${v(o.fixed.length, 'declares', 'declare')} a ` +
        `fixed width in pixels (the widest is ${widest.px}px), either as a width attribute or in an ` +
        'inline style. A container wider than the screen cannot reflow, so a phone visitor gets a ' +
        'horizontal scrollbar or a page zoomed out to fit. Percentage and max-width declarations ' +
        'were not counted — those are the responsive ones. A stylesheet this scan cannot read may ' +
        'override these, which is why this is reported as likely rather than confirmed.',
      count: o.fixed.length,
      evidence: snippet(o.fixed[0].raw),
    });
  }

  // ── Tiny inline text ───────────────────────────────────────────────────────────────────────────
  if (o.tiny.length) {
    const smallest = o.tiny.reduce((a, b) => (b.px < a.px ? b : a));
    findings.push({
      code: 'mobile.tiny_text',
      category: 'mobile',
      severity: 'low',
      confidence: 'likely',
      title: `${o.tiny.length} inline font size${s(o.tiny.length)} below ${TINY_TEXT_MAX_PX}px`,
      detail:
        `Inline styles set a font size below ${TINY_TEXT_MAX_PX}px in ${o.tiny.length} ` +
        `place${s(o.tiny.length)} (the smallest is ${smallest.px}px). At arm's length on a phone ` +
        'that is at the edge of readable, and a visitor who has to zoom in to read a line of body ' +
        'copy usually leaves instead. Only inline styles were counted, so sizes set in a stylesheet ' +
        'are not in this number.',
      count: o.tiny.length,
      evidence: snippet(smallest.raw),
    });
  }

  // ── A phone number shown but not tappable ──────────────────────────────────────────────────────
  // The tel: check runs against the RAW bytes on purpose. Finding a tel: link anywhere — even inside
  // a script's nav config — SUPPRESSES this finding, and suppression is the safe direction: telling
  // an owner their number is not tappable when it is would be a false statement about their own page.
  if (o.phone && !o.telLink) {
    findings.push({
      code: 'mobile.no_click_to_call',
      category: 'mobile',
      severity: 'med',
      confidence: 'likely',
      title: 'A phone number is shown on the page but is not tappable',
      detail:
        `The page text shows what reads as a phone number (${o.phone.number}) but no link anywhere ` +
        'in the HTML uses tel:. On a phone the visitor has to memorise or hand-copy the digits ' +
        'instead of tapping once to dial, and that is exactly the moment a service business loses ' +
        'the call. A number added by JavaScript, or one drawn inside an image, would not be visible ' +
        'to this scan.',
      evidence: o.phone.context,
    });
  }

  // ── Nested table layout ────────────────────────────────────────────────────────────────────────
  if (o.nestedTable) {
    findings.push({
      code: 'mobile.legacy_table_layout',
      category: 'mobile',
      severity: 'med',
      confidence: 'likely',
      title: 'The page is laid out with tables nested inside tables',
      detail:
        'A <table> contains a cell that itself contains another <table>. Nested table layouts ' +
        'predate responsive design and have no way to reflow — the columns hold their shape at ' +
        'every screen size, so a phone gets a shrunken copy of the desktop page. It is also a ' +
        'reliable sign the page has not been rebuilt in a very long time.',
      evidence: o.nestedTable,
    });
  }

  limits.push(...LIMITS);
  return { findings, limits };
}
