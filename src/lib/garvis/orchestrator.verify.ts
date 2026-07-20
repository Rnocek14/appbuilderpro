// src/lib/garvis/orchestrator.verify.ts
// Verifies the Orchestrator's pure core (run: `npm run verify:orchestrator`). Pure asserts, no DB.
// The parse gauntlet is the trust boundary between the model's proposal and real execution —
// every drop/coerce rule is proven here.

import { parsePlan, orderSteps, catalogContext, stepSucceeded, derivePlanStatus, planProgress, WaitingError, MAX_STEPS, type ActionSpec, type StepStatus } from './orchestrator';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const SPECS: ActionSpec[] = [
  { id: 'found_company', title: 'Found a company', category: 'company', risk: 'spend', description: 'd', params: [{ name: 'intent', required: true, hint: 'h' }], produces: 'draft' },
  { id: 'business_plan', title: 'Write the business plan', category: 'planning', risk: 'spend', description: 'd', params: [{ name: 'world', required: true, hint: 'h' }], produces: 'plan' },
  { id: 'watch_page', title: 'Watch a page', category: 'automation', risk: 'safe', description: 'd', params: [{ name: 'url', required: true, hint: 'h' }, { name: 'label', required: true, hint: 'h' }, { name: 'cadence', required: false, hint: 'h' }], produces: 'order' },
];

// ---- happy path ----
const good = parsePlan(JSON.stringify({
  title: 'Launch the agency',
  summary: 'Found the company, then plan it.',
  steps: [
    { action: 'found_company', params: { intent: 'marketing agency for home services' }, why: 'The venture does not exist yet in the system.', after: [] },
    { action: 'business_plan', params: { world: 'Home Service Agency' }, why: 'A persisted plan grounds every later campaign.', after: [0] },
  ],
  holes: ['DocuSign paperwork automation'],
  questions: [],
}), SPECS);
check('valid plan parses', !!good.plan && good.problems.length === 0);
check('steps survive with params and deps', good.plan!.steps.length === 2 && good.plan!.steps[1].after[0] === 0);
check('holes are preserved verbatim', good.plan!.holes[0] === 'DocuSign paperwork automation');

// ---- the gauntlet ----
const gauntlet = parsePlan(JSON.stringify({
  title: 'x', summary: 's',
  steps: [
    { action: 'invented_action', params: {}, why: 'This action does not exist anywhere.', after: [] },        // unknown → dropped
    { action: 'found_company', params: { intent: 'agency' }, why: 'short', after: [] },                        // why too thin → dropped
    { action: 'watch_page', params: { url: 'https://a.gov/rfps', label: 'RFPs', bogus: 'x' }, why: 'Watch the grant board for changes.', after: [9] }, // unknown param stripped, never-existed after cleaned
    { action: 'business_plan', params: {}, why: 'A plan would ground the work here.', after: [] },             // missing required → dropped to questions
    { action: 'watch_page', params: { url: 'https://b.gov/rfps', label: 'More' }, why: 'Watch the second board too.', after: [0] }, // depends on the DROPPED step 0 → cascade-dropped
  ],
  holes: [], questions: [],
}), SPECS);
check('unknown action is dropped with a warning', gauntlet.plan!.steps.every((s) => s.action !== 'invented_action') && gauntlet.warnings.some((w) => w.includes('invented_action')));
check('why-less step is dropped', gauntlet.plan!.steps.every((s) => s.action !== 'found_company'));
check('unknown param is stripped', !('bogus' in gauntlet.plan!.steps[0].params));
check('never-existed after reference is cleaned', gauntlet.plan!.steps[0].after.length === 0);
check('missing required param demotes to a question', gauntlet.plan!.steps.every((s) => s.action !== 'business_plan') && gauntlet.plan!.questions.some((q) => q.includes('Write the business plan')));
check('a step depending on a dropped step is cascade-dropped, never run without its prerequisite',
  gauntlet.plan!.steps.length === 1 && gauntlet.warnings.some((w) => w.includes('depended on a step that was dropped')));

// ---- fences + failure modes ----
const fenced = parsePlan('```json\n' + JSON.stringify({ title: 't', summary: 's', steps: [], holes: ['h'], questions: [] }) + '\n```', SPECS);
check('markdown fences are stripped', !!fenced.plan);
check('unparseable output is a problem, not a crash', parsePlan('not json at all', SPECS).plan === null);
check('empty plan with no holes/questions is rejected', parsePlan(JSON.stringify({ title: 't', summary: 's', steps: [], holes: [], questions: [] }), SPECS).plan === null);
const overflow = parsePlan(JSON.stringify({
  title: 't', summary: 's',
  steps: Array.from({ length: MAX_STEPS + 4 }, () => ({ action: 'watch_page', params: { url: 'https://a.b', label: 'w' }, why: 'Watch this page for changes.', after: [] })),
  holes: [], questions: [],
}), SPECS);
check(`step count is capped at ${MAX_STEPS}`, overflow.plan!.steps.length === MAX_STEPS && overflow.warnings.some((w) => w.includes('trimmed')));

// ---- ordering ----
const topo = orderSteps([
  { action: 'a', params: {}, why: 'w', after: [2] },
  { action: 'b', params: {}, why: 'w', after: [] },
  { action: 'c', params: {}, why: 'w', after: [1] },
]);
check('topological order respects dependencies', topo.order.indexOf(1) < topo.order.indexOf(2) && topo.order.indexOf(2) < topo.order.indexOf(0) && !topo.cycleWarning);
const cyc = orderSteps([
  { action: 'a', params: {}, why: 'w', after: [1] },
  { action: 'b', params: {}, why: 'w', after: [0] },
]);
check('a cycle falls back to array order with a warning', cyc.cycleWarning && cyc.order.join(',') === '0,1');

// ---- catalog rendering + status vocabulary ----
const ctx = catalogContext(SPECS);
check('catalog lists every action id', SPECS.every((s) => ctx.includes(s.id)));
check('catalog spells out required params', ctx.includes('url (required)'));
check('stepSucceeded treats review/handoff as success', stepSucceeded('done') && stepSucceeded('needs_review') && stepSucceeded('handoff') && !stepSucceeded('failed') && !stepSucceeded('skipped'));

// ---- the project loop's status algebra ----
const st = (kinds: StepStatus['kind'][]): StepStatus[] => kinds.map((kind) => ({ kind, note: '' }));
check('any waiting step parks the whole arc as waiting', derivePlanStatus(st(['done', 'waiting', 'pending'])) === 'waiting');
check('all succeeded (incl. review/handoff) is done', derivePlanStatus(st(['done', 'needs_review', 'handoff'])) === 'done');
check('a terminal failure with nothing waiting is failed', derivePlanStatus(st(['done', 'failed', 'skipped'])) === 'failed');
check('waiting outranks failure (resume may unblock the rest)', derivePlanStatus(st(['failed', 'waiting'])) === 'waiting');
check('pending work with no blockers is still running', derivePlanStatus(st(['done', 'pending'])) === 'running');

// ---- structured waiting (the wake sweep's contract) ----
check('WaitingError defaults to an un-wakeable other blocker', new WaitingError('x').waitingOn.kind === 'other');
const we = new WaitingError('no world', { kind: 'world_exists', title: 'Northstar' });
check('WaitingError carries the machine-checkable blocker verbatim', we.waitingOn.kind === 'world_exists' && we.waitingOn.title === 'Northstar');
check('WaitingError stays instanceof-detectable after subclassing', we instanceof WaitingError && we.name === 'WaitingError');
const prog = planProgress(st(['done', 'waiting', 'failed', 'skipped', 'pending']));
check('planProgress counts succeeded/waiting/failed(+skipped) against total', prog.succeeded === 1 && prog.waiting === 1 && prog.failed === 2 && prog.total === 5);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} orchestrator check(s) failed`);
