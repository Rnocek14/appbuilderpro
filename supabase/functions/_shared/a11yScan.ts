// supabase/functions/_shared/a11yScan.ts
// The accessibility lens of the deep scan: a static WCAG 2.2 screen over the raw HTML a prospect's
// own server sent us. Pure + deterministic — the only import is the shared contract.
//
// Why this exists: "your site has accessibility problems" is worthless in a pitch and dangerous in an
// email. "Fourteen images on your home page carry no alt text, so a screen reader announces a
// filename instead of your product" is a specific, checkable, fixable statement the owner can verify
// in thirty seconds by viewing source. This module only ever produces the second kind. Five of
// WebAIM's six most common failure types (missing alt, empty links, missing form labels, empty
// buttons, missing document language) are statically detectable, and those are exactly the ones here.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//  - It does not compute colour contrast. That is the single most common real-world failure type and
//    it needs computed styles over a rendered box tree. We cannot see it, so we say so in `limits`
//    rather than pretending a heuristic is a measurement.
//  - It does not test keyboard operation, focus order, focus visibility, or what a screen reader
//    actually announces. Those are behaviours, not markup.
//  - It does not see anything JavaScript injects after load. A React app that ships an empty <div id="root">
//    will produce almost no findings here, and that silence means "we saw nothing", not "it is fine".
//  - It does not score, grade, or rank. It reports instances.
//  - It NEVER says a business is non-compliant, at legal risk, or "not ADA compliant". No automated
//    scan can establish conformance in either direction, and claiming otherwise to a stranger is both
//    false and the fastest way to be rightly ignored. Every title and detail here is observational:
//    what was counted, in what markup, and what it costs a real user.
//
// THE HONESTY RULE for this file specifically: a finding fires only when the signature is really in
// the bytes. Where a framework could plausibly wire the missing piece up at runtime (aria-label set
// in JS, a label bound by a component library) the finding carries 'likely', not 'detected'. Where we
// could not look at all, we emit NOTHING and add a sentence to `limits`. Absence of findings is never
// evidence of conformance, and `limits` ships that sentence alongside the result so it cannot be
// dropped on the way to a human.
//
// Runs in Deno (fetch-url) and under tsx (a11yScan.verify.ts) — the .ts extension on the import is
// required by Deno and harmless under tsx.

import {
  type Finding,
  type ScanResult,
  accessibleName,
  attr,
  elements,
  hasAttr,
  openTags,
  snippet,
  stripNonContent,
} from './scanTypes.ts';

/** Every code this scanner can emit. Exported so the report layer can enumerate without string-hunting. */
export const A11Y_CODES = [
  'a11y.img_missing_alt',
  'a11y.input_missing_label',
  'a11y.missing_lang',
  'a11y.missing_title',
  'a11y.empty_link',
  'a11y.empty_button',
  'a11y.heading_skip',
  'a11y.positive_tabindex',
  'a11y.duplicate_id',
  'a11y.iframe_missing_title',
  'a11y.no_skip_link',
] as const;

/** `<input type="…">` values that are not labellable controls — a submit button names itself. */
const UNLABELLABLE_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset']);

/**
 * Read an attribute that is REALLY on the element, not a `data-`/vendor look-alike.
 *
 * Why this exists rather than calling attr() directly: attr() anchors on `\b`, so asking it for `id`
 * on `<div data-id="tracking-42" id="hero">` matches inside `data-id` first and hands back
 * "tracking-42". For `id` and `tabindex` that is not a cosmetic difference — it invents duplicate-id
 * and positive-tabindex findings out of analytics attributes, which is exactly the false positive
 * that must never reach a real business. So: isolate a bare `name="value"` pair first (one not glued
 * to a preceding word character or hyphen), then hand that slice to attr() so the quoting rules stay
 * in exactly one place.
 */
function bareAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|[\\s"'/])(${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))`, 'i');
  const m = re.exec(attrs);
  return m ? attr(m[1], name) : null;
}

/** Elements hidden from assistive tech are not barriers to it — never count them. */
function ariaHidden(attrs: string): boolean {
  return (bareAttr(attrs, 'aria-hidden') ?? '').toLowerCase() === 'true';
}

/**
 * True when an inline <svg> inside a control carries its own name.
 * accessibleName() cannot see into an <svg> (it looks for <img alt>), and icon-only buttons drawn as
 * inline SVG with a <title> child ARE named correctly. Without this guard every well-built icon
 * button on the page becomes a false "empty button".
 */
function svgIsNamed(inner: string): boolean {
  const svg = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/i.exec(inner);
  if (!svg) return false;
  if ((attr(svg[1], 'aria-label') ?? '').trim()) return true;
  if (attr(svg[1], 'aria-labelledby')) return true;
  return /<title\b[^>]*>\s*\S/i.test(svg[2]); // <title> with actual text in it
}

// These two keep the owner-facing prose grammatical at a count of one. A finding that reads
// "1 element use a tabindex" is the kind of sloppiness that makes a true statement look automated
// and gets the whole message deleted, so the copy agrees with its own number.
const s = (n: number) => (n === 1 ? '' : 's');
const v = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Screen a page's HTML for statically-visible accessibility barriers.
 *
 * Empty, tiny or non-HTML input yields zero findings by construction: every check keys off a tag that
 * simply is not there. That is the honest answer — we looked and saw nothing to report, which is not
 * the same as "the page is fine", and `limits` says so.
 */
export function scanAccessibility(html: string): ScanResult {
  const raw = html || '';
  // Everything below matches against `clean`. Script bodies, style bodies, <noscript> and comments are
  // gone, so a `<img src=x>` inside a JS template literal or a commented-out block can never produce a
  // finding about markup the browser never renders.
  const clean = stripNonContent(raw);

  const findings: Finding[] = [];
  const limits: string[] = [];

  // Document-level checks only make sense against something that is actually a document. A bare
  // fragment (or an empty string) tells us nothing about <html lang> or <title>, so we skip rather
  // than assert, and record why.
  const isDocument = /<(html|head|body)\b/i.test(clean);

  // ── 1.1.1 Non-text content: images with no alt attribute at all ────────────────────────────────
  // alt="" is the CORRECT markup for a decorative image and is deliberately not counted. Only a
  // genuinely absent alt attribute is a barrier, because that is what makes a screen reader fall back
  // to announcing the file name.
  const altless = openTags(clean, 'img').filter((t) => {
    if (ariaHidden(t.attrs)) return false;
    const role = (bareAttr(t.attrs, 'role') ?? '').toLowerCase();
    if (role === 'presentation' || role === 'none') return false; // explicitly marked decorative
    // hasAttr (not bareAttr) on purpose: it also matches `data-alt`, so a lazy-load library's
    // attribute suppresses the finding. Under-counting is the safe direction here.
    return !hasAttr(t.attrs, 'alt');
  });
  if (altless.length) {
    findings.push({
      code: 'a11y.img_missing_alt',
      category: 'accessibility',
      severity: 'high',
      confidence: 'detected',
      title: `${altless.length} image${s(altless.length)} with no alt text`,
      detail:
        `${altless.length} <img> element${s(altless.length)} in the page source ${v(altless.length, 'carries', 'carry')} ` +
        'no alt attribute, so a screen reader announces the file name or nothing at all in its place. ' +
        'Images marked decorative with alt="" were not counted — that is the correct markup.',
      count: altless.length,
      evidence: snippet(altless[0].raw),
      wcag: '1.1.1',
    });
  }

  // ── 3.3.2 Labels or instructions: form controls with nothing naming them ───────────────────────
  // Four ways a control can legitimately be named, all checked: aria-label, aria-labelledby, title,
  // and a <label> — either `for="<id>"` anywhere on the page, or wrapped around the control.
  const labelledIds = new Set<string>();
  for (const l of openTags(clean, 'label')) {
    const f = bareAttr(l.attrs, 'for');
    if (f) labelledIds.add(f);
  }
  // Implicit labelling: `<label>Email <input name="email"></label>`. Very common, and flagging it
  // would be flatly wrong, so match the control's own opening tag against every label's inner HTML.
  const insideLabels = elements(clean, 'label').map((l) => l.inner).join('\n');

  const unlabelled: { raw: string; attrs: string }[] = [];
  for (const tag of ['input', 'select', 'textarea']) {
    for (const t of openTags(clean, tag)) {
      if (ariaHidden(t.attrs)) continue;
      if (tag === 'input') {
        const type = (bareAttr(t.attrs, 'type') ?? 'text').toLowerCase();
        if (UNLABELLABLE_INPUT_TYPES.has(type)) continue;
      }
      if ((bareAttr(t.attrs, 'aria-label') ?? '').trim()) continue;
      if (bareAttr(t.attrs, 'aria-labelledby')) continue;
      if ((bareAttr(t.attrs, 'title') ?? '').trim()) continue;
      const id = bareAttr(t.attrs, 'id');
      if (id && labelledIds.has(id)) continue;
      if (insideLabels.includes(t.raw)) continue;
      unlabelled.push(t);
    }
  }
  if (unlabelled.length) {
    findings.push({
      code: 'a11y.input_missing_label',
      category: 'accessibility',
      severity: 'high',
      // 'likely', not 'detected': component libraries and form frameworks routinely attach
      // aria-label or a generated label id at runtime, and we are reading pre-JavaScript bytes.
      confidence: 'likely',
      title: `${unlabelled.length} form field${s(unlabelled.length)} with no label in the markup`,
      detail:
        `${unlabelled.length} form control${s(unlabelled.length)} (input, select or textarea) had no aria-label, ` +
        'aria-labelledby, title, or matching <label> in the HTML as delivered. Someone using a screen ' +
        'reader hears an unnamed field and has to guess what to type. A placeholder is not a label. ' +
        'Worth confirming in the rendered page, since some frameworks attach labels in JavaScript.',
      count: unlabelled.length,
      evidence: snippet(unlabelled[0].raw),
      wcag: '3.3.2',
    });
  }

  // ── 3.1.1 Language of page ────────────────────────────────────────────────────────────────────
  const htmlTags = openTags(clean, 'html');
  if (htmlTags.length) {
    const declared = (bareAttr(htmlTags[0].attrs, 'lang') ?? bareAttr(htmlTags[0].attrs, 'xml:lang') ?? '').trim();
    if (!declared) {
      findings.push({
        code: 'a11y.missing_lang',
        category: 'accessibility',
        severity: 'med',
        confidence: 'detected',
        title: 'The page does not declare a language',
        detail:
          'The <html> element carries no lang attribute, so a screen reader falls back to the ' +
          "listener's default voice and can read the page in the wrong accent or pronunciation. " +
          'It is a one-attribute fix.',
        evidence: snippet(htmlTags[0].raw),
        wcag: '3.1.1',
      });
    }
  } else if (isDocument) {
    limits.push('No <html> element was present in the markup supplied, so the page language declaration could not be checked.');
  }

  // ── 2.4.2 Page titled ─────────────────────────────────────────────────────────────────────────
  // <title> also exists inside <svg>, where it names an icon rather than the document. Drop svg
  // blocks first so an icon's title cannot mask a genuinely missing document title.
  if (isDocument) {
    const withoutSvg = clean.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
    const titles = elements(withoutSvg, 'title')
      .map((t) => t.inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!titles.length) {
      findings.push({
        code: 'a11y.missing_title',
        category: 'accessibility',
        severity: 'med',
        confidence: 'detected',
        title: 'The page has no title text',
        detail:
          'No <title> element with text was found. The title is the first thing a screen reader ' +
          'announces, the label on every browser tab and bookmark, and the blue line in a Google ' +
          'result — so this is felt by every visitor, not only assistive-tech users.',
        wcag: '2.4.2',
      });
    }
  } else {
    limits.push(
      'The markup supplied did not look like a complete HTML document (no <html>, <head> or <body> element), ' +
      'so the document-level checks — language declaration and page title — were skipped rather than guessed.',
    );
  }

  // ── 2.4.4 Link purpose: links with an href but nothing readable in them ────────────────────────
  const emptyLinks = elements(clean, 'a').filter((el) => {
    if (ariaHidden(el.attrs)) return false;
    const href = bareAttr(el.attrs, 'href');
    if (href === null) return false; // an <a> with no href is not a link
    if (accessibleName(el.attrs, el.inner)) return false;
    if (svgIsNamed(el.inner)) return false;
    return true;
  });
  if (emptyLinks.length) {
    findings.push({
      code: 'a11y.empty_link',
      category: 'accessibility',
      severity: 'high',
      // 'likely': icon fonts and JS-populated text can give a link a name we cannot read here.
      confidence: 'likely',
      title: `${emptyLinks.length} link${s(emptyLinks.length)} with no readable text`,
      detail:
        `${emptyLinks.length} link${s(emptyLinks.length)} had a destination but no text, alt text, or ` +
        'aria-label a screen reader could read out — typically an icon-only social or phone link. ' +
        `${v(emptyLinks.length, 'It is', 'They are')} announced as just "link", with no indication of where ` +
        `${v(emptyLinks.length, 'it goes', 'they go')}.`,
      count: emptyLinks.length,
      evidence: snippet(emptyLinks[0].raw),
      wcag: '2.4.4',
    });
  }

  // ── 4.1.2 Name, role, value: buttons with no name ──────────────────────────────────────────────
  const emptyButtons = elements(clean, 'button').filter((el) => {
    if (ariaHidden(el.attrs)) return false;
    if (accessibleName(el.attrs, el.inner)) return false;
    if (svgIsNamed(el.inner)) return false;
    return true;
  });
  if (emptyButtons.length) {
    findings.push({
      code: 'a11y.empty_button',
      category: 'accessibility',
      severity: 'high',
      confidence: 'likely',
      title: `${emptyButtons.length} button${s(emptyButtons.length)} with no readable text`,
      detail:
        `${emptyButtons.length} <button> element${s(emptyButtons.length)} had no text and no aria-label in ` +
        'the markup, so assistive tech announces it as an unnamed button. Menu toggles, search and ' +
        'close buttons are the usual culprits — often the controls that open the site.',
      count: emptyButtons.length,
      evidence: snippet(emptyButtons[0].raw),
      wcag: '4.1.2',
    });
  }

  // ── 1.3.1 Info and relationships: heading ranks that skip on the way down ──────────────────────
  // Needs document order ACROSS ranks, which openTags() (one tag at a time, no offsets) cannot give,
  // so this is the one place we scan for tags directly. Only a downward skip counts: h2 → h4 is a
  // hole in the outline; h4 → h2 is just closing a section.
  const ranks: number[] = [];
  const headingRe = /<h([1-6])\b[^>]*>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(clean))) ranks.push(Number(hm[1]));
  let skips = 0;
  let firstSkip = '';
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] > ranks[i - 1] + 1) {
      skips++;
      if (!firstSkip) firstSkip = `<h${ranks[i - 1]}> followed by <h${ranks[i]}>`;
    }
  }
  if (skips) {
    findings.push({
      code: 'a11y.heading_skip',
      category: 'accessibility',
      severity: 'low',
      // 'likely': headings can be injected or reordered at runtime, and a visually sensible page can
      // still read oddly in source order.
      confidence: 'likely',
      title: `Heading levels skip a rank in ${skips} place${s(skips)}`,
      detail:
        `The heading outline jumps a level ${v(skips, 'once', `${skips} times`)} (${firstSkip}). Screen-reader users ` +
        'navigate a page by its heading list, and a missing rank reads as a section that lost its ' +
        'parent. It is usually a styling shortcut rather than a structural decision.',
      count: skips,
      evidence: firstSkip,
      wcag: '1.3.1',
    });
  }

  // ── 2.4.3 Focus order + 4.1.1 Parsing: one pass over every opening tag ─────────────────────────
  // Two whole-document checks that need EVERY element, not one tag name, so they share a single scan.
  const idCounts = new Map<string, number>();
  let positiveTabindex = 0;
  let firstTabindexTag = '';
  const anyTagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let tm: RegExpExecArray | null;
  while ((tm = anyTagRe.exec(clean))) {
    const attrs = tm[2] ?? '';
    const ti = bareAttr(attrs, 'tabindex');
    if (ti !== null && /^\+?\d+$/.test(ti.trim()) && Number(ti) > 0) {
      positiveTabindex++;
      if (!firstTabindexTag) firstTabindexTag = tm[0];
    }
    const id = (bareAttr(attrs, 'id') ?? '').trim();
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  if (positiveTabindex) {
    findings.push({
      code: 'a11y.positive_tabindex',
      category: 'accessibility',
      severity: 'med',
      confidence: 'detected',
      title: `${positiveTabindex} element${s(positiveTabindex)} ${v(positiveTabindex, 'sets', 'set')} a positive tabindex`,
      detail:
        `${positiveTabindex} element${s(positiveTabindex)} ${v(positiveTabindex, 'uses', 'use')} a tabindex above 0, ` +
        `which pulls ${v(positiveTabindex, 'it', 'them')} ` +
        'out of the natural tab order and in front of everything else on the page. Keyboard users end ' +
        'up jumping around the layout in an order that does not match what they see.',
      count: positiveTabindex,
      evidence: snippet(firstTabindexTag),
      wcag: '2.4.3',
    });
  }
  const duplicatedIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicatedIds.length) {
    findings.push({
      code: 'a11y.duplicate_id',
      category: 'accessibility',
      severity: 'low',
      confidence: 'detected',
      title: `${duplicatedIds.length} id value${s(duplicatedIds.length)} used more than once`,
      detail:
        `${duplicatedIds.length} id value${s(duplicatedIds.length)} ${v(duplicatedIds.length, 'appears', 'appear')} on more than ` +
        'one element. Ids must be unique: label-to-field bindings, aria-labelledby references and ' +
        'in-page anchors all resolve to the first match, so the duplicates silently point at the ' +
        'wrong thing.',
      count: duplicatedIds.length,
      evidence: snippet(duplicatedIds.slice(0, 8).map((id) => `#${id}`).join(', ')),
      wcag: '4.1.1',
    });
  }

  // ── 4.1.2 Name, role, value: embedded frames with no title ─────────────────────────────────────
  // Zero-size and display:none frames are pixels and tag-manager plumbing, not content a user reaches,
  // so naming them is not a real barrier — excluded to keep the count honest.
  const untitledFrames = openTags(clean, 'iframe').filter((t) => {
    if (ariaHidden(t.attrs)) return false;
    if ((bareAttr(t.attrs, 'title') ?? '').trim()) return false;
    if ((bareAttr(t.attrs, 'aria-label') ?? '').trim()) return false;
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(bareAttr(t.attrs, 'style') ?? '')) return false;
    if ((bareAttr(t.attrs, 'width') ?? '').trim() === '0' || (bareAttr(t.attrs, 'height') ?? '').trim() === '0') return false;
    return true;
  });
  if (untitledFrames.length) {
    findings.push({
      code: 'a11y.iframe_missing_title',
      category: 'accessibility',
      severity: 'med',
      confidence: 'detected',
      title: `${untitledFrames.length} embedded frame${s(untitledFrames.length)} with no title`,
      detail:
        `${untitledFrames.length} <iframe> element${s(untitledFrames.length)} ${v(untitledFrames.length, 'carries', 'carry')} ` +
        'no title attribute, so a screen reader announces an unnamed frame and gives no clue whether it is a map, a video or a ' +
        'booking widget before the user steps into it.',
      count: untitledFrames.length,
      evidence: snippet(untitledFrames[0].raw),
      wcag: '4.1.2',
    });
  }

  // ── 2.4.1 Bypass blocks: a skip link ahead of the navigation ───────────────────────────────────
  // Positional by definition (the link has to come BEFORE the nav to be reachable first), and
  // elements() reports no offsets, so this scans anchors directly for their positions.
  const navAt = clean.search(/<nav\b/i);
  if (navAt >= 0) {
    let skipLink = false;
    const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let am: RegExpExecArray | null;
    while ((am = anchorRe.exec(clean))) {
      if (am.index > navAt) break; // only links ahead of the nav can be the first stop
      const href = (bareAttr(am[1], 'href') ?? '').trim();
      if (!href.startsWith('#') || href.length < 2) continue;
      // Check the class and id too: "skip-link" with odd inner markup is still a skip link, and
      // anything that widens this check only ever SUPPRESSES a finding.
      const hint = [
        accessibleName(am[1], am[2]),
        bareAttr(am[1], 'class') ?? '',
        bareAttr(am[1], 'id') ?? '',
      ].join(' ');
      if (/\b(skip|jump)\b|skip-/i.test(hint)) { skipLink = true; break; }
    }
    if (!skipLink) {
      findings.push({
        code: 'a11y.no_skip_link',
        category: 'accessibility',
        severity: 'low',
        // 'needs_review': skip links are often visually hidden, oddly worded, or added by a theme
        // script. Look at the page before this is ever said out loud to an owner.
        confidence: 'needs_review',
        title: 'No skip link was found ahead of the site navigation',
        detail:
          'The page has a <nav> but no in-page "skip to content" link before it in the source. ' +
          'Keyboard and screen-reader users tab through the whole menu again on every single page ' +
          'before reaching the content. Worth checking the rendered page — skip links are often ' +
          'hidden until focused.',
        wcag: '2.4.1',
      });
    }
  }

  // ── What this scan could not see. These ship with the result, always. ──────────────────────────
  limits.push(
    'Colour contrast cannot be evaluated from static HTML — it needs computed styles over a rendered page. ' +
    'It is the single most common real-world accessibility failure and this scan does not see it at all.',
    'Keyboard operation, focus order, focus visibility and what a screen reader actually announces are ' +
    'behaviours, not markup, and none of them were tested here.',
    'Content injected by JavaScript after load is invisible to this scan, so a page built by a framework ' +
    'may show far fewer findings than it really has.',
    'An automated scan reliably covers only a fraction of the WCAG 2.2 success criteria. The absence of ' +
    'findings here is not evidence of conformance, and nothing in this result establishes compliance ' +
    'or legal standing either way.',
  );

  return { findings, limits };
}

/**
 * Total barrier instances across a result — the headline number for the accessibility lens, and what
 * `DeepScan.a11yInstances` is composed from. Findings with no meaningful count (a missing lang, a
 * missing title) count as one occurrence each, because they occur once.
 */
export function countA11yInstances(result: ScanResult): number {
  return result.findings.reduce((n, f) => n + (f.count ?? 1), 0);
}
