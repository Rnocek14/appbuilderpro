// supabase/functions/_shared/emailFlowsCore.ts
// EMAIL FLOWS — pure core (verified by src/lib/garvis/emailFlows.verify.ts), shared by the
// standing-worker's flow sweep and the email board UI. Two ideas, both computed from REAL rows:
//
//  1. BEHAVIORAL SEGMENTS: membership derives from outreach_events (delivered/opened/clicked/
//     replied — written only by service-role webhooks), never from a guess about engagement.
//     No events in the window = no member; that is the honest empty segment.
//  2. DRIP STEPS: a 2-3 step sequence where every later step is gated on the REAL absence of a
//     reply — a contact who replied is out of the drip forever (nextDripStep returns null), and
//     a step's delay clock runs from the moment its predecessor actually DRAINED (approved and
//     sent), never from when it was staged. Approval gates every send: each due cohort becomes
//     one outreach_batch + one send_batch approval on the existing spine.

export const MAX_DRIP_STEPS = 3;
export const MIN_DRIP_STEPS = 2;

export interface BehavioralRule {
  kind: 'opened_no_reply' | 'clicked' | 'no_open' | 'replied';
  sinceDays: number;                 // the look-back window
}

export interface EventRow { contact_id: string | null; kind: string; created_at: string }

/** Compute a behavioral segment from real event rows. Returns member contact ids + per-contact
 *  evidence counts (how many qualifying events put them here). Deterministic; unknown rule kinds
 *  return an empty segment rather than guessing. */
export function computeSegment(rows: EventRow[], rule: BehavioralRule, nowIso: string): {
  contactIds: string[]; evidence: Record<string, number>;
} {
  const now = Date.parse(nowIso);
  const since = now - Math.max(1, rule.sinceDays) * 86_400_000;
  const inWindow = (r: EventRow) => {
    const t = Date.parse(r.created_at);
    return Number.isFinite(t) && t >= since && t <= now;
  };
  const byContact = new Map<string, { opened: number; clicked: number; replied: number; delivered: number }>();
  for (const r of rows) {
    if (!r.contact_id || !inWindow(r)) continue;
    const c = byContact.get(r.contact_id) ?? { opened: 0, clicked: 0, replied: 0, delivered: 0 };
    if (r.kind === 'opened') c.opened++;
    else if (r.kind === 'clicked') c.clicked++;
    else if (r.kind === 'replied') c.replied++;
    else if (r.kind === 'delivered') c.delivered++;
    byContact.set(r.contact_id, c);
  }
  const contactIds: string[] = [];
  const evidence: Record<string, number> = {};
  for (const [id, c] of byContact) {
    let n = 0;
    if (rule.kind === 'opened_no_reply') n = c.opened > 0 && c.replied === 0 ? c.opened : 0;
    else if (rule.kind === 'clicked') n = c.clicked;
    else if (rule.kind === 'no_open') n = c.delivered > 0 && c.opened === 0 ? c.delivered : 0;
    else if (rule.kind === 'replied') n = c.replied;
    if (n > 0) { contactIds.push(id); evidence[id] = n; }
  }
  contactIds.sort();
  return { contactIds, evidence };
}

export interface DripStep {
  subject: string;
  body: string;
  delayDays: number;                 // measured from the PREVIOUS step's real drain (step 0: from enrollment)
}

export interface SentStep {
  stepIndex: number;
  batch_id: string;
  staged_at: string;
  drained_at?: string | null;        // stamped when the batch actually sent — the next step's clock
}

/**
 * The drip gate: which step (if any) is due for one member right now.
 *  - A reply ends the drip permanently (null) — step 2+ fires ONLY on real non-reply.
 *  - The next step is the first unsent index, due only when the previous step has actually
 *    DRAINED (approval given, batch sent) and its delay has elapsed. A staged-but-unapproved
 *    step holds everything behind it — approval-gating composes through the whole flow.
 */
export function nextDripStep(
  steps: DripStep[],
  sent: SentStep[],
  repliedAt: string | null,
  enrolledAt: string,
  nowIso: string,
): { stepIndex: number } | null {
  if (repliedAt) return null;
  if (!steps.length) return null;
  const next = sent.length;                       // steps send strictly in order
  if (next >= steps.length || next >= MAX_DRIP_STEPS) return null;
  const now = Date.parse(nowIso);
  const delayMs = Math.max(0, steps[next].delayDays) * 86_400_000;
  if (next === 0) {
    return now >= Date.parse(enrolledAt) + delayMs ? { stepIndex: 0 } : null;
  }
  const prev = sent[next - 1];
  if (!prev?.drained_at) return null;             // the previous step never actually sent — hold
  return now >= Date.parse(prev.drained_at) + delayMs ? { stepIndex: next } : null;
}

/** Validate a flow definition the way the worker will consume it. Throws with the exact problem. */
export function validateFlow(input: { name: string; rule: BehavioralRule; steps: DripStep[] }): void {
  if (!input.name.trim()) throw new Error('Give the flow a name.');
  if (!['opened_no_reply', 'clicked', 'no_open', 'replied'].includes(input.rule?.kind)) {
    throw new Error('The segment rule must be opened_no_reply, clicked, no_open, or replied.');
  }
  if (!(input.rule.sinceDays >= 1 && input.rule.sinceDays <= 90)) throw new Error('The look-back window must be 1-90 days.');
  if (input.steps.length < MIN_DRIP_STEPS || input.steps.length > MAX_DRIP_STEPS) {
    throw new Error(`A drip is ${MIN_DRIP_STEPS}-${MAX_DRIP_STEPS} steps — got ${input.steps.length}.`);
  }
  input.steps.forEach((s, i) => {
    if (!s.subject.trim()) throw new Error(`Step ${i + 1} needs a subject.`);
    if (!s.body.trim()) throw new Error(`Step ${i + 1} needs a body.`);
    if (i > 0 && !(s.delayDays >= 1 && s.delayDays <= 30)) throw new Error(`Step ${i + 1}'s delay must be 1-30 days.`);
  });
}
