// changeRequests.verify.ts — the pure half of the change-request noun (app_0117): the lifecycle
// graph on BOTH approval paths, the declined side-exit, append-only capped history, aging, open
// classification, and the requiresApprovalFor truth table.
import {
  agingDays, appendHistory, canTransition, isOpen, requiresApprovalFor, HISTORY_CAP,
  type ChangeRequestStatus, type HistoryEntry,
} from './changeRequests';

let total = 0;
let failed = 0;
const check = (name: string, pass: boolean) => {
  total++;
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

// ---- the mainline without approval: 'approved' is SKIPPED, every hop legal ----
const noApprovalPath: ChangeRequestStatus[] = [
  'received', 'understood', 'scoped', 'in_progress', 'preview_ready',
  'deployed', 'verified', 'client_notified', 'closed',
];
for (let i = 0; i + 1 < noApprovalPath.length; i++) {
  check(`${noApprovalPath[i]} → ${noApprovalPath[i + 1]} (needsApproval=false)`,
    canTransition(noApprovalPath[i], noApprovalPath[i + 1], false));
}

// ---- the mainline WITH approval: 'approved' is REQUIRED between scoped and in_progress ----
const approvalPath: ChangeRequestStatus[] = [
  'received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready',
  'deployed', 'verified', 'client_notified', 'closed',
];
for (let i = 0; i + 1 < approvalPath.length; i++) {
  check(`${approvalPath[i]} → ${approvalPath[i + 1]} (needsApproval=true)`,
    canTransition(approvalPath[i], approvalPath[i + 1], true));
}

// ---- the fork is exclusive in both directions ----
check('scoped → in_progress is BLOCKED when approval is needed (no skipping the gate)',
  !canTransition('scoped', 'in_progress', true));
check('scoped → approved is BLOCKED when approval is not needed (the skip is mandatory, not optional)',
  !canTransition('scoped', 'approved', false));

// ---- illegal jumps ----
check('received → deployed fails (no skipping the middle)', !canTransition('received', 'deployed', false) && !canTransition('received', 'deployed', true));
check('received → scoped fails (understood is not optional)', !canTransition('received', 'scoped', false));
check('understood → received fails (no going backwards)', !canTransition('understood', 'received', false));
const everyStatus: ChangeRequestStatus[] = [
  'received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready',
  'deployed', 'verified', 'client_notified', 'closed', 'declined',
];
check('closed → anything fails (terminal)',
  everyStatus.every((s) => !canTransition('closed', s, false) && !canTransition('closed', s, true)));
check('declined → anything fails (terminal)',
  everyStatus.every((s) => !canTransition('declined', s, false) && !canTransition('declined', s, true)));

// ---- declined: a triage exit from every pre-deploy state, never after deploy ----
const preDeploy: ChangeRequestStatus[] = ['received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready'];
for (const s of preDeploy) {
  check(`${s} → declined is legal (pre-deploy triage)`, canTransition(s, 'declined', true) && canTransition(s, 'declined', false));
}
const postDeploy: ChangeRequestStatus[] = ['deployed', 'verified', 'client_notified'];
for (const s of postDeploy) {
  check(`${s} → declined fails (live work rolls back; it is not declined)`, !canTransition(s, 'declined', false));
}

// ---- history: append-only, returns a new array, capped at 200 dropping the oldest ----
const h0: HistoryEntry[] = [];
const h1 = appendHistory(h0, null, 'received', 'intake', '2026-07-25T00:00:00Z');
check('append returns a NEW array and leaves the original untouched', h1 !== h0 && h0.length === 0 && h1.length === 1);
check('the entry carries at/from/to/note (from:null on the seed)',
  h1[0].at === '2026-07-25T00:00:00Z' && h1[0].from === null && h1[0].to === 'received' && h1[0].note === 'intake');
const h2 = appendHistory(h1, 'received', 'understood', null, '2026-07-25T01:00:00Z');
check('append preserves earlier entries in order; a missing note stores null',
  h2.length === 2 && h2[0].to === 'received' && h2[1].to === 'understood' && h2[1].note === null && h1.length === 1);
let big: HistoryEntry[] = [];
for (let i = 0; i < HISTORY_CAP; i++) big = appendHistory(big, 'received', 'understood', `n${i}`, 'iso');
check(`history holds exactly ${HISTORY_CAP} entries at the cap`, big.length === HISTORY_CAP && big[0].note === 'n0');
const over = appendHistory(big, 'understood', 'scoped', 'newest', 'iso');
check('the entry past the cap drops the OLDEST and keeps the newest',
  over.length === HISTORY_CAP && over[0].note === 'n1' && over[over.length - 1].note === 'newest');

// ---- agingDays: floored whole days, never negative ----
check('same instant → 0 days', agingDays('2026-07-25T12:00:00Z', '2026-07-25T12:00:00Z') === 0);
check('2.5 days → 2 (floor: not "3 days old" until it is)', agingDays('2026-07-22T00:00:00Z', '2026-07-24T12:00:00Z') === 2);
check('7 days → 7', agingDays('2026-07-18T00:00:00Z', '2026-07-25T00:00:00Z') === 7);
check('clock skew (now before received) reads 0, never negative', agingDays('2026-07-25T00:00:00Z', '2026-07-24T00:00:00Z') === 0);

// ---- isOpen mirrors the app_0117 partial index ----
check('every non-terminal status is open',
  (['received', 'understood', 'scoped', 'approved', 'in_progress', 'preview_ready', 'deployed', 'verified', 'client_notified'] as ChangeRequestStatus[])
    .every(isOpen));
check('closed and declined are not open', !isOpen('closed') && !isOpen('declined'));

// ---- requiresApprovalFor: the truth table ----
for (const kind of ['publish', 'billing', 'destructive'] as const) {
  check(`${kind} always needs approval, even in-policy`,
    requiresApprovalFor({ kind, outsidePolicy: false }) && requiresApprovalFor({ kind, outsidePolicy: true }));
}
check('content in-policy → no approval (act-with-undo covers it)', !requiresApprovalFor({ kind: 'content', outsidePolicy: false }));
check('content outside policy → approval', requiresApprovalFor({ kind: 'content', outsidePolicy: true }));
check('style in-policy → no approval', !requiresApprovalFor({ kind: 'style', outsidePolicy: false }));
check('style outside policy → approval', requiresApprovalFor({ kind: 'style', outsidePolicy: true }));

console.log(`\nchangeRequests.verify: ${total - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} change-request check(s) failed`);
