// Run: npx tsx src/lib/garvis/placesDiscovery.verify.ts
import {
  normalizeHost, isDirectoryOrSocialUrl, extractCityState, parsePlace, placesQueryText, buildDiscoveryQueries,
  pickNextQuery, exhaustionUpdate, PLACES_FIELD_MASK, type PlaceRaw, type QueryRow,
} from './placesDiscovery';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('placesDiscovery.verify');

// --- the field mask asks for structured data, not a snippet --------------------------------
check('field mask requests phone + website + geo (structured records)', /nationalPhoneNumber/.test(PLACES_FIELD_MASK) && /websiteUri/.test(PLACES_FIELD_MASK) && /location/.test(PLACES_FIELD_MASK));

// --- normalizeHost: the website dedupe key --------------------------------------------------
{
  check('strips scheme + www + path', normalizeHost('https://www.joesroofing.com/services') === 'joesroofing.com');
  check('tolerates a bare host', normalizeHost('joesroofing.com') === 'joesroofing.com');
  check('null in → null out', normalizeHost(null) === null && normalizeHost('') === null);
}

// --- extractCityState: structured first, formatted-address fallback -------------------------
{
  const comp: PlaceRaw['addressComponents'] = [
    { longText: 'Austin', shortText: 'Austin', types: ['locality'] },
    { longText: 'Texas', shortText: 'TX', types: ['administrative_area_level_1'] },
  ];
  check('prefers structured components', JSON.stringify(extractCityState('x', comp)) === JSON.stringify({ city: 'Austin', state: 'TX' }));
  const fromAddr = extractCityState('123 Main St, Dallas, TX 75201, USA');
  check('falls back to the formatted address', fromAddr.city === 'Dallas' && fromAddr.state === 'TX');
  check('unknown location → nulls, not guesses', JSON.stringify(extractCityState(null)) === JSON.stringify({ city: null, state: null }));
}

// --- parsePlace: real records only, honest has_website --------------------------------------
{
  const withSite: PlaceRaw = {
    id: 'places/ABC', displayName: { text: "Joe's Roofing" }, websiteUri: 'https://www.joesroofing.com/',
    nationalPhoneNumber: '(512) 555-0100', formattedAddress: '9 Oak, Austin, TX 78701, USA',
    primaryType: 'roofing_contractor', location: { latitude: 30.26, longitude: -97.74 },
  };
  const a = parsePlace(withSite, 'roofers')!;
  check('parses name/phone/website/category/geo', a.company_name === "Joe's Roofing" && a.phone === '(512) 555-0100' && a.category === 'roofing_contractor' && a.lat === 30.26);
  check('normalizes the website for dedupe', a.website_normalized === 'joesroofing.com' && a.has_website === true);
  check('carries the keyword it was found under', a.keyword === 'roofers');

  const noSite: PlaceRaw = { id: 'places/XYZ', displayName: { text: 'Acme Plumbing' }, nationalPhoneNumber: '555' };
  const b = parsePlace(noSite, 'plumbers')!;
  check('a business with NO website is a valid lead (strongest prospect)', b.has_website === false && b.website === null && b.company_name === 'Acme Plumbing');

  check('no name → unusable → null', parsePlace({ id: 'x' }, 'roofers') === null);

  // A Facebook-only business is the STRONGEST rebuild prospect — reclassified to no-website so it's
  // never scraped as if the social page were their site.
  const social: PlaceRaw = { id: 'places/FB', displayName: { text: 'Nadia Nails' }, websiteUri: 'https://www.facebook.com/nadianails', nationalPhoneNumber: '555' };
  const s = parsePlace(social, 'nail salons')!;
  check('a Facebook-only business → has_website:false, website nulled', s.has_website === false && s.website === null && s.website_normalized === null);
}

// --- isDirectoryOrSocialUrl: a social/directory page is NOT their own website -----------------
{
  check('facebook is social', isDirectoryOrSocialUrl('https://facebook.com/biz') === true);
  check('instagram is social', isDirectoryOrSocialUrl('https://www.instagram.com/biz') === true);
  check('yelp is a directory', isDirectoryOrSocialUrl('https://www.yelp.com/biz/joes') === true);
  check('google maps is a directory', isDirectoryOrSocialUrl('https://google.com/maps/place/x') === true);
  check('linktr.ee is a link-in-bio, not a site', isDirectoryOrSocialUrl('https://linktr.ee/biz') === true);
  check('a real business domain is NOT social', isDirectoryOrSocialUrl('https://www.joesroofing.com') === false);
  check('a weak builder site (business.site) is still a real site', isDirectoryOrSocialUrl('https://joes-roofing.business.site') === false);
  check('null/empty → false', isDirectoryOrSocialUrl(null) === false && isDirectoryOrSocialUrl('') === false);
  check('a domain merely CONTAINING a brand token is not social', isDirectoryOrSocialUrl('https://facebookmarketingpros.com') === false);
}

// --- placesQueryText + buildDiscoveryQueries: the seed grid ---------------------------------
{
  check('query text is "type in City, ST"', placesQueryText('roofers', 'Austin', 'TX') === 'roofers in Austin, TX');
  const rows = buildDiscoveryQueries(['roofers', 'dentists'], [{ city: 'Austin', state: 'TX' }, { city: 'Dallas', state: 'TX' }]);
  check('one row per (type × city)', rows.length === 4);
  check('rows carry keyword + query_text', rows[0].keyword === 'roofers' && rows.some((r) => r.query_text === 'dentists in Dallas, TX'));
  const dup = buildDiscoveryQueries(['roofers', ' roofers '], [{ city: 'Austin', state: 'TX' }]);
  check('duplicate combos are collapsed (re-seeding is a no-op)', dup.length === 1);
  check('blank niches are skipped', buildDiscoveryQueries(['', '  '], [{ city: 'Austin', state: 'TX' }]).length === 0);
}

// --- pickNextQuery: next-best, deterministic ------------------------------------------------
{
  const rows: QueryRow[] = [
    { id: 'a', query_text: 'a', keyword: 'k', last_run_at: '2026-01-01T00:00:00Z', exhausted: false, total_inserted: 5, run_count: 3, consecutive_zero_runs: 0 },
    { id: 'b', query_text: 'b', keyword: 'k', last_run_at: null, exhausted: false, total_inserted: 0, run_count: 0, consecutive_zero_runs: 0 },
    { id: 'c', query_text: 'c', keyword: 'k', last_run_at: '2026-01-01T00:00:00Z', exhausted: true, total_inserted: 9, run_count: 4, consecutive_zero_runs: 2 },
  ];
  check('prefers a never-run query', pickNextQuery(rows)!.id === 'b');
  const allRun: QueryRow[] = [
    { ...rows[0], id: 'x', last_run_at: '2026-05-10T00:00:00Z' },
    { ...rows[0], id: 'y', last_run_at: '2026-05-01T00:00:00Z' },
  ];
  check('otherwise the least-recently-run', pickNextQuery(allRun)!.id === 'y');
  check('skips exhausted markets', pickNextQuery([rows[2]]) === null);
  check('everything exhausted → null (scope drained)', pickNextQuery([]) === null);
}

// --- exhaustionUpdate: a market drains after two zero runs -----------------------------------
{
  const base = { total_inserted: 10, run_count: 3, consecutive_zero_runs: 0 };
  const good = exhaustionUpdate(base, 7);
  check('a productive run accumulates + resets the zero streak', good.total_inserted === 17 && good.consecutive_zero_runs === 0 && good.exhausted === false);
  const zero1 = exhaustionUpdate(base, 0);
  check('one zero run is not yet exhausted', zero1.consecutive_zero_runs === 1 && zero1.exhausted === false);
  const zero2 = exhaustionUpdate({ ...base, consecutive_zero_runs: 1 }, 0);
  check('two consecutive zero runs → exhausted (market drained)', zero2.consecutive_zero_runs === 2 && zero2.exhausted === true);
  const revived = exhaustionUpdate({ ...base, consecutive_zero_runs: 1 }, 3);
  check('a fresh hit resets the streak (not exhausted)', revived.consecutive_zero_runs === 0 && revived.exhausted === false);
}

console.log(`\nplacesDiscovery.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} placesDiscovery check(s) failed`);
