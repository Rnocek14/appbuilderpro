// Run: npx tsx src/lib/garvis/nationalSweep.verify.ts
import { US_CITIES, US_STATES, citiesFor, type UsCity } from './usCities';
import { sweepPlan, domainOf, registerDomain, sweepCostLine } from './nationalSweepCore';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('nationalSweep.verify');

// --- the cities dataset is real + nationally complete --------------------------------------
{
  check('a substantial national set of cities', US_CITIES.length >= 100);
  check('every city has a real 2-letter state + a region', US_CITIES.every((c) => /^[A-Z]{2}$/.test(c.state) && !!c.city && ['Northeast', 'Midwest', 'South', 'West'].includes(c.region)));
  check('all 50 states + DC are represented (a by-state sweep works everywhere)', US_STATES.length >= 51);
  check('ordered biggest-first (New York leads)', US_CITIES[0].city === 'New York');
  check('no accidental duplicate city+state', new Set(US_CITIES.map((c) => `${c.city}|${c.state}`)).size === US_CITIES.length);
}

// --- citiesFor: scope selection ------------------------------------------------------------
{
  check('topN takes the N largest markets', citiesFor({ mode: 'topN', n: 25 }).length === 25 && citiesFor({ mode: 'topN', n: 25 })[0].city === 'New York');
  check('topN clamps to the dataset size', citiesFor({ mode: 'topN', n: 9999 }).length === US_CITIES.length);
  const tx = citiesFor({ mode: 'state', state: 'TX' });
  check('state filter returns only that state', tx.length > 1 && tx.every((c) => c.state === 'TX'));
  const west = citiesFor({ mode: 'region', region: 'West' });
  check('region filter returns only that region', west.length > 1 && west.every((c) => c.region === 'West'));
}

// --- sweepPlan: one query per city, capped, city-deduped -----------------------------------
{
  const cities: UsCity[] = [
    { city: 'Austin', state: 'TX', region: 'South' },
    { city: 'Austin', state: 'TX', region: 'South' }, // dup
    { city: 'Dallas', state: 'TX', region: 'South' },
    { city: 'Miami', state: 'FL', region: 'South' },
  ];
  const plan = sweepPlan('roofers', cities, 10);
  check('one query per UNIQUE city', plan.length === 3);
  check('area is "City, ST" for the search', plan[0].area === 'Austin, TX' && plan.some((q) => q.area === 'Miami, FL'));
  check('niche carried + trimmed', sweepPlan('  plumbers  ', cities, 10)[0].niche === 'plumbers');
  check('cap bounds the number of searches', sweepPlan('roofers', US_CITIES, 30).length === 30);
}

// --- national dedupe: a business found in two cities is pitched once ------------------------
{
  check('domainOf strips scheme + www + path', domainOf('https://www.joesroofing.com/services') === 'joesroofing.com');
  check('domainOf tolerates a bare host', domainOf('joesroofing.com') === 'joesroofing.com');
  check('domainOf is null for junk', domainOf(null) === null && domainOf('not a url at all') === null);

  const seen = new Set<string>();
  check('first sighting of a domain is new', registerDomain(seen, 'https://joesroofing.com') === true);
  check('same domain (found in another city) is a dup', registerDomain(seen, 'http://www.joesroofing.com/contact') === false);
  check('a different business is new', registerDomain(seen, 'https://acmeplumbing.com') === true);
  check('no url → never registered', registerDomain(seen, null) === false);
}

// --- honest cost line ----------------------------------------------------------------------
{
  check('cost line names one search per city', /one per city/i.test(sweepCostLine(50)) && /50/.test(sweepCostLine(50)));
  check('cost line makes clear nothing is emailed', /nothing is emailed/i.test(sweepCostLine(50)));
}

console.log(`\nnationalSweep.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} nationalSweep check(s) failed`);
