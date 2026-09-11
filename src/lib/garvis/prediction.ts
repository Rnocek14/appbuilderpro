// src/lib/garvis/prediction.ts
// THE PREDICTION PRODUCER — pure core (verified by prediction.verify.ts). The decision journal
// (mind_decisions, app_0019) was built for falsifiable predictions but only ever filled by hand.
// This core turns every EXECUTED outbound send into one automatically: what was sent, what is
// expected to happen inside a fixed window, and — when the window elapses — whether it did.
//
// Honesty rules:
//   - A MEASURED base rate (the owner's own elapsed sends) speaks with its numbers; without one
//     the prediction says HEURISTIC in so many words and invents no percentage.
//   - Predictions are falsifiable by construction: a fixed window, a binary outcome, closed
//     against real reply records — never judged by the model that made them.
//   - The producer opens decisions; only the closer (or the operator) ever closes one, and a
//     hand-written decision is never auto-closed.

export const PREDICTION_WINDOW_DAYS = 7;
/** Below this many elapsed sends the base rate is noise — the prediction says heuristic. */
export const MIN_BASE_SENDS = 10;
/** The briefing shows the hit-rate line only at this many CLOSED predictions — a rate over
 *  two data points is theater. */
export const MIN_CLOSED_FOR_LINE = 5;

export interface SendBaseRate {
  /** Sends whose reply window has fully elapsed (they can no longer surprise us). */
  sends: number;
  /** How many of the owner's recent campaigns actually drew a reply. */
  replies: number;
}

export interface PredictionRow { decision: string; reasoning: string; prediction: string }

/** One executed send → one falsifiable decision row. */
export function predictionFor(input: {
  subject: string; to: string; campaignId: string; base: SendBaseRate | null;
}): PredictionRow {
  const measured = !!input.base && input.base.sends >= MIN_BASE_SENDS;
  const rate = measured ? input.base!.replies / Math.max(1, input.base!.sends) : null;
  const expectReply = rate !== null && rate >= 0.5;
  const prediction = measured
    ? `${expectReply ? 'A reply' : 'No reply'} within ${PREDICTION_WINDOW_DAYS} days — more likely than not (measured ${Math.round((rate ?? 0) * 100)}% reply rate over ${input.base!.sends} elapsed sends).`
    : `No reply within ${PREDICTION_WINDOW_DAYS} days — heuristic: most outreach goes unanswered, and too few of your own sends have elapsed to measure better.`;
  return {
    decision: `Sent "${input.subject.slice(0, 100)}" to ${input.to}`,
    reasoning: `${measured ? 'Measured base rate at send time' : 'Heuristic — no measured base rate yet'}. [campaign:${input.campaignId}]`,
    prediction,
  };
}

/** What the prediction committed to: true = a reply expected, false = none, null = not one of
 *  ours (a hand-written decision — never auto-closed). */
export function expectedReply(prediction: string | null): boolean | null {
  if (!prediction) return null;
  if (prediction.startsWith('A reply within')) return true;
  if (prediction.startsWith('No reply within')) return false;
  return null;
}

/** The campaign this prediction rides on, recovered from the reasoning's stable marker. */
export function campaignFromReasoning(reasoning: string | null): string | null {
  const m = /\[campaign:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i.exec(reasoning ?? '');
  return m ? m[1] : null;
}

export function windowElapsed(decidedAt: string, nowIso: string, days = PREDICTION_WINDOW_DAYS): boolean {
  const d = Date.parse(decidedAt);
  const n = Date.parse(nowIso);
  if (Number.isNaN(d) || Number.isNaN(n)) return false;
  return n - d >= days * 86_400_000;
}

/** Judge an elapsed window against what actually happened. Null for decisions this producer
 *  didn't write — the closer must leave them alone. */
export function closeSendPrediction(prediction: string | null, replied: boolean): { outcome: string; hit: boolean } | null {
  const expected = expectedReply(prediction);
  if (expected === null) return null;
  const hit = expected === replied;
  return {
    outcome: `${replied ? 'A reply arrived' : 'No reply'} within the ${PREDICTION_WINDOW_DAYS}-day window — ${hit ? 'as predicted' : 'contrary to the prediction'}.`,
    hit,
  };
}
