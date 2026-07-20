// scripts/generate-apply-all.mjs — regenerates supabase/_apply_garvis_all.sql from the real
// migrations directory, in the documented dependency order: timestamped 2026* first (except
// garvis_worker, which needs app_0003's agent_runs), then app_00xx alphabetically, then
// garvis_worker last. The July 2026 scan found the hand-maintained copy six migrations stale —
// a DB built from it had no Client Book and a broken Money page. Run: node scripts/generate-apply-all.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
const isWorker = (f) => f.includes('garvis_worker');
const stamped = files.filter((f) => /^\d{14}_/.test(f) && !isWorker(f)).sort();
const app = files.filter((f) => /^app_\d{4}/.test(f)).sort();
const worker = files.filter(isWorker).sort();
const other = files.filter((f) => !stamped.includes(f) && !app.includes(f) && !worker.includes(f)).sort();
if (other.length) throw new Error(`Unclassified migrations (extend the order rule): ${other.join(', ')}`);

const ordered = [...stamped, ...app, ...worker];
const header = `-- supabase/_apply_garvis_all.sql — GENERATED: EVERY migration, in dependency order:
-- timestamped 2026* (except garvis_worker) → app_00xx → garvis_worker (needs app_0003's
-- agent_runs). Regenerate with: node scripts/generate-apply-all.mjs (keep garvis_worker last).
-- Apply AFTER schema.sql and schema_v2_autopilot.sql (or supabase/schema_repair.sql).
-- All migrations are additive + idempotent; re-running is safe.
--
`;
const body = ordered
  .map((f) => `\n-- ======== supabase/migrations/${f} ========\n${readFileSync(join(dir, f), 'utf8').trimEnd()}\n`)
  .join('');
writeFileSync('supabase/_apply_garvis_all.sql', header + body);
console.log(`Wrote supabase/_apply_garvis_all.sql from ${ordered.length} migrations (last: ${ordered[ordered.length - 1]})`);
