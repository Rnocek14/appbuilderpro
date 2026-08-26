// src/lib/garvis/mediaCast.ts
// THE CAST CORE — pure half of persistent visual identity (verified by mediaCast.verify.ts).
// The one lesson of both repos' history, encoded: identity held in PROSE drifts (traction-engine's
// identity_lock_tokens); identity held in APPROVED REFERENCE IMAGES is the only lock a renderer
// respects. This core owns three deterministic jobs:
//
//   1. THE CAPABILITY REGISTRY — what each renderer accepts (reference slots, durations, native
//      audio) and costs. Routing metadata, not policy circumvention: a shot is only ever sent to a
//      provider whose published capabilities carry it.
//   2. THE REFERENCE RESOLVER — given a shot (who's in it, where, what continuity it inherits) and
//      the approved asset pool, pick the SMALLEST useful reference set inside the provider's slots.
//      Deterministic: same shot + same assets → same references, in priority order.
//   3. THE PROMPT COMPILER — one ShotSpec compiles to a Seedance request (@Image1 notation, refs as
//      url arrays) or a Veo request (prompt-embedded identity, no ref slots on the current builder).
//
// HONESTY: only approved==true assets are ever resolved — a candidate reference the operator hasn't
// blessed never reaches a renderer. Continuity is carried by Garvis, never assumed remembered by
// the model. Pure + deterministic — no Date, no random, no I/O.

// ---- provider capabilities --------------------------------------------------------------------

export type ClipProvider = 'seedance' | 'seedance-fast' | 'veo' | 'veo-fast';

export interface ProviderCaps {
  maxRefImages: number;
  maxRefVideos: number;
  maxRefAudio: number;
  maxTotalRefs: number;
  minSeconds: number;
  maxSeconds: number;
  nativeAudio: boolean;
  vertical: boolean;          // 9:16 output
  refNotation: boolean;       // supports @Image1/@Video1 prompt notation
  costPerSec720p: number;     // USD, verified against provider pricing Aug 2026
  costPerSecWithVideoRef: number | null;  // discounted rate when a reference video is supplied
}

/** Verified against fal (Seedance 2.0) and the Gemini API pricing page, Aug 2026. Numbers are
 *  routing estimates, not billing truth — spendCredits records the real cost after each call. */
export const PROVIDER_CAPS: Record<ClipProvider, ProviderCaps> = {
  seedance:        { maxRefImages: 9, maxRefVideos: 3, maxRefAudio: 3, maxTotalRefs: 12, minSeconds: 4, maxSeconds: 15, nativeAudio: true, vertical: true, refNotation: true,  costPerSec720p: 0.3024, costPerSecWithVideoRef: 0.1814 },
  'seedance-fast': { maxRefImages: 9, maxRefVideos: 3, maxRefAudio: 3, maxTotalRefs: 12, minSeconds: 4, maxSeconds: 15, nativeAudio: true, vertical: true, refNotation: true,  costPerSec720p: 0.2419, costPerSecWithVideoRef: 0.1452 },
  veo:             { maxRefImages: 3, maxRefVideos: 0, maxRefAudio: 0, maxTotalRefs: 3,  minSeconds: 8, maxSeconds: 8,  nativeAudio: true, vertical: true, refNotation: false, costPerSec720p: 0.40,   costPerSecWithVideoRef: null },
  'veo-fast':      { maxRefImages: 3, maxRefVideos: 0, maxRefAudio: 0, maxTotalRefs: 3,  minSeconds: 8, maxSeconds: 8,  nativeAudio: true, vertical: true, refNotation: false, costPerSec720p: 0.10,   costPerSecWithVideoRef: null },
};

export function isClipProvider(v: string): v is ClipProvider {
  return v === 'seedance' || v === 'seedance-fast' || v === 'veo' || v === 'veo-fast';
}

// ---- the cast shapes --------------------------------------------------------------------------

export type RefAssetKind =
  | 'face_front' | 'face_34' | 'face_profile' | 'full_body' | 'expression' | 'outfit'
  | 'loc_wide' | 'loc_detail' | 'loc_lighting' | 'voice_sample';

export interface RefAsset {
  id: string;
  subjectKind: 'character' | 'location';
  subjectId: string;
  kind: RefAssetKind;
  label: string;       // which outfit / which room / which expression
  fileUrl: string;
  approved: boolean;
}

/** Per-shot continuity state — what an accepted shot hands the next one. Carried by Garvis, never
 *  left to the model's memory. clipUrl doubles as the next shot's reference VIDEO (subsidized:
 *  Seedance's video-input rate is 40% cheaper). */
export interface ContinuityState {
  clipUrl?: string;                        // the previous ACCEPTED clip
  wardrobe?: Record<string, string>;       // characterId → outfit label worn
  positions?: Record<string, string>;      // characterId → where they ended ("left of counter")
  lighting?: string;                       // "warm sunset through west windows"
  heldObjects?: Record<string, string>;    // characterId → what's in hand ("glass, right hand")
  notes?: string;                          // anything else the next shot must honor
}

export interface ShotSpec {
  action: string;                          // what happens, in one or two sentences
  dialogue?: string;                       // spoken line(s), if any
  camera?: string;                         // "medium close-up, slow push-in"
  emotion?: string;
  durationS: number;
  characterIds: string[];                  // who is VISIBLE in this shot (resolver sends only these)
  locationId?: string;
  wardrobe?: Record<string, string>;       // characterId → outfit label for this shot
  lighting?: string;
  continuityIn?: ContinuityState;
}

// ---- the reference resolver -------------------------------------------------------------------

export interface ResolvedRef {
  slot: string;        // '@Image1' | '@Video1' | '@Audio1' — assigned in resolve order
  role: string;        // human-readable: 'JENNA face', 'previous shot', 'apartment wide'
  url: string;
  modality: 'image' | 'video' | 'audio';
}

export interface CastIndex {
  characters: Record<string, { name: string }>;
  locations: Record<string, { name: string }>;
}

/**
 * Pick the smallest useful reference set for a shot, inside the provider's slots.
 * Priority order (drop from the end when slots run out):
 *   per visible character: face_front, then full_body, then this shot's outfit reference;
 *   the location's wide reference (+ lighting reference when the shot names a lighting state);
 *   the previous accepted clip as a reference video (continuity — and the discounted rate);
 *   per speaking character: a voice sample (only when the provider takes audio refs).
 * Only approved assets are considered. Deterministic: assets are consumed in the caller's order.
 */
export function resolveReferences(shot: ShotSpec, assets: RefAsset[], cast: CastIndex, provider: ClipProvider): ResolvedRef[] {
  const caps = PROVIDER_CAPS[provider];
  const pool = assets.filter((a) => a.approved);
  const byKind = (subjectId: string, kind: RefAssetKind, label?: string) =>
    pool.find((a) => a.subjectId === subjectId && a.kind === kind && (label === undefined || a.label === label));

  const images: Omit<ResolvedRef, 'slot'>[] = [];
  const videos: Omit<ResolvedRef, 'slot'>[] = [];
  const audio: Omit<ResolvedRef, 'slot'>[] = [];

  for (const cid of shot.characterIds) {
    const name = cast.characters[cid]?.name ?? 'character';
    const face = byKind(cid, 'face_front');
    if (face) images.push({ role: `${name} face`, url: face.fileUrl, modality: 'image' });
    const body = byKind(cid, 'full_body');
    if (body) images.push({ role: `${name} full body`, url: body.fileUrl, modality: 'image' });
    const outfitLabel = shot.wardrobe?.[cid] ?? shot.continuityIn?.wardrobe?.[cid];
    if (outfitLabel) {
      const outfit = byKind(cid, 'outfit', outfitLabel);
      if (outfit) images.push({ role: `${name} outfit: ${outfitLabel}`, url: outfit.fileUrl, modality: 'image' });
    }
  }
  if (shot.locationId) {
    const name = cast.locations[shot.locationId]?.name ?? 'location';
    const wide = byKind(shot.locationId, 'loc_wide');
    if (wide) images.push({ role: `${name} wide`, url: wide.fileUrl, modality: 'image' });
    if (shot.lighting) {
      const light = byKind(shot.locationId, 'loc_lighting', shot.lighting);
      if (light) images.push({ role: `${name} lighting: ${shot.lighting}`, url: light.fileUrl, modality: 'image' });
    }
  }
  if (shot.continuityIn?.clipUrl && caps.maxRefVideos > 0) {
    videos.push({ role: 'previous shot', url: shot.continuityIn.clipUrl, modality: 'video' });
  }
  if (shot.dialogue && caps.maxRefAudio > 0) {
    for (const cid of shot.characterIds) {
      const voice = byKind(cid, 'voice_sample');
      if (voice) audio.push({ role: `${cast.characters[cid]?.name ?? 'character'} voice`, url: voice.fileUrl, modality: 'audio' });
    }
  }

  // Enforce per-modality slots, then the total cap — images are trimmed last (identity outranks
  // ambience, and images were pushed in identity-first order).
  const img = images.slice(0, caps.maxRefImages);
  const vid = videos.slice(0, caps.maxRefVideos);
  const aud = audio.slice(0, caps.maxRefAudio);
  let overflow = img.length + vid.length + aud.length - caps.maxTotalRefs;
  while (overflow > 0 && aud.length) { aud.pop(); overflow--; }
  while (overflow > 0 && img.length > shot.characterIds.length) { img.pop(); overflow--; }  // keep ≥1 image per character
  while (overflow > 0 && img.length) { img.pop(); overflow--; }

  const out: ResolvedRef[] = [];
  img.forEach((r, i) => out.push({ ...r, slot: `@Image${i + 1}` }));
  vid.forEach((r, i) => out.push({ ...r, slot: `@Video${i + 1}` }));
  aud.forEach((r, i) => out.push({ ...r, slot: `@Audio${i + 1}` }));
  return out;
}

// ---- the prompt compiler ----------------------------------------------------------------------

/** The continuity clause — the state the shot must honor, written for the renderer. */
export function continuityClause(shot: ShotSpec, cast: CastIndex): string {
  const c = shot.continuityIn;
  if (!c) return '';
  const parts: string[] = [];
  for (const [cid, outfit] of Object.entries(c.wardrobe ?? {})) {
    if (shot.characterIds.includes(cid)) parts.push(`${cast.characters[cid]?.name ?? 'character'} wears ${outfit} (unchanged)`);
  }
  for (const [cid, pos] of Object.entries(c.positions ?? {})) {
    if (shot.characterIds.includes(cid)) parts.push(`${cast.characters[cid]?.name ?? 'character'} starts ${pos}`);
  }
  for (const [cid, held] of Object.entries(c.heldObjects ?? {})) {
    if (shot.characterIds.includes(cid)) parts.push(`${cast.characters[cid]?.name ?? 'character'} still holds ${held}`);
  }
  if (c.lighting) parts.push(`lighting continues: ${c.lighting}`);
  if (c.notes) parts.push(c.notes);
  return parts.length ? `Continuity (must hold): ${parts.join('; ')}.` : '';
}

/** Compile a shot + resolved references into the renderer's prompt text. With refNotation the
 *  identity lines cite slots ("@Image1 = Jenna's face — match exactly"); without it (Veo), the
 *  reference roles are woven into prose. */
export function compileShotPrompt(shot: ShotSpec, refs: ResolvedRef[], caps: ProviderCaps): string {
  const lines: string[] = [];
  if (caps.refNotation && refs.length) {
    lines.push(refs.map((r) => `${r.slot} = ${r.role}`).join('. ') + '. Match every referenced identity exactly.');
  } else if (refs.length) {
    lines.push(`Reference identities (match exactly): ${refs.map((r) => r.role).join(', ')}.`);
  }
  lines.push(shot.action);
  if (shot.dialogue) lines.push(`Dialogue: "${shot.dialogue}"`);
  if (shot.emotion) lines.push(`Emotion: ${shot.emotion}.`);
  if (shot.camera) lines.push(`Camera: ${shot.camera}.`);
  if (shot.lighting) lines.push(`Lighting: ${shot.lighting}.`);
  return lines.filter(Boolean).join(' ');
}

/** The full compile: prompt text with the continuity clause included. */
export function compileShot(shot: ShotSpec, refs: ResolvedRef[], cast: CastIndex, provider: ClipProvider): string {
  const caps = PROVIDER_CAPS[provider];
  const base = compileShotPrompt(shot, refs, caps);
  const cont = continuityClause(shot, cast);
  return cont ? `${base} ${cont}` : base;
}

/** The Seedance request body (fal reference-to-video schema, verified Aug 2026). Duration is
 *  clamped to the provider's band; audio always on (included in the rate). */
export function buildSeedanceRequest(shot: ShotSpec, refs: ResolvedRef[], cast: CastIndex, provider: ClipProvider): Record<string, unknown> {
  const caps = PROVIDER_CAPS[provider];
  const duration = Math.min(caps.maxSeconds, Math.max(caps.minSeconds, Math.round(shot.durationS)));
  const body: Record<string, unknown> = {
    prompt: compileShot(shot, refs, cast, provider),
    aspect_ratio: '9:16',
    resolution: '720p',
    duration: String(duration),
    generate_audio: true,
  };
  const img = refs.filter((r) => r.modality === 'image').map((r) => r.url);
  const vid = refs.filter((r) => r.modality === 'video').map((r) => r.url);
  const aud = refs.filter((r) => r.modality === 'audio').map((r) => r.url);
  if (img.length) body.image_urls = img;
  if (vid.length) body.video_urls = vid;
  if (aud.length) body.audio_urls = aud;
  return body;
}

/** Estimated cost of one candidate at 720p — the router's number, not the bill. */
export function estimateClipCostUsd(shot: ShotSpec, refs: ResolvedRef[], provider: ClipProvider): number {
  const caps = PROVIDER_CAPS[provider];
  const duration = Math.min(caps.maxSeconds, Math.max(caps.minSeconds, Math.round(shot.durationS)));
  const hasVideoRef = refs.some((r) => r.modality === 'video');
  const rate = hasVideoRef && caps.costPerSecWithVideoRef !== null ? caps.costPerSecWithVideoRef : caps.costPerSec720p;
  return Math.round(rate * duration * 10000) / 10000;
}

// ---- the router -------------------------------------------------------------------------------

/** Which renderer gets this shot. Deliberately simple v1 (the model-eval lab refines it later):
 *  dialogue or any visible character → Seedance (reference slots + native lipsync carry identity);
 *  no people at all (establishing/object shots) → the cheap Veo tier. `hero` forces the premium
 *  Seedance tier for the one spectacle shot an episode gets. */
export function routeShot(shot: ShotSpec, opts: { hero?: boolean } = {}): ClipProvider {
  if (opts.hero) return 'seedance';
  if (shot.characterIds.length > 0 || shot.dialogue) return 'seedance-fast';
  return 'veo-fast';
}
