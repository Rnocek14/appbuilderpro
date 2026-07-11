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
const MAX_SCENE_S = 6;
const MAX_TOTAL_S = 60;         // short-form ceiling
const MAX_SCENES = 8;
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
    let dur = clampDur(s.durationS ?? 3.5);
    if (running + dur > MAX_TOTAL_S) dur = clampDur(MAX_TOTAL_S - running);
    if (dur < MIN_SCENE_S) break;                       // no room left — stop cleanly
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

/** SRT caption track from the voiceover lines + cumulative scene timings. Empty when no VO. */
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
      out.push(String(n++), `${fmt(at)} --> ${fmt(at + s.durationS)}`, s.voiceover, '');
    }
    at += s.durationS;
  }
  return out.join('\n').trim();
}

const RESOLUTION: Record<Aspect, string> = { '9:16': 'hd', '1:1': 'hd', '16:9': 'hd' };

/** Compile the storyboard into a Shotstack Edit JSON (the render provider we target). Image clips
 *  get a Ken-Burns motion effect; onScreen text becomes a title clip on a track above; transitions
 *  are in/out fades. Scenes with no image render a colored title card carrying the shoot direction —
 *  so a preview/render is always producible, honestly labeled. Pure + deterministic. */
export function toShotstackEdit(sb: Storyboard): Record<string, unknown> {
  const effectFor: Record<StoryScene['motion'], string | undefined> = {
    zoomIn: 'zoomIn', zoomOut: 'zoomOut', panLeft: 'slideLeft', panRight: 'slideRight', still: undefined,
  };
  const imageClips: Record<string, unknown>[] = [];
  const textClips: Record<string, unknown>[] = [];
  let at = 0;
  for (const s of sb.scenes) {
    const base = { start: Math.round(at * 100) / 100, length: s.durationS, transition: { in: 'fade', out: 'fade' } };
    if (s.imageUrl) {
      imageClips.push({ ...base, asset: { type: 'image', src: s.imageUrl }, effect: effectFor[s.motion], fit: 'cover' });
    } else {
      // No photo → an honest colored card with the shoot direction as its title.
      imageClips.push({ ...base, asset: { type: 'title', text: s.shoot ?? '', style: 'minimal', size: 'small', background: '#0C0E13' } });
    }
    if (s.onScreen) {
      textClips.push({ ...base, asset: { type: 'title', text: s.onScreen, style: 'subtitle', color: sb.accent, size: 'medium', position: 'bottom' } });
    }
    at += s.durationS;
  }
  return {
    timeline: {
      background: '#000000',
      tracks: [
        { clips: textClips },   // text track on top
        { clips: imageClips },  // images below
      ],
    },
    output: { format: 'mp4', resolution: RESOLUTION[sb.aspect], aspectRatio: sb.aspect },
  };
}

export interface DefaultScenesInput {
  businessName: string; craft: string | null; audience: string | null; offer: string | null;
  photos: { url: string; caption: string | null }[];
}

/** A deterministic default storyboard from a business's real photos — the zero-AI floor. A hook
 *  card, one scene per photo (its caption becomes the voiceover), and a closing CTA card. This is
 *  what plays in the browser preview before any AI script runs. */
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
