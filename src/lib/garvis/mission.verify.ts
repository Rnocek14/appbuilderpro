// src/lib/garvis/mission.verify.ts
// Standalone verification of the Mission Planner pure helpers (run: `npm run verify:mission`).

import { parsePlan, buildPlannerUser, buildPlannerSystem } from './mission';

// NOTE: deliberately does NOT import ./workers — that module pulls in supabase/aiClient (browser-only)
// and would crash this Node verify on import. The worker kinds are stable; mirror them here.
const WORKER_KINDS = ['research', 'analytics', 'marketing', 'bug', 'builder'] as const;
const FAKE_CATALOG = WORKER_KINDS.map((k) => `- ${k}: does ${k} things [read_only]`).join('\n');

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const valid = new Set<string>(WORKER_KINDS);

// 1. Clean plan parses + keeps order.
const plan = parsePlan('{"summary":"Understand then market","tasks":[{"worker":"research","title":"Scan market","brief":"competitors"},{"worker":"marketing","title":"Make campaign","brief":"posts+email"}]}', valid);
check('parses the summary', plan.summary === 'Understand then market');
check('parses both tasks in order', plan.tasks.length === 2 && plan.tasks[0].worker === 'research' && plan.tasks[1].worker === 'marketing');
check('carries the per-task brief', plan.tasks[0].brief === 'competitors');

// 2. Drops tasks with unknown/invalid workers + tasks with no title.
const dirty = parsePlan('{"tasks":[{"worker":"research","title":"ok"},{"worker":"nuke","title":"bad"},{"worker":"marketing","title":""}]}', valid);
check('drops an unknown worker kind', !dirty.tasks.some((t) => (t.worker as string) === 'nuke'));
check('drops a task with no title', dirty.tasks.length === 1 && dirty.tasks[0].title === 'ok');

// 3. Caps the plan at 6 tasks.
const many = parsePlan(JSON.stringify({ tasks: Array.from({ length: 10 }, (_, i) => ({ worker: 'research', title: `t${i}` })) }), valid);
check('caps the plan at 6 tasks', many.tasks.length === 6);

// 4. Garbage never throws.
check('garbage => empty plan', parsePlan('the model wrote prose', valid).tasks.length === 0);

// 5. Prompts include the essentials.
check('planner system lists the worker catalog', buildPlannerSystem(FAKE_CATALOG).includes('marketing:') && buildPlannerSystem(FAKE_CATALOG).includes('research:'));
check('planner user states the objective', buildPlannerUser('grow Theory Thread', 'Theory Thread', false).includes('grow Theory Thread'));
check('planner user flags external subjects', buildPlannerUser('market it', "mom's business", true).includes('external'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} mission check(s) failed`);
