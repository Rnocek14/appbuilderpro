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
check('only can_publish, non-AI photos are offered as REAL photos', p2.includes('owned.jpg') && !p2.includes('scraped.jpg'));
check('AI concept photos ride in their own labeled list', /ai_concept_photo_urls[^\]]*ai\.jpg/s.test(p2));
check('the system prompt demands the AI-imagery disclosure', /AI-generated concept art/.test(BESPOKE_SYSTEM));

// AI imagery in the DOCUMENT requires the disclosure line — gate-enforced, not hoped for.
const aiProfile: BusinessProfile = { ...base, photos: [{ url: 'https://ex.com/concept.jpg', source_type: 'ai_generated', can_use_in_preview: true }] };
const undisclosed = '<!doctype html><html><body><img src="https://ex.com/concept.jpg"><a href="tel:1">c</a></body></html>';
check('AI imagery without the disclosure is rejected', bespokeHonest(undisclosed, aiProfile).violations.some((x) => /undisclosed AI imagery/.test(x)));
const disclosed = '<!doctype html><html><body><img src="https://ex.com/concept.jpg"><footer>Imagery is AI-generated concept art.</footer></body></html>';
check('AI imagery WITH the disclosure passes', bespokeHonest(disclosed, aiProfile).ok === true);
check('no AI imagery used → no disclosure needed', bespokeHonest('<!doctype html><html><body><p>Leak repair for Fair Oaks.</p><a href="tel:1">c</a></body></html>', aiProfile).ok === true);

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

// evasion phrasings a dishonest generator actually produces — each must be caught
const evasions: [string, string][] = [
  ['a hyphenated "5-star"', 'Our 5-star service is known county-wide.'],
  ['a row of unicode stars', 'Rated ★★★★★ by our customers.'],
  ['a spelled-out "five-star"', 'A five-star rated company.'],
  ['spelled-out decades of tenure', 'Over two decades of experience.'],
  ['"award-winning"', 'An award-winning local company.'],
  ['a BBB grade', 'A+ rated by the BBB.'],
  ['a "#1" claim', 'The #1 plumber in the state.'],
  ['"voted best"', 'Voted best plumber in the county.'],
  ['an invented "trusted by N"', 'Trusted by 1,200+ homeowners.'],
  ['a "100% satisfaction" promise', 'We promise 100% satisfaction on every job.'],
];
for (const [label, line] of evasions) {
  check(`gate catches ${label}`, bespokeHonest(`<!doctype html><html><body><p>${line}</p></body></html>`, base).ok === false);
}
// …and the new guards must NOT fire on technical or grounded content
check('a hex color like #1a2b3c is not a "#1" claim', bespokeHonest('<!doctype html><html><body><div style="color:#1a2b3c">x</div></body></html>', base).ok === true);
check('★★★★★ is allowed when the profile has a real rating', bespokeHonest('<!doctype html><html><body>★★★★★ 4.9 on Google · 380 reviews</body></html>', { ...base, google_rating: 4.9, review_count: 380 }).ok === true);
check('"trusted by N" is allowed with a real review count', bespokeHonest('<!doctype html><html><body>Trusted by 380 customers</body></html>', { ...base, google_rating: 4.9, review_count: 380 }).ok === true);

// ── doc shape guard ────────────────────────────────────────────────────────
check('looksLikeHtmlDoc accepts a real full document', looksLikeHtmlDoc(honestHtml));
check('looksLikeHtmlDoc rejects a fenced/prose reply', !looksLikeHtmlDoc('```html\n<div>hi</div>\n```'));
check('looksLikeHtmlDoc rejects a truncated fragment', !looksLikeHtmlDoc('<!doctype html><html><body><h1>Cut o'));

console.log(`\nbespokeSite.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} bespokeSite check(s) failed`);
