// Run: npx tsx src/lib/garvis/growthLoop.verify.ts
import {
  episodePerf, channelBaseline, classifyEpisode, hookIntel, perfLine,
  WINNER_MULTIPLE, QUIET_MULTIPLE, MIN_MEASURED, type EpisodeMetricRow, type EpisodePerf,
} from './growthLoop';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('growthLoop.verify');

const row = (over: Partial<EpisodeMetricRow>): EpisodeMetricRow => ({
  likes: null, comments: null, shares: null, impressions: null, video_views: null,
  saves: null, clicks: null, engagement: null, ...over,
});
const perf = (id: string, reach: number | null, hook = `hook-${id}`): EpisodePerf =>
  ({ episodeId: id, title: id, hook, reach, engagements: null, clicks: null });

{
  const p = episodePerf('e1', 't', 'h', [
    row({ video_views: 1200, likes: 40, comments: 5 }),   // tiktok
    row({ impressions: 800, likes: 10, saves: 3 }),        // instagram (no video_views)
  ]);
  check('reach prefers real video views, summed across platforms', p.reach === 1200);
  check('engagements sum what exists (likes+comments+saves)', p.engagements === 58);
  check('clicks stay null when never reported (no fake zero)', p.clicks === null);
  const empty = episodePerf('e2', 't', 'h', [row({})]);
  check('an all-null episode is UNMEASURED (reach null), never zero', empty.reach === null && empty.engagements === null);
  const impOnly = episodePerf('e3', 't', 'h', [row({ impressions: 500 })]);
  check('impressions carry reach when views are absent', impOnly.reach === 500);
}
{
  check('no baseline before MIN_MEASURED episodes have numbers',
    channelBaseline([perf('a', 100), perf('b', 200)]) === null && MIN_MEASURED === 3);
  check('baseline is the MEDIAN (a viral outlier does not drown the channel)',
    channelBaseline([perf('a', 100), perf('b', 120), perf('c', 90), perf('d', 50_000)]) === 110);
  check('unmeasured episodes are invisible to the baseline',
    channelBaseline([perf('a', 100), perf('b', null), perf('c', 110), perf('d', 120)]) === 110);
}
{
  const base = 100;
  check('≥3x = winner', classifyEpisode(perf('w', 300), base).verdict === 'winner' && WINNER_MULTIPLE === 3);
  check('≤0.3x = quiet', classifyEpisode(perf('q', 30), base).verdict === 'quiet' && QUIET_MULTIPLE === 0.3);
  check('in between = solid, with the multiple', classifyEpisode(perf('s', 150), base).multiple === 1.5);
  check('no metrics → unmeasured, never a fake quiet', classifyEpisode(perf('u', null), base).verdict === 'unmeasured');
  check('no baseline → unmeasured', classifyEpisode(perf('x', 500), null).verdict === 'unmeasured');
}
{
  const perfs = [
    perf('a', 100, 'The $312 your bank never mentions.'),
    perf('b', 110, 'Most people read this wrong.'),
    perf('c', 90, 'A quiet mechanism.'),
    perf('d', 400, 'Your bank made $312 off you.'),      // 4x median-ish → winner
    perf('e', 20, 'A dead opener.'),                     // quiet
    perf('f', null, 'Not yet measured.'),
  ];
  const intel = hookIntel(perfs);
  check('winning hooks come from winner episodes only', intel.winningHooks.length === 1 && intel.winningHooks[0].includes('made $312'));
  check('quiet hooks come from quiet episodes only', intel.quietHooks.includes('A dead opener.'));
  check('the best measured episode is the double-down candidate', intel.bestEpisode?.episodeId === 'd');
  check('unmeasured episodes contribute NO intel', !intel.winningHooks.includes('Not yet measured.') && !intel.quietHooks.includes('Not yet measured.'));
  check('deterministic', JSON.stringify(hookIntel(perfs)) === JSON.stringify(intel));
}
{
  check('perfLine is honest about missing numbers', perfLine(perf('u', null), 100) === 'no numbers synced yet');
  check('perfLine names a winner and says what to do', perfLine(perf('w', 300), 100).includes('WINNER, double down'));
  check('perfLine names quiet honestly', perfLine(perf('q', 30), 100).includes('change the mechanism'));
}

console.log(`\ngrowthLoop.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} growthLoop check(s) failed`);
