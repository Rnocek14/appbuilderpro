// supabase/functions/_shared/renderQa.verify.ts
// run: npx tsx supabase/functions/_shared/renderQa.verify.ts
// Proves the render gate blocks only what is really broken. A clean page produces nothing; each block
// fires on its own signature and stays silent when the page is fine; the patterns that would be a
// disaster to block on — an external URL in an <a href>, a commented-out <script src>, a `${}` inside
// a template literal, the Spanish word "todo", "XXXL" — are all refused; non-document input claims the
// one thing it can and stops; warns never withhold a page; and the whole thing is deterministic.

import { renderQa, renderQaReason, RENDER_QA_CODES } from './renderQa.ts';
import type { RenderQa } from './renderQa.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.error(`  FAIL - ${name}`); }
};

const has = (r: RenderQa, code: string): boolean => r.issues.some((i) => i.code === code);
const countOf = (r: RenderQa, code: string): number => r.issues.filter((i) => i.code === code).length;
const msg = (r: RenderQa, code: string): string => r.issues.find((i) => i.code === code)?.message ?? '';

// Enough real copy that the length floors are never the thing under test.
const FILLER = `Nolan and Sons has been the crew Fresno homeowners call when a water heater gives out on a
Sunday afternoon. We handle drain clearing, repiping, water heater replacement, and the slow leak under the
kitchen sink that has been going on for a month. Every visit starts with a plain explanation of what we found
and what it will cost, before a single tool comes out of the truck. No trip charge inside the city, and we
put the wall back the way we found it. Serving Fresno, Clovis, Sanger and the surrounding county, seven days
a week, with someone actually answering the phone rather than a service that takes a message and calls back
on Tuesday.`;

/** A well-formed, self-contained page. Every variant below changes exactly one thing about it. */
function doc(o: { head?: string; body?: string; text?: string; title?: string; viewport?: boolean; h1?: boolean } = {}): string {
  const title = o.title === undefined ? '<title>Nolan and Sons Plumbing</title>' : o.title;
  const vp = o.viewport === false ? '' : '<meta name="viewport" content="width=device-width, initial-scale=1">';
  const head = o.h1 === false
    ? '<p class="hed">Fresno plumbing, answered on the first ring</p>'
    : '<h1>Fresno plumbing, answered on the first ring</h1>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${vp}
${title}
${o.head ?? ''}
</head>
<body>
<section class="hero">
${head}
<p>${o.text ?? FILLER}</p>
<a href="tel:+15595550142">Call (559) 555-0142</a>
</section>
${o.body ?? ''}
</body>
</html>`;
}

// ── A realistic bespoke page, shaped the way the generator is told to write one: one inline <style>,
//    one inline IntersectionObserver script with a template literal, nested divs, a data: URI. ─────
const GOOD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nolan &amp; Sons Plumbing &mdash; Fresno</title>
<style>
  :root { --ink: #14181d; --accent: #b4531f; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: var(--ink); }
  .hero { background-image: url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="); padding: 6rem 1.5rem; }
  .card:hover { transform: translateY(-2px); }
</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <h1>Fresno plumbing, answered on the first ring</h1>
    <p>${FILLER}</p>
    <a class="btn" href="tel:+15595550142">Call (559) 555-0142</a>
  </div>
</header>
<section class="services">
  <div class="card"><h2>Drain clearing</h2><p>Kitchen, bath, main line. We snake it, camera it, and tell you plainly what we found before anything else happens.</p></div>
  <div class="card"><h2>Water heaters</h2><p>Repair or replacement, tank or tankless, hauled away and disposed of on the same visit.</p></div>
</section>
<section class="contact">
  <div class="wrap">
    <h2>Get a free, no-obligation quote</h2>
    <form action="/quote" method="post">
      <label for="phone">Your phone number</label>
      <input id="phone" name="phone" type="tel">
      <button type="submit">Request a callback</button>
    </form>
  </div>
</section>
<script>
  document.documentElement.classList.add('anim');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { if (e.isIntersecting) { e.target.classList.add('in'); } }
  }, { threshold: 0.15 });
  document.querySelectorAll('.card').forEach((el) => io.observe(el));
  setTimeout(() => { document.querySelectorAll('.card').forEach((el) => el.classList.add('in')); }, 2000);
  const label = \`\${document.title} is ready\`;
  console.log(label);
</script>
</body>
</html>`;

const good = renderQa(GOOD);
ok('good: ships', good.ok === true);
ok('good: claims nothing at all', good.issues.length === 0);
ok('good: reason line says so', renderQaReason(good) === 'no blocking render issues detected');
ok('good: minimal variant also clean', renderQa(doc()).issues.length === 0);

// ── render.not_html — and its terminality ────────────────────────────────────────────────────────
const empty = renderQa('');
ok('empty: does NOT ship (a gate that passes an empty string is worthless)', empty.ok === false);
ok('empty: claims exactly one thing', empty.issues.length === 1);
ok('empty: and that thing is not_html', empty.issues[0].code === 'render.not_html');

const fenced = renderQa('```html\n<!doctype html><html><body><h1>Hi</h1></body></html>\n```');
ok('fenced: a markdown code fence is not a document', has(fenced, 'render.not_html'));

const noBody = renderQa('<!doctype html><html><head><title>x</title></head></html>');
ok('no body: blocked', has(noBody, 'render.not_html'));
ok('no body: message names the missing <body>', /body/i.test(msg(noBody, 'render.not_html')));

const fragment = renderQa('<div>{{business_name}}<script src="https://cdn.example.com/a.js"></script></div>');
ok('fragment: not_html is terminal — one issue, not a pile', fragment.issues.length === 1);
ok('fragment: the one issue is not_html', fragment.issues[0].code === 'render.not_html');

ok('leading comment before the doctype is accepted', renderQa(`<!-- generated ${''} -->\n${GOOD}`).issues.length === 0);
ok('leading whitespace before the doctype is accepted', renderQa(`\n\n  ${GOOD}`).issues.length === 0);

// ── render.empty_body ────────────────────────────────────────────────────────────────────────────
const blank = renderQa('<!doctype html><html><head><title>Nolan</title></head><body><a href="tel:+15595550142">Call</a></body></html>');
ok('blank: empty_body blocks', has(blank, 'render.empty_body'));
ok('blank: does not ship', blank.ok === false);
ok('blank: thin_content is suppressed (one verdict per page about its length)', !has(blank, 'render.thin_content'));
ok('good: empty_body silent', !has(good, 'render.empty_body'));

// ── render.external_resource ─────────────────────────────────────────────────────────────────────
const fonts = renderQa(doc({ head: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' }));
ok('fonts: external stylesheet blocks', has(fonts, 'render.external_resource'));
ok('fonts: does not ship', fonts.ok === false);

const cdn = renderQa(doc({ body: '<script src="https://cdn.jsdelivr.net/npm/gsap"></script>' }));
ok('cdn: external <script src> blocks', has(cdn, 'render.external_resource'));

const hotlink = renderQa(doc({ body: '<img src="https://nolanplumbing.com/img/truck.jpg" alt="Our truck">' }));
ok('hotlink: the prospect OWN image URL blocks too (it is still cross-origin)', has(hotlink, 'render.external_resource'));

const cssUrl = renderQa(doc({ head: '<style>@import url("https://fonts.googleapis.com/css2?family=Inter");</style>' }));
ok('css: @import url() blocks', has(cssUrl, 'render.external_resource'));

const protoRel = renderQa(doc({ body: '<script src="//cdn.example.com/a.js"></script>' }));
ok('protocol-relative //host is absolute and blocks', has(protoRel, 'render.external_resource'));

const multi = renderQa(doc({
  head: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
  body: '<script src="https://cdn.jsdelivr.net/npm/gsap"></script><img src="https://example.com/a.jpg" alt="a">',
}));
ok('multi: three external refs aggregate into ONE issue', countOf(multi, 'render.external_resource') === 1);
ok('multi: and the message counts all three', /^3 absolute/.test(msg(multi, 'render.external_resource')));

// FALSE-POSITIVE TRAPS — none of these is a request the browser makes.
ok('trap: <a href="https://…"> is a link, not a resource',
  !has(renderQa(doc({ body: '<p><a href="https://www.yelp.com/biz/nolan-and-sons">Read our Yelp reviews</a></p>' })), 'render.external_resource'));
ok('trap: data: URI in CSS is exactly what self-contained means',
  !has(renderQa(doc({ head: '<style>.h{background:url(data:image/png;base64,iVBORw0KGgo=)}</style>' })), 'render.external_resource'));
ok('trap: relative and root-relative paths are fine',
  !has(renderQa(doc({ body: '<img src="/img/truck.jpg" alt="Our truck"><img src="./logo.svg" alt="Logo">' })), 'render.external_resource'));
ok('trap: a commented-out external script is not loaded',
  !has(renderQa(doc({ body: '<!-- <script src="https://cdn.jsdelivr.net/npm/gsap"></script> -->' })), 'render.external_resource'));
ok('trap: <img src="https://…"> inside a JS string is a string, not an image',
  !has(renderQa(doc({ body: '<script>const tpl = "<img src=\\"https://example.com/x.png\\">";</script>' })), 'render.external_resource'));
ok('trap: url(https://…) inside a JS string does not block',
  !has(renderQa(doc({ body: '<script>const css = "background:url(https://example.com/x.png)";</script>' })), 'render.external_resource'));
ok('trap: data-src is not src — a lazy-load attribute is not a fetch',
  !has(renderQa(doc({ body: '<script data-src="https://cdn.example.com/a.js">console.log(1);</script>' })), 'render.external_resource'));
ok('trap: rel="canonical" to an absolute URL is metadata, not a stylesheet',
  !has(renderQa(doc({ head: '<link rel="canonical" href="https://nolanplumbing.com/">' })), 'render.external_resource'));

// ── render.unclosed_critical ─────────────────────────────────────────────────────────────────────
const unclosed = renderQa(doc({ body: '<section><div class="card"><h2>Repiping</h2><p>Whole-home copper and PEX.</p></section>' }));
ok('unclosed: a missing </div> blocks', has(unclosed, 'render.unclosed_critical'));
ok('unclosed: message shows the counts', /div \(\d+ opening, \d+ closing\)/.test(msg(unclosed, 'render.unclosed_critical')));

const extraClose = renderQa(doc({ body: '<div class="wrap"><p>Serving Fresno and Clovis.</p></div></div>' }));
ok('extra </div> blocks too — it closes a parent early', has(extraClose, 'render.unclosed_critical'));

ok('trap: <div> inside a script string does not skew the tally',
  !has(renderQa(doc({ body: '<script>const row = "<div class=\\"r\\">";</script>' })), 'render.unclosed_critical'));
ok('trap: <div> inside an HTML comment does not skew the tally',
  !has(renderQa(doc({ body: '<!-- <div class="old-layout"> -->' })), 'render.unclosed_critical'));
ok('trap: <header> is not <head>, <division> is not <div>',
  !has(renderQa(doc({ body: '<header><p>Nolan and Sons</p></header>' })), 'render.unclosed_critical'));
ok('good: balanced page is silent', !has(good, 'render.unclosed_critical'));

// ── render.placeholder_text ──────────────────────────────────────────────────────────────────────
ok('lorem ipsum blocks', has(renderQa(doc({ text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${FILLER}` })), 'render.placeholder_text'));
ok('an unreplaced {{mustache}} blocks', has(renderQa(doc({ text: `Welcome to {{business_name}}. ${FILLER}` })), 'render.placeholder_text'));
ok('an uppercase TODO blocks', has(renderQa(doc({ text: `TODO: write the services section. ${FILLER}` })), 'render.placeholder_text'));
ok('a FIXME blocks', has(renderQa(doc({ text: `FIXME check the phone number. ${FILLER}` })), 'render.placeholder_text'));
ok('a 555-XXX-XXXX phone stub blocks', has(renderQa(doc({ text: `Call us at 555-XXX-XXXX today. ${FILLER}` })), 'render.placeholder_text'));
ok('a [BRACKETED PLACEHOLDER] blocks', has(renderQa(doc({ text: `Ask for [YOUR NAME] when you call. ${FILLER}` })), 'render.placeholder_text'));
ok('a "your text here" stub blocks', has(renderQa(doc({ text: `Your tagline here. ${FILLER}` })), 'render.placeholder_text'));
ok('placeholder issue names the pattern it saw', /lorem ipsum/i.test(msg(renderQa(doc({ text: `Lorem ipsum dolor sit amet. ${FILLER}` })), 'render.placeholder_text')));

ok('trap: the Spanish word "todo" is not a TODO marker',
  !has(renderQa(doc({ text: `Reparamos todo tipo de fugas, todo el día, todos los días. ${FILLER}` })), 'render.placeholder_text'));
ok('trap: "XXXL" is a size, not a marker',
  !has(renderQa(doc({ text: `Sizes from XS through XXXL are in stock. ${FILLER}` })), 'render.placeholder_text'));
ok('trap: ${} inside a script template literal is code, not copy',
  !has(renderQa(doc({ body: '<script>const label = `${document.title} is ready`; console.log(label);</script>' })), 'render.placeholder_text'));
ok('trap: {{token}} inside an HTML comment is invisible to the reader',
  !has(renderQa(doc({ body: '<!-- {{business_name}} was substituted above -->' })), 'render.placeholder_text'));
ok('trap: a short "[NEW]" badge is not a placeholder',
  !has(renderQa(doc({ text: `Tankless installs [NEW] are booking now. ${FILLER}` })), 'render.placeholder_text'));
ok('good: no placeholder text', !has(good, 'render.placeholder_text'));

// ── render.no_contact_path ───────────────────────────────────────────────────────────────────────
const noContact = renderQa(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Nolan</title></head><body><section><h1>Nolan and Sons Plumbing</h1><p>${FILLER}</p></section></body></html>`);
ok('no contact path blocks', has(noContact, 'render.no_contact_path'));
ok('no contact: does not ship', noContact.ok === false);
ok('a mailto: alone satisfies the contact path',
  !has(renderQa(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Nolan</title></head><body><section><h1>Nolan and Sons</h1><p>${FILLER}</p><a href="mailto:jobs@nolan.com">Email us</a></section></body></html>`), 'render.no_contact_path'));
ok('a <form> alone satisfies the contact path',
  !has(renderQa(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Nolan</title></head><body><section><h1>Nolan and Sons</h1><p>${FILLER}</p><form action="/quote"><input name="q"><button>Send</button></form></section></body></html>`), 'render.no_contact_path'));
ok('good: contact path found', !has(good, 'render.no_contact_path'));

// ── render.script_error ──────────────────────────────────────────────────────────────────────────
const brokenBrace = renderQa(doc({ body: '<script>function reveal() { if (window.IntersectionObserver) { go(); }</script>' }));
ok('unbalanced braces block', has(brokenBrace, 'render.script_error'));
ok('script_error message counts the unclosed brace', /unclosed/.test(msg(brokenBrace, 'render.script_error')));

// A backtick opened and never closed — the classic max_tokens truncation signature.
const brokenTmpl = renderQa(doc({ body: '<script>const label = `Call us on </script>' }));
ok('unterminated template literal blocks', has(brokenTmpl, 'render.script_error'));
ok('and it is named as such', /unterminated template literal/.test(msg(brokenTmpl, 'render.script_error')));

ok('trap: a regex containing braces is not a brace',
  !has(renderQa(doc({ body: '<script>const re = /[{]/; const zip = /\\d{5}/; if (re.test("x")) { console.log(zip); }</script>' })), 'render.script_error'));
ok('trap: braces inside strings and comments are not braces',
  !has(renderQa(doc({ body: '<script>/* } } } */ const s = "{{{"; const t = \'}}}\'; console.log(s, t); // }\n</script>' })), 'render.script_error'));
ok('trap: JSON-LD is data, not JavaScript',
  !has(renderQa(doc({ body: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber"}</script>' })), 'render.script_error'));
ok('trap: JSON-LD "https://schema.org" is not an external resource either',
  !has(renderQa(doc({ body: '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' })), 'render.external_resource'));
ok('trap: a nested ${} interpolation counts its braces once',
  !has(renderQa(doc({ body: '<script>const n = 2; const s = `a ${ n > 1 ? `${n} jobs` : "one job" } b`; console.log(s);</script>' })), 'render.script_error'));
ok('good: the real motion script is fine', !has(good, 'render.script_error'));

// ── Warnings — surfaced, never withheld ──────────────────────────────────────────────────────────
const noVp = renderQa(doc({ viewport: false }));
ok('no viewport warns', has(noVp, 'render.no_viewport'));
ok('no viewport still SHIPS (a warn never blocks)', noVp.ok === true);
ok('no viewport is severity warn', noVp.issues.find((i) => i.code === 'render.no_viewport')?.severity === 'warn');

const noTitle = renderQa(doc({ title: '<title>   </title>' }));
ok('an empty <title> warns', has(noTitle, 'render.no_title'));
ok('a missing <title> warns', has(renderQa(doc({ title: '' })), 'render.no_title'));
ok('good: title found', !has(good, 'render.no_title'));

const thin = renderQa(doc({ text: 'Nolan and Sons Plumbing serves Fresno and Clovis for drains, water heaters and repipes. Call any day of the week and someone will actually pick up the phone.' }));
ok('thin content warns', has(thin, 'render.thin_content'));
ok('thin content still ships', thin.ok === true);
ok('good: not thin', !has(good, 'render.thin_content'));

const noH1 = renderQa(doc({ h1: false }));
ok('no <h1> warns', has(noH1, 'render.no_h1'));
ok('no <h1> still ships', noH1.ok === true);
ok('good: h1 found', !has(good, 'render.no_h1'));
ok('an <h1> holding only a wordmark <img alt> counts as named',
  !has(renderQa(doc({ h1: false, body: '<h1><img src="/logo.svg" alt="Nolan and Sons"></h1>' })), 'render.no_h1'));

const noAlt = renderQa(doc({ body: '<img src="/img/truck.jpg"><img src="/img/crew.jpg"><img src="/img/van.jpg">' }));
ok('img with no alt warns', has(noAlt, 'render.img_missing_alt'));
ok('three altless images aggregate into ONE issue', countOf(noAlt, 'render.img_missing_alt') === 1);
ok('and the message counts all three', /^3 <img>/.test(msg(noAlt, 'render.img_missing_alt')));
ok('img missing alt still ships (it does not break rendering)', noAlt.ok === true);
ok('alt="" is correct markup for a decorative image and is not counted',
  !has(renderQa(doc({ body: '<img src="/img/texture.png" alt="">' })), 'render.img_missing_alt'));
ok('aria-hidden and role=presentation images are not counted',
  !has(renderQa(doc({ body: '<img src="/a.png" aria-hidden="true"><img src="/b.png" role="presentation">' })), 'render.img_missing_alt'));

// ── House rules: shape, language, determinism ────────────────────────────────────────────────────
const kitchenSink = renderQa(`<!doctype html>
<html><head></head><body><div><p>Lorem ipsum.</p>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<img src="https://example.com/a.jpg"><script>function f() {</script></body></html>`);
ok('kitchen sink: many things wrong, still at most one issue per code',
  RENDER_QA_CODES.every((c) => countOf(kitchenSink, c) <= 1));
ok('kitchen sink: every code emitted is a declared code',
  kitchenSink.issues.every((i) => (RENDER_QA_CODES as readonly string[]).includes(i.code)));
ok('kitchen sink: does not ship', kitchenSink.ok === false);
ok('kitchen sink: reason line lists the blocks only',
  renderQaReason(kitchenSink).split(' | ').length === kitchenSink.issues.filter((i) => i.severity === 'block').length);
ok('ok is exactly "no block issues"',
  [good, empty, fonts, noVp, thin, noAlt, kitchenSink].every((r) => r.ok === r.issues.every((i) => i.severity !== 'block')));
ok('every severity is block or warn',
  kitchenSink.issues.every((i) => i.severity === 'block' || i.severity === 'warn'));
ok('every message is a non-empty sentence',
  kitchenSink.issues.every((i) => i.message.length > 20 && i.message.trim().endsWith('.')));
ok('no message ever makes a compliance, legal, or liability claim',
  [good, empty, kitchenSink, noAlt, fonts, noContact, brokenBrace].every((r) =>
    r.issues.every((i) => !/non-?compliant|\bADA\b|WCAG|lawsuit|sue[ds]?\b|illegal|violat|liable|liability|penalt/i.test(i.message))));

ok('deterministic: the good page', JSON.stringify(renderQa(GOOD)) === JSON.stringify(renderQa(GOOD)));
ok('deterministic: the kitchen sink (no sticky regex state leaks between runs)',
  JSON.stringify(renderQa(kitchenSink.ok ? 'x' : GOOD)) === JSON.stringify(good));
ok('deterministic: repeated calls on the same broken input agree',
  JSON.stringify(renderQa(doc({ text: 'Lorem ipsum.' }))) === JSON.stringify(renderQa(doc({ text: 'Lorem ipsum.' }))));
ok('deterministic: empty input, twice', JSON.stringify(renderQa('')) === JSON.stringify(renderQa('')));

console.log(`${fail === 0 ? '✓' : '✗'} renderQa.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
