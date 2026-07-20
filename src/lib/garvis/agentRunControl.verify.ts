// Static regression checks for the interactive-run race and the clarification resume transition.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const publicApi = readFileSync(join(here, 'index.ts'), 'utf8');
const runtime = readFileSync(join(here, 'runtime.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0092_execution_truth.sql'), 'utf8').toLowerCase();
const worker = readFileSync(join(root, 'supabase/functions/garvis-worker/index.ts'), 'utf8');

check('interactive API creates runs through one atomic RPC', publicApi.includes("supabase.rpc('create_and_claim_agent_run'") && (publicApi.match(/createClaimedRun\(\{/g) ?? []).length === 3);
check('interactive API does not use a generic queue claim', !publicApi.includes("import { claimNextRun, runGarvisTask }") && !publicApi.includes('await claimNextRun()'));
check('runtime persists pending question options', runtime.includes('pendingQuestion: { question: decision.question, options: decision.options ?? [] }'));
check('runtime preserves the question as an assistant transcript turn', runtime.includes("{ role: 'assistant', content: decision.question }"));
check('migration defines exact owner-scoped claim', migration.includes('function public.claim_agent_run(p_run_id uuid)') && migration.includes('owner_id = auth.uid()'));
check('create and lease happen in one database function', migration.includes('function public.create_and_claim_agent_run(') && migration.includes("'running', p_phase") && migration.includes("now() + interval '10 minutes'"));
check('security-definer create validates app ownership', migration.includes('id = p_app_id and owner_id = auth.uid()'));
check('migration appends the answer to checkpoint history', migration.includes("jsonb_build_object('role', 'user', 'content', trim(p_answer))"));
check('resume repairs older checkpoints with the missing question', migration.includes("jsonb_build_object('role', 'assistant', 'content', question)"));
check('signed worker uses authenticated claim RPC', worker.includes("authClient!.rpc('claim_agent_run'") && worker.includes("authClient!.rpc('claim_next_agent_run')"));
check('only secret worker self-chains globally', worker.includes('if (bySecret && processed === RUNS_PER_INVOCATION && secret)'));

console.log(`\nagentRunControl.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} agent-run control check(s) failed`);
