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

console.log(`\nbespokeSite.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} bespokeSite check(s) failed`);
