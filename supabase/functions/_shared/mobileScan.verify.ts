// supabase/functions/_shared/mobileScan.verify.ts
// run: npx tsx supabase/functions/_shared/mobileScan.verify.ts
// Proves the mobile lens only ever reports what the markup really contains: each finding fires when
// its signature is present, stays silent when the page is fine, refuses to fire on a fixed width
// inside a <script> or a comment, refuses to read a year, a price, a zip+4 or an IP address as a
// phone number, claims nothing on empty input, and never puts a compliance claim in owner-facing text.

import { scanMobile, mobileFacts, MOBILE_CODES } from './mobileScan.ts';
import type { Finding, ScanResult } from './scanTypes.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.error(`  FAIL - ${name}`); }
};

const has = (r: ScanResult, code: string): boolean => r.findings.some((f) => f.code === code);
const get = (r: ScanResult, code: string): Finding | undefined => r.findings.find((f) => f.code === code);

// ── A page nobody ever made responsive: a head, a title, and no viewport tag. ────────────────────
const noViewport = scanMobile(`
  <html lang="en"><head><title>Cal's Auto Repair</title></head>
  <body><h1>Cal's Auto Repair</h1><p>Oil changes while you wait.</p></body></html>`);
ok('no_viewport: fires when the head carries no viewport meta', has(noViewport, 'mobile.no_viewport'));
ok('no_viewport: severity high', get(noViewport, 'mobile.no_viewport')?.severity === 'high');
ok('no_viewport: "detected" — the tag is unambiguously absent', get(noViewport, 'mobile.no_viewport')?.confidence === 'detected');
ok('no_viewport: nothing else is claimed about this page', noViewport.findings.length === 1);

// ── The same shape of page, built properly. Nothing to report. ───────────────────────────────────
const responsive = scanMobile(`
  <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ann's Bakery</title></head>
  <body><div style="max-width:1200px">
  <p style="font-size:14px">Fresh bread daily.</p>
  <p>Call <a href="tel:+15558675309">(555) 867-5309</a> to order.</p>
  </div></body></html>`);
ok('responsive: no_viewport silent when the tag is there', !has(responsive, 'mobile.no_viewport'));
ok('responsive: viewport_not_device silent on width=device-width', !has(responsive, 'mobile.viewport_not_device'));
ok('responsive: zoom_disabled silent when zoom is untouched', !has(responsive, 'mobile.zoom_disabled'));
ok('responsive: max-width is the RESPONSIVE pattern and is never counted', !has(responsive, 'mobile.fixed_width_layout'));
ok('responsive: 14px is not tiny text', !has(responsive, 'mobile.tiny_text'));
ok('responsive: a tel: link suppresses no_click_to_call', !has(responsive, 'mobile.no_click_to_call'));
ok('responsive: a well-built page claims nothing at all', responsive.findings.length === 0);

// ── A viewport that exists but pins the layout to a desktop width. ───────────────────────────────
const desktopViewport = scanMobile(`<html><head><meta name="viewport" content="width=1024"></head><body>Hi</body></html>`);
ok('viewport_not_device: fires on width=1024', has(desktopViewport, 'mobile.viewport_not_device'));
ok('viewport_not_device: severity high', get(desktopViewport, 'mobile.viewport_not_device')?.severity === 'high');
ok('viewport_not_device: "detected"', get(desktopViewport, 'mobile.viewport_not_device')?.confidence === 'detected');
ok('viewport_not_device: carries the tag itself as evidence', /viewport/.test(get(desktopViewport, 'mobile.viewport_not_device')?.evidence ?? ''));
ok('viewport_not_device: no_viewport does NOT also fire', !has(desktopViewport, 'mobile.no_viewport'));

// A viewport meta with no content at all does nothing, and is reported as such.
ok('viewport_not_device: fires on a viewport meta with no content',
  has(scanMobile(`<html><head><meta name="viewport"></head><body>x</body></html>`), 'mobile.viewport_not_device'));

// FALSE-POSITIVE TRAP: `initial-scale=1` with no width really does render at device width — the
// browser derives it. Calling that page desktop-width would be a false statement about a working site.
const scaleOnly = scanMobile(`<html><head><meta name="viewport" content="initial-scale=1"></head><body>Hi</body></html>`);
ok('trap: initial-scale=1 alone is NOT reported as a desktop-width viewport', !has(scaleOnly, 'mobile.viewport_not_device'));
ok('trap: initial-scale=1 alone claims nothing at all', scaleOnly.findings.length === 0);

// ── Zoom switched off. Both spellings, and the silent case. ──────────────────────────────────────
const noZoom = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"></head>
  <body>x</body></html>`);
ok('zoom_disabled: fires on user-scalable=no', has(noZoom, 'mobile.zoom_disabled'));
ok('zoom_disabled: severity med', get(noZoom, 'mobile.zoom_disabled')?.severity === 'med');
ok('zoom_disabled: "detected"', get(noZoom, 'mobile.zoom_disabled')?.confidence === 'detected');
ok('zoom_disabled: carries WCAG 1.4.4 as a reference', get(noZoom, 'mobile.zoom_disabled')?.wcag === '1.4.4');
ok('zoom_disabled: the device-width part of the same tag is still fine', !has(noZoom, 'mobile.viewport_not_device'));

const cappedZoom = scanMobile(`<html><head><meta name="viewport" content="width=device-width, maximum-scale=1.0"></head><body>x</body></html>`);
ok('zoom_disabled: fires on maximum-scale below 1.5', has(cappedZoom, 'mobile.zoom_disabled'));

const zoomOk = scanMobile(`<html><head><meta name="viewport" content="width=device-width, maximum-scale=5.0, user-scalable=yes"></head><body>x</body></html>`);
ok('zoom_disabled: silent on maximum-scale=5', !has(zoomOk, 'mobile.zoom_disabled'));
ok('zoom_disabled: silent on user-scalable=yes', zoomOk.findings.length === 0);

// ── Fixed pixel widths on layout elements. ───────────────────────────────────────────────────────
const fixed = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <table width="1000"><tr><td>Menu</td></tr></table>
  <div style="width:1200px;margin:0 auto">Content</div>
  <div style="min-width:960px">Sidebar</div>
  <div width="100%">Fluid, and correct</div>
  <table width="800"><tr><td>Under the threshold</td></tr></table>
  <div data-width="1400" class="hero">A layout library's bookkeeping attribute</div>
  <img style="width:1600px" src="/hero.jpg" alt="Storefront">
  </body></html>`);
ok('fixed_width: fires', has(fixed, 'mobile.fixed_width_layout'));
ok('fixed_width: counts exactly the three real declarations', get(fixed, 'mobile.fixed_width_layout')?.count === 3);
ok('fixed_width: "likely" — a stylesheet we cannot read may override it', get(fixed, 'mobile.fixed_width_layout')?.confidence === 'likely');
ok('fixed_width: severity med', get(fixed, 'mobile.fixed_width_layout')?.severity === 'med');
ok('fixed_width: names the widest declaration it saw', /1200px/.test(get(fixed, 'mobile.fixed_width_layout')?.detail ?? ''));
ok('fixed_width: carries markup as evidence', (get(fixed, 'mobile.fixed_width_layout')?.evidence ?? '').length > 0);
ok('trap: width="100%" is fluid markup, never counted', !/100%/.test(JSON.stringify(get(fixed, 'mobile.fixed_width_layout'))));
ok('trap: a 1600px IMAGE is not a fixed layout (one CSS line makes it fluid)',
  !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><img style="width:1600px" src="/a.jpg" alt="x"></body></html>`), 'mobile.fixed_width_layout'));
ok('trap: data-width is not a width attribute',
  !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><div data-width="1400">x</div></body></html>`), 'mobile.fixed_width_layout'));
ok('trap: 800px is below the threshold and stays unreported',
  !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><table width="800"><tr><td>x</td></tr></table></body></html>`), 'mobile.fixed_width_layout'));

// ── FALSE-POSITIVE TRAP: markup inside <script> and inside a comment is not markup. ──────────────
const offstage = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
  <script>
    var tpl = '<table width="1200"><tr><td><table width="1100"><tr><td>x</td></tr></table></td></tr></table>';
    var css = 'width:1400px'; var small = 'font-size:8px';
  </script>
  <!-- <div style="width:1600px"><span style="font-size:7px">old layout</span></div> removed in 2023 -->
  <p style="font-size:14px">Everything here is fine.</p>
  </body></html>`);
ok('trap: a fixed width inside a <script> string never fires', !has(offstage, 'mobile.fixed_width_layout'));
ok('trap: a tiny font inside a <script> string never fires', !has(offstage, 'mobile.tiny_text'));
ok('trap: nested tables inside a <script> string never fire', !has(offstage, 'mobile.legacy_table_layout'));
ok('trap: a commented-out layout never fires', offstage.findings.length === 0);

// ── Tiny inline text. ────────────────────────────────────────────────────────────────────────────
const tiny = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <p style="font-size:10px">Terms apply.</p>
  <span style="color:#999;font-size:9.5px">Legal</span>
  <p style="font-size:12px">Small but chosen.</p>
  <p style="font-size:16px">Body copy.</p>
  <style>.footnote{font-size:8px}</style>
  </body></html>`);
ok('tiny_text: fires', has(tiny, 'mobile.tiny_text'));
ok('tiny_text: counts only the declarations really below 12px', get(tiny, 'mobile.tiny_text')?.count === 2);
ok('tiny_text: severity low', get(tiny, 'mobile.tiny_text')?.severity === 'low');
ok('tiny_text: "likely"', get(tiny, 'mobile.tiny_text')?.confidence === 'likely');
ok('tiny_text: names the smallest size seen', /9\.5px/.test(get(tiny, 'mobile.tiny_text')?.detail ?? ''));
ok('trap: exactly 12px is not tiny', !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p style="font-size:12px">x</p></body></html>`), 'mobile.tiny_text'));
ok('trap: a font-size in a <style> block is not an inline style', !/8px/.test(get(tiny, 'mobile.tiny_text')?.detail ?? ''));

// ── A phone number shown but not tappable. ───────────────────────────────────────────────────────
const untappable = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <p>Call us at (555) 867-5309 for a free estimate.</p></body></html>`);
ok('no_click_to_call: fires on a number with no tel: link', has(untappable, 'mobile.no_click_to_call'));
ok('no_click_to_call: severity med', get(untappable, 'mobile.no_click_to_call')?.severity === 'med');
ok('no_click_to_call: "likely" — a rendered page could add the link', get(untappable, 'mobile.no_click_to_call')?.confidence === 'likely');
ok('no_click_to_call: quotes the number it really saw', /\(555\) 867-5309/.test(get(untappable, 'mobile.no_click_to_call')?.detail ?? ''));
ok('no_click_to_call: also reads the dotted format',
  has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p>Phone: 800.555.0199</p></body></html>`), 'mobile.no_click_to_call'));
ok('no_click_to_call: also reads a 1-800 number',
  has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p>Toll free 1-800-555-0199</p></body></html>`), 'mobile.no_click_to_call'));

// FALSE-POSITIVE TRAP: years, award ranges, zip+4, prices, suite ranges, IPs and version strings are
// not phone numbers. Reading any of them as one would put a number in an email that isn't theirs.
const numbersEverywhere = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <p>Family owned since 1985. Award winners 2019-2024. We ship to 90210-1234.</p>
  <p>Rugs from $1,299.00 to $2,499.00. Suite 200-300, Building 4.</p>
  <p>Server 192.168.1.100 running version 1.234.5678.</p>
  <p>Our 9 500 1000 sq ft showroom is open daily.</p>
  </body></html>`);
ok('trap: a page full of numbers yields no phone finding', !has(numbersEverywhere, 'mobile.no_click_to_call'));
ok('trap: that page claims nothing at all', numbersEverywhere.findings.length === 0);

// FALSE-POSITIVE TRAP: a tel: link living in a script-borne header config still renders a tappable
// number. Suppressing on the weaker signal is the safe direction.
const telInScript = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width">
  <script>window.HEADER={"phone":{"href":"tel:+15558675309","label":"Call"}};</script></head>
  <body><p>Call 555-867-5309 today.</p></body></html>`);
ok('trap: a tel: link in a script config suppresses no_click_to_call', !has(telInScript, 'mobile.no_click_to_call'));

// The other direction: "Tel:" is ordinary prose, not a link, and must not buy silence.
ok('trap: the words "Tel:" in body copy do not count as a tel: link',
  has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p>Tel: 555-867-5309</p></body></html>`), 'mobile.no_click_to_call'));

// ── Nested table layout. ─────────────────────────────────────────────────────────────────────────
const nested = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <table width="600"><tr><td><table width="580"><tr><td>Nav</td></tr></table></td></tr></table>
  </body></html>`);
ok('legacy_table_layout: fires on a table inside a cell', has(nested, 'mobile.legacy_table_layout'));
ok('legacy_table_layout: severity med', get(nested, 'mobile.legacy_table_layout')?.severity === 'med');
ok('legacy_table_layout: "likely"', get(nested, 'mobile.legacy_table_layout')?.confidence === 'likely');
ok('legacy_table_layout: carries markup as evidence', (get(nested, 'mobile.legacy_table_layout')?.evidence ?? '').length > 0);

const dataTable = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <table><tr><th>Day</th><th>Hours</th></tr><tr><td>Monday</td><td>9am to 5pm</td></tr></table>
  </body></html>`);
ok('trap: an ordinary data table is not a nested layout', !has(dataTable, 'mobile.legacy_table_layout'));
ok('trap: an ordinary data table claims nothing', dataTable.findings.length === 0);

const siblingTables = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <table><tr><td>One</td></tr></table><table><tr><td>Two</td></tr></table>
  </body></html>`);
ok('trap: two tables side by side are not nested', !has(siblingTables, 'mobile.legacy_table_layout'));

// Omitted </td> is legal HTML and rife in exactly these vintage pages — it must not leak state into
// the next table and invent a nesting that is not there.
const sloppyCells = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <table><tr><td>One<td>Two</table><table><tr><td>Three</table>
  </body></html>`);
ok('trap: unclosed <td> does not leak into the next table', !has(sloppyCells, 'mobile.legacy_table_layout'));

// ── HONESTY: what we cannot see becomes a limit, never a finding. ────────────────────────────────
const jsHead = scanMobile(`
  <html><head><title>Wix-style site</title>
  <script>document.head.insertAdjacentHTML('beforeend','<meta name="viewport" content="width=device-width">');</script>
  </head><body><p>Hello</p></body></html>`);
ok('honesty: a viewport written by a script buys silence, not a no_viewport finding', !has(jsHead, 'mobile.no_viewport'));
ok('honesty: and the reason is stated in limits', jsHead.limits.some((l) => /scripts or comments/i.test(l)));

const fragment = scanMobile(`<body><p>Just a body fragment.</p></body>`);
ok('honesty: a fragment with no head is not accused of missing a viewport', !has(fragment, 'mobile.no_viewport'));
ok('honesty: and that skip is disclosed in limits', fragment.limits.some((l) => /no <html> or <head> element/i.test(l)));

const twoViewports = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="viewport" content="width=1024"></head><body>x</body></html>`);
ok('honesty: repeated viewport tags are disclosed rather than adjudicated', twoViewports.limits.some((l) => /2 separate viewport declarations/.test(l)));
ok('honesty: only the first is evaluated, so nothing is claimed about the second', twoViewports.findings.length === 0);

// ── Empty and garbage input claim nothing. ───────────────────────────────────────────────────────
const empty = scanMobile('');
ok('empty: zero findings', empty.findings.length === 0);
ok('empty: limits still ship (a quiet result is not a working phone experience)', empty.limits.length >= 5);
ok('garbage: claims nothing', scanMobile('<<<>>> not html !!! ???').findings.length === 0);
ok('whitespace: claims nothing', scanMobile('   \n\t  ').findings.length === 0);

// ── LIMITS must say the two things this scan structurally cannot know. ───────────────────────────
const limits = noViewport.limits.join(' ');
ok('limits: states rendered layout, reflow and tap-target size need a browser',
  /rendered layout/i.test(limits) && /reflow/i.test(limits) && /tap target/i.test(limits) && /browser/i.test(limits));
ok('limits: states a responsive CSS file it cannot read may fix what looks fixed-width',
  /responsive CSS file/i.test(limits) && /fixed-width/i.test(limits) && /media quer/i.test(limits));
ok('limits: states the absence of a finding is not evidence of absence', /absence of a finding/i.test(limits));

// ── Shape: every finding is a mobile finding with a known code. ──────────────────────────────────
const all = [noViewport, desktopViewport, noZoom, cappedZoom, fixed, tiny, untappable, nested].flatMap((r) => r.findings);
ok('shape: every finding is categorised mobile', all.every((f) => f.category === 'mobile'));
ok('shape: every emitted code is declared in MOBILE_CODES', all.every((f) => (MOBILE_CODES as readonly string[]).includes(f.code)));
ok('shape: every finding carries a title and a detail', all.every((f) => f.title.length > 0 && f.detail.length > 0));
ok('shape: all seven codes are reachable', new Set(all.map((f) => f.code)).size === MOBILE_CODES.length);

// ── LANGUAGE: no finding may assert compliance, illegality or liability. ─────────────────────────
const allText = all.map((f) => `${f.title} ${f.detail}`).join(' ');
ok('language: never claims compliance or non-compliance', !/\bcompliant\b|\bcompliance\b|\bADA\b|\bconform/i.test(allText));
ok('language: never threatens lawsuits, fines or liability', !/sued|lawsuit|liabilit|penalt|\bfined\b/i.test(allText));
ok('language: never asserts illegality or a violation', !/illegal|unlawful|violat/i.test(allText));
ok('language: never grades the page', !/\bscore\b|\bgrade\b|\bfails?\b\s+(the|a)\b/i.test(allText));

// ── The storable facts track the findings. ───────────────────────────────────────────────────────
const facts = mobileFacts(`
  <html><head><meta name="viewport" content="width=1024, user-scalable=no"></head><body>
  <table width="1200"><tr><td><table><tr><td>x</td></tr></table></td></tr></table></body></html>`);
ok('facts: viewport content is reported verbatim', facts.viewport === 'width=1024, user-scalable=no');
ok('facts: viewportAdapts false on a desktop width', facts.viewportAdapts === false);
ok('facts: zoomDisabled true', facts.zoomDisabled === true);
ok('facts: clickToCall false when no tel: link exists', facts.clickToCall === false);
ok('facts: counts the fixed width declarations', facts.fixedWidthDeclarations === 1);
ok('facts: nestedTableLayout true', facts.nestedTableLayout === true);
ok('facts: empty input is honestly empty', JSON.stringify(mobileFacts('')) === JSON.stringify({
  viewport: null, viewportAdapts: false, zoomDisabled: false, clickToCall: false,
  fixedWidthDeclarations: 0, nestedTableLayout: false,
}));

// ── Determinism. ─────────────────────────────────────────────────────────────────────────────────
const sample = `
  <html><head><meta name="viewport" content="width=1024, user-scalable=no"><title>x</title></head><body>
  <table width="1000"><tr><td><table><tr><td><p style="font-size:9px">Call 555-867-5309</p></td></tr></table></td></tr></table>
  </body></html>`;
ok('deterministic: scanMobile repeats exactly', JSON.stringify(scanMobile(sample)) === JSON.stringify(scanMobile(sample)));
ok('deterministic: mobileFacts repeats exactly', JSON.stringify(mobileFacts(sample)) === JSON.stringify(mobileFacts(sample)));
ok('deterministic: a previous scan cannot change the next one', JSON.stringify(scanMobile(sample)) === JSON.stringify(scanMobile(sample)));

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL PASS. Everything below was written to BREAK this scanner, working from one rule: a
// finding emailed to a business that is not true of their page is the worst outcome this codebase
// has. Each block is real-world markup a competent site really ships.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

// ── An escaped code sample is TEXT a browser prints, not markup a browser renders. ────────────────
// A shop showing customers what to paste, a blog post explaining a CSS snippet: the characters
// style="font-size:9px" are on the page as letters. Reading them back as the page's own unreadable
// body copy tells an owner something about their site that is simply not so.
const codeSample = scanMobile(`
  <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
  <h1>How to add your disclaimer</h1>
  <p>Paste this into your footer:</p>
  <pre><code>&lt;span style="font-size:9px"&gt;Prices subject to change&lt;/span&gt;</code></pre>
  <p>Any questions, just ask.</p></body></html>`);
ok('trap: an escaped code sample is not the page\'s own tiny text', !has(codeSample, 'mobile.tiny_text'));
ok('trap: a page whose only "problem" is a printed code sample claims nothing', codeSample.findings.length === 0);

// ── A <textarea> holding an embed snippet: its body is text, whatever it looks like. ──────────────
const embedBox = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <label for="embed">Copy this into your site</label>
  <textarea id="embed" readonly><div style="width:1200px"><table width="1000"><tr><td><table width="980"><tr><td>Widget</td></tr></table></td></tr></table></div></textarea>
  </body></html>`);
ok('trap: a fixed width inside a <textarea> is not this page\'s layout', !has(embedBox, 'mobile.fixed_width_layout'));
ok('trap: nested tables inside a <textarea> are not this page\'s layout', !has(embedBox, 'mobile.legacy_table_layout'));
ok('trap: an embed box claims nothing at all', embedBox.findings.length === 0);

// ── <template> is inert markup. Nothing in it is in the document until a script clones it. ────────
const templated = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <div id="app"></div>
  <template id="row"><div style="width:1400px"><span style="font-size:8px">stub</span></div></template>
  </body></html>`);
ok('trap: a fixed width inside <template> never fires', !has(templated, 'mobile.fixed_width_layout'));
ok('trap: a tiny font inside <template> never fires', !has(templated, 'mobile.tiny_text'));
ok('trap: a component template claims nothing at all', templated.findings.length === 0);

// A viewport tag that exists only as a printed example must not be read as the page's own tag —
// but it must not be read as an absence either. Same unknowable as the script case: say so, claim nothing.
const viewportInCode = scanMobile(`
  <html><head><title>Our web tips</title></head><body>
  <p>Every site needs this line:</p><code>&lt;meta name="viewport" content="width=device-width"&gt;</code>
  </body></html>`);
ok('trap: a viewport tag shown as an example is not the page\'s own viewport', !has(viewportInCode, 'mobile.viewport_not_device'));
ok('trap: nor is it read as an absence', !has(viewportInCode, 'mobile.no_viewport'));

// ── font-size:0 is a layout hack, not body copy set too small. ───────────────────────────────────
// Killing the whitespace between inline-blocks is the classic use. There is no text to be
// unreadable, so "at the edge of readable" would describe something nobody is shown.
const zeroFont = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <ul style="font-size:0px;padding:0"><li style="font-size:16px">Lunch</li><li style="font-size:16px">Dinner</li></ul>
  </body></html>`);
ok('trap: font-size:0px is a whitespace hack, not unreadable text', !has(zeroFont, 'mobile.tiny_text'));
ok('trap: the inline-block gap hack claims nothing', zeroFont.findings.length === 0);

// ── display:none takes the box out of the layout entirely. ───────────────────────────────────────
// A closed drawer, a print-only block, a desktop promo toggled by script: none of them can overflow
// a phone screen, and none of them can show anyone text too small to read.
const hidden = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <div class="promo" style="display:none;width:1200px">Desktop-only banner</div>
  <p style="display: none; font-size:9px">Print footer</p>
  <table width="1400" style="display:none"><tr><td>Legacy print grid</td></tr></table>
  <p style="font-size:16px">Open daily.</p></body></html>`);
ok('trap: a display:none container is not a fixed-width layout problem', !has(hidden, 'mobile.fixed_width_layout'));
ok('trap: a display:none block is not unreadable text', !has(hidden, 'mobile.tiny_text'));
ok('trap: a hidden desktop promo claims nothing at all', hidden.findings.length === 0);

// …and the hiding reaches the CHILDREN, which is where a WYSIWYG puts the inline styles. A print
// block hidden on screen holds ordinary markup; none of it generates a box for anyone to see.
const hiddenSubtree = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <div class="print-only" style="display:none">
    <div style="width:1200px"><span style="font-size:7px">Invoice footer</span>
    <table width="1400"><tr><td><table width="1300"><tr><td>Legacy grid</td></tr></table></td></tr></table>
    <p>Call 555-867-5309</p></div>
  </div>
  <p style="font-size:16px">Open daily.</p></body></html>`);
ok('trap: a child of a display:none block is not a fixed-width problem', !has(hiddenSubtree, 'mobile.fixed_width_layout'));
ok('trap: a child of a display:none block is not unreadable text', !has(hiddenSubtree, 'mobile.tiny_text'));
ok('trap: nested tables inside a display:none block are not this page\'s layout', !has(hiddenSubtree, 'mobile.legacy_table_layout'));
ok('trap: a hidden print block claims nothing at all', hiddenSubtree.findings.length === 0);

// The `hidden` attribute is the markup spelling of the same thing — closed accordions, inactive
// tab panels and stepper steps all ship that way.
const hiddenAttr = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <section id="tab2" hidden><div style="width:1300px"><p style="font-size:8px">Inactive tab</p></div></section>
  <p style="font-size:16px">Active tab.</p></body></html>`);
ok('trap: a hidden="" tab panel is not a fixed-width problem', !has(hiddenAttr, 'mobile.fixed_width_layout'));
ok('trap: a hidden="" tab panel is not unreadable text', !has(hiddenAttr, 'mobile.tiny_text'));

// …but aria-hidden is about assistive tech, not layout: that element IS on screen and still counts.
const ariaHidden = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <div aria-hidden="true" style="width:1300px"><span style="font-size:8px">decorative but visible</span></div>
  </body></html>`);
ok('trap: aria-hidden does not mean "not rendered" and must not buy silence', has(ariaHidden, 'mobile.fixed_width_layout'));
ok('trap: nor for tiny text', has(ariaHidden, 'mobile.tiny_text'));

// …and type="hidden" is a form field's TYPE, not a hidden ancestor.
const hiddenInput = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <form><input type="hidden" name="csrf" value="x"><div style="width:1300px">Visible form</div></form>
  </body></html>`);
ok('trap: type="hidden" on an input does not hide its siblings', has(hiddenInput, 'mobile.fixed_width_layout'));

// The hiding must end where the element ends — the next sibling is still read.
const hiddenThenReal = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <div style="display:none"><p style="font-size:7px">hidden</p></div>
  <div style="width:1500px"><p style="font-size:8px">Visible and really this wide.</p></div>
  </body></html>`);
ok('fixed_width: a sibling AFTER a hidden block is still read', has(hiddenThenReal, 'mobile.fixed_width_layout'));
ok('fixed_width: and only the visible declaration is counted', get(hiddenThenReal, 'mobile.fixed_width_layout')?.count === 1);
ok('tiny_text: only the visible tiny declaration is counted', get(hiddenThenReal, 'mobile.tiny_text')?.count === 1);
ok('tiny_text: naming the size that is actually shown', /8px/.test(get(hiddenThenReal, 'mobile.tiny_text')?.detail ?? ''));

// ── A font-size on an element that renders no text of its own says nothing about readability. ────
const spacerImg = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <img src="/spacer.gif" alt="" width="1" height="1" style="font-size:0px;line-height:1px">
  <img src="/logo.png" alt="Rossi Plumbing" style="font-size:1px">
  <hr style="font-size:2px"><input type="text" name="q" style="font-size:11px">
  <p style="font-size:16px">Licensed and insured.</p></body></html>`);
ok('trap: a font-size on a spacer image is not unreadable body copy', !has(spacerImg, 'mobile.tiny_text'));
ok('trap: that page claims nothing at all', spacerImg.findings.length === 0);

// The suppressions above must not blind the check: real tiny text on the same page still counts, once.
const mixed = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <pre><code>&lt;p style="font-size:6px"&gt;example&lt;/p&gt;</code></pre>
  <img src="/s.gif" alt="" style="font-size:0px">
  <div style="display:none"><span style="font-size:7px">hidden</span></div>
  <p style="font-size:9px">Terms and conditions apply.</p></body></html>`);
ok('tiny_text: the one REAL tiny declaration on a noisy page still fires', has(mixed, 'mobile.tiny_text'));
ok('tiny_text: and it is counted exactly once', get(mixed, 'mobile.tiny_text')?.count === 1);
ok('tiny_text: naming the size it really saw, not the decoys', /9px/.test(get(mixed, 'mobile.tiny_text')?.detail ?? ''));

// ── <html> and <head> are BOTH optional in HTML. Omitting them is valid, minified pages do it. ────
const noHeadTag = scanMobile(`<!doctype html><title>Bob's Diner</title><meta name="viewport" content="width=1024"><body><p>Open daily</p>`);
ok('viewport_not_device: a viewport tag is read even where <html>/<head> are omitted', has(noHeadTag, 'mobile.viewport_not_device'));
ok('honesty: and the "no head to look in" limit is not claimed when the tag was in fact read',
  !noHeadTag.limits.some((l) => /no <html> or <head> element/i.test(l)));

const noHeadTagFine = scanMobile(`<!doctype html><title>Bob's</title><meta name="viewport" content="width=device-width,initial-scale=1"><body><p>Open daily</p>`);
ok('trap: a head-less but responsive page claims nothing', noHeadTagFine.findings.length === 0);

// ── A broken quote in the viewport tag is unknowable, not an empty content string. ────────────────
// A browser recovers from `content="width=device-width>` its own way and very often still lays out
// at device width. Telling this owner their viewport content is empty would be flatly false.
const brokenQuote = scanMobile(`<html><head><meta name="viewport" content="width=device-width></head><body><p>Hi</p></body></html>`);
ok('trap: an unbalanced quote in the viewport content raises no finding', !has(brokenQuote, 'mobile.viewport_not_device'));
ok('trap: nor a zoom finding', !has(brokenQuote, 'mobile.zoom_disabled'));
ok('honesty: and the unreadable content is disclosed in limits', brokenQuote.limits.some((l) => /could not be read/i.test(l)));

// The genuinely content-less tag is a different thing and still fires: `<meta name="viewport">`
// really does nothing, and there is no ambiguity about it.
ok('viewport_not_device: a viewport meta with NO content attribute is still reported',
  has(scanMobile(`<html><head><meta name="viewport"></head><body>x</body></html>`), 'mobile.viewport_not_device'));

// ── An unterminated element or comment swallows the rest of the document, exactly as a browser ───
// would. That is a blind spot, and a quiet result from a half-read page must say so.
const swallowedByScript = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <script>var a = 1;
  <table width="1400"><tr><td><table width="1300"><tr><td><p style="font-size:7px">Call 555-867-5309</p></td></tr></table></td></tr></table>
  </body></html>`);
ok('honesty: an unterminated <script> raises no finding about markup inside it', swallowedByScript.findings.length === 0);
ok('honesty: and the unread tail is disclosed in limits', swallowedByScript.limits.some((l) => /never closed/i.test(l)));

const swallowedByComment = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <!-- todo: rebuild
  <table width="1400"><tr><td><table width="1300"><tr><td>x</td></tr></table></td></tr></table>
  </body></html>`);
ok('honesty: an unterminated comment discloses the unread tail', swallowedByComment.limits.some((l) => /never closed/i.test(l)));
ok('honesty: a well-formed page is NOT told part of it went unread',
  !responsive.limits.some((l) => /never closed/i.test(l)) && !noViewport.limits.some((l) => /never closed/i.test(l)));

// ── Numeric prose that is shaped like a phone number but is not one. ──────────────────────────────
// A parenthesised run of three numbers is a zone list, a size chart or an accounting figure far more
// often than it is a phone number written with spaces. Quoting the wrong digits back to an owner as
// "your phone number" is a false statement in an email.
ok('trap: "(500) 300 2000" in prose is not a phone number',
  !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p>Serving zones (500) 300 2000 daily.</p></body></html>`), 'mobile.no_click_to_call'));
ok('trap: a part number is not a phone number',
  !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p>Part No. 300-450-6000 is in stock.</p></body></html>`), 'mobile.no_click_to_call'));
ok('trap: a model number is not a phone number',
  !has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p>Model# 250-300-4000 fits most units.</p></body></html>`), 'mobile.no_click_to_call'));
// …and suppressing one must not hide a real number further down the page.
const partThenPhone = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <p>Part No. 300-450-6000 is in stock.</p><p>Call 555-867-5309 to order.</p></body></html>`);
ok('no_click_to_call: a real number after a part number is still found', has(partThenPhone, 'mobile.no_click_to_call'));
ok('no_click_to_call: and it is the real number that is quoted', /555-867-5309/.test(get(partThenPhone, 'mobile.no_click_to_call')?.detail ?? ''));
// The evidence snippet is surrounding context and may legitimately show the part number; what must
// never happen is the part number being NAMED as the business's phone number.
ok('no_click_to_call: the part number is never named as the phone number', !/300-450-6000/.test(get(partThenPhone, 'mobile.no_click_to_call')?.detail ?? ''));

// ── Markup shapes a hand-written regex gets wrong: minified, uppercase, unquoted, self-closing. ───
const minifiedUpper = scanMobile(`<!DOCTYPE HTML><HTML LANG=EN><HEAD><META CHARSET=UTF-8><META NAME=viewport CONTENT='width=device-width,initial-scale=1'><TITLE>Rossi</TITLE></HEAD><BODY><DIV STYLE='max-width:1200px'><P STYLE='font-size:14px'>Hi</P></DIV></BODY></HTML>`);
ok('trap: uppercase, unquoted and single-quoted markup is read correctly, not flagged', minifiedUpper.findings.length === 0);

const xhtmlish = scanMobile(`<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>X</title></head><body><div style="max-width:1140px" /><img src="a.png" alt="" /><br /></body></html>`);
ok('trap: self-closing XHTML tags are read correctly, not flagged', xhtmlish.findings.length === 0);

const gtInAttrs = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
  <div data-sel="ul > li" onclick="if(w>900)go()" style="max-width:1200px">
    <button aria-label="Menu" style="font-size:14px"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 6h18"/></svg></button>
    <img src="/a.png" alt="" width="1600" style="max-width:100%">
    <p id="lbl" style="font-size:15px">Open <span aria-labelledby="lbl">now</span></p>
  </div></body></html>`);
ok('trap: a > inside an attribute value does not manufacture findings', gtInAttrs.findings.length === 0);

// ── A modern component page: nothing here is a mobile problem. ────────────────────────────────────
const modern = scanMobile(`<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Rossi Plumbing</title></head><body><div id="root">
  <header style="max-width:1280px;margin:0 auto"><a href="tel:+15558675309" style="font-size:18px">(555) 867-5309</a></header>
  <main style="min-width:0"><section style="max-width:72ch"><p style="font-size:1rem">Same-day service.</p></section></main>
  </div><script src="/static/js/main.9f2a.js"></script></body></html>`);
ok('trap: a modern component page claims nothing at all', modern.findings.length === 0);
ok('trap: min-width:0 (the flex fix) is not a fixed width', !has(modern, 'mobile.fixed_width_layout'));

// `count` counts DECLARATIONS. One container carrying both a width attribute and an inline width is
// two declarations and one element, and the prose must not call that "2 layout elements".
const twoDeclsOneElement = scanMobile(`
  <html><head><meta name="viewport" content="width=device-width"></head><body>
  <table width="1000" style="width:1100px"><tr><td>Menu</td></tr></table></body></html>`);
ok('fixed_width: two declarations on one element are counted as two', get(twoDeclsOneElement, 'mobile.fixed_width_layout')?.count === 2);
ok('fixed_width: and the prose does not call them two elements',
  !/\b2 layout elements\b/.test(get(twoDeclsOneElement, 'mobile.fixed_width_layout')?.detail ?? ''));
ok('fixed_width: the prose says what was actually counted',
  /declarations?/i.test(get(twoDeclsOneElement, 'mobile.fixed_width_layout')?.detail ?? ''));

// min-width really is counted when it is a floor a phone cannot meet — the check is not just asleep.
ok('fixed_width: min-width above the threshold is still counted',
  has(scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><div style="min-width:960px">x</div></body></html>`), 'mobile.fixed_width_layout'));

// ── Malformed and hostile input must not crash or stall. ─────────────────────────────────────────
ok('crash: an unterminated tag does not throw', (() => { try { scanMobile('<html><head><meta name="viewport" content="width=device-width"><body><div style="width:1200px" <p>oops'); return true; } catch { return false; } })());
ok('crash: astral-plane and combining characters do not throw', (() => { try { scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body><p style="font-size:9px">\u{1F600}\u{1D54F} ünícodé</p></body></html>`); return true; } catch { return false; } })());
ok('crash: a lone high surrogate does not throw', (() => { try { scanMobile(`<html><head><meta name="viewport" content="width=1024"></head><body><p>\uD800 lone</p></body></html>`); return true; } catch { return false; } })());
ok('crash: NUL bytes do not throw', (() => { try { scanMobile('<html>\u0000<head>\u0000<meta name="viewport"\u0000content="width=device-width"></head><body>\u0000</body></html>'); return true; } catch { return false; } })());
ok('crash: 5000-deep nesting does not throw', (() => { try { scanMobile(`<html><head><meta name="viewport" content="width=device-width"></head><body>${'<div>'.repeat(5000)}x${'</div>'.repeat(5000)}</body></html>`); return true; } catch { return false; } })());

// Half a megabyte of the shapes that have historically made HTML regexes go quadratic: `>` inside
// attributes, never-closed anchors, and an attribute whose quote never closes.
const hostile = `<html><head><meta name="viewport" content="width=device-width"></head><body>` +
  `<div class="a" style="max-width:1200px" data-x="ul > li">${'<span title="a>b">copy with (555) not a phone </span>'.repeat(6000)}</div>` +
  `<table>${'<tr><td>cell</td></tr>'.repeat(6000)}</table>` +
  `<a href="/x">${'unclosed anchor '.repeat(2000)}` +
  `<div class="unclosed-quote" data-y="${'x'.repeat(50000)}</body></html>`;
const t0 = Date.now();
const hostileResult = scanMobile(hostile);
const elapsed = Date.now() - t0;
ok('crash: half a megabyte of adversarial markup finishes well inside an edge-function budget', elapsed < 3000);
ok('crash: and claims nothing false about it', hostileResult.findings.length === 0);

// ── Determinism cannot depend on what the scanner was handed previously. ─────────────────────────
const beforeOther = JSON.stringify(scanMobile(`<html><head></head><body><p>Call 555-867-5309</p></body></html>`));
scanMobile(`<html><head><meta name="viewport" content="width=1024, user-scalable=no"></head><body><p>Call (555) 867-5309 and 800.555.0199 and Part No. 300-450-6000</p><div style="width:1500px"></div></body></html>`);
scanMobile(hostile);
const afterOther = JSON.stringify(scanMobile(`<html><head></head><body><p>Call 555-867-5309</p></body></html>`));
ok('deterministic: an unrelated scan in between changes nothing', beforeOther === afterOther);
ok('deterministic: mobileFacts agrees with the findings on the same page',
  mobileFacts(`<html><head><meta name="viewport" content="width=device-width"></head><body><div style="display:none;width:1200px">x</div></body></html>`).fixedWidthDeclarations === 0);

// ── LIMITS must name every blind spot the suppressions above created. ────────────────────────────
const limitText = responsive.limits.join(' ');
ok('limits: states that only pixel values are read, not em/rem/pt/%',
  /pixel values are read/i.test(limitText) && /\brem\b/i.test(limitText) && /\bpt\b/i.test(limitText));
ok('limits: names the regions it deliberately does not examine',
  /<pre>/i.test(limitText) && /<textarea>/i.test(limitText) && /<template>/i.test(limitText) && /comment/i.test(limitText));
ok('limits: says a real problem hiding in one of those was not counted', /was not counted/i.test(limitText));

// ── LANGUAGE, over every finding this scanner can produce, not just the earlier sample. ──────────
const everyFinding = [
  noViewport, desktopViewport, noZoom, cappedZoom, fixed, tiny, untappable, nested,
  scanMobile(`<html><head><meta name="viewport"></head><body><p>Call (555) 867-5309</p><div style="min-width:1100px"><span style="font-size:8px">x</span></div><table><tr><td><table><tr><td>y</td></tr></table></td></tr></table></body></html>`),
].flatMap((r) => r.findings);
const everyText = everyFinding.map((f) => `${f.title} ${f.detail}`).join(' ');
ok('language: never guarantees, promises or certifies an outcome', !/\bguarantee|\bcertif|\bwe will ensure|\bpromis/i.test(everyText));
ok('language: never claims to know how old the site is or when it was last touched',
  !/not been (?:rebuilt|updated|touched)|years out of date|hasn't been updated/i.test(everyText));
ok('language: never states the page is broken, failing or non-functional on mobile',
  !/\bis broken\b|\bdoes not work on\b|\bunusable\b|\bnot mobile[- ]friendly\b/i.test(everyText));
ok('language: no finding claims a rendered measurement it never took',
  !/we measured|pixels wide on your phone|overlaps|tap targets? (?:are|were)/i.test(everyText));
ok('confidence: every finding that depends on CSS we did not fetch is "likely", never "detected"',
  everyFinding.filter((f) => ['mobile.fixed_width_layout', 'mobile.tiny_text', 'mobile.legacy_table_layout', 'mobile.no_click_to_call'].includes(f.code))
    .every((f) => f.confidence === 'likely'));
ok('confidence: only the viewport findings — readable straight off the tag — are "detected"',
  everyFinding.filter((f) => f.confidence === 'detected')
    .every((f) => f.code.startsWith('mobile.no_viewport') || f.code.startsWith('mobile.viewport') || f.code === 'mobile.zoom_disabled'));
ok('honesty: no_viewport says the tag is absent from the whole file, not just the head',
  /anywhere else in the file/i.test(get(noViewport, 'mobile.no_viewport')?.detail ?? ''));
ok('honesty: legacy_table_layout hedges on the stylesheet it could not read',
  /cannot read/i.test(get(nested, 'mobile.legacy_table_layout')?.detail ?? ''));

console.log(`${fail === 0 ? '✓' : '✗'} mobileScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
