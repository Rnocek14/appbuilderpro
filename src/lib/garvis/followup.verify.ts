// src/lib/garvis/followup.verify.ts
// Standalone verification of the follow-through pure helpers (run: `npm run verify:followup`).
// No DB, no fetch, no test framework (matches the other garvis verify suites).

import { daysSince, isLoopStale, buildCheckInLine, buildOpenLoopsDigest } from './followup';
import type { OpenLoop } from './followup';
import type { GarvisGoal } from '../../types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const now = Date.parse('2026-06-24T00:00:00Z');

// 1. daysSince.
check('daysSince counts whole days', daysSince('2026-06-15T00:00:00Z', now) === 9);
check('daysSince is 0 for now', daysSince('2026-06-24T00:00:00Z', now) === 0);
check('daysSince handles null', daysSince(null, now) === 0);
check('daysSince handles garbage', daysSince('nope', now) === 0);

// 2. Staleness: fresh, progressed, stalled, unmeasurable.
check('a fresh loop (3d) is never stale', !isLoopStale(3, { commitsSince: 0, liveness: 'not_deployed' }, 7));
check('old + commits since => not stale (progressing)', !isLoopStale(10, { commitsSince: 4, liveness: 'not_deployed' }, 7));
check('old + now live => not stale (shipped)', !isLoopStale(10, { commitsSince: 0, liveness: 'live' }, 7));
check('old + no commits + not deployed => stale', isLoopStale(10, { commitsSince: 0, liveness: 'not_deployed' }, 7));
check('old + no signal => stale (warrants check-in)', isLoopStale(10, null, 7));

// 3. Check-in line.
const loop = (over: Partial<OpenLoop> = {}): OpenLoop => ({
  goalId: 'g', title: 'Ship FableForge', appId: 'a1', appName: 'FableForge', priority: 1,
  ageDays: 9, targetDate: null, signal: { commitsSince: 2, liveness: 'not_deployed' }, stale: false, ...over,
});
const line = buildCheckInLine(loop());
check('check-in states elapsed time + commitment', line.includes('9 days ago') && line.includes('Ship FableForge'));
check('check-in reports commits since', line.includes('2 commits since'));
check('check-in reports not-deployed', line.includes('still not deployed'));
check('check-in handles zero commits', buildCheckInLine(loop({ signal: { commitsSince: 0, liveness: 'not_deployed' } })).includes('no commits since'));
check('check-in handles live', buildCheckInLine(loop({ signal: { commitsSince: 1, liveness: 'live' } })).includes('now reachable'));
check('check-in handles no signal', buildCheckInLine(loop({ signal: null })).includes('No progress signal'));
check('check-in handles "Today"', buildCheckInLine(loop({ ageDays: 0 })).startsWith('Today'));

// 4. Brain digest: only active goals, with age + long-open flag; '' when none.
function goal(over: Partial<GarvisGoal> = {}): GarvisGoal {
  return {
    id: over.id ?? 'g1', owner_id: 'o', app_id: over.app_id ?? null, title: over.title ?? 'Goal',
    description: null, priority: over.priority ?? 3, success_metric: null, target_date: null,
    status: over.status ?? 'active', created_at: over.created_at ?? '2026-06-23T00:00:00Z', updated_at: '', ...over,
  };
}
const digest = buildOpenLoopsDigest(
  [
    goal({ id: 'g1', title: 'Ship FableForge', priority: 1, app_id: 'a1', created_at: '2026-06-13T00:00:00Z' }), // 11d → long-open
    goal({ id: 'g2', title: 'Recent goal', priority: 2, created_at: '2026-06-23T00:00:00Z' }),                    // 1d
    goal({ id: 'g3', title: 'Done goal', status: 'achieved' }),
  ],
  { a1: 'FableForge' },
  now,
);
check('digest lists an active goal with its age', digest.includes('Ship FableForge') && digest.includes('open 11d'));
check('digest flags a long-open commitment', digest.includes('LONG-OPEN'));
check('digest resolves the app name', digest.includes('(FableForge)'));
check('digest excludes non-active goals', !digest.includes('Done goal'));
check('digest of no active goals is empty', buildOpenLoopsDigest([goal({ status: 'achieved' })], {}, now) === '');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} followup check(s) failed`);
