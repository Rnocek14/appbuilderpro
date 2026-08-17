// Run: npx tsx src/lib/serverResume.verify.ts
// The server-resume contract (SW10.5): the job-worker's second kind rides the SAME shared rules
// the browser uses — the one manifest rule, the one prompt module, the recovery write rules —
// checkpoints statelessly, heals with static QA, and finishes HONESTLY as static-only (the deep
// gate upgrades the badge on next open; that client mitigation must stay).

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
const worker = readFileSync(join(root, 'supabase/functions/job-worker/index.ts'), 'utf8');
const run = readFileSync(join(here, 'serverResumeRun.ts'), 'utf8');
const aiClient = readFileSync(join(here, 'aiClient.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0155_generation_resume.sql'), 'utf8');

// --- the shared rules, not private copies ---
check('the worker derives pages through the ONE manifest rule',
  worker.includes('pagesFromAppTsx(appTsx)') && worker.includes("from '../_shared/generateDriver.ts'"));
check('the worker generates through the SAME prompt module as the browser',
  worker.includes('GENERATE_FILES_STREAM') && worker.includes('filesPromptChunk(bpJson, pagePath'));
check('truncated tail files are dropped whole, never half-persisted',
  worker.includes("stopReason === 'max_tokens'") && worker.includes('looksTruncated'));
check('recovery write rules: scaffold/UI-kit never, surviving files never overwritten',
  worker.includes('resumeWritable') && worker.includes('SCAFFOLD_PATHS')
  && worker.includes("path.startsWith('/src/components/ui/')")
  && worker.includes('existing.get(path)?.trim()'));

// --- stateless checkpointing + the worker spine ---
check('the missing list is re-derived EVERY step, never checkpointed',
  /const missing = pagesFromAppTsx\(appTsx\)\.filter\(\(p\) => !files\.get\(p\)\?\.trim\(\)\)/.test(worker));
check('the resume rides the credit gate and pauses honestly when broke',
  /resumeStep[\s\S]{0,900}checkCredits\(admin, job\.owner_id, 'agent'\)/.test(worker)
  && worker.includes("You're out of credits — top up to resume this build."));
check('the resume honors the job budget cap', /resumeStep[\s\S]{0,1600}overBudget\(job\)/.test(worker));
check('a missing App.tsx is terminal with a named reason (nothing to derive from)',
  worker.includes('no App.tsx to derive pages from'));
check('the per-step slice is bounded', worker.includes('RESUME_PAGES_PER_STEP'));
check('a stalled generation record is CONTINUED when the enqueuer names one',
  worker.includes('payload.generation_id') && run.includes('generation_id: input.generationId'));

// --- the heal + the honest finish ---
check('static QA heals error-severity issues before finishing',
  worker.includes('validateProject(allFiles)') && worker.includes('issuesToFixRequest(errors)'));
check('the finish is HONESTLY static-only and points at the deep gate',
  worker.includes('static checks only (server)') && worker.includes('open the project to run the compiler'));
check('the deep-gate-upgrades-on-open mitigation still exists client-side',
  aiClient.includes('generationCompileGate'));
check('success announces itself at COMPLETION with the honest verification state',
  worker.includes('Resumed your build —') && worker.includes('verification pending your next open'));
check('failure announces itself too — what was tried and why it failed',
  worker.includes('Tried to resume your build; it failed:'));
check('the mind event is written at completion, never at enqueue (no fake progress)',
  !run.includes('mind_events'));

// --- the enqueue seam ---
check('one live resume per project — enqueue is idempotent',
  run.includes("in('status', ['queued', 'running'])"));
check('the worker is nudged but the cron tick is the guarantee',
  run.includes("functions.invoke('job-worker'") && run.includes('fire-and-forget'));
check('the migration constrains kind and defaults autopilot',
  migration.includes("kind in ('autopilot', 'generation_resume')") && migration.includes("default 'autopilot'"));

console.log(`\nserverResume.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} server resume check(s) failed`);
