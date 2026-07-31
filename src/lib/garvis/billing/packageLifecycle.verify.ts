// packageLifecycle.verify.ts — the pure lifecycle cores (app_0119): migration math (new outbound
// needs consent, overrides survive untouched), drift honesty (a client's "no" is an answer, not
// drift), and termination totality (nothing survives except what a retained entry names).
import {
  driftDiff, installedState, migratePlan, terminationPlan, type PackageRow,
} from './servicePackages';

let failed = 0;
let ran = 0;
const check = (name: string, pass: boolean) => {
  ran++;
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

const mk = (over: Partial<PackageRow>): PackageRow => ({
  id: 'p1', owner_id: null, key: 'website', version: 1, name: 'New Website', blurb: '', cadence: 'one_time',
  price_hint: '', definition: {}, status: 'current', ...over,
});
const withEst = (id: string, version: number, watch: boolean, actions: string[]): PackageRow =>
  mk({ id, version, definition: { establishes: { watch_site: watch, propose_automations: actions, reporting: 'monthly' } } });

// ---- migratePlan: newly-introduced correct (incl. none); overrides byte-identical; consent respected ----
const v1 = withEst('v1', 1, true, ['lead_followup']);
const v2 = withEst('v2', 2, true, ['lead_followup', 'review_request', 'recall_reminder']);
const up = migratePlan(v1, v2, { tone: 'formal' }, []);
check('upgrade: actions in to-not-in-from are newly introduced (need consent before arming)',
  JSON.stringify(up.newlyIntroducedActions) === JSON.stringify(['review_request', 'recall_reminder']));
check('same actions both sides → nothing newly introduced',
  migratePlan(v1, withEst('v1b', 2, true, ['lead_followup']), {}, []).newlyIntroducedActions.length === 0);
check('an already-CONSENTED action is not re-asked (the yes stands across versions)',
  JSON.stringify(migratePlan(v1, v2, {}, ['review_request']).newlyIntroducedActions) === JSON.stringify(['recall_reminder']));
const overrides = { tone: 'formal', send_window: { start: 9, end: 17 }, declined_actions: ['recall_reminder'] };
const mig = migratePlan(v1, v2, overrides, []);
check('overrides pass through byte-identical (client-specific deltas survive migration)',
  mig.retainedOverrides === overrides && JSON.stringify(mig.retainedOverrides) === JSON.stringify(overrides));
check('watch in both → keep', up.watchChange === 'keep');
check('watch only in target → add',
  migratePlan(withEst('a', 1, false, []), withEst('b', 2, true, []), {}, []).watchChange === 'add');
check('watch only in source → remove',
  migratePlan(withEst('a', 1, true, []), withEst('b', 2, false, []), {}, []).watchChange === 'remove');
const down = migratePlan(v2, v1, {}, []);
check('a downgrade can introduce nothing (computed the same way, direction-agnostic)',
  down.newlyIntroducedActions.length === 0 && down.watchChange === 'keep');

// ---- driftDiff: declined is NOT drift; a missing watch IS; consented + watch = resolved ----
const desired = { watchSite: true, proposeAutomations: ['lead_followup', 'review_request'], reporting: 'monthly' as const };
check('a DECLINED action is not drift — the no is respected',
  driftDiff(desired, { hasWatch: true, consented: ['lead_followup'], declined: ['review_request'] }).resolved === true);
check('missing watch = drift', (() => {
  const d = driftDiff(desired, { hasWatch: false, consented: ['lead_followup', 'review_request'], declined: [] });
  return d.missingWatch === true && d.resolved === false;
})());
check('all consented + watch running = resolved', (() => {
  const d = driftDiff(desired, { hasWatch: true, consented: ['lead_followup', 'review_request'], declined: [] });
  return d.missingWatch === false && d.unconsentedActions.length === 0 && d.resolved === true;
})());
check('an unanswered action is named as unconsented (and blocks resolved)', (() => {
  const d = driftDiff(desired, { hasWatch: true, consented: ['lead_followup'], declined: [] });
  return JSON.stringify(d.unconsentedActions) === JSON.stringify(['review_request']) && d.resolved === false;
})());
check('no watch desired → an absent watch is not drift',
  driftDiff({ watchSite: false, proposeAutomations: [], reporting: null }, { hasWatch: false, consented: [], declined: [] }).resolved === true);

// ---- installedState: normalization keeps the record consistent ----
const st = installedState({
  hasWatch: true,
  consented: [' lead_followup ', 'lead_followup', 'review_request'],
  declined: ['review_request', 'recall_reminder'],       // review_request also consented → consent supersedes
  proposedPending: ['lead_followup', 'recall_reminder', 'win_back', ''],
});
check('installedState trims + dedupes consents', JSON.stringify(st.consented) === JSON.stringify(['lead_followup', 'review_request']));
check('an evidence-backed consent supersedes an earlier decline', JSON.stringify(st.declined) === JSON.stringify(['recall_reminder']));
check('an answered proposal (yes or no) is no longer pending; blanks dropped',
  JSON.stringify(st.proposedPending) === JSON.stringify(['win_back']));

// ---- terminationPlan: nothing survives except what a retained entry names ----
const active = {
  watches: [{ id: 'w1', label: 'Client site: Riverside Dental' }, { id: 'w2', label: 'Client site: staging' }],
  triggers: [{ id: 't1', label: 'Review requests' }, { id: 't2', label: 'Recall reminders' }],
  openRequests: 2,
  undeliveredReports: 1,
};
const all = terminationPlan(active, []);
check('empty retained stops EVERYTHING (watches and triggers alike)',
  JSON.stringify(all.stopWatches) === JSON.stringify(['w1', 'w2']) && JSON.stringify(all.pauseTriggers) === JSON.stringify(['t1', 't2']));
const keep = terminationPlan(active, [{ service: 'Client site: Riverside Dental', reason: '30-day wind-down hosting', until: '2026-08-25' }]);
check('a retained entry (by exact label) keeps exactly its service and NOTHING else',
  JSON.stringify(keep.stopWatches) === JSON.stringify(['w2']) && JSON.stringify(keep.pauseTriggers) === JSON.stringify(['t1', 't2']));
const keepById = terminationPlan(active, [{ service: 't2', reason: 'contractual recall obligation' }]);
check('a retained entry by id keeps exactly that trigger',
  JSON.stringify(keepById.pauseTriggers) === JSON.stringify(['t1']) && JSON.stringify(keepById.stopWatches) === JSON.stringify(['w1', 'w2']));
check('ids partition exactly: every active id is either stopped or retained-covered, never both, never dropped', (() => {
  const stopped = new Set([...keep.stopWatches, ...keep.pauseTriggers]);
  const allIds = [...active.watches, ...active.triggers].map((x) => x.id);
  const kept = allIds.filter((id) => !stopped.has(id));
  return allIds.every((id) => stopped.has(id) !== kept.includes(id)) && JSON.stringify(kept) === JSON.stringify(['w1']);
})());
check('blockers NAME the open requests and undelivered reports as things to resolve or carry',
  all.blockers.length === 2
  && all.blockers[0].includes('2 open change requests')
  && all.blockers[1].includes('1 undelivered report')
  && all.blockers.every((b) => /resolve|deliver/.test(b) && b.includes('carry')));
check('nothing open → no blockers',
  terminationPlan({ ...active, openRequests: 0, undeliveredReports: 0 }, []).blockers.length === 0);
check('retainedSummary carries service, reason, and until',
  keep.retainedSummary.length === 1
  && keep.retainedSummary[0].includes('Client site: Riverside Dental')
  && keep.retainedSummary[0].includes('30-day wind-down hosting')
  && keep.retainedSummary[0].includes('until 2026-08-25'));
check('a blank retained entry covers nothing (an empty name never keeps the fleet alive)', (() => {
  const p = terminationPlan(active, [{ service: '  ', reason: 'oops' }]);
  return p.stopWatches.length === 2 && p.pauseTriggers.length === 2 && p.retainedSummary.length === 0;
})());

console.log(`\npackageLifecycle.verify: ${ran - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} package-lifecycle check(s) failed`);
