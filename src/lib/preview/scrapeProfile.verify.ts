// Run: npx tsx src/lib/preview/scrapeProfile.verify.ts
import { extractProfileFields, buildProfile, type ScrapeContext } from './scrapeProfileCore';
import { parseBusinessProfile } from './spec';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('scrapeProfile.verify');

// --- extractProfileFields: honest coercion, no invention -----------------------------------
{
  const full = extractProfileFields(`Here is the profile:
{"business_name":"Joe's Roofing","industry":"Roofing","location":"Lake Geneva, WI",
 "services":["Roof replacement","Repairs","Gutter installation"],"hours":"Mon-Fri 8-5",
 "reviews_summary":"Customers praise the fast, tidy crews.","google_rating":4.8,"review_count":63}`);
  check('extracts business_name + industry + services', full.business_name === "Joe's Roofing" && full.industry === 'Roofing' && full.services.length === 3);
  check('extracts a real rating + review count when present', full.google_rating === 4.8 && full.review_count === 63);
  check('extracts location + hours + reviews summary', full.location === 'Lake Geneva, WI' && !!full.hours && !!full.reviews_summary);

  const thin = extractProfileFields(`{"business_name":"Nina Nails","industry":"Nail salon","services":["Manicures"]}`);
  check('unknown rating/reviews are null, NEVER invented', thin.google_rating === null && thin.review_count === null && thin.reviews_summary === null);

  const garbage = extractProfileFields('the model returned prose, not json');
  check('garbage in → empty fields, no throw', garbage.business_name === null && garbage.services.length === 0);
  check('services are capped and string-coerced', extractProfileFields(`{"services":[1,2,"Real one","","x"]}`).services.includes('Real one'));
}

// --- buildProfile: real assets attached, unknowns omitted, honest photo sourcing -----------
{
  const ctx: ScrapeContext = {
    url: 'https://joesroofing.com',
    images: ['https://joesroofing.com/a.jpg', 'https://joesroofing.com/b.jpg'],
    email: 'joe@joesroofing.com',
    auditScore: 42,
    auditIssues: ['Not mobile-friendly', 'Missing page title'],
  };
  const fields = extractProfileFields(`{"business_name":"Joe's Roofing","industry":"Roofing","services":["Roof replacement","Repairs"]}`);
  const raw = buildProfile(fields, ctx);

  check('required fields carried through', raw.business_name === "Joe's Roofing" && raw.industry === 'Roofing' && Array.isArray(raw.services));
  check('website is set to the scraped URL', raw.website === 'https://joesroofing.com');
  check('published email attached', raw.email === 'joe@joesroofing.com');
  check('audit score + issues attached (honest checks)', raw.current_website_score === 42 && Array.isArray(raw.issues) && (raw.issues as string[]).includes('Not mobile-friendly'));

  const photos = raw.photos as { url: string; source_type: string; can_publish: boolean; can_use_in_preview: boolean }[];
  check('their OWN photos attached, sourced as website', photos.length === 2 && photos[0].source_type === 'website');
  check('photos are demo-only (can_publish false — publishing needs licensed assets)', photos.every((p) => p.can_publish === false && p.can_use_in_preview === true));

  // honesty: fields the extractor did NOT provide must be ABSENT, not defaulted/invented
  check('no invented rating/reviews when unknown', !('google_rating' in raw) && !('review_count' in raw) && !('reviews_summary' in raw));
  check('no location key when the page did not show one', !('location' in raw));

  // the built profile passes the canonical validator → the engine can build a demo from it
  const { profile, errors } = parseBusinessProfile(raw);
  check('the assembled profile validates for the site builder', !!profile && errors.length === 0);
}

// --- honesty on a thin page: no fabricated business ----------------------------------------
{
  const thinRaw = buildProfile(extractProfileFields('{}'), { url: 'https://x.com', images: [], email: null, auditScore: 30, auditIssues: [] });
  const { profile } = parseBusinessProfile(thinRaw);
  check('a page with no extractable business → no valid profile (honest failure, not a fake one)', profile === null);
}

// --- photo cap -----------------------------------------------------------------------------
{
  const many = Array.from({ length: 20 }, (_, i) => `https://x.com/${i}.jpg`);
  const raw = buildProfile(extractProfileFields(`{"business_name":"B","industry":"I","services":["S"]}`), { url: 'https://x.com', images: many, email: null, auditScore: null, auditIssues: [] });
  check('photos capped at 12', (raw.photos as unknown[]).length === 12);
  check('no audit score key when audit was unreachable (null)', !('current_website_score' in raw));
}

console.log(`\nscrapeProfile.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} scrapeProfile check(s) failed`);
