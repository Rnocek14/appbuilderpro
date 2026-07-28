// fleetView.verify.ts — the fleet core, and THE PROOF SCENARIO of the website-client vertical
// slice. The three fixture clients are the scenario the slice was asked to demonstrate:
//   1. Riverside Dental  — completely healthy; routine work stays quiet (ZERO exceptions).
//   2. Jane's Bakery     — a website incident + an automation retrying (not yet broken).
//   3. Marco's Barbershop— a breaker-paused automation, an aging change request, unusual cost.
// The assertions below ARE the proof: the fleet surfaces only meaningful exceptions, every
// exception carries row-derived evidence, and a healthy client is invisible except as a count.
import {
  buildFleetView, BREAKER_THRESHOLD, CR_ACT_DAYS, COST_OUTLIER_FLOOR_USD,
  type FleetSnapshots, type FleetException,
} from './fleetView';

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

const NOW = '2026-07-20T09:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86400_000).toISOString();

const establishes = (watch: boolean, actions: string[], reporting: 'monthly' | null) =>
  ({ watch_site: watch, propose_automations: actions, reporting });

// ---------------------------------------------------------------------------
// THE PROOF FIXTURE — three clients, one operator morning
// ---------------------------------------------------------------------------
const PROOF: FleetSnapshots = {
  nowIso: NOW,
  clients: [
    { // 1. HEALTHY — everything the package promised is installed and answered
      worldId: 'w-dental', name: 'Riverside Dental', pinStatus: 'active',
      packageKey: 'website_automation', packageVersion: 1,
      desiredEstablishes: establishes(true, ['lead_followup', 'review_request'], 'monthly'),
      hasWatch: true, consentedActions: ['lead_followup', 'review_request'],
    },
    { // 2. INCIDENT — site returning an error, one automation retrying
      worldId: 'w-bakery', name: "Jane's Bakery", pinStatus: 'active',
      packageKey: 'website_automation', packageVersion: 1,
      desiredEstablishes: establishes(true, ['lead_followup'], null),
      hasWatch: true, consentedActions: ['lead_followup'],
    },
    { // 3. BROKEN — breaker paused, request aging, cost out of line
      worldId: 'w-barber', name: "Marco's Barbershop", pinStatus: 'active',
      packageKey: 'website_automation', packageVersion: 1,
      desiredEstablishes: establishes(true, ['recall_reminder'], null),
      hasWatch: true, consentedActions: ['recall_reminder'],
    },
  ],
  triggers: [
    { worldId: 'w-dental', label: 'Dental recall', status: 'active', consecutiveFailures: 0, lastError: null, lastErrorAt: null, action: 'lead_followup' },
    { worldId: 'w-bakery', label: 'Bakery lead follow-up', status: 'active', consecutiveFailures: 2, lastError: 'provider timeout', lastErrorAt: daysAgo(0), action: 'lead_followup' },
    { worldId: 'w-barber', label: 'Barber recall texts', status: 'paused', consecutiveFailures: BREAKER_THRESHOLD, lastError: 'approval insert failed: invalid input value for enum approval_kind', lastErrorAt: daysAgo(1), action: 'recall_reminder' },
  ],
  watches: [
    { worldId: 'w-dental', label: 'Client site: Riverside Dental', status: 'active', lastResult: { status: 'unchanged', line: 'no change' }, lastRunAt: daysAgo(0) },
    { worldId: 'w-bakery', label: 'Client site: Jane\'s Bakery', status: 'active', lastResult: { status: 'unreachable', line: 'HTTP 503 from https://janesbakery.example.com' }, lastRunAt: daysAgo(0) },
    { worldId: 'w-barber', label: 'Client site: Marco\'s Barbershop', status: 'active', lastResult: { status: 'unchanged', line: 'no change' }, lastRunAt: daysAgo(0) },
  ],
  changeRequests: [
    { worldId: 'w-dental', status: 'closed', priority: 'normal', receivedAt: daysAgo(20) },
    { worldId: 'w-barber', status: 'scoped', priority: 'normal', receivedAt: daysAgo(12) },   // aging past CR_ACT_DAYS
  ],
  reports: [
    { worldId: 'w-dental', periodEnd: '2026-06-30', deliveryState: 'sent', approvalState: 'approved', generatedAt: '2026-07-02T09:00:00.000Z' },
  ],
  usageByWorld: [
    { worldId: 'w-dental', costUsd30d: 4 },
    { worldId: 'w-bakery', costUsd30d: 6 },
    { worldId: 'w-barber', costUsd30d: 48 },   // 8× the median of nonzero costs, and well over the floor
  ],
};

const result = buildFleetView(PROOF);
const of = (worldId: string) => result.exceptions.filter((e) => e.worldId === worldId);
const kinds = (worldId: string) => of(worldId).map((e) => e.kind).sort();
const has = (worldId: string, kind: string) => of(worldId).some((e) => e.kind === kind);
const one = (worldId: string, kind: string): FleetException | undefined => of(worldId).find((e) => e.kind === kind);

// ---- 1. THE HEALTHY CLIENT IS INVISIBLE (the whole point of exception-based attention) ----
check('healthy client raises ZERO exceptions', of('w-dental').length === 0);
check('healthy client never appears in the exception list by name',
  !result.exceptions.some((e) => e.clientName === 'Riverside Dental'));
check('healthy work is reported as counts only', result.hidden.length > 0 && result.hidden.every((h) => h.count > 0));

// ---- 2. THE INCIDENT CLIENT: site down (act) + automation retrying (watch, named as retrying) ----
check('incident client surfaces site_down', has('w-bakery', 'site_down'));
check('site_down is act-severity', one('w-bakery', 'site_down')?.severity === 'act');
check('site_down summary carries the real HTTP status', /503/.test(one('w-bakery', 'site_down')?.summary ?? ''));
check('incident client surfaces the failing automation', has('w-bakery', 'automation_failing'));
check('a retrying automation is WATCH, not act', one('w-bakery', 'automation_failing')?.severity === 'watch');
check('the retry state is named honestly in the summary',
  /retr/i.test(one('w-bakery', 'automation_failing')?.summary ?? ''));
check('the failing automation cites its real failure count',
  /2/.test(one('w-bakery', 'automation_failing')?.summary ?? '') || (one('w-bakery', 'automation_failing')?.evidence ?? []).some((e) => /2/.test(e)));
check('incident client raises exactly those two exceptions', kinds('w-bakery').join(',') === 'automation_failing,site_down');

// ---- 3. THE BROKEN CLIENT: breaker + aging request + cost outlier ----
check('broken client surfaces breaker_paused', has('w-barber', 'breaker_paused'));
check('breaker_paused is act-severity', one('w-barber', 'breaker_paused')?.severity === 'act');
check('breaker summary carries the real last error',
  /enum approval_kind|approval insert/.test(one('w-barber', 'breaker_paused')?.summary ?? '')
  || (one('w-barber', 'breaker_paused')?.evidence ?? []).some((e) => /approval/.test(e)));
check('broken client surfaces the aging change request', has('w-barber', 'cr_aging'));
check(`a request older than ${CR_ACT_DAYS} days demands action`, one('w-barber', 'cr_aging')?.severity === 'act');
check('the aging summary states the real age', /12/.test(one('w-barber', 'cr_aging')?.summary ?? ''));
check('broken client surfaces the cost outlier', has('w-barber', 'cost_outlier'));
check('cost outlier states both numbers (the cost and what it is out of line with)',
  /48/.test(one('w-barber', 'cost_outlier')?.summary ?? '') && /\d/.test((one('w-barber', 'cost_outlier')?.evidence ?? []).join(' ')));

// ---- 4. UNIVERSAL CONTRACTS ----
check('every exception carries row-derived evidence', result.exceptions.every((e) => e.evidence.length > 0));
check('every exception names its client', result.exceptions.every((e) => e.clientName.trim().length > 0));
check('act-severity exceptions sort before watch-severity',
  (() => {
    const firstWatch = result.exceptions.findIndex((e) => e.severity === 'watch');
    const lastAct = result.exceptions.map((e) => e.severity).lastIndexOf('act');
    return firstWatch === -1 || lastAct === -1 || lastAct < firstWatch;
  })());
check('the healthy client is counted in hidden, not listed',
  result.hidden.some((h) => h.count >= 1));

// ---- 5. COST OUTLIER RESTRAINT: trivial sums are never flagged ----
const trivial = buildFleetView({
  ...PROOF,
  usageByWorld: [
    { worldId: 'w-dental', costUsd30d: 0.10 },
    { worldId: 'w-bakery', costUsd30d: 0.20 },
    { worldId: 'w-barber', costUsd30d: 3.00 },   // 15× the median but under the $5 floor
  ],
});
check(`a 15x ratio under the $${COST_OUTLIER_FLOOR_USD} floor is NOT flagged`,
  !trivial.exceptions.some((e) => e.kind === 'cost_outlier'));

// ---- 6. DRIFT + CONSENT: the package promises something that isn't installed / isn't answered ----
const DRIFT_SNAP: FleetSnapshots = {
  ...PROOF,
  clients: [{
    worldId: 'w-drift', name: 'Drifting Co', pinStatus: 'active',
    packageKey: 'website_automation', packageVersion: 1,
    desiredEstablishes: establishes(true, ['lead_followup', 'review_request'], null),
    hasWatch: false,                       // promised a watch, none running → drift
    consentedActions: ['lead_followup'],   // review_request unanswered → drift
    declinedActions: [],
  }],
  triggers: [], watches: [], changeRequests: [], reports: [], usageByWorld: [],
};
const drifting = buildFleetView(DRIFT_SNAP);
check('a promised-but-missing watch is drift', drifting.exceptions.some((e) => e.kind === 'drift' && /watch/i.test(e.summary)));
check('an unanswered proposed action is drift', drifting.exceptions.some((e) => e.kind === 'drift' && /review_request/.test(e.summary + e.evidence.join(' '))));

// A recorded "no" is an ANSWER, never drift to be re-fixed (the lifecycle core's invariant, held here).
const declined = buildFleetView({
  ...DRIFT_SNAP,
  clients: [{ ...DRIFT_SNAP.clients[0], hasWatch: true, consentedActions: [], declinedActions: ['lead_followup', 'review_request'] }],
});
check('a DECLINED action is never reported as drift', !declined.exceptions.some((e) => e.kind === 'drift'));

// An ACTIVE trigger whose action has no consent row is a consent gap, surfaced honestly.
const unconsented = buildFleetView({
  ...PROOF,
  clients: [{ ...PROOF.clients[0], worldId: 'w-nc', name: 'No Consent Co', consentedActions: [], declinedActions: [] }],
  triggers: [{ worldId: 'w-nc', label: 'Recall texts', status: 'active', consecutiveFailures: 0, lastError: null, lastErrorAt: null, action: 'recall_reminder' }],
  watches: [], changeRequests: [], reports: [], usageByWorld: [],
});
check('an active trigger without recorded consent surfaces consent_missing',
  unconsented.exceptions.some((e) => e.kind === 'consent_missing'));

// ---- 7. ISOLATION: one client's trouble never lands on another's row ----
check('no exception is attributed to a world it did not come from',
  result.exceptions.every((e) =>
    (e.worldId === 'w-bakery' && e.clientName === "Jane's Bakery")
    || (e.worldId === 'w-barber' && e.clientName === "Marco's Barbershop")
    || e.worldId === null));
check('the broken client\'s failures never appear under the healthy client',
  !result.exceptions.some((e) => e.clientName === 'Riverside Dental'));

console.log(`\nfleetView.verify: ${28 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} fleet-view check(s) failed`);
