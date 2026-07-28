// lifecycleProof.verify.ts — THE VERTICAL SLICE, end to end, across component boundaries.
// fleetView.verify proves the fleet surfaces the right exceptions; changeRequests/clientReport/
// packageLifecycle each prove their own core. This suite proves they COMPOSE: one client's
// incident travels request → deploy → verified → closed, shows up correctly in the fleet while
// open and disappears when closed, is reported accurately in the month it happened, and the
// client's termination stops exactly its own work and nothing of anyone else's.
import { canTransition, appendHistory, isOpen, requiresApprovalFor, type ChangeRequestStatus } from './changeRequests';
import { compileClientReport, type ReportSources, type ReportPeriod } from './clientReport';
import { buildFleetView, type FleetSnapshots } from '../fleetView';
import { terminationPlan, driftDiff } from '../billing/servicePackages';

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

const NOW = '2026-07-20T09:00:00.000Z';
const PERIOD: ReportPeriod = { start: '2026-06-01', end: '2026-06-30' };

// ============================================================================================
// ACT I — a client change request travels the whole road
// ============================================================================================
{
  // "Can you add a gift-card page?" — content work, inside the client's established policy, so
  // act-with-undo covers it; publishing it is what needs the gate.
  const needsApproval = requiresApprovalFor({ kind: 'content', outsidePolicy: false });
  check('an in-policy content change does not demand an approval to BEGIN', needsApproval === false);
  check('publishing that same change DOES demand approval', requiresApprovalFor({ kind: 'publish', outsidePolicy: false }));

  const road: ChangeRequestStatus[] = [
    'received', 'understood', 'scoped', 'in_progress', 'preview_ready',
    'deployed', 'verified', 'client_notified', 'closed',
  ];
  let history: ReturnType<typeof appendHistory> = [];
  let legal = true;
  for (let i = 0; i < road.length - 1; i++) {
    if (!canTransition(road[i], road[i + 1], needsApproval)) legal = false;
    history = appendHistory(history, road[i], road[i + 1], `step ${i}`, NOW);
  }
  check('the full request road is legal end to end (no-approval path)', legal);
  check('every step is recorded in history', history.length === road.length - 1);
  check('the request is open until it closes', isOpen('preview_ready') && isOpen('deployed') && !isOpen('closed'));
  check('a deployed request can no longer be declined (the work is out there)', !canTransition('deployed', 'declined', false));
}

// ============================================================================================
// ACT II — while it is open the fleet sees it; when it closes the fleet goes quiet
// ============================================================================================
const baseClient = {
  worldId: 'w-bakery', name: "Jane's Bakery", pinStatus: 'active' as const,
  packageKey: 'website_automation', packageVersion: 1,
  desiredEstablishes: { watch_site: true, propose_automations: ['lead_followup'], reporting: 'monthly' as const },
  hasWatch: true, consentedActions: ['lead_followup'], declinedActions: [] as string[],
};
const quietSnap: FleetSnapshots = {
  nowIso: NOW, clients: [baseClient], triggers: [], watches: [],
  changeRequests: [], reports: [{ worldId: 'w-bakery', periodEnd: '2026-06-30', deliveryState: 'sent', approvalState: 'approved', generatedAt: '2026-07-02T09:00:00.000Z' }],
  usageByWorld: [],
};
const withAgingCr = buildFleetView({
  ...quietSnap,
  changeRequests: [{ worldId: 'w-bakery', status: 'scoped', priority: 'normal', receivedAt: '2026-07-05T09:00:00.000Z' }],   // 15 days old
});
const afterClose = buildFleetView(quietSnap);   // the request closed → no longer an open row at all
check('an aging open request raises a fleet exception', withAgingCr.exceptions.some((e) => e.kind === 'cr_aging'));
check('closing the request removes it from the fleet entirely', !afterClose.exceptions.some((e) => e.kind === 'cr_aging'));
check('a fully-served client with everything answered is silent', afterClose.exceptions.length === 0);

// ============================================================================================
// ACT III — the month's report reflects what actually happened, in the client's own numbers
// ============================================================================================
const sources: ReportSources = {
  watchRuns: [
    ...Array.from({ length: 10 }, (_, i) => ({ at: `2026-06-${String(i + 1).padStart(2, '0')}T06:00:00.000Z`, ok: true, note: 'no change' })),
    { at: '2026-06-13T06:00:00.000Z', ok: false, note: 'HTTP 503 from https://janesbakery.example.com' },
    ...Array.from({ length: 10 }, (_, i) => ({ at: `2026-06-${String(i + 14).padStart(2, '0')}T06:00:00.000Z`, ok: true, note: 'no change' })),
  ],
  changeRequests: [
    { status: 'closed', request: 'Add a gift-card page', receivedAt: '2026-06-20T10:00:00.000Z', closedAt: '2026-06-24T15:00:00.000Z' },
  ],
  triggerFires: [{ at: '2026-06-18T09:00:00.000Z', label: 'Lead follow-up', approvalId: 'ap-1' }],
  breakerEvents: [{ label: 'Lead follow-up', error: 'provider timeout', at: '2026-06-18T09:05:00.000Z', recovered: true }],
  outreach: [], usage: [{ kind: 'garvis', costUsd: 0.31, at: '2026-06-18T09:00:00.000Z' }], leads: [],
};
const report = compileClientReport(sources, PERIOD, { businessName: "Jane's Bakery" });
check('the report tells the truth about the incident that happened', /503|incident|down/i.test(report.bodyMd));
check('the report names the change that was completed', /gift-card page/i.test(report.bodyMd));
check('the recovered automation failure is reported as recovered, not hidden', /recover/i.test(report.bodyMd));
check('the report attributes only this client\'s cost', /0\.31/.test(report.bodyMd));
check('sources genuinely absent are listed as unknowns, not zeroed',
  report.unknowns.length === 0 || report.unknowns.every((u) => u.reason.length > 10));

// The same month for a client with NOTHING measured must not borrow anyone's numbers.
const emptyReport = compileClientReport(
  { watchRuns: null, changeRequests: null, triggerFires: null, breakerEvents: null, outreach: null, usage: null, leads: null },
  PERIOD, { businessName: 'Silent Co' },
);
check('a client with no records gets unknowns, never another client\'s figures',
  emptyReport.unknowns.length === 7 && !/0\.31|gift-card|503/.test(emptyReport.bodyMd));

// ============================================================================================
// ACT IV — termination stops this client's work and touches no one else's
// ============================================================================================
{
  const plan = terminationPlan({
    watches: [{ id: 'w1', label: 'Client site: Jane\'s Bakery' }],
    triggers: [{ id: 't1', label: 'Bakery lead follow-up' }],
    openRequests: 1, undeliveredReports: 1,
  }, []);
  check('termination stops every watch and trigger when nothing is retained',
    plan.stopWatches.length === 1 && plan.pauseTriggers.length === 1);
  check('open work is named as a blocker, not silently dropped', plan.blockers.length === 2);

  const retained = terminationPlan({
    watches: [{ id: 'w1', label: 'Client site: Jane\'s Bakery' }],
    triggers: [{ id: 't1', label: 'Bakery lead follow-up' }],
    openRequests: 0, undeliveredReports: 0,
  }, [{ service: 'w1', reason: 'They pay for hosting through August', until: '2026-08-31' }]);
  check('an explicit retention keeps exactly its own item running', retained.stopWatches.length === 0 && retained.pauseTriggers.length === 1);
  check('the retention is stated back honestly', retained.retainedSummary.length === 1);
}

// ============================================================================================
// ACT V — ISOLATION: nothing about one client can appear in another's surfaces
// ============================================================================================
{
  const twoClients: FleetSnapshots = {
    nowIso: NOW,
    clients: [
      baseClient,
      { ...baseClient, worldId: 'w-dental', name: 'Riverside Dental' },
    ],
    triggers: [{ worldId: 'w-bakery', label: 'Bakery lead follow-up', status: 'paused', consecutiveFailures: 5, lastError: 'boom', lastErrorAt: NOW, action: 'lead_followup' }],
    watches: [{ worldId: 'w-bakery', label: 'Client site: Jane\'s Bakery', status: 'active', lastResult: { status: 'unreachable', line: 'HTTP 500' }, lastRunAt: NOW }],
    changeRequests: [{ worldId: 'w-bakery', status: 'scoped', priority: 'urgent', receivedAt: '2026-07-01T09:00:00.000Z' }],
    reports: [], usageByWorld: [{ worldId: 'w-bakery', costUsd30d: 90 }, { worldId: 'w-dental', costUsd30d: 5 }],
  };
  const view = buildFleetView(twoClients);
  const dental = view.exceptions.filter((e) => e.worldId === 'w-dental');
  const bakery = view.exceptions.filter((e) => e.worldId === 'w-bakery');
  check('the troubled client raises its own exceptions', bakery.length >= 3);
  check('the healthy neighbour raises NONE of them', dental.every((e) => e.kind === 'report_due'));
  check('no exception ever names the wrong client',
    view.exceptions.every((e) => (e.worldId === 'w-bakery') === (e.clientName === "Jane's Bakery")));
  check('one client\'s error text never appears under another client',
    !view.exceptions.some((e) => e.clientName === 'Riverside Dental' && /boom|HTTP 500/.test(e.summary + e.evidence.join(' '))));

  // Drift is computed per client from that client's own answers — never pooled.
  const bakeryDrift = driftDiff({ watchSite: true, proposeAutomations: ['lead_followup'], reporting: null },
    { hasWatch: true, consented: ['lead_followup'], declined: [] });
  const dentalDrift = driftDiff({ watchSite: true, proposeAutomations: ['lead_followup'], reporting: null },
    { hasWatch: false, consented: [], declined: [] });
  check('one client being fully installed does not mark another as installed',
    bakeryDrift.resolved && !dentalDrift.resolved && dentalDrift.missingWatch);
}

console.log(`\nlifecycleProof.verify: ${22 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} lifecycle-proof check(s) failed`);
