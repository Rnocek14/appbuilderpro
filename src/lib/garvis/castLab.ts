// src/lib/garvis/castLab.ts
// THE CAST LAB — pure half of the Cast lane (verified by castLab.verify.ts). Three deterministic
// jobs: (1) the reference-sheet prompts that turn a character/location description into its
// canonical images — the STYLE BLOCK is repeated VERBATIM across a subject's whole sheet (the one
// set-consistency lever a seedless image model has; the imagegen research rule); (2) the SIX-SHOT
// CONTINUITY TEST — Test A of the media-studio review: two people, one room, six cuts, ~30s. The
// scene is a fixed script so every run of the test measures the PIPELINE, not the prompt-writing;
// (3) honest readiness — what's missing before the test can run, named, never a dead button.

import { PROVIDER_CAPS } from './mediaCast';

// ---- reference sheets -------------------------------------------------------------------------

/** The verbatim style block for CHARACTER reference sheets. Photoreal and deliberately plain —
 *  references exist to pin identity, not to be beautiful. */
export const CHARACTER_STYLE_BLOCK =
  'Photorealistic studio reference photograph, neutral mid-grey seamless background, soft even '
  + 'frontal lighting, no shadows on the background, natural skin texture, sharp focus, '
  + 'no retouching, no filters. Literal colors. No text, no watermarks, no logos.';

/** The verbatim style block for LOCATION reference sheets. */
export const LOCATION_STYLE_BLOCK =
  'Photorealistic interior/exterior reference photograph, natural lighting, level camera, '
  + 'sharp focus throughout, documentary plainness — no staging, no people, no text, no '
  + 'watermarks, no logos. Literal colors.';

export interface RefPromptSpec { kind: 'face_front' | 'face_34' | 'full_body' | 'loc_wide' | 'loc_detail'; prompt: string }

/** A character's canonical sheet: the SAME person described the SAME way in every prompt, with the
 *  style block verbatim — only the framing line changes. */
export function characterRefPrompts(description: string, outfit?: string): RefPromptSpec[] {
  const subject = `The same single person in every image: ${description.trim()}${outfit ? ` Wearing: ${outfit.trim()}.` : ''}`;
  const frame = (f: string) => `${subject} ${f} ${CHARACTER_STYLE_BLOCK}`;
  return [
    { kind: 'face_front', prompt: frame('Head-and-shoulders portrait, facing the camera directly, neutral expression, eyes to lens.') },
    { kind: 'face_34',    prompt: frame('Head-and-shoulders portrait, face turned three-quarters to the left, neutral expression.') },
    { kind: 'full_body',  prompt: frame('Full body head to toe, standing relaxed, arms at sides, facing the camera.') },
  ];
}

/** A location's canonical sheet. */
export function locationRefPrompts(description: string): RefPromptSpec[] {
  const subject = `The same single real place in every image: ${description.trim()}`;
  return [
    { kind: 'loc_wide',   prompt: `${subject} Wide establishing view showing the room's full layout. ${LOCATION_STYLE_BLOCK}` },
    { kind: 'loc_detail', prompt: `${subject} Closer view of the room's most distinctive corner and furnishings. ${LOCATION_STYLE_BLOCK}` },
  ];
}

// ---- the six-shot continuity test -------------------------------------------------------------

export interface TestShot {
  sceneIndex: number;
  action: string;       // → reel_clips.prompt
  dialogue: string;     // → reel_clips.vo ('' = none)
  characterIds: string[];
  durationS: number;
}

/** Test A, fixed: two people, one room, six cuts. A enters; B reacts; they speak; they close the
 *  distance; the two-shot proves both hold at once. Same script every run — the test measures the
 *  pipeline, never the prompt-writing. */
export function sixShotScene(a: { id: string; name: string }, b: { id: string; name: string }): TestShot[] {
  return [
    { sceneIndex: 0, action: `${a.name} opens the door and walks into the room, pausing just inside.`, dialogue: '', characterIds: [a.id], durationS: 5 },
    { sceneIndex: 1, action: `${b.name}, seated, looks up from a phone toward the door, surprised.`, dialogue: '', characterIds: [b.id], durationS: 4 },
    { sceneIndex: 2, action: `${a.name} stands near the door and speaks, guarded but calm.`, dialogue: "I didn't think you'd actually be here.", characterIds: [a.id], durationS: 5 },
    { sceneIndex: 3, action: `${b.name} sets the phone down and answers without standing.`, dialogue: 'Where else would I be?', characterIds: [b.id], durationS: 5 },
    { sceneIndex: 4, action: `${a.name} crosses the room toward ${b.name}, slowing on the last step.`, dialogue: '', characterIds: [a.id], durationS: 5 },
    { sceneIndex: 5, action: `Two-shot: ${a.name} standing beside ${b.name}, both facing each other in profile, a beat of silence.`, dialogue: '', characterIds: [a.id, b.id], durationS: 5 },
  ];
}

/** What the whole test costs at one candidate per shot: shot 1 at the full fast rate, shots 2-6 on
 *  the chained video-reference discount. The number the button shows before spending. */
export function testCostEstimateUsd(): number {
  const caps = PROVIDER_CAPS['seedance-fast'];
  const shots = sixShotScene({ id: 'a', name: 'A' }, { id: 'b', name: 'B' });
  let usd = 0;
  shots.forEach((s, i) => {
    const rate = i === 0 || caps.costPerSecWithVideoRef === null ? caps.costPerSec720p : caps.costPerSecWithVideoRef;
    usd += rate * s.durationS;
  });
  return Math.round(usd * 100) / 100;
}

// ---- the likeness gate ------------------------------------------------------------------------

export interface LikenessState { name: string; likeness: 'synthetic' | 'real'; consentedAt: string | null }

/** A real person's face never reaches a renderer without recorded consent. Same shape as every
 *  honest gate in the platform: fail-closed, and the refusal NAMES what's missing. Synthetic
 *  characters pass unconditionally. */
export function likenessGate(chars: LikenessState[]): { ok: boolean; reason: string | null } {
  const blocked = chars.filter((c) => c.likeness === 'real' && !c.consentedAt);
  if (!blocked.length) return { ok: true, reason: null };
  const names = blocked.map((c) => c.name || 'a character').join(', ');
  return { ok: false, reason: `${names} ${blocked.length === 1 ? 'is' : 'are'} a real person without recorded consent — record their consent on the character before generating.` };
}

// ---- scene assembly ---------------------------------------------------------------------------

/** Accepted clips → the edit builder's take list. Explicit lengths matter: known cut times are
 *  what unlock precise sound cues and the punch alternation that makes six generations read as one
 *  produced scene instead of six clips — the exact gap viewers feel in shipping AI drama. The
 *  research finding, encoded: the cut grammar, not the renderer, is where AI content wins or loses. */
export function sceneTakes(clips: Array<{ url: string; durationS: number }>): Array<{ url: string; lengthS: number }> {
  return clips
    .filter((c) => !!c.url)
    .map((c) => ({ url: c.url, lengthS: Math.max(1, Math.min(15, Math.round(c.durationS * 10) / 10)) }));
}

// ---- honest readiness -------------------------------------------------------------------------

export interface CastSubjectState {
  id: string;
  name: string;
  approvedKinds: string[];   // approved media_ref_assets kinds for this subject
}

export interface TestReadiness { ready: boolean; missing: string[] }

const CHARACTER_NEEDS = ['face_front', 'full_body'];

/** The test can run when two characters each carry an approved face_front + full_body and one
 *  location carries an approved loc_wide. Anything short → the exact gaps, named. */
export function testReadiness(characters: CastSubjectState[], locations: CastSubjectState[]): TestReadiness {
  const missing: string[] = [];
  const readyChars = characters.filter((c) => CHARACTER_NEEDS.every((k) => c.approvedKinds.includes(k)));
  if (readyChars.length < 2) {
    if (characters.length < 2) missing.push(`${2 - characters.length} more character${characters.length === 1 ? '' : 's'}`);
    for (const c of characters.slice(0, 2)) {
      const gaps = CHARACTER_NEEDS.filter((k) => !c.approvedKinds.includes(k));
      if (gaps.length) missing.push(`approved ${gaps.join(' + ')} for ${c.name}`);
    }
  }
  const readyLoc = locations.some((l) => l.approvedKinds.includes('loc_wide'));
  if (!readyLoc) missing.push(locations.length ? `an approved wide reference for ${locations[0].name}` : 'a location');
  return { ready: readyChars.length >= 2 && readyLoc, missing };
}
