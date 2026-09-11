// src/lib/garvis/approvalRisk.ts
// THE APPROVAL RISK CLASSIFIER — pure core (verified by approvalRisk.verify.ts). SW8.3: scores
// a pending approval from DETERMINISTIC features only (no model, no vibes) and can only ever
// ADD review: wired into autonomyGate, a high score forces MANUAL on an otherwise-earned
// auto-mode class — it can block earned autonomy, never grant it. Absence or error fails
// closed to manual at the gate.
//
// Monotonic by construction (pinned by the verify): adding a risk feature never lowers the
// score, so no combination of features can talk the classifier DOWN.

export const RISK_HIGH = 50;

export interface RiskFacts {
  kind: string;
  /** Dollar amount riding the payload (spend, invoice), when one exists. */
  amountUsd?: number | null;
  /** False = this recipient has never been contacted before. Null/undefined = not applicable. */
  recipientKnown?: boolean | null;
  /** Owner-local hour (0-23) the approval was minted. Null = unknown. */
  mintedHourLocal?: number | null;
  /** Serialized payload size vs the median for this kind — a 4× outlier is an anomaly. */
  payloadBytes?: number | null;
  classMedianBytes?: number | null;
}

export interface RiskVerdict { score: number; reasons: string[] }

const SEND_KINDS = new Set(['send_email', 'send_sms', 'send_batch', 'publish_post', 'send_for_signature']);
// send_mail: real dollars AND physical mail to households; ship_repo: pushes code infrastructure.
const HEAVY_KINDS = new Set(['spend', 'deploy_backend', 'apply_migration', 'send_mail', 'ship_repo']);

export function riskFor(f: RiskFacts): RiskVerdict {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };

  if (HEAVY_KINDS.has(f.kind)) add(25, `${f.kind} touches money or infrastructure`);
  else if (SEND_KINDS.has(f.kind)) add(10, 'reaches another person when it runs');

  const amt = typeof f.amountUsd === 'number' && Number.isFinite(f.amountUsd) ? f.amountUsd : null;
  if (amt !== null && amt >= 500) add(40, `$${amt.toFixed(2)} is a large amount`);
  else if (amt !== null && amt >= 100) add(20, `$${amt.toFixed(2)} is on the high side`);

  if (f.recipientKnown === false) add(40, 'recipient has never been contacted before');

  const hr = typeof f.mintedHourLocal === 'number' ? f.mintedHourLocal : null;
  if (hr !== null && (hr < 6 || hr >= 23)) add(15, `minted off-hours (${hr}:00 local)`);

  if (
    typeof f.payloadBytes === 'number' && typeof f.classMedianBytes === 'number'
    && f.classMedianBytes > 0 && f.payloadBytes > 2_000 && f.payloadBytes > 4 * f.classMedianBytes
  ) add(20, 'payload is far larger than others of its kind');

  return { score: Math.min(100, score), reasons };
}

/** The gate-side question. A missing verdict is HIGH by definition (fail closed to manual). */
export function riskBlocksAutonomy(v: RiskVerdict | null | undefined): boolean {
  if (!v) return true;
  return v.score >= RISK_HIGH;
}
