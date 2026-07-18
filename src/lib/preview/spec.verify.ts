// src/lib/preview/spec.verify.ts
// Dependency-free checks for the pure half of the Business Website Preview Engine.
// Run: npm run verify:preview  (mirrors the other *.verify.ts files)

import {
  parseBusinessProfile, pickRecipe, assembleFallbackSpec, normalizeSpec,
  usablePhotos, usableReviews, previewSlug, navFor, RECIPES, FLAIR_DEVICES, sceneKindFor,
  type BusinessProfile,
} from './spec';
import { huntImagePrompts, huntArtPrompts } from '../garvis/clientHuntBuild';

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

// signature-device flair (the app builder's personality kit, on prospect previews)
{
  check('recipes: every flair device is whitelisted', RECIPES.every((r) =>
    (r.theme.flair ?? []).every((f) => (FLAIR_DEVICES as readonly string[]).includes(f))));
  check('fallback: spec carries the recipe flair defaults (never zero personality)',
    (assembleFallbackSpec(ROOFER).theme.flair ?? []).length > 0);
  const flaired = normalizeSpec({ theme: { flair: ['grain', 'bogus-device', 'marquee', 'dots', 'ruled'] } }, ROOFER);
  check('normalize: unknown flair devices dropped, list capped at 3',
    JSON.stringify(flaired.theme.flair) === JSON.stringify(['grain', 'marquee', 'dots']));
  const noFlair = normalizeSpec({ theme: { primary: '210 80% 40%' } }, ROOFER);
  check('normalize: absent flair falls back to the recipe default',
    JSON.stringify(noFlair.theme.flair) === JSON.stringify(pickRecipe(ROOFER).theme.flair));
}

// motion tier + structural variants (the uniqueness contract)
{
  const recipe = pickRecipe(ROOFER);
  check('recipes: every recipe declares a motion tier',
    RECIPES.every((r) => ['calm', 'lively', 'cinematic'].includes(r.theme.motion ?? '')));
  check('normalize: bogus motion falls back to the recipe tier',
    normalizeSpec({ theme: { motion: 'explosive' } }, ROOFER).theme.motion === recipe.theme.motion);
  check('normalize: valid motion kept',
    normalizeSpec({ theme: { motion: 'calm' } }, ROOFER).theme.motion === 'calm');
  const v = normalizeSpec({ sections: [
    { type: 'hero', props: { heading: 'H' }, variant: 'editorial' },
    { type: 'services', props: {}, variant: 'sideways-spiral' },
    { type: 'ctaBanner', props: {}, variant: 'giant' },
  ] }, ROOFER);
  check('normalize: whitelisted section variant kept', v.sections.find((s) => s.type === 'hero')?.variant === 'editorial');
  check('normalize: unknown variant replaced by the recipe default composition',
    v.sections.find((s) => s.type === 'services')?.variant === recipe.variants?.services);
  check('normalize: ctaBanner giant kept', v.sections.find((s) => s.type === 'ctaBanner')?.variant === 'giant');
  const fb = assembleFallbackSpec(ROOFER);
  check('fallback: sections carry the recipe variant defaults',
    fb.sections.every((s) => recipe.variants?.[s.type] === undefined || s.variant === recipe.variants[s.type]));
  check('recipes: distinct verticals get distinct page architecture (hero variants differ)',
    new Set(RECIPES.map((r) => r.variants?.hero ?? 'fullbleed')).size >= 3);
}

// trade scenes: hand-built visuals, deterministically keyed — never a generic placeholder
{
  check('sceneKindFor: plumber → pipe, electrician → circuit, roofer → rain',
    sceneKindFor('Plumbing') === 'pipe' && sceneKindFor('Electrical Services') === 'circuit' && sceneKindFor('Roofing') === 'rain');
  check('sceneKindFor: no scene for trades without one', sceneKindFor('Hair & Beauty') === null && sceneKindFor('Legal Services') === null);
  const plumber = { ...ROOFER, industry: 'Plumbing' };
  const withScene = normalizeSpec({ sections: [
    { type: 'hero', props: { heading: 'H' } },
    { type: 'scene', props: { headline: 'Leaks lose.', scene: 'gauge' } },   // model may NOT pick the visual
    { type: 'scene', props: { headline: 'Second scene' } },                  // one per page
  ] }, plumber);
  const scenes = withScene.sections.filter((s) => s.type === 'scene');
  check('normalize: scene kind stamped from the trade, never model-chosen', scenes.length === 1 && scenes[0].props.scene === 'pipe');
  check('normalize: model punchline kept', scenes[0].props.headline === 'Leaks lose.');
  const salonScene = normalizeSpec({ sections: [{ type: 'hero', props: {} }, { type: 'scene', props: {} }] }, { ...ROOFER, industry: 'Hair & Beauty' });
  check('normalize: scene dropped for trades with no vignette', !salonScene.sections.some((s) => s.type === 'scene'));
  const fbPlumber = assembleFallbackSpec(plumber);
  check('fallback: plumber gets the pipe scene with honest default copy',
    fbPlumber.sections.some((s) => s.type === 'scene' && s.props.scene === 'pipe' && s.props.headline === "Leaks don't wait."));
  const fbRoofer = assembleFallbackSpec(ROOFER);
  check('fallback: roofer (contractor recipe) gets the rain scene', fbRoofer.sections.some((s) => s.type === 'scene' && s.props.scene === 'rain'));
  check('scene never enters the nav', !fbPlumber.nav.some((n) => n.anchor === 'scene'));
}

// AI concept imagery: honest prompts + the footer disclosure flag
{
  const [wide, tight] = huntImagePrompts('Plumbing', 'bold, direct');
  check('image prompts are trade-specific (plumber → copper pipes)', /copper pipes/i.test(wide) && /macro/i.test(tight));
  check('image prompts carry the hard honesty rules (no people/text/logos)',
    [wide, tight].every((p) => /No people/.test(p) && /no logos/.test(p) && /no text/i.test(p)));
  const [gw] = huntImagePrompts('Notary Services', null);
  check('unknown trade still gets a generic still-life prompt', /notary services trade/i.test(gw));
  const aiProfile = { ...ROOFER, photos: [{ url: 'https://x/ai.png', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false }] };
  check('aiImagery flag set when photos are AI-generated', assembleFallbackSpec(aiProfile).aiImagery === true
    && normalizeSpec({}, aiProfile).aiImagery === true);
  check('aiImagery flag absent for real photos', assembleFallbackSpec(ROOFER).aiImagery === undefined);
  check('portal is a whitelisted hero variant',
    normalizeSpec({ sections: [{ type: 'hero', props: {}, variant: 'portal' }] }, ROOFER).sections[0].variant === 'portal');
}

// layered depth-sandwich hero: role-tagged AI pair rides in by ROLE, never by model URL
{
  const art = huntArtPrompts('Plumbing', 'bold');
  check('art prompts: plumber gets a pipe-wrench object on transparent background',
    !!art && /pipe wrench/i.test(art.object) && /transparent background/i.test(art.object));
  check('art prompts: object is explicitly photoreal, never cartoon',
    !!art && /photorealistic/i.test(art.object) && /not cartoon/i.test(art.object));
  check('art prompts: backdrop is abstract poster art with the hard rules',
    !!art && /No people/.test(art.backdrop) && /no text/i.test(art.backdrop) && /no buildings/i.test(art.backdrop));
  check('art prompts: trades without an iconic object get none (still-life path instead)',
    huntArtPrompts('Hair & Beauty', null) === null);
  const layered = {
    ...ROOFER,
    photos: [
      { url: 'https://x/bg.png', alt: 'ai-backdrop', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
      { url: 'https://x/obj.png', alt: 'ai-object', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
    ],
  };
  const hero = normalizeSpec({ sections: [{ type: 'hero', props: { bgImage: 'https://evil/x.png' }, variant: 'layers' }] }, layered)
    .sections.find((s) => s.type === 'hero')!;
  check('normalize: layers kept as a variant, role assets injected from PROFILE (model URLs overwritten)',
    hero.variant === 'layers' && hero.props.bgImage === 'https://x/bg.png' && hero.props.objectImage === 'https://x/obj.png');
  const noRoles = normalizeSpec({ sections: [{ type: 'hero', props: {}, variant: 'layers' }] }, ROOFER).sections[0];
  check('normalize: layers without the role pair carries no asset props (renderer falls back)',
    noRoles.props.bgImage === undefined && noRoles.props.objectImage === undefined);
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
