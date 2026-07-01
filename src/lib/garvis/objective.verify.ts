// src/lib/garvis/objective.verify.ts
// Standalone verification of the objective-layer invariants (run: `npm run verify:objective`).
// Pure-function asserts, no DB, no test framework (matches knowledge.verify.ts).
//   - Only ACTIVE goals + APPROVED capabilities reach the brain's context.
//   - Constraints surface; goal/capability detail is rendered for reasoning.

import { selectActiveGoals, selectApprovedCapabilities, buildGoalsDigest, buildCapabilitiesDigest } from './objective';
import type { GarvisCapability, GarvisConstraints, GarvisGoal, GoalStatus, CapabilityStatus } from '../../types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

function goal(status: GoalStatus, over: Partial<GarvisGoal> = {}): GarvisGoal {
  return {
    id: `g-${status}-${over.title ?? 'x'}`, owner_id: 'o', app_id: null,
    title: over.title ?? 'Title', description: null, priority: over.priority ?? 3,
    success_metric: over.success_metric ?? null, target_date: over.target_date ?? null,
    status, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}
function cap(status: CapabilityStatus, over: Partial<GarvisCapability> = {}): GarvisCapability {
  return {
    id: `c-${status}-${over.name ?? 'x'}`, owner_id: 'o', app_id: null,
    name: over.name ?? 'do_thing', description: over.description ?? 'desc',
    input_spec: null, output_spec: null, safety_level: over.safety_level ?? 'read_only',
    approval_required: over.approval_required ?? false, maturity: over.maturity ?? 'stub',
    status, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

// 1. Only active goals, priority-sorted.
const mixedGoals = [goal('proposed', { title: 'Prop' }), goal('active', { title: 'Hi', priority: 1 }), goal('active', { title: 'Lo', priority: 5 }), goal('achieved', { title: 'Done' })];
const active = selectActiveGoals(mixedGoals);
check('selectActiveGoals returns only active', active.length === 2 && active.every((g) => g.status === 'active'));
check('selectActiveGoals sorts by priority asc', active[0].title === 'Hi' && active[1].title === 'Lo');

// 2. Goals digest behavior.
check('digest of proposed-only goals + no constraints is empty',
  buildGoalsDigest([goal('proposed'), goal('achieved')]) === '');
const gDigest = buildGoalsDigest([goal('active', { title: 'Reach $5k MRR', success_metric: 'MRR' })]);
check('digest contains active goal title + metric', gDigest.includes('Reach $5k MRR') && gDigest.includes('MRR'));
const constraints: GarvisConstraints = { owner_id: 'o', weekly_hours: 20, monthly_budget_usd: 500, risk_tolerance: 'moderate', max_active_projects: 5, notes: null, updated_at: '' };
const cDigest = buildGoalsDigest([], constraints);
check('digest surfaces constraints (budget + hours)', cDigest.includes('500') && cDigest.includes('20'));
check('proposed goal title never appears in digest', !buildGoalsDigest(mixedGoals, constraints).includes('Prop'));

// 3. Only approved capabilities.
const mixedCaps = [cap('proposed', { name: 'pending_cap' }), cap('approved', { name: 'ready_cap' }), cap('retired', { name: 'old_cap' })];
const approvedCaps = selectApprovedCapabilities(mixedCaps);
check('selectApprovedCapabilities excludes proposed/retired', approvedCaps.length === 1 && approvedCaps[0].name === 'ready_cap');
const capsDigest = buildCapabilitiesDigest(mixedCaps);
check('capabilities digest includes approved name + maturity', capsDigest.includes('ready_cap') && capsDigest.includes('stub'));
check('capabilities digest excludes proposed/retired', !capsDigest.includes('pending_cap') && !capsDigest.includes('old_cap'));

// 4. approval_required is surfaced.
const apprDigest = buildCapabilitiesDigest([cap('approved', { name: 'risky', approval_required: true, safety_level: 'external_action' })]);
check('capabilities digest marks approval required', apprDigest.includes('approval required'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} objective check(s) failed`);
