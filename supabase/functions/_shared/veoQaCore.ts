// PURE core of the Veo candidate gate (veoQa.verify.ts) — the machine screen between "Veo
// generated something" and "the operator sees it in SceneStudio". Veo is unreliable per
// generation (wrong subject, mangled text, faces, cuts); the library model makes retries cheap,
// and this gate makes them automatic: generate-video sends each candidate clip to Gemini (same
// GEMINI_API_KEY, video input is native) with VEO_JUDGE_SYSTEM, parses the verdict here, and only
// gate-passing candidates reach the human approve step. Nothing here calls a network — the edge
// function owns the calls; this owns the prompt contract, parsing, and the pass/fail rule.

/** Constraints appended to every trade prompt — each line targets a known Veo failure mode. */
export const VEO_PROMPT_RULES = `
Single continuous shot, locked-off or very slow dolly camera. No cuts, no transitions.
One clear subject filling the frame. No people, no faces, no hands.
Absolutely no on-screen text, captions, logos, or signage of any kind.
Photorealistic, natural lighting. The final frame should compose cleanly as a still.
The motion should read as a steady progression from start to finish (fill, rise, build, settle).`;

/** Harden a trade subject into the full Veo prompt. */
export function hardenVeoPrompt(subject: string): string {
  return `${subject.trim().replace(/\.*$/, '.')}\n${VEO_PROMPT_RULES.trim()}`;
}

export const VEO_JUDGE_SYSTEM = `You are the quality gate for AI-generated background film clips on
small-business websites. You are shown ONE clip and the prompt that requested it. Judge strictly —
a wrong or glitchy clip on a real business's pitch page costs a sale. Output ONLY JSON:
{"subject_match": bool,          // is the clip actually showing the requested subject?
 "no_text_artifacts": bool,      // zero readable or garbled text/logos/signage anywhere
 "no_faces": bool,               // no people, faces, or hands
 "single_continuous_shot": bool, // no cuts, no transitions, stable camera
 "loopable": bool,               // last frame could cut back to the first without a jarring seam
 "reads_as_progression": bool,   // stepping through frames reads as a steady narrative motion
 "overall": int(0-10),           // would a design director ship this under a headline?
 "reason": str}                  // one sentence, the deciding factor`;

export interface VeoVerdict {
  subject_match: boolean; no_text_artifacts: boolean; no_faces: boolean;
  single_continuous_shot: boolean; loopable: boolean; reads_as_progression: boolean;
  overall: number; reason: string;
}

/** Tolerant parse of the judge's reply. Anything unparseable fails safe (all false, overall 0) —
 *  a candidate the judge couldn't score must never slip past the gate. */
export function parseVeoVerdict(modelText: string): VeoVerdict {
  const fail: VeoVerdict = {
    subject_match: false, no_text_artifacts: false, no_faces: false,
    single_continuous_shot: false, loopable: false, reads_as_progression: false,
    overall: 0, reason: 'unparseable judge reply',
  };
  try {
    const clean = (modelText ?? '').replace(/```json|```/g, '');
    const a = clean.indexOf('{'); const b = clean.lastIndexOf('}');
    if (a === -1 || b <= a) return fail;
    const p = JSON.parse(clean.slice(a, b + 1)) as Record<string, unknown>;
    const bool = (v: unknown) => v === true;
    const overall = typeof p.overall === 'number' && isFinite(p.overall)
      ? Math.max(0, Math.min(10, Math.round(p.overall))) : 0;
    return {
      subject_match: bool(p.subject_match), no_text_artifacts: bool(p.no_text_artifacts),
      no_faces: bool(p.no_faces), single_continuous_shot: bool(p.single_continuous_shot),
      loopable: bool(p.loopable), reads_as_progression: bool(p.reads_as_progression),
      overall, reason: typeof p.reason === 'string' ? p.reason.slice(0, 300) : '',
    };
  } catch { return fail; }
}

/** The pass rule. The four safety checks are non-negotiable (wrong subject, text, faces, cuts are
 *  instant rejects); loopability gates ambient use, progression gates scrub use — a clip must
 *  earn at least one playback mode; overall must clear the floor. */
export function passesVeoGate(v: VeoVerdict, minOverall = 7): { pass: boolean; mode: 'scrub' | 'loop' | null; reasons: string[] } {
  const reasons: string[] = [];
  if (!v.subject_match) reasons.push('wrong subject');
  if (!v.no_text_artifacts) reasons.push('text/logo artifacts');
  if (!v.no_faces) reasons.push('people/faces present');
  if (!v.single_continuous_shot) reasons.push('cuts or unstable camera');
  if (v.overall < minOverall) reasons.push(`overall ${v.overall} below ${minOverall}`);
  if (!v.loopable && !v.reads_as_progression) reasons.push('neither loopable nor a scrubbable progression');
  const pass = reasons.length === 0;
  return { pass, mode: pass ? (v.reads_as_progression ? 'scrub' : 'loop') : null, reasons };
}
