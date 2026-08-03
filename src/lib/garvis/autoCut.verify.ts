// Run: npx tsx src/lib/garvis/autoCut.verify.ts
import { detectSpeech, segmentsToTakes, cutSummary } from './autoCut';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('autoCut.verify');

// A synthetic take at 0.05s windows: 2s speech, 1s pause, 2s speech, 3s trailing room tone. 8s total.
const W = 0.05;
const env = (spec: [level: number, seconds: number][]) =>
  spec.flatMap(([lvl, s]) => Array.from({ length: Math.round(s / W) }, () => lvl));

{
  const e = env([[0.2, 2], [0.01, 1], [0.2, 2], [0.01, 3]]);
  const segs = detectSpeech(e, W, 8);
  check('a >0.5s pause becomes a cut: two segments', segs.length === 2);
  check('padding kept: ~0.09s of air before speech, ~0.15s after',
    segs[0].startS === 0 && segs[0].endS === 2.15 && segs[1].startS === 2.91 && segs[1].endS === 5.15);
  check('trailing room tone is dropped entirely', segs[1].endS < 6);
  check('deterministic', JSON.stringify(detectSpeech(e, W, 8)) === JSON.stringify(segs));

  const takes = segmentsToTakes('https://cdn/x/take.mp4', segs);
  check('segments map to sub-clip takes with explicit trim + length',
    takes.length === 2 && takes[0].trimS === undefined && takes[0].lengthS === 2.15
    && takes[1].trimS === 2.91 && takes[1].lengthS === 2.24 && takes.every((t) => t.url === 'https://cdn/x/take.mp4'));
  check('summary is honest about what was cut', cutSummary(segs, 8).includes('1 pause') && cutSummary(segs, 8).includes('8s → 4.39s'));
}
{
  // A 0.3s breath must NOT be cut (under the 0.5s gap), and a 0.1s noise blip must not survive alone.
  const short = detectSpeech(env([[0.2, 2], [0.01, 0.3], [0.2, 2]]), W, 4.3);
  check('a short breath (<0.5s) is kept — one continuous segment', short.length === 1 && short[0].startS === 0);
  const blip = detectSpeech(env([[0.01, 3], [0.3, 0.1], [0.01, 3]]), W, 6.1);
  check('an isolated noise blip (<0.3s) is not "speech" — falls back to the whole take',
    blip.length === 1 && blip[0].startS === 0 && blip[0].endS === 6.1);
}
{
  // The honest fallbacks: analysis failure modes NEVER discard footage.
  const silent = detectSpeech(env([[0.001, 8]]), W, 8);
  check('an all-silent take comes back WHOLE, never empty', silent.length === 1 && silent[0].endS === 8);
  const empty = detectSpeech([], W, 8);
  check('an empty envelope comes back WHOLE', empty.length === 1 && empty[0].endS === 8);
  check('garbage windowS/duration come back whole (no NaN edits)',
    detectSpeech([0.2], 0, 8).length === 1 && detectSpeech([0.2], W, 0)[0].endS === 0);
  check('no-cut summary says so plainly', cutSummary(silent, 8).includes('no pauses worth cutting'));
}
{
  // Aggressive custom padding that would overlap across a cut re-merges instead of overlapping.
  const e = env([[0.2, 2], [0.01, 0.6], [0.2, 2]]);
  const segs = detectSpeech(e, W, 4.6, { padStartS: 0.4, padEndS: 0.4 });
  check('padding that swallows the gap re-merges into one segment', segs.length === 1);
  const tight = detectSpeech(e, W, 4.6, { cutGapS: 0.3 });
  check('the UGC-ad lane (cutGapS 0.3) cuts tighter than the default', tight.length === 2);
  check('padding clamps to the take bounds', segs[0].startS === 0 && segs[0].endS <= 4.6);
}

console.log(`\nautoCut.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} autoCut check(s) failed`);
