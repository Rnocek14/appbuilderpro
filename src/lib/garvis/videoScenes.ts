// src/lib/garvis/videoScenes.ts
// PURE core of the Veo VIDEO-SCENE library (no network; verified by videoScenes.verify.ts).
//
// The "genuinely cool" upgrade: instead of the hand-built SVG trade scenes, a curated library of
// PHOTOREAL clips (water rushing down a copper pipe → the joint bursts → a clamp seals it), each
// generated ONCE with Google Veo 3.1 and reused across every demo in that trade — the only way this
// is affordable at scale. This module holds the deterministic half: the cinematic prompt per trade,
// the Veo request body, and the parsers for Veo's long-running-operation responses. The edge fn
// (generate-video) does the metered API call + polling + storage around these.
//
// Zero runtime imports — a leaf the Deno edge function imports directly (.ts extension there).

/** Trades we ship a signature scene for — aligned with the renderer's SceneKind set. */
export const VIDEO_SCENE_KINDS = ['pipe', 'circuit', 'rain', 'hvac', 'auto', 'generic'] as const;
export type VideoSceneKind = (typeof VIDEO_SCENE_KINDS)[number];

interface ScenePrompt { label: string; prompt: string; negative: string }

/** Cinematic, physically-grounded prompts tuned for Veo's fluid/particle strength. Dark studio
 *  backdrops + shallow depth of field so the clip drops cleanly onto any site behind copy. */
export const SCENE_PROMPTS: Record<VideoSceneKind, ScenePrompt> = {
  pipe: {
    label: 'Plumbing — pipe fills & bursts',
    prompt: 'Extreme macro, cinematic slow-motion: clear water rushes through a polished copper pipe, then a threaded joint gives way and bursts, water exploding outward in a fine high-speed spray with individual droplets catching the light, then the flow calms. Dark seamless studio background, dramatic rim lighting, shallow depth of field, photoreal, 4k, no text.',
    negative: 'cartoon, illustration, low quality, text, watermark, distorted anatomy, people',
  },
  circuit: {
    label: 'Electrical — current lights up',
    prompt: 'Extreme macro, cinematic: a bright pulse of electric current races along a copper wire throwing tiny sparks, reaching a filament bulb that ignites to a warm glow. Dark studio background, dramatic lighting, shallow depth of field, photoreal, 4k, no text.',
    negative: 'cartoon, illustration, low quality, text, watermark, people',
  },
  rain: {
    label: 'Roofing — storm on shingles',
    prompt: 'Cinematic slow-motion macro: heavy rain hammers a row of dark asphalt roof shingles, water sheeting and beading off the edge in a clean sheet, dramatic overcast storm light, photoreal, 4k, shallow depth of field, no text.',
    negative: 'cartoon, illustration, low quality, text, watermark, people',
  },
  hvac: {
    label: 'HVAC — heat to cool',
    prompt: 'Cinematic macro: shimmering heat haze over a metal vent resolves into a crisp stream of cool air, a light frost blooming across the fins. Dark studio background, dramatic lighting, photoreal, 4k, shallow depth of field, no text.',
    negative: 'cartoon, illustration, low quality, text, watermark, people',
  },
  auto: {
    label: 'Auto — gauge sweeps green',
    prompt: 'Cinematic macro of a car engine and a dashboard gauge: the needle sweeps out of the red into the green, warning light fades, engine bay gleaming. Dramatic garage lighting, photoreal, 4k, shallow depth of field, no text.',
    negative: 'cartoon, illustration, low quality, text, watermark, people',
  },
  generic: {
    label: 'Generic — liquid brand swirl',
    prompt: 'Cinematic slow-motion macro: a smooth swirl of glossy liquid in a brand-neutral tone folds and ripples with elegant highlights on a dark seamless background, shallow depth of field, photoreal, 4k, no text.',
    negative: 'cartoon, illustration, low quality, text, watermark, people',
  },
};

export function isVideoSceneKind(k: string): k is VideoSceneKind {
  return (VIDEO_SCENE_KINDS as readonly string[]).includes(k);
}

/** The Gemini/Veo model ids (env-overridable in the edge fn; these are the July-2026 preview ids). */
export const VEO_MODEL_STANDARD = 'veo-3.1-generate-preview';
export const VEO_MODEL_FAST = 'veo-3.1-fast-generate-preview';

export interface VeoOpts { aspectRatio?: '16:9' | '9:16'; negativePrompt?: string; durationSeconds?: number }

/** The predictLongRunning request body for Veo. Parameters are omitted when unset so we never send
 *  a field the preview endpoint rejects. */
export function buildVeoRequest(prompt: string, opts: VeoOpts = {}): { instances: { prompt: string }[]; parameters: Record<string, unknown> } {
  const parameters: Record<string, unknown> = { aspectRatio: opts.aspectRatio ?? '16:9' };
  if (opts.negativePrompt) parameters.negativePrompt = opts.negativePrompt;
  if (opts.durationSeconds) parameters.durationSeconds = opts.durationSeconds;
  return { instances: [{ prompt }], parameters };
}

/** The operation name from the start (predictLongRunning) response — the handle we poll on. */
export function veoOperationName(json: unknown): string | null {
  const name = (json as { name?: unknown })?.name;
  return typeof name === 'string' && name ? name : null;
}

export interface VeoResult { done: boolean; videoUri: string | null; error: string | null }

/** Read a polled operation: not-done → keep waiting; done+error → surface it; done+ok → the video
 *  file URI (which the edge fn downloads with the API key appended). */
export function veoResult(json: unknown): VeoResult {
  const o = (json ?? {}) as Record<string, unknown>;
  if (!o.done) return { done: false, videoUri: null, error: null };
  const err = o.error as { message?: string; code?: number } | undefined;
  if (err) return { done: true, videoUri: null, error: err.message ?? `Veo error ${err.code ?? ''}`.trim() };
  const uri = (((o.response as Record<string, unknown>)?.generateVideoResponse as Record<string, unknown>)?.generatedSamples as Array<{ video?: { uri?: string } }> | undefined)?.[0]?.video?.uri;
  return { done: true, videoUri: typeof uri === 'string' && uri ? uri : null, error: uri ? null : 'Veo finished but returned no video.' };
}

export type SceneStatus = 'generating' | 'ready' | 'approved' | 'failed';

/** The row update after a poll — pure so the transitions are testable. */
export function sceneUpdateAfterPoll(r: VeoResult): { status: SceneStatus; done: boolean } {
  if (!r.done) return { status: 'generating', done: false };
  if (r.error || !r.videoUri) return { status: 'failed', done: true };
  return { status: 'ready', done: true };
}
