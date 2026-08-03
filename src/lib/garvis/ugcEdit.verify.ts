// Run: npx tsx src/lib/garvis/ugcEdit.verify.ts
import { buildUgcEdit, describeUgcEdit, type UgcTake } from './ugcEdit';

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

console.log(`\nugcEdit.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} ugcEdit check(s) failed`);
