// Run: npx tsx src/lib/garvis/ugcEdit.verify.ts
import { buildUgcEdit, cutTimesS, describeUgcEdit, scriptToShotList, type UgcTake } from './ugcEdit';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('ugcEdit.verify');

const takes: UgcTake[] = [
  { url: 'https://cdn/x/take1.mp4' },
  { url: 'https://cdn/x/take2.mp4', trimS: 2 },
  { url: 'https://cdn/x/take3.mp4', lengthS: 5 },
];
type Clip = { start: unknown; length: unknown; scale?: { from: number; to: number }[]; asset: Record<string, unknown>; alias?: string; transition?: unknown };
type Edit = { timeline: { tracks: { clips: Clip[] }[] }; output: Record<string, unknown> };

{
  const e = buildUgcEdit(takes, { hookText: 'Recovery does not stop at 6 months', musicUrl: 'https://cdn/x/bed.mp3', broll: [{ url: 'https://cdn/x/diagram.png', kind: 'image', atS: 8, lengthS: 3 }] }) as Edit;
  const [hook, caps, broll, aroll, music] = e.timeline.tracks;
  check('track order: hook > captions > b-roll > A-roll > music', e.timeline.tracks.length === 5
    && (hook.clips[0].asset.type === 'rich-text') && (caps.clips[0].asset.type === 'rich-caption')
    && (broll.clips[0].asset.type === 'image') && (aroll.clips[0].asset.type === 'video') && (music.clips[0].asset.type === 'audio'));
  check('A-roll sequences with smart clips (start auto, length auto/explicit)',
    aroll.clips[0].start === 0 && aroll.clips[1].start === 'auto' && aroll.clips[1].length === 'auto' && aroll.clips[2].length === 5);
  check('punch ALTERNATES: full frame, ~115%, full frame', (aroll.clips[0].scale![0].from === 1)
    && (aroll.clips[1].scale![0].from === 1.15) && (aroll.clips[2].scale![0].from === 1));
  check('every take carries a slow push (bezier, a few percent)', aroll.clips.every((c) => {
    const s = c.scale![0]; return s.to > s.from && s.to <= s.from * 1.1;
  }));
  check('HARD CUTS between takes — no transitions on A-roll', aroll.clips.every((c) => c.transition === undefined));
  check('phone footage is transcoded (rotation/VFR fixes), voice at full volume',
    aroll.clips.every((c) => c.asset.transcode === true && c.asset.volume === 1));
  check('captions transcribe the footage itself (alias://aroll), karaoke style, first take aliased',
    caps.clips[0].asset.src === 'alias://aroll' && (caps.clips[0].asset.animation as { style: string }).style === 'karaoke' && aroll.clips[0].alias === 'aroll');
  check('captions sit LOWER-middle (Shotstack +y is UP, so the offset is negative) in a wrap pill',
    (caps.clips[0] as { offset?: { y: number } }).offset!.y === -0.2
    && (caps.clips[0].asset.background as { wrap: boolean }).wrap === true);
  check('the light boost grade rides every take by default; grade:false removes it',
    aroll.clips.every((c) => (c as { filter?: string }).filter === 'boost')
    && (buildUgcEdit(takes, { grade: false }) as Edit).timeline.tracks[1].clips.every((c) => (c as { filter?: string }).filter === undefined));
  check('hook card dies by 1.5s (after 1s half the scroll is gone)', hook.clips[0].length === 1.5);
  check('b-roll is a MUTED layer over continuous voice at its chosen moment', broll.clips[0].start === 8 && broll.clips[0].length === 3);
  check('music rides quiet under speech (0.15) and fades out',
    music.clips[0].asset.volume === 0.15 && music.clips[0].asset.effect === 'fadeOut');
  check('output is 9:16 mp4 at 30fps', e.output.aspectRatio === '9:16' && e.output.fps === 30);
  check('deterministic', JSON.stringify(buildUgcEdit(takes, { hookText: 'Recovery does not stop at 6 months', musicUrl: 'https://cdn/x/bed.mp3', broll: [{ url: 'https://cdn/x/diagram.png', kind: 'image', atS: 8, lengthS: 3 }] })) === JSON.stringify(e));
}
{
  const bare = buildUgcEdit([{ url: 'https://cdn/x/only.mp4' }]) as Edit;
  check('minimal edit = captions + A-roll only (no empty tracks)', bare.timeline.tracks.length === 2);
  const noCaps = buildUgcEdit(takes, { captions: false }) as Edit;
  check('captions can be disabled', noCaps.timeline.tracks.length === 1);
  const clamped = buildUgcEdit(takes, { punchScale: 2 }) as Edit;
  check('punch clamps to 1.3 (past ~135% the crop goes soft)', clamped.timeline.tracks[1].clips[1].scale![0].from === 1.3);
  const brollClamp = buildUgcEdit(takes, { broll: [{ url: 'https://x/b.mp4', kind: 'video', atS: 4, lengthS: 20 }] }) as Edit;
  check('b-roll length clamps to the 1-8s insert band; video inserts are muted',
    brollClamp.timeline.tracks[1].clips[0].length === 8 && brollClamp.timeline.tracks[1].clips[0].asset.volume === 0);
  check('describe line is honest about what the edit contains',
    describeUgcEdit(takes, { hookText: 'x', broll: [{ url: 'u', kind: 'image', atS: 1, lengthS: 2 }] }).includes('3 real takes')
    && describeUgcEdit([{ url: 'u' }]).includes('1 real take,'));
}

{
  // THE SOUND LAYER + LANES. Explicit lengths (the auto-cut path) make cut times computable.
  const timed: UgcTake[] = [
    { url: 'https://cdn/x/a.mp4', lengthS: 2.15 },
    { url: 'https://cdn/x/a.mp4', trimS: 2.91, lengthS: 2.24 },
    { url: 'https://cdn/x/a.mp4', trimS: 6, lengthS: 3 },
  ];
  check('cut boundaries computed from explicit lengths; unknowable with any auto take',
    JSON.stringify(cutTimesS(timed)) === JSON.stringify([2.15, 4.39])
    && cutTimesS([{ url: 'u' }, { url: 'u', lengthS: 2 }]) === null);

  const kit = { whooshUrl: 'https://cdn/sfx/whoosh.mp3', popUrl: 'https://cdn/sfx/pop.mp3', riserUrl: 'https://cdn/sfx/riser.mp3' };
  const hot = buildUgcEdit(timed, { hookText: 'x', sfx: kit, lane: 'energetic' }) as Edit;
  const hotSfx = hot.timeline.tracks[hot.timeline.tracks.length - 1].clips;
  const vol = (c: Clip) => (c.asset as { volume: number }).volume;
  const src = (c: Clip) => (c.asset as { src: string }).src;
  check('energetic sound design: riser under the hook, pop on the card, a whoosh per cut',
    hotSfx.length === 4 && src(hotSfx[0]).includes('riser') && src(hotSfx[1]).includes('pop')
    && hotSfx.filter((c) => src(c).includes('whoosh')).length === 2);
  check('SFX levels encode the measured convention: riser 0.06, pop 0.2, whoosh 0.12 vs voice at 1',
    vol(hotSfx[0]) === 0.06 && vol(hotSfx[1]) === 0.2 && vol(hotSfx[2]) === 0.12);
  check('the whoosh LEADS its cut by ~3 frames (2.15s cut → 2.05s start)',
    hotSfx[2].start === 2.05 && hotSfx[3].start === 4.29);
  check('energetic lane: pop captions + a hard shake on the first punch-in only',
    ((hot.timeline.tracks[1].clips[0].asset.animation as { style: string }).style === 'pop')
    && Array.isArray((hot.timeline.tracks[2].clips[1] as { offset?: { x: unknown } }).offset?.x)
    && (hot.timeline.tracks[2].clips[0] as { offset?: unknown }).offset === undefined
    && (hot.timeline.tracks[2].clips[2] as { offset?: unknown }).offset === undefined);

  const calm = buildUgcEdit(timed, { hookText: 'x', sfx: kit }) as Edit;
  const calmSfx = calm.timeline.tracks[calm.timeline.tracks.length - 1].clips;
  check('calm lane (the default): no riser, no shake, karaoke captions, sparse whooshes',
    !calmSfx.some((c) => src(c).includes('riser'))
    && ((calm.timeline.tracks[1].clips[0].asset.animation as { style: string }).style === 'karaoke')
    && calm.timeline.tracks[2].clips.every((c) => (c as { offset?: unknown }).offset === undefined));
  const manyCuts: UgcTake[] = Array.from({ length: 9 }, (_, i) => ({ url: 'u', trimS: i * 2, lengthS: 2 }));
  const sparse = buildUgcEdit(manyCuts, { sfx: { whooshUrl: kit.whooshUrl } }) as Edit;
  check('calm whooshes cap at 3 across many cuts (the educational restraint rule)',
    sparse.timeline.tracks[sparse.timeline.tracks.length - 1].clips.length === 3);

  const blind = buildUgcEdit([{ url: 'u' }, { url: 'u' }], { sfx: { whooshUrl: kit.whooshUrl } }) as Edit;
  check('unknown cut times place NO whooshes — never a blind guess (and no empty sfx track)',
    blind.timeline.tracks.length === 2);
  check('sound design is deterministic',
    JSON.stringify(buildUgcEdit(timed, { hookText: 'x', sfx: kit, lane: 'energetic' })) === JSON.stringify(hot));
  check('describe line counts the sound cues and the grade honestly',
    describeUgcEdit(timed, { hookText: 'x', sfx: kit, lane: 'energetic' }).includes('4 sound cues')
    && describeUgcEdit(timed, {}).includes('light color boost')
    && !describeUgcEdit(timed, { grade: false }).includes('light color boost'));
}

{
  const script = { title: 'Sundowning, explained', hooks: ['The 6pm meltdown is not random.', 'Alt hook'],
    scenes: [{ voiceover: 'Light is the lever, not arguing.', onScreen: 'Light', imagePrompt: 'a lamp and a body clock', seconds: 5 }],
    caption: '', cta: 'Follow for the evening routine.', hashtags: [], sources: [], confidence: null, needsReview: true };
  const sheet = scriptToShotList(script as never, 0);
  check('shot list: station-grouped, verbatim lines, CTA on camera',
    sheet.includes('STATION A') && sheet.includes('"The 6pm meltdown is not random."') && sheet.includes('TH-CTA'));
  check('shot list: AI cutaways are POST slots with locked stylized prompts, never photoreal',
    sheet.includes('AI-CUTAWAY') && sheet.includes('a lamp and a body clock') && sheet.includes('NEVER photoreal'));
  check('shot list carries the doctrine: the human testifies, AI illustrates',
    sheet.includes('the human testifies, AI illustrates'));
  check('shot list is deterministic', scriptToShotList(script as never, 0) === sheet);
}

console.log(`\nugcEdit.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} ugcEdit check(s) failed`);
