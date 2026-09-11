// Run: npx tsx src/lib/stalledWatchdog.verify.ts
// The watchdog's contract (SW10.6): a silent build gets noticed, resumed at most twice, then
// honestly failed — never an infinite re-enqueue spend loop, and never fake progress at enqueue.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const worker = readFileSync(join(root, 'supabase/functions/standing-worker/index.ts'), 'utf8');
const jobWorker = readFileSync(join(root, 'supabase/functions/job-worker/index.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0156_stalled_watchdog.sql'), 'utf8');

const wd = worker.slice(worker.indexOf('STALLED-BUILD WATCHDOG'), worker.indexOf('ARC ADVANCE'));
check('the watchdog block exists on the standing tick', wd.length > 200);
check('stall = running with stage marks silent for 10+ minutes',
  wd.includes('10 * 60 * 1000') && wd.includes(".eq('status', 'running').lt('updated_at', staleIso)"));
check('the sweep is bounded per tick', wd.includes('.limit(10)'));
check('THE CAP: two attempts, then a NAMED failed state — no infinite spend loop',
  wd.includes('>= 2') && wd.includes('stalled — automatic resume failed twice; needs your attention'));
check('the cap flip is CAS-guarded and tells the owner once',
  wd.includes(".eq('id', g.id).eq('status', 'running')") && wd.includes('two automatic resumes did not fix it'));
check('one live resume per project — and a credit-paused resume still counts as live',
  wd.includes("in('status', ['queued', 'running', 'paused', 'waiting_approval'])"));
check('the attempt is counted BEFORE the job exists (a crash costs an attempt, never a loop)',
  wd.indexOf('resume_attempts: (g.resume_attempts ?? 0) + 1') < wd.indexOf("from('jobs').insert"));
check('the enqueued job continues the EXACT stalled generation',
  wd.includes('payload: { generation_id: g.id }'));
check('NO mind_event at enqueue — completion speaks, not intent',
  !/from\('jobs'\)\.insert[\s\S]{0,600}mind_events/.test(wd));
check('the resume job it enqueues rides checkCredits (the 10.5 gate)',
  /resumeStep[\s\S]{0,900}checkCredits/.test(jobWorker));
check('both completion mind_event variants exist in the job worker',
  jobWorker.includes('Resumed your build —') && jobWorker.includes('Tried to resume your build; it failed:'));
check('the migration adds the attempt counter and the touch clock',
  migration.includes('resume_attempts int not null default 0')
  && migration.includes('trg_project_generations_touch') && migration.includes('updated_at timestamptz'));
check('the stall index exists for the sweep', migration.includes('idx_generations_stalled'));

console.log(`\nstalledWatchdog.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} watchdog check(s) failed`);
