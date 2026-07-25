// breaker.verify.ts — the automation circuit breaker (app_0113) stays wired the way it was built.
// Source pins over standing-worker's trigger drain + the migration, in the agentRunControl style:
//   * a failed fire is RECORDED (error + streak), never silently swallowed (the old bare catch);
//   * the claim is still released so a transient failure retries next tick;
//   * 5 straight failures pause the trigger ITSELF (status='paused', already a legal status) and
//     write a loud mind_event — a broken trigger must stop burning the shared fire budget;
//   * any success closes the breaker (streak reset), so blips never accumulate into a false pause;
//   * a tripped breaker stops the trigger's remaining fires THIS tick too (break, not continue).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const worker = readFileSync(join(root, 'supabase/functions/standing-worker/index.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0113_automation_reliability.sql'), 'utf8');

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

check('migration adds the breaker columns', migration.includes('consecutive_failures') && migration.includes('last_error_at'));
check('breaker limit is 5', worker.includes('const BREAKER_LIMIT = 5'));
check('the drain selects the streak with the trigger', /select\('id, owner_id, list_id, label,[^)]*consecutive_failures'\)/.test(worker));
check('a failed fire still releases its claim (retry survives)', worker.includes("await admin.from('trigger_fires').delete().eq('id', fireId);"));
check('a failed fire records its error verbatim (no more bare catch)', worker.includes('last_error: errMsg, last_error_at: nowIso'));
check('the streak trips into a self-pause', worker.includes("...(tripped ? { status: 'paused' } : {})"));
check('a trip is LOUD (mind_event with the error)', worker.includes('paused itself after ${BREAKER_LIMIT} straight failures'));
check('a trip stops the trigger for the rest of the tick', /if \(tripped\) \{[\s\S]{0,700}break;/.test(worker));
check('a success closes the breaker (streak reset, error cleared)', worker.includes('consecutive_failures: 0, last_error: null, last_error_at: null'));

console.log(`\nbreaker.verify: ${9 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} breaker check(s) failed`);
