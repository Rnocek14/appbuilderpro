// src/lib/garvis/storyboard.ts
// THE VIDEO PILLAR — pure core (verified by storyboard.verify.ts). Turns a business's REAL vault
// photos + a script into a timed, captioned storyboard, and compiles that storyboard into a render
// provider's edit JSON. Same honesty spine as the rest of the system: real artwork only (never
// stock/AI-hallucinated footage); when there's no photo for a beat it renders a visible SHOOT
// direction, never a fake frame; the caption track is generated from the actual voiceover lines.
//
// Two consumers: (1) the browser preview (a real, watchable Ken-Burns slideshow — usable with zero
// setup), and (2) render-video, which sends toShotstackEdit(sb) to a cloud render provider to
// produce an actual mp4 when a render key exists.

import { sfxCueClips, type SfxKit } from './ugcEdit';

export type Aspect = '9:16' | '1:1' | '16:9';

export interface StoryScene {
  durationS: number;
  imageUrl: string | null;      // a REAL vault photo, or null → shoot direction shown instead
  shoot: string | null;         // "shoot: hands working the clay" when no photo fits — never faked
  onScreen: string;             // short text overlay (hook / label / CTA)
  voiceover: string;            // the narration line (also the caption text)
  motion: 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'still';
  transition: 'fade' | 'slideLeft' | 'none';
}

export interface Storyboard {
  title: string;
  aspect: Aspect;
  accent: string;               // brand color for text overlays
  scenes: StoryScene[];
  totalDurationS: number;
  captionsSrt: string;
}

const MIN_SCENE_S = 2;
const MAX_SCENE_S = 8;
// 90s ceiling: TikTok's Creator Rewards pays only on ORIGINAL videos ≥60s, and 60-90s is the
// monetizable short-form band on every platform — a 60s cap would exclude exactly the videos
// that earn. Still short-form: nothing here builds long-form.
const MAX_TOTAL_S = 90;
const MAX_SCENES = 14;
const MOTIONS: StoryScene['motion'][] = ['zoomIn', 'panRight', 'zoomOut', 'panLeft'];

const clampDur = (n: number) => Math.min(MAX_SCENE_S, Math.max(MIN_SCENE_S, Math.round(n * 10) / 10));
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export interface SceneInput {
  imageUrl?: string | null;
  shoot?: string | null;
  onScreen?: string;
  voiceover?: string;
  durationS?: number;
}

/** Normalize raw scene inputs into a valid, watchable storyboard. Enforces per-scene + total
 *  duration caps, assigns varied motion, alternates a default transition, caps scene count, and
 *  guarantees every scene has EITHER a real image OR a visible shoot direction — never a blank. */
export function buildStoryboard(input: {
  title: string; aspect?: Aspect; accent?: string; scenes: SceneInput[];
}): Storyboard {
  const raw = input.scenes.slice(0, MAX_SCENES);
  let running = 0;
  const scenes: StoryScene[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const remaining = Math.round((MAX_TOTAL_S - running) * 10) / 10;
    if (remaining < MIN_SCENE_S) break;                 // no room left — stop cleanly
    let dur = clampDur(s.durationS ?? 3.5);
    if (dur > remaining) dur = clampDur(remaining);     // remaining ≥ MIN here, so this never re-inflates past the ceiling
    running += dur;
    const imageUrl = s.imageUrl?.trim() || null;
    const shoot = imageUrl ? null : (s.shoot?.trim() || 'shoot: a shot that fits this line');
    scenes.push({
      durationS: dur,
      imageUrl,
      shoot,
      onScreen: clip((s.onScreen ?? '').trim(), 70),
      voiceover: clip((s.voiceover ?? '').trim(), 200),
      motion: MOTIONS[i % MOTIONS.length],
      transition: i === 0 ? 'fade' : (i % 2 === 0 ? 'fade' : 'slideLeft'),
    });
  }
  const totalDurationS = Math.round(scenes.reduce((n, s) => n + s.durationS, 0) * 10) / 10;
  return {
    title: input.title.trim() || 'Untitled',
    aspect: input.aspect ?? '9:16',
    accent: input.accent || '#FF8A3D',
    scenes,
    totalDurationS,
    captionsSrt: buildCaptionsSrt(scenes),
  };
}

/** Split a narration line into caption chunks: ≤maxWords per screen (the measured short-form spec
 *  is 3-7 words — a full sentence on screen reads as a subtitle slab, not a caption), splitting at
 *  phrase punctuation FIRST so chunks break where comprehension breaks, then by word count. */
export function chunkCaptionLine(line: string, maxWords = 4): string[] {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // Phrase boundaries: a word ending in phrase punctuation closes its chunk.
  const phrases: string[][] = [[]];
  for (const w of words) {
    phrases[phrases.length - 1].push(w);
    if (/[,;:.!?…—–]["')\]]?$/.test(w)) phrases.push([]);
  }
  // A chunk must not END on a dangling function word (article/preposition/conjunction) — the
  // subtitling readability rule: never make the reader hold an incomplete grammatical unit.
  const DANGLERS = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'for', 'and', 'or', 'but', 'with', 'at', 'on', 'as', 'by', 'is', 'are', 'was']);
  const chunks: string[] = [];
  for (const p of phrases.filter((x) => x.length)) {
    // Balanced split: 7 words → 4+3, never 4+3+0 or a 1-word orphan when avoidable.
    const parts = Math.ceil(p.length / maxWords);
    const per = Math.ceil(p.length / parts);
    const split: string[][] = [];
    for (let i = 0; i < p.length; i += per) split.push(p.slice(i, i + per));
    for (let i = 0; i < split.length - 1; i++) {
      while (split[i].length > 1 && DANGLERS.has(split[i][split[i].length - 1].toLowerCase())) {
        split[i + 1].unshift(split[i].pop()!);
      }
    }
    chunks.push(...split.filter((x) => x.length).map((x) => x.join(' ')));
  }
  return chunks;
}

/** SRT caption track from the voiceover lines + cumulative scene timings, CHUNKED to the
 *  short-form spec: one small phrase per cue, timed proportionally by word count across the
 *  scene (TTS paces steadily, so proportional ≈ spoken). The word-karaoke animation then
 *  interpolates inside each cue. Empty when no VO. */
export function buildCaptionsSrt(scenes: StoryScene[]): string {
  const fmt = (t: number) => {
    const ms = Math.round((t % 1) * 1000);
    const s = Math.floor(t) % 60;
    const m = Math.floor(t / 60) % 60;
    const h = Math.floor(t / 3600);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, '0')}`;
  };
  const out: string[] = [];
  let at = 0;
  let n = 1;
  for (const s of scenes) {
    if (s.voiceover) {
      const chunks = chunkCaptionLine(s.voiceover);
      const totalWords = chunks.reduce((a, c) => a + c.split(' ').length, 0);
      let t = at;
      for (let i = 0; i < chunks.length; i++) {
        // Last chunk closes exactly on the scene boundary — rounding never drifts across scenes.
        const end = i === chunks.length - 1 ? at + s.durationS
          : t + (s.durationS * chunks[i].split(' ').length) / totalWords;
        out.push(String(n++), `${fmt(t)} --> ${fmt(end)}`, chunks[i], '');
        t = end;
      }
    }
    at += s.durationS;
  }
  return out.join('\n').trim();
}

export interface WordTiming { w: string; s: number; e: number }

/** WORD-EXACT SRT from TTS timestamps (the ElevenLabs alignment path) — every cue starts and ends
 *  when the words are actually SPOKEN, the precision no transcription-first tool matches (their #1
 *  complaint is caption errors; ours is the script, verbatim). `timings` is indexed by scene;
 *  word times are relative to each scene's clip and offset to the timeline here. Scenes without
 *  timings (or with a token-count mismatch — e.g. the provider normalized numbers) fall back to
 *  proportional chunking for THAT scene, honestly. */
export function buildTimedCaptionsSrt(scenes: StoryScene[], timings: (WordTiming[] | null | undefined)[]): string {
  const fmt = (t: number) => {
    const ms = Math.round((t % 1) * 1000);
    const s = Math.floor(t) % 60;
    const m = Math.floor(t / 60) % 60;
    const h = Math.floor(t / 3600);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, '0')}`;
  };
  const out: string[] = [];
  let at = 0;
  let n = 1;
  for (let si = 0; si < scenes.length; si++) {
    const s = scenes[si];
    if (s.voiceover) {
      const chunks = chunkCaptionLine(s.voiceover);
      const tokens = s.voiceover.trim().split(/\s+/).filter(Boolean);
      const words = timings[si];
      if (words && words.length === tokens.length) {
        let k = 0;
        for (const c of chunks) {
          const nWords = c.split(' ').length;
          const start = at + words[k].s;
          const end = Math.min(at + words[k + nWords - 1].e, at + s.durationS);
          out.push(String(n++), `${fmt(start)} --> ${fmt(Math.max(end, start + 0.2))}`, c, '');
          k += nWords;
        }
      } else {
        const totalWords = chunks.reduce((a, c) => a + c.split(' ').length, 0);
        let t = at;
        for (let i = 0; i < chunks.length; i++) {
          const end = i === chunks.length - 1 ? at + s.durationS
            : t + (s.durationS * chunks[i].split(' ').length) / totalWords;
          out.push(String(n++), `${fmt(t)} --> ${fmt(end)}`, chunks[i], '');
          t = end;
        }
      }
    }
    at += s.durationS;
  }
  return out.join('\n').trim();
}

const RESOLUTION: Record<Aspect, string> = { '9:16': 'hd', '1:1': 'hd', '16:9': 'hd' };

/** Optional media layers for the render: per-scene voiceover clips (from tts-voiceover), a hosted
 *  .srt caption track, a music bed, and the shared sound-design layer (sfxCueClips — scene
 *  boundaries are always explicit here, so cues land precisely). All optional; the no-opts edit is
 *  identical to the undefined-opts edit (regression-checked), so the zero-setup path always works. */
export interface EditOpts {
  voClips?: { sceneIndex: number; url: string }[];
  srtUrl?: string;
  musicUrl?: string;
  musicVolume?: number;   // musicBed.volumeForMusic decides: ducked under VO, fuller without
  /** calm (default) = educational restraint: karaoke captions, ≤3 whooshes, no riser.
   *  energetic = per-word pop captions, dense cues, riser under the hook. */
  lane?: 'calm' | 'energetic';
  sfx?: SfxKit;           // the CC0-attested kit; only what the operator supplied is placed
  /** editPlan.planEmphasis output: WHICH scenes are the turning points. Those scenes zoom hard
   *  (zoomInFast) and the whooshes ride THEIR cuts — meaning-driven placement, not cadence. */
  emphasisIndices?: number[];
}

/** Compile the storyboard into a Shotstack Edit JSON (the render provider we target). Image clips
 *  get a Ken-Burns motion effect; onScreen text becomes a title clip on a track above; transitions
 *  are in/out fades. Scenes with no image render a colored title card carrying the shoot direction —
 *  so a preview/render is always producible, honestly labeled. With opts, voiceover clips land at
 *  their scene's cumulative start (per-scene audio aligns exactly — a single full track drifts),
 *  captions ride the hosted SRT, and the music bed becomes the timeline soundtrack. Pure. */
export function toShotstackEdit(sb: Storyboard, opts?: EditOpts): Record<string, unknown> {
  const effectFor: Record<StoryScene['motion'], string | undefined> = {
    zoomIn: 'zoomIn', zoomOut: 'zoomOut', panLeft: 'slideLeft', panRight: 'slideRight', still: undefined,
  };
  const imageClips: Record<string, unknown>[] = [];
  const textClips: Record<string, unknown>[] = [];
  let at = 0;
  for (let i = 0; i < sb.scenes.length; i++) {
    const s = sb.scenes[i];
    // HARD CUTS between scenes (the retention-era meta — dissolves read as template-slideshow);
    // only the video's very first frame fades in. The alternating Ken-Burns motion carries the
    // energy; direction flips every cut so no two moves repeat back-to-back.
    const base: Record<string, unknown> = { start: Math.round(at * 100) / 100, length: s.durationS };
    if (i === 0) base.transition = { in: 'fade' };
    if (s.imageUrl) {
      // Emphasis scenes (the script's turning points — editPlan) zoom HARD; everything else keeps
      // the gentle alternating drift. Aggressive motion is a scarce resource, spent on meaning.
      const effect = opts?.emphasisIndices?.includes(i) ? 'zoomInFast' : effectFor[s.motion];
      imageClips.push({ ...base, asset: { type: 'image', src: s.imageUrl }, effect, fit: 'cover' });
    } else {
      // No photo → an honest dark card carrying the shoot direction (rich-text: the legacy title
      // asset is deprecated in the current schema).
      imageClips.push({
        ...base,
        asset: {
          type: 'rich-text', text: s.shoot ?? '',
          font: { family: 'Montserrat ExtraBold', color: '#8B93A7', size: 44, lineHeight: 1.3 },
          background: { color: '#0C0E13', opacity: 1, padding: 40 },
          align: { horizontal: 'center', vertical: 'center' },
          width: 940, height: 1600,
        },
      });
    }
    if (s.onScreen) {
      // Overlay text rides the TOP third — the bottom ~300-400px is the platforms' UI dead zone
      // and the lower-middle belongs to the burned captions. White-on-pill with a stroke (the
      // readability spec — accent color stays in the artwork); a quick fade-in per beat. The hook
      // line on frame one IS the thumbnail in a vertical feed; it must read muted, instantly.
      textClips.push({
        ...base,
        asset: {
          type: 'rich-text', text: s.onScreen,
          font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: 64, lineHeight: 1.15 },
          stroke: { color: '#000000', width: 2 },
          background: { color: '#000000', opacity: 0.35, borderRadius: 18, wrap: true, padding: 22 },
          align: { horizontal: 'center', vertical: 'center' },
          animation: { preset: 'fadeIn', duration: 0.4 },
          width: 920, height: 360,
        },
        offset: { y: 0.26 },
      });
    }
    at += s.durationS;
  }

  // Scene-start offsets for aligning per-scene audio clips (cumulative, same rounding as clips).
  const sceneStart = (index: number) => {
    let t = 0;
    for (let i = 0; i < index && i < sb.scenes.length; i++) t += sb.scenes[i].durationS;
    return Math.round(t * 100) / 100;
  };

  const tracks: Record<string, unknown>[] = [];
  // Caption track on top when a hosted SRT exists — RICH captions (word-animated: karaoke fill on
  // the calm lane, per-word pop on energetic; the legacy caption asset is superseded), big bold
  // white with a 3px stroke in a wrap pill, active word in caption yellow, sitting LOWER-MIDDLE
  // (offset.y -0.2 — Shotstack +y is UP) above the platforms' bottom UI dead zone. Captions lift
  // completion materially (~80% watch muted at least sometimes); they are half the perceived
  // motion on a stills-based video.
  if (opts?.srtUrl) {
    tracks.push({
      clips: [{
        start: 0, length: sb.totalDurationS,
        asset: {
          type: 'rich-caption', src: opts.srtUrl,
          font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: 76, lineHeight: 1.15 },
          stroke: { color: '#000000', width: 3 },
          background: { color: '#000000', opacity: 0.5, padding: 20, borderRadius: 16, wrap: true },
          active: { font: { color: '#f7c204' } },
          animation: { style: (opts.lane ?? 'calm') === 'energetic' ? 'pop' : 'karaoke' },
        },
        offset: { y: -0.2 },
      }],
    });
  }
  tracks.push({ clips: textClips });   // text track on top of images
  tracks.push({ clips: imageClips }); // images below
  // Voiceover audio: one clip per scene, starting exactly at its scene's cumulative start.
  const vo = (opts?.voClips ?? [])
    .filter((c) => c.sceneIndex >= 0 && c.sceneIndex < sb.scenes.length && !!c.url)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);
  if (vo.length) {
    tracks.push({
      clips: vo.map((c) => ({
        start: sceneStart(c.sceneIndex),
        length: sb.scenes[c.sceneIndex].durationS,
        asset: { type: 'audio', src: c.url },
      })),
    });
  }

  // THE SFX LAYER (the shared sound-design core): whooshes riding the scene cuts, pop on the hook,
  // riser on the energetic lane. Scene boundaries are always explicit here, so cues land precisely
  // — and when an emphasis plan exists, the whooshes ride the TURNING-POINT cuts, not a spread.
  if (opts?.sfx) {
    const emphasisCuts = (opts.emphasisIndices ?? [])
      .filter((i) => i >= 1 && i < sb.scenes.length)
      .map((i) => sceneStart(i));
    const cuts = emphasisCuts.length ? emphasisCuts : sb.scenes.slice(0, -1).map((_, i) => sceneStart(i + 1));
    const sfx = sfxCueClips(cuts, { lane: opts.lane, sfx: opts.sfx, hook: !!sb.scenes[0]?.onScreen });
    if (sfx.length) tracks.push({ clips: sfx });
  }

  const timeline: Record<string, unknown> = { background: '#000000', tracks };
  if (opts?.musicUrl) {
    timeline.soundtrack = { src: opts.musicUrl, effect: 'fadeInFadeOut', volume: opts.musicVolume ?? 0.2 };
  }
  return {
    timeline,
    output: { format: 'mp4', resolution: RESOLUTION[sb.aspect], aspectRatio: sb.aspect },
  };
}

export interface DefaultScenesInput {
  businessName: string; craft: string | null; audience: string | null; offer: string | null;
  photos: { url: string; caption: string | null }[];
}

/** VIDEO RENDITIONS — the postcard pattern applied to the timeline: three deterministic CUTS of
 *  the SAME real photos, one click each. Different opening mechanism, different narrative order,
 *  zero invention — every line derives from the business context or a photo caption. */
export type VideoConcept = 'proof_first' | 'story_first' | 'offer_first';

export const VIDEO_CONCEPTS: { id: VideoConcept; label: string; blurb: string }[] = [
  { id: 'proof_first', label: 'Proof first', blurb: 'Hook card, then the work speaks — photo by photo — then the ask.' },
  { id: 'story_first', label: 'Story first', blurb: 'Opens with the human why, photos as chapters, the ask lands last.' },
  { id: 'offer_first', label: 'Offer first', blurb: 'The offer IS the opening card; proof follows; closes with how to respond.' },
];

export function conceptScenes(input: DefaultScenesInput, concept: VideoConcept): SceneInput[] {
  if (concept === 'proof_first') return defaultScenes(input);
  const name = input.businessName || 'this business';
  const photos = input.photos.slice(0, 5).map((p) => ({
    imageUrl: p.url,
    onScreen: p.caption ? clip(p.caption, 60) : '',
    voiceover: p.caption ? clip(p.caption, 120) : '',
    durationS: 3.5,
  }));
  if (concept === 'story_first') {
    return [
      {
        onScreen: clip(`Why ${name} exists`, 60),
        voiceover: input.craft ? `${name} started with one thing: ${input.craft}.` : `${name} — here's the short story.`,
        durationS: 3,
      },
      ...photos,
      ...(input.audience ? [{ onScreen: clip(`For ${input.audience}`, 60), voiceover: clip(`We do it for ${input.audience}.`, 120), durationS: 3 }] : []),
      { onScreen: clip(input.offer || 'Get in touch', 60), voiceover: input.offer || `Reach out to ${name}.`, durationS: 3 },
    ];
  }
  // offer_first
  return [
    {
      onScreen: clip(input.offer || `${name} — one offer`, 60),
      voiceover: input.offer ? `${input.offer}. Here's the proof.` : `${name}. Here's the proof.`,
      durationS: 3,
    },
    ...photos,
    {
      onScreen: clip(input.craft ? `${name} · ${input.craft}` : name, 60),
      voiceover: `That's ${name}. Reach out — the offer stands.`,
      durationS: 3,
    },
  ];
}

/** A deterministic default storyboard from a business's real photos — the zero-AI floor. A hook
 *  card, one scene per photo (its caption becomes the voiceover), and a closing CTA card. This is
 *  what plays in the browser preview before any AI script runs. */
/** The SPOKEN-SUBJECT scenes: "make a video about X" must make a video ABOUT X — the same real
 *  photos, but the opening and closing words center the named subject, not the business
 *  generally. No invented facts: the subject is the operator's own words, the name is real, and
 *  everything else stays what it was. */
export function subjectScenes(input: DefaultScenesInput, subject: string, concept: VideoConcept): SceneInput[] {
  const name = input.businessName || 'this business';
  const s = clip(subject, 60);
  const photos = input.photos.slice(0, 5).map((p) => ({
    imageUrl: p.url,
    onScreen: p.caption ? clip(p.caption, 60) : '',
    voiceover: p.caption ? clip(p.caption, 120) : '',
    durationS: 3.5,
  }));
  const close = { onScreen: clip(input.offer || 'Get in touch', 60), voiceover: input.offer || `Reach out to ${name}.`, durationS: 3 };
  if (concept === 'story_first') {
    return [
      { onScreen: s, voiceover: clip(`${subject} — here's the story, from ${name}.`, 120), durationS: 3 },
      ...photos,
      close,
    ];
  }
  if (concept === 'offer_first') {
    return [
      { onScreen: clip(input.offer || s, 60), voiceover: clip(`${subject}. Here's a look.`, 120), durationS: 3 },
      ...photos,
      { onScreen: clip(`${name} · ${subject}`, 60), voiceover: clip(`That's ${subject}. Reach out — ${name}.`, 120), durationS: 3 },
    ];
  }
  // proof_first
  return [
    { onScreen: s, voiceover: clip(`${name} — ${subject}.`, 120), durationS: 3 },
    ...photos,
    close,
  ];
}

export function defaultScenes(input: DefaultScenesInput): SceneInput[] {
  const scenes: SceneInput[] = [];
  const name = input.businessName || 'this business';
  scenes.push({
    onScreen: input.craft ? clip(`${input.craft}`, 60) : name,
    voiceover: input.craft ? `${name} — ${input.craft}.` : name,
    durationS: 3,
  });
  for (const p of input.photos.slice(0, 5)) {
    scenes.push({
      imageUrl: p.url,
      onScreen: p.caption ? clip(p.caption, 60) : '',
      voiceover: p.caption ? clip(p.caption, 120) : '',
      durationS: 3.5,
    });
  }
  scenes.push({
    onScreen: clip(input.offer || 'Get in touch', 60),
    voiceover: input.offer || `Reach out to ${name}.`,
    durationS: 3,
  });
  return scenes;
}
