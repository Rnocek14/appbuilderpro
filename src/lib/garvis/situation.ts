// src/lib/garvis/situation.ts
// THE SITUATION MODEL (holy-grail gap 3, pure half). Memory recalls similar text; SITUATION
// holds "the state of things": which businesses exist, which arcs are moving or blocked, which
// clients owe intake, what the clock is doing, what's pending in the queue. One compiler, one
// digest, consumed by every surface that plans (the Orchestrator compile, the Commander) — so
// plans come from current reality, not just from the sentence.
//
// Contract (verified by situation.verify.ts):
//   - Every line derives from a typed input — nothing invented, no fake precision.
//   - Byte-budgeted: never exceeds SITUATION_BUDGET; truncation drops whole lines and says so.
//   - Empty state is honest ("no businesses yet"), never blank.
//   - Deterministic: same inputs → same digest, input order preserved.

export interface SituationInputs {
  worlds: { title: string }[];
  arcs: { title: string; status: string; waiting_reason?: string | null }[];
  engagements: { client_name: string; status: string; received: number; total: number }[];
  standingOrders: { kind: string; label: string; status: string }[];
  pendingApprovals: number;
  newOpportunities: number;
  outstandingInvoicesUsd: number;
  clockAlive: boolean | null; // null = unknown (probe unavailable) — say so, never guess
}

export const SITUATION_BUDGET = 3000;

function line(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Compile the operator's current situation into a budgeted, honest digest. */
export function compileSituation(s: SituationInputs): string {
  const lines: string[] = ['SITUATION (current state — plan from this, reference businesses by their exact titles):'];

  if (s.worlds.length === 0) {
    lines.push('- No businesses exist yet — founding one is the first step of anything business-scoped.');
  } else {
    lines.push(`- Businesses (${s.worlds.length}): ${s.worlds.map((w) => `"${w.title}"`).join(', ')}.`);
  }

  const liveArcs = s.arcs.filter((a) => a.status === 'running' || a.status === 'waiting' || a.status === 'ready');
  for (const a of liveArcs) {
    lines.push(line([
      `- Arc "${a.title}": ${a.status}`,
      a.status === 'waiting' && a.waiting_reason ? `— waiting on: ${a.waiting_reason.slice(0, 140)}` : null,
    ]) + (a.status === 'waiting' ? ' (do not re-plan this work — it resumes)' : ''));
  }

  for (const e of s.engagements) {
    lines.push(`- Client "${e.client_name}": ${e.status}, intake ${e.received}/${e.total}.`);
  }

  const activeOrders = s.standingOrders.filter((o) => o.status === 'active');
  if (activeOrders.length) {
    lines.push(`- Standing orders (${activeOrders.length} active): ${activeOrders.map((o) => `${o.label} [${o.kind}]`).join('; ')}.`);
  }

  if (s.pendingApprovals > 0) lines.push(`- ${s.pendingApprovals} approval(s) pending in the Queue.`);
  if (s.newOpportunities > 0) lines.push(`- ${s.newOpportunities} new opportunity/ies untriaged in the feed.`);
  if (s.outstandingInvoicesUsd > 0) lines.push(`- $${s.outstandingInvoicesUsd.toFixed(2)} outstanding across sent invoices.`);
  if (s.clockAlive === false) lines.push('- ⚠ The heartbeat is NOT ticking — scheduled work (hunts, watches, drains) will not run until it is armed.');

  // Budget: drop whole lines from the end, honestly marked. The header always survives.
  const out: string[] = [];
  let used = 0;
  let dropped = 0;
  for (const l of lines) {
    if (used + l.length + 1 > SITUATION_BUDGET - 24) { dropped++; continue; }
    out.push(l);
    used += l.length + 1;
  }
  if (dropped > 0) out.push(`- (+${dropped} more — truncated)`);
  return out.join('\n');
}
