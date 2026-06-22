// src/lib/garvis/diagnosticModel.ts
// A DETERMINISTIC ModelClient with NO LLM call. Its only job is to prove the runtime chassis
// works end-to-end — claim → gated tool call → checkpoint → finish → log — without any reasoning.
// The real LLM-backed ModelClient (which actually decides what to work on) is the Week-4 seam;
// this is the self-test that lets us validate the plumbing before a brain exists.

import type { GarvisDecision, GarvisModelClient, GarvisMessage } from './types';

/** How many tool results are already in history (each tool call adds an assistant+tool pair). */
function toolResultsSoFar(history: GarvisMessage[]): number {
  return history.filter((m) => m.role === 'tool').length;
}

export const diagnosticModel: GarvisModelClient = {
  async decide({ history, tools }) {
    // Step 1: exercise a read tool that exists in every mode.
    if (toolResultsSoFar(history) === 0 && tools.some((t) => t.name === 'recent_runs')) {
      const decision: GarvisDecision = {
        kind: 'tools',
        calls: [{ id: 'diag-1', name: 'recent_runs', input: { limit: 5 } }],
        costUsd: 0,
      };
      return decision;
    }
    // Step 2: finish, echoing what it observed. No recommendation — this is a plumbing check.
    const lastTool = [...history].reverse().find((m) => m.role === 'tool');
    let observed = 0;
    try {
      const parsed = lastTool ? (JSON.parse(lastTool.content) as { runs?: unknown[] }) : null;
      observed = parsed?.runs?.length ?? 0;
    } catch { /* ignore */ }
    return {
      kind: 'finish',
      output: `Garvis runtime online — gate, tool dispatch, checkpoint, and logging all fired. Observed ${observed} recent run(s).`,
      costUsd: 0,
    };
  },
};
