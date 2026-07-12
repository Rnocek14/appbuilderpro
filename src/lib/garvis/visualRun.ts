// src/lib/garvis/visualRun.ts
// Impure half of the visual grammar: ask the explorer model to DESIGN the mechanism visual for a
// branch, gate the result, and fall back honestly. The fallback ladder mirrors the house rule
// that a wrong picture is worse than none:
//   1. the model designs a spec → gates pass → 'ai'
//   2. the model says archetype:'none' → its refusal STANDS (a starter would override honest
//      judgment) — the room shows the reason
//   3. the model's spec fails the gates, or the model is unreachable → the offline starter
//      heuristic, plainly labeled 'starter' — or, when no mechanism form matches, an error.

import { exploreComplete } from './explorerAI';
import {
  parseVisualSpec, localSpecFor, PICTURE_SYSTEM, picturePrompt, type VisualSpec,
} from './visualGrammar';

export interface DesignedVisual { spec: VisualSpec; source: 'ai' | 'starter'; costUsd: number }

export async function designVisual(title: string, summary: string): Promise<
  { visual: DesignedVisual } | { refusal: string } | { error: string }
> {
  let aiMissing: string[] | null = null;
  try {
    const r = await exploreComplete([
      { role: 'system', content: PICTURE_SYSTEM },
      { role: 'user', content: picturePrompt(title, summary) },
    ], 700);
    const parsed = parseVisualSpec(r.text);
    if (parsed.spec) return { visual: { spec: parsed.spec, source: 'ai', costUsd: r.costUsd } };
    if (parsed.none) return { refusal: parsed.none.reason };
    aiMissing = parsed.missing;
  } catch { /* unreachable — the starter ladder below */ }

  const starter = localSpecFor(`${title} ${summary}`);
  if (starter) return { visual: { spec: starter, source: 'starter', costUsd: 0 } };
  return {
    error: aiMissing
      ? `The designed visual failed the honesty gates (${aiMissing.slice(0, 2).join('; ')}) and no starter mechanism matches this branch.`
      : 'The visual designer is unreachable and no starter mechanism matches this branch — try the lab bench directly.',
  };
}
