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

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL PASS — every case below was a real WRONG BLOCK or a false sentence when it was written.
// A wrong block costs the prospect the best demo we had, so each of these is a page that renders fine
// (or renders as well as it ever would) and must not be withheld for the reason named.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

// ── An unescaped `<` in ordinary copy is text, not a tag ──────────────────────────────────────────
// `/<[^>]*>/` ate from the `<` to the next `>` — i.e. the whole rest of the page — so a page full of
// copy measured 69 characters and was BLOCKED as effectively empty while a browser rendered it all.
const ltProse = renderQa(doc({ text: `Pipes < 2 inches are our specialty. ${FILLER}` }));
ok('a lone "<" in prose does not swallow the page into empty_body', !has(ltProse, 'render.empty_body'));
ok('a lone "<" in prose leaves the page clean', ltProse.issues.length === 0);
ok('several "<" comparisons in copy are still just copy',
  renderQa(doc({ text: `Pressure < 40 psi, flow < 2 gpm, temp < 120 F. ${FILLER}` })).issues.length === 0);
ok('"<" in copy does not hide a real {{token}} that follows it',
  has(renderQa(doc({ text: `Jobs < 1 hour. Welcome to {{business_name}}. ${FILLER}` })), 'render.placeholder_text'));
ok('a genuinely short page is still short after the fix',
  has(renderQa(doc({ text: 'Pipes < 2 inches are our specialty in Fresno.' })), 'render.empty_body'));

// ── A phone number or email in the copy IS a contact path ─────────────────────────────────────────
// "Call us: (559) 555-0142" with no tel: wrapper is routine generator output. Blocking it said
// something the page itself disproved, and threw the demo away. doc() always links its phone, so
// these need a fixture with no link, no mailto: and no <form> anywhere.
const unlinked = (contact: string): string =>
  `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Nolan and Sons</title></head><body><section class="hero"><h1>Fresno plumbing</h1><p>${FILLER}</p><p class="contact">${contact}</p></section></body></html>`;

const textPhone = renderQa(unlinked('Call us: (559) 555-0142 any day.'));
ok('an unlinked (559) 555-0142 in the copy is a contact path', !has(textPhone, 'render.no_contact_path'));
ok('and that page ships', textPhone.ok === true);
ok('an unlinked 559.555.0142 counts too',
  !has(renderQa(unlinked('Call 559.555.0142')), 'render.no_contact_path'));
ok('an unlinked 559-555-0142 counts too',
  !has(renderQa(unlinked('Call 559-555-0142')), 'render.no_contact_path'));
ok('an international +34 912 345 678 counts too',
  !has(renderQa(unlinked('Llame al +34 912 345 678')), 'render.no_contact_path'));
ok('an unlinked email address in the copy counts too',
  !has(renderQa(unlinked('Email jobs@nolanplumbing.com for a quote.')), 'render.no_contact_path'));
ok('but a page with only an address and a founding year still blocks',
  has(renderQa(unlinked('1400 Van Ness Ave, Fresno CA 93728, since 1998.')), 'render.no_contact_path'));
ok('and a price list is not a phone number either',
  has(renderQa(unlinked('Drains $189. Water heaters $1,450. Repipes from $6,900.')), 'render.no_contact_path'));
ok('a phone number that only exists inside a base64 data: URI does NOT count',
  has(renderQa(unlinked('<img src="data:image/gif;base64,R0lGOD5595550142aaaa" alt="dot">')), 'render.no_contact_path'));
ok('the message names the plain-text search it actually ran',
  /visible copy/.test(msg(noContact, 'render.no_contact_path')));
ok('the message no longer asserts the visitor has no way to make contact',
  !/no way to make contact/i.test(msg(noContact, 'render.no_contact_path')));

// ── Uppercase Spanish copy is not a TODO marker ───────────────────────────────────────────────────
// Uppercase alone never distinguished a leftover note from "REPARAMOS TODO TIPO DE FUGAS"; Spanish
// copy is set in caps as often as English is, and every one of those pages was blocked.
ok('trap: uppercase Spanish "TODO" in a headline is not a marker',
  !has(renderQa(doc({ text: `REPARAMOS TODO TIPO DE FUGAS. ABIERTO TODO EL DIA. ${FILLER}` })), 'render.placeholder_text'));
ok('trap: "TODO INCLUIDO" is not a marker',
  !has(renderQa(doc({ text: `TODO INCLUIDO EN EL PRECIO. ${FILLER}` })), 'render.placeholder_text'));
ok('a real "TODO:" note still blocks',
  has(renderQa(doc({ text: `TODO: write the services section. ${FILLER}` })), 'render.placeholder_text'));
ok('a real "TODO(marketing):" note still blocks',
  has(renderQa(doc({ text: `TODO(marketing) add testimonials. ${FILLER}` })), 'render.placeholder_text'));
ok('a real "TODO - " note still blocks',
  has(renderQa(doc({ text: `TODO - swap this hero image. ${FILLER}` })), 'render.placeholder_text'));

// ── A bracketed badge is not a bracketed placeholder ──────────────────────────────────────────────
ok('trap: "[ABIERTO 24 HORAS]" is a badge, not a slot',
  !has(renderQa(doc({ text: `[ABIERTO 24 HORAS] ${FILLER}` })), 'render.placeholder_text'));
ok('trap: "[OPEN 24 HOURS]" is a badge, not a slot',
  !has(renderQa(doc({ text: `[OPEN 24 HOURS] ${FILLER}` })), 'render.placeholder_text'));
ok('trap: "[HOTEL DELUXE]" does not match on TEL inside HOTEL',
  !has(renderQa(doc({ text: `[HOTEL DELUXE] ${FILLER}` })), 'render.placeholder_text'));
ok('[YOUR NAME] still blocks', has(renderQa(doc({ text: `Ask for [YOUR NAME]. ${FILLER}` })), 'render.placeholder_text'));
ok('[CITY] still blocks', has(renderQa(doc({ text: `Serving [CITY] since 1998. ${FILLER}` })), 'render.placeholder_text'));
ok('[BUSINESS_NAME] still blocks (snake_case is never copy)',
  has(renderQa(doc({ text: `Welcome to [BUSINESS_NAME]. ${FILLER}` })), 'render.placeholder_text'));

// ── CSS the author had already switched off is not a request ──────────────────────────────────────
ok('trap: a url() inside a CSS comment is not loaded',
  !has(renderQa(doc({ head: '<style>/* .hero{background:url(https://old.cdn.example.com/bg.jpg)} */ .hero{background:#111}</style>' })), 'render.external_resource'));
ok('a real url() sitting AFTER a CSS comment still blocks',
  has(renderQa(doc({ head: '<style>/* brand */ .h{background:url(https://cdn.example.com/a.jpg)}</style>' })), 'render.external_resource'));
ok('a real @import after a commented-out one still blocks',
  has(renderQa(doc({ head: '<style>/* old: url(https://a.example/x.css) */ @import url("https://fonts.googleapis.com/css2");</style>' })), 'render.external_resource'));

// ── `style=` in prose is prose ────────────────────────────────────────────────────────────────────
// The inline-style reader scanned the whole document for the characters `style=`, so an escaped code
// sample in <pre> — and even a sentence quoting one — was read as this page's own CSS.
ok('trap: an escaped code sample in <pre> is not this page\'s markup',
  !has(renderQa(doc({ body: '<pre><code>&lt;div style="background:url(https://example.com/a.png)"&gt;&lt;/div&gt;</code></pre>' })), 'render.external_resource'));
ok('trap: a sentence quoting a style attribute is not a style attribute',
  !has(renderQa(doc({ body: '<p>Write style="background:url(https://example.com/a.png)" in your CSS.</p>' })), 'render.external_resource'));
ok('trap: a <style> element written as a JS string is not this page\'s stylesheet',
  !has(renderQa(doc({ body: `<script>const s = '<style>.x{background:url("https://example.com/a.png")}</style>'; console.log(s);</script>` })), 'render.external_resource'));
ok('a real inline style="" with an external url still blocks',
  has(renderQa(doc({ body: '<div style="background:url(https://cdn.example.com/bg.jpg)"><p>hi</p></div>' })), 'render.external_resource'));
ok('a real UNQUOTED inline style with an external url still blocks',
  has(renderQa(doc({ body: '<div style=background:url(https://cdn.example.com/a.png)><p>hi</p></div>' })), 'render.external_resource'));

// ── An unterminated comment swallows the tail, exactly as a browser does ──────────────────────────
// The lazy regex simply failed to match, leaving a <link> the browser never sees, so the gate named
// a cross-origin load that does not happen. The page is still withheld — for the true reason.
const openComment = renderQa(doc({ body: '<!-- oops <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' }));
ok('an unterminated comment does not conjure an external resource', !has(openComment, 'render.external_resource'));
ok('an unterminated comment is still caught, as malformed markup', openComment.ok === false);
ok('and the reason given is the true one', has(openComment, 'render.unclosed_critical'));

// ── `</div>` inside a quoted attribute value is one element, not two closes ───────────────────────
ok('trap: a closing tag inside an attribute value does not skew the tally',
  !has(renderQa(doc({ body: '<div data-tpl="</div>"><p>hi</p></div>' })), 'render.unclosed_critical'));
ok('trap: same for </section> inside an attribute value',
  !has(renderQa(doc({ body: '<div data-tpl="</section>"><p>hi</p></div>' })), 'render.unclosed_critical'));

// ── A JSX-habit `<div/>` renders; truncation never produces one ───────────────────────────────────
ok('trap: a self-closed <div/> is not the truncation signature',
  !has(renderQa(doc({ body: '<div class="spacer"/>' })), 'render.unclosed_critical'));
ok('trap: a self-closed <section/> inside a real div is not either',
  !has(renderQa(doc({ body: '<div class="w"><section class="s"/><p>Fresno</p></div>' })), 'render.unclosed_critical'));
ok('a genuinely missing </div> still blocks',
  has(renderQa(doc({ body: '<section><div class="card"><h2>Repiping</h2></section>' })), 'render.unclosed_critical'));

// ── An image with an accessible name is not the failure we sell against ───────────────────────────
ok('trap: an <img aria-label> has a name, so the alt sentence would be false',
  !has(renderQa(doc({ body: '<img src="/t.jpg" aria-label="Our service truck">' })), 'render.img_missing_alt'));
ok('trap: an <img aria-labelledby> likewise',
  !has(renderQa(doc({ body: '<img src="/t.jpg" aria-labelledby="cap"><span id="cap">Our truck</span>' })), 'render.img_missing_alt'));
ok('an <img> with nothing at all still warns',
  has(renderQa(doc({ body: '<img src="/t.jpg">' })), 'render.img_missing_alt'));

// ── Markup shapes a competent page really ships ───────────────────────────────────────────────────
const MINIFIED = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Nolan and Sons Plumbing</title><style>body{margin:0}</style></head><body><section class=hero><h1>Fresno plumbing, answered on the first ring</h1><p>${FILLER}</p><a class=btn href=tel:+15595550142>Call (559) 555-0142</a></section><section class=svc><div class=card><h2>Drains</h2><p>We snake it and camera it.</p></div></section></body></html>`;
ok('minified markup with unquoted attributes and no whitespace is clean', renderQa(MINIFIED).issues.length === 0);

const UPPERCASE = `<!DOCTYPE HTML><HTML LANG="en"><HEAD><META CHARSET="utf-8"><META NAME="viewport" CONTENT="width=device-width"><TITLE>Nolan</TITLE></HEAD><BODY><SECTION><H1>Fresno plumbing</H1><P>${FILLER}</P><A HREF="tel:+15595550142">Call</A><IMG SRC="/t.jpg" ALT="Truck"></SECTION></BODY></HTML>`;
ok('uppercase tag and attribute names are clean', renderQa(UPPERCASE).issues.length === 0);

ok('single-quoted attributes are clean',
  renderQa(doc({ body: `<img src='/t.jpg' alt='Our truck'><div style='color:#111'><p>Fresno</p></div>` })).issues.length === 0);
ok('Alpine/Vue attribute syntax does not confuse the tag reader',
  renderQa(doc({ body: `<div x-data="{ open: false }" @click="open = !open" :class="{ 'on': open }"><p>Menu</p></div>` })).issues.length === 0);
ok('a <body> tag with a ">" inside an attribute is still a body',
  renderQa(`<!doctype html><html lang="en"><head><title>N</title><meta name="viewport" content="w"></head><body onload="if(2>1){go()}"><section><h1>Fresno plumbing</h1><p>${FILLER}</p><a href="tel:+15595550142">Call</a></section></body></html>`).issues.length === 0);
ok('CRLF line endings are clean',
  renderQa(doc({ body: '<div class="a">\r\n<p>Fresno and Clovis.</p>\r\n</div>' }).replace(/\n/g, '\r\n')).issues.length === 0);
ok('a BOM before the doctype is accepted', renderQa(`﻿${GOOD}`).issues.length === 0);
ok('an <img> inside a <template> and a data: srcset are clean',
  renderQa(doc({ body: '<template id="r"><div class="r"><img src="/x.jpg" alt="x"></div></template><img src="data:image/gif;base64,R0lGOD" srcset="data:image/gif;base64,R0lGOD 1x" alt="dot">' })).issues.length === 0);
ok('an <h1> named only by an inline <svg><title> is named',
  !has(renderQa(doc({ h1: false, body: '<h1><svg viewBox="0 0 10 10"><title>Nolan and Sons</title><path d="M0 0"/></svg></h1>' })), 'render.no_h1'));
ok('an <h1> named only by aria-labelledby is named',
  !has(renderQa(doc({ h1: false, body: '<h1 aria-labelledby="lede"></h1><p id="lede">Fresno plumbing</p>' })), 'render.no_h1'));
ok('an old-school <script><!-- … //--></script> wrapper is clean',
  renderQa(doc({ body: '<script>\n<!--\nvar a = 1;\n//-->\n</script>' })).issues.length === 0);
ok('a type="module" script is lexed and passes',
  renderQa(doc({ body: '<script type="module">const x = { a: 1 }; console.log(x);</script>' })).issues.length === 0);
ok('an importmap is data, not JavaScript',
  !has(renderQa(doc({ body: '<script type="importmap">{"imports":{"a":"/a.js"}}</script>' })), 'render.script_error'));
ok('a regex holding quotes and braces is not a brace imbalance',
  !has(renderQa(doc({ body: `<script>const re = /["'{}]/g; const s = "a".replace(re, ""); if (s) { console.log(s); }</script>` })), 'render.script_error'));

// ── Totality: no input crashes, everything gets a verdict ─────────────────────────────────────────
const HOSTILE: [string, string][] = [
  ['null bytes', doc({ text: `Fresno plumbing ${FILLER}` })],
  ['lone surrogate', doc({ text: `\uD800 ${FILLER}` })],
  ['astral plane + RTL', doc({ text: `🚰 مرحبا ${FILLER}` })],
  ['unterminated tag at EOF', `${doc()}<div class="`],
  ['unterminated quote in a tag', doc({ body: '<img src="/a.jpg alt="Truck">' })],
  ['nothing but "<"', '<'.repeat(500)],
  ['a bare doctype', '<!doctype html>'],
  ['deeply nested ${', doc({ body: `<script>const s = ${'`${'.repeat(5000)}</script>` })],
  ['1MB of one word', doc({ text: 'plumbing '.repeat(120000) })],
  ['angle brackets only', '<><><>'.repeat(1000)],
];
ok('no hostile input throws, and each gets a verdict', HOSTILE.every(([, html]) => {
  try {
    const r = renderQa(html);
    return typeof r.ok === 'boolean' && Array.isArray(r.issues) && r.issues.every((i) => typeof i.message === 'string');
  } catch { return false; }
}));
ok('every hostile input is deterministic',
  HOSTILE.every(([, html]) => JSON.stringify(renderQa(html)) === JSON.stringify(renderQa(html))));

// A 2MB well-formed page and a 1MB page of prose both have to finish inside an edge function's
// budget. Generous bound — this is a guard against a quadratic regression, not a benchmark.
const bigOk = doc({ body: '<div class="card"><p>Drain clearing in Fresno.</p></div>'.repeat(40000) });
const bigStart = Date.now();
renderQa(bigOk);
const bigMs = Date.now() - bigStart;
ok(`a 2MB well-formed page finishes promptly (${bigMs}ms)`, bigMs < 5000);
const proseStart = Date.now();
renderQa(doc({ text: 'Pipes < 2 inches. '.repeat(60000) }));
ok(`1MB of prose with stray "<" finishes promptly (${Date.now() - proseStart}ms)`, Date.now() - proseStart < 5000);
const cmtStart = Date.now();
renderQa(doc({ body: '<!-- note '.repeat(30000) }));
ok(`300KB of unterminated comments finishes promptly (${Date.now() - cmtStart}ms)`, Date.now() - cmtStart < 5000);

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
// Every message this gate can emit, gathered once so the language rules below are swept over the
// whole vocabulary rather than a hand-picked few. One input per declared code, plus the fixtures.
const EVERY_RESULT: RenderQa[] = [
  good, empty, fenced, noBody, fragment, blank, fonts, cdn, hotlink, cssUrl, protoRel, multi,
  unclosed, extraClose, noContact, brokenBrace, brokenTmpl, noVp, noTitle, thin, noH1, noAlt,
  kitchenSink, openComment, textPhone, ltProse,
  renderQa(doc({ text: `Lorem ipsum dolor sit amet. ${FILLER}` })),
  renderQa(unlinked('1400 Van Ness Ave, Fresno CA 93728.')),
  renderQa(doc({ body: '<div class="spacer"><p>x</p>' })),
];
const EVERY_MESSAGE = EVERY_RESULT.flatMap((r) => r.issues.map((i) => i.message));
ok('the sweep really covers every declared code',
  RENDER_QA_CODES.every((c) => EVERY_RESULT.some((r) => has(r, c))));
ok('no message ever makes a compliance, legal, or liability claim',
  EVERY_MESSAGE.every((m) => !/non-?compliant|\bADA\b|WCAG|lawsuit|sue[ds]?\b|illegal|unlawful|violat|liable|liability|penalt|\bfine[ds]?\b|\brisk\b/i.test(m)));
ok('no message ever guarantees or promises an outcome',
  EVERY_MESSAGE.every((m) => !/\bguarantee|\bpromis|\bensure[sd]?\b|\bwe will\b|\balways\b|\bnever fails?\b|\b100%/i.test(m)));
ok('no message claims to have fetched, loaded, or rendered anything',
  EVERY_MESSAGE.every((m) => !/\bwe (?:fetched|loaded|rendered|visited|tested|checked)\b|\bdead link\b|\b404\b|\blooks? (?:right|wrong|good|bad)\b/i.test(m)));
ok('no message asserts how the page appears to a visitor beyond what was counted',
  EVERY_MESSAGE.every((m) => !/renders effectively blank|appears blank|looks empty/i.test(m)));
ok('no message speculates about what a script was for',
  EVERY_MESSAGE.every((m) => !/motion or reveal|animation it drives/i.test(m)));
ok('every message is a single observational sentence with a full stop',
  EVERY_MESSAGE.every((m) => m.length > 20 && m.trim().endsWith('.')));
// Determinism swept over every adversarial input above, run interleaved so a sticky regex lastIndex
// or a mutated module-level pattern would show up as one run disagreeing with the next.
const ALL_INPUTS: string[] = [
  GOOD, MINIFIED, UPPERCASE, '', '<!doctype html>',
  doc(), doc({ text: `Pipes < 2 inches. ${FILLER}` }), doc({ text: `TODO: fix. ${FILLER}` }),
  doc({ text: `REPARAMOS TODO TIPO DE FUGAS. ${FILLER}` }), doc({ text: `[ABIERTO 24 HORAS] ${FILLER}` }),
  doc({ head: '<style>/* url(https://a.example/x.png) */ .h{background:#111}</style>' }),
  doc({ body: '<div data-tpl="</div>"><p>hi</p></div>' }), doc({ body: '<div class="spacer"/>' }),
  doc({ body: '<!-- oops <link rel="stylesheet" href="https://fonts.googleapis.com/x">' }),
  unlinked('Call us: (559) 555-0142'), unlinked('Fresno CA 93728'),
  ...HOSTILE.map(([, h]) => h),
];
const firstPass = ALL_INPUTS.map((h) => JSON.stringify(renderQa(h)));
const secondPass = ALL_INPUTS.map((h) => JSON.stringify(renderQa(h)));
const shuffled = [...ALL_INPUTS].reverse().map((h) => JSON.stringify(renderQa(h))).reverse();
ok('deterministic across every adversarial input, twice',
  firstPass.every((s, i) => s === secondPass[i]));
ok('deterministic regardless of the order inputs are scanned in',
  firstPass.every((s, i) => s === shuffled[i]));

ok('deterministic: the good page', JSON.stringify(renderQa(GOOD)) === JSON.stringify(renderQa(GOOD)));
ok('deterministic: the kitchen sink (no sticky regex state leaks between runs)',
  JSON.stringify(renderQa(kitchenSink.ok ? 'x' : GOOD)) === JSON.stringify(good));
ok('deterministic: repeated calls on the same broken input agree',
  JSON.stringify(renderQa(doc({ text: 'Lorem ipsum.' }))) === JSON.stringify(renderQa(doc({ text: 'Lorem ipsum.' }))));
ok('deterministic: empty input, twice', JSON.stringify(renderQa('')) === JSON.stringify(renderQa('')));

console.log(`${fail === 0 ? '✓' : '✗'} renderQa.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
