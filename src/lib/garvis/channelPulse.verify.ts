// Run: npx tsx src/lib/garvis/channelPulse.verify.ts
import { channelPulse, type PulseEpisode } from './channelPulse';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('channelPulse.verify');

const NOW = '2026-08-03T12:00:00Z';
const day = (n: number, views: number | null = null): PulseEpisode =>
  ({ postedAt: new Date(Date.parse('2026-07-01T09:00:00Z') + (n - 1) * 86_400_000).toISOString(), views });

{
  // Day 34 channel, posted 5 of the last 7 days, one 2-day-old last post.
  const eps = [1, 5, 10, 15, 20, 25, 28, 29, 30, 31, 33].map((n) => day(n));
  const p = channelPulse('2026-07-01T00:00:00Z', eps, NOW);
  check('day counting starts at 1 on creation day', p.dayN === 34);
  check('streak counts DISTINCT posting days in the trailing 7', p.postedLast7 === 5);
  check('last-post recency computed from the real posted_at', p.lastPostDaysAgo === 1);
  check('pre-inflection read: names the 45-75 window and consistency', p.read.includes('45-75') && p.read.includes('consistency'));
  check('stats line carries day + streak', p.stats.includes('Day 34') && p.stats.includes('posted 5 of the last 7 days'));
  check('a fresh streak omits the "last post N days ago" nag', !p.stats.includes('last post'));
  check('deterministic', JSON.stringify(channelPulse('2026-07-01T00:00:00Z', eps, NOW)) === JSON.stringify(p));
}
{
  // The trend: prior batch median 100, recent batch median 140 → 1.4x.
  const eps = [
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => day(n, 100)),
    ...[10, 11, 12, 13, 14, 15, 16].map((n) => day(n, 140)),
  ];
  const p = channelPulse('2026-07-01T00:00:00Z', eps, NOW);
  check('trend is recent-median over prior-median (1.4x)', p.trend === 1.4);
  check('trend appears in the stats line', p.stats.includes('1.4x your earlier baseline'));
  check('sparkline carries the last ≤14 measured views chronologically', p.spark.length === 14 && p.spark[0] === 100 && p.spark[13] === 140);
  check('unmeasured episodes never enter the trend (no fake zeros)',
    channelPulse('2026-07-01T00:00:00Z', [...eps, day(17, null), day(18, null)], NOW).trend === 1.4);
}
{
  // Honest silence: fewer than 3 measured on either side → NO trend verdict.
  const thin = channelPulse('2026-07-01T00:00:00Z', [day(1, 90), day(2, 100), day(10, 300), day(11, 320), day(12, 340)], NOW);
  check('a thin prior batch (<3 measured) yields no trend, never a noisy verdict', thin.trend === null && !thin.stats.includes('baseline'));
  const nothing = channelPulse('2026-07-25T00:00:00Z', [], NOW);
  check('a never-posted channel says so and points at the first post',
    nothing.lastPostDaysAgo === null && nothing.stats.includes('nothing posted yet') && nothing.read.includes('clock starts'));
  check('garbage dates degrade to day 1, no NaN', channelPulse('not-a-date', [], NOW).dayN === 1);
}
{
  // The three late-phase reads.
  const old = (views: (number | null)[]) => views.map((v, i) => day(1 + i * 5, v));
  const inWindow = channelPulse('2026-06-10T00:00:00Z', [day(1)], NOW);          // day ~55
  check('days 45-75 read: inside the inflection window', inWindow.read.includes('inside the typical inflection window'));
  const upNow = '2026-10-15T12:00:00Z';                                          // day >100
  const up = channelPulse('2026-07-01T00:00:00Z', old([100, 100, 100, 100, 100, 100, 100, 150, 150, 150, 150, 150, 150, 150]), upNow);
  check('past 75 trending up: the compounding read', up.trend! >= 1.2 && up.read.includes('compounding'));
  const flat = channelPulse('2026-07-01T00:00:00Z', old([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]), upNow);
  check('past 75 and flat: the honest lean-on-the-loop read', flat.trend === 1 && flat.read.includes('lean on the loop'));
  const blind = channelPulse('2026-07-01T00:00:00Z', [day(1), day(20), day(40)], upNow);
  check('past 75 with no measurements: says the trend is unreadable, keep syncing', blind.read.includes('not enough measured'));
  check('a 3+ day gap surfaces in the stats line', channelPulse('2026-07-01T00:00:00Z', [day(1), day(29)], NOW).stats.includes('last post 5 days ago'));
}

console.log(`\nchannelPulse.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} channelPulse check(s) failed`);
