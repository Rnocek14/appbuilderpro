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

console.log(`${fail === 0 ? '✓' : '✗'} a11yScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
