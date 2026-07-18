// src/lib/preview/spec.verify.ts
// Dependency-free checks for the pure half of the Business Website Preview Engine.
// Run: npm run verify:preview  (mirrors the other *.verify.ts files)

import {
  parseBusinessProfile, pickRecipe, assembleFallbackSpec, normalizeSpec,
  usablePhotos, usableReviews, previewSlug, navFor, RECIPES, FLAIR_DEVICES, sceneKindFor, restraintFor,
  seededVariant, SECTION_VARIANTS, FONT_LIBRARY,
  type BusinessProfile,
} from './spec';
import { huntImagePrompts, huntArtPrompts, paletteHueName } from '../garvis/clientHuntBuild';

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
  check('normalize: unknown variant replaced by the seeded rotation (deterministic, whitelisted)',
    v.sections.find((s) => s.type === 'services')?.variant === seededVariant(ROOFER.business_name, 'services', recipe)
    && ['cards', 'rows'].includes(v.sections.find((s) => s.type === 'services')?.variant ?? ''));
  check('normalize: ctaBanner giant kept', v.sections.find((s) => s.type === 'ctaBanner')?.variant === 'giant');
  const fb = assembleFallbackSpec(ROOFER);
  check('fallback: sections carry seeded, whitelisted variants',
    fb.sections.every((s) => SECTION_VARIANTS[s.type] === undefined || SECTION_VARIANTS[s.type]!.includes(s.variant ?? '')));
  check('seeded variants: same business always gets the same composition',
    seededVariant("Joe's Roofing", 'ctaBanner', recipe) === seededVariant("Joe's Roofing", 'ctaBanner', recipe));
  check('seeded variants: neighbors diverge (anti-sameness — 20/20 sites shared the giant closer)',
    new Set(['Alpha Co', 'Bravo LLC', 'Carter & Sons', 'Delta Works', 'Echo Trades']
      .map((n) => `${seededVariant(n, 'hero', recipe)}|${seededVariant(n, 'ctaBanner', recipe)}`).values()).size >= 2);
  check('seeded variants: hero rotation never lands on the showpiece variants (portal/layers are opt-in)',
    ['Alpha Co', 'Bravo LLC', 'Carter & Sons', 'Delta Works', 'Echo Trades', 'Foxtrot Inc']
      .every((n) => !['portal', 'layers'].includes(seededVariant(n, 'hero', recipe) ?? '')));
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
  const [wide, tight] = huntImagePrompts('Plumbing', 'bold, direct')!;
  check('image prompts are trade-specific (plumber → copper pipes)', /copper pipes/i.test(wide) && /macro/i.test(tight));
  check('image prompts carry the hard honesty rules (no people/text/logos)',
    [wide, tight].every((p) => /No people/.test(p) && /no logos/.test(p) && /no text/i.test(p)));
  const [gw] = huntImagePrompts('Notary Services', null)!;
  check('unknown trade still gets a generic still-life prompt', /notary services trade/i.test(gw));
  check('image prompts refuse dignified categories (belt to the worker gate\'s suspenders)',
    huntImagePrompts('Funeral Home', null) === null && huntArtPrompts('Funeral Home', null) === null);
  check('image prompts carry the site palette when hinted',
    /copper|amber|orange/i.test(huntImagePrompts('Plumbing', null, '16 78% 44%')![0])
    && /deep blue|slate/i.test(huntArtPrompts('Plumbing', null, '210 90% 40%')!.backdrop)
    && paletteHueName('160 30% 32%') === 'deep green and forest tones');
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

  // 20-site review finding: role assets leaked into content slots (a wrench in the about section)
  const roleOnly = {
    ...ROOFER,
    photos: [
      { url: 'https://x/bg.png', alt: 'ai-backdrop', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
      { url: 'https://x/obj.png', alt: 'ai-object', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
    ],
  };
  const leaky = normalizeSpec({ sections: [
    { type: 'hero', props: { image: 'https://x/obj.png' } },
    { type: 'about', props: { heading: 'A', body: 'b', image: 'https://x/obj.png' } },
    { type: 'gallery', props: {} },
    { type: 'showcase', props: {} },
  ] }, roleOnly);
  check('leak fix: the object never becomes a hero/about image; backdrop backs the hero',
    leaky.sections.find((s) => s.type === 'hero')?.props.image === 'https://x/bg.png'
    && leaky.sections.find((s) => s.type === 'about')?.props.image === undefined);
  check('leak fix: galleries/showcases drop when only role assets exist',
    !leaky.sections.some((s) => s.type === 'gallery' || s.type === 'showcase'));
  const fbRole = assembleFallbackSpec(roleOnly);
  check('leak fix: fallback equally guarded (hero uses backdrop, no photo sections)',
    fbRole.sections[0].props.image === 'https://x/bg.png'
    && !fbRole.sections.some((s) => s.type === 'gallery' || s.type === 'showcase'));
}

// appropriateness: the dignified restraint guard (iteration-loop finding — a funeral home was
// routed to the contractor recipe and got 'Get a Free Quote' + giant type; never again)
{
  const funeral = { ...ROOFER, business_name: 'Meadowbrook Funeral Home', industry: 'Funeral Home' };
  check('restraintFor: grief-adjacent categories detected', restraintFor('Funeral Home') === 'dignified'
    && restraintFor('Cremation Services') === 'dignified' && restraintFor('Roofing') === null);
  check('pickRecipe: funeral routes to care_services (never contractor)', pickRecipe(funeral).id === 'care_services');
  check('care_services CTA is never sales-y', pickRecipe(funeral).cta === 'Contact Us');
  const forced = normalizeSpec({
    theme: { motion: 'cinematic', flair: ['marquee', 'grain', 'outline'] },
    sections: [
      { type: 'hero', props: {}, variant: 'stacked' },
      { type: 'scene', props: { headline: 'x' } },
      { type: 'ctaBanner', props: {}, variant: 'giant' },
    ],
  }, funeral);
  check('restraint: model-chosen cinematic forced to calm', forced.theme.motion === 'calm');
  check('restraint: loud flair stripped (quiet textures only, max 1)',
    (forced.theme.flair ?? []).every((f) => f === 'dots' || f === 'ruled') && (forced.theme.flair ?? []).length <= 1);
  check('restraint: scenes removed', !forced.sections.some((s) => s.type === 'scene'));
  check('restraint: hero forced editorial, giant closer forced band',
    forced.sections.find((s) => s.type === 'hero')?.variant === 'editorial'
    && forced.sections.find((s) => s.type === 'ctaBanner')?.variant === 'band');
  const fbFuneral = assembleFallbackSpec(funeral);
  check('restraint: fallback path equally guarded',
    fbFuneral.theme.motion === 'calm' && !fbFuneral.sections.some((s) => s.type === 'scene')
    && fbFuneral.sections.find((s) => s.type === 'hero')?.variant === 'editorial');
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

// ---------------------------------------------------------------------------
// Deep-audit fix wave: routing word-boundaries, font whitelist, HSL ranges,
// injection parity, nav recompute, dedupe, whitelist bypass, marquee host
// ---------------------------------------------------------------------------
{
  const mk = (industry: string): BusinessProfile => ({ business_name: 'X', industry, services: ['a'], photos: [] });
  // Substring misroutes that shipped wrong designs in the live hunt:
  check('routing: barber never gets the restaurant recipe (\'bar\' in "Barbering")',
    pickRecipe(mk('Barbering')).id === 'salon_spa' && pickRecipe(mk('Barber Shop')).id === 'salon_spa');
  check('routing: lawn care never gets the law-firm recipe (\'law\' in "Lawn")',
    pickRecipe(mk('Lawn Care')).id === 'contractor_lead_gen');
  check('routing: carpet cleaning never gets pet care (\'pet\' in "carpet")',
    pickRecipe(mk('Carpet Cleaning')).id === 'contractor_lead_gen');
  check('routing: dog training goes to pet care, not the gym',
    pickRecipe(mk('Dog Training')).id === 'pet_care');
  check('routing: floral design + eye care route to their real verticals (TRADE_NAMES alignment)',
    pickRecipe(mk('Floral Design')).id === 'retail_boutique' && pickRecipe(mk('Eye Care')).id === 'dental_medical');
  check('routing: a real bar still gets the restaurant recipe',
    pickRecipe(mk('Bar & Grill')).id === 'restaurant');

  // Font whitelist: hallucinated faces used to 404 at Google Fonts → silent system sans.
  const fontSpec = normalizeSpec({ theme: { displayFont: 'Totally Invented Serif', bodyFont: 'lato' } }, ROOFER);
  check('fonts: off-library face falls to the recipe pairing', fontSpec.theme.displayFont === pickRecipe(ROOFER).theme.displayFont);
  check('fonts: library face accepted case-insensitively (canonical casing restored)', fontSpec.theme.bodyFont === 'Lato');
  check('fonts: library covers every recipe pairing', RECIPES.every((r) =>
    FONT_LIBRARY.some((f) => f.toLowerCase() === r.theme.displayFont.toLowerCase())
    && FONT_LIBRARY.some((f) => f.toLowerCase() === r.theme.bodyFont.toLowerCase())));

  // HSL range + radius NaN
  const hslSpec = normalizeSpec({ theme: { primary: '720 300% 50%', bg: '20 30% 96%', radius: Number.NaN } }, ROOFER);
  check('theme: out-of-range HSL rejected, in-range kept, NaN radius rejected',
    hslSpec.theme.primary === pickRecipe(ROOFER).theme.primary && hslSpec.theme.bg === '20 30% 96%'
    && Number.isFinite(hslSpec.theme.radius));

  // All-invalid flair must fall to the recipe default, not an empty list
  check('flair: an entirely-invalid flair list falls back to the recipe default (never zero personality)',
    (normalizeSpec({ theme: { flair: ['sparkles', 'lasers'] } }, ROOFER).theme.flair ?? []).length > 0);

  // Injection parity: profile truth rides into hours/quote/map; empty-data sections drop
  const withHours = { ...ROOFER, hours: { Mon: '9-5' }, email: 'joe@x.com', service_area: ['Lake Geneva', 'Elkhorn'] };
  const inj = normalizeSpec({ sections: [
    { type: 'hero', props: {} },
    { type: 'hours', props: {} },
    { type: 'quote', props: { phone: '111-111-1111', email: 'wrong@model.com' } },
    { type: 'map', props: { address: 'Hallucinated St 5' } },
    { type: 'serviceArea', props: { areas: ['Made-up Town'] } },
  ] }, withHours);
  check('injection: hours/quote/map/serviceArea carry PROFILE truth, not model transcription',
    JSON.stringify(inj.sections.find((s) => s.type === 'hours')?.props.hours) === JSON.stringify({ Mon: '9-5' })
    && inj.sections.find((s) => s.type === 'quote')?.props.phone === ROOFER.phone
    && inj.sections.find((s) => s.type === 'quote')?.props.email === 'joe@x.com'
    && inj.sections.find((s) => s.type === 'map')?.props.address === ROOFER.location
    && JSON.stringify(inj.sections.find((s) => s.type === 'serviceArea')?.props.areas) === JSON.stringify(['Lake Geneva', 'Elkhorn']));
  const noHours = normalizeSpec({ sections: [{ type: 'hero', props: {} }, { type: 'hours', props: {} }] }, ROOFER);
  check('injection: an hours section with no profile hours is dropped, never rendered empty',
    !noHours.sections.some((s) => s.type === 'hours'));

  // Nav recompute: anchors must match the FINAL normalized section list (dead-anchor bug)
  const navSpec = normalizeSpec({ sections: [
    { type: 'hero', props: {} }, { type: 'services', props: { services: [{ name: 'a', blurb: 'b' }] } },
    { type: 'faq', props: { faqs: [{ q: 'q', a: 'a' }] } },
  ] }, ROOFER);
  check('nav: derived from the normalized page (no anchors to sections that do not exist)',
    navSpec.nav.every((n) => navSpec.sections.some((s) => s.type === n.anchor))
    && navSpec.nav.some((n) => n.anchor === 'faq'));

  // Dedupe: a model emitting two heroes / three banners renders one of each
  const dup = normalizeSpec({ sections: [
    { type: 'hero', props: { heading: 'One' } }, { type: 'hero', props: { heading: 'Two' } },
    { type: 'ctaBanner', props: {} }, { type: 'ctaBanner', props: {} }, { type: 'ctaBanner', props: {} },
  ] }, ROOFER);
  check('dedupe: duplicate section types collapse to the first occurrence',
    dup.sections.filter((s) => s.type === 'hero').length === 1
    && dup.sections.filter((s) => s.type === 'ctaBanner').length === 1);

  // Whitelist bypass: a model-written props.variant must never reach the renderer
  const bypass = normalizeSpec({ sections: [{ type: 'hero', variant: 'editorial', props: { variant: 'layers' } }] }, ROOFER);
  check('whitelist: props.variant stripped (renderer receives only the validated variant)',
    bypass.sections[0].variant === 'editorial' && bypass.sections[0].props.variant === undefined);

  // Marquee needs a trust host — flair pointing nowhere is stripped
  const noTrust = normalizeSpec({ theme: { flair: ['marquee'] }, sections: [{ type: 'hero', props: {} }] }, ROOFER);
  check('flair: marquee stripped when the page has no trust section to host it',
    !(noTrust.theme.flair ?? []).includes('marquee') && (noTrust.theme.flair ?? []).length > 0);

  // Dignified categories: generated imagery stripped at the spec layer too
  const funeralAi: BusinessProfile = { ...ROOFER, industry: 'Funeral Home', photos: [
    { url: 'https://x/still.png', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
  ] };
  check('restraint: AI still-lifes never reach a dignified page (normalize + fallback)',
    !JSON.stringify(normalizeSpec({}, funeralAi).sections).includes('https://x/still.png')
    && !JSON.stringify(assembleFallbackSpec(funeralAi).sections).includes('https://x/still.png'));

  // Honest gallery heading when every content photo is generated
  const aiGallery: BusinessProfile = { ...ROOFER, photos: [
    { url: 'https://x/c1.png', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
    { url: 'https://x/c2.png', source_type: 'ai_generated', can_use_in_preview: true, can_publish: false },
  ] };
  const fbAi = assembleFallbackSpec(aiGallery);
  const gal = fbAi.sections.find((s) => s.type === 'showcase' || s.type === 'gallery');
  check('honesty: an all-AI gallery is never titled "Recent work"',
    !gal || !/recent work|our work/i.test(String(gal.props.heading)));
}

console.log(`\npreview-spec.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
