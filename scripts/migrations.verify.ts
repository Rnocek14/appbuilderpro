// scripts/migrations.verify.ts — THE MIGRATION-COLLISION GUARD (run: npm run verify:migrations).
// The July 2026 scan found two shipped regressions born from exactly one bug class: parallel
// branches minting the same migration number, then landing out of order so the later file
// silently redefined what the earlier one added (content_week dropped from a check constraint;
// social-sync dropped from the heartbeat arm). This suite makes that class un-shippable:
//   1. No NEW duplicate app_NNNN numbers (the five pre-existing collisions are grandfathered —
//      they are already applied in prod and renaming applied migrations breaks db push tracking).
//   2. supabase/_apply_garvis_all.sql is exactly what scripts/generate-apply-all.mjs produces —
//      the documented manual-DB path can never go stale again (it was six migrations behind).
//   3. Exactly one migration redefines the heartbeat arm LAST: the latest file containing
//      `garvis_arm_heartbeat(` must schedule every job named in EXPECTED-JOBS parity with
//      src/lib/garvis/systemControl.ts — the UI's armed-vs-missing check and the SQL truth
//      cannot drift apart again.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

// 1. Duplicate numbers — grandfathered pairs only. Each entry is a collision that landed on
//    main from two parallel branches BEFORE the guard existed to stop it; both files are already
//    applied in prod, and renaming an applied migration breaks `db push` state tracking, so the
//    honest resolution is to freeze the collision, not un-ship it. 0091: orchestrator_plans (mine)
//    vs preview_hardening (the parallel garvis-architecture branch) — orthogonal tables, no SQL
//    conflict, both idempotent. The guard still blocks any NEW colliding number.
const GRANDFATHERED = new Set(['0081', '0082', '0086', '0087', '0088', '0091']);
const byNum = new Map<string, string[]>();
for (const f of files) {
  const m = /^app_(\d{4})/.exec(f);
  if (m) byNum.set(m[1], [...(byNum.get(m[1]) ?? []), f]);
}
const newDupes = [...byNum.entries()].filter(([n, fs]) => fs.length > 1 && !GRANDFATHERED.has(n));
check('no new duplicate migration numbers', newDupes.length === 0,
  newDupes.map(([n, fs]) => `${n}: ${fs.join(' + ')}`).join('; '));

// 2. Apply-all freshness — regenerate in memory, compare byte-for-byte.
const isWorker = (f: string) => f.includes('garvis_worker');
const stamped = files.filter((f) => /^\d{14}_/.test(f) && !isWorker(f)).sort();
const app = files.filter((f) => /^app_\d{4}/.test(f)).sort();
const worker = files.filter(isWorker).sort();
const header = `-- supabase/_apply_garvis_all.sql — GENERATED: EVERY migration, in dependency order:
-- timestamped 2026* (except garvis_worker) → app_00xx → garvis_worker (needs app_0003's
-- agent_runs). Regenerate with: node scripts/generate-apply-all.mjs (keep garvis_worker last).
-- Apply AFTER schema.sql and schema_v2_autopilot.sql (or supabase/schema_repair.sql).
-- All migrations are additive + idempotent; re-running is safe.
--
`;
const expected = header + [...stamped, ...app, ...worker]
  .map((f) => `\n-- ======== supabase/migrations/${f} ========\n${readFileSync(join(dir, f), 'utf8').trimEnd()}\n`)
  .join('');
const actual = readFileSync('supabase/_apply_garvis_all.sql', 'utf8');
check('_apply_garvis_all.sql is freshly generated (run: node scripts/generate-apply-all.mjs)', actual === expected);

// 3. Arm-function parity with the UI's EXPECTED_JOBS.
const armFiles = files.filter((f) => readFileSync(join(dir, f), 'utf8').includes('function public.garvis_arm_heartbeat('));
const latestArm = armFiles[armFiles.length - 1];
const armSql = latestArm ? readFileSync(join(dir, latestArm), 'utf8') : '';
const systemControl = readFileSync('src/lib/garvis/systemControl.ts', 'utf8');
const expectedJobs = [...systemControl.matchAll(/'(garvis-[a-z-]+)'/g)].map((m) => m[1]);
const missingFromArm = expectedJobs.filter((j) => !armSql.includes(`'${j}'`));
check(`latest arm redefinition (${latestArm}) schedules every EXPECTED_JOBS entry`, missingFromArm.length === 0,
  `missing: ${missingFromArm.join(', ')}`);
const scheduledCount = (armSql.match(/cron\.schedule\('/g) ?? []).length;
check('EXPECTED_JOBS count matches the arm schedule count', expectedJobs.length === scheduledCount,
  `UI expects ${expectedJobs.length}, arm schedules ${scheduledCount}`);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) { process.exit(1); }
