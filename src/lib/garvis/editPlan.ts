// src/lib/garvis/editPlan.ts
// THE EMPHASIS ENGINE — pure core (verified by editPlan.verify.ts). The judgment layer of editing,
// encoded from the researched decision rules: WHERE emphasis goes is the one thing no shipping
// auto-editor solves (they zoom on cadence, not meaning) — and script-first pipelines can, because
// the script exists before the footage. Rules and their evidence grades:
//   - NUMBERS/STATS earn emphasis (specificity wins — the top-graded hook/claim signal; N=34.6k).
//   - TURN WORDS ("but", "so", "except", "actually", "the truth…") mark story turns — the
//     but/so narrative framework; contrastive prosody research backs contrast-as-prominence.
//   - QUESTIONS set up reveals; superlatives/absolutes mark claim lines.
//   - EMPHASIS IS A SCARCE RESOURCE: aggressive zooms are reserved for turning points — capped by
//     runtime (~1 per 15s, max 4) and never on adjacent scenes (uniform punch = noise).
//   - The HOOK already has its own treatment; the CTA stays steady ON the face (trust rule) —
//     neither competes for emphasis slots.
// Deterministic: same script, same plan.

export interface LineSignals {
  score: number;
  reasons: string[];
}

const NUMBER_RE = /(?:\$|£|€)?\d[\d,.]*\s*(?:%|percent|x\b)?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|twice|double|triple)\b/i;
const TURN_RE = /\b(?:but|so|except|actually|instead|until|unless|however|turns out|the truth|here's the thing|the catch|the problem)\b/i;
const ABSOLUTE_RE = /\b(?:never|always|only|every|nothing|nobody|worst|best|most|biggest|fastest|hardest)\b/i;

/** Score one narration line for emphasis-worthiness. Pure text, no audio needed. */
export function lineSignals(text: string): LineSignals {
  const t = text.trim();
  if (!t) return { score: 0, reasons: [] };
  const reasons: string[] = [];
  let score = 0;
  if (NUMBER_RE.test(t)) { score += 2; reasons.push('number'); }
  if (TURN_RE.test(t)) { score += 1; reasons.push('turn'); }
  if (ABSOLUTE_RE.test(t)) { score += 1; reasons.push('absolute'); }
  if (/\?/.test(t)) { score += 1; reasons.push('question'); }
  return { score, reasons };
}

/** Pick WHICH scenes get the emphasis treatment (hard zoom + the whoosh riding their cut).
 *  Excludes the hook (scene 0 — it has its own grammar) and the final scene (the CTA stays steady
 *  on the face). Caps by runtime, forbids adjacent emphasis, breaks ties toward the earlier scene.
 *  Returns ASCENDING scene indices. */
export function planEmphasis(scenes: { voiceover: string; durationS: number }[]): number[] {
  if (scenes.length < 3) return [];
  const totalS = scenes.reduce((a, s) => a + s.durationS, 0);
  const budget = Math.min(4, Math.max(1, Math.floor(totalS / 15)));
  const candidates = scenes
    .map((s, i) => ({ i, ...lineSignals(s.voiceover) }))
    .slice(1, -1)                              // never the hook, never the CTA
    .filter((c) => c.score >= 2)               // a lone weak signal isn't a turning point
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const picked: number[] = [];
  for (const c of candidates) {
    if (picked.length >= budget) break;
    if (picked.some((p) => Math.abs(p - c.i) <= 1)) continue;  // uniform punch = noise
    picked.push(c.i);
  }
  return picked.sort((a, b) => a - b);
}
