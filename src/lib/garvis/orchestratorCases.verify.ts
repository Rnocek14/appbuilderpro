// src/lib/garvis/orchestratorCases.verify.ts
// INTENT COVERAGE SUITE (run: `npm run verify:orchestratorcases`). The shared ROUTING_CASES table
// (routingCases.ts — 100+ realistic operator intents: ventures, tools, hunts, one-offs, out-of-domain,
// underspecified, over-reaching, sloppy real voice, compounds, status questions, safety refusals,
// and the boundary battery of confusable pairs from both sides) run through the REAL
// parse gauntlet against the REAL catalog. This pins the intended intent→plan mapping:
//   - the right actions survive, in order — and no FORBIDDEN sibling ever appears;
//   - what the system can't do lands in holes (never a faked step);
//   - what the intent didn't say lands in questions (never an invented param);
//   - the whole catalog is exercised (an action no case uses is dead weight or a missing case).
// Live compiles depend on the model honoring COMPILER_SYSTEM — this suite is the contract those
// compiles are graded against; scripts/routingEvalRun.ts grades the LIVE model on the same table.

import { parsePlan } from './orchestrator';
import { ACTION_SPECS } from './actionCatalog';
import { ROUTING_CASES } from './routingCases';
import { gradeRouting } from '../../../scripts/routingEval';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

for (const c of ROUTING_CASES) {
  const res = parsePlan(c.compile, ACTION_SPECS);
  const got = res.plan ? res.plan.steps.map((s) => s.action) : [];
  const holes = res.plan?.holes.length ?? 0;
  const questions = res.plan?.questions.length ?? 0;
  const forbiddenHit = (c.forbid ?? []).filter((f) => got.includes(f));
  const ok =
    !!res.plan &&
    got.join(',') === c.actions.join(',') &&
    forbiddenHit.length === 0 &&
    holes >= (c.minHoles ?? 0) &&
    questions >= (c.minQuestions ?? 0);
  check(c.name, ok, `intent="${c.intent}" got=[${got.join(',')}] forbidden-hit=[${forbiddenHit.join(',')}] holes=${holes} questions=${questions}`);
}

// Catalog coverage: every action the catalog offers is exercised by at least one case.
const used = new Set(ROUTING_CASES.flatMap((c) => c.actions));
for (const spec of ACTION_SPECS) {
  check(`catalog coverage: ${spec.id} is exercised`, used.has(spec.id));
}

// The table only grows (routingCases.ts policy): a shrink below the full-space battery is a
// regression, and duplicate names would silently mask lost cases.
check('the table holds the full-space battery (≥100 intents)', ROUTING_CASES.length >= 100);
check('every case name is unique', new Set(ROUTING_CASES.map((c) => c.name)).size === ROUTING_CASES.length);
check('every boundary class carries forbids (≥30 cases pin a confusable sibling)',
  ROUTING_CASES.filter((c) => (c.forbid ?? []).length > 0).length >= 30);

// The live eval grades with THIS grader — pin its verdicts here so the two consumers can't drift.
{
  const c = { name: 'g', intent: 'g', compile: '', actions: ['start_client_hunt'], forbid: ['hunt_opportunities'] };
  check('grader: the expected action sequence passes', gradeRouting(c, ['start_client_hunt']).pass);
  check('grader: a wrong action fails with both sequences named',
    !gradeRouting(c, ['found_company']).pass && gradeRouting(c, ['found_company']).reason.includes('found_company'));
  check('grader: a forbidden sibling fails EVEN riding alongside the right answer',
    !gradeRouting(c, ['start_client_hunt', 'hunt_opportunities']).pass
    && gradeRouting(c, ['start_client_hunt', 'hunt_opportunities']).reason.includes('forbidden'));
  check('grader: extra unexpected steps fail (order and count are the contract)',
    !gradeRouting(c, ['start_client_hunt', 'found_company']).pass);
}

console.log(`\n${passed}/${passed + failed} passed (${ROUTING_CASES.length} intents, ${ACTION_SPECS.length} catalog actions)`);
if (failed > 0) throw new Error(`${failed} orchestrator case(s) failed`);
