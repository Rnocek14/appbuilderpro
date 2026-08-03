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
  check('per-scene duration clamped to the max', sb.scenes[2].durationS <= 8);
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
  const sb = buildStoryboard({ title: 't', scenes: Array.from({ length: 30 }, () => ({ imageUrl: 'https://x/p.jpg', voiceover: 'line', durationS: 8 })) });
  check('scene count capped', sb.scenes.length <= 14);
  check('total never exceeds the short-form ceiling (90s — the CRP-eligible band)', sb.totalDurationS <= 90);
  check('the ceiling permits a monetizable ≥60s video (a 60s cap would exclude what earns)', sb.totalDurationS >= 60);
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
  check('photo-less scene → an honest rich-text card (never a fake frame; title asset is deprecated)',
    edit.timeline.tracks[1].clips.some((c) => (c.asset as { type: string; text?: string }).type === 'rich-text' && String((c.asset as { text?: string }).text).includes('pier')));
  check('onScreen text becomes a rich-text clip on the text track', edit.timeline.tracks[0].clips.length === 2
    && edit.timeline.tracks[0].clips.every((c) => (c.asset as { type: string }).type === 'rich-text'));
  check('overlay text sits in the top third (+y is UP; never the bottom UI dead zone)',
    edit.timeline.tracks[0].clips.every((c) => (c as { offset?: { y: number } }).offset?.y === 0.26));
}
{
  const scenes = defaultScenes({ businessName: 'Nocek Studio', craft: 'murals', audience: 'designers', offer: 'Book a commission', photos: [{ url: 'https://x/a.jpg', caption: 'lobby mural' }] });
  check('default storyboard: hook + photo(s) + CTA from real materials', scenes.length === 3 && scenes[1].imageUrl === 'https://x/a.jpg' && scenes[2].onScreen === 'Book a commission');
  check('a photo caption becomes its voiceover', scenes[1].voiceover === 'lobby mural');
  check('empty everything → still a valid board, no throw', buildStoryboard({ title: '', scenes: [] }).scenes.length === 0);
}

// ---- the media layers: voiceover / captions / music ride the SAME edit, opt-in ----
{
  const sb = buildStoryboard({ title: 't', aspect: '9:16', scenes: [
    { imageUrl: 'https://x/a.jpg', voiceover: 'one', durationS: 3 },
    { imageUrl: 'https://x/b.jpg', voiceover: 'two', durationS: 4 },
    { imageUrl: 'https://x/c.jpg', voiceover: 'three', durationS: 5 },
  ] });
  type Edit = { timeline: { soundtrack?: { src: string; volume: number }; tracks: { clips: { start: number; length: number; asset: Record<string, unknown> }[] }[] } };
  const plain = toShotstackEdit(sb) as Edit;
  check('no opts → exactly the classic two tracks, no soundtrack (regression)',
    plain.timeline.tracks.length === 2 && plain.timeline.soundtrack === undefined);
  check('no opts is byte-identical to explicit undefined opts',
    JSON.stringify(toShotstackEdit(sb)) === JSON.stringify(toShotstackEdit(sb, undefined)));

  const full = toShotstackEdit(sb, {
    voClips: [{ sceneIndex: 2, url: 'https://x/vo2.mp3' }, { sceneIndex: 0, url: 'https://x/vo0.mp3' }, { sceneIndex: 99, url: 'https://x/bad.mp3' }],
    srtUrl: 'https://x/caps.srt', musicUrl: 'https://x/bed.mp3', musicVolume: 0.2,
  }) as Edit;
  const capTrack = full.timeline.tracks[0];
  check('caption track rides on top and spans the whole video',
    (capTrack.clips[0].asset as { type?: string }).type === 'rich-caption' && capTrack.clips[0].length === sb.totalDurationS);
  const capAsset = capTrack.clips[0].asset as {
    font?: { family?: string; size?: number }; stroke?: { color?: string; width?: number };
    background?: { wrap?: boolean }; active?: { font?: { color?: string } }; animation?: { style?: string };
  };
  check('captions: word-karaoke, big bold, 3px stroke, wrap pill, yellow active word',
    capAsset.font?.family === 'Montserrat ExtraBold' && (capAsset.font?.size ?? 0) >= 70
    && capAsset.stroke?.color === '#000000' && capAsset.stroke?.width === 3
    && capAsset.background?.wrap === true && capAsset.active?.font?.color === '#f7c204'
    && capAsset.animation?.style === 'karaoke');
  check('captions sit LOWER-middle (Shotstack +y is UP → negative offset)',
    (capTrack.clips[0] as { offset?: { y: number } }).offset?.y === -0.2);
  const audio = full.timeline.tracks[full.timeline.tracks.length - 1].clips;
  check('voiceover clips land at their scene\'s cumulative start, sorted, out-of-range dropped',
    audio.length === 2 && audio[0].start === 0 && audio[1].start === 7 && audio[1].length === 5);
  check('the music bed is the timeline soundtrack, ducked under the voice',
    full.timeline.soundtrack?.src === 'https://x/bed.mp3' && full.timeline.soundtrack?.volume === 0.2);
  check('image/text tracks are unchanged by the media layers',
    JSON.stringify(full.timeline.tracks[1]) === JSON.stringify(plain.timeline.tracks[0]) &&
    JSON.stringify(full.timeline.tracks[2]) === JSON.stringify(plain.timeline.tracks[1]));

  // The retention-era cut grammar: hard cuts between scenes, one fade-in on frame one, overlay
  // text in the top third (bottom = platform UI graveyard; lower-middle = captions).
  const images = plain.timeline.tracks[1].clips as ({ transition?: unknown })[];
  check('only the first clip fades in — every other cut is HARD', images[0].transition !== undefined && images.slice(1).every((c) => c.transition === undefined));
  const titles = plain.timeline.tracks[0].clips as ({ offset?: { y?: number } })[];
  check('on-screen text rides the top third, clear of captions and platform UI', titles.every((t) => t.offset?.y === 0.26));

  // THE SHARED SOUND LAYER on the storyboard lane: scene boundaries are explicit → precise cues.
  const kit = { whooshUrl: 'https://cdn/sfx/whoosh.mp3', popUrl: 'https://cdn/sfx/pop.mp3', riserUrl: 'https://cdn/sfx/riser.mp3' };
  const withSfx = toShotstackEdit(sb, { sfx: kit }) as Edit;
  const sfxClips = withSfx.timeline.tracks[withSfx.timeline.tracks.length - 1].clips;
  const srcOf = (c: { asset: Record<string, unknown> }) => String((c.asset as { src: string }).src);
  check('calm lane (default): whooshes lead the scene cuts by ~3 frames, no riser',
    sfxClips.length === 2 && sfxClips.every((c) => srcOf(c).includes('whoosh'))
    && sfxClips[0].start === 2.9 && sfxClips[1].start === 6.9);
  const hot = toShotstackEdit(sb, { sfx: kit, lane: 'energetic', srtUrl: 'https://x/caps.srt' }) as Edit;
  const hotSfx = hot.timeline.tracks[hot.timeline.tracks.length - 1].clips;
  check('energetic lane: riser rides the open, captions switch to per-word pop',
    hotSfx.some((c) => srcOf(c).includes('riser'))
    && ((hot.timeline.tracks[0].clips[0].asset as { animation?: { style?: string } }).animation?.style === 'pop'));
  check('no kit → no sfx track (and the no-opts regression above stays true)',
    JSON.stringify(toShotstackEdit(sb)) === JSON.stringify(plain));
}

// ---- the three cuts: same real photos, different mechanism, deterministic ----
{
  const { conceptScenes } = await import('./storyboard');
  const input = {
    businessName: 'Nocek Pottery', craft: 'hand-thrown stoneware', audience: 'collectors',
    offer: 'Ask about the studio sale', photos: [{ url: 'u1', caption: 'The kiln room' }, { url: 'u2', caption: 'Glaze day' }],
  };
  const proof = conceptScenes(input, 'proof_first');
  const story = conceptScenes(input, 'story_first');
  const offer = conceptScenes(input, 'offer_first');
  check('proof_first cut matches the classic default shape', proof[0].onScreen?.includes('stoneware') === true && proof[proof.length - 1].onScreen?.includes('studio sale') === true);
  check('story_first opens with the why, closes with the ask', story[0].onScreen?.includes('Why') === true && story[story.length - 1].onScreen?.includes('studio sale') === true);
  check('offer_first leads WITH the offer', offer[0].onScreen?.includes('studio sale') === true);
  check('all three cuts use the SAME real photos, no inventions', [proof, story, offer].every((c) => c.filter((s) => s.imageUrl).length === 2 && c.every((s) => !s.imageUrl || ['u1', 'u2'].includes(s.imageUrl))));
  check('cuts are genuinely different (opening lines differ)', new Set([proof[0].onScreen, story[0].onScreen, offer[0].onScreen]).size === 3);
  check('deterministic: same input → same cut', JSON.stringify(conceptScenes(input, 'story_first')) === JSON.stringify(story));
}

console.log(`\nstoryboard.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} storyboard check(s) failed`);
