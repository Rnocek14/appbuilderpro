// src/lib/garvis/clients/changeRequests.ts
// PURE half of the change-request noun (app_0117, website-client vertical slice §1): the lifecycle
// graph and the small judgments around it. No I/O (changeRequests.verify.ts); the impure half is
// changeRequestsRun.ts.
//
// The lifecycle is one mainline with a single fork:
//   received → understood → scoped → [approved] → in_progress → preview_ready → deployed
//   → verified → client_notified → closed
// 'approved' participates ONLY when the request needs explicit approval — in-policy content/style
// edits ride act-with-undo, and forcing an approval hop on every request would train the operator
// to rubber-stamp, which is worse than no gate at all. 'declined' is a side exit from any
// pre-deploy state: declining is triage, not failure. After 'deployed' the change is LIVE, so the
// way out is rollback + close — a post-deploy "decline" would pretend nothing shipped.

export type ChangeRequestStatus =
  | 'received' | 'understood' | 'scoped' | 'approved' | 'in_progress' | 'preview_ready'
  | 'deployed' | 'verified' | 'client_notified' | 'closed' | 'declined';

/** The mainline in order. 'approved' sits between scoped and in_progress but is stepped over when
 *  needs_approval is false; 'declined' is a side exit, never a mainline stop. */
export const STATUS_ORDER: readonly ChangeRequestStatus[] = [
  'received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready',
  'deployed', 'verified', 'client_notified', 'closed',
];

// The states 'declined' is reachable FROM: everything strictly before 'deployed'. Kept as a set
// (not an index compare) so the rule reads as the policy it is, not as arithmetic.
const DECLINABLE = new Set<ChangeRequestStatus>([
  'received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready',
]);

/** The single legal successor on the mainline, encoding the fork: from 'scoped' the path is
 *  'approved' when approval is needed and 'in_progress' when it is not — both directions are
 *  exclusive (skipping the gate when it's required is illegal, and so is inserting a ceremonial
 *  approval when it's not). Terminal states have no successor. */
export function nextStatus(from: ChangeRequestStatus, needsApproval: boolean): ChangeRequestStatus | null {
  if (from === 'closed' || from === 'declined') return null;
  if (from === 'scoped') return needsApproval ? 'approved' : 'in_progress';
  const i = STATUS_ORDER.indexOf(from);
  return i >= 0 && i + 1 < STATUS_ORDER.length ? STATUS_ORDER[i + 1] : null;
}

/** True when `from → to` is legal. One step at a time on purpose: every hop lands in `history`,
 *  so a request's row IS its audit trail — a jump that skips states would skip the record too. */
export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus, needsApproval: boolean): boolean {
  if (from === 'closed' || from === 'declined') return false;   // terminal — history is the record
  if (to === 'declined') return DECLINABLE.has(from);           // triage exit; live work rolls back instead
  return nextStatus(from, needsApproval) === to;
}

export interface HistoryEntry {
  at: string;                          // ISO timestamp of the hop
  from: ChangeRequestStatus | null;    // null on the seed entry — birth has no prior state
  to: ChangeRequestStatus;
  note: string | null;
}

/** Hard cap on history length. 200 hops is ~20x a full lifecycle — anything past it is a runaway
 *  loop, and an unbounded jsonb column is how one bad loop bloats a row until reads hurt. */
export const HISTORY_CAP = 200;

/** Append a hop. Append-ONLY and non-mutating: callers keep their array, the row gets a new one —
 *  history is evidence, and evidence you can edit in place isn't. At the cap the OLDEST entry
 *  drops, because triage reads recent context; the seed entry is the only casualty of a runaway. */
export function appendHistory(
  history: HistoryEntry[], from: ChangeRequestStatus | null, to: ChangeRequestStatus,
  note: string | null, atIso: string,
): HistoryEntry[] {
  const next = [...history, { at: atIso, from, to, note: note ?? null }];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

/** Whole days a request has been waiting since it arrived. Floor, not round — a request is not
 *  "3 days old" until a full third day has passed; inflating age would inflate urgency. Clock
 *  skew (now before received) reads 0 rather than a nonsense negative. */
export function agingDays(receivedAtIso: string, nowIso: string): number {
  const ms = Date.parse(nowIso) - Date.parse(receivedAtIso);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/** Open = still the operator's problem. Matches the partial index in app_0117 exactly — the code
 *  and the index must agree on what "open" means or the triage queue lies. */
export function isOpen(status: ChangeRequestStatus): boolean {
  return status !== 'closed' && status !== 'declined';
}

export type ChangeRequestKind = 'publish' | 'billing' | 'destructive' | 'content' | 'style';

/** Whether a request must pass the explicit approval gate. Publishing, billing changes, and
 *  destructive operations ALWAYS do — they're irreversible or money, and no policy makes them
 *  routine. Content/style edits only need it when they fall OUTSIDE the client's established
 *  policy: in-policy edits are covered by act-with-undo (the rollback ref restores the prior
 *  state), so gating them would just be ceremony. */
export function requiresApprovalFor(request: { kind: ChangeRequestKind; outsidePolicy: boolean }): boolean {
  if (request.kind === 'publish' || request.kind === 'billing' || request.kind === 'destructive') return true;
  return request.outsidePolicy;
}
