// src/lib/garvis/videoQa.ts
// THE VIDEO QA CORE — pure half of the candidate gate (verified by videoQa.verify.ts). The rubric
// is HARVESTED from traction-engine's auto-rate-video (vlm-v2.5: 5 dimensions, 17 defect types,
// severity caps, spectacle tolerance) — that repo paid the calibration cost; this core ports the
// math into the house pattern and adds the ONE arm it structurally lacked: IDENTITY AGAINST A
// CANONICAL REFERENCE. Traction's rater saw a single frame, so identity_drift could only mean
// "morphs within the clip"; here the vision call receives the character's approved face reference
// alongside the candidate frames and answers "is this Sarah" — the question persistent casting
// lives or dies on.
//
// Division of labor (the renderQa.ts calculus, adapted): the VLM observes (scores + defects, seen
// with its own eyes); THIS core decides (deduction math, caps, thresholds, accept/reject). A wrong
// REJECT costs a whole regeneration, so hard failure is reserved for signatures a usable clip
// cannot carry: broken identity, severe anatomy, or two severe defects. Deterministic: same
// observation, same verdict.

// ---- dimensions and defects (ported from traction's vlm-v2.5, verbatim taxonomy) ---------------

export type QaDimension = 'temporal' | 'motion' | 'fidelity' | 'adherence' | 'cinematic';

export type DefectType =
  | 'flicker' | 'morphing' | 'identity_drift' | 'physics_violation' | 'limb_anomaly'
  | 'text_corruption' | 'edge_bleeding' | 'uncanny_face' | 'unnatural_motion'
  | 'inconsistent_lighting' | 'over_smoothing' | 'blur_artifact' | 'texture_crawl'
  | 'missing_element' | 'wrong_subject' | 'floaty_motion' | 'jitter';

export type DefectSeverity = 'minor' | 'moderate' | 'severe';

export interface Defect { type: DefectType; severity: DefectSeverity; note?: string }

const DEFECT_TYPES = new Set<string>([
  'flicker', 'morphing', 'identity_drift', 'physics_violation', 'limb_anomaly',
  'text_corruption', 'edge_bleeding', 'uncanny_face', 'unnatural_motion',
  'inconsistent_lighting', 'over_smoothing', 'blur_artifact', 'texture_crawl',
  'missing_element', 'wrong_subject', 'floaty_motion', 'jitter',
]);

/** Defect → dimension deduction weights (traction's DEFECT_DIMENSION_MAP, ported verbatim). */
const DEFECT_MAP: Record<DefectType, Partial<Record<QaDimension, number>>> = {
  flicker: { temporal: 1.0 },
  identity_drift: { temporal: 1.0 },
  morphing: { temporal: 0.6, fidelity: 0.4 },
  physics_violation: { motion: 1.0 },
  floaty_motion: { motion: 1.0 },
  jitter: { motion: 1.0 },
  unnatural_motion: { motion: 0.8 },
  blur_artifact: { fidelity: 1.0 },
  texture_crawl: { fidelity: 1.0 },
  edge_bleeding: { fidelity: 0.8 },
  over_smoothing: { fidelity: 0.7 },
  uncanny_face: { fidelity: 0.6, motion: 0.4 },
  limb_anomaly: { fidelity: 0.6, motion: 0.4 },
  missing_element: { adherence: 1.0 },
  wrong_subject: { adherence: 1.0 },
  text_corruption: { fidelity: 0.5, adherence: 0.5 },
  inconsistent_lighting: { cinematic: 0.6, fidelity: 0.4 },
};

/** Genre content forgives motion physics that naturalistic drama cannot (traction's
 *  SPECTACLE_TOLERANT_DEFECTS) — the sci-fi lane's structural advantage, kept. */
const SPECTACLE_TOLERANT = new Set<DefectType>(['floaty_motion', 'unnatural_motion', 'physics_violation', 'flicker']);

const SEVERITY_DEDUCTION: Record<DefectSeverity, number> = { minor: 4, moderate: 10, severe: 22 };

// ---- what the VLM reports (the observation) ---------------------------------------------------

export interface QaObservation {
  dimensions: Record<QaDimension, number>;   // 0-100 each, the VLM's raw read
  defects: Defect[];
  /** THE NEW ARM: per-character identity match vs the canonical reference image, 0-100.
   *  null = no reference was supplied for that character (scored dimensions still apply). */
  identity: Record<string, number | null>;
  continuityOk: boolean | null;              // does this plausibly follow the previous shot? null = no previous
  actionOccurred: boolean;                   // did the requested action actually happen?
  notes: string[];
}

/** Parse + clamp an untrusted VLM JSON payload into a QaObservation. Unknown defect types are
 *  dropped (allowlist, traction's rule); scores clamp to 0-100; missing fields get safe defaults
 *  that FAIL toward review, never toward silent acceptance. */
export function parseObservation(raw: unknown): QaObservation {
  const o = (raw ?? {}) as Record<string, unknown>;
  const clamp = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
  };
  const dims = (o.dimensions ?? {}) as Record<string, unknown>;
  const dimensions: Record<QaDimension, number> = {
    temporal: clamp(dims.temporal, 50), motion: clamp(dims.motion, 50), fidelity: clamp(dims.fidelity, 50),
    adherence: clamp(dims.adherence, 50), cinematic: clamp(dims.cinematic, 50),
  };
  const defects: Defect[] = Array.isArray(o.defects)
    ? (o.defects as Array<Record<string, unknown>>)
        .filter((d) => typeof d?.type === 'string' && DEFECT_TYPES.has(d.type as string))
        .map((d) => ({
          type: d.type as DefectType,
          severity: (d.severity === 'severe' || d.severity === 'moderate' ? d.severity : 'minor') as DefectSeverity,
          note: typeof d.note === 'string' ? d.note : undefined,
        }))
    : [];
  const idRaw = (o.identity ?? {}) as Record<string, unknown>;
  const identity: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(idRaw)) identity[k] = v === null ? null : clamp(v, 0);
  return {
    dimensions, defects, identity,
    continuityOk: typeof o.continuityOk === 'boolean' ? o.continuityOk : null,
    actionOccurred: o.actionOccurred !== false,
    notes: Array.isArray(o.notes) ? (o.notes as unknown[]).filter((n): n is string => typeof n === 'string').slice(0, 10) : [],
  };
}

// ---- the verdict (the decision) ---------------------------------------------------------------

export interface QaVerdict {
  dimensions: Record<QaDimension, number>;   // after deductions and caps
  identityMin: number | null;                // the weakest character match — the number that gates
  overall: number;                           // 0-100 weighted
  defects: Defect[];
  decision: 'accept' | 'review' | 'reject';
  reasons: string[];
}

export const IDENTITY_ACCEPT = 80;   // below this, a recurring character is not that character
export const IDENTITY_REJECT = 60;   // below this, no human review can save the clip
export const OVERALL_ACCEPT = 78;
export const OVERALL_REJECT = 55;    // traction's hard-fail floor, kept

export interface JudgeOpts { spectacle?: boolean }

/** Deduction math + caps + thresholds. Ported rules are marked; the identity gate is new. */
export function judge(obs: QaObservation, opts: JudgeOpts = {}): QaVerdict {
  const reasons: string[] = [];
  const dims = { ...obs.dimensions };

  // Per-defect deductions (traction's applyDefectDeductions shape).
  for (const d of obs.defects) {
    const tolerated = opts.spectacle && SPECTACLE_TOLERANT.has(d.type);
    const deduction = SEVERITY_DEDUCTION[d.severity] * (tolerated ? 0.4 : 1);
    for (const [dim, w] of Object.entries(DEFECT_MAP[d.type])) {
      dims[dim as QaDimension] = Math.max(0, Math.round(dims[dim as QaDimension] - deduction * (w as number)));
    }
  }

  // Severity caps (ported): severe temporal defects cap temporal; severe subject misses cap adherence.
  const severe = obs.defects.filter((d) => d.severity === 'severe');
  const moderate = obs.defects.filter((d) => d.severity === 'moderate');
  if (severe.some((d) => d.type === 'identity_drift' || (d.type === 'flicker' && !opts.spectacle))) dims.temporal = Math.min(dims.temporal, 65);
  else if (moderate.some((d) => d.type === 'identity_drift' || (d.type === 'flicker' && !opts.spectacle))) dims.temporal = Math.min(dims.temporal, 75);
  if (severe.some((d) => d.type === 'missing_element' || d.type === 'wrong_subject')) dims.adherence = Math.min(dims.adherence, 50);
  const physicsCap = opts.spectacle ? 75 : 60;
  if (severe.some((d) => d.type === 'physics_violation' || d.type === 'floaty_motion')) dims.motion = Math.min(dims.motion, physicsCap);

  // Overall (traction's weights: adherence-led).
  let overall = Math.round(0.30 * dims.adherence + 0.20 * dims.temporal + 0.20 * dims.motion + 0.20 * dims.fidelity + 0.10 * dims.cinematic);

  // THE IDENTITY GATE — the new arm. The weakest visible character decides.
  const idScores = Object.values(obs.identity).filter((v): v is number => v !== null);
  const identityMin = idScores.length ? Math.min(...idScores) : null;

  if (!obs.actionOccurred) { overall = Math.min(overall, 60); reasons.push('the requested action did not occur'); }
  if (obs.continuityOk === false) { overall = Math.min(overall, 70); reasons.push('does not follow the previous shot'); }

  let decision: QaVerdict['decision'];
  if (identityMin !== null && identityMin < IDENTITY_REJECT) { decision = 'reject'; reasons.push(`identity ${identityMin} < ${IDENTITY_REJECT}: not the same person`); }
  else if (overall < OVERALL_REJECT) { decision = 'reject'; reasons.push(`overall ${overall} < ${OVERALL_REJECT}`); }
  else if (severe.length >= 2) { decision = 'reject'; reasons.push('two or more severe defects'); }
  else if (identityMin !== null && identityMin < IDENTITY_ACCEPT) { decision = 'review'; reasons.push(`identity ${identityMin} below accept floor ${IDENTITY_ACCEPT}`); }
  else if (overall < OVERALL_ACCEPT || severe.length === 1 || !obs.actionOccurred || obs.continuityOk === false) { decision = 'review'; if (!reasons.length) reasons.push(`overall ${overall} below accept floor ${OVERALL_ACCEPT}`); }
  else { decision = 'accept'; }

  return { dimensions: dims, identityMin, overall, defects: obs.defects, decision, reasons };
}

/** Pick the best candidate among judged ones: never a reject; accepts beat reviews; then overall,
 *  identity as tiebreak. Returns the index, or null when every candidate is a reject. */
export function pickBest(verdicts: QaVerdict[]): number | null {
  let best: number | null = null;
  const rank = (v: QaVerdict) => (v.decision === 'accept' ? 2 : v.decision === 'review' ? 1 : 0);
  verdicts.forEach((v, i) => {
    if (v.decision === 'reject') return;
    if (best === null) { best = i; return; }
    const b = verdicts[best];
    if (rank(v) > rank(b) || (rank(v) === rank(b) && (v.overall > b.overall || (v.overall === b.overall && (v.identityMin ?? 0) > (b.identityMin ?? 0))))) best = i;
  });
  return best;
}

// ---- the vision prompt ------------------------------------------------------------------------

export interface QaPromptSpec {
  action: string;
  dialogue?: string;
  characters: Array<{ id: string; name: string; hasReference: boolean }>;
  previousShot: boolean;
  spectacle: boolean;
}

/** The system prompt for the vision call. The images arrive in a fixed order the prompt declares:
 *  first each character's CANONICAL reference (named), then frames from the candidate clip. Strict
 *  calibration language ported from traction (scores above 90 need cited visual evidence). */
export function buildQaPrompt(spec: QaPromptSpec): string {
  const refList = spec.characters.filter((c) => c.hasReference).map((c) => c.name).join(', ');
  return [
    'You are a strict AI video quality analyst for a production pipeline. You will receive, in order:',
    refList ? `(1) one CANONICAL reference portrait per character — ${refList} — these define who each person IS;` : '(1) no character references for this shot;',
    '(2) frames sampled from a candidate clip.',
    'Score the candidate 0-100 on: temporal (consistency across frames), motion (physical plausibility), fidelity (visual quality), adherence (does it show the requested action), cinematic (composition/lighting).',
    'List defects ONLY from: flicker, morphing, identity_drift, physics_violation, limb_anomaly, text_corruption, edge_bleeding, uncanny_face, unnatural_motion, inconsistent_lighting, over_smoothing, blur_artifact, texture_crawl, missing_element, wrong_subject, floaty_motion, jitter — each with severity minor|moderate|severe.',
    refList ? 'For EACH named character, score identity 0-100: is the person in the clip THE SAME PERSON as their canonical reference (face structure, not clothing)? Be harsh — 80+ means a viewer following a series would not notice a recast.' : '',
    spec.previousShot ? 'continuityOk: does this clip plausibly continue from the previous shot described?' : '',
    spec.spectacle ? 'This is genre/spectacle content: exaggerated physics may be intended — mark motion defects only when they read as errors, not style.' : '',
    `Requested action: ${spec.action}${spec.dialogue ? ` Dialogue: "${spec.dialogue}"` : ''}`,
    'Scores of 90+ require a cited visual observation in notes. Respond with JSON only:',
    '{"dimensions":{"temporal":n,"motion":n,"fidelity":n,"adherence":n,"cinematic":n},"defects":[{"type":"...","severity":"..."}],"identity":{"<characterId>":n},"continuityOk":bool|null,"actionOccurred":bool,"notes":["..."]}',
  ].filter(Boolean).join('\n');
}
