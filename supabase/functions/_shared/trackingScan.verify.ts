// supabase/functions/_shared/trackingScan.verify.ts
// run: npx tsx supabase/functions/_shared/trackingScan.verify.ts
// Proves the tracking lens only ever reports what the markup really loads: each finding fires when
// its signature is present, stays silent when the page is fine, refuses to fire on a commented-out
// pixel or a plain link to a Facebook page, claims nothing on empty input, and never puts a legal
// claim in an owner-facing string.

import { scanTracking, trackingInventory } from './trackingScan.ts';
import type { Finding, ScanResult } from './scanTypes.ts';

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

console.log(`${fail === 0 ? '✓' : '✗'} trackingScan.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
