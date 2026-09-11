// src/lib/garvis/slate.ts
// THE SLATE — approve the day, not the item (pure; verified by slate.verify.ts).
// The Queue's contract is one decision at a time with the whole decision inline. That contract is
// right for anything unusual and wrong for the one class that arrives in bulk every day: the cold
// pitches the hunt drafted overnight. The slate bundles ONLY that class — never invoices, never
// replies, never deploys — into a single morning decision: read one (they share one template and
// one voice), then approve the rest in one keypress. Exceptions are surfaced individually: a pitch
// the risk classifier scored high stays OUT of the slate and keeps its own card.

export interface SlateCandidate {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown> | null | undefined;
  /** The approval's risk score (0-100) when the minter stamped one; null when unknown. */
  riskScore?: number | null;
}

/** A pending cold pitch is a slate member unless it carries a high risk score. */
export function isColdPitch(a: Pick<SlateCandidate, 'kind' | 'payload'>): boolean {
  return a.kind === 'send_email' && !!a.payload && a.payload.kind === 'cold_site_pitch';
}

export interface Slate {
  ids: string[];         // members, in the order given
  outliers: string[];    // cold pitches held OUT of the slate (high risk) — they keep their own card
}

/** Build today's slate from the pending list. `riskHigh` is the classifier's HIGH threshold. */
export function buildSlate(pending: SlateCandidate[], riskHigh: number): Slate {
  const ids: string[] = []; const outliers: string[] = [];
  for (const a of pending) {
    if (a.status !== 'pending' || !isColdPitch(a)) continue;
    if (typeof a.riskScore === 'number' && a.riskScore >= riskHigh) outliers.push(a.id);
    else ids.push(a.id);
  }
  return { ids, outliers };
}

/** The slate is offered from two members up: one pitch is just one decision. */
export function slateOffered(slate: Slate): boolean {
  return slate.ids.length >= 2;
}

/** The one-line offer the Queue shows above the Decisions lane. */
export function slateLine(slate: Slate): string {
  const n = slate.ids.length;
  const held = slate.outliers.length;
  const base = `${n} cold pitch${n === 1 ? '' : 'es'} ready — same template, same voice. Read one, then approve the rest in one go.`;
  return held > 0 ? `${base} ${held} held out for review (flagged).` : base;
}

/** After a slate run: what to tell the operator, honestly (sent vs failed). */
export function slateResultLine(ok: number, failed: number): string {
  if (failed === 0) return `Approved and sent ${ok} pitch${ok === 1 ? '' : 'es'}.`;
  if (ok === 0) return `None sent — all ${failed} failed; they stay in the Queue. See History for the reason.`;
  return `Approved and sent ${ok}; ${failed} failed and stay in the Queue (see History).`;
}
