// src/lib/garvis/brainModel.ts
// The real GarvisModelClient — the brain the runtime calls every step. It is a thin client: it
// forwards the (already mode-gated) decision input to the `garvis-brain` edge function and returns
// the validated GarvisDecision. The API key lives only in the edge function; nothing secret is
// ever shipped to the browser. This is the production counterpart of diagnosticModel.

import { supabase } from '../supabase';
import { DIRECT } from '../aiConfig';
import { brainDecideDirect, type BrainResponse as DirectBrainResponse } from './directBrain';
import type { GarvisDecision, GarvisModelClient } from './types';

interface BrainResponse extends DirectBrainResponse {
  error?: string;
}

/** Stable id for a tool call within a step (the runtime only needs uniqueness for pairing). */
function callId(step: number, i: number): string {
  return `c_${step}_${i}`;
}

/**
 * The LLM-backed reasoning seam. Swappable with diagnosticModel anywhere a GarvisModelClient is
 * accepted (runGarvisTask / drainQueue). The provider/model are chosen server-side via the
 * AI_PROVIDER / AI_MODEL env on the edge function — the model router lives there, not here.
 */
export const brainModel: GarvisModelClient = {
  async decide(input) {
    let data: BrainResponse;
    if (DIRECT) {
      // DIRECT mode: reason in the browser with the user's own key — no edge function required.
      data = await brainDecideDirect(input);
    } else {
      const res = await supabase.functions.invoke<BrainResponse>('garvis-brain', {
        body: {
          mode: input.mode,
          task: input.task,
          history: input.history,
          tools: input.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          context: input.context,
        },
      });
      if (res.error) throw new Error(`garvis-brain invoke failed: ${res.error.message}`);
      if (!res.data) throw new Error('garvis-brain returned no body');
      if (res.data.error) throw new Error(`garvis-brain: ${res.data.error}`);
      data = res.data;
    }

    const costUsd = Number(data.costUsd ?? 0);
    const step = input.history.length;

    if (data.kind === 'tools') {
      const calls = (data.calls ?? []).map((c, i) => ({
        id: callId(step, i),
        name: c.name,
        input: c.input ?? {},
      }));
      return { kind: 'tools', calls, costUsd } satisfies GarvisDecision;
    }

    if (data.kind === 'await_approval') {
      return {
        kind: 'await_approval',
        question: data.question ?? 'A decision is needed.',
        options: data.options,
        costUsd,
      } satisfies GarvisDecision;
    }

    return {
      kind: 'finish',
      output: data.output ?? 'Done.',
      recommendation: data.recommendation,
      costUsd,
    } satisfies GarvisDecision;
  },
};
