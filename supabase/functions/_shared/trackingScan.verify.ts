// supabase/functions/_shared/trackingScan.verify.ts
// run: npx tsx supabase/functions/_shared/trackingScan.verify.ts
// Proves the tracking lens only ever reports what the markup really loads: each finding fires when
// its signature is present, stays silent when the page is fine, refuses to fire on a commented-out
// pixel or a plain link to a Facebook page, claims nothing on empty input, and never puts a legal
// claim in an owner-facing string.

import { scanTracking, trackingInventory } from './trackingScan.ts';
import { EVIDENCE_MAX, type Finding, type ScanResult } from './scanTypes.ts';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.error(`  FAIL - ${name}`); }
};

const has = (r: ScanResult, code: string): boolean => r.findings.some((f) => f.code === code);
const get = (r: ScanResult, code: string): Finding | undefined => r.findings.find((f) => f.code === code);

// ── A typical small-business page: a Meta pixel and GA, nobody ever added a consent tool. ────────
const pixels = scanTracking(`
  <html><head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());</script>
  <script>!function(f,b){}(window);fbq('init','1234567890');fbq('track','PageView');</script>
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  </head><body><h1>Joe's Plumbing</h1><p>Call us for a quote.</p></body></html>`);

ok('pixels: no_consent_mechanism fires', has(pixels, 'track.no_consent_mechanism'));
ok('pixels: counts both tools', get(pixels, 'track.no_consent_mechanism')?.count === 2);
ok('pixels: consent finding is high severity', get(pixels, 'track.no_consent_mechanism')?.severity === 'high');
ok('pixels: consent finding is only "likely" (absence is never "detected")', get(pixels, 'track.no_consent_mechanism')?.confidence === 'likely');
ok('pixels: names the tools it saw', /Meta \(Facebook\) pixel/.test(get(pixels, 'track.no_consent_mechanism')?.detail ?? ''));
ok('pixels: carries evidence from the markup', (get(pixels, 'track.no_consent_mechanism')?.evidence ?? '').length > 0);
ok('pixels: no_privacy_policy fires (no policy anywhere on the page)', has(pixels, 'track.no_privacy_policy'));
ok('pixels: many_trackers does NOT fire at 2 trackers', !has(pixels, 'track.many_trackers'));
ok('pixels: session_replay does NOT fire (nothing records the visitor)', !has(pixels, 'track.session_replay'));
ok('pixels: every finding is categorised tracking', pixels.findings.every((f) => f.category === 'tracking'));

// ── The same pixel, but with OneTrust and a policy link. Nothing to report. ──────────────────────
const consented = scanTracking(`
  <html><head>
  <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js" data-domain-script="abc"></script>
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script></head>
  <body><footer><a href="/privacy-policy">Privacy Policy</a></footer></body></html>`);
ok('consented: no_consent_mechanism silent when a CMP is present', !has(consented, 'track.no_consent_mechanism'));
ok('consented: no_privacy_policy silent when a policy is linked', !has(consented, 'track.no_privacy_policy'));
ok('consented: nothing at all is claimed', consented.findings.length === 0);
ok('consented: inventory names the platform', trackingInventory(consented ? `<script src="https://cdn.cookielaw.org/x.js"></script>` : '').consentPlatform === 'onetrust');

// ── Session replay: the sharpest one. Consent tool AND policy present, so only replay reports. ───
const replay = scanTracking(`
  <html><head>
  <script src="https://consent.cookiebot.com/uc.js" data-cbid="x"></script>
  <script src="https://static.hotjar.com/c/hotjar-123.js?sv=6"></script>
  <script>(function(c,l,a){})(window,'https://www.clarity.ms/tag/','abc');</script>
  </head><body><a href="/privacy">Privacy</a></body></html>`);
ok('replay: session_replay fires', has(replay, 'track.session_replay'));
ok('replay: counts both recorders', get(replay, 'track.session_replay')?.count === 2);
ok('replay: replay is "detected" — the script is unambiguously there', get(replay, 'track.session_replay')?.confidence === 'detected');
ok('replay: severity high', get(replay, 'track.session_replay')?.severity === 'high');
ok('replay: detail explains plainly that it records the visitor', /record/i.test(get(replay, 'track.session_replay')?.detail ?? ''));
ok('replay: consent tool present so no_consent stays silent', !has(replay, 'track.no_consent_mechanism'));
ok('replay: inventory keeps recorders separate from pixels', JSON.stringify(trackingInventory(`<script src="https://static.hotjar.com/c/hotjar-1.js"></script>`)) === JSON.stringify({ trackers: [], sessionReplay: ['hotjar'], consentPlatform: null }));

// ── Sediment: five vendors nobody chose, they just accumulated. ──────────────────────────────────
const many = scanTracking(`
  <html><head>
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  <script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
  <script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>
  <script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
  <script>pintrk('load','2612');</script>
  </head><body>Roofing</body></html>`);
ok('many: many_trackers fires at 5 distinct trackers', has(many, 'track.many_trackers'));
ok('many: count is the distinct tracker count', get(many, 'track.many_trackers')?.count === 5);
ok('many: severity med', get(many, 'track.many_trackers')?.severity === 'med');
ok('many: inventory lists all five in stable table order', trackingInventory(many ? `<script src="https://connect.facebook.net/en_US/fbevents.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script src="https://analytics.tiktok.com/x.js"></script><script src="https://snap.licdn.com/li.js"></script><script>pintrk('load','1')</script>` : '').trackers.join(',') === 'meta_pixel,ga,tiktok,linkedin,pinterest');

// ── FALSE-POSITIVE TRAP 1: a social link and some prose are not a pixel. ─────────────────────────
const social = scanTracking(`
  <html><body><h1>Rosa's Bakery</h1>
  <a href="https://www.facebook.com/rosasbakery">Find us on Facebook</a>
  <a href="https://www.tiktok.com/@rosasbakery">TikTok</a>
  <img src="/img/facebook-icon.png" alt="Facebook">
  <p>Our marketing agency once suggested a Facebook Pixel and Google Analytics. We said no.</p>
  </body></html>`);
ok('trap: a link to a Facebook page is not a Meta pixel', !trackingInventory(social ? `<a href="https://facebook.com/x">fb</a>` : '').trackers.includes('meta_pixel'));
ok('trap: prose naming the tools claims nothing', social.findings.length === 0);

// ── FALSE-POSITIVE TRAP 2: a commented-out pixel does not load, so it is never reported. ─────────
const commented = scanTracking(`
  <html><head>
  <!-- old pixel, removed 2023:
       <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
       <script>fbq('init','999');</script>
       <script src="https://static.hotjar.com/c/hotjar-9.js"></script> -->
  </head><body><p>We removed our tracking.</p></body></html>`);
ok('trap: commented-out pixel is not counted', trackingInventory(commented ? `<!-- <script>fbq('init','1')</script> -->` : '').trackers.length === 0);
ok('trap: commented-out page produces no findings', commented.findings.length === 0);

// ── FALSE-POSITIVE TRAP 3: a hand-rolled banner is still a consent mechanism. ────────────────────
const banner = scanTracking(`
  <html><head><script src="https://connect.facebook.net/en_US/fbevents.js"></script></head>
  <body><div class="cookie-banner">We use cookies. <button>Accept</button></div>
  <a href="/privacy-policy">Privacy</a></body></html>`);
ok('banner: generic banner suppresses the consent finding', !has(banner, 'track.no_consent_mechanism'));
ok('banner: inventory reports it honestly as generic', trackingInventory(`<div class="cookie-consent-bar">Accept cookies</div>`).consentPlatform !== null);

// ── FALSE-POSITIVE TRAP 4: a footer nav shipped as a JS config still links a policy. ─────────────
// Intentional: suppressing on the weaker signal is the safe direction. Telling an owner they have
// no privacy policy when the link renders in their footer is the failure that matters.
const jsNav = scanTracking(`
  <html><head><script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  <script>window.NAV=[{"label":"Privacy Policy","href":"/privacy-policy"}];</script></head>
  <body><div id="footer"></div></body></html>`);
ok('trap: policy in a JS nav config suppresses no_privacy_policy', !has(jsNav, 'track.no_privacy_policy'));
ok('trap: but the missing consent tool is still reported', has(jsNav, 'track.no_consent_mechanism'));

// ── A page with no tracking at all: the privacy finding must not fire on its own. ────────────────
const untracked = scanTracking(`<html><body><h1>Bill's Welding</h1><p>Call 555-0100.</p></body></html>`);
ok('untracked: no findings when nothing tracks the visitor', untracked.findings.length === 0);
ok('untracked: no_privacy_policy needs trackers to fire', !has(untracked, 'track.no_privacy_policy'));

// ── Singular/plural and the one-tool case. ───────────────────────────────────────────────────────
const one = scanTracking(`<html><head><script src="https://static.hotjar.com/c/hotjar-1.js"></script></head><body>Hi</body></html>`);
ok('one: consent finding counts the recorder as a tool', get(one, 'track.no_consent_mechanism')?.count === 1);
ok('one: title reads singular', /1 tracking tool\b/.test(get(one, 'track.no_consent_mechanism')?.title ?? ''));

// ── HONESTY: empty and garbage input claim nothing. ──────────────────────────────────────────────
const empty = scanTracking('');
ok('empty: zero findings', empty.findings.length === 0);
ok('empty: limits still ship (a quiet result is not a clean bill of health)', empty.limits.length >= 3);
ok('empty: inventory is empty, not guessed', JSON.stringify(trackingInventory('')) === JSON.stringify({ trackers: [], sessionReplay: [], consentPlatform: null }));
ok('garbage: claims nothing', scanTracking('<<<>>> not html !!! ???').findings.length === 0);

// ── LIMITS must say the three things this scan cannot know. ──────────────────────────────────────
const limits = pixels.limits.join(' ');
ok('limits: states consent TIMING is unknowable statically', /timing/i.test(limits) && /browser/i.test(limits));
ok('limits: states tag managers can inject unseen trackers', /tag manager/i.test(limits) && /floor/i.test(limits));
ok('limits: states this is an observation, not a legal assessment', /not a legal assessment/i.test(limits));

// ── LANGUAGE: no finding may assert illegality, liability, or compliance. ────────────────────────
const allText = [pixels, replay, many, one, jsNav].flatMap((r) => r.findings).map((f) => `${f.title} ${f.detail}`).join(' ');
ok('language: never asserts illegality or a violation', !/illegal|violat|unlawful|breach of/i.test(allText));
ok('language: never asserts compliance or non-compliance', !/\bcompliant\b|\bcompliance\b|\bADA\b|\bGDPR\b|\bCCPA\b/i.test(allText));
ok('language: never threatens liability or lawsuits', !/sued|lawsuit|liabilit|fine[sd]? (of|up to)|penalt/i.test(allText));

// ── Determinism. ─────────────────────────────────────────────────────────────────────────────────
const sample = `<html><head><script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  <script src="https://static.hotjar.com/c/hotjar-1.js"></script></head><body>x</body></html>`;
ok('deterministic: scanTracking', JSON.stringify(scanTracking(sample)) === JSON.stringify(scanTracking(sample)));
ok('deterministic: trackingInventory', JSON.stringify(trackingInventory(sample)) === JSON.stringify(trackingInventory(sample)));

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL BLOCK — every case below is markup a competent real site really ships. A finding here
// would be a FALSE STATEMENT emailed to a business owner, which is the worst outcome this project
// has. Each `ok` names the real page it came from.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

// ── FP: the Facebook JS SDK is not the Meta pixel. ───────────────────────────────────────────────
// A bakery with a Like box / page plugin / Messenger chat loads connect.facebook.net/en_US/sdk.js.
// That is a social widget, not a conversion pixel, and calling it one names a tool they don't run.
const fbSdk = scanTracking(`
  <html><body><h1>Rosa's Bakery</h1><div id="fb-root"></div>
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0"></script>
  <div class="fb-page" data-href="https://www.facebook.com/rosasbakery"></div>
  <a href="/privacy-policy">Privacy Policy</a></body></html>`);
ok('fp: Facebook JS SDK (page plugin) is not a Meta pixel', !trackingInventory(`<script src="https://connect.facebook.net/en_US/sdk.js#xfbml=1"></script>`).trackers.includes('meta_pixel'));
ok('fp: Facebook page plugin claims nothing at all', fbSdk.findings.length === 0);
ok('regress: the real pixel loader is still detected', trackingInventory(`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>`).trackers.includes('meta_pixel'));
ok('regress: the noscript pixel beacon is still detected', trackingInventory(`<noscript><img height="1" width="1" src="https://www.facebook.com/tr?id=123456789&ev=PageView&noscript=1"/></noscript>`).trackers.includes('meta_pixel'));

// ── FP: a blog slug is not an installed pixel. ───────────────────────────────────────────────────
const fbSlug = scanTracking(`
  <html><body><h2>From our blog</h2>
  <a href="/blog/facebook-pixel-vs-conversions-api">Facebook Pixel vs the Conversions API</a>
  <img src="/img/facebook_pixel_diagram.png" alt="diagram">
  <a href="/privacy-policy">Privacy</a></body></html>`);
ok('fp: a /blog/facebook-pixel-… link is not a pixel', !trackingInventory(`<a href="/blog/facebook-pixel-guide">guide</a>`).trackers.includes('meta_pixel'));
ok('fp: a blog post about the pixel claims nothing', fbSlug.findings.length === 0);
ok('regress: the WordPress enqueue slug still counts', trackingInventory(`<script id="facebook-pixel-js" src="/wp-content/x.js"></script>`).trackers.includes('meta_pixel'));

// ── FP: linking a vendor's marketing site or blog is not running their recorder. ─────────────────
// blog.logrocket.com is one of the most-cited dev blogs on the web. Reporting a high-severity
// "session-recording tool detected" because someone linked an article is indefensible.
const vendorLinks = scanTracking(`
  <html><body><h2>Reading list</h2>
  <a href="https://blog.logrocket.com/using-react-hooks/">Using React Hooks</a>
  <a href="https://mouseflow.com">Mouseflow</a>
  <a href="https://www.smartlook.com/pricing">Smartlook pricing</a>
  <a href="https://www.luckyorange.com">Lucky Orange</a>
  <a href="https://www.inspectlet.com">Inspectlet</a>
  <a href="/privacy-policy">Privacy</a></body></html>`);
ok('fp: a link to blog.logrocket.com is not a session recorder', !trackingInventory(`<a href="https://blog.logrocket.com/x/">post</a>`).sessionReplay.includes('logrocket'));
ok('fp: vendor marketing links produce no session_replay finding', !has(vendorLinks, 'track.session_replay'));
ok('fp: vendor marketing links produce no findings at all', vendorLinks.findings.length === 0);
ok('regress: the real LogRocket bundle is still detected', trackingInventory(`<script src="https://cdn.lr-ingest.io/LogRocket.min.js"></script>`).sessionReplay.includes('logrocket'));
ok('regress: the real Mouseflow bundle is still detected', trackingInventory(`<script src="https://cdn.mouseflow.com/projects/abc.js"></script>`).sessionReplay.includes('mouseflow'));
ok('regress: the real Smartlook bundle is still detected', trackingInventory(`<script src="https://web-sdk.smartlook.com/recorder.js"></script>`).sessionReplay.includes('smartlook'));
ok('regress: the real Lucky Orange bundle is still detected', trackingInventory(`<script>window.__lo_site_id=123;</script><script src="https://tools.luckyorange.com/core/lo.js"></script>`).sessionReplay.includes('luckyorange'));
ok('regress: the real Inspectlet bundle is still detected', trackingInventory(`<script src="https://cdn.inspectlet.com/inspectlet.js"></script>`).sessionReplay.includes('inspectlet'));

// ── FP: a CSP allow-list and resource hints name hosts, they do not load them. ───────────────────
// A security-conscious site ships one site-wide CSP naming every host it MAY use. On a page that
// uses none of them, every one of those names would be read back as a tool "the page loads".
const cspOnly = scanTracking(`
  <html><head>
  <meta http-equiv="Content-Security-Policy" content="script-src 'self' https://connect.facebook.net https://www.googletagmanager.com/gtag https://analytics.tiktok.com https://snap.licdn.com https://static.hotjar.com">
  <link rel="preconnect" href="https://connect.facebook.net">
  <link rel="dns-prefetch" href="https://static.hotjar.com">
  </head><body><h1>Secure Co</h1><a href="/privacy-policy">Privacy</a></body></html>`);
ok('fp: a CSP allow-list is not a tracker inventory', trackingInventory(`<meta http-equiv="Content-Security-Policy" content="script-src https://connect.facebook.net https://static.hotjar.com">`).trackers.length === 0);
ok('fp: dns-prefetch/preconnect hints are not loads', trackingInventory(`<link rel="preconnect" href="https://static.hotjar.com">`).sessionReplay.length === 0);
ok('fp: a CSP-only page claims nothing', cspOnly.findings.length === 0);
ok('regress: a real script next to the CSP is still found', trackingInventory(`<meta http-equiv="Content-Security-Policy" content="script-src https://connect.facebook.net"><script src="https://connect.facebook.net/en_US/fbevents.js"></script>`).trackers.includes('meta_pixel'));

// ── FP: a tutorial showing escaped code is text on the page, not code the browser runs. ──────────
const tutorial = scanTracking(`
  <html><body><h1>How to install the Meta pixel</h1>
  <pre><code>&lt;script&gt;
  fbq('init', '000000000000');
  fbq('track', 'PageView');
&lt;/script&gt;</code></pre>
  <p>Then call <code>gtag('config','G-XXXXXXX')</code> for Analytics.</p>
  <textarea readonly>&lt;script src="https://static.hotjar.com/c/hotjar-1.js"&gt;&lt;/script&gt;</textarea>
  <a href="/privacy-policy">Privacy Policy</a></body></html>`);
ok('fp: escaped code in <pre><code> is not an installed pixel', tutorial.findings.length === 0);
ok('fp: a <code> sample of gtag() is not Google Analytics', !trackingInventory(`<p>Call <code>gtag('config','G-1')</code>.</p>`).trackers.includes('ga'));
ok('fp: a copy-me <textarea> snippet is not a running recorder', trackingInventory(`<textarea>&lt;script src="https://static.hotjar.com/c/hotjar-1.js"&gt;</textarea>`).sessionReplay.length === 0);

// ── FP: consent mechanisms the table did not know about. Every miss here INVENTS a finding. ──────
const cmps: [string, string][] = [
  ['TrustArc', `<script src="https://consent.trustarc.com/notice?domain=x"></script>`],
  ['Axeptio', `<script src="https://static.axept.io/sdk.js" data-id="x"></script>`],
  ['CookieHub', `<script src="https://cdn.cookiehub.eu/c2/x.js"></script>`],
  ['consentmanager.net', `<script src="https://cdn.consentmanager.net/delivery/autoblocking/x.js"></script>`],
  ['Ketch', `<script src="https://global.ketchcdn.com/web/v3/config/x/boot.js"></script>`],
  ['Sourcepoint', `<script src="https://cdn.privacy-mgmt.com/wrapperMessagingWithoutDetection.js"></script><script>window._sp_ = {};</script>`],
  ['tarteaucitron', `<script src="/js/tarteaucitron/tarteaucitron.js"></script>`],
  ['Pandectes (Shopify)', `<script src="https://cdn.pandectes.io/scripts/pandectes.js"></script>`],
  ['Shopify customer privacy API', `<script>window.Shopify.customerPrivacy.setTrackingConsent(true);</script>`],
  ['WP Cookie Notice plugin', `<div id="cookie-notice" class="cookie-notice-hidden"><span>We use cookies</span></div>`],
  ['GDPR Cookie Consent (cookie-law-info)', `<div id="cookie-law-info-bar"><span>This site uses cookies</span></div>`],
  ['Real Cookie Banner', `<div class="rcb-banner">Datenschutz</div>`],
  ['Google Consent Mode v2', `<script>gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied'});</script>`],
];
for (const [name, tag] of cmps) {
  const page = scanTracking(`<html><head>${tag}<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></head><body><a href="/privacy-policy">Privacy</a></body></html>`);
  ok(`fp: ${name} counts as a consent mechanism`, !has(page, 'track.no_consent_mechanism'));
}

// ── FP: unquoted / oddly-quoted / minified banner markup is still a banner. ──────────────────────
ok('fp: unquoted class=cookie-banner is still a banner', trackingInventory(`<div class=cookie-banner>We use cookies <button>Got it</button></div>`).consentPlatform !== null);
ok('fp: single-quoted id is still a banner', trackingInventory(`<div id='cookieConsent'>Okay</div>`).consentPlatform !== null);
ok('fp: uppercase attributes are still a banner', trackingInventory(`<DIV CLASS="COOKIE-NOTICE">OK</DIV>`).consentPlatform !== null);
ok('fp: minified gdpr banner container is still a banner', trackingInventory(`<div class="gdpr-banner"><button>Got it</button></div>`).consentPlatform !== null);
ok('fp: "Cookie settings" control is still a banner', trackingInventory(`<button>Cookie settings</button>`).consentPlatform !== null);
ok('fp: "Reject cookies" control is still a banner', trackingInventory(`<button>Reject cookies</button>`).consentPlatform !== null);
const gotIt = scanTracking(`<html><head><script src="https://connect.facebook.net/en_US/fbevents.js"></script></head>
  <body><div class=cookie-banner>We use cookies <button>Got it</button></div><a href="/privacy-policy">Privacy</a></body></html>`);
ok('fp: a real page with an unquoted banner class claims nothing', gotIt.findings.length === 0);

// ── FP: a footer link whose text is just "Privacy". ──────────────────────────────────────────────
const barePrivacy = scanTracking(`
  <html><head><script src="https://connect.facebook.net/en_US/fbevents.js"></script></head>
  <body><div class="cookie-banner">Accept cookies</div>
  <footer><a href="/legal">Privacy</a></footer></body></html>`);
ok('fp: an <a> whose text is "Privacy" is a privacy link', !has(barePrivacy, 'track.no_privacy_policy'));
ok('fp: an <a> reading "Data Protection" is a privacy link', !has(scanTracking(`<html><head><script>fbq('init','1')</script></head><body><div class="cookie-banner">Accept cookies</div><a href="/legal">Data Protection</a></body></html>`), 'track.no_privacy_policy'));
ok('regress: a page with no policy anywhere still reports it', has(scanTracking(`<html><head><script>fbq('init','1')</script></head><body><div class="cookie-banner">Accept cookies</div><a href="/about">About us</a></body></html>`), 'track.no_privacy_policy'));

// ── FP: markup a browser never executes must never be reported. ──────────────────────────────────
// Text after an unterminated `<!--` is inside the comment as far as every browser is concerned.
ok('fp: a tracker after an unterminated <!-- is not loaded', trackingInventory(`<html><body><!-- draft <script src="https://static.hotjar.com/c/hotjar-1.js"></script>`).sessionReplay.length === 0);

// ── CRASH / HANG: malformed markup must not stall an edge function. ──────────────────────────────
const hang = (name: string, html: string, ms: number) => {
  const t0 = Date.now();
  let threw = false;
  try { scanTracking(html); trackingInventory(html); } catch { threw = true; }
  const took = Date.now() - t0;
  ok(`${name} (no throw, ${took}ms < ${ms}ms)`, !threw && took < ms);
};
const REAL = '<script src="https://static.hotjar.com/c/hotjar-1.js"></script>';
hang('crash: 30k unterminated <!-- openers', REAL + '<!--'.repeat(30000) + 'y'.repeat(400000), 3000);
hang('crash: 30k unterminated <script> openers', REAL + '<script src="x">'.repeat(30000), 3000);
hang('crash: 30k unterminated <noscript> openers', REAL + '<noscript>'.repeat(30000) + 'y'.repeat(400000), 3000);
hang('crash: 30k unclosed anchors', REAL + '<a href="/p">link'.repeat(30000), 3000);
hang('crash: 5MB of junk', '<div>'.repeat(200000) + 'lorem ipsum '.repeat(300000), 3000);
hang('crash: unterminated <pre> with 1MB tail', REAL + '<pre>' + 'z'.repeat(1000000), 3000);
hang('crash: null bytes, lone surrogates, astral, RTL', ` \uD83D<script>fbq('init')</script>\uDE00 \u{1F600} مرحبا  `, 3000);
hang('crash: unterminated tag with no closing bracket', '<script src="https://static.hotjar.com/c/h.js"></script><div class="' + 'a'.repeat(500000), 3000);

// ── FP: a token that happens to appear inside base64 is not a tag. ───────────────────────────────
// A data: URI is alphanumeric with only `+` and `/` as separators, so a short all-letters global
// like `uetq` can turn up inside an inline image and pick up word boundaries on both sides.
const b64 = scanTracking(`<html><body><img alt="soap" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg+uetq/QAAAAA1BMVEX///+nxBjIAAAAAXRSTlMAQObYZg=="><p>Handmade soap.</p></body></html>`);
ok('fp: base64 containing +uetq/ is not a Bing UET tag', !trackingInventory(`<img src="data:image/png;base64,AAA+uetq/BBB=">`).trackers.includes('bing'));
ok('fp: an inline image claims nothing', b64.findings.length === 0);
ok('regress: real UET via bat.bing.com still detected', trackingInventory(`<script src="//bat.bing.com/bat.js"></script>`).trackers.includes('bing'));
ok('regress: real UET via the quoted global still detected', trackingInventory(`<script>(function(w,d,t,r,u){})(window,document,"script","//x/bat.js","uetq");</script>`).trackers.includes('bing'));
ok('regress: real UET via window.uetq.push still detected', trackingInventory(`<script>window.uetq.push('event','',{});</script>`).trackers.includes('bing'));

// ── Regression: real installs in the shapes real CMSs emit them. ─────────────────────────────────
ok('shape: minified, uppercase tags, unquoted attrs', trackingInventory(`<HTML><HEAD><SCRIPT SRC=https://connect.facebook.net/en_US/fbevents.js ASYNC></SCRIPT></HEAD></HTML>`).trackers.includes('meta_pixel'));
ok('shape: single-quoted, self-closing script tag', trackingInventory(`<script src='https://www.googletagmanager.com/gtm.js?id=GTM-ABCD12'/>`).trackers.includes('gtm'));
ok('shape: Clarity on its versioned asset path', trackingInventory(`<script src="https://www.clarity.ms/s/0.7.24/clarity.js"></script>`).sessionReplay.includes('clarity'));
ok('shape: a link to clarity.microsoft.com is not Clarity', !trackingInventory(`<a href="https://clarity.microsoft.com/">Clarity</a>`).sessionReplay.includes('clarity'));
ok('shape: Lucky Orange via its legacy global', trackingInventory(`<script>window.__wtw_lucky_site_id = 123456;</script>`).sessionReplay.includes('luckyorange'));
ok('shape: GTM noscript iframe page still names GTM', trackingInventory(`<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABCD12');</script>`).trackers.includes('gtm'));

// ── LIMITS: everything the scan cannot see has to be written down, not just hoped for. ───────────
const lim = scanTracking(REAL).limits.join(' ');
ok('limits: says JavaScript-rendered content is invisible', /javascript|client-side|rendered/i.test(lim) && /(not visible|would not be seen|cannot see|invisible)/i.test(lim));
ok('limits: says only this one page was read', /(one page|this page only|single page|other pages)/i.test(lim));
ok('limits: says a banner may be shown only in some regions', /(region|geograph|EU|jurisdiction-specific|only to visitors)/i.test(lim));
ok('limits: says presence is not proof the tool is active for a visitor', /(active|actually run|blocked|whether .* runs)/i.test(lim));

// ── HONESTY sweep over every result this file builds. ────────────────────────────────────────────
const everyResult = [pixels, consented, replay, many, social, commented, banner, jsNav, untracked, one,
  fbSdk, fbSlug, vendorLinks, cspOnly, tutorial, gotIt, barePrivacy];
const everyFinding = everyResult.flatMap((r) => r.findings);
const everyText = everyFinding.map((f) => `${f.title} ${f.detail}`).join(' ');
ok('honesty: no finding asserts illegality, violation or non-compliance', !/illegal|violat|unlawful|non-?compliant|breach of|\bGDPR\b|\bCCPA\b|\bADA\b/i.test(everyText));
ok('honesty: no finding promises, guarantees or requires', !/\bguarantee|\byou must\b|\brequired by\b|\bmandatory\b|\bwill be fined\b/i.test(everyText));
ok('honesty: no finding claims a script ran before consent', !/before (the )?(visitor|user) (consent|accept)/i.test(everyText));
ok('honesty: every confidence is one of the three allowed values', everyFinding.every((f) => ['detected', 'likely', 'needs_review'].includes(f.confidence)));
ok('honesty: absence-based findings are never "detected"', everyFinding.filter((f) => f.code === 'track.no_consent_mechanism' || f.code === 'track.no_privacy_policy').every((f) => f.confidence === 'likely'));
ok('honesty: evidence never exceeds the contract cap', everyFinding.every((f) => (f.evidence ?? '').length <= EVIDENCE_MAX));
ok('honesty: every finding carries a title and a detail', everyFinding.every((f) => f.title.trim().length > 0 && f.detail.trim().length > 0));
ok('honesty: every code is namespaced to this lens', everyFinding.every((f) => f.code.startsWith('track.')));
ok('honesty: session_replay says its recording depends on settings we cannot see', !has(replay, 'track.session_replay') || /cannot see|settings|configur/i.test(get(replay, 'track.session_replay')?.detail ?? ''));

// ── Determinism across the adversarial corpus, and no shared regex state between calls. ──────────
const corpus = [`<script src="https://connect.facebook.net/en_US/fbevents.js"></script>`, REAL,
  `<div class=cookie-banner>Accept cookies</div>`, '', '<<<>>>', `<pre><code>fbq('init')</code></pre>`];
let stable = true;
for (const c of corpus) {
  const a = JSON.stringify(scanTracking(c)), b = JSON.stringify(scanTracking(c));
  // interleave a different input to catch any sticky regex lastIndex leaking between calls
  scanTracking(`<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>`);
  if (a !== b || JSON.stringify(scanTracking(c)) !== a) stable = false;
}
ok('deterministic: repeated + interleaved calls never drift', stable);

console.log(`${fail === 0 ? '✓' : '✗'} trackingScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
