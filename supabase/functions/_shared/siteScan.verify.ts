// supabase/functions/_shared/siteScan.verify.ts — the corroboration gates (npm run verify:sitescan).
//
// What must hold: an absence claim reaches the pitch ONLY when it held on every page read, nothing
// contact-shaped was left unread, and nothing on any page could mount the missing thing after load.
// A claim that passes is stated WITHOUT the JavaScript hedge; a claim that fails is dropped, never
// softened. Presence findings are untouched either way.

import { corroborateScan, couldInjectContent, describePages, siteScanTargets } from './siteScan.ts';
import { BOOKING_WIDGET_HEDGE, CONTACT_LINK_HEDGE, JS_INJECTION_HEDGE } from './conversionScan.ts';
import { claimsAreSafe } from '../../../src/lib/garvis/prospects/pitchFindings';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── fixtures: the page shapes the hunt actually meets ─────────────────────
const page = (body: string, head = '') =>
  `<html><head><title>Lakeside Plumbing</title>${head}</head><body>${body}</body></html>`;

// A 1998-era builder page: text, an unlinked phone number, no form, no tel:, no scripts at all.
const bareHome = page(`
  <h1>Lakeside Plumbing &amp; Sewer</h1>
  <p>Family owned since 1989. Serving Lake Geneva. Call (262) 555-0148 for a free estimate.</p>
  <img src="/truck.jpg">
  <a href="/services.html">Our services</a>
  <a href="/contact.html">Contact us</a>`);

// A contact page in the same shape: an address, the same unlinked number, still no way in.
const bareContact = page(`
  <h1>Contact</h1><p>724 Main St, Lake Geneva WI. Phone (262) 555-0148. Open Mon-Fri.</p>`);

// A contact page that HAS a working form — the page that falsifies every absence.
const formContact = page(`
  <h1>Contact</h1><form action="/send.php" method="post"><input name="name"><textarea name="msg"></textarea></form>`);

// A contact page whose only way in is a mailto: link.
const mailtoContact = page(`<h1>Contact</h1><p><a href="mailto:office@lakeside.example">Email us</a></p>`);

// A homepage whose one way in is a tap-to-call link.
const phoneHome = page(`
  <h1>Lakeside Plumbing</h1><p>Emergency service day and night.</p>
  <a href="tel:+12625550148">Call now</a> <a href="/contact.html">Contact</a>`);

// The same bare page, but carrying Google Tag Manager — a widget could arrive after load.
const gtmHome = bareHome.replace('</head>', `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script></head>`);

// An app shell: the real page is built in JavaScript we cannot see.
const spaContact = `<html><head></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;

// ── target discovery ──────────────────────────────────────────────────────
{
  const targets = siteScanTargets(bareHome, 'http://lakesideplumbingwi.com/');
  check('finds the linked contact page', targets.some((t) => t.endsWith('/contact.html')));
  check('a services page is not a target (text crawl covers it; no way-in lives there)', !targets.some((t) => t.includes('services')));

  const external = page(`<a href="https://facebook.com/lakeside/contact">Contact</a>`);
  check('an external "contact" link is never a target', siteScanTargets(external, 'http://x.example/').length === 0);

  const many = page(`<a href="/contact">Contact</a><a href="/book">Book</a><a href="/quote">Quote</a><a href="/estimate">Estimate</a>`);
  check('targets are capped at two', siteScanTargets(many, 'http://x.example/').length === 2);
  check('the contact page outranks the others', siteScanTargets(many, 'http://x.example/')[0].endsWith('/contact'));

  const pdf = page(`<a href="/contact.pdf">Contact sheet</a>`);
  check('a downloadable file is never a target', siteScanTargets(pdf, 'http://x.example/').length === 0);
  check('garbage base URL yields no targets, not a throw', siteScanTargets(bareHome, ':::').length === 0);
}

// ── the injection gate ────────────────────────────────────────────────────
{
  check('a script-free builder page could not inject', !couldInjectContent(bareHome));
  check('GTM means content could arrive after load', couldInjectContent(gtmHome));
  check('an app shell means content could arrive after load', couldInjectContent(spaContact));
  check('garbage input never throws', !couldInjectContent(undefined as unknown as string));
}

// ── gate 1: the claim must hold on every page read ────────────────────────
{
  const kept = corroborateScan([{ path: '/', html: bareHome }, { path: '/contact.html', html: bareContact }]);
  const noPath = kept.findings.find((f) => f.code === 'conv.no_contact_path');
  check('an absence that holds everywhere survives', !!noPath);
  check('the JavaScript hedge is REMOVED once it is ruled out', !noPath?.detail.includes(JS_INJECTION_HEDGE.trim()));
  check('the "only this one page was read" hedge is removed too', !noPath?.detail.includes('only this one page was read'));
  check('the corroborating page is named', /your contact page/.test(noPath?.detail ?? ''));
  check('the title says it held everywhere', /on any page we read$/.test(noPath?.title ?? ''));
  check('the no-tag-manager fact is stated', /no tag manager/.test(noPath?.detail ?? ''));

  const booking = kept.findings.find((f) => f.code === 'conv.no_booking');
  check('no_booking survives with its widget hedge removed', !!booking && !booking.detail.includes(BOOKING_WIDGET_HEDGE.trim()));
  check('no_booking is upgraded to detected — the stated reason for likely is gone', booking?.confidence === 'detected');
  check('every corroborated sentence passes the claim gate', kept.findings.every((f) => claimsAreSafe(`${f.title} — ${f.detail}`)));
  check('provenance lists both pages, homepage first', kept.pagesChecked[0] === '/' && kept.pagesChecked[1] === '/contact.html');

  const falsified = corroborateScan([{ path: '/', html: bareHome }, { path: '/contact.html', html: formContact }]);
  check('a contact page WITH a form kills every absence', !falsified.findings.some((f) => f.code.startsWith('conv.no_') || f.code === 'conv.phone_only'));
  check('presence findings survive the kill (missing alt is still missing)', falsified.findings.some((f) => f.code === 'a11y.img_missing_alt'));
}

// ── gate 2: an unread door means no claim ─────────────────────────────────
{
  const missed = corroborateScan([{ path: '/', html: bareHome }], ['http://lakesideplumbingwi.com/contact.html']);
  check('an unreachable contact page suppresses every absence', !missed.findings.some((f) => f.code === 'conv.no_contact_path' || f.code === 'conv.no_booking'));
  check('…but presence findings still pass', missed.findings.some((f) => f.code === 'mobile.no_viewport' || f.code === 'a11y.img_missing_alt'));
  check('the unread pages are reported', missed.unreached.length === 1);
}

// ── gate 3: possible injection means no claim ─────────────────────────────
{
  const gtm = corroborateScan([{ path: '/', html: gtmHome }, { path: '/contact.html', html: bareContact }]);
  check('GTM on any page suppresses every absence', !gtm.findings.some((f) => f.code === 'conv.no_contact_path' || f.code === 'conv.no_booking'));
  check('the injection flag is reported', gtm.jsInjection);

  const spa = corroborateScan([{ path: '/', html: bareHome }, { path: '/contact.html', html: spaContact }]);
  check('an app-shell page suppresses every absence', !spa.findings.some((f) => f.code === 'conv.no_contact_path'));
}

// ── phone_only: agreement across codes, contradiction across channels ─────
{
  const agreed = corroborateScan([{ path: '/', html: phoneHome }, { path: '/contact.html', html: bareContact }]);
  check('a no-way-in contact page corroborates "the phone is the only way in"', agreed.findings.some((f) => f.code === 'conv.phone_only'));

  const contradicted = corroborateScan([{ path: '/', html: phoneHome }, { path: '/contact.html', html: mailtoContact }]);
  check('a mailto: on the contact page kills "the phone is the only way in"', !contradicted.findings.some((f) => f.code === 'conv.phone_only'));
}

// ── single-page sites: the homepage IS the site ───────────────────────────
{
  const onePage = page(`<h1>Lakeside</h1><p>Call (262) 555-0148.</p>`);
  const solo = corroborateScan([{ path: '/', html: onePage }]);
  const f = solo.findings.find((x) => x.code === 'conv.no_contact_path');
  check('a one-page site still gets its corroborated claim', !!f);
  check('a one-page claim keeps its per-page title', /on the page$/.test(f?.title ?? ''));
  check('the JavaScript hedge is removed on a script-free one-pager too', !f?.detail.includes('worth opening the page to confirm'));
}

// ── shape + determinism ───────────────────────────────────────────────────
{
  check('empty input claims nothing', corroborateScan([]).findings.length === 0);
  check('garbage input never throws', corroborateScan(undefined as unknown as []).findings.length === 0);
  const a = corroborateScan([{ path: '/', html: bareHome }, { path: '/contact.html', html: bareContact }]);
  const b = corroborateScan([{ path: '/', html: bareHome }, { path: '/contact.html', html: bareContact }]);
  check('corroboration is deterministic', JSON.stringify(a) === JSON.stringify(b));
  check('describePages names and joins', describePages(['/contact', '/about-us']) === 'your contact page and your about page');
  check('describePages dedupes', describePages(['/contact', '/contact-us']) === 'your contact page');
  check('describePages handles empties', describePages([]) === '');
}

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} site-scan check(s) failed`);
