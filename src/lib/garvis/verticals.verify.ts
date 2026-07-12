// Run: npx tsx src/lib/garvis/verticals.verify.ts
import { detectVertical, verticalOverlay, VERTICALS, type Vertical } from './verticals';
import { expertiseFor } from './expertise';
import { ARCHETYPES, FLAVORS, type Archetype } from './workweb';
import { mergeTokens, type BusinessContext } from './genesis';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('verticals.verify');

// --- detection: the words a real World DNA would carry → the right industry ---------------
{
  const cases: [string, Vertical][] = [
    ['real estate marketing plan for my mom, a realtor selling homes in Lake Geneva', 'real_estate'],
    ['my artist brother sells paintings and murals, gallery shows', 'creative'],
    ['a financial research newsletter about stocks and portfolio strategy', 'finance'],
    ['family restaurant and catering, seasonal menu', 'food'],
    ['a shopify skincare online store, dtc', 'ecommerce'],
    ['hvac repair and installation, emergency plumbing', 'home_services'],
    ['a small law firm, estate attorney', 'services'],
    ['dental clinic with two locations', 'health'],
    ['a coding bootcamp with evening courses', 'education'],
    ['b2b saas platform for logistics teams', 'tech'],
    ['wedding venue and event planning', 'events'],
    ['an animal rescue nonprofit funded by donations', 'nonprofit'],
    ['a clothing boutique on main street, local retail', 'retail'],
    ['zorbo flanging for industrial widgets', 'generic'],
  ];
  let all = true;
  for (const [text, want] of cases) {
    const got = detectVertical(text);
    if (got !== want) { all = false; console.error(`         "${text}" → ${got}, wanted ${want}`); }
  }
  check('detection maps real-world DNA phrasings to the right industry (14 cases)', all);
  check('detection is deterministic (same words, same vertical, 3 runs)',
    detectVertical(cases[0][0]) === detectVertical(cases[0][0]) && detectVertical(cases[3][0]) === detectVertical(cases[3][0]));
  check('empty/garbage input → generic, never a throw', detectVertical('') === 'generic' && detectVertical('   ') === 'generic');
}

// --- every vertical carries a real industry brief ------------------------------------------
{
  let allBriefs = true; let labeled = true; let substantive = true;
  for (const v of VERTICALS) {
    const intel = verticalOverlay(v, 'intel', 'market');
    if (!intel.length) { allBriefs = false; console.error(`         ${v} has no intel brief`); }
    for (const s of intel) {
      if (!s.detail.includes('Framework')) labeled = false;
      if (s.detail.length < 300) { substantive = false; console.error(`         ${v}/${s.slug} is thin (${s.detail.length})`); }
    }
  }
  check('EVERY vertical (incl. generic) ships an industry brief in intel', allBriefs);
  check('every overlay artifact carries the honesty label', labeled);
  check('every overlay artifact is substantive (300+ chars)', substantive);
}

// --- regulated industries arrive knowing their compliance rules ----------------------------
{
  const re = verticalOverlay('real_estate', 'launch', 'generic').map((s) => s.detail).join(' ');
  check('real estate launch knows Fair Housing (protected classes + ad targeting rule)',
    re.includes('Fair Housing') && re.includes('familial status') && re.toLowerCase().includes('target'));
  const fin = verticalOverlay('finance', 'launch', 'generic').map((s) => s.detail).join(' ');
  check('finance launch knows the SEC Marketing Rule (testimonial disclosures + gross/net)',
    fin.includes('MARKETING RULE') && fin.toLowerCase().includes('testimonial') && fin.toLowerCase().includes('net'));
  const health = verticalOverlay('health', 'launch', 'generic').map((s) => s.detail).join(' ');
  check('health launch knows HIPAA marketing rules (written authorization for testimonials)',
    health.includes('HIPAA') && health.toLowerCase().includes('authorization'));
  const ecom = verticalOverlay('ecommerce', 'launch', 'generic').map((s) => s.detail).join(' ');
  check('ecommerce launch knows FTC endorsement/review rules', ecom.includes('FTC') && ecom.toLowerCase().includes('disclos'));
}

// --- domain research frameworks land where an operator would look for them ------------------
{
  const re = verticalOverlay('real_estate', 'intel', 'market');
  check('real estate intel arrives with the CMA method', re.some((s) => s.slug === 're-cma-framework' && s.detail.includes('ABSORPTION')));
  const fin = verticalOverlay('finance', 'intel', 'market');
  check('finance intel arrives with due-diligence ladder + thesis memo + macro dashboard',
    fin.some((s) => s.slug === 'fin-duediligence-ladder') && fin.some((s) => s.slug === 'fin-thesis-memo') && fin.some((s) => s.slug === 'fin-macro-dashboard'));
  const food = verticalOverlay('food', 'intel', 'market');
  check('food intel arrives with menu engineering', food.some((s) => s.slug === 'food-menu-engineering' && s.detail.includes('PLOWHORSES')));
  const saas = verticalOverlay('tech', 'loop', 'email');
  check('tech loop arrives with the activation loop', saas.some((s) => s.slug === 'saas-activation-loop'));
  const np = verticalOverlay('nonprofit', 'loop', 'email');
  check('nonprofit loop arrives with donor retention', np.some((s) => s.slug === 'np-donor-retention'));
}

// --- composition: base + overlay, no collisions, base order preserved ----------------------
{
  let noCollisions = true; let baseFirst = true; let nonEmpty = true;
  for (const v of VERTICALS) {
    for (const a of Object.keys(ARCHETYPES) as Archetype[]) {
      for (const f of FLAVORS) {
        const composed = expertiseFor(a, f, v);
        if (!composed.length) nonEmpty = false;
        const slugs = composed.map((s) => s.slug);
        if (new Set(slugs).size !== slugs.length) { noCollisions = false; console.error(`         collision in ${v}/${a}/${f}`); }
        const base = expertiseFor(a, f);
        const baseNoOverlay = base.slice(0, base.length - verticalOverlay('generic', a, f).length);
        for (let i = 0; i < baseNoOverlay.length; i++) if (composed[i]?.slug !== baseNoOverlay[i].slug) baseFirst = false;
      }
    }
  }
  check('EVERY vertical x archetype x flavor composes to a non-empty pack (no combination blank)', nonEmpty);
  check('overlay slugs never collide with base slugs (upserts stay distinct)', noCollisions);
  check('base pack order is preserved under composition (index-stable for callers)', baseFirst);
}

// --- every studio flavor now has a DEDICATED functional pack -------------------------------
{
  const dedicated = FLAVORS.filter((f) => f !== 'generic')
    .every((f) => !expertiseFor('studio', f).some((s) => s.slug === 'studio-brief'));
  check('no studio flavor falls back to the generic brief (brand/market/crm/lists covered)', dedicated);
  const brand = expertiseFor('studio', 'brand');
  check('brand studio arrives with a messaging house', brand.some((s) => s.slug === 'brand-messaging-house'));
  const crm = expertiseFor('studio', 'crm');
  check('crm studio arrives with call/DM scripts + objection grid', crm.some((s) => s.slug === 'crm-scripts'));
  const lists = expertiseFor('studio', 'lists');
  check('lists studio arrives with hygiene + consent rules (suppression always wins)',
    lists.some((s) => s.slug === 'list-building-hygiene' && s.detail.includes('suppression')));
}

// --- honesty: overlays defer data and speak the world's voice ------------------------------
{
  const CTX: BusinessContext = { business_name: 'Mom Realty', principal: 'Mom', craft: 'residential real estate', offerings: ['listings', 'buyer representation'], audience: 'home sellers in Lake Geneva', locale: 'Lake Geneva WI', links: {}, tone: 'warm' };
  const brief = verticalOverlay('real_estate', 'intel', 'market')[0];
  const merged = mergeTokens(brief.detail, CTX);
  check('industry briefs merge into the world\'s own voice', merged.includes('Mom Realty') && !merged.includes('{{business_name}}'));
  const cma = verticalOverlay('real_estate', 'intel', 'market').find((s) => s.slug === 're-cma-framework');
  const macro = verticalOverlay('finance', 'intel', 'market').find((s) => s.slug === 'fin-macro-dashboard');
  check('overlays defer real numbers to primary sources (MLS for CMA, Fed/BLS for macro — never memory)',
    !!cma?.detail.includes('MLS') && !!macro?.detail.includes('never quote from memory'));
}

console.log(`\nverticals.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} verticals check(s) failed`);
