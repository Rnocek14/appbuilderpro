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
// Stills-based pacing: viewers read a Ken-Burns still as "static" past ~4s; word-timed captions
// and alternating motion buy up to ~6s. 4-6s beats keep something visibly changing every few
// seconds while 13 beats + the 3s hook still reach the 60-90s monetizable band.
const SCENE_MIN_S = 4;
const SCENE_MAX_S = 6;
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
        seconds: Number.isFinite(seconds) ? Math.min(SCENE_MAX_S, Math.max(SCENE_MIN_S, Math.round(seconds))) : 5,   // default mid-band
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

/** The format + rules block every fact-channel illustration prompt carries. gpt-image-1 is an
 *  instruction-follower (no negative-prompt param, no seed) — constraints go in prose, and the
 *  composition is SAID, not implied: one bold focal subject in the upper two-thirds, a quiet
 *  bottom third where the burned captions live, margins clear of platform UI. The honesty rules
 *  ride along: AI visuals are illustrations, never fabricated footage of real people or brands. */
export const ILLUSTRATION_GUARDRAILS =
  'FORMAT: vertical portrait composition for a 9:16 phone video. One single bold focal subject, ' +
  'centered in the upper two-thirds of the frame, large and readable on a small phone screen. ' +
  'Keep the bottom third of the frame visually quiet (plain background) — captions are overlaid ' +
  'there. Generous margins; nothing important near the edges. ' +
  'RULES: No text, no words, no letters, no numbers, no captions, no logos, no watermarks, no ' +
  'borders. No recognizable real people or celebrities. No real brand products.';

/** Compose the full image-generation prompt: subject first, then the channel's STYLE BLOCK
 *  (repeated VERBATIM across every image of a video — the one reliable set-consistency lever a
 *  seedless instruction-following image model has), then the format/rules. The channel style is
 *  what makes one channel's look hard to clone but cheap to repeat — the anti-slop lever. */
export function illustrationPrompt(imagePrompt: string, channelStyle: string): string {
  const subject = imagePrompt.trim() || 'an abstract concept illustration for a fact video';
  const style = channelStyle.trim();
  return [
    `SUBJECT: ${subject}.`,
    style ? `STYLE (apply exactly — every image in this series uses this same style, verbatim): ${style}.` : '',
    ILLUSTRATION_GUARDRAILS,
  ].filter(Boolean).join('\n');
}

/** Stamp the channel's src tag — and the EPISODE's content tag — onto its destination link
 *  (src=gc_<channel8>&utm_content=ep_<episode8>). The operator's own sites resolve src through the
 *  existing site_events attribution chain; utm_content answers "WHICH video sold this" in any
 *  analytics tool (per-video attribution is the difference between guessing and knowing — click
 *  data alone under-credits short-form 2-5x, so the tag must ride every link).
 *  Not a URL → '' (never a broken link). */
export function ctaLink(url: string, channelId: string, episodeId?: string): string {
  const raw = url.trim();
  if (!/^https?:\/\//.test(raw)) return '';
  // Real URL surgery, not string appends: a naive `url + '?src='` lands the tag inside a #fragment
  // (never sent to the server — attribution silently dead) and `includes('src=')` false-positives
  // on params like `imgsrc` (review finding #4).
  try {
    const u = new URL(raw);
    if (u.searchParams.has('src')) return raw;            // already attributed — don't double-stamp
    const short = (id: string) => id.replace(/-/g, '').slice(0, 8);
    u.searchParams.set('src', `gc_${short(channelId)}`);
    if (episodeId) u.searchParams.set('utm_content', `ep_${short(episodeId)}`);
    return u.toString();
  } catch {
    return '';                                            // unparsable → no link, never a broken one
  }
}

/** The post caption: caption + CTA (+ the channel's attributed destination link) + hashtags. The
 *  AI disclosure is appended by the caller via withDisclosure (it knows the provenance); sources
 *  ride the episode record, not the caption. */
export function composeCaption(script: FactScript, link?: string): string {
  const tags = script.hashtags.map((h) => `#${h}`).join(' ');
  return [script.caption, [script.cta, link ?? ''].map((s) => s.trim()).filter(Boolean).join(' '), tags]
    .map((s) => s.trim()).filter(Boolean).join('\n\n');
}

/** The TTS delivery direction for a channel's narrator — the labeled-axis instruction block
 *  gpt-4o-mini-tts steers on (its `speed` param is ignored; pacing is steered HERE). Built from
 *  the openai.fm preset grammar: energetic documentary delivery, numbers landed deliberately,
 *  zero lead-in silence — the first two seconds decide distribution. Deterministic. */
export function deliveryInstructions(persona: string): string {
  const p = persona.trim();
  return [
    'Voice Affect: Confident, sharp, documentary-style narrator with high energy.',
    'Tone: Intrigued and direct, like sharing a secret that pays off.',
    'Pacing: Brisk — noticeably faster than conversational, but every word crisp. Slow down slightly to land each number or statistic.',
    'Emphasis: Punch key numbers and contrast words ("but", "except", "until").',
    'Pauses: A short beat after the opening line and before the final payoff line. No long silences.',
    'Delivery: Start speaking immediately — no lead-in, no throat-clearing. Rising energy toward the final line.',
    ...(p ? [`Personality: ${p}`] : []),
  ].join('\n');
}

/** Channel starter presets — data, not machinery. Each is a distinct brand posture, not a clone.
 *  Voices are picked from the current craft consensus: onyx/echo = deep authoritative narrator,
 *  marin/cedar = OpenAI's own best-quality recommendation, coral = clear polished female. */
export const CHANNEL_PRESETS: { id: string; label: string; niche: string; persona: string; visualStyle: string; mood: 'warm' | 'upbeat' | 'cinematic' | 'minimal'; voice: string }[] = [
  {
    id: 'finance_facts', label: 'Finance facts', niche: 'personal finance and money facts',
    persona: 'Calm, precise, slightly wry narrator who makes money mechanics feel obvious. Never gives individual financial advice — explains how things work, with sources.',
    // Full style block, repeated verbatim per image: named colors (models don't parse hex),
    // drift suppressors (no gradients, flat), max contrast under burned white captions.
    visualStyle: 'modern flat editorial illustration, bold simplified geometric shapes, subtle paper-grain texture, soft shadows, no outlines; palette: near-black charcoal background with deep navy, warm gold and off-white accents only — literal colors, no gradients; dramatic single-source rim lighting; clean vector-like finish',
    mood: 'minimal',
    voice: 'onyx',
  },
  {
    id: 'curiosity_facts', label: 'Interesting facts', niche: 'surprising science, history and world facts',
    persona: 'Wide-eyed but rigorous explainer — every "wait, really?" beat lands on a checkable source.',
    visualStyle: 'rich textured collage illustration, museum-print feel, torn-paper edges and archival engraving textures; palette: warm cream paper background with deep teal, burnt orange and charcoal accents only — literal colors, no gradients; soft directional light',
    mood: 'cinematic',
    voice: 'marin',
  },
  {
    id: 'maker_channel', label: 'Maker / handmade', niche: 'handmade craft, studio process and product stories',
    persona: 'First-person maker voice: process, materials, the why behind each piece. Real footage first — AI only for diagrams.',
    visualStyle: 'soft natural-light studio photography feel, shallow depth of field, craft textures — linen, raw wood, unglazed clay; palette: warm neutrals with one muted sage accent — literal colors, no gradients',
    mood: 'warm',
    voice: 'coral',
  },
];
