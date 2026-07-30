// supabase/functions/_shared/a11yScan.verify.ts
// run: npx tsx supabase/functions/_shared/a11yScan.verify.ts
// Proves the accessibility scan only claims what the markup shows: every code fires on a page that
// really has the barrier, stays silent on a page that does not, ignores markup inside <script> and
// comments, and claims nothing at all on empty input.

import { scanAccessibility, countA11yInstances, A11Y_CODES } from './a11yScan.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const codes = (html: string) => scanAccessibility(html).findings.map((f) => f.code);
const has = (html: string, code: string) => codes(html).includes(code);
const get = (html: string, code: string) => scanAccessibility(html).findings.find((f) => f.code === code);

// A well-built page: lang, title, alt text, real labels, named links and buttons, a skip link ahead
// of the nav, a clean heading outline, unique ids, a titled iframe. NOTHING may fire here.
const GOOD = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Riverside Dental — Book an appointment</title></head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <nav aria-label="Primary"><a href="/">Home</a><a href="/contact">Contact</a></nav>
  <main id="main">
    <h1>Riverside Dental</h1>
    <img src="/team.jpg" alt="Our team outside the clinic">
    <img src="/divider.png" alt="">
    <h2>Book a visit</h2>
    <form>
      <label for="email">Email</label>
      <input id="email" type="email" name="email">
      <label>Message <textarea name="msg"></textarea></label>
      <input type="hidden" name="csrf" value="abc">
      <button type="submit">Send</button>
    </form>
    <h3>Opening hours</h3>
    <iframe src="https://maps.example.com/embed" title="Map of the clinic"></iframe>
    <a href="/instagram"><img src="/ig.svg" alt="Instagram"></a>
    <button aria-label="Close"><span class="icon"></span></button>
  </main>
</body></html>`;
ok('good page: no findings at all', scanAccessibility(GOOD).findings.length === 0);
ok('good page: limits still shipped', scanAccessibility(GOOD).limits.length >= 4);

// A page with every barrier this scanner knows how to see.
const BAD = `<html>
<head></head>
<body>
  <nav><a href="/">Home</a></nav>
  <h1>Welcome</h1>
  <h3>Our services</h3>
  <img src="a.jpg">
  <form><input type="text" name="q"></form>
  <a href="/x"><span class="ico"></span></a>
  <button><span></span></button>
  <div tabindex="4">promo</div>
  <div id="dup"></div><div id="dup"></div>
  <iframe src="https://maps.example.com/e"></iframe>
</body></html>`;
for (const code of A11Y_CODES) ok(`bad page: ${code} fires`, has(BAD, code));
ok('bad page: instance count sums every finding', countA11yInstances(scanAccessibility(BAD)) === 11);

// 1.1.1 — alt="" is CORRECT for decorative images and must never be counted.
const IMGS = `<html lang="en"><head><title>T</title></head><body>
  <img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="A dog"></body></html>`;
ok('img: counts only the genuinely alt-less image', get(IMGS, 'a11y.img_missing_alt')?.count === 1);
ok('img: severity high, confidence detected, wcag 1.1.1',
  get(IMGS, 'a11y.img_missing_alt')?.severity === 'high'
  && get(IMGS, 'a11y.img_missing_alt')?.confidence === 'detected'
  && get(IMGS, 'a11y.img_missing_alt')?.wcag === '1.1.1');
ok('img: decorative-only page fires nothing',
  !has(`<html lang="en"><head><title>T</title></head><body><img src="x.png" alt=""></body></html>`, 'a11y.img_missing_alt'));

// 3.3.2 — three unlabelled controls; submit/hidden/aria-label/for/wrapping label all excluded.
const FORM = `<html lang="en"><head><title>T</title></head><body><form>
  <input type="text" name="a">
  <input type="submit" value="Go">
  <input type="hidden" name="h">
  <input type="image" src="go.png">
  <select name="b"><option>1</option></select>
  <textarea name="c"></textarea>
  <input type="text" id="d" aria-label="Search">
</form></body></html>`;
ok('input: counts the three unlabelled controls only', get(FORM, 'a11y.input_missing_label')?.count === 3);
ok('input: confidence is likely (frameworks wire labels at runtime)',
  get(FORM, 'a11y.input_missing_label')?.confidence === 'likely');
ok('input: <label for> binding suppresses the finding',
  !has(`<html lang="en"><head><title>T</title></head><body><label for="e">Email</label><input id="e" type="email"></body></html>`,
    'a11y.input_missing_label'));
ok('input: wrapping <label> suppresses the finding',
  !has(`<html lang="en"><head><title>T</title></head><body><label>Email <input type="email" name="e"></label></body></html>`,
    'a11y.input_missing_label'));
ok('input: title attribute suppresses the finding',
  !has(`<html lang="en"><head><title>T</title></head><body><input type="text" name="q" title="Search"></body></html>`,
    'a11y.input_missing_label'));

// 3.1.1 — language declaration.
ok('lang: missing lang fires', has(`<html><head><title>T</title></head><body>x</body></html>`, 'a11y.missing_lang'));
ok('lang: empty lang fires', has(`<html lang=""><head><title>T</title></head><body>x</body></html>`, 'a11y.missing_lang'));
ok('lang: declared lang does not fire', !has(GOOD, 'a11y.missing_lang'));
ok('lang: no count on a 0-or-1 finding', get(`<html><head><title>T</title></head><body>x</body></html>`, 'a11y.missing_lang')?.count === undefined);

// 2.4.2 — page title.
ok('title: absent <title> fires', has(`<html lang="en"><head></head><body>x</body></html>`, 'a11y.missing_title'));
ok('title: whitespace-only <title> fires', has(`<html lang="en"><head><title>   </title></head><body>x</body></html>`, 'a11y.missing_title'));
ok('title: an <svg><title> does not count as the document title',
  has(`<html lang="en"><head></head><body><svg><title>Icon</title></svg></body></html>`, 'a11y.missing_title'));
ok('title: real title does not fire', !has(GOOD, 'a11y.missing_title'));

// 2.4.4 — link purpose.
const LINKS = `<html lang="en"><head><title>T</title></head><body>
  <a href="/fb"><span class="icon-fb"></span></a>
  <a href="/about">About us</a>
  <a href="/tw" aria-label="Twitter"></a>
  <a href="/yt"><svg><title>YouTube</title></svg></a>
  <a href="/ig"><img src="i.png" alt="Instagram"></a>
  <a name="anchor"></a>
</body></html>`;
ok('link: counts only the icon-only link with no name', get(LINKS, 'a11y.empty_link')?.count === 1);
ok('link: confidence likely, wcag 2.4.4',
  get(LINKS, 'a11y.empty_link')?.confidence === 'likely' && get(LINKS, 'a11y.empty_link')?.wcag === '2.4.4');
ok('link: <a> with no href is not treated as a link',
  !has(`<html lang="en"><head><title>T</title></head><body><a name="top"></a></body></html>`, 'a11y.empty_link'));

// 4.1.2 — button name.
const BTNS = `<html lang="en"><head><title>T</title></head><body>
  <button></button>
  <button>Send</button>
  <button aria-label="Open menu"><span></span></button>
  <button><svg aria-label="Search"></svg></button>
  <button><svg><title>Close</title></svg></button>
</body></html>`;
ok('button: counts only the truly nameless button', get(BTNS, 'a11y.empty_button')?.count === 1);
ok('button: an inline <svg><title> counts as a name (no false positive on icon buttons)',
  !has(`<html lang="en"><head><title>T</title></head><body><button><svg><title>Close</title></svg></button></body></html>`,
    'a11y.empty_button'));

// 1.3.1 — heading outline.
ok('headings: h1 → h3 skip fires',
  has(`<html lang="en"><head><title>T</title></head><body><h1>a</h1><h3>b</h3></body></html>`, 'a11y.heading_skip'));
ok('headings: h1 → h2 → h3 does not fire',
  !has(`<html lang="en"><head><title>T</title></head><body><h1>a</h1><h2>b</h2><h3>c</h3></body></html>`, 'a11y.heading_skip'));
ok('headings: going back UP a rank (h3 → h2) is not a skip',
  !has(`<html lang="en"><head><title>T</title></head><body><h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2></body></html>`, 'a11y.heading_skip'));
ok('headings: counts each skip transition',
  get(`<html lang="en"><head><title>T</title></head><body><h1>a</h1><h3>b</h3><h2>c</h2><h5>d</h5></body></html>`,
    'a11y.heading_skip')?.count === 2);

// 2.4.3 — positive tabindex.
ok('tabindex: tabindex="3" fires',
  has(`<html lang="en"><head><title>T</title></head><body><div tabindex="3">x</div></body></html>`, 'a11y.positive_tabindex'));
ok('tabindex: 0 and -1 do not fire',
  !has(`<html lang="en"><head><title>T</title></head><body><div tabindex="0">x</div><a href="/" tabindex="-1">y</a></body></html>`,
    'a11y.positive_tabindex'));
ok('tabindex: FALSE-POSITIVE TRAP — data-tabindex is not tabindex',
  !has(`<html lang="en"><head><title>T</title></head><body><div data-tabindex="5">x</div></body></html>`, 'a11y.positive_tabindex'));

// 4.1.1 — duplicate ids.
ok('ids: a repeated id value fires with count 1 (one duplicated VALUE)',
  get(`<html lang="en"><head><title>T</title></head><body><p id="hero">a</p><p id="hero">b</p></body></html>`,
    'a11y.duplicate_id')?.count === 1);
ok('ids: unique ids do not fire',
  !has(`<html lang="en"><head><title>T</title></head><body><p id="a">a</p><p id="b">b</p></body></html>`, 'a11y.duplicate_id'));
ok('ids: FALSE-POSITIVE TRAP — repeated data-id is not a duplicate id',
  !has(`<html lang="en"><head><title>T</title></head><body><span data-id="same"></span><span data-id="same"></span></body></html>`,
    'a11y.duplicate_id'));
ok('ids: FALSE-POSITIVE TRAP — data-id must not shadow the real id',
  !has(`<html lang="en"><head><title>T</title></head><body><div data-id="z" id="one"></div><div data-id="z" id="two"></div></body></html>`,
    'a11y.duplicate_id'));

// 4.1.2 — iframe titles.
ok('iframe: untitled frame fires',
  has(`<html lang="en"><head><title>T</title></head><body><iframe src="https://m"></iframe></body></html>`, 'a11y.iframe_missing_title'));
ok('iframe: titled frame does not fire',
  !has(`<html lang="en"><head><title>T</title></head><body><iframe src="https://m" title="Map"></iframe></body></html>`,
    'a11y.iframe_missing_title'));
ok('iframe: zero-size tracking frame is not counted as a barrier',
  !has(`<html lang="en"><head><title>T</title></head><body><iframe src="https://px" width="0" height="0"></iframe></body></html>`,
    'a11y.iframe_missing_title'));

// 2.4.1 — skip link ahead of the nav.
ok('skip: nav with no skip link fires',
  has(`<html lang="en"><head><title>T</title></head><body><nav><a href="/">Home</a></nav></body></html>`, 'a11y.no_skip_link'));
ok('skip: a skip link before the nav suppresses it', !has(GOOD, 'a11y.no_skip_link'));
ok('skip: no <nav> at all means no claim either way',
  !has(`<html lang="en"><head><title>T</title></head><body><p>Hello</p></body></html>`, 'a11y.no_skip_link'));
ok('skip: confidence is needs_review',
  get(`<html lang="en"><head><title>T</title></head><body><nav><a href="/">Home</a></nav></body></html>`,
    'a11y.no_skip_link')?.confidence === 'needs_review');

// FALSE-POSITIVE TRAP: markup inside <script>, <noscript> and comments is never rendered, so it must
// never produce a finding about the page.
const TRAP = `<html lang="en"><head><title>Trap</title></head><body>
  <script>document.write('<img src="x.jpg"><button></button><a href="/a"></a><input type="text" name="q">');</script>
  <!-- <img src="y.jpg"> <input type="text" name="commented"> <iframe src="z"></iframe> -->
  <noscript><iframe src="https://gtm.example"></iframe></noscript>
  <style>.a::after{content:'<img src=q>'}</style>
  <p id="ok">Everything real on this page is fine.</p>
</body></html>`;
ok('trap: script/comment/noscript/style markup produces zero findings', scanAccessibility(TRAP).findings.length === 0);

// HONESTY: empty and garbage input claim nothing.
const empty = scanAccessibility('');
ok('empty: zero findings', empty.findings.length === 0);
ok('empty: limits still explain what was not seen', empty.limits.length >= 4);
ok('empty: says the markup was not a document', empty.limits.some((l) => /not look like a complete HTML document/i.test(l)));
ok('garbage: plain text claims nothing', scanAccessibility('hello world, this is not html').findings.length === 0);
ok('fragment: a bare <div> claims nothing about lang or title',
  scanAccessibility('<div class="widget">hi</div>').findings.length === 0);

// The limits every result must carry, in the operator's own words.
const lim = scanAccessibility(BAD).limits.join(' ');
ok('limits: names colour contrast as unseeable', /colour contrast/i.test(lim));
ok('limits: names keyboard / focus / screen-reader behaviour as untested', /keyboard operation, focus order/i.test(lim));
ok('limits: names JavaScript-injected content as invisible', /injected by JavaScript/i.test(lim));
ok('limits: says absence of findings is not conformance', /not evidence of conformance/i.test(lim));

// HONESTY: no finding may ever assert compliance, non-compliance or legal jeopardy.
const allProse = scanAccessibility(BAD).findings.map((f) => `${f.title} ${f.detail}`).join(' ');
ok('honesty: no finding claims compliance status', !/complian|conformance|ADA\b|lawsuit|sued|illegal|legal/i.test(allProse));
ok('honesty: every finding carries evidence or is a whole-document fact',
  scanAccessibility(BAD).findings.every((f) => f.evidence !== undefined || f.count === undefined));
ok('honesty: every finding is categorised accessibility with a wcag reference',
  scanAccessibility(BAD).findings.every((f) => f.category === 'accessibility' && !!f.wcag));

// Owner-facing copy has to agree with its own number — a finding that reads "1 element use" reads as
// machine spam and gets the whole message ignored, however true it is.
const TWO_TAB = `<html lang="en"><head><title>T</title></head><body><i tabindex="2">a</i><i tabindex="3">b</i></body></html>`;
ok('copy: singular tabindex detail reads "1 element uses"',
  /\b1 element uses\b/.test(get(BAD, 'a11y.positive_tabindex')?.detail ?? ''));
ok('copy: plural tabindex detail reads "2 elements use"',
  /\b2 elements use\b/.test(get(TWO_TAB, 'a11y.positive_tabindex')?.detail ?? ''));
ok('copy: singular tabindex title reads "1 element sets"', get(BAD, 'a11y.positive_tabindex')?.title === '1 element sets a positive tabindex');
ok('copy: plural tabindex title reads "2 elements set"', get(TWO_TAB, 'a11y.positive_tabindex')?.title === '2 elements set a positive tabindex');
ok('copy: singular iframe detail reads "carries"', /element carries no title/.test(get(BAD, 'a11y.iframe_missing_title')?.detail ?? ''));
ok('copy: singular heading skip reads "jumps a level once"', /jumps a level once\b/.test(get(BAD, 'a11y.heading_skip')?.detail ?? ''));
ok('copy: plural image detail reads "elements ... carry"',
  /2 <img> elements in the page source carry/.test(
    get(`<html lang="en"><head><title>T</title></head><body><img src="a"><img src="b"></body></html>`, 'a11y.img_missing_alt')?.detail ?? ''));

// Determinism.
ok('deterministic: same input, byte-identical result',
  JSON.stringify(scanAccessibility(BAD)) === JSON.stringify(scanAccessibility(BAD)));
ok('deterministic: good page too', JSON.stringify(scanAccessibility(GOOD)) === JSON.stringify(scanAccessibility(GOOD)));
ok('deterministic: empty input too', JSON.stringify(scanAccessibility('')) === JSON.stringify(scanAccessibility('')));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL PASS — every case below is markup a competent site really ships. A finding here is
// a false accusation sent to a stranger's inbox, which is the worst outcome this project has.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const D = (body: string) => `<!doctype html><html lang="en"><head><title>T</title></head><body>${body}</body></html>`;
const none = (name: string, html: string) => ok(name, scanAccessibility(html).findings.length === 0);

// ── A `>` inside a quoted attribute value does NOT end the tag ────────────────────────────────
// `onclick="if(a>b)"`, `data-target="ul > li"`, `alt="Small > Large"` are all legal HTML. A tag
// matcher that stops at the first `>` truncates the attribute list and then reports the attributes
// it never got to as missing — telling a site with perfectly good alt text that it has none.
none('FP: img with a `>` in an earlier attribute still counts its alt',
  D(`<img src="a.jpg" data-caption="Bread > Sourdough" alt="A sourdough loaf">`));
none('FP: input with a `>` in an earlier attribute still counts its aria-label',
  D(`<form><input type="text" data-rule="len>3" aria-label="Search"></form>`));
none('FP: textarea with a `>` in an earlier attribute still counts its aria-label',
  D(`<form><textarea data-max="n>10" aria-label="Message"></textarea></form>`));
none('FP: iframe with a `>` in an earlier attribute still counts its title',
  D(`<iframe src="/m" data-sel="div > iframe" title="Map of the clinic"></iframe>`));
ok('FP: <html> with a `>` in an earlier attribute still counts its lang',
  !has(`<!doctype html><html data-theme="a > b" lang="en"><head><title>T</title></head><body>x</body></html>`,
    'a11y.missing_lang'));
ok('FP: an onclick comparison does not truncate the tag',
  !has(D(`<form><input type="text" onchange="if(this.value.length>2)go()" aria-label="Postcode"></form>`),
    'a11y.input_missing_label'));
ok('evidence: a `>` inside an attribute value does not truncate the proof snippet',
  get(D(`<img src="a.jpg" data-caption="Bread > Sourdough">`), 'a11y.img_missing_alt')?.evidence
    === '<img src="a.jpg" data-caption="Bread > Sourdough">');

// ── An image can be named by something other than alt ─────────────────────────────────────────
none('FP: img named by aria-label is not "an image with no alt text"',
  D(`<img src="/logo.svg" aria-label="Riverside Dental logo">`));
none('FP: img named by aria-labelledby is not "an image with no alt text"',
  D(`<p id="cap">Our team outside the clinic</p><img src="/t.jpg" aria-labelledby="cap">`));

// ── Invisible images are not barriers ─────────────────────────────────────────────────────────
// A 1x1 display:none tracking pixel is on a large share of small-business pages. Counting it as
// "an image a screen reader announces by file name" is simply false, and the owner who views source
// finds a Facebook pixel and bins the whole email.
none('FP: a 1x1 display:none tracking pixel is not an image barrier',
  D(`<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1&ev=PageView">`));
none('FP: a bare 1x1 pixel with no inline style is not an image barrier',
  D(`<img src="https://px.example/p.gif" width="1" height="1">`));
none('FP: an img with the hidden attribute is not an image barrier', D(`<img src="p.gif" hidden>`));
none('FP: a zero-size img is not an image barrier', D(`<img src="s.gif" width="0" height="0">`));
none('FP: an img hidden with visibility:hidden is not an image barrier',
  D(`<img src="s.gif" style="visibility:hidden">`));
ok('a real content image with no alt STILL fires (suppression is not a blanket)',
  get(D(`<img src="/hero.jpg" width="1200" height="600">`), 'a11y.img_missing_alt')?.count === 1);
ok('a normal alt-less img with no dimensions STILL fires',
  has(D(`<img src="/hero.jpg">`), 'a11y.img_missing_alt'));

none('FP: a 1x1 tracking iframe is not a frame barrier',
  D(`<iframe src="https://px.example/f" width="1" height="1"></iframe>`));
none('FP: an iframe with the hidden attribute is not a frame barrier', D(`<iframe src="https://gtm" hidden></iframe>`));
ok('a real embedded map with no title STILL fires',
  has(D(`<iframe src="https://maps.example.com/embed" width="600" height="450"></iframe>`), 'a11y.iframe_missing_title'));

// ── "alt" is an attribute NAME, not a substring ───────────────────────────────────────────────
none('FP: a lazy-loader data-alt still suppresses the finding',
  D(`<img data-src="/a.jpg" data-alt="Our shopfront">`));
ok('the word "alt" in a file path does not count as alt text',
  has(D(`<img src="/img/alt-view.jpg">`), 'a11y.img_missing_alt'));
ok('the word "Alt" in a title attribute does not count as alt text',
  has(D(`<img src="/a.jpg" title="Alt view">`), 'a11y.img_missing_alt'));

// ── An attribute-looking string inside a VALUE is not an attribute ─────────────────────────────
none('FP: "id=" inside a URL path is not an id (no phantom duplicate id)',
  D(`<a href="/p/id=12">One</a><a href="/p/id=12">Two</a>`));
none('FP: "tabindex=" inside a URL path is not a tabindex',
  D(`<a href="/help/tabindex=3">Help</a>`));
none('FP: an attribute name glued to a quote is still read correctly',
  D(`<div data-x="y"id="one"></div><div data-x="y"id="two"></div>`));

// ── Skip links ────────────────────────────────────────────────────────────────────────────────
none('FP: a skip link as the first thing inside the nav still counts as a skip link',
  D(`<nav><a class="skip-link" href="#main">Skip to main content</a><a href="/">Home</a></nav><main id="main">x</main>`));
none('FP: a skip link inside a nav still counts when the page holds a length-changing uppercase char',
  D(`<h1>İSTANBUL</h1><nav><a class="skip-link" href="#main">Skip to content</a><a href="/">Home</a></nav><main id="main">x</main>`));
ok('skip: the detail says what was searched for, not that no such link exists',
  /wording this scan recognises|looked for/i.test(
    get(D(`<nav><a href="/">Home</a></nav>`), 'a11y.no_skip_link')?.detail ?? ''));

// ── <template> is an inert fragment, not part of the document outline ──────────────────────────
none('FP: headings inside a <template> are not part of the document heading order',
  D(`<h1>Riverside Dental</h1><template id="card"><h4>Card title</h4></template><h2>Book</h2>`));

// ── Markup a real framework ships ─────────────────────────────────────────────────────────────
none('FP: uppercase tags, unquoted and single-quoted attributes',
  `<!DOCTYPE HTML><HTML LANG=en><HEAD><TITLE>Shop</TITLE></HEAD><BODY><IMG SRC=a.jpg ALT='A dog'><LABEL FOR=q>Search</LABEL><INPUT ID=q TYPE=text></BODY></HTML>`);
none('FP: minified markup with no whitespace between tags',
  `<!doctype html><html lang="en"><head><title>X</title></head><body><img src=a.jpg alt=x><button aria-label="Menu"><svg></svg></button></body></html>`);
none('FP: XHTML self-closing void elements',
  `<html lang="en"><head><title>T</title></head><body><img src="a.jpg" alt="" /><label for="e">E</label><input type="text" id="e" /></body></html>`);
none('FP: a React shell with an empty root div claims nothing',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>App</title></head><body><div id="root"></div><script src="/main.js"></script></body></html>`);
none('FP: Bootstrap navbar toggler is a named button',
  D(`<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-expanded="false" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button>`));
none('FP: <picture> with a source and an alt-bearing img',
  D(`<picture><source srcset="a.webp" type="image/webp"><img src="a.jpg" alt="A cake"></picture>`));
none('FP: an inline svg <image> element is not an <img>', D(`<svg><image href="a.png"></image></svg>`));
none('FP: a role="img" svg with a <title> names its link',
  D(`<a href="/fb"><svg role="img" viewBox="0 0 24 24"><title>Facebook</title><path d="M0 0"/></svg></a>`));
none('FP: a button whose second svg carries the name',
  D(`<button><svg aria-hidden="true"><path/></svg><svg><title>Close</title></svg></button>`));
none('FP: an input named by aria-labelledby', D(`<span id="lbl">Email</span><input type="email" aria-labelledby="lbl">`));
none('FP: a select wrapped in a label with nested markup',
  D(`<label class="f"><span>Choose a branch</span><select name="s"><option>1</option></select></label>`));
none('FP: an svg sprite sheet with unique symbol ids',
  D(`<svg style="display:none"><symbol id="ico-a"></symbol><symbol id="ico-b"></symbol></svg><svg aria-hidden="true"><use href="#ico-a"></use></svg>`));

// An unclosed <a> swallows the next one, because the closing tag it pairs with belongs to the
// anchor after it. That loses a finding and can never invent one — which is the direction this
// scanner is allowed to be wrong in, and it is asserted here so the trade stays deliberate.
none('unclosed <a> under-counts rather than inventing a finding',
  D(`<a href="/a">Home<a href="/b"><span class="i"></span></a>`));
ok('once the markup closes properly the empty link is found',
  get(D(`<a href="/a">Home</a><a href="/b"><span class="i"></span></a>`), 'a11y.empty_link')?.count === 1);

// ── Malformed / hostile input must not throw and must not hang ────────────────────────────────
const survives = (name: string, html: string) => {
  try { scanAccessibility(html); ok(name, true); } catch (e) { ok(`${name} — threw ${e}`, false); }
};
survives('crash: unterminated tag and stray angle brackets',
  `<html lang="en"><head><title>T</title></head><body><img src="a  <p>3 < 5 and 6 > 2<a href="/x">`);
survives('crash: unbalanced quote runs to end of document', `<html lang="en"><body><img src="a.jpg alt=x></body></html>`);
survives('crash: null bytes and control characters', D(`<img src="a .jpg" alt="">`));
survives('crash: lone surrogate in an attribute value', D(`<img src="\uD800.jpg">`));
survives('crash: astral-plane text and RTL overrides', D(`<h1>\u{1F600}‮abc</h1><h3>\u{1F3E5}</h3>`));
survives('crash: 500k bare angle brackets', '<'.repeat(500000));
survives('crash: attribute soup of stray quotes, equals signs and slashes',
  `<html lang="en"><body><img """ === /// alt><input = "" ='' type=></body></html>`);
survives('crash: an attribute whose quote never closes', D(`<img src="a.jpg alt=x width=1`));
survives('crash: 50k deeply nested divs',
  D('<div>'.repeat(50000) + 'x' + '</div>'.repeat(50000)));

// A 1.3MB page of never-closed <a> tags is ordinary broken-CMS output. A tag matcher that rescans
// to end-of-document for every unclosed element goes quadratic and stalls the edge function.
const UNCLOSED = `<html lang="en"><head><title>T</title></head><body>` + `<a href="/x">link`.repeat(80000) + `</body></html>`;
const t0 = Date.now();
scanAccessibility(UNCLOSED);
const unclosedMs = Date.now() - t0;
ok(`perf: 80k unclosed <a> completes promptly (took ${unclosedMs}ms)`, unclosedMs < 4000);
const UNCLOSED_L = `<html lang="en"><head><title>T</title></head><body>` + `<label>x <input>`.repeat(40000) + `</body></html>`;
const t1 = Date.now();
scanAccessibility(UNCLOSED_L);
const labelMs = Date.now() - t1;
ok(`perf: 40k unclosed <label> completes promptly (took ${labelMs}ms)`, labelMs < 4000);

// ── Limits must name everything this scan structurally cannot see ─────────────────────────────
const lim2 = scanAccessibility(GOOD).limits.join(' ');
ok('limits: says only the one fetched page was looked at', /only the (single|one) page|this one page|other pages/i.test(lim2));
ok('limits: says content inside an <iframe> was not fetched', /inside an? <iframe>|inside those frames/i.test(lim2));
ok('limits: says alt text is checked for presence, not usefulness', /presence, not|actually describes/i.test(lim2));
ok('limits: says visibility depends on stylesheets it does not load', /stylesheet/i.test(lim2));

// ── Honesty across EVERY finding this scanner can emit, not just the ones on BAD ───────────────
const everyFinding = [
  ...scanAccessibility(BAD).findings,
  ...scanAccessibility(D(`<nav><a href="/">Home</a></nav>`)).findings,
  ...scanAccessibility(`<html><head></head><body><h1>a</h1></body></html>`).findings,
];
ok('honesty: nothing claims compliance, legality, guarantees or risk',
  everyFinding.every((f) => !/complian|conformance|ADA\b|WCAG-?compliant|lawsuit|sued|illegal|legal|guarantee|violat|penalt|fine[sd]?\b|must comply/i
    .test(`${f.title} ${f.detail}`)));
ok('honesty: every code is declared in A11Y_CODES', everyFinding.every((f) => (A11Y_CODES as readonly string[]).includes(f.code)));
ok('honesty: every confidence is one of the three contract values',
  everyFinding.every((f) => ['detected', 'likely', 'needs_review'].includes(f.confidence)));
ok('honesty: nothing counted at zero', everyFinding.every((f) => f.count === undefined || f.count > 0));
ok('honesty: evidence never exceeds the contract cap', everyFinding.every((f) => (f.evidence?.length ?? 0) <= 300));

// Determinism under the adversarial inputs too.
ok('deterministic: adversarial page is byte-identical across runs',
  JSON.stringify(scanAccessibility(D(`<img src="a" data-x="a>b"><nav><a href="/">H</a></nav>`)))
  === JSON.stringify(scanAccessibility(D(`<img src="a" data-x="a>b"><nav><a href="/">H</a></nav>`))));

console.log(`${fail === 0 ? '✓' : '✗'} a11yScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
