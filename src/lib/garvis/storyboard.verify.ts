// Run: npx tsx src/lib/garvis/storyboard.verify.ts
import { buildStoryboard, buildCaptionsSrt, toShotstackEdit, defaultScenes } from './storyboard';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('storyboard.verify');

{
  const sb = buildStoryboard({
    title: 'Nocek Studio reel', aspect: '9:16', accent: '#B98CE0',
    scenes: [
      { onScreen: 'Hand-built murals', voiceover: 'Nocek Studio — hand-built murals.', durationS: 3 },
      { imageUrl: 'https://cdn/x/mural1.jpg', onScreen: 'In a lobby', voiceover: 'Made for real spaces.', durationS: 4 },
      { onScreen: 'No stock — real work', voiceover: 'Every frame is our own.', durationS: 20 },  // over-long → clamped
    ],
  });
  check('per-scene duration clamped to the max', sb.scenes[2].durationS <= 6);
  check('total duration is the sum, honest', Math.abs(sb.totalDurationS - sb.scenes.reduce((n, s) => n + s.durationS, 0)) < 0.01);
  check('a photo scene carries the real image, no shoot direction', sb.scenes[1].imageUrl === 'https://cdn/x/mural1.jpg' && sb.scenes[1].shoot === null);
  check('a photo-less scene gets a visible SHOOT direction, never a blank', sb.scenes[0].imageUrl === null && !!sb.scenes[0].shoot);
  check('motion varies scene to scene', sb.scenes[0].motion !== sb.scenes[1].motion);
  check('deterministic: same input, same board', JSON.stringify(sb) === JSON.stringify(buildStoryboard({ title: 'Nocek Studio reel', aspect: '9:16', accent: '#B98CE0', scenes: [
    { onScreen: 'Hand-built murals', voiceover: 'Nocek Studio — hand-built murals.', durationS: 3 },
    { imageUrl: 'https://cdn/x/mural1.jpg', onScreen: 'In a lobby', voiceover: 'Made for real spaces.', durationS: 4 },
    { onScreen: 'No stock — real work', voiceover: 'Every frame is our own.', durationS: 20 },
  ] })));
}
{
  // Total-duration ceiling: many long scenes stop cleanly at the cap, never overflow.
  const sb = buildStoryboard({ title: 't', scenes: Array.from({ length: 20 }, () => ({ imageUrl: 'https://x/p.jpg', voiceover: 'line', durationS: 6 })) });
  check('scene count capped', sb.scenes.length <= 8);
  check('total never exceeds the short-form ceiling', sb.totalDurationS <= 60);
}
{
  const srt = buildCaptionsSrt(buildStoryboard({ title: 't', scenes: [
    { imageUrl: 'https://x/a.jpg', voiceover: 'First line', durationS: 3 },
    { imageUrl: 'https://x/b.jpg', voiceover: '', durationS: 3 },      // no VO → no caption block
    { imageUrl: 'https://x/c.jpg', voiceover: 'Third line', durationS: 3 },
  ] }).scenes);
  check('SRT is well-formed with cumulative timings', srt.includes('00:00:00,000 --> 00:00:03,000') && srt.includes('First line'));
  check('a VO-less scene contributes NO caption block (honest)', !srt.includes('00:00:03,000 --> 00:00:06,000'));
  check('the third caption starts at 6s (the empty scene still advances time)', srt.includes('00:00:06,000 --> 00:00:09,000') && srt.includes('Third line'));
}
{
  const sb = buildStoryboard({ title: 't', aspect: '1:1', scenes: [
    { imageUrl: 'https://x/a.jpg', onScreen: 'Hi', voiceover: 'v', durationS: 3 },
    { onScreen: 'shootless', voiceover: 'v2', shoot: 'shoot: the pier', durationS: 3 },
  ] });
  const edit = toShotstackEdit(sb) as { timeline: { tracks: { clips: Record<string, unknown>[] }[] }; output: { aspectRatio: string; format: string } };
  check('render JSON carries aspect + mp4 output', edit.output.aspectRatio === '1:1' && edit.output.format === 'mp4');
  check('image scene → an image asset clip', edit.timeline.tracks[1].clips.some((c) => (c.asset as { type: string }).type === 'image'));
  check('photo-less scene → an honest title card (never a fake frame)', edit.timeline.tracks[1].clips.some((c) => (c.asset as { type: string; text?: string }).type === 'title' && String((c.asset as { text?: string }).text).includes('pier')));
  check('onScreen text becomes a title clip on the text track', edit.timeline.tracks[0].clips.length === 2);
}
{
  const scenes = defaultScenes({ businessName: 'Nocek Studio', craft: 'murals', audience: 'designers', offer: 'Book a commission', photos: [{ url: 'https://x/a.jpg', caption: 'lobby mural' }] });
  check('default storyboard: hook + photo(s) + CTA from real materials', scenes.length === 3 && scenes[1].imageUrl === 'https://x/a.jpg' && scenes[2].onScreen === 'Book a commission');
  check('a photo caption becomes its voiceover', scenes[1].voiceover === 'lobby mural');
  check('empty everything → still a valid board, no throw', buildStoryboard({ title: '', scenes: [] }).scenes.length === 0);
}

console.log(`\nstoryboard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} storyboard check(s) failed`);
