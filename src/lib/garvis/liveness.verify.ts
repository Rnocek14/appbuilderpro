// src/lib/garvis/liveness.verify.ts
// Standalone verification of the liveness pure helpers (run: `npm run verify:liveness`).
// No DB, no fetch, no test framework (matches the other garvis verify suites).

import { classifyLiveness, latestByApp, buildLivenessDigest, livenessLabel } from './liveness';
import type { AppLiveness } from '../../types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

function row(over: Partial<AppLiveness> = {}): AppLiveness {
  return {
    id: over.id ?? 'l', owner_id: 'o', app_id: over.app_id ?? 'a1',
    checked_at: over.checked_at ?? '2026-06-24T00:00:00Z',
    reachable: over.reachable ?? true, status: over.status ?? null,
    latency_ms: over.latency_ms ?? null, source: 'browser', ...over,
  };
}

// 1. Classification.
check('no deploy url => not_deployed', classifyLiveness(null, null) === 'not_deployed');
check('deploy url but no check => unknown', classifyLiveness('https://x.app', null) === 'unknown');
check('reachable check => live', classifyLiveness('https://x.app', row({ reachable: true })) === 'live');
check('unreachable check => down', classifyLiveness('https://x.app', row({ reachable: false })) === 'down');

// 2. Labels never overclaim health.
check('live label is "reachable" not "healthy"', livenessLabel('live') === 'reachable' && !livenessLabel('live').includes('health'));
check('down label flags unreachable', livenessLabel('down') === 'UNREACHABLE');

// 3. latestByApp keeps the newest per app.
const reduced = latestByApp([
  row({ id: 'old', app_id: 'a1', checked_at: '2026-06-20T00:00:00Z', reachable: false }),
  row({ id: 'new', app_id: 'a1', checked_at: '2026-06-24T00:00:00Z', reachable: true }),
  row({ id: 'other', app_id: 'a2', checked_at: '2026-06-22T00:00:00Z', reachable: true }),
]);
check('latestByApp picks the newest row for a1', reduced.a1.id === 'new' && reduced.a1.reachable === true);
check('latestByApp keeps a separate entry per app', reduced.a2.id === 'other');

// 4. Digest: only deployed apps, with their state.
const apps = [
  { id: 'a1', name: 'LaunchBuddy', deploy_url: 'https://launchbuddy.app' },
  { id: 'a2', name: 'DownApp', deploy_url: 'https://down.app' },
  { id: 'a3', name: 'LocalOnly', deploy_url: null },
];
const latest = { a1: row({ app_id: 'a1', reachable: true }), a2: row({ app_id: 'a2', reachable: false }) };
const digest = buildLivenessDigest(apps, latest);
check('digest includes a reachable deployed app', digest.includes('LaunchBuddy') && digest.includes('reachable'));
check('digest flags an unreachable deployed app', digest.includes('DownApp') && digest.includes('UNREACHABLE'));
check('digest omits the non-deployed app', !digest.includes('LocalOnly'));
check('digest of zero deployed apps is empty', buildLivenessDigest([{ id: 'a3', name: 'LocalOnly', deploy_url: null }], {}) === '');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} liveness check(s) failed`);
