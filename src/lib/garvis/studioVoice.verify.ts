// Run: npx tsx src/lib/garvis/studioVoice.verify.ts
// Pins the video surfaces' spoken vocabulary — and, just as hard, what they must NOT claim.
// The surface tier runs before the briefing, small talk, stats and every door: an over-eager
// claim here silently steals a sentence from its real destination.
import { parseReelAsk, parseVideoAsk } from './studioVoice';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// THE VIDEO STUDIO — "make a video about X" designs, right there.
{
  const a = parseVideoAsk('make a video about the lakefront listing');
  check('"make a video about X" is a design ask', a?.kind === 'title' && a.title === 'the lakefront listing');
  check('"lets make a video about the open house saturday" too',
    parseVideoAsk('lets make a video about the open house saturday')?.kind === 'title');
  check('"do a slideshow of the new listing photos" too',
    (() => { const r = parseVideoAsk('do a slideshow of the new listing photos'); return r?.kind === 'title' && r.title === 'the new listing photos'; })());
  check('"make one about her spring listings" — bare "one" belongs to the open studio',
    (() => { const r = parseVideoAsk('make one about her spring listings'); return r?.kind === 'title' && r.title === 'her spring listings'; })());
  check('trailing punctuation is forgiven', parseVideoAsk('make a video about the lake house!')?.kind === 'title');

  check('"story first" switches the cut', (() => { const r = parseVideoAsk('story first'); return r?.kind === 'cut' && r.concept === 'story_first'; })());
  check('"lead with the offer" too', (() => { const r = parseVideoAsk('lead with the offer'); return r?.kind === 'cut' && r.concept === 'offer_first'; })());
  check('"lead with the proof" too', (() => { const r = parseVideoAsk('lead with the proof'); return r?.kind === 'cut' && r.concept === 'proof_first'; })());

  check('"make it vertical" is the reel aspect', (() => { const r = parseVideoAsk('make it vertical'); return r?.kind === 'aspect' && r.aspect === '9:16'; })());
  check('"make it for tiktok" too', (() => { const r = parseVideoAsk('make it for tiktok'); return r?.kind === 'aspect' && r.aspect === '9:16'; })());
  check('"switch to landscape" is 16:9', (() => { const r = parseVideoAsk('switch to landscape'); return r?.kind === 'aspect' && r.aspect === '16:9'; })());
  check('"make it square" is 1:1', (() => { const r = parseVideoAsk('make it square'); return r?.kind === 'aspect' && r.aspect === '1:1'; })());

  check('"play it" plays', parseVideoAsk('play it')?.kind === 'play');
  check('"play it from the top" too', parseVideoAsk('play it from the top')?.kind === 'play');
  check('"pause" pauses', parseVideoAsk('pause')?.kind === 'pause');
}

// WHAT THE VIDEO STUDIO MUST NOT CLAIM — these have real destinations.
{
  for (const s of [
    'whats waiting on me',          // the queue door
    'whats happening',              // the briefing
    'stop',                         // the halt word (small talk)
    'never mind',                   // closure
    'moms postcard',                // a door
    'make me a plan to grow this',  // the planner, not a video
    'a video about mortgage rates would be nice someday',  // musing, not an imperative
    'i watched a video about squares yesterday',           // mentions, not asks
    'how do i make a video',        // procedural question — wants an ANSWER
    'play',                         // bare verb — too little to steal
  ]) {
    check(`not claimed: "${s}"`, parseVideoAsk(s) === null);
  }
}

// THE REEL STUDIO — ideate by voice.
{
  const t = parseReelAsk('make a reel about home espresso');
  check('"make a reel about X" ideates on X', t?.kind === 'topic' && t.topic === 'home espresso');
  check('"do a short on ancient rome" too', parseReelAsk('do a short on ancient rome')?.kind === 'topic');
  check('"more ideas" asks for fresh angles', parseReelAsk('more ideas')?.kind === 'more');
  check('"different angles" too', parseReelAsk('different angles')?.kind === 'more');
  check('"use the second one" picks (0-based)', (() => { const r = parseReelAsk('use the second one'); return r?.kind === 'pick' && r.index === 1; })());
  check('"pick the first idea" picks index 0', (() => { const r = parseReelAsk('pick the first idea'); return r?.kind === 'pick' && r.index === 0; })());
  check('"go with the third one" picks index 2', (() => { const r = parseReelAsk('go with the third one'); return r?.kind === 'pick' && r.index === 2; })());
  check('"start over" resets', parseReelAsk('start over')?.kind === 'restart');
}

// WHAT THE REEL STUDIO MUST NOT CLAIM.
{
  for (const s of [
    'whats waiting on me',
    'the second quarter was better',   // mentions an ordinal, asks nothing
    'pick up milk',                    // pick-shell without an idea word
    'use the front door',              // likewise
    'more',                            // bare word
    'draft todays episode',            // the channel door
  ]) {
    check(`not claimed: "${s}"`, parseReelAsk(s) === null);
  }
}

// Determinism.
{
  const twice = (s: string) => JSON.stringify(parseVideoAsk(s)) === JSON.stringify(parseVideoAsk(s))
    && JSON.stringify(parseReelAsk(s)) === JSON.stringify(parseReelAsk(s));
  check('same sentence, same parse, every time',
    ['make a video about x', 'story first', 'use the second one', 'zzz'].every(twice));
}

console.log(`\nstudioVoice.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} studioVoice check(s) failed`);
