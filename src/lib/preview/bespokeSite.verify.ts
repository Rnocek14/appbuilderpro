// Run: npx tsx src/lib/preview/bespokeSite.verify.ts
import { BESPOKE_SYSTEM, buildBespokePrompt, bespokeHonest, looksLikeHtmlDoc } from './bespokeSite';
import type { BusinessProfile } from '../../../supabase/functions/_shared/previewSpec';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('bespokeSite.verify');

const base: BusinessProfile = {
  business_name: 'Copperline Plumbing', industry: 'Plumber', location: 'Fair Oaks, CA',
  service_area: ['Fair Oaks', 'Folsom'], phone: '(555) 018-2470', services: ['Leak repair', 'Water heaters', 'Drains'],
  photos: [], description: 'Residential plumbing for the Sacramento suburbs.',
};

// ── prompt + contract ──────────────────────────────────────────────────────
check('system prompt carries the honesty contract (no invented licensing)', /licensed|insured|bonded/i.test(BESPOKE_SYSTEM) && /NEVER/i.test(BESPOKE_SYSTEM));
check('system prompt demands a complete self-contained HTML doc', /<!doctype html>/i.test(BESPOKE_SYSTEM) && /inline/i.test(BESPOKE_SYSTEM));
check('system prompt directs motion via inline IntersectionObserver', /motion/i.test(BESPOKE_SYSTEM) && /IntersectionObserver/.test(BESPOKE_SYSTEM));
check('motion is screenshot-safe + reduced-motion aware', /screenshot-safe/i.test(BESPOKE_SYSTEM) && /prefers-reduced-motion/.test(BESPOKE_SYSTEM));
check('system prompt sets a bespoke (non-templated) design bar', /design bar/i.test(BESPOKE_SYSTEM) && /bespoke/i.test(BESPOKE_SYSTEM));
const prompt = buildBespokePrompt(base);
check('prompt includes the real business facts', prompt.includes('Copperline Plumbing') && prompt.includes('(555) 018-2470') && prompt.includes('Fair Oaks'));
check('prompt only exposes publishable photos (none here)', prompt.includes('"publishable_photo_urls": []'));

// non-publishable / ai / scraped photos never reach the model
const withPhotos: BusinessProfile = { ...base, photos: [
  { url: 'https://ex.com/scraped.jpg', can_publish: false },
  { url: 'https://ex.com/ai.jpg', can_publish: true, source_type: 'ai_generated' },
  { url: 'https://ex.com/owned.jpg', can_publish: true, source_type: 'owner' },
] };
const p2 = buildBespokePrompt(withPhotos);
check('only can_publish, non-AI photos are offered to the model', p2.includes('owned.jpg') && !p2.includes('scraped.jpg') && !p2.includes('ai.jpg'));

// ── THE HONESTY GATE — the whole point ─────────────────────────────────────
const copperlineLies = `<!doctype html><html><body>
  <p>Licensed &amp; insured · CA Lic. #C36-000000</p>
  <b>22 yrs</b> serving the area · <span>4.9 ★ · 380+ reviews</span>
  <div>2-year warranty on workmanship. Satisfaction guaranteed.</div>
</body></html>`;
const lieResult = bespokeHonest(copperlineLies, base);
check('rejects invented "licensed & insured"', lieResult.violations.some((x) => /licensed|insured/.test(x)));
check('rejects an invented license number', lieResult.violations.some((x) => /license number/.test(x)));
check('rejects invented tenure ("22 yrs")', lieResult.violations.some((x) => /tenure/.test(x)));
check('rejects an invented star rating (profile has none)', lieResult.violations.some((x) => /star rating/.test(x)));
check('rejects an invented review count (profile has none)', lieResult.violations.some((x) => /review count/.test(x)));
check('rejects an invented warranty/guarantee', lieResult.violations.some((x) => /promise/.test(x)));
check('a page full of invented claims is NOT ok (falls back to spec)', lieResult.ok === false);

// grounded page passes
const honestHtml = `<!doctype html><html><body>
  <h1>Copperline Plumbing</h1>
  <p>Leak repair, water heaters, and drains for Fair Oaks &amp; Folsom.</p>
  <a href="tel:15550182470">Call (555) 018-2470</a>
  <p>Free, no-obligation quotes.</p>
</body></html>`;
check('a page with only grounded facts passes the gate', bespokeHonest(honestHtml, base).ok === true);

// rating IS allowed when the profile actually has it
const rated: BusinessProfile = { ...base, google_rating: 4.9, review_count: 380 };
const ratedHtml = `<!doctype html><html><body><span>4.9 ★ · 380 reviews on Google</span><a href="tel:1">call</a></body></html>`;
check('a real rating/review count from the profile is allowed', bespokeHonest(ratedHtml, rated).ok === true);

// credential IS allowed when the profile states it
const licensed: BusinessProfile = { ...base, description: 'Licensed and insured residential plumbing since 2003.' };
const licHtml = `<!doctype html><html><body><p>Licensed &amp; insured, serving since 2003.</p><a href="tel:1">c</a></body></html>`;
check('a credential the profile states IS allowed', bespokeHonest(licHtml, licensed).ok === true);

// ── doc shape guard ────────────────────────────────────────────────────────
check('looksLikeHtmlDoc accepts a real full document', looksLikeHtmlDoc(honestHtml));
check('looksLikeHtmlDoc rejects a fenced/prose reply', !looksLikeHtmlDoc('```html\n<div>hi</div>\n```'));
check('looksLikeHtmlDoc rejects a truncated fragment', !looksLikeHtmlDoc('<!doctype html><html><body><h1>Cut o'));

// ── THE FAIL-OPEN BRANCHES (found 2026-08-06 by adversarial audit) ──────────
// Four branches used presence of a TOKEN as a stand-in for entailment of a CLAIM. Each shipped a
// specific lie onto a page carrying a real, named, licensed contractor's business. In Texas that is
// a Class A violation for the CLIENT, and TDLR selects sting targets on exactly that signature.

/** The profile shape that disarmed the gate: a real business that says the ordinary things. */
const realBiz: BusinessProfile = {
  business_name: 'Wimberley Electric', industry: 'electrician', photos: [],
  description: 'Licensed and insured electricians serving Austin for years.',
  google_rating: 4.1, review_count: 12,
  services: ['panel upgrades'], issues: [], review_snippets: [],
};

check('TEXAS LICENCE FORMATS carry no "lic" token and were never examined at all',
  ['TECL #12345', 'TACLA00123C', 'RMP-12345', 'M-38291'].every((code) => {
    const html = `<!doctype html><html><body><p>${code}</p></body></html>`;
    return bespokeHonest(html, realBiz).violations.some((x) => /license number/.test(x));
  }));
check('…and the word "Licensed" in the profile no longer disables the licence check entirely',
  // The old guard was `!/\blic/i.test(grounded)` — one ordinary sentence switched the branch off.
  bespokeHonest('<!doctype html><html><body>Lic. #C36-000000</body></html>', realBiz)
    .violations.some((x) => /license number/.test(x)));
check('the FIRST match is not the only one checked — "Licensed" precedes the real number',
  bespokeHonest('<!doctype html><html><body>Licensed &amp; insured · CA Lic. #C36-000000</body></html>', realBiz)
    .violations.some((x) => /license number/.test(x)));
check('a licence the profile ACTUALLY carries is allowed through',
  !bespokeHonest('<!doctype html><html><body>TECL #29481</body></html>',
    { ...realBiz, description: 'Licensed electricians, TECL #29481, serving Austin.' })
    .violations.some((x) => /license number/.test(x)));
check('prose is not a licence number — "licensed and insured" alone does not trip it',
  !bespokeHonest('<!doctype html><html><body>Licensed and insured.</body></html>', realBiz)
    .violations.some((x) => /license number/.test(x)));

check('AN INFLATED RATING IS CAUGHT — the branch only fired when the profile had NO rating',
  // Real 4.1, page claims 5.0. The customer can disprove this in one click, which is the worst case.
  bespokeHonest('<!doctype html><html><body><span>5.0 ★</span></body></html>', realBiz)
    .violations.some((x) => /inflated star rating/.test(x)));
check('an INFLATED REVIEW COUNT is caught — real 12, page claims 2,400+',
  bespokeHonest('<!doctype html><html><body><span>2,400+ reviews</span></body></html>', realBiz)
    .violations.some((x) => /inflated review count/.test(x)));
check('the TRUE rating and count still pass — rounding is allowed, inflation is not',
  bespokeHonest('<!doctype html><html><body><span>4.1 ★ · 12 reviews</span></body></html>', realBiz)
    .violations.length === 0);
check('claiming FEWER reviews than exist is honest and allowed',
  !bespokeHonest('<!doctype html><html><body><span>4.1 ★ · 10 reviews</span></body></html>', realBiz)
    .violations.some((x) => /review count/.test(x)));

check('TENURE needs the actual NUMBER in the grounded text, not the word "years"',
  // A review snippet saying "used them for years" used to license "Serving Austin since 1998".
  bespokeHonest('<!doctype html><html><body>Serving Austin since 1998</body></html>', realBiz)
    .violations.some((x) => /unverified tenure/.test(x)));
check('…and a tenure the profile states IS allowed',
  !bespokeHonest('<!doctype html><html><body>22 years in business</body></html>',
    { ...realBiz, description: '22 years serving Austin.' })
    .violations.some((x) => /unverified tenure/.test(x)));

check('THE COMPOUND CASE: the profile that disarmed every branch at once is now rejected',
  (() => {
    const html = `<!doctype html><html><body>
      <p>Licensed &amp; insured · TACLA00123C</p>
      <b>Serving Austin since 1998</b> · <span>5.0 ★ · 2,400+ reviews</span>
    </body></html>`;
    const r = bespokeHonest(html, realBiz);
    return !r.ok
      && r.violations.some((x) => /license number/.test(x))
      && r.violations.some((x) => /inflated star rating/.test(x))
      && r.violations.some((x) => /inflated review count/.test(x))
      && r.violations.some((x) => /unverified tenure/.test(x));
  })());

console.log(`\nbespokeSite.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} bespokeSite check(s) failed`);
