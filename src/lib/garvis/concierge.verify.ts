// Run: npx tsx src/lib/garvis/concierge.verify.ts
import { CONCIERGE_TASKS, deriveTasks, matchTasks, resolve, routeFor, type ConciergeWorld } from './concierge';
import { ALL_CONCIERGE_TASKS } from './conciergeTasks';
import { NAV_SECTIONS } from '../navConfig';

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

// ---- the waking-moment task + routeFor (the AI tier's route resolver) ----
{
  const r = resolve('whats next', WORLDS);
  check('"whats next" → Home, the waking moment', r.kind === 'go' && r.task?.id === 'whats-next' && r.route === '/garvis/command');
  check('"what\'s waiting on me" → the Queue (the dock\'s own example must work)',
    resolve("what's waiting on me", WORLDS).task?.id === 'approvals');
  const postcard = CONCIERGE_TASKS.find((t) => t.id === 'postcard')!;
  check('routeFor substitutes the real world id', routeFor(postcard, WORLDS).route === '/garvis/webs/w-mom');
  check('routeFor with no matching world is honest, never a broken route',
    routeFor(postcard, []).missingWorld === true && routeFor(postcard, []).route === '/garvis/webs');
}

// ---- THE DERIVATION LAYER: every door is sayable, nothing outranks the handwritten tasks ----
const ALL = ALL_CONCIERGE_TASKS;
{
  check('combined ids are unique across handwritten + derived', new Set(ALL.map((t) => t.id)).size === ALL.length);
  check('all handwritten tasks survive derivation', CONCIERGE_TASKS.every((h) => ALL.some((t) => t.id === h.id)));
  check('every task still has 1-6 real steps', ALL.every((t) => t.steps.length >= 1 && t.steps.length <= 6 && t.steps.every((s) => s.length > 12)));
  check('the whole list fits the AI tier\'s cap (120)', ALL.length <= 120 && ALL.length >= 40);
  check('every create task still routes to an existing creator', ALL.filter((t) => t.kind === 'create').every((t) => !!t.genesisIntent || !!t.templateId));

  // EVERY nav destination is reachable through some task — the "solve all navigation" contract.
  const routes = new Set(ALL.map((t) => t.route));
  const navItems = NAV_SECTIONS.flatMap((s) => s.items);
  check('every sidebar destination is sayable (a task routes to each nav item)',
    navItems.every((i) => routes.has(i.to)));
  check('nav items covered by handwritten tasks are NOT twinned by derived ones',
    !ALL.some((t) => t.id === 'nav:/garvis/queue' || t.id === 'nav:/garvis/channels' || t.id === 'nav:/garvis/command'));
}
{
  // Verb + distinctive word reaches pages that had no handwritten task at all.
  const r = resolve('take me to the fleet', WORLDS, ALL);
  check('"take me to the fleet" → the Fleet page via a derived nav task',
    r.kind === 'go' && r.task?.id === 'nav:/garvis/fleet' && r.route === '/garvis/fleet');
  check('"go to settings" reaches Settings through the verb-boosted handwritten task',
    resolve('go to settings', WORLDS, ALL).task?.id === 'spend-caps');
  check('"show me the galaxy" → the Galaxy page', resolve('show me the galaxy', WORLDS, ALL).task?.id === 'nav:/garvis/universe');
  check('"set up invoice chasing" → the capability card on Automations',
    resolve('set up invoice chasing', WORLDS, ALL).task?.id === 'cap:invoice_chase');
  const preset = resolve('stroke recovery videos for caregivers', WORLDS, ALL);
  check('a niche ask finds its channel preset', preset.task?.id === 'preset:caregiver_health' && preset.route === '/garvis/channels');
}
{
  // WORD CLAIM: derived tasks can never steal or tie the operator's acceptance sentences.
  check('"lets work on moms postcard" still wins for the handwritten postcard task',
    resolve('lets work on moms postcard', WORLDS, ALL).task?.id === 'postcard');
  check('"start a content channel" still goes to the handwritten channel task, not the template twin',
    resolve('start a content channel', WORLDS, ALL).task?.id === 'start-channel');
  check('"lets start a clothing brand" survives the full list',
    resolve('lets start a clothing brand', WORLDS, ALL).task?.id === 'clothing-brand');
  check('"lets add another real estate agent into the system" survives the full list',
    resolve('lets add another real estate agent into the system', WORLDS, ALL).task?.id === 'new-realtor');
  const claimed = new Set<string>();
  for (const h of CONCIERGE_TASKS) for (const k of h.keywords) { claimed.add(k); for (const w of k.split(' ')) claimed.add(w); }
  const derived = ALL.filter((t) => !CONCIERGE_TASKS.some((h) => h.id === t.id));
  check('no derived task carries a word the handwritten tasks claimed',
    derived.every((t) => t.keywords.every((k) => !claimed.has(k))));
  const tplChannel = derived.find((t) => t.id === 'tpl:content-channel');
  check('a fully-claimed derived task keeps an EMPTY keyword list (AI-tier only), not stolen words',
    !!tplChannel && tplChannel.keywords.length === 0);
}
{
  // Determinism + purity of the derivation itself.
  const sample = {
    nav: [{ to: '/x', label: 'Xylophones' }, { to: '/garvis/queue', label: 'Queue' }],
    templates: [{ id: 't1', title: 'Xylophone Launch' }],
    presets: [{ id: 'p1', label: 'Xylo facts', niche: 'xylophone history and repair' }],
    capabilities: [{ id: 'c1', title: 'Xylophone tuning' }, { id: 'c2', title: 'Never built', status: 'not_built' }],
  };
  const a = deriveTasks(CONCIERGE_TASKS, sample);
  check('deriveTasks is deterministic', JSON.stringify(a) === JSON.stringify(deriveTasks(CONCIERGE_TASKS, sample)));
  check('a not_built capability is never proposed', !a.some((t) => t.id === 'cap:c2') && a.some((t) => t.id === 'cap:c1'));
  check('a nav item on a handwritten route is skipped', !a.some((t) => t.id === 'nav:/garvis/queue'));
}

console.log(`\nconcierge.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} concierge check(s) failed`);
