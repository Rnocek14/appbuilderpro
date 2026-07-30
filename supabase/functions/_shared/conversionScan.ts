// supabase/functions/_shared/conversionScan.ts
// The conversion lens of the deep scan: can a customer actually contact, book, or buy from this
// page? Pure + deterministic — the only import is the shared contract.
//
// Why this exists: of the five lenses this is the one an owner feels in the bank account. A missing
// alt attribute is abstract; "the only way to reach you is to phone during business hours, and 40%
// of the people who wanted to hire you were looking at this page at 9pm on a Sunday" is a number
// they can picture. It is also the lens where the evidence is easiest for them to check themselves —
// they open their own page and try to hire themselves, and either there is a way or there is not.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//  - It does not test that a form WORKS. Pressing send is a network event; we have bytes. A form can
//    be present, beautifully built, validated, and pointed at a mailbox nobody has opened since 2019,
//    and this scan reports nothing. Said out loud in `limits`, because the gap between "a form
//    exists" and "enquiries arrive" is where most of the real money is lost.
//  - It does not follow the tag manager. A booking widget injected by GTM, or mounted by a framework
//    after load, is invisible to a static read. "No booking platform detected" therefore means "we
//    did not see one in this page's HTML", never "this business cannot be booked". Also in `limits`.
//  - It does not read the rest of the site. A contact page one click away is not visible from here,
//    so every finding is scoped to THIS page and the copy says "on the page", never "on the site".
//  - It does not measure the fold. "Above the fold" is a screen position and we have source order.
//    The first 4,000 characters of the body is a proxy, and a rough one — which is exactly why that
//    finding carries 'likely' and tells the reader to look at the rendered page.
//  - It does not grade, score, or estimate lost revenue. It reports what a visitor can and cannot do.
//
// THE HONESTY RULE for this file specifically: absence is the whole subject here, and absence is the
// easiest thing in the world to be wrong about. So the bias runs one way throughout — every signal
// that would SUPPRESS a finding is matched generously (a form in a script template, a booking URL in
// a JS nav config, a phone number in an aria-label all count), and every signal that would FIRE one
// is matched strictly, from content with scripts and comments stripped. Telling a business it has no
// contact form when the form renders fine is the expensive mistake; being quiet about a page that
// might be fine is the cheap one. And where the page shows us too little to judge — an empty app
// shell, a fragment that is not really a document — we claim NOTHING and let `limits` speak.
//
// Runs in Deno (fetch-url) and under tsx (conversionScan.verify.ts) — the .ts extension on the
// import is required by Deno and harmless under tsx.

import {
  type Finding,
  type ScanResult,
  accessibleName,
  attr,
  elements,
  hasAttr,
  innerText,
  openTags,
  snippet,
  stripNonContent,
} from './scanTypes.ts';

/** Every code this scanner can emit. Exported so the report layer can enumerate without string-hunting. */
export const CONV_CODES = [
  'conv.no_contact_path',
  'conv.no_booking',
  'conv.phone_only',
  'conv.form_no_action',
  'conv.no_cta_above_fold',
  'conv.insecure_form',
] as const;

// ─── Booking platforms ───────────────────────────────────────────────────────────────────────────
// Anchored on the vendor's own HOSTNAME, never on the brand word. "We use Calendly for consults" is
// a sentence in a paragraph; `calendly.com/acme/intro` is a booking path a customer can walk down.
// The distinction is the whole difference between a fact and a guess.
//
// This table is a superset of techFingerprint.ts's BOOKING table and spells the shared ids exactly
// the same way ('housecall', 'square', not 'housecallpro'/'square_appointments'), so a caller can
// join `TechFingerprint.booking` and `bookingPlatform()` without a translation table. Same rule the
// tracking lens follows for 'ga'/'gtm'/'meta_pixel'.
//
// First match wins, so the order is the tie-break and must stay stable. No /g flags: these constants
// are reused across calls and a sticky lastIndex would make the scanner non-deterministic.
const BOOKING: [string, RegExp][] = [
  ['calendly', /calendly\.com/i],
  // Acuity was bought by Squarespace and now ships under both hostnames.
  ['acuity', /acuityscheduling\.com|squarespace-scheduling\.com|squarespacescheduling\.com/i],
  ['jobber', /getjobber\.com|clienthub\.getjobber|jobber\.com\/online-booking/i],
  ['housecall', /housecallpro\.com|book\.housecallpro|hcpapp\.com/i],
  ['servicetitan', /servicetitan\.com|servicetitan[-_](?:scheduler|booking|widget)/i],
  // Square sells a dozen products; only the appointments/booking paths are a booking platform. A
  // plain link to a Square online store is a storefront, and calling it a booking tool would be false.
  ['square', /squareup\.com\/appointments|book\.squareup\.com|square\.site\/book|squareup\.com\/book/i],
  ['setmore', /setmore\.com/i],
  // healcode.com is Mindbody's widget host — the id you see in the markup of most studio sites.
  ['mindbody', /mindbodyonline\.com|healcode\.com|mindbody\.io/i],
  ['opentable', /opentable\.com/i],
  ['resy', /resy\.com/i],
  ['booksy', /booksy\.com/i],
  ['schedulicity', /schedulicity\.com/i],
  ['vagaro', /vagaro\.com/i],
  ['simplybook', /simplybook\.(?:me|it|asia)/i],
  ['youcanbookme', /youcanbook\.me|youcanbookme\.com/i],
];

/** Owner-facing names, used only in `title`/`detail` copy. Ids stay machine-stable above. */
const BOOKING_LABELS: Record<string, string> = {
  calendly: 'Calendly',
  acuity: 'Acuity Scheduling',
  jobber: 'Jobber',
  housecall: 'Housecall Pro',
  servicetitan: 'ServiceTitan',
  square: 'Square Appointments',
  setmore: 'Setmore',
  mindbody: 'Mindbody',
  opentable: 'OpenTable',
  resy: 'Resy',
  booksy: 'Booksy',
  schedulicity: 'Schedulicity',
  vagaro: 'Vagaro',
  simplybook: 'SimplyBook.me',
  youcanbookme: 'YouCanBook.me',
};

/**
 * The markup a browser would actually load.
 *
 * We can NOT use stripNonContent() for booking detection: widgets arrive as `<script src="…">`, so
 * stripping script bodies would delete the only evidence there is. What we DO strip is HTML comments
 * — a commented-out Calendly embed does not load, and reporting it as a booking platform would be a
 * false fact about the business, which is the one outcome this codebase refuses.
 */
function loadedMarkup(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * The first booking/scheduling platform whose hostname is really in the page, or null.
 * Null means "we did not see one", never "there isn't one" — `limits` carries that sentence.
 */
export function bookingPlatform(html: string): string | null {
  const markup = loadedMarkup(typeof html === 'string' ? html : '');
  for (const [name, re] of BOOKING) if (re.test(markup)) return name;
  return null;
}

// ─── Attribute reading ───────────────────────────────────────────────────────────────────────────

/**
 * Strip framework-prefixed attributes so attr() cannot read a look-alike as the real thing.
 *
 * attr() anchors on `\b`, so asking it for `action` on `<form data-action="track">` matches inside
 * `data-action` and hands back "track" — which silently suppresses conv.form_no_action, or worse,
 * feeds conv.insecure_form a value that was never a form target. Same story for `href` vs
 * `data-href` and `id` vs `data-id`. So: blank out `data-`/`ng-`/`v-`/`x-`/`hx-`/`wire:` pairs first,
 * keeping the character that preceded them, then let attr() do the quoting exactly as it always does.
 *
 * The framework hints in HANDLER_ATTR are read from the RAW attribute string on purpose — there the
 * `data-` prefix is the signal, not the noise.
 */
function ownAttrs(attrs: string): string {
  return attrs.replace(/(^|[\s"'/])(?:data|ng|v|x|hx|wire)[-:][a-z0-9:._-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi, '$1 ');
}

/** One real attribute off an element, immune to the `data-` look-alikes above. */
function ownAttr(attrs: string, name: string): string | null {
  return attr(ownAttrs(attrs), name);
}

// ─── Forms ───────────────────────────────────────────────────────────────────────────────────────

interface FormEl { attrs: string; inner: string; raw: string }

/**
 * Every `<form>` in the RENDERED content — scripts, styles and comments already gone, so a form
 * inside a JS template literal or a commented-out block can never produce a finding about markup no
 * browser renders.
 *
 * elements() needs a closing tag. Real-world markup does not always have one, and a form we failed
 * to parse would be read as a form that is not there — an absence finding built on a parser bug. So
 * when the open-tag count disagrees we fall back to the open tags and treat the inner markup as
 * unknown, because unknown must never be read as evidence of anything.
 */
function forms(clean: string): FormEl[] {
  const closed = elements(clean, 'form');
  const opens = openTags(clean, 'form');
  if (closed.length === opens.length) return closed;
  return opens.map((t) => ({ attrs: t.attrs, inner: '', raw: t.raw }));
}

/**
 * A site-search box, which is not a way to reach a business.
 *
 * This matters in both directions. A search form must not suppress "no contact path" — a customer
 * cannot hire you through your own search box. And it must not FIRE conv.form_no_action either: a
 * search form with no action is the normal shape of a JS-filtered listing, not a broken enquiry form.
 */
function isSearchForm(f: FormEl): boolean {
  const own = ownAttrs(f.attrs);
  const marks = [attr(own, 'role') ?? '', attr(own, 'id') ?? '', attr(own, 'class') ?? '', attr(own, 'name') ?? ''].join(' ');
  if (/search/i.test(marks)) return true;
  // WordPress's default search field is `<input type="search" name="s">` and carries no other clue.
  return /type\s*=\s*["']?search|name\s*=\s*["']s["']/i.test(f.inner);
}

/**
 * Something in the form tag that says a script is listening.
 *
 * Matched generously, and every entry here only ever SUPPRESSES conv.form_no_action — the finding
 * that is hardest to be sure of and therefore the one carrying 'needs_review'. A loose pattern here
 * can only make us quieter, never wronger.
 */
const HANDLER_ATTR = /\bon(?:submit|click)\s*=|\bdata-(?:netlify|action|form|url|endpoint|ajax|hs-|wpcf7|submit|target|remote)|\bnetlify\b|\bhx-(?:post|get)\s*=|\bng-submit\b|\bwire:submit|\b(?:v-on:|@)submit|\bformaction\s*=/i;
/** Names a form plugin, an embedded form service, or a hand-rolled JS hook leaves on the element. */
const HANDLER_NAME = /wpcf7|gform|gravity|wpforms|ninja[-_]?form|mc4wp|hs-form|hsform|hbspt|hubspot|elementor[-_]?form|formspree|getform|formcarry|fabform|basin|jotform|typeform|tally|mailchimp|mc-field|klaviyo|convertkit|omnisend|ajax|js-|handler|remote|netlify/i;

function looksWiredUp(f: FormEl): boolean {
  // Netlify's wiring is a bare valueless attribute (`<form netlify>`), which only hasAttr can see.
  if (hasAttr(f.attrs, 'data-netlify') || hasAttr(f.attrs, 'netlify')) return true;
  if (HANDLER_ATTR.test(f.attrs)) return true;
  const names = `${ownAttr(f.attrs, 'id') ?? ''} ${ownAttr(f.attrs, 'class') ?? ''}`;
  return HANDLER_NAME.test(names);
}

// ─── Contact paths ───────────────────────────────────────────────────────────────────────────────

/**
 * A `mailto:`/`tel:` sitting in a LINK POSITION anywhere in the loaded markup — including inside the
 * JSON nav blobs that DIY builders ship their header and footer as, which a static read only ever
 * sees as script text. Used purely to suppress conv.no_contact_path.
 *
 * Anchored on `href`/`url`/`link` followed by `=` or `:` on purpose. A bare /tel:/ would match the
 * extremely common "Tel: (555) 010-0100" written as plain prose, and silencing the finding on a page
 * whose phone number cannot actually be tapped would defeat the point of having it.
 */
const LINKED_CONTACT = /(?:href|url|link)["']?\s*[=:]\s*["']?\s*(?:mailto:|tel:)/i;

/**
 * A phone number or an email address written as TEXT. Used only to make the wording of
 * conv.no_contact_path precise — never to fire or suppress a finding, which is why a loose match
 * here is harmless. Saying "there is no way to reach this business" about a page with the number
 * printed across the header would be false, so when we see one we say what we actually saw: it is
 * there, and it is not a link.
 */
const TEXT_PHONE = /(?:\+?\d{1,3}[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/;
const TEXT_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;

// ─── Call to action ──────────────────────────────────────────────────────────────────────────────

/** Source order is not screen position. 4,000 characters of body is a proxy for the fold, not a
 *  measurement — which is why the finding it feeds is 'likely' and says so in its own detail. */
const ABOVE_FOLD_CHARS = 4000;

/**
 * The call-to-action vocabulary: the words the spec names, plus the reservation and direct-purchase
 * verbs a restaurant or a shop actually puts on its hero button ("Reserve a table", "Shop now").
 * Every word added here can only SUPPRESS the finding, so the worst a generous list can do is make
 * us quieter about a page that might be fine.
 *
 * `\bbook\b` deliberately does not match "Facebook" — there is no word boundary inside it — which is
 * the one false positive this pattern would otherwise hand to every small business on earth.
 */
const CTA_NAME =
  /\b(?:call|book|booking|quote|estimate|schedule|scheduling|contact|request|appointment|appointments|consultation|consult|reserve|reservation|order|buy|shop|checkout|enquir\w*|inquir\w*|hire)\b|\bget\s+(?:started|a\s+quote|in\s+touch)\b|\b(?:talk|message|email)\s+(?:to\s+)?us\b/i;

/** The slice of the body a visitor most likely sees first. Falls back to the whole document when
 *  there is no <body> tag, because fragments are handed to this scanner too. */
function aboveFold(clean: string): string {
  const m = /<body\b[^>]*>/i.exec(clean);
  const start = m ? m.index + m[0].length : 0;
  return clean.slice(start, start + ABOVE_FOLD_CHARS);
}

/**
 * Is there anything in the top of the page a visitor could press to start the conversation?
 *
 * Deliberately over-inclusive: links, buttons, and submit inputs all count, and a `tel:`/`mailto:`
 * href counts whatever its label says, because a phone number IS the call to action on a trades
 * site and reporting "no call to action" over a big tap-to-call number would be plainly wrong.
 */
function hasCta(slice: string): boolean {
  for (const t of openTags(slice, 'a')) {
    // Checked on the open tag, not the closed element, so a link straddling the 4,000-character cut
    // still counts. Suppressing on the weaker signal is the safe direction.
    if (/^\s*(?:tel:|mailto:|sms:)/i.test(ownAttr(t.attrs, 'href') ?? '')) return true;
  }
  for (const a of elements(slice, 'a')) if (CTA_NAME.test(accessibleName(a.attrs, a.inner))) return true;
  for (const b of elements(slice, 'button')) if (CTA_NAME.test(accessibleName(b.attrs, b.inner))) return true;
  for (const i of openTags(slice, 'input')) {
    const type = (ownAttr(i.attrs, 'type') ?? '').toLowerCase();
    if (type !== 'submit' && type !== 'button') continue;
    // A submit input's label lives in its value attribute; an aria-label overrides it.
    if (CTA_NAME.test(`${ownAttr(i.attrs, 'value') ?? ''} ${attr(i.attrs, 'aria-label') ?? ''}`)) return true;
  }
  return false;
}

// ─── The "we cannot see enough to judge" gate ────────────────────────────────────────────────────

/** The mount points single-page apps leave behind when the real page is assembled in JavaScript. */
const SPA_MOUNT = /<(?:div|main|section)\b[^>]*\bid\s*=\s*["'](?:root|app|__next|__nuxt|__gatsby|q-app|svelte)["']/i;
/** Enough of a tag vocabulary to say "this is a page", so garbage input never gets an opinion. */
const LOOKS_LIKE_HTML = /<(?:html|body|div|main|section|article|header|footer|nav|p|h[1-6]|a|form|span|ul|table|img)\b/i;

/**
 * True when the page shows too little for an ABSENCE to mean anything.
 *
 * This is the honesty rule in its most literal form. A React app that ships `<div id="root"></div>`
 * really does have no form, no tel: link and no booking widget in its HTML — and saying so would be
 * a statement about a build tool, not about a business. So when there is nothing to look at we look
 * at nothing and say nothing; `limits` already carries the sentence that explains why.
 *
 * Findings that trace to something really PRESENT (an http:// form action, a form with no
 * destination) are never gated by this — they are true whatever else the page does or does not show.
 */
function tooLittleToJudge(clean: string, bodyText: string, controls: number): boolean {
  if (!LOOKS_LIKE_HTML.test(clean)) return true;              // not a document — nothing to judge
  if (SPA_MOUNT.test(clean) && bodyText.length < 200) return true; // an app shell, not a page
  return !bodyText && controls === 0;                          // rendered nothing at all
}

/** The visible text of the body, or of the whole fragment when there is no <body> pair. */
function bodyTextOf(clean: string): string {
  const body = innerText(clean, 'body');
  if (body !== null) return body;
  return clean.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Keeps the owner-facing prose grammatical at a count of one. A finding that reads "1 form carry no
// action" makes a true statement look automated, and an automated-looking true statement gets deleted.
const s = (n: number) => (n === 1 ? '' : 's');
const v = (n: number, one: string, many: string) => (n === 1 ? one : many);

// The limits ship with every result, including an empty one. They are not findings — they are the
// standing statement of what a static read of one page cannot see, so nobody downstream mistakes a
// quiet result for a working sales funnel.
const LIMITS: string[] = [
  'A form wired entirely in JavaScript cannot be verified from markup. A React, Webflow or embedded-widget form often carries no action attribute at all and is submitted by a script, so a form that looks unwired here may work perfectly in a browser.',
  'Whether a submitted form actually reaches the business cannot be tested from a page scan. A form can be present, well built, and pointed at a mailbox nobody has opened in years — this scan would report nothing.',
  'Booking widgets loaded by a tag manager, or mounted by JavaScript after the page loads, may not be visible here. "No booking platform detected" means none was seen in this page\'s HTML, not that the business cannot be booked.',
  'Only this one page was read. A contact page, a booking page or a phone number elsewhere on the site is not visible from here.',
  'A phone number or email address set inside an image, or written as plain text with no tel:/mailto: link, cannot be tapped on a phone and is not counted as a link — though a person reading the page can still use it.',
];

/**
 * Scan one page's HTML for the paths a customer has to contact, book, or buy.
 *
 * Pure and deterministic. Empty, garbage or app-shell input claims nothing: zero findings, limits
 * unchanged — because "we saw no way to contact this business" and "there is no way to contact this
 * business" are different sentences, and only one of them is ever true from bytes alone.
 */
export function scanConversion(html: string): ScanResult {
  const raw = typeof html === 'string' ? html : '';
  // Markup checks that must reflect what a visitor can really see run against `clean`; the generous
  // suppression checks run against `markup`, which keeps script bodies (a builder's nav config lives
  // there) but drops comments (commented-out markup does not load).
  const clean = stripNonContent(raw);
  const markup = loadedMarkup(raw);

  const findings: Finding[] = [];

  const allForms = forms(clean);
  const contactForms = allForms.filter((f) => !isSearchForm(f));
  // A <form> that survives only inside a <script> template is not something we can point at, but it
  // is strong evidence one renders. It suppresses; it never fires.
  const scriptBorneForm = allForms.length === 0 && /<form\b/i.test(markup);
  const hasContactForm = contactForms.length > 0 || scriptBorneForm;

  const anchors = openTags(clean, 'a');
  const telTag = anchors.find((t) => /^\s*tel:/i.test(ownAttr(t.attrs, 'href') ?? ''));
  const hasLinkedContact = LINKED_CONTACT.test(markup);

  const booking = bookingPlatform(raw);

  const bodyText = bodyTextOf(clean);
  const controls = anchors.length + openTags(clean, 'button').length + allForms.length;
  const blind = tooLittleToJudge(clean, bodyText, controls);

  // ── No contact path at all ─────────────────────────────────────────────────────────────────────
  // The strongest thing this lens can say, so it is hedged everywhere it can be without weakening
  // it: a mailto: or tel: anywhere in the loaded markup suppresses it, a form anywhere suppresses
  // it, and an unlinked number in the text changes the sentence rather than the verdict.
  if (!blind && !hasContactForm && !hasLinkedContact) {
    const textPhone = TEXT_PHONE.test(bodyText);
    const textEmail = TEXT_EMAIL.test(bodyText);
    let detail =
      'This page has no <form>, no mailto: email link and no tel: phone link anywhere in its HTML, ' +
      'so there is nothing on it a visitor can fill in or tap to start a conversation.';
    if (allForms.length > contactForms.length) {
      detail += ' The one form on the page is a site-search box, which is not a way to reach the business.';
    }
    if (textPhone) {
      detail += ' A phone number does appear in the page text, but it is not a link — on a phone it cannot be tapped to dial, and it cannot be copied by anything that reads the page automatically.';
    }
    if (textEmail) {
      detail += ' An email address appears in the page text but is not a mailto: link.';
    }
    if (!textPhone && !textEmail) {
      detail += ' No phone number or email address was found written in the page text either.';
    }
    findings.push({
      code: 'conv.no_contact_path',
      category: 'conversion',
      severity: 'high',
      confidence: 'detected',
      title: 'No contact form, email link or phone link found on the page',
      detail,
    });
  }

  // ── The phone is the only door ─────────────────────────────────────────────────────────────────
  // Requires a real tel: anchor in the content, not a generous markup-wide match: this finding says
  // "a phone link exists" out loud, so it has to be one we can actually point at.
  if (!blind && telTag && !hasContactForm && !booking) {
    findings.push({
      code: 'conv.phone_only',
      category: 'conversion',
      severity: 'med',
      confidence: 'detected',
      title: 'The phone is the only way in — no form and no booking tool on the page',
      detail:
        'The page links a phone number (tel:) but carries no <form> and no scheduling or booking tool. ' +
        'Anyone who cannot talk right now — at work, on a job site, at 9pm with the kids down — has no ' +
        'second option, and there is no record of the enquiry afterwards to follow up on.',
      evidence: snippet(telTag.raw),
    });
  }

  // ── Nothing to catch an out-of-hours enquiry ───────────────────────────────────────────────────
  if (!blind && !booking && !hasContactForm) {
    findings.push({
      code: 'conv.no_booking',
      category: 'conversion',
      severity: 'med',
      // 'likely', never 'detected': this is an absence, and a widget mounted by a tag manager or by
      // JavaScript after load would be invisible to us. The detail says so rather than hiding it.
      confidence: 'likely',
      title: 'No booking or scheduling tool, and no form, on the page',
      detail:
        'No booking or scheduling platform was detected in this page\'s HTML and the page has no <form>. ' +
        'Enquiries that arrive outside business hours — evenings and weekends, when people actually sit ' +
        'down to sort a job out — have nowhere to land, so they go to whoever can be reached instead. ' +
        'A booking widget loaded by a tag manager, or mounted after page load, would not be visible here.',
    });
  }

  // ── A form that may submit nowhere ─────────────────────────────────────────────────────────────
  // The weakest of the form findings and marked as such. Search boxes are excluded, anything that
  // smells of a handler is excluded, and the detail tells the reader exactly which check to run.
  const unwired = contactForms.filter((f) => ownAttr(f.attrs, 'action') === null && !looksWiredUp(f));
  if (unwired.length) {
    const n = unwired.length;
    findings.push({
      code: 'conv.form_no_action',
      category: 'conversion',
      severity: 'high',
      confidence: 'needs_review',
      title: `${n} form${s(n)} with no submit destination in the markup`,
      detail:
        `${n} <form> element${s(n)} on the page ${v(n, 'carries', 'carry')} no action attribute and no id, ` +
        'class or attribute pointing at a known form plugin or script handler. A form with no action posts ' +
        'back to the same URL, which only works if something on the server is listening, and a form wired ' +
        'up entirely in JavaScript looks exactly like this in the source — so this needs one real test ' +
        'submission to settle. If nothing is listening, every enquiry typed into it is lost without a trace.',
      count: n,
      evidence: snippet(unwired[0].raw),
    });
  }

  // ── A form posting in the clear ────────────────────────────────────────────────────────────────
  // Unambiguous and entirely presence-based: the action really is an http:// URL, right there in the
  // attribute. Never gated by the blindness check — it is true whatever else the page renders.
  const insecure = allForms.filter((f) => /^\s*http:\/\//i.test(ownAttr(f.attrs, 'action') ?? ''));
  if (insecure.length) {
    const n = insecure.length;
    const target = snippet(ownAttr(insecure[0].attrs, 'action') ?? '');
    findings.push({
      code: 'conv.insecure_form',
      category: 'conversion',
      severity: 'high',
      confidence: 'detected',
      title: `${n} form${s(n)} posting over an unencrypted http:// connection`,
      detail:
        `${n} <form> element${s(n)} on the page ${v(n, 'submits', 'submit')} to an http:// address (${target}). ` +
        'Everything typed in — name, phone number, email address, anything else the form asks for — crosses ' +
        'the network unencrypted. Browsers now warn a visitor when a form on a secure page posts to an ' +
        'insecure one, and some block the submission outright, so enquiries can be lost to the warning alone.',
      count: n,
      evidence: snippet(insecure[0].raw),
    });
  }

  // ── Nothing to press at the top of the page ────────────────────────────────────────────────────
  if (!blind && !hasCta(aboveFold(clean))) {
    findings.push({
      code: 'conv.no_cta_above_fold',
      category: 'conversion',
      severity: 'med',
      // 'likely' by construction: source order is only a proxy for what lands on screen first.
      confidence: 'likely',
      title: 'No obvious next step in the top of the page',
      detail:
        // The number is written out rather than formatted: toLocaleString depends on the runtime's
        // ICU data, and a finding whose text changes between Deno and tsx is not deterministic.
        'No link or button in the first 4,000 characters of the page ' +
        'body has a name that reads as a next step — nothing that says call, book, get a quote, request an ' +
        'estimate, schedule, contact, get started, make an appointment or book a consultation. A visitor who ' +
        'has to hunt for what to do next mostly does not hunt. Source order is only a rough stand-in for what ' +
        'appears on screen first, so this one is worth checking against the rendered page.',
    });
  }

  return { findings, limits: [...LIMITS] };
}

/** Owner-facing name for a booking id, falling back to the id so nothing ever renders blank. */
export function bookingLabel(id: string): string {
  return BOOKING_LABELS[id] ?? id;
}
