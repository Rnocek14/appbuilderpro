// src/lib/preview/spec.verify.ts
// Dependency-free checks for the pure half of the Business Website Preview Engine.
// Run: npm run verify:preview  (mirrors the other *.verify.ts files)

import {
  parseBusinessProfile, pickRecipe, assembleFallbackSpec, normalizeSpec,
  usablePhotos, usableReviews, previewSlug, navFor, RECIPES,
  type BusinessProfile,
} from './spec';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
};

const ROOFER: BusinessProfile = parseBusinessProfile({
  business_name: "Joe's Roofing",
  industry: 'Roofing',
  location: 'Lake Geneva, WI',
  phone: '555-555-5555',
  services: ['Roof repair', 'Roof replacement', 'Storm damage repair'],
  photos: [
    { url: 'https://x/1.jpg' },
    { url: 'https://x/2.jpg', can_use_in_preview: false },
    'https://x/3.jpg',
  ],
  review_snippets: [
    { text: 'Fast and clean work.', author: 'Dana', rating: 5 },
    { text: 'Private review', can_use_in_preview: false },
  ],
  google_rating: 4.8, review_count: 57,
  seo_keywords: ['roof repair lake geneva'],
}).profile!;

// parsing
check('valid profile parses', !!ROOFER && ROOFER.business_name === "Joe's Roofing");
check('string photos coerce to sourced photos', ROOFER.photos.length === 3 && ROOFER.photos[2].url === 'https://x/3.jpg');
{
  const bad = parseBusinessProfile({ industry: 'Roofing' });
  check('missing name/services rejected with errors', bad.profile === null && bad.errors.length === 2);
}

// usage flags
check('usablePhotos honors can_use_in_preview=false', usablePhotos(ROOFER).length === 2 && !usablePhotos(ROOFER).some((p) => p.url === 'https://x/2.jpg'));
check('usableReviews honors can_use_in_preview=false', usableReviews(ROOFER).length === 1);

// recipes
check('roofer matches contractor recipe', pickRecipe(ROOFER).id === 'contractor_lead_gen');
check('restaurant keyword matches restaurant recipe', pickRecipe({ ...ROOFER, industry: 'Pizzeria' }).id === 'restaurant');
check('spa keyword matches salon recipe', pickRecipe({ ...ROOFER, industry: 'Med Spa' }).id === 'salon_spa');
check('recommended_site_type wins over industry', pickRecipe({ ...ROOFER, industry: 'Pizzeria', recommended_site_type: 'contractor_lead_gen' }).id === 'contractor_lead_gen');
// "Consulting" used to fall through to contractor; the expanded catalog now routes it properly.
check('consulting routes to the professional recipe', pickRecipe({ ...ROOFER, industry: 'Quantum Widget Consulting' }).id === 'legal_professional');

// fallback assembly
{
  const spec = assembleFallbackSpec(ROOFER);
  check('fallback: hero first', spec.sections[0].type === 'hero');
  check('fallback: has a conversion CTA section', spec.sections.some((s) => s.type === 'quote' || s.type === 'ctaBanner'));
  check('fallback: hero image uses first USABLE photo', spec.sections[0].props.image === 'https://x/1.jpg');
  check('fallback: seo title carries name + location', spec.seo.title.includes("Joe's Roofing") && spec.seo.title.includes('Lake Geneva'));
  check('fallback: nav derived from sections', spec.nav.length > 2 && spec.nav.every((n) => spec.sections.some((s) => s.type === n.anchor)));
  const noPhotos = assembleFallbackSpec({ ...ROOFER, photos: [] });
  check('fallback: photo sections dropped when no usable photos', !noPhotos.sections.some((s) => s.type === 'gallery' || s.type === 'showcase'));
}

// normalization
{
  const raw = {
    logoText: "Joe's|Roofing",
    tagline: 'Storm damage specialists',
    theme: { primary: '210 80% 40%', radius: 999, displayFont: 'Sora<script>', tone: 'bold' },
    sections: [
      { type: 'services', props: { heading: 'Our services', services: [{ name: 'Roof repair', blurb: 'x' }] } },
      { type: 'hero', props: { heading: 'H', image: 'https://x/2.jpg' } }, // flagged photo — must be replaced
      { type: 'notARealSection', props: {} },
      { type: 'reviews', props: { reviews: [{ author: 'Fabricated', text: 'Model made this up' }] } },
    ],
    seo: { title: 'T', description: 'D', keywords: ['k'] },
  };
  const spec = normalizeSpec(raw, ROOFER);
  check('normalize: unknown section dropped', !spec.sections.some((s) => (s.type as string) === 'notARealSection'));
  check('normalize: hero moved first', spec.sections[0].type === 'hero');
  check('normalize: flagged hero image replaced with usable photo', spec.sections[0].props.image === 'https://x/1.jpg');
  check('normalize: reviews re-injected from profile (model fabrications discarded)',
    (spec.sections.find((s) => s.type === 'reviews')?.props.reviews as { text: string }[])[0].text === 'Fast and clean work.');
  check('normalize: radius clamped', spec.theme.radius <= 28);
  check('normalize: invalid font falls back to recipe default', spec.theme.displayFont === 'Sora');
  check('normalize: valid theme override kept', spec.theme.primary === '210 80% 40%');
  check('normalize: CTA floor enforced', spec.sections.some((s) => s.type === 'quote' || s.type === 'ctaBanner'));
  check('normalize: garbage input still yields a complete site', normalizeSpec('nonsense', ROOFER).sections.length > 5);
}

// slug + nav helpers
check('previewSlug strips punctuation', previewSlug("Joe's Roofing & Sons!") === 'joes-roofing-sons');
check('navFor caps at 6 entries', navFor(RECIPES[0].sections.map((type) => ({ type, props: {} })), 'Quote').length <= 6);

// ---------------------------------------------------------------------------
// Business-intelligence layer (strategy / audit / critique normalizers)
// ---------------------------------------------------------------------------
{
  const { fallbackStrategy, normalizeStrategy, fallbackAudit, normalizeAudit, gradeFor, normalizeCritique, critiqueWarrantsRefine } =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    await import('./strategy');

  const fs = fallbackStrategy(ROOFER);
  check('strategy fallback is complete', !!fs.positioning && !!fs.hero_strategy && fs.trust_builders.length > 0);
  check('strategy fallback grounds proof in profile', fs.differentiators[0].includes('4.8'));
  const ns = normalizeStrategy({ positioning: 'The storm-response roofers of Walworth County.', differentiators: ['24h storm response'] }, ROOFER);
  check('strategy normalize keeps model fields', ns.positioning.includes('storm-response') && ns.differentiators[0] === '24h storm response');
  check('strategy normalize patches missing fields from fallback', ns.trust_builders.length > 0 && ns.offer_strategy.length > 0);
  check('strategy normalize survives garbage', normalizeStrategy('junk', ROOFER).positioning === fs.positioning);

  const fa = fallbackAudit({ ...ROOFER, website: 'http://old.example', current_website_score: 38 });
  check('audit fallback carries profile score + grade', fa.score === 38 && fa.grade === 'F' && fa.problems.length > 0);
  check('audit no-website profile scores low', fallbackAudit({ ...ROOFER, website: undefined, current_website_score: undefined }).score === 15);
  check('gradeFor bands', gradeFor(92) === 'A' && gradeFor(72) === 'C' && gradeFor(10) === 'F');
  const na = normalizeAudit({ score: 250, problems: [{ issue: 'not mobile friendly' }], gains: ['More quote requests'] }, ROOFER);
  check('audit normalize clamps score + fills impact', na.score === 100 && na.problems[0].impact.length > 10);
  check('audit normalize keeps model gains', na.gains[0] === 'More quote requests');

  const crit = normalizeCritique({ would_buy: false, feels_like_my_business: 4, issues: [{ section: 'hero', problem: 'Generic headline', fix: 'Name the storm-response specialty' }] });
  check('critique normalize parses issues', crit.issues.length === 1 && !crit.would_buy);
  check('bad critique warrants refine', critiqueWarrantsRefine(crit));
  check('clean critique skips refine', !critiqueWarrantsRefine(normalizeCritique({ would_buy: true, feels_like_my_business: 9, issues: [] })));
  check('critique normalize survives garbage', normalizeCritique(null).feels_like_my_business === 7);
}

// ---------------------------------------------------------------------------
// Recipe coverage + variant plumbing (the "many industries" expansion)
// ---------------------------------------------------------------------------
{
  check('recipe catalog covers 11+ industries', RECIPES.length >= 11);
  check('every recipe has a full valid theme', RECIPES.every((r) =>
    /%/.test(r.theme.primary) && !!r.theme.displayFont && !!r.theme.bodyFont && r.sections[0] === 'hero'));
  const cases: [string, string][] = [
    ['auto repair shop', 'auto_services'], ['family dentist', 'dental_medical'],
    ['personal injury law firm', 'legal_professional'], ['real estate broker', 'real_estate'],
    ['crossfit gym', 'fitness'], ['flower boutique', 'retail_boutique'],
    ['dog grooming', 'pet_care'], ['wedding photography studio', 'photography_events'],
  ];
  for (const [industry, expected] of cases) {
    check(`pickRecipe("${industry}") → ${expected}`,
      pickRecipe({ business_name: 'X', industry, services: ['a'], photos: [] }).id === expected);
  }
  check('unknown industry still falls back to contractor',
    pickRecipe({ business_name: 'X', industry: 'zeppelin polishing', services: ['a'], photos: [] }).id === 'contractor_lead_gen');

  // variant survives normalization (the renderer dispatches on it — dropping it kills layouts)
  const withVariant = normalizeSpec({ sections: [{ type: 'hero', variant: 'split', props: { heading: 'Hi' } }] }, ROOFER);
  check('normalizeSpec preserves section variant', withVariant.sections[0].variant === 'split');
}

console.log(`\npreview-spec.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
