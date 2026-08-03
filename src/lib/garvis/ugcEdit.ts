// src/lib/garvis/ugcEdit.ts
// THE OWN-FOOTAGE EDIT — pure core (verified by ugcEdit.verify.ts). Turns REAL uploaded footage
// (talking-head takes, product demos, process clips) into the 2026 native edit grammar, encoded
// from measured practice:
//   - HARD CUTS ONLY (~95% of winning shorts' transitions); the cut between takes IS the edit.
//   - PUNCH ALTERNATION: consecutive takes alternate full frame ↔ ~115% punch-in (fit:crop), so
//     every jump cut reads as an intentional camera change; long takes get a 3-8% slow push
//     (bezier ease) — the single most effective retention device in talking-head vertical.
//   - WORD-KARAOKE CAPTIONS from the footage's OWN audio: Shotstack RichCaptionAsset with
//     src alias://aroll transcribes the A-roll and animates the active word — big bold
//     white-with-stroke, lower-middle, inside the platform safe zone.
//   - HOOK CARD on frame one (5-8 words, ≤1.5s) — after 1 second, half the scroll is gone.
//   - B-ROLL AS A LAYER over continuous A-roll audio (muted overlay track, 2-5s inserts),
//     never a cut that interrupts the voice.
//   - MUSIC UNDER SPEECH at ~0.15 volume (platforms normalize to -14 LUFS; hot mixes get squashed).
//   - SFX ON THE CUTS (whoosh −18dB leading the cut by ~3 frames, pop on the hook card, riser
//     under the hook) — the most-cited amateur/pro divider after pacing; sparse for the calm lane,
//     dense for energetic. Cue times come from explicit take lengths (the auto-cut path).
//   - LIGHT GRADE ('boost' filter — contrast+saturation lift, never a LUT) + a hard-shake on the
//     energetic lane's first punch-in (rapid ±1% X-offset keyframes, edges hidden by the overscale).
// The honesty spine: real footage is the SPINE and is never fabricated; AI elements enter only as
// clearly-provenance-stamped b-roll inserts (the hybrid lane), and phone-source quirks are fixed
// with transcode, not faked. Deterministic — same inputs, same edit JSON.

import type { FactScript } from './factChannel';

export interface UgcTake {
  url: string;          // the uploaded clip's public URL (Shotstack fetches it)
  trimS?: number;       // seconds to skip from the take's start
  lengthS?: number;     // seconds to keep; omit = the take's natural length ('auto')
}

export interface UgcBroll {
  url: string;          // image or video insert (AI diagram, product close-up…)
  kind: 'image' | 'video';
  atS: number;          // when it appears on the timeline
  lengthS: number;      // 2-5s is the native band; clamped to 1-8
}

/** The CC0-attested sound kit (the musicBed rule applied to SFX): only URLs the operator supplies
 *  ride a render — no invented sounds. Whatever is missing is simply skipped, honestly. */
export interface SfxKit {
  whooshUrl?: string;       // rides the cuts (placed ~0.1s EARLY — the transient peaks before the visual change)
  popUrl?: string;          // the hook card landing
  riserUrl?: string;        // under the hook's first seconds (energetic lane only)
}

export interface UgcEditOpts {
  hookText?: string;        // the frame-one card; clipped to 60 chars
  accent?: string;          // active caption word color (default #f7c204 — the researched caption yellow)
  musicUrl?: string;        // CC0 bed; rides at duckedVolume under speech
  broll?: UgcBroll[];
  punchScale?: number;      // alternation punch (default 1.15; clamped 1.05-1.3 — past ~135% goes soft)
  captions?: boolean;       // default true
  /** calm = educational/caregiver (sparse SFX, karaoke captions, no shake — the 2026 "dynamic
   *  minimalism" read); energetic = UGC-ad (dense SFX, pop captions, a shake on the first punch).
   *  Default calm. */
  lane?: 'calm' | 'energetic';
  captionStyle?: 'karaoke' | 'pop' | 'highlight';  // default: karaoke (calm) / pop (energetic)
  sfx?: SfxKit;
  grade?: boolean;          // default true: the light-touch 'boost' filter (contrast+saturation lift, no LUT)
}

const clip01 = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Interior cut boundaries on the timeline — computable ONLY when every take carries an explicit
 *  length (the auto-cut path guarantees it). Returns null when any take is 'auto': placing sound
 *  cues blind would be a guess, and this edit never guesses. */
export function cutTimesS(takes: UgcTake[]): number[] | null {
  if (takes.some((t) => t.lengthS === undefined)) return null;
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < takes.length - 1; i++) { t += takes[i].lengthS!; times.push(r2(t)); }
  return times;
}

/** Deterministic even spread: at most `max` of `xs`, keeping the overall spacing. */
const spread = (xs: number[], max: number): number[] =>
  xs.length <= max ? xs : Array.from({ length: max }, (_, i) => xs[Math.floor((i * xs.length) / max)]);

// SFX levels vs voice at 1.0, from the measured convention: whooshes −18dB (≈0.12), impacts/pops
// −14dB (≈0.2), risers −24dB (≈0.06). The whoosh leads its cut by ~3 frames.
const SFX_VOLUME = { whoosh: 0.12, pop: 0.2, riser: 0.06 } as const;
const WHOOSH_LEAD_S = 0.1;

/** The sound-design layer: riser under the hook (energetic), pop on the hook card, whooshes riding
 *  the cuts — sparse for the calm lane (≤3, the educational convention), dense for energetic (≤12).
 *  Only sounds the operator attested (SfxKit) are placed; unknown cut times place nothing. */
function sfxClips(takes: UgcTake[], opts: UgcEditOpts): Record<string, unknown>[] {
  const kit = opts.sfx;
  if (!kit) return [];
  const lane = opts.lane ?? 'calm';
  const clips: Record<string, unknown>[] = [];
  if (kit.riserUrl?.trim() && lane === 'energetic') {
    clips.push({ start: 0, length: 3, asset: { type: 'audio', src: kit.riserUrl.trim(), volume: SFX_VOLUME.riser, effect: 'fadeOut' } });
  }
  if (kit.popUrl?.trim() && opts.hookText?.trim()) {
    clips.push({ start: 0, length: 1.5, asset: { type: 'audio', src: kit.popUrl.trim(), volume: SFX_VOLUME.pop } });
  }
  const cuts = cutTimesS(takes);
  if (kit.whooshUrl?.trim() && cuts?.length) {
    for (const c of spread(cuts, lane === 'energetic' ? 12 : 3)) {
      clips.push({ start: Math.max(0, r2(c - WHOOSH_LEAD_S)), length: 1, asset: { type: 'audio', src: kit.whooshUrl.trim(), volume: SFX_VOLUME.whoosh } });
    }
  }
  return clips;
}

// The CapCut "hard shake", mechanically: rapid small X-offset keyframes (±1% of frame width over
// ~0.3s) on the first punched take — the hook landing. The punch's 115% overscale hides the edges.
const SHAKE_X = [
  { from: 0, to: 0.01, start: 0, length: 0.07, interpolation: 'linear' },
  { from: 0.01, to: -0.008, start: 0.07, length: 0.07, interpolation: 'linear' },
  { from: -0.008, to: 0.005, start: 0.14, length: 0.07, interpolation: 'linear' },
  { from: 0.005, to: 0, start: 0.21, length: 0.07, interpolation: 'linear' },
];

/** Compile real takes + options into a Shotstack edit. Track order (top→bottom): hook card,
 *  captions, b-roll overlay, A-roll, music. Pure + deterministic. */
export function buildUgcEdit(takes: UgcTake[], opts: UgcEditOpts = {}): Record<string, unknown> {
  const punch = clip01(opts.punchScale ?? 1.15, 1.05, 1.3);
  const accent = opts.accent || '#f7c204';
  const lane = opts.lane ?? 'calm';

  // A-ROLL: consecutive smart clips (start 'auto' sequences them; length 'auto' = natural take
  // length) with alternating punch. Every take carries a gentle slow push on top of its base
  // framing; transcode fixes phone rotation/VFR sync; a light 'boost' grade lifts contrast +
  // saturation without a LUT (the UGC norm: correct, don't grade). The first take is aliased for
  // captions; the energetic lane shakes the first punch-in — the hook landing.
  const aroll = takes.map((t, i) => {
    const base = i % 2 === 1 ? punch : 1.0;
    return {
      start: i === 0 ? 0 : 'auto', length: t.lengthS ?? 'auto',
      fit: 'crop',
      scale: [{ from: base, to: Math.round(base * 1.06 * 100) / 100, start: 0, length: t.lengthS ?? 8, interpolation: 'bezier', easing: 'easeInOut' }],
      ...(opts.grade !== false ? { filter: 'boost' } : {}),
      ...(lane === 'energetic' && i === 1 ? { offset: { x: SHAKE_X } } : {}),
      asset: { type: 'video', src: t.url, transcode: true, volume: 1, ...(t.trimS ? { trim: t.trimS } : {}) },
      ...(i === 0 ? { alias: 'aroll' } : {}),
    };
  });

  const tracks: Record<string, unknown>[] = [];

  // HOOK CARD — frame one IS the thumbnail in a vertical feed. Top third, bold, gone by 1.5s.
  if (opts.hookText?.trim()) {
    tracks.push({
      clips: [{
        start: 0, length: 1.5, transition: { out: 'fade' },
        asset: {
          type: 'rich-text', text: opts.hookText.trim().slice(0, 60),
          font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: 88, lineHeight: 1.1 },
          style: { textTransform: 'uppercase' },
          stroke: { color: '#000000', width: 3 },
          background: { color: '#000000', opacity: 0.35, padding: 28, borderRadius: 20 },
          align: { horizontal: 'center', vertical: 'top' },
          animation: { style: 'typewriter' },
          width: 900, height: 500,
        },
        offset: { y: -0.28 },
      }],
    });
  }

  // WORD-ANIMATED CAPTIONS from the A-roll's own audio — karaoke fill for the calm lane, per-word
  // pop for energetic; active word in caption yellow; a wrap:true pill (the CapCut badge look, not
  // a full-width slab); 3px stroke (load-bearing on bright footage). Positive offset.y moves UP in
  // Shotstack, so lower-middle is NEGATIVE: -0.2 puts the block ~30% from the bottom, above the
  // platforms' bottom-UI dead zone.
  if (opts.captions !== false) {
    tracks.push({
      clips: [{
        start: 0, length: 'end',
        asset: {
          type: 'rich-caption', src: 'alias://aroll',
          font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: 76, lineHeight: 1.15 },
          stroke: { color: '#000000', width: 3 },
          background: { color: '#000000', opacity: 0.5, padding: 20, borderRadius: 16, wrap: true },
          active: { font: { color: accent } },
          animation: { style: opts.captionStyle ?? (lane === 'energetic' ? 'pop' : 'karaoke') },
        },
        offset: { y: -0.2 },
      }],
    });
  }

  // B-ROLL — a muted visual layer OVER the continuous voice, 2-5s inserts, hard in/out.
  const broll = (opts.broll ?? [])
    .filter((b) => b.url && b.atS >= 0)
    .sort((a, b) => a.atS - b.atS)
    .map((b) => ({
      start: Math.round(b.atS * 100) / 100, length: clip01(b.lengthS, 1, 8), fit: 'crop',
      asset: b.kind === 'video'
        ? { type: 'video', src: b.url, volume: 0, transcode: true }
        : { type: 'image', src: b.url },
      ...(b.kind === 'image' ? { effect: 'zoomInSlow' } : {}),
    }));
  if (broll.length) tracks.push({ clips: broll });

  tracks.push({ clips: aroll });

  // MUSIC as an AudioAsset clip (soundtrack volume can't tween) — quiet under speech, fades out.
  if (opts.musicUrl?.trim()) {
    tracks.push({
      clips: [{ start: 0, length: 'end', asset: { type: 'audio', src: opts.musicUrl.trim(), volume: 0.15, effect: 'fadeOut' } }],
    });
  }

  // THE SFX LAYER — the most-cited amateur/pro divider after pacing. All clips mix; z-order is
  // meaningless for audio, so it rides at the bottom.
  const sfx = sfxClips(takes, opts);
  if (sfx.length) tracks.push({ clips: sfx });

  return {
    timeline: { background: '#000000', tracks },
    output: { format: 'mp4', resolution: 'hd', aspectRatio: '9:16', fps: 30 },
  };
}

/** One honest line describing the edit — for the artifact record and the approval preview. */
export function describeUgcEdit(takes: UgcTake[], opts: UgcEditOpts = {}): string {
  const parts = [`${takes.length} real take${takes.length === 1 ? '' : 's'}, hard cuts, alternating punch-ins`];
  if (opts.captions !== false) parts.push('word-animated captions from the footage\'s own audio');
  if (opts.hookText?.trim()) parts.push('frame-one hook card');
  if (opts.broll?.length) parts.push(`${opts.broll.length} b-roll insert${opts.broll.length === 1 ? '' : 's'} over continuous voice`);
  if (opts.musicUrl?.trim()) parts.push('music bed ducked under speech');
  const cues = sfxClips(takes, opts).length;
  if (cues) parts.push(`${cues} sound cue${cues === 1 ? '' : 's'}`);
  if (opts.grade !== false) parts.push('light color boost');
  return parts.join(' · ');
}

/** THE SHOT LIST — a drafted episode becomes the operator's filming sheet: station-grouped rows
 *  (film everything at one setup before moving), verbatim lines, framing + delivery notes, and the
 *  POST slots (hook card, AI illustration cutaways with locked prompts). Encodes the hybrid
 *  doctrine: the human testifies (hook, claims, CTA on camera); AI illustrates (2-4s stylized
 *  cutaways, never photoreal, never the claim). Deterministic. */
export function scriptToShotList(script: FactScript, hookIndex: number): string {
  const hi = Math.min(Math.max(0, Math.trunc(hookIndex)), script.hooks.length - 1);
  const rows: string[] = [
    `EPISODE: ${script.title}`,
    '',
    'STATION A — one setup (kitchen table / desk), phone vertical on tripod, eyes on the',
    'top-third line, quiet room. Film every row below before moving. 2-3 takes each.',
    '',
    `A1  TH-HOOK   medium     "${script.hooks[hi]}"`,
    '               (urgent, lean in — this line IS the video\'s first second)',
  ];
  script.scenes.forEach((sc, i) => {
    rows.push(`A${i + 2}  TH-SPINE  ${i === script.scenes.length - 1 ? 'close-up ' : 'medium   '} "${sc.voiceover}"`);
  });
  if (script.cta) rows.push(`A${script.scenes.length + 2}  TH-CTA    medium     "${script.cta}"`, '               (warm, smile)');
  rows.push('', 'POST SLOTS (not filmed — added in the studio):', 'P1  HOOK CARD  text: "' + script.hooks[hi].slice(0, 60) + '"');
  script.scenes.forEach((sc, i) => {
    if (sc.imagePrompt) rows.push(`P${i + 2}  AI-CUTAWAY after A${i + 2}: stylized illustration — "${sc.imagePrompt}" (2-4s, channel palette, tag "Illustration", NEVER photoreal)`);
  });
  rows.push('', 'DOCTRINE: the human testifies, AI illustrates. Claims and the CTA stay ON CAMERA.',
    'Stylized cutaways need no platform AI label; anything photoreal would. Caption line:',
    '"Illustrations AI-assisted." Educational disclaimers per the channel\'s rules.');
  return rows.join('\n');
}
