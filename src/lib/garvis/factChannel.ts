// src/lib/garvis/factChannel.ts
// THE FACT-CHANNEL CORE — pure half of the faceless-channel engine (verified by
// factChannel.verify.ts). A fact channel publishes original 60-90s explainers (finance facts,
// interesting facts) built from a CITED script: the fact-script edge fn drafts it, this core
// validates + normalizes it, turns the chosen hook variant into a renderable storyboard scene list,
// and composes the post caption. The honesty spine, encoded:
//   - CLAIMS CARRY SOURCES. A script whose scenes assert facts with no sources is marked
//     needs_review — it can be edited and produced, but the flag is visible, never silent.
//   - THE 60-90s BAND. TikTok's Creator Rewards pays only on original ≥60s video; 90s is the
//     storyboard ceiling. bandCheck says honestly which side of the band a cut lands on.
//   - AI VISUALS ARE ILLUSTRATIONS. Image prompts get the guardrails clause (no text/watermarks,
//     no recognizable real people, no brand logos) — illustration, never fabricated "footage" of a
//     real person, product, or place. Provenance is stamped at generation; disclosure at publish.

import type { SceneInput } from './storyboard';

export interface FactSource { claim: string; url: string; note?: string }
export interface FactScene {
  voiceover: string;    // the narration line (≤200 chars — also the caption text)
  onScreen: string;     // short overlay (≤70 chars)
  imagePrompt: string;  // what to illustrate for this beat
  seconds: number;      // 3-8s per beat
}
export interface FactScript {
  title: string;
  hooks: string[];          // 2-5 opening variants — the A/B seam the learning loop feeds on
  scenes: FactScene[];      // the value beats AFTER the hook
  caption: string;          // post caption draft (the disclosure is appended at queue time)
  cta: string;
  hashtags: string[];
  sources: FactSource[];
  confidence: number | null;
  needsReview: boolean;     // true when factual beats carry no sources — visible, never silent
}

const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const HOOK_MIN = 2;
const HOOK_MAX = 5;
const SCENE_MIN_S = 3;
const SCENE_MAX_S = 8;
const MAX_VALUE_SCENES = 13;   // + 1 hook scene = the storyboard's 14-scene cap

/** Normalize + validate a model-drafted fact script. Never trusts shape; clamps everything;
 *  refuses only what can't be repaired (no scenes, no hooks). Deterministic. */
export function parseFactScript(raw: unknown): { ok: true; script: FactScript; warnings: string[] } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'The script did not come back as JSON.' };
  const o = raw as Record<string, unknown>;
  const warnings: string[] = [];

  const hooks = (Array.isArray(o.hooks) ? o.hooks : [])
    .map((h) => clip(h, 120)).filter(Boolean).slice(0, HOOK_MAX);
  if (!hooks.length) return { ok: false, reason: 'The script has no hook variants.' };
  if (hooks.length < HOOK_MIN) warnings.push('Only one hook came back — hook testing needs at least two.');

  const scenes: FactScene[] = (Array.isArray(o.scenes) ? o.scenes : [])
    .map((s) => {
      const sc = (s ?? {}) as Record<string, unknown>;
      const seconds = Number(sc.seconds);
      return {
        voiceover: clip(sc.voiceover, 200),
        onScreen: clip(sc.onScreen, 70),
        imagePrompt: clip(sc.imagePrompt, 400),
        seconds: Number.isFinite(seconds) ? Math.min(SCENE_MAX_S, Math.max(SCENE_MIN_S, Math.round(seconds))) : 5,
      };
    })
    .filter((s) => s.voiceover.length > 0)
    .slice(0, MAX_VALUE_SCENES);
  if (!scenes.length) return { ok: false, reason: 'The script has no scenes with narration.' };

  const sources: FactSource[] = (Array.isArray(o.sources) ? o.sources : [])
    .map((s) => {
      const sc = (s ?? {}) as Record<string, unknown>;
      return { claim: clip(sc.claim, 200), url: clip(sc.url, 500), ...(sc.note ? { note: clip(sc.note, 200) } : {}) };
    })
    .filter((s) => s.claim && /^https?:\/\//.test(s.url));
  const needsReview = sources.length === 0;
  if (needsReview) warnings.push('No sources came back — the claims are UNVERIFIED. Review every line before producing.');

  const confidence = typeof o.confidence === 'number' && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
  return {
    ok: true,
    warnings,
    script: {
      title: clip(o.title, 90) || 'Untitled episode',
      hooks, scenes, sources, needsReview, confidence,
      caption: clip(o.caption, 800),
      cta: clip(o.cta, 120),
      hashtags: (Array.isArray(o.hashtags) ? o.hashtags : [])
        .map((h) => clip(h, 40).replace(/^#/, '')).filter(Boolean).slice(0, 8),
    },
  };
}

/** Total runtime of a cut: the hook beat (3s) + every value beat. */
export function scriptTotalSeconds(script: FactScript): number {
  return 3 + script.scenes.reduce((n, s) => n + s.seconds, 0);
}

/** Which side of the monetizable 60-90s band a cut lands on — honest, never blocking. */
export function bandCheck(totalSeconds: number): { ok: boolean; note: string | null } {
  if (totalSeconds < 60) return { ok: false, note: `${totalSeconds}s — under 60s, so TikTok's Creator Rewards won't count it. Add beats to clear 60s (Shorts/Reels still take it).` };
  if (totalSeconds > 90) return { ok: false, note: `${totalSeconds}s — over the 90s short-form ceiling. Cut beats.` };
  return { ok: true, note: null };
}

/** Turn the chosen hook variant + value beats into storyboard scene inputs, with the image prompt
 *  for each scene index alongside (scene 0 = the hook card, illustrated by the FIRST beat's prompt
 *  so the opening frame isn't a bare card). */
export function scriptToScenes(script: FactScript, hookIndex: number): { scenes: SceneInput[]; imagePrompts: string[] } {
  const hi = Math.min(Math.max(0, Math.trunc(hookIndex)), script.hooks.length - 1);
  const hook = script.hooks[hi];
  const scenes: SceneInput[] = [
    { onScreen: hook.slice(0, 70), voiceover: hook, durationS: 3 },
    ...script.scenes.map((s) => ({ onScreen: s.onScreen, voiceover: s.voiceover, durationS: s.seconds })),
  ];
  const imagePrompts = [script.scenes[0]?.imagePrompt ?? '', ...script.scenes.map((s) => s.imagePrompt)];
  return { scenes, imagePrompts };
}

/** The guardrails clause every fact-channel illustration prompt carries — AI visuals are honest
 *  illustrations, never fabricated footage of real people, brands, or places. */
export const ILLUSTRATION_GUARDRAILS =
  'Stylized editorial illustration. No text, no words, no captions, no logos, no watermarks. ' +
  'No recognizable real people or celebrities. No real brand products. Vertical 9:16 composition.';

/** Compose the full image-generation prompt: the beat's subject + the channel's visual system +
 *  the guardrails. The channel style is what makes one channel's look hard to clone but cheap to
 *  repeat — the anti-slop lever. */
export function illustrationPrompt(imagePrompt: string, channelStyle: string): string {
  const subject = imagePrompt.trim() || 'an abstract concept illustration for a fact video';
  const style = channelStyle.trim();
  return [subject, style, ILLUSTRATION_GUARDRAILS].filter(Boolean).join(' — ');
}

/** Stamp the channel's src tag — and the EPISODE's content tag — onto its destination link
 *  (src=gc_<channel8>&utm_content=ep_<episode8>). The operator's own sites resolve src through the
 *  existing site_events attribution chain; utm_content answers "WHICH video sold this" in any
 *  analytics tool (per-video attribution is the difference between guessing and knowing — click
 *  data alone under-credits short-form 2-5x, so the tag must ride every link).
 *  Not a URL → '' (never a broken link). */
export function ctaLink(url: string, channelId: string, episodeId?: string): string {
  const u = url.trim();
  if (!/^https?:\/\//.test(u)) return '';
  if (u.includes('src=')) return u;                       // already attributed — don't double-stamp
  const short = (id: string) => id.replace(/-/g, '').slice(0, 8);
  const tags = [`src=gc_${short(channelId)}`, ...(episodeId ? [`utm_content=ep_${short(episodeId)}`] : [])].join('&');
  return `${u}${u.includes('?') ? '&' : '?'}${tags}`;
}

/** The post caption: caption + CTA (+ the channel's attributed destination link) + hashtags. The
 *  AI disclosure is appended by the caller via withDisclosure (it knows the provenance); sources
 *  ride the episode record, not the caption. */
export function composeCaption(script: FactScript, link?: string): string {
  const tags = script.hashtags.map((h) => `#${h}`).join(' ');
  return [script.caption, [script.cta, link ?? ''].map((s) => s.trim()).filter(Boolean).join(' '), tags]
    .map((s) => s.trim()).filter(Boolean).join('\n\n');
}

/** Channel starter presets — data, not machinery. Each is a distinct brand posture, not a clone. */
export const CHANNEL_PRESETS: { id: string; label: string; niche: string; persona: string; visualStyle: string; mood: 'warm' | 'upbeat' | 'cinematic' | 'minimal' }[] = [
  {
    id: 'finance_facts', label: 'Finance facts', niche: 'personal finance and money facts',
    persona: 'Calm, precise, slightly wry narrator who makes money mechanics feel obvious. Never gives individual financial advice — explains how things work, with sources.',
    visualStyle: 'clean flat-design editorial illustration, deep navy and gold palette, one bold focal object per frame',
    mood: 'minimal',
  },
  {
    id: 'curiosity_facts', label: 'Interesting facts', niche: 'surprising science, history and world facts',
    persona: 'Wide-eyed but rigorous explainer — every "wait, really?" beat lands on a checkable source.',
    visualStyle: 'rich textured collage illustration, warm paper tones, museum-print feel',
    mood: 'cinematic',
  },
  {
    id: 'maker_channel', label: 'Maker / handmade', niche: 'handmade craft, studio process and product stories',
    persona: 'First-person maker voice: process, materials, the why behind each piece. Real footage first — AI only for diagrams.',
    visualStyle: 'soft natural-light studio photography feel, craft textures',
    mood: 'warm',
  },
];
