// src/lib/garvis/worldIntel.ts
// WORLD INTELLIGENCE — pure core (no Supabase, no DOM; verified by worldIntel.verify.ts).
//
// Memory stores events; understanding stores implications. This module is Sprint M's brain:
//   * compileLivingState — the DETERMINISTIC half: objective, strategy, blockers, risks, momentum.
//     Everything counted or structural; a blocker without evidence cannot exist by construction.
//   * momentumFrom — a derived LABEL from counted signals, evidence attached. Never a stored score:
//     "Momentum: High" as an opinion is the invented-confidence sin wearing a new hat.
//   * REFLECT_SYSTEM + parseReflection — the SYNTHESIZED half (organizational learning): the model
//     reflects over real evidence; the parser enforces that every learned item carries evidence and
//     DROPS anything that doesn't. Understanding without evidence does not persist.
//   * reflectionDue — the Friday-brain cadence, gated on actual activity (no activity → no ritual).
//   * heartbeat — the six questions every world continuously answers, compiled for display/context.
//
// Rule 6 wiring lives in nextMove.ts (reflection-due and stale-intel become waking moves).

// ---------------------------------------------------------------------------
// Momentum — a label derived from counts, with its evidence
// ---------------------------------------------------------------------------

export interface MomentumSignals {
  events7d: number; artifacts7d: number; sends7d: number; replies7d: number;
  /** G5 instrumentation — inbound demand from the generated site (absent when not instrumented). */
  leads7d?: number; visits7d?: number;
}
export type MomentumLabel = 'surging' | 'steady' | 'slowing' | 'dormant';

export function momentumFrom(s: MomentumSignals): { label: MomentumLabel; evidence: string } {
  const leads = s.leads7d ?? 0;
  const visits = s.visits7d ?? 0;
  const bits: string[] = [];
  if (leads) bits.push(`${leads} lead${leads === 1 ? '' : 's'}`);            // inbound demand leads the evidence
  if (s.replies7d) bits.push(`${s.replies7d} repl${s.replies7d === 1 ? 'y' : 'ies'}`);
  if (s.sends7d) bits.push(`${s.sends7d} send${s.sends7d === 1 ? '' : 's'}`);
  if (visits) bits.push(`${visits} site visit${visits === 1 ? '' : 's'}`);
  if (s.artifacts7d) bits.push(`${s.artifacts7d} artifact${s.artifacts7d === 1 ? '' : 's'}`);
  if (s.events7d) bits.push(`${s.events7d} event${s.events7d === 1 ? '' : 's'}`);
  const evidence = bits.length ? `${bits.join(', ')} this week` : 'no activity this week';
  // A lead is the strongest signal in the system — a real human raised their hand.
  const label: MomentumLabel =
    leads > 0 || s.replies7d > 0 || s.sends7d >= 3 || s.events7d >= 15 ? 'surging'
    : visits >= 10 || s.events7d >= 5 || s.artifacts7d >= 3 ? 'steady'
    : visits >= 1 || s.events7d >= 1 || s.artifacts7d >= 1 ? 'slowing'
    : 'dormant';
  return { label, evidence };
}

// ---------------------------------------------------------------------------
// Living State — the deterministic compile
// ---------------------------------------------------------------------------

export interface EvidencedItem { text: string; evidence: string }

export interface LivingStateInput {
  objective: string | null;          // from the mission bound to this world
  activePlayTitle: string | null;    // current strategy, if a play/mission is live
  audienceEmpty: boolean;            // structural (same source as the floor collector)
  brandEmpty: boolean;
  pendingApprovals: number;
  oldestPendingHours: number | null;
  intelAgeDays: number | null;       // age of the newest intel/research artifact (null = none)
  signals: MomentumSignals;
  openQuestions: string[];           // carried from the intelligence row (human/model-added)
}

export interface LivingState {
  objective: string | null;
  strategy: string | null;
  blockers: EvidencedItem[];
  risks: EvidencedItem[];
  momentum: { label: MomentumLabel; evidence: string; signals: MomentumSignals };
  openQuestions: string[];
}

export function compileLivingState(input: LivingStateInput): LivingState {
  const blockers: EvidencedItem[] = [];
  const risks: EvidencedItem[] = [];

  if (input.audienceEmpty) blockers.push({ text: 'Mailing list is empty', evidence: '0 contacts on record — sends have no recipients' });
  if (input.brandEmpty) blockers.push({ text: 'Brand vault is empty', evidence: 'no brand kit saved — studios have no voice to write in' });
  if (input.pendingApprovals > 0) {
    blockers.push({
      text: `${input.pendingApprovals} action${input.pendingApprovals === 1 ? '' : 's'} waiting on approval`,
      evidence: input.oldestPendingHours != null ? `oldest has waited ${Math.round(input.oldestPendingHours)}h` : 'pending in the queue',
    });
  }
  if (input.intelAgeDays != null && input.intelAgeDays > 14) {
    risks.push({ text: 'Market intel is going stale', evidence: `newest research artifact is ${Math.round(input.intelAgeDays)} days old` });
  }
  if (input.intelAgeDays == null) {
    risks.push({ text: 'No market intel on record', evidence: 'no research artifacts in this world yet' });
  }

  const m = momentumFrom(input.signals);
  return {
    objective: input.objective,
    strategy: input.activePlayTitle,
    blockers,
    risks,
    momentum: { ...m, signals: input.signals },
    openQuestions: input.openQuestions.filter((q) => q.trim()).slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Reflection — organizational learning, evidence-enforced
// ---------------------------------------------------------------------------

export const REFLECT_SYSTEM = `You are Garvis reflecting on one world (mission/business/exploration)
the way a sharp operator reviews a week: what was tried, what the evidence says, what it implies,
what should change. You are given ONLY real recorded evidence (events, artifacts, results). You
return STRICT JSON:

{"tried":[{"text":"what was attempted","evidence":"the recorded fact it rests on"}],
 "learned":[{"text":"the lesson","evidence":"the recorded fact it rests on"}],
 "implications":[{"observation":"what happened","implication":"what it means for strategy","evidence":"recorded fact"}],
 "recommendation":"the single recommended direction, grounded in the above",
 "openQuestions":["a question the evidence raises but cannot answer"]}

HARD RULES:
- Every tried/learned/implication item MUST carry an evidence string that references the provided
  record. Items without evidence will be DELETED by the system — do not produce them.
- Never invent numbers, rates, or outcomes not present in the evidence.
- If the evidence is thin, say less. An honest short reflection beats a padded one.
- No markdown fences. JSON only.`;

export interface Implication { observation: string; implication: string; evidence: string }
export interface Reflection {
  tried: EvidencedItem[];
  learned: EvidencedItem[];
  implications: Implication[];
  recommendation: string | null;
  openQuestions: string[];
}

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Tolerant parse + the evidence gate: any item missing evidence is dropped, never repaired. */
export function parseReflection(raw: string): Reflection {
  const empty: Reflection = { tried: [], learned: [], implications: [], recommendation: null, openQuestions: [] };
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start === -1 || end <= start) return empty;
  let p: Record<string, unknown>;
  try { p = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>; } catch { return empty; }

  const items = (v: unknown): EvidencedItem[] =>
    (Array.isArray(v) ? v : [])
      .map((x) => ({ text: str((x as Record<string, unknown>)?.text), evidence: str((x as Record<string, unknown>)?.evidence, 300) }))
      .filter((x) => x.text && x.evidence);   // the gate: no evidence → no persistence

  const implications = (Array.isArray(p.implications) ? p.implications : [])
    .map((x) => ({
      observation: str((x as Record<string, unknown>)?.observation),
      implication: str((x as Record<string, unknown>)?.implication),
      evidence: str((x as Record<string, unknown>)?.evidence, 300),
    }))
    .filter((x) => x.observation && x.implication && x.evidence);

  return {
    tried: items(p.tried).slice(0, 6),
    learned: items(p.learned).slice(0, 6),
    implications: implications.slice(0, 6),
    recommendation: str(p.recommendation, 600) || null,
    openQuestions: (Array.isArray(p.openQuestions) ? p.openQuestions : []).map((q) => str(q, 200)).filter(Boolean).slice(0, 5),
  };
}

/** Reflection cadence: due after 7 quiet-days-free days WITH enough new activity to reflect on.
 *  No activity → no ritual (a reflection over nothing would have to invent). */
export function reflectionDue(lastReflectedAt: string | null, events7d: number, now: Date): boolean {
  if (events7d < 5) return false;
  if (!lastReflectedAt) return true;
  return now.getTime() - new Date(lastReflectedAt).getTime() > 7 * 24 * 3_600_000;
}

// ---------------------------------------------------------------------------
// The heartbeat — six questions, compiled answers
// ---------------------------------------------------------------------------

export interface Heartbeat {
  accomplishing: string; doing: string; blocking: string; changed: string; matters: string; next: string;
}

export function heartbeat(state: LivingState, latest: { changedLine: string | null; recommendation: string | null }): Heartbeat {
  return {
    accomplishing: state.objective ?? 'No objective set yet — say what winning looks like.',
    doing: `${state.momentum.label} — ${state.momentum.evidence}`,
    blocking: state.blockers.length ? state.blockers.map((b) => b.text).join(' · ') : 'nothing structural',
    changed: latest.changedLine ?? 'quiet since last look',
    matters: state.blockers[0]?.text ?? state.risks[0]?.text ?? 'keep the cadence',
    next: latest.recommendation ?? 'run the play, then reflect',
  };
}

/** The evidence pack the reflection prompt sees — compiled, byte-bounded, rows only. */
export function buildReflectionContext(input: {
  worldTitle: string; objective: string | null;
  events: { subject: string; occurred_at: string }[];
  artifacts: { title: string; kind: string }[];
  results: { sent: number; replies: number; approvals: number; leads?: number; visits?: number };
  state: LivingState;
}, budget = 6000): string {
  const inbound = (input.results.leads ?? 0) || (input.results.visits ?? 0)
    ? `, site visits ${input.results.visits ?? 0}, leads ${input.results.leads ?? 0}`
    : '';
  const lines = [
    `WORLD: ${input.worldTitle}`,
    `OBJECTIVE: ${input.objective ?? '(none set)'}`,
    `MOMENTUM: ${input.state.momentum.label} (${input.state.momentum.evidence})`,
    `RESULTS: sent ${input.results.sent}, replies ${input.results.replies}, decisions made ${input.results.approvals}${inbound}`,
    input.state.blockers.length ? `BLOCKERS: ${input.state.blockers.map((b) => `${b.text} [${b.evidence}]`).join(' · ')}` : '',
    '',
    'RECORD (newest first):',
    ...input.events.slice(0, 25).map((e) => `- ${e.occurred_at.slice(0, 10)} ${e.subject.replace(/\s+/g, ' ').slice(0, 140)}`),
    '',
    'ARTIFACTS:',
    ...input.artifacts.slice(0, 20).map((a) => `- (${a.kind}) ${a.title.slice(0, 100)}`),
  ].filter(Boolean);
  let out = lines.join('\n');
  if (out.length > budget) out = out.slice(0, budget - 1) + '…';
  return out;
}
