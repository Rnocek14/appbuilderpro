// Run: npx tsx src/lib/garvis/concierge.verify.ts
import { CONCIERGE_TASKS, matchTasks, resolve, type ConciergeWorld } from './concierge';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('concierge.verify');

const WORLDS: ConciergeWorld[] = [
  { id: 'w-mom', title: 'Mom Real Estate Marketing', slugs: ['brand', 'direct-mail', 'seller-campaigns'] },
  { id: 'w-growth', title: 'Growth Engine', slugs: ['growth-studio'] },
];

// ---- THE OPERATOR'S OWN SENTENCES are the acceptance tests ----
{
  const r = resolve("lets work on moms postcard", WORLDS);
  check('"lets work on moms postcard" → the mom world, postcard steps',
    r.kind === 'go' && r.task?.id === 'postcard' && r.route === '/garvis/webs/w-mom' && !r.missingWorld);
  check('postcard steps end at the approval Queue (nothing mails without you)',
    !!r.task && /Approve in Queue/.test(r.task.steps.join(' ')));
}
{
  const r = resolve('lets create a new project', WORLDS);
  check('"lets create a new project" → the app builder', r.kind === 'go' && r.task?.id === 'new-app' && r.route === '/new');
}
{
  const r = resolve('lets add another real estate agent into the system', WORLDS);
  check('"add another real estate agent" → CREATE via prefilled genesis, never silent',
    r.kind === 'go' && r.task?.id === 'new-realtor' && r.task.kind === 'create'
    && r.route === '/garvis/webs' && !!r.task.genesisIntent);
}
{
  const r = resolve('lets create my brother a business plan', WORLDS);
  check('"create my brother a business plan" → the business-plan genesis task',
    r.kind === 'go' && r.task?.id === 'business-plan' && !!r.task.genesisIntent);
}
{
  const r = resolve('lets start a clothing brand', WORLDS);
  check('"start a clothing brand" → the clothing-brand genesis task',
    r.kind === 'go' && r.task?.id === 'clothing-brand' && r.task.genesisIntent?.includes('clothing brand') === true);
}

// ---- honesty + shape ----
{
  const r = resolve("lets work on moms postcard", []);
  check('a world-scoped task with NO matching world says so (missingWorld), never pretends',
    r.kind === 'go' && r.missingWorld === true && r.route === '/garvis/webs');
  check('gibberish resolves to none, never a guess', resolve('xyzzy plugh', WORLDS).kind === 'none');
  check('empty input matches nothing', matchTasks('').length === 0 && matchTasks('a').length === 0);
  const ambiguous = resolve('start a new channel project', WORLDS);
  check('a genuinely ambiguous ask returns SUGGESTIONS, not an action',
    ambiguous.kind === 'suggest' && (ambiguous.suggestions?.length ?? 0) >= 2);
}
{
  check('every task has 1-6 steps, each a real sentence', CONCIERGE_TASKS.every((t) => t.steps.length >= 1 && t.steps.length <= 6 && t.steps.every((s) => s.length > 12)));
  check('every create task routes to an existing creator (genesis prefill or template), never a new path',
    CONCIERGE_TASKS.filter((t) => t.kind === 'create').every((t) => !!t.genesisIntent || !!t.templateId));
  check('world-scoped routes always declare their worldSlug',
    CONCIERGE_TASKS.filter((t) => t.route.includes('{worldId}')).every((t) => !!t.worldSlug));
  check('task ids are unique', new Set(CONCIERGE_TASKS.map((t) => t.id)).size === CONCIERGE_TASKS.length);
  check('deterministic', JSON.stringify(resolve('draft todays episode', WORLDS)) === JSON.stringify(resolve('draft todays episode', WORLDS)));
  check('multi-word keywords outrank their fragments (direct mail beats mail alone)',
    matchTasks('get the direct mail out', CONCIERGE_TASKS)[0]?.task.id === 'postcard');
}

console.log(`\nconcierge.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} concierge check(s) failed`);
