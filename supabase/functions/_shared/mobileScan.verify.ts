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

console.log(`${fail === 0 ? '✓' : '✗'} mobileScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
