// Run: npx tsx src/lib/garvis/clientHuntBuild.verify.ts
import {
  pickHuntTargets, cleanBusinessName, fieldsFromPage, buildHuntProfileRaw, buildHuntPitch, huntRunLine,
  extractSiteFacts,
  type HuntProfileInput,
} from './clientHuntBuild';
import { auditSite, type SiteAudit } from './siteAudit';
import { parseBusinessProfile, assembleFallbackSpec } from '../preview/spec';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('clientHuntBuild.verify');

const serper = {
  organic: [
    { title: "Joe's Roofing | Austin's #1 Roofer", link: 'https://joesroofing.com/', snippet: 'Roof repair and replacement in Austin.' },
    { title: 'Yelp: Best Roofers in Austin', link: 'https://www.yelp.com/search?find_desc=roofers', snippet: 'Directory listing.' },
    { title: 'Acme Roofing Co', link: 'https://www.acmeroof.com/services', snippet: 'Commercial roofing.' },
    { title: 'Joe again', link: 'http://www.joesroofing.com/contact', snippet: 'dup domain, different city' },
    { title: 'No URL business', link: '', snippet: 'has no site' },
  ],
};

// --- pickHuntTargets: real own-sites only, directory-skipped, domain-deduped -------------------
{
  const seen = new Set<string>();
  const targets = pickHuntTargets(serper, 10, seen);
  check('picks only businesses with their OWN site', targets.length === 2);
  check('skips directories (Yelp) and URL-less rows', !targets.some((t) => /yelp/.test(t.url)) && targets.every((t) => !!t.url));
  check('dedupes by domain across the day (joesroofing once)', targets.filter((t) => /joesroofing/.test(t.url)).length === 1);
  check('the shared seen-set now blocks that domain in the next city', pickHuntTargets(serper, 10, seen).every((t) => !/joesroofing/.test(t.url)));
  check('cap bounds how many are built', pickHuntTargets(serper, 1, new Set()).length === 1);
}

// --- cleanBusinessName: name without the slogan half -------------------------------------------
{
  check('strips the tagline after a pipe', cleanBusinessName("Joe's Roofing | Austin's #1 Roofer") === "Joe's Roofing");
  check('strips " - " taglines', cleanBusinessName('Acme Roofing - Trusted Since 1998') === 'Acme Roofing');
  check('keeps a plain name', cleanBusinessName('Bright Dental') === 'Bright Dental');
  check('junk/empty title → null (caller falls back)', cleanBusinessName('') === null && cleanBusinessName('   ') === null);
}

// --- fieldsFromPage: deterministic, invents nothing --------------------------------------------
{
  const f = fieldsFromPage({ title: 'Bright Dental | Smiles', description: 'x' }, 'dentists', 'Bright Dental Search');
  check('business_name from the page title', f.business_name === 'Bright Dental');
  check('industry is the human trade noun, not the raw keyword', f.industry === 'Dental Care');
  check('services is exactly one honest generic (never an invented list)', f.services.length === 1 && f.services[0] === 'Dental Care');
  check('location/rating/reviews are UNKNOWN, not guessed', f.location === null && f.google_rating === null && f.review_count === null && f.reviews_summary === null);
  const f2 = fieldsFromPage({ title: '' }, 'plumbers', 'Bob the Plumber');
  check('junk title falls back to the search-result name', f2.business_name === 'Bob the Plumber');
}

// --- buildHuntProfileRaw → a VALID BusinessProfile → a VALID demo spec -------------------------
{
  const audit: SiteAudit = auditSite({
    url: 'http://joesroofing.com', reachable: true, title: "Joe's Roofing", description: '',
    text: 'We fix roofs. © 2016', hasViewport: false, hasForm: false, emailFound: false,
  }, 2026);

  const input: HuntProfileInput = {
    url: 'http://joesroofing.com', niche: 'roofers', fallbackName: "Joe's Roofing",
    page: { title: "Joe's Roofing | Austin Roofer", description: 'Roof repair' },
    images: ['https://joesroofing.com/hero.jpg', 'https://joesroofing.com/team.jpg'],
    email: 'owner@joesroofing.com',
    audit,
  };
  const raw = buildHuntProfileRaw(input);
  const { profile, errors } = parseBusinessProfile(raw);
  check('the raw profile validates', !!profile && errors.length === 0);
  check('carries the real site + a real audit score (weak site scored)', (raw.website === 'http://joesroofing.com') && typeof raw.current_website_score === 'number');
  check('audit issues rode in (honest problems to name in the pitch)', Array.isArray(raw.issues) && (raw.issues as string[]).length > 0);

  // Honesty: their photos are usable in the demo but NOT publishable.
  const photos = profile!.photos;
  check('their photos are shown in the demo but never publishable', photos.length === 2 && photos.every((p) => p.can_publish === false && p.source_type === 'website'));
  check('the email they published is captured for outreach', profile!.email === 'owner@joesroofing.com');
  check('no location was invented (page never stated one)', profile!.location === undefined);

  // The demo spec is deterministic + always valid (no AI, no network).
  const spec = assembleFallbackSpec(profile!);
  check('a valid demo spec assembles from the profile', !!spec && typeof spec === 'object');
}

// --- an unreachable site: honest, no fake score ------------------------------------------------
{
  const dead = auditSite({ url: 'http://gone.example', reachable: false }, 2026);
  const raw = buildHuntProfileRaw({
    url: 'http://gone.example', niche: 'roofers', fallbackName: 'Gone Roofing',
    page: { title: null }, images: [], email: null, audit: dead,
  });
  check('an unreachable site carries NO invented website score', raw.current_website_score === undefined);
  const { profile } = parseBusinessProfile(raw);
  check('it still validates off the search-result name', !!profile && profile!.business_name === 'Gone Roofing');
}

// --- buildHuntPitch: honest, specific, one link, no pressure -----------------------------------
{
  const { profile } = parseBusinessProfile(buildHuntProfileRaw({
    url: 'http://joesroofing.com', niche: 'roofers', fallbackName: "Joe's Roofing",
    page: { title: "Joe's Roofing" }, images: [], email: 'a@b.com',
    audit: auditSite({ url: 'http://joesroofing.com', reachable: true, title: 'x', text: 'thin', hasViewport: false }, 2026),
  }));
  const url = 'https://app.example/preview-site/joes-roofing-ab12cd';
  const pitch = buildHuntPitch(profile!, url);
  check('the pitch names the business', pitch.includes("Joe's Roofing"));
  check('the pitch includes the preview link exactly once', pitch.split(url).length === 2);
  check('the pitch mentions the current-site concern (a score was observed)', /costing you leads/.test(pitch));
  check('the pitch closes with no pressure', /no obligation/i.test(pitch.toLowerCase()));
  check('no [Name]-style placeholders leak', !/\[[A-Za-z]/.test(pitch));
}

// --- huntRunLine: the honest daily record (discovered + built + queued) ------------------------
{
  check('a dry day says the markets look tapped', /tapped|no new businesses/i.test(huntRunLine('Roofers hunt', 0, 0, 0)));
  const productive = huntRunLine('Roofers hunt', 12, 3, 2);
  check('a productive day reports discovered + built + queued + the send boundary',
    /found 12 new businesses/.test(productive) && /built 3 demos/.test(productive) && /approval/.test(productive) && /Nothing sent on its own/.test(productive));
  check('built-but-no-email is honest that nothing queued', /nothing was queued/.test(huntRunLine('Roofers hunt', 5, 2, 0)));
  check('discovered-but-not-yet-built is still reported', /found 8 new businesses/.test(huntRunLine('Roofers hunt', 8, 0, 0)) && !/built/.test(huntRunLine('Roofers hunt', 8, 0, 0)));
}

// --- extractSiteFacts: only what the page literally says survives ------------------------------
{
  const kowalski = "KOWALSKI PLUMBING & SEWER Serving Fox Lake and the Chain O'Lakes Since 1987 "
    + 'Menu Home Services About Us Welcome to our web site. We are a family owned plumbing company. '
    + 'Services: rodding, sump pumps, water heaters, sewer repair, bathroom remodel. '
    + 'Call us at (847) 555-0134. We accept checks and cash.';
  const f = extractSiteFacts(kowalski, 2026);
  check('named services extracted from the explicit list (all 5)',
    f.services.length === 5 && f.services.includes('Sump Pumps') && f.services.includes('Bathroom Remodel'));
  check('"Since 1987" becomes the established year', f.establishedYear === 1987);
  check('"Serving X and the Y" becomes the service area (leading "the" stripped)',
    f.serviceArea.length === 2 && f.serviceArea[0] === 'Fox Lake' && f.serviceArea[1] === "Chain O'Lakes");
  check('"family owned" (no hyphen) is detected', f.familyOwned === true);
  check('the description is assembled ONLY from observed facts',
    f.description === "Family-owned, serving Fox Lake and Chain O'Lakes since 1987.");
}
{
  const f = extractSiteFacts('Family-owned and operated. We offer drain cleaning and water heater installation.', 2026);
  check('"we offer" verb form also yields services', f.services.length === 2 && f.services[0] === 'Drain Cleaning');
  check('family-owned detected and leads the description', f.familyOwned && f.description === 'Family-owned and operated.');
}
{
  check('empty/null text → no facts, null description', extractSiteFacts(null, 2026).description === null
    && extractSiteFacts('', 2026).services.length === 0);
  check('a nav menu ("Home Services About Us") never yields fake services',
    extractSiteFacts('Menu Home Services About Us Contact Welcome to the site', 2026).services.length === 0);
  check('a future "since" year is rejected', extractSiteFacts('Proudly serving you since 2199.', 2026).establishedYear === null);
  check('"largest 2020 selection" does not fake an est-year', extractSiteFacts('The largest 2020 selection in town', 2026).establishedYear === null);
  check('services are capped at 8', extractSiteFacts(`Services: ${Array.from({ length: 12 }, (_, i) => `service type ${String.fromCharCode(97 + i)}`).join(', ')}.`, 2026).services.length <= 8);
  check('"Established 2003" parses', extractSiteFacts('Established 2003, we do tile work.', 2026).establishedYear === 2003);
}

// --- buildHuntProfileRaw + facts: their words replace the generic placeholder ------------------
{
  const audit = auditSite({ url: 'http://kp.com', reachable: true, title: 'x', text: 'thin', hasViewport: false }, 2026);
  const base: HuntProfileInput = {
    url: 'http://kp.com', niche: 'plumbers', fallbackName: 'Kowalski Plumbing',
    page: { title: 'Kowalski Plumbing' }, images: [], email: null, audit,
  };
  const withFacts = buildHuntProfileRaw({
    ...base,
    facts: { services: ['Rodding', 'Sump Pumps'], establishedYear: 1987, serviceArea: ['Fox Lake'], familyOwned: true, description: 'Family-owned, serving Fox Lake since 1987.' },
  });
  check('extracted services replace the generic trade placeholder',
    Array.isArray(withFacts.services) && (withFacts.services as string[]).join(',') === 'Rodding,Sump Pumps');
  check('service area + description ride into the profile',
    (withFacts.service_area as string[])[0] === 'Fox Lake' && withFacts.description === 'Family-owned, serving Fox Lake since 1987.');
  const noFacts = buildHuntProfileRaw(base);
  check('no facts → the honest generic trade service stands, nothing invented',
    (noFacts.services as string[]).join(',') === 'Plumbing' && noFacts.description === undefined && noFacts.service_area === undefined);
}

console.log(`\nclientHuntBuild.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} clientHuntBuild check(s) failed`);
