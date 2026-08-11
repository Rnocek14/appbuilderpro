// Run: npx tsx src/lib/garvis/concierge.verify.ts
import { CONCIERGE_TASKS, STAT_QUERIES, aliasLookup, aliasRemember, deriveTasks, deriveWorldTasks, exploreDive, isBrief, isRevision, matchTasks, parseBoardCommand, parseBuilderCommand, isGoBack, parseCommandPrefix, reelTopic, resolve, routeFor, smallTalk, statsFor, withProjectTasks, type ConciergeWorld } from './concierge';
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
  check('"lets work on moms postcard" → INSIDE the mom world\'s Direct Mail area (the machine taps the node)',
    r.kind === 'go' && r.task?.id === 'postcard' && r.route === '/garvis/webs/w-mom?area=direct-mail' && !r.missingWorld);
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
  check('routeFor substitutes the real world id (area deep-link intact)', routeFor(postcard, WORLDS).route === '/garvis/webs/w-mom?area=direct-mail');
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
// ---- THE CENTRAL-COMMAND TIER: compound intents, payload asks, questions, weak signals ----
{
  const r = resolve('i want to work on my website builder and send out some emails', WORLDS, ALL);
  check('a two-intent sentence is COMPOUND → Orchestrate, with the pieces as suggestions',
    r.kind === 'compound' && r.route === '/garvis/orchestrate' && (r.suggestions?.length ?? 0) >= 2);
  check('"find leads then email them my pitch" is compound too',
    resolve('find leads then email them my pitch', WORLDS, ALL).kind === 'compound');
  check('a single-destination sentence with "and" inside is NOT compound ("draft an episode about cats and dogs")',
    resolve('draft an episode about cats and dogs', WORLDS, ALL).kind === 'go');
  check('"scrape all the houses in williams bay" surfaces the listings task',
    (() => { const x = resolve('scrape all the houses in williams bay', WORLDS, ALL); return x.task?.id === 'listings' || (x.suggestions ?? []).some((t) => t.id === 'listings'); })());
  check('"email my past clients about the new listing" reaches the email task (→ Orchestrate)',
    (() => { const x = resolve('email my past clients about the new listing', WORLDS, ALL); return (x.task?.id === 'send-emails' || (x.suggestions ?? []).some((t) => t.id === 'send-emails')); })());
  check('the send-emails and orchestrate tasks both land on Orchestrate (compile is the only door to sending)',
    CONCIERGE_TASKS.find((t) => t.id === 'send-emails')?.route === '/garvis/orchestrate'
    && CONCIERGE_TASKS.find((t) => t.id === 'orchestrate')?.route === '/garvis/orchestrate');
  check('"check my money" resolves on one distinctive word (uniqueness bonus)',
    resolve('check my money', WORLDS, ALL).task?.id === 'money');
  check('"where do postcards get approved" — plural finds the postcard task (fold expansion)',
    (() => { const x = resolve('where do postcards get approved', WORLDS, ALL); return x.task?.id === 'postcard' || (x.suggestions ?? []).some((t) => t.id === 'postcard'); })());
  check('a procedural question with a weak match defers to the AI tier, never routes on one word',
    resolve('how do i connect my tiktok account', WORLDS, ALL).kind === 'none');
  check('a shared-word hit degrades to honest SUGGESTIONS, not silence ("system health")',
    resolve('system health', WORLDS, ALL).kind === 'suggest');
  check('"lets explore" opens the Knowledge Universe', resolve('lets explore', WORLDS, ALL).task?.id === 'explore');
  check('"take me home" goes to the waking moment', resolve('take me home', WORLDS, ALL).task?.id === 'whats-next');
  check('NAV_VERBS never appear as task keywords (boost must stay uniform)',
    (() => { const verbs = new Set(['open', 'go to', 'show me', 'take me to', 'where is', 'set up', 'check', 'see', 'view', 'look at', 'whats', "what's", 'i want to', 'i need to', 'lets', 'make']); return ALL.every((t) => t.keywords.every((k) => !verbs.has(k))); })());
  check('the listings task is world-scoped and honest about its slug',
    (() => { const t = CONCIERGE_TASKS.find((x) => x.id === 'listings'); return !!t && t.route.includes('{worldId}') && t.worldSlug === 'lake-geneva-market'; })());
  check('gibberish still resolves to none even with the weak-signal tier',
    resolve('asdf jkl qwerty', WORLDS, ALL).kind === 'none');
}
// ---- Persona fan-out regressions (each was a confirmed misroute before its fix) ----
{
  check('bare "clients" means the client book, never the prospect scraper',
    resolve('lets look at my clients', WORLDS, ALL).task?.id === 'client-book'
    || (resolve('lets look at my clients', WORLDS, ALL).suggestions ?? []).some((t) => t.id === 'client-book'));
  check('"work on the card" is the postcard, not the billing card',
    (() => { const r = resolve('work on the card', WORLDS, ALL); return r.task?.id === 'postcard' || (r.suggestions ?? []).some((t) => t.id === 'postcard'); })());
  check('"my new headshot came in" routes NOWHERE (bare "new" must not own a page)',
    resolve('my new headshot came in', WORLDS, ALL).kind === 'none');
  check('"open house this weekend" is an idiom — AI tier, never the listings page',
    resolve('open house this weekend', WORLDS, ALL).kind === 'none');
  check('the mailing lists / neighborhood farm is sayable',
    resolve('update the mailing lists', WORLDS, ALL).task?.id === 'mailing-lists');
  check('"work on the farm" finds the farm', (() => { const r = resolve('work on the farm', WORLDS, ALL); return r.task?.id === 'mailing-lists' || (r.suggestions ?? []).some((t) => t.id === 'mailing-lists'); })());
  check('a tie between tasks on the SAME resolved page collapses to a go ("lets work on the channel")',
    resolve('lets work on the channel', WORLDS, ALL).kind === 'go');
  check('"set up review requests" reaches the review capability (review polysemy freed)',
    resolve('set up review requests', WORLDS, ALL).task?.id === 'cap:review_request');
  check('time-generic words never become derived keywords ("how much did i make this month" → AI tier)',
    resolve('how much did i make this month', WORLDS, ALL).kind === 'none');
}
// ---- Tier 0 (learned shortcuts) + the Stark prefix ----
{
  let a = aliasRemember('open the postcard thing', 'postcard', []);
  check('an AI-tier pick is remembered and replays exactly', aliasLookup('open the postcard thing', a) === 'postcard');
  check('lookup is normalized (case/punctuation-insensitive)', aliasLookup('  Open the POSTCARD thing! ', a) === 'postcard');
  check('unknown phrasing returns null, never a guess', aliasLookup('something else entirely', a) === null);
  a = aliasRemember('open the postcard thing', 'money', a);
  check('re-learning the same phrase replaces, never duplicates', a.length === 1 && aliasLookup('open the postcard thing', a) === 'money');
  for (let i = 0; i < 60; i++) a = aliasRemember(`sentence number ${i}`, 'money', a);
  check('the alias store is capped at 50', a.length === 50);
  check('empty/short inputs are never learned', aliasRemember('a', 'x', []).length === 0);

  check('"garvis, do draft an episode" strips courtesy AND flags execution',
    JSON.stringify(parseCommandPrefix('garvis, do draft an episode')) === JSON.stringify({ sentence: 'draft an episode', execute: true }));
  check('"hey garvis whats next" is courtesy only — no execution flag',
    JSON.stringify(parseCommandPrefix('hey garvis whats next')) === JSON.stringify({ sentence: 'whats next', execute: false }));
  check('"do the mailing" is an execution order',
    parseCommandPrefix('do the mailing').execute === true && parseCommandPrefix('do the mailing').sentence === 'the mailing');
  check('a plain sentence passes through untouched',
    JSON.stringify(parseCommandPrefix('lets work on moms postcard')) === JSON.stringify({ sentence: 'lets work on moms postcard', execute: false }));
  check('"double check my money" is NOT an execution order (prefix is word-anchored)',
    parseCommandPrefix('double check my money').execute === false);

  // Revision detection — only correction-shaped sentences, only word-anchored.
  check('"actually make it 5 posts" is a revision', isRevision('actually make it 5 posts'));
  check('"remove the email step" is a revision', isRevision('remove the email step'));
  check('"lets work on moms postcard" is NOT a revision', !isRevision('lets work on moms postcard'));
  check('"add another real estate agent" IS revision-shaped — the dock only consults it while a plan is on screen',
    isRevision('add another real estate agent'));

  // The stats tier — phrase-anchored so commands never become numbers.
  check('"how many approvals are waiting" is a stat', statsFor('how many approvals are waiting') === 'approvals_waiting');
  check('"how much did i make this month" is a stat', statsFor('how much did i make this month') === 'revenue_month');
  check('"how are my episodes doing" is a stat', statsFor('how are my episodes doing') === 'episode_stats');
  check('"what are you working on" is a stat (arcs in flight)', statsFor('what are you working on') === 'arcs_running');
  check('"check my money" is a COMMAND, not a stat', statsFor('check my money') === null);
  check('"whats waiting on me" stays a command (Queue)', statsFor('whats waiting on me') === null);
  check('gibberish is never a stat', statsFor('asdf jkl') === null);
  check('every stat query id is unique', new Set(STAT_QUERIES.map((q) => q.id)).size === STAT_QUERIES.length);
  check('"how complete are my projects" is the portfolio stat', statsFor('how complete are my projects') === 'portfolio');
  check('"start marketing my stroke app" reaches the marketing operation task',
    (() => { const r = resolve('start marketing my stroke app', WORLDS, ALL); return r.task?.id === 'app-marketing' || (r.suggestions ?? []).some((t) => t.id === 'app-marketing'); })());
  check('"work on the marketing plan for my app" reaches it too',
    (() => { const r = resolve('work on the marketing plan for my app', WORLDS, ALL); return r.task?.id === 'app-marketing' || (r.suggestions ?? []).some((t) => t.id === 'app-marketing'); })());
  // The ideation family lands IN the conversation, never a two-sentence dead end.
  check('"lets come up with new creative strategies" goes to the brainstorm (Garvis on Home)',
    resolve('lets come up with new creative strategies', WORLDS, ALL).task?.id === 'brainstorm');
  check('"new ideas for instagram posts" brainstorms too',
    resolve('new ideas for instagram posts', WORLDS, ALL).task?.id === 'brainstorm');
  check('"what worked this week" is the episode-results stat', statsFor('what worked this week') === 'episode_stats');
  check('"hows the stroke app going" is the portfolio stat', statsFor('hows the stroke app going') === 'portfolio');
}
// ---- The brief door: pasted walls of thinking arrive intact, never keyword-mangled ----
{
  check('a multi-section project brief IS a brief', isBrief('COMO COUNTRY CLUB — BRAND & MERCH\n1. The Big Idea\nI am building a brand...\n2. Objective\nHats, tees, polos.'));
  check('280+ chars of prose is a brief even on one line', isBrief('x'.repeat(300)));
  check('an ordinary command is NEVER a brief', !isBrief('lets work on moms postcard'));
  check('a two-line note is not a brief', !isBrief('remember this:\ncall the printer'));
  const brief = CONCIERGE_TASKS.find((t) => t.id === 'big-brief');
  check('the big-brief task exists, keywordless (reached only via capture), and lands on Businesses',
    !!brief && brief.keywords.length === 0 && brief.route === '/garvis/webs');
  check('a keywordless task never matches any sentence',
    matchTasks('design the business from my brief', ALL).every((m) => m.task.id !== 'big-brief'));
}
// ---- The design board: visual ideation is sayable ----
{
  check('"lets design como logos" reaches the creative board',
    (() => { const r = resolve('lets design como logos', WORLDS, ALL); return r.task?.id === 'design-board' || (r.suggestions ?? []).some((t) => t.id === 'design-board'); })());
  check('"work on the ccc monogram" reaches it too',
    (() => { const r = resolve('work on the ccc monogram', WORLDS, ALL); return r.task?.id === 'design-board' || (r.suggestions ?? []).some((t) => t.id === 'design-board'); })());
  check('"make a moodboard" reaches the board', (() => { const r = resolve('make a moodboard', WORLDS, ALL); return r.task?.id === 'design-board'; })());
  check('the board steps teach the riff loop (say what to change)',
    CONCIERGE_TASKS.find((t) => t.id === 'design-board')!.steps.join(' ').includes('SAY what to change'));
}
// ---- The Explore bridge: "explore X" falls INTO a galaxy of X ----
{
  check('"explore lakefront resort branding" dives on the topic', exploreDive('explore lakefront resort branding') === 'lakefront resort branding');
  check('"lets explore black holes" strips the courtesy too', exploreDive('lets explore black holes') === 'black holes');
  check('"im curious about roman concrete" dives on the topic', exploreDive('im curious about roman concrete') === 'roman concrete');
  check('a bare "lets explore" yields NO topic — the open page is the honest landing', exploreDive('lets explore') === null);
  check('a keyword-only match never invents a dive', exploreDive('down the rabbit hole') === null);
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

// ---- THE VERTICALS DOOR — audience-building strategy asks land on Channels ----
{
  const full = resolve('i want to work on some ai slop videos or different instagram verticals so i can build following in verical areas where i can market my app', WORLDS, ALL_CONCIERGE_TASKS);
  check('the operator\'s FULL strategy sentence (typos and all) → the verticals door, confidently',
    full.kind === 'go' && full.task?.id === 'grow-verticals' && full.route === '/garvis/channels');
  check('"ai slop videos" is audience work, not an episode', resolve('i want to work on some ai slop videos', WORLDS, ALL_CONCIERGE_TASKS).task?.id === 'grow-verticals');
  check('"build a following" is audience work, NOT software (the new-app misroute is dead)',
    resolve('lets build a following in different verticals', WORLDS, ALL_CONCIERGE_TASKS).task?.id === 'grow-verticals');
  check('the steps carry the STRATEGY: one channel per niche, CTA pointed at the marketed thing, Queue gate',
    (() => { const t = CONCIERGE_TASKS.find((x) => x.id === 'grow-verticals')!; const s = t.steps.join(' '); return /per niche/.test(s) && /CTA/.test(s) && /Queue/.test(s); })());
  check('"start a new channel" still belongs to the handwritten channel task',
    (() => { const r = resolve('start a new channel', WORLDS, ALL_CONCIERGE_TASKS); return (r.kind === 'go' && r.task?.id === 'start-channel') || (r.kind === 'suggest' && !!r.suggestions?.some((t) => t.id === 'start-channel')); })());
}

// ---- THE WORLD-KNOWLEDGE TIER — the operator's worlds × areas ARE the vocabulary ----
{
  const MOMV: ConciergeWorld[] = [
    { id: 'w-mom', title: 'Mom Real Estate Marketing', slugs: ['brand', 'direct-mail', 'video-ideas', 'social-content'] },
    { id: 'w-como', title: 'Como Country Club', slugs: ['capsule-merch', 'brand'] },
    { id: 'w-chan', title: 'Caregiver Channel', slugs: ['growth-studio'] },
  ];
  const tasks = deriveWorldTasks(ALL_CONCIERGE_TASKS, MOMV);
  const r = resolve('lets work on video for my mom', MOMV, tasks);
  check('"lets work on video for my mom" → the mom world\'s VIDEO area (the ask that forced this tier)',
    r.kind === 'go' && r.task?.id === 'area:w-mom:video-ideas' && r.route === '/garvis/webs/w-mom?area=video-ideas');
  const social = resolve('lets do moms social posts', MOMV, tasks);
  check('"moms social posts" reaches the mom world\'s social area',
    (social.kind === 'go' && social.task?.id === 'area:w-mom:social-content') || (social.kind === 'suggest' && !!social.suggestions?.some((t) => t.id === 'area:w-mom:social-content')));
  const merch = resolve('work on the como merch', MOMV, tasks);
  check('"como merch" → the capsule room', merch.kind === 'go' && merch.task?.id === 'area:w-como:capsule-merch');
  check('a world word alone still belongs to the handwritten door ("moms postcard" stays postcard)',
    resolve('lets work on moms postcard', MOMV, tasks).task?.id === 'postcard');
  check('an area word alone NEVER fires a cross task ("start a clothing brand" stays the genesis door)',
    resolve('lets start a clothing brand', MOMV, tasks).task?.id === 'clothing-brand');
  check('generic title words never steal ("lets work on the channel" still drafts the episode)',
    resolve('lets work on the channel', MOMV, tasks).task?.id === 'draft-episode');
  check('the FULL world title is always a door ("open como country club")',
    resolve('open como country club', MOMV, tasks).task?.id === 'world:w-como');
  check('cross tasks never dilute ownership (deriveWorldTasks is additive + deterministic)',
    JSON.stringify(deriveWorldTasks(ALL_CONCIERGE_TASKS, MOMV)) === JSON.stringify(deriveWorldTasks(ALL_CONCIERGE_TASKS, MOMV))
    && deriveWorldTasks(ALL_CONCIERGE_TASKS, []).length === ALL_CONCIERGE_TASKS.length);
  check('areas owned by handwritten tasks are never twinned (no derived direct-mail area)',
    !tasks.some((t) => t.id === 'area:w-mom:direct-mail'));
}

// ---- SMALL TALK, HALTS & BACK — chatter never navigates, negations never "do" ----
{
  check('"never mind" is CLOSURE — it must never open a project named Mind Weave', smallTalk('never mind')?.kind === 'closure');
  check('"cancel the mail run" is a HALT — a negation is the opposite of intent', smallTalk('cancel the mail run')?.kind === 'halt');
  check('"dont send anything" halts too', smallTalk('dont send anything')?.kind === 'halt');
  check('a halt names the real levers (Queue, Missions, Master Switch)',
    /Queue/.test(smallTalk('stop everything')!.text) && /Master Switch/.test(smallTalk('stop everything')!.text));
  check('greetings, thanks, and affirmations each get their own free line',
    smallTalk('good morning')?.kind === 'greet' && smallTalk('thanks')?.kind === 'thanks' && smallTalk('good job')?.kind === 'affirm');
  check('real asks are NEVER chatter ("lets work on moms postcard", "check my money")',
    smallTalk('lets work on moms postcard') === null && smallTalk('check my money') === null);
  check('"no pressure lets do the postcard" is not a closure (anchored, not prefix)', smallTalk('no pressure lets do the postcard') === null);
  check('"go back" steps back a page; "go back to the queue" is a destination, not a step',
    isGoBack('go back') && isGoBack('take me back') && !isGoBack('go back to the queue'));
  check('bare "another one" at a board just makes another', parseBoardCommand('another one', ['post'])?.kind === 'make'
    && parseBoardCommand('one more', [])?.kind === 'make' && parseBoardCommand('another one', ['post'])?.text === '');
}

// ---- THE REEL DOOR — "make an ai video for X" lands in the reel studio ABOUT X ----
{
  const REEL_WORLDS: ConciergeWorld[] = [...WORLDS, { id: 'w-chan', title: 'Caregiver Channel', slugs: ['channel-brand'] }];
  const r1 = resolve('lets make an ai video for real estate reel', REEL_WORLDS, ALL_CONCIERGE_TASKS);
  check('"lets make an ai video for real estate reel" → the reel studio, inside its area',
    r1.kind === 'go' && r1.task?.id === 'reel' && r1.route === '/garvis/webs/w-growth?area=growth-studio');
  const r2 = resolve('lets make a reel about lake geneva', REEL_WORLDS, ALL_CONCIERGE_TASKS);
  check('"a reel about lake geneva" is a REEL with a topic, not the market page (payload words never outvote the action)',
    r2.kind === 'go' && r2.task?.id === 'reel');
  const r3 = resolve('make a video for the channel', REEL_WORLDS, ALL_CONCIERGE_TASKS);
  check('"make a video for the channel" still reaches the episode drafter',
    (r3.kind === 'go' && r3.task?.id === 'draft-episode') || (r3.kind === 'suggest' && !!r3.suggestions?.some((t) => t.id === 'draft-episode')));
  check('the topic survives extraction ("…for real estate reel" → "real estate")',
    reelTopic('lets make an ai video for real estate reel') === 'real estate');
  check('"a reel about lake geneva" → topic "lake geneva"', reelTopic('lets make a reel about lake geneva') === 'lake geneva');
  check('an all-shell ask has NO topic (the studio keeps its own seed)', reelTopic('make a reel') === null);
  check('the courtesy prefix strips too', reelTopic('garvis, make me an ai video about compound interest') === 'compound interest');
  const noWorld = resolve('lets make an ai video for real estate reel', [WORLDS[0]!], ALL_CONCIERGE_TASKS);
  check('without a growth world, the reel ask is honest (missingWorld → the Businesses door)',
    noWorld.kind === 'go' && noWorld.task?.id === 'reel' && noWorld.missingWorld === true && noWorld.route === '/garvis/webs');
}

// ---- THE SURFACE TIER — the open board/builder claims the ask, conservatively ----
{
  const SOCIAL = ['post', 'social', 'instagram', 'ig', 'caption'];
  // The operator's own sentences, typo and all.
  const make = parseBoardCommand('make one with a background of lake', SOCIAL);
  check('"make one with a background of lake" → MAKE on the open board', make?.kind === 'make');
  check('…and the payload is the idea, not the command words', make?.text === 'a background of lake');
  const riff = parseBoardCommand("make another rendidtiion on this one but i want to add text saying 'love lake geneva'", SOCIAL);
  check('"another rendidtiion on this one but…" (typo and all) → RIFF', riff?.kind === 'riff');
  check("…instruction extracted intact: add text saying 'love lake geneva'", riff?.text === "add text saying 'love lake geneva'");
  const before = parseBoardCommand('make the sky pink on this one', SOCIAL);
  check('an instruction BEFORE the pointer survives ("make the sky pink on this one")',
    before?.kind === 'riff' && before.text === 'make the sky pink');
  check('a bare riff opens the rendition input (empty instruction is honest)',
    parseBoardCommand('make another version of this', SOCIAL)?.kind === 'riff' && parseBoardCommand('make another version of this', SOCIAL)?.text === '');
  check('the board noun claims MAKE ("make a post about the fall market" → "the fall market")',
    parseBoardCommand('make a post about the fall market', SOCIAL)?.text === 'the fall market');
  check('plurals fold onto the noun ("make some posts…")', parseBoardCommand('make some posts for the weekend', SOCIAL)?.kind === 'make');
  check('a DIFFERENT door is never claimed ("make a video for the channel" on the postcard board)',
    parseBoardCommand('make a video for the channel', ['postcard', 'card', 'mailer']) === null);
  check('navigation is never claimed ("open the queue")', parseBoardCommand('open the queue', SOCIAL) === null);
  check('a subject "this" is not a pointer ("make a post of this quarters numbers" → MAKE, not riff)',
    parseBoardCommand('make a post of this quarters numbers', SOCIAL)?.kind === 'make');

  check('builder verbs claim ("add a custom automation that emails new leads")',
    parseBuilderCommand('add a custom automation that emails new leads')?.kind === 'instruct');
  check('…and the instruction rides INTACT', parseBuilderCommand('add a custom automation that emails new leads')?.text === 'add a custom automation that emails new leads');
  check('builder never claims navigation ("open the queue")', parseBuilderCommand('open the queue') === null);
  check('builder never claims questions ("how do i add a page")', parseBuilderCommand('how do i add a page') === null);
  check('too-short imperatives fall through ("add it")', parseBuilderCommand('add it') === null);
}

// ---- PROJECT DOORS — the operator's builder projects are sayable, claims respected ----
{
  const tasks = withProjectTasks(ALL_CONCIERGE_TASKS, [
    { id: 'p1', name: 'Jims Landscaping' },
    { id: 'p2', name: 'Idea Digest Spark' },
  ]);
  const r1 = resolve('work on jims website', WORLDS, tasks);
  check('"work on jims website" reaches the jims project (go or suggested)',
    (r1.kind === 'go' && r1.task?.id === 'proj:p1') || (r1.kind === 'suggest' && !!r1.suggestions?.some((t) => t.id === 'proj:p1')));
  const r2 = resolve('open idea digest spark', WORLDS, tasks);
  check('a project NAME is a confident door ("open idea digest spark")', r2.kind === 'go' && r2.task?.id === 'proj:p2' && r2.route === '/project/p2');
  check('claimed words never leak to projects (no project task carries "website")',
    tasks.filter((t) => t.id.startsWith('proj:')).every((t) => !t.keywords.includes('website')));
  check('withProjectTasks is deterministic and additive',
    tasks.length === ALL_CONCIERGE_TASKS.length + 2 && JSON.stringify(tasks) === JSON.stringify(withProjectTasks(ALL_CONCIERGE_TASKS, [{ id: 'p1', name: 'Jims Landscaping' }, { id: 'p2', name: 'Idea Digest Spark' }])));
  check('no projects, no change', withProjectTasks(ALL_CONCIERGE_TASKS, []) === ALL_CONCIERGE_TASKS);
}

console.log(`\nconcierge.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} concierge check(s) failed`);
