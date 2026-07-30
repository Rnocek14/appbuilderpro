// supabase/functions/_shared/conversionScan.verify.ts
// run: npx tsx supabase/functions/_shared/conversionScan.verify.ts
// Proves the conversion lens only ever reports what the markup really offers a customer: each
// finding fires when its signature is present, stays silent when the page gives the visitor a real
// way in, refuses to fire on a booking widget that is commented out or a form that exists only
// inside a <script> template, claims nothing on empty or app-shell input, and never puts a legal or
// compliance claim in an owner-facing string.

import { scanConversion, bookingPlatform, bookingLabel, CONV_CODES } from './conversionScan.ts';
import type { Finding, ScanResult } from './scanTypes.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.error(`  FAIL - ${name}`); }
};

const has = (r: ScanResult, code: string): boolean => r.findings.some((f) => f.code === code);
const get = (r: ScanResult, code: string): Finding | undefined => r.findings.find((f) => f.code === code);

// ── A brochure page with no way in at all: nav links, prose, nothing to press. ───────────────────
const dead = scanConversion(`
  <html lang="en"><body><h1>Acme Roofing</h1>
  <nav><a href="/about">About</a><a href="/gallery">Gallery</a></nav>
  <p>We have been roofing in Lake Geneva since 1998 — storm damage, tear-offs, gutters and skylights.</p>
  </body></html>`);
ok('dead: no_contact_path fires', has(dead, 'conv.no_contact_path'));
ok('dead: no_contact_path is high severity', get(dead, 'conv.no_contact_path')?.severity === 'high');
ok('dead: no_contact_path is "detected"', get(dead, 'conv.no_contact_path')?.confidence === 'detected');
ok('dead: no_booking fires', has(dead, 'conv.no_booking'));
ok('dead: no_booking is only "likely" (a widget can be mounted in JS)', get(dead, 'conv.no_booking')?.confidence === 'likely');
ok('dead: no_booking detail frames it as lost revenue, not a defect', /outside business hours/i.test(get(dead, 'conv.no_booking')?.detail ?? ''));
ok('dead: no_cta_above_fold fires (About/Gallery are not a next step)', has(dead, 'conv.no_cta_above_fold'));
ok('dead: phone_only does NOT fire (there is no phone link either)', !has(dead, 'conv.phone_only'));
ok('dead: no form findings when there is no form', !has(dead, 'conv.form_no_action') && !has(dead, 'conv.insecure_form'));
ok('dead: every finding is categorised conversion', dead.findings.every((f) => f.category === 'conversion'));

// ── The phone is the only door. ─────────────────────────────────────────────────────────────────
const phone = scanConversion(`
  <html><body><h1>Bill's Welding</h1><p>Mobile welding and on-site repairs, 24/7 callout across the county.</p>
  <a href="tel:+15550100100">Call (555) 010-0100</a></body></html>`);
ok('phone: phone_only fires', has(phone, 'conv.phone_only'));
ok('phone: phone_only is "detected" (the tel: link is really there)', get(phone, 'conv.phone_only')?.confidence === 'detected');
ok('phone: phone_only is med severity', get(phone, 'conv.phone_only')?.severity === 'med');
ok('phone: phone_only carries the tel: anchor as evidence', /tel:/.test(get(phone, 'conv.phone_only')?.evidence ?? ''));
ok('phone: no_contact_path stays silent — a tel: link IS a contact path', !has(phone, 'conv.no_contact_path'));
ok('phone: no_booking still fires (nothing catches an out-of-hours job)', has(phone, 'conv.no_booking'));
ok('phone: no_cta_above_fold silent — "Call (555)…" is the call to action', !has(phone, 'conv.no_cta_above_fold'));

// ── A page doing it right: form with an https action, a tel: link, a CTA at the top. ────────────
const good = scanConversion(`
  <html lang="en"><body>
  <header><a href="tel:+12625550143">Call us for a free estimate</a></header>
  <main><h1>Acme Roofing</h1><p>Roofing, siding and gutters in Lake Geneva since 1998.</p>
  <form action="https://acme.example/enquiry" method="post">
    <label for="nm">Your name</label><input id="nm" name="nm" type="text">
    <button type="submit">Request a quote</button>
  </form></main></body></html>`);
ok('good: claims nothing at all', good.findings.length === 0);
ok('good: no_contact_path silent', !has(good, 'conv.no_contact_path'));
ok('good: no_booking silent (a form catches the enquiry)', !has(good, 'conv.no_booking'));
ok('good: phone_only silent (there is a form as well)', !has(good, 'conv.phone_only'));
ok('good: form_no_action silent (the form has an action)', !has(good, 'conv.form_no_action'));
ok('good: insecure_form silent (the action is https)', !has(good, 'conv.insecure_form'));
ok('good: no_cta_above_fold silent', !has(good, 'conv.no_cta_above_fold'));
ok('good: limits still ship on a clean page', good.limits.length >= 3);

// ── A form with nowhere to go. ──────────────────────────────────────────────────────────────────
const noAction = scanConversion(`
  <html><body><h1>Contact</h1><p>Send us a note and we will get back to you within a day.</p>
  <a href="/contact">Contact us</a>
  <form><input type="text" name="name"><textarea name="msg"></textarea><button type="submit">Send</button></form>
  </body></html>`);
ok('noAction: form_no_action fires', has(noAction, 'conv.form_no_action'));
ok('noAction: counted', get(noAction, 'conv.form_no_action')?.count === 1);
ok('noAction: confidence is "needs_review", never "detected"', get(noAction, 'conv.form_no_action')?.confidence === 'needs_review');
ok('noAction: high severity', get(noAction, 'conv.form_no_action')?.severity === 'high');
ok('noAction: detail tells the reader to test a real submission', /test submission|one real test/i.test(get(noAction, 'conv.form_no_action')?.detail ?? ''));
ok('noAction: carries the form tag as evidence', /<form/i.test(get(noAction, 'conv.form_no_action')?.evidence ?? ''));
ok('noAction: a form still counts as a contact path', !has(noAction, 'conv.no_contact_path'));
ok('noAction: a form still suppresses no_booking', !has(noAction, 'conv.no_booking'));
ok('noAction: "Contact us" above the fold suppresses the CTA finding', !has(noAction, 'conv.no_cta_above_fold'));

// ── FALSE-POSITIVE TRAP: a plugin-wired form has no action and is NOT broken. ───────────────────
const wired = scanConversion(`
  <html><body><h1>Contact</h1><p>Drop us a line about your project and we will call you back.</p>
  <a href="/quote">Get a quote</a>
  <form class="wpcf7-form" method="post"><input name="your-name"><button>Send</button></form>
  </body></html>`);
ok('trap: a wpcf7 form with no action does not fire form_no_action', !has(wired, 'conv.form_no_action'));
const netlify = scanConversion(`<html><body><p>Say hello to the studio, we answer every message.</p><a href="/hi">Contact</a>
  <form netlify><input name="e"><button>Send</button></form></body></html>`);
ok('trap: a bare `netlify` attribute counts as wiring', !has(netlify, 'conv.form_no_action'));
const onsubmit = scanConversion(`<html><body><p>Say hello to the studio, we answer every message.</p><a href="/hi">Contact</a>
  <form onsubmit="send(event)"><input name="e"><button>Send</button></form></body></html>`);
ok('trap: an onsubmit handler counts as wiring', !has(onsubmit, 'conv.form_no_action'));
const dataAction = scanConversion(`<html><body><p>Say hello to the studio, we answer every message.</p><a href="/hi">Contact</a>
  <form data-action="track" data-id="hero"><input name="e"><button>Send</button></form></body></html>`);
ok('trap: data-action is a handler hint, not an action attribute', !has(dataAction, 'conv.form_no_action'));
ok('trap: data-action is never mistaken for an insecure action', !has(dataAction, 'conv.insecure_form'));

// ── FALSE-POSITIVE TRAP: a site-search box is not a contact form and not a broken one. ──────────
const searchOnly = scanConversion(`
  <html><body><h1>Rosa's Bakery</h1><p>Sourdough, rye and seasonal pastry, baked every morning on Main Street.</p>
  <form role="search"><input type="search" name="s"><button>Search</button></form></body></html>`);
ok('trap: a search form does not fire form_no_action', !has(searchOnly, 'conv.form_no_action'));
ok('trap: a search box is NOT counted as a way to reach the business', has(searchOnly, 'conv.no_contact_path'));
ok('trap: and the detail says so in plain words', /search box/i.test(get(searchOnly, 'conv.no_contact_path')?.detail ?? ''));

// ── A form posting in the clear. ────────────────────────────────────────────────────────────────
const insecure = scanConversion(`
  <html><body><h1>Get a quote</h1><p>Tell us about the job and we will price it up.</p>
  <a href="/quote">Request an estimate</a>
  <form action="http://acme.example/send.php" method="post"><input name="phone"><button>Send</button></form>
  </body></html>`);
ok('insecure: insecure_form fires', has(insecure, 'conv.insecure_form'));
ok('insecure: "detected" — the http:// action is right there', get(insecure, 'conv.insecure_form')?.confidence === 'detected');
ok('insecure: high severity', get(insecure, 'conv.insecure_form')?.severity === 'high');
ok('insecure: names the http:// target in the detail', /http:\/\/acme\.example/.test(get(insecure, 'conv.insecure_form')?.detail ?? ''));
ok('insecure: an https action never fires it', !has(good, 'conv.insecure_form'));
ok('insecure: a form WITH an action does not also fire form_no_action', !has(insecure, 'conv.form_no_action'));

// ── Booking platforms: fifteen vendors, each anchored on its own hostname. ──────────────────────
const bookedBy = (url: string) => bookingPlatform(`<html><body><a href="${url}">Book</a></body></html>`);
ok('booking: calendly', bookedBy('https://calendly.com/acme/intro') === 'calendly');
ok('booking: acuity', bookedBy('https://acme.acuityscheduling.com/schedule.php') === 'acuity');
ok('booking: jobber', bookedBy('https://clienthub.getjobber.com/booking/abc') === 'jobber');
ok('booking: housecallpro', bookedBy('https://book.housecallpro.com/book/Acme/abc') === 'housecall');
ok('booking: servicetitan', bookedBy('https://book.servicetitan.com/acme') === 'servicetitan');
ok('booking: square appointments', bookedBy('https://squareup.com/appointments/book/abc/acme') === 'square');
ok('booking: setmore', bookedBy('https://acme.setmore.com/') === 'setmore');
ok('booking: mindbody', bookedBy('https://widgets.healcode.com/sites/1234') === 'mindbody');
ok('booking: opentable', bookedBy('https://www.opentable.com/r/joes-diner') === 'opentable');
ok('booking: resy', bookedBy('https://resy.com/cities/ny/joes') === 'resy');
ok('booking: booksy', bookedBy('https://booksy.com/en-us/1234_acme-barbers') === 'booksy');
ok('booking: schedulicity', bookedBy('https://www.schedulicity.com/scheduling/ABC123') === 'schedulicity');
ok('booking: vagaro', bookedBy('https://www.vagaro.com/acmesalon') === 'vagaro');
ok('booking: simplybook', bookedBy('https://acme.simplybook.me/v2/') === 'simplybook');
ok('booking: youcanbook.me', bookedBy('https://acme.youcanbook.me/') === 'youcanbookme');
ok('booking: a script-embedded widget is found too',
  bookingPlatform(`<html><head><script src="https://assets.calendly.com/assets/external/widget.js"></script></head><body></body></html>`) === 'calendly');
ok('booking: ids are spelled as techFingerprint spells them (joinable without a lookup)',
  bookedBy('https://housecallpro.com/x') === 'housecall' && bookedBy('https://squareup.com/appointments/x') === 'square');
ok('booking: labels stay owner-facing', bookingLabel('housecall') === 'Housecall Pro' && bookingLabel('youcanbookme') === 'YouCanBook.me');
ok('booking: an unknown id falls back to itself rather than rendering blank', bookingLabel('nope') === 'nope');

// ── FALSE-POSITIVE TRAP: brand words and commented-out embeds are not booking platforms. ────────
ok('trap: prose naming a platform is not a booking path',
  bookingPlatform(`<html><body><p>We used to run bookings through Calendly and OpenTable.</p></body></html>`) === null);
ok('trap: a commented-out Calendly embed does not load, so it is not detected',
  bookingPlatform(`<html><head><!-- <script src="https://assets.calendly.com/x.js"></script> --></head><body></body></html>`) === null);
ok('trap: a link to a Facebook page is not a "book" call to action',
  has(scanConversion(`<html><body><h1>Rosa's Bakery</h1><p>Sourdough and rye, baked fresh on Main Street every morning.</p>
    <a href="https://facebook.com/rosas">Facebook</a></body></html>`), 'conv.no_cta_above_fold'));
ok('trap: no booking platform claimed on a page that has none', bookingPlatform(`<html><body><a href="/about">About</a></body></html>`) === null);

// ── A booked page: the booking widget suppresses both absence findings. ─────────────────────────
const booked = scanConversion(`
  <html><body><h1>Ridgeline Studio</h1><p>Portrait and product photography in the old mill building.</p>
  <a href="https://calendly.com/ridgeline/consult">Book a consultation</a>
  <a href="tel:+15550100200">(555) 010-0200</a></body></html>`);
ok('booked: no_booking silent when a platform is really linked', !has(booked, 'conv.no_booking'));
ok('booked: phone_only silent when a booking tool exists', !has(booked, 'conv.phone_only'));
ok('booked: no_contact_path silent', !has(booked, 'conv.no_contact_path'));
ok('booked: claims nothing at all', booked.findings.length === 0);

// ── FALSE-POSITIVE TRAP: markup that only exists inside <script> or a comment. ──────────────────
const scriptForm = scanConversion(`
  <html><body><h1>Studio</h1><p>Everything on this page is rendered by the bundle after load.</p>
  <a href="/work">Our work</a><a href="/studio">The studio</a>
  <script>const tpl = '<form action="http://old.example/x"><input name="e"><button>Send</button></form>';</script>
  </body></html>`);
ok('trap: a form inside a <script> string never fires form_no_action', !has(scriptForm, 'conv.form_no_action'));
ok('trap: an http:// action inside a <script> string never fires insecure_form', !has(scriptForm, 'conv.insecure_form'));
ok('trap: but it DOES suppress no_contact_path — quiet is the cheap mistake', !has(scriptForm, 'conv.no_contact_path'));

const commentedMailto = scanConversion(`
  <html><body><h1>Northline Joinery</h1><p>Bespoke kitchens and staircases, made to measure in the workshop.</p>
  <a href="/gallery">Gallery</a>
  <!-- <a href="mailto:hello@northline.example">Email us</a> -->
  </body></html>`);
ok('trap: a commented-out mailto: is not a contact path', has(commentedMailto, 'conv.no_contact_path'));

// ── A phone number printed as text is not a link, and the copy says exactly that. ───────────────
const textPhone = scanConversion(`
  <html><body><h1>Bell & Sons Plumbing</h1><p>Emergency call-outs across the valley, seven days a week.</p>
  <p>Tel: (555) 010-0300</p><a href="/about">About us</a></body></html>`);
ok('textPhone: no_contact_path still fires — "Tel:" in prose is not a tel: link', has(textPhone, 'conv.no_contact_path'));
ok('textPhone: the detail admits the number is on the page', /not a link/i.test(get(textPhone, 'conv.no_contact_path')?.detail ?? ''));
ok('textPhone: a real tel: link in a JS nav config would suppress it',
  !has(scanConversion(`<html><body><p>Bell & Sons Plumbing, emergency call-outs across the valley all week.</p>
    <a href="/about">About</a><script>window.NAV=[{"label":"Call","href":"tel:+15550100300"}]</script></body></html>`), 'conv.no_contact_path'));

// ── HONESTY: too little to see means nothing is claimed. ────────────────────────────────────────
const empty = scanConversion('');
ok('empty: zero findings', empty.findings.length === 0);
ok('empty: limits still ship (a quiet result is not a working funnel)', empty.limits.length >= 3);
ok('garbage: claims nothing', scanConversion('<<<>>> not html !!! ???').findings.length === 0);
ok('garbage: does not throw', (() => { try { scanConversion('<a href=<<'); return true; } catch { return false; } })());
ok('non-string input is tolerated', scanConversion(undefined as unknown as string).findings.length === 0);
const shell = scanConversion(`<html><body><div id="root"></div><script src="/assets/bundle.js"></script></body></html>`);
ok('shell: an empty app shell claims nothing about contact paths', shell.findings.length === 0);
ok('shell: specifically, no_contact_path is not invented from a build tool', !has(shell, 'conv.no_contact_path'));
ok('shell: but a real http:// form in a shell still reports',
  has(scanConversion(`<html><body><div id="root"></div><form action="http://x.example/p"><input name="e"></form></body></html>`), 'conv.insecure_form'));

// ── Above-the-fold is scoped: a CTA buried past 4,000 characters does not count. ────────────────
const buried = scanConversion(`<html><body><h1>Harbourside Dental</h1><p>${'Filler copy about the practice. '.repeat(160)}</p>
  <a href="/book">Book an appointment</a><form action="https://h.example/x"><input name="e"></form></body></html>`);
ok('buried: a CTA below 4,000 characters does not suppress the finding', has(buried, 'conv.no_cta_above_fold'));
ok('buried: it is only "likely" — source order is not screen position', get(buried, 'conv.no_cta_above_fold')?.confidence === 'likely');
ok('buried: and the detail says to check the rendered page', /rendered page/i.test(get(buried, 'conv.no_cta_above_fold')?.detail ?? ''));
ok('fold: an aria-labelled icon button counts as a CTA',
  !has(scanConversion(`<html><body><p>Harbourside Dental, open six days a week for check-ups and hygiene.</p>
    <button aria-label="Book an appointment"><svg></svg></button>
    <form action="https://h.example/x"><input name="e"></form></body></html>`), 'conv.no_cta_above_fold'));
ok('fold: a submit input labelled by its value counts as a CTA',
  !has(scanConversion(`<html><body><p>Harbourside Dental, open six days a week for check-ups and hygiene.</p>
    <form action="https://h.example/x"><input name="e"><input type="submit" value="Request an appointment"></form></body></html>`), 'conv.no_cta_above_fold'));

// ── The codes are the contract. ─────────────────────────────────────────────────────────────────
const emitted = new Set([dead, phone, noAction, insecure, searchOnly, buried].flatMap((r) => r.findings.map((f) => f.code)));
ok('codes: every emitted code is declared in CONV_CODES', [...emitted].every((c) => (CONV_CODES as readonly string[]).includes(c)));
ok('codes: all six declared codes are exercised above', CONV_CODES.length === 6 && emitted.size === 6);
ok('codes: every code is namespaced conv.*', CONV_CODES.every((c) => /^conv\.[a-z0-9_]+$/.test(c)));

// ── LIMITS must say the three things this scan cannot know. ─────────────────────────────────────
const limits = dead.limits.join(' ');
ok('limits: a JS-wired form cannot be verified from markup', /wired entirely in JavaScript/i.test(limits));
ok('limits: whether a submission reaches the business cannot be tested', /reaches the business cannot be tested/i.test(limits));
ok('limits: a tag-manager booking widget may not be visible', /tag manager/i.test(limits) && /booking/i.test(limits));
ok('limits: ship identically on every result', JSON.stringify(dead.limits) === JSON.stringify(empty.limits));

// ── LANGUAGE: no finding may assert compliance, illegality, or a legal outcome. ─────────────────
const allText = [dead, phone, noAction, insecure, searchOnly, textPhone, buried]
  .flatMap((r) => r.findings).map((f) => `${f.title} ${f.detail}`).join(' ');
ok('language: never asserts compliance or non-compliance', !/complian|\bADA\b|\bWCAG\b|conform/i.test(allText));
ok('language: never threatens legal consequence', !/sued|lawsuit|liabilit|illegal|unlawful|violat|penalt/i.test(allText));
ok('language: never estimates or guarantees money', !/guarantee|\$\d|\d+% more (?:leads|revenue|sales)/i.test(allText));
ok('language: every finding has a code, title and detail', allText.length > 0 &&
  [dead, phone, noAction, insecure].flatMap((r) => r.findings).every((f) => f.code && f.title && f.detail));
ok('evidence: snippets stay within the shared cap', [dead, phone, noAction, insecure, searchOnly]
  .flatMap((r) => r.findings).every((f) => (f.evidence?.length ?? 0) <= 300));

// ── Determinism. ────────────────────────────────────────────────────────────────────────────────
const sample = `<html><body><h1>Acme</h1><p>Roofing and gutters across the county since 1998, family run.</p>
  <a href="tel:+15550100100">Call us</a><form action="http://acme.example/x"><input name="e"></form></body></html>`;
ok('deterministic: scanConversion', JSON.stringify(scanConversion(sample)) === JSON.stringify(scanConversion(sample)));
ok('deterministic: bookingPlatform', bookingPlatform(sample) === bookingPlatform(sample));
ok('deterministic: repeated booking calls do not drift (no sticky /g state)',
  bookedBy('https://calendly.com/x') === 'calendly' && bookedBy('https://calendly.com/x') === 'calendly');

console.log(`${fail === 0 ? '✓' : '✗'} conversionScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
