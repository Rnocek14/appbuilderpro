// Run: npx tsx src/lib/garvis/clientHuntSchedule.verify.ts
import { parseHuntConfig, plannedHuntToday, huntSummary, CLIENT_HUNT_KIND, type HuntConfig } from './clientHuntSchedule';
import { US_CITIES } from './usCities';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('clientHuntSchedule.verify');

check('the order kind is client_hunt', CLIENT_HUNT_KIND === 'client_hunt');

// --- parse + bound the config ---------------------------------------------------------------
{
  const ok = parseHuntConfig({ niche: 'roofers', scope: { mode: 'topN', n: 50 }, citiesPerDay: 10, demoQuota: 5 });
  check('parses a valid config', !!ok && ok.niche === 'roofers' && ok.citiesPerDay === 10 && ok.demoQuota === 5);
  check('no niche → null (an automatic order must know what to hunt)', parseHuntConfig({ scope: { mode: 'topN', n: 50 } }) === null);
  const runaway = parseHuntConfig({ niche: 'x', citiesPerDay: 9999, demoQuota: 9999 });
  check('caps searches/day and demos/day so an autonomous order can never run away', !!runaway && runaway.citiesPerDay === 40 && runaway.demoQuota === 25);
  check('defaults are sane when fields are missing', parseHuntConfig({ niche: 'x' })!.demoQuota === 5);
}

// --- the daily plan rolls across the country ------------------------------------------------
{
  const cfg: HuntConfig = { niche: 'dentists', scope: { mode: 'topN', n: 20 }, citiesPerDay: 5, demoQuota: 3 };

  const day1 = plannedHuntToday(cfg, 0);
  check('day 1 sweeps citiesPerDay cities', day1.queries.length === 5);
  check('day 1 starts at the top market', day1.queries[0].city === US_CITIES[0].city);
  check('cursor advances for tomorrow', day1.nextCursor === 5);

  const day2 = plannedHuntToday(cfg, day1.nextCursor);
  check('day 2 hits DIFFERENT cities (fresh markets, not re-sweeping)', day2.queries[0].city !== day1.queries[0].city && day2.nextCursor === 10);

  // A cursor near the end wraps back to the start (the campaign keeps running forever).
  const near = plannedHuntToday(cfg, 18);
  check('a slice past the end wraps around the scope', near.wrapped === true && near.queries.length === 5);

  // citiesPerDay larger than the scope is clamped (a small state can't search 40 cities).
  const tiny = plannedHuntToday({ niche: 'x', scope: { mode: 'state', state: 'DC' }, citiesPerDay: 40, demoQuota: 5 }, 0);
  check('citiesPerDay clamps to the scope size', tiny.queries.length >= 1 && tiny.queries.every((q) => q.state === 'DC'));

  // a negative/garbage cursor is normalized, never crashes
  check('a negative cursor is normalized', plannedHuntToday(cfg, -3).queries.length === 5);
}

// --- the human summary is honest about the send boundary ------------------------------------
{
  const line = huntSummary({ niche: 'roofers', scope: { mode: 'topN', n: 50 }, citiesPerDay: 10, demoQuota: 5 });
  check('summary names the niche + the daily demo cap', /roofers/.test(line) && /5 demos/.test(line));
  check('summary states nothing sends on its own', /nothing sends on its own/i.test(line));
}

console.log(`\nclientHuntSchedule.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} clientHuntSchedule check(s) failed`);
