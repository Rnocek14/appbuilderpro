// Run: npx tsx src/lib/garvis/clientHuntSchedule.verify.ts
import { parseHuntConfig, plannedHuntToday, huntSummary, CLIENT_HUNT_KIND, LOCAL_NICHES, type HuntConfig } from './clientHuntSchedule';
import { US_CITIES } from './usCities';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('clientHuntSchedule.verify');

check('the order kind is client_hunt', CLIENT_HUNT_KIND === 'client_hunt');

// --- the catalog is a real, non-trivial set of local-business types -------------------------
{
  check('LOCAL_NICHES is a substantial catalog', LOCAL_NICHES.length >= 25 && LOCAL_NICHES.every((n) => typeof n === 'string' && n.length > 1));
  check('the catalog has the classic weak-site verticals', ['roofers', 'plumbers', 'dentists'].every((n) => LOCAL_NICHES.includes(n)));
}

// --- parse + bound the config ---------------------------------------------------------------
{
  const ok = parseHuntConfig({ niches: ['roofers'], scope: { mode: 'topN', n: 50 }, searchesPerDay: 10, demoQuota: 5 });
  check('parses a valid config', !!ok && ok.niches[0] === 'roofers' && ok.searchesPerDay === 10 && ok.demoQuota === 5);

  // The whole point: NO niche is valid and means "hunt everything" (fully hands-off).
  const all = parseHuntConfig({ scope: { mode: 'topN', n: 50 } });
  check('no niche → hunts the whole catalog (niches empty), not null', !!all && all.niches.length === 0);

  check('a legacy single `niche` string still works', parseHuntConfig({ niche: 'dentists' })!.niches[0] === 'dentists');
  check('the legacy `citiesPerDay` field maps to searchesPerDay', parseHuntConfig({ citiesPerDay: 15 })!.searchesPerDay === 15);

  const runaway = parseHuntConfig({ searchesPerDay: 9999, demoQuota: 9999 });
  check('caps searches/day and demos/day so an autonomous order can never run away', !!runaway && runaway.searchesPerDay === 40 && runaway.demoQuota === 25);
  check('defaults are sane when fields are missing', parseHuntConfig({})!.searchesPerDay === 10 && parseHuntConfig({})!.demoQuota === 5);
  check('only non-object junk is rejected', parseHuntConfig(null) === null && parseHuntConfig(42) === null);
}

// --- a NARROWED (single-niche) hunt rolls across the country --------------------------------
{
  const cfg: HuntConfig = { niches: ['dentists'], scope: { mode: 'topN', n: 20 }, searchesPerDay: 5, demoQuota: 3 };

  const day1 = plannedHuntToday(cfg, 0);
  check('day 1 runs searchesPerDay searches', day1.queries.length === 5);
  check('day 1 starts at the top market', day1.queries[0].city === US_CITIES[0].city);
  check('a single-niche hunt sweeps by city', day1.queries.every((q) => q.niche === 'dentists') && day1.queries[1].city !== day1.queries[0].city);
  check('cursor advances for tomorrow', day1.nextCursor === 5);

  const day2 = plannedHuntToday(cfg, day1.nextCursor);
  check('day 2 hits DIFFERENT cities (fresh markets)', day2.queries[0].city !== day1.queries[0].city && day2.nextCursor === 10);

  const near = plannedHuntToday(cfg, 18);
  check('a slice past the end wraps around', near.wrapped === true && near.queries.length === 5);
}

// --- the HANDS-OFF (all-niches) hunt sweeps the type × city grid -----------------------------
{
  const cfg: HuntConfig = { niches: [], scope: { mode: 'topN', n: 3 }, searchesPerDay: 5, demoQuota: 3 };
  const day1 = plannedHuntToday(cfg, 0);
  check('day 1 runs searchesPerDay searches across the grid', day1.queries.length === 5);
  check('city-major: day 1 stays in the top market, mixing business TYPES', day1.queries.every((q) => q.city === US_CITIES[0].city));
  check('those are DIFFERENT business types (real diversity per day)', new Set(day1.queries.map((q) => q.niche)).size === 5);
  check('every niche is drawn from the catalog', day1.queries.every((q) => LOCAL_NICHES.includes(q.niche)));

  // The grid is cities × niches; the cursor rolls the whole thing and eventually wraps.
  const gridLen = 3 * LOCAL_NICHES.length;
  const near = plannedHuntToday(cfg, gridLen - 2);
  check('a slice past the grid end wraps around', near.wrapped === true && near.queries.length === 5);

  // searchesPerDay larger than the whole grid is clamped.
  const tiny = plannedHuntToday({ niches: ['x'], scope: { mode: 'state', state: 'DC' }, searchesPerDay: 40, demoQuota: 5 }, 0);
  check('searchesPerDay clamps to the grid size', tiny.queries.length >= 1 && tiny.queries.every((q) => q.state === 'DC'));

  check('a negative cursor is normalized, never crashes', plannedHuntToday(cfg, -3).queries.length === 5);
}

// --- the human summary is honest about scope + the send boundary -----------------------------
{
  const all = huntSummary({ niches: [], scope: { mode: 'topN', n: 50 }, searchesPerDay: 20, demoQuota: 5 });
  check('summary of a hands-off hunt says it hunts every local business', /every kind of local business/.test(all) && /5 demos/.test(all));
  check('summary states nothing sends on its own', /nothing sends on its own/i.test(all));
  const one = huntSummary({ niches: ['roofers'], scope: { mode: 'state', state: 'TX' }, searchesPerDay: 10, demoQuota: 5 });
  check('summary of a narrowed hunt names the niche', /roofers/.test(one) && /TX/.test(one));
}

console.log(`\nclientHuntSchedule.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} clientHuntSchedule check(s) failed`);
