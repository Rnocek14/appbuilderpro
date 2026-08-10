// src/lib/garvis/concierge.ts
// THE CONCIERGE — pure core (verified by concierge.verify.ts). The corner agent's brain: the
// operator says what they want IN THEIR OWN WORDS ("lets work on moms postcard", "start a
// clothing brand") and this core resolves it to a destination, the human steps once there, and —
// for creation asks — the existing creator to prefill (genesis intent or a one-click template).
// The design rules:
//   - TASK-FIRST: the app is organized by things (businesses → areas → studios); the operator
//     thinks in tasks. This registry is the translation layer, in the operator's language.
//   - DETERMINISTIC TIER FIRST: known asks match instantly with zero AI round-trip. Ambiguity
//     returns honest suggestions, never a guess acted on.
//   - CREATION IS ALWAYS CONFIRMED: a create-task never silently makes anything — it routes to
//     the existing genesis/template flows (prefilled), where creating stays an explicit act.
//   - Steps are the walkthrough (the standing-card SOP pattern applied to the HUMAN's clicks).
// Pure + deterministic: same input, same resolution.

export interface ConciergeWorld {
  id: string;
  title: string;
  slugs: string[];   // cluster slugs — how templates are recognized (workweb.templateForWeb logic)
}

export type TaskKind = 'navigate' | 'create';

export interface ConciergeTask {
  id: string;
  label: string;             // shown as the matched task ("Get a postcard ready to mail")
  keywords: string[];        // lowercase; ≥2 hits (or a 2-word input fully hitting) matches
  kind: TaskKind;
  /** Where to go. Placeholders: {worldId} resolves via worldSlug against the operator's worlds. */
  route: string;
  worldSlug?: string;        // a cluster slug that identifies the target world (e.g. 'direct-mail')
  /** For create tasks that prefill the genesis intent box (sessionStorage handoff). */
  genesisIntent?: string;
  /** For create tasks with a one-click template on the Businesses page. */
  templateId?: string;
  steps: string[];           // the walkthrough shown in the dock after arrival (2-6 steps)
}

export const CONCIERGE_TASKS: ConciergeTask[] = [
  {
    id: 'postcard',
    label: 'Get a postcard ready to mail',
    keywords: ['postcard', 'post card', 'mail', 'mailer', 'direct mail', 'moms', "mom's", 'mom', 'real estate'],
    kind: 'navigate',
    route: '/garvis/webs/{worldId}',
    worldSlug: 'direct-mail',
    steps: [
      'Tap the Postcard node on the canvas (center of the page)',
      'Pick the listing and look — the sheet builds the postcard from real details',
      'Save it; the print-and-mail run lands in your Queue',
      'Approve in Queue — nothing mails without you',
    ],
  },
  {
    id: 'work-on-world',
    label: 'Open a business workspace',
    // Nouns only — generic verbs ('work on', 'open') collide with every specific task.
    keywords: ['businesses', 'ventures', 'workspaces', 'my businesses'],
    kind: 'navigate',
    route: '/garvis/webs',
    steps: ['Pick the business — each opens on its main work surface'],
  },
  {
    id: 'draft-episode',
    label: "Draft today's channel episode",
    keywords: ['episode', 'draft', 'channel', 'video', 'content', 'today', 'script'],
    kind: 'navigate',
    route: '/garvis/channels',
    steps: [
      'Open your channel (the pulse shows where you are in the arc)',
      'Press "Draft a cited episode" — topic optional',
      'Review the script and hooks; Produce it, or download the shot list and film it',
      'Approve the post in Queue',
    ],
  },
  {
    id: 'start-channel',
    label: 'Start a content channel',
    keywords: ['start', 'channel', 'tiktok', 'youtube', 'faceless', 'content channel', 'audience'],
    kind: 'navigate',
    route: '/garvis/channels',
    steps: ['Press "Start a channel" — one click sets up the whole line', 'Pick a channel preset inside (Caregiver / health, Finance facts…)', 'Draft the first episode'],
  },
  {
    id: 'approvals',
    label: "See what's waiting on me",
    keywords: ['waiting', 'approve', 'approvals', 'queue', 'pending', 'decisions', 'review', 'waiting on me'],
    kind: 'navigate',
    route: '/garvis/queue',
    steps: ['One pass, top to bottom — j/k to move, a to approve, x to reject'],
  },
  {
    id: 'prospects',
    label: 'Find new prospects',
    keywords: ['prospects', 'leads', 'find', 'clients', 'pipeline', 'scrape', 'businesses'],
    kind: 'navigate',
    route: '/garvis/leads',
    steps: ['Press "Scrape the web" — the pipeline fills on its own', 'Open any prospect → "Build & send" makes the demo and pitch in one click'],
  },
  {
    id: 'new-app',
    label: 'Create a new app project',
    keywords: ['new', 'project', 'app', 'build', 'create', 'software'],
    kind: 'navigate',
    route: '/new',
    steps: ['Describe the app — the builder scaffolds it', 'Iterate in the project workspace; deploys stay approval-gated'],
  },
  {
    id: 'new-realtor',
    label: 'Add another real-estate agent (their whole marketing system)',
    keywords: ['add', 'another', 'real estate', 'realtor', 'agent', 'new client'],
    kind: 'create',
    route: '/garvis/webs',
    genesisIntent: 'Build a full real-estate marketing system for another agent — listings marketing, direct mail postcards, newsletter, social, CRM. The agent is ',
    steps: [
      'Finish the sentence with who they are (name, market, brokerage)',
      'Press "Draft the web" — every area arrives with its reason',
      'Approve the draft; the new business appears next to the others',
    ],
  },
  {
    id: 'business-plan',
    label: 'Create a business plan / whole business system for someone',
    keywords: ['business plan', 'brother', 'sister', 'friend', 'plan', 'business for'],
    kind: 'create',
    route: '/garvis/webs',
    genesisIntent: 'Build a full business system — brand, marketing, outreach, and a plan. It is for ',
    steps: [
      'Finish the sentence with what they do and what they need',
      'Press "Draft the web" — the plan and workspaces arrive as a reviewable draft',
      'Approve it; work starts in the new business',
    ],
  },
  {
    id: 'clothing-brand',
    label: 'Start a clothing brand',
    keywords: ['clothing', 'brand', 'apparel', 'merch', 'fashion', 'shop'],
    kind: 'create',
    route: '/garvis/webs',
    genesisIntent: 'Start a clothing brand — brand identity, a shop, social content, and launch marketing. The brand is ',
    steps: [
      'Finish the sentence with the brand idea (style, audience, name if you have one)',
      'Press "Draft the web" — Garvis designs the brand\'s workspaces',
      'Approve the draft, then work the areas it created',
    ],
  },
  {
    id: 'money',
    label: 'Check my money / invoices',
    keywords: ['money', 'invoices', 'revenue', 'billing', 'paid', 'owe'],
    kind: 'navigate',
    route: '/garvis/money',
    steps: ['The honest picture loads on its own — invoices, subscriptions, what is owed'],
  },
  {
    id: 'spend-caps',
    label: 'Set my AI spending caps',
    keywords: ['spend', 'caps', 'limit', 'api', 'keys', 'card', 'settings', 'budget'],
    kind: 'navigate',
    route: '/settings',
    steps: ['Spend guard is on the Settings page — set the cap; the kill switch is instant'],
  },
  {
    id: 'film-episode',
    label: 'Film an episode myself (shot list + UGC)',
    keywords: ['film', 'shot list', 'ugc', 'camera', 'footage', 'record', 'myself'],
    kind: 'navigate',
    route: '/garvis/channels',
    steps: [
      'Open your channel and the episode → "Shot list (film it yourself)" downloads the filming sheet',
      'Film per the sheet — one setup, 2-3 takes per line',
      'Drop the takes in the UGC Studio below; auto-cut removes the pauses',
      'Render the cut, then approve the post in Queue',
    ],
  },
  {
    id: 'whats-next',
    label: "What's next — my next move",
    keywords: ['whats next', "what's next", 'what should i do', 'where do i start', 'next move', 'plan my day', 'what now', 'im lost', "i'm lost"],
    kind: 'navigate',
    route: '/garvis/command',
    steps: [
      'Home opens on your next move — the top card is the answer, with why',
      'Work it or skip to the next; anything needing approval lives in Queue',
    ],
  },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();

/** Universal navigation verbs. They BOOST, never carry: a verb phrase adds its weight only to
 *  tasks the sentence already hits on a distinctive word — so "take me to the fleet" clears the
 *  match threshold — but a verb alone matches nothing, and because every real match gets the
 *  same boost, the lead between two candidates (the confidence signal) is never distorted. */
export const NAV_VERBS = ['open', 'go to', 'show me', 'take me to', 'where is', 'set up'];

export interface ConciergeMatch {
  task: ConciergeTask;
  score: number;
}

/** Score every task against the operator's sentence: +1 per keyword hit (multi-word keywords are
 *  worth their word count — 'direct mail' beats 'mail'), plus the universal verb boost for tasks
 *  with at least one real hit. Deterministic; ties break by registry order (most specific tasks
 *  are listed first). */
export function matchTasks(input: string, tasks: ConciergeTask[] = CONCIERGE_TASKS): ConciergeMatch[] {
  const text = ` ${norm(input)} `;
  if (text.trim().length < 3) return [];
  const verbBoost = NAV_VERBS.reduce((n, v) => n + (text.includes(` ${norm(v)} `) ? norm(v).split(' ').length : 0), 0);
  return tasks
    .map((task) => {
      const base = task.keywords.reduce((n, k) => n + (text.includes(` ${norm(k)} `) ? norm(k).split(' ').length : 0), 0);
      return { task, score: base > 0 ? base + verbBoost : 0 };
    })
    .filter((m) => m.score >= 2)
    .sort((a, b) => b.score - a.score);
}

export interface Resolution {
  kind: 'go' | 'suggest' | 'none';
  task?: ConciergeTask;
  route?: string;              // fully resolved (worldId substituted) when kind === 'go'
  missingWorld?: boolean;      // the task wanted a world that doesn't exist yet
  suggestions?: ConciergeTask[];
}

/** Resolve a task's route against the operator's real worlds — used by resolve() for tier-1 picks
 *  and by the dock for AI-tier picks and tapped suggestions (which skip keyword matching). */
export function routeFor(task: ConciergeTask, worlds: ConciergeWorld[]): { route: string; missingWorld: boolean } {
  if (task.route.includes('{worldId}')) {
    const world = worlds.find((w) => task.worldSlug && w.slugs.includes(task.worldSlug));
    if (!world) return { route: '/garvis/webs', missingWorld: true };
    return { route: task.route.replace('{worldId}', world.id), missingWorld: false };
  }
  return { route: task.route, missingWorld: false };
}

/** Resolve a sentence to ONE confident action, honest suggestions, or nothing. Confident = the
 *  top match leads by ≥2 or is the only match. A world-scoped task without its world falls back
 *  to the Businesses page with missingWorld set — the dock says so instead of pretending. */
export function resolve(input: string, worlds: ConciergeWorld[], tasks: ConciergeTask[] = CONCIERGE_TASKS): Resolution {
  const matches = matchTasks(input, tasks);
  if (!matches.length) return { kind: 'none' };
  const [top, second] = matches;
  const confident = matches.length === 1 || top.score >= (second?.score ?? 0) + 2;
  if (!confident) return { kind: 'suggest', suggestions: matches.slice(0, 3).map((m) => m.task) };
  const { route, missingWorld } = routeFor(top.task, worlds);
  return missingWorld ? { kind: 'go', task: top.task, route, missingWorld } : { kind: 'go', task: top.task, route };
}

// ---------------------------------------------------------------------------------------------
// THE DERIVATION LAYER — "every door is sayable". The handwritten tasks above cover the asks the
// operator actually voiced; this derives the REST of the platform from its own registries (nav
// destinations, one-click templates, channel presets, automation capabilities) so the concierge
// knows every feature without anyone maintaining a second list. Two rules keep it honest:
//   - ROUTE CLAIM: a nav destination already served by a handwritten task is skipped — the
//     handwritten steps are better than generic ones, and twins would split the match score.
//   - WORD CLAIM: handwritten tasks own their vocabulary (every keyword, its words, and their
//     singular/plural folds). Derived tasks only get leftover words, so they can NEVER outrank
//     or tie an acceptance-tested match. A derived task stripped of all its words (e.g. the
//     Content Channel template, whose whole name is claimed) keeps an empty keyword list:
//     unreachable by tier-1, still offered to the AI tier — which is exactly the contract
//     (tier 1 exact and free, tier 2 smart and metered).
// The NAV_VERBS boost in matchTasks does the rest: one distinctive word plus a verb phrase
// ("take me to the fleet") clears the threshold on any derived task.
// ---------------------------------------------------------------------------------------------

export interface DerivedSources {
  nav: { to: string; label: string }[];
  templates: { id: string; title: string }[];
  presets: { id: string; label: string; niche: string }[];
  /** Capabilities with status 'not_built' are documented but never proposed — same rule here. */
  capabilities: { id: string; title: string; status?: string }[];
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'your', 'my', 'me', 'you', 'to', 'of', 'in', 'on', 'with', 'after', 'all', 'its', 'it', 'is', 'at', 'by', 'from', 'up', 'out']);

/** Cheap singular/plural fold (invoice↔invoices) so a plural never misses a singular title. */
const fold = (w: string) => (w.endsWith('s') ? w.slice(0, -1) : `${w}s`);

/** Distinctive words of a phrase: normalized, no stopwords, ≥minLen chars, plus their folds. */
function significantWords(text: string, minLen = 3): string[] {
  const out: string[] = [];
  for (const w of norm(text).split(' ')) {
    if (w.length < minLen || STOP.has(w)) continue;
    out.push(w, fold(w));
  }
  return out;
}

/** Combine the handwritten tasks with tasks derived from the platform's own registries.
 *  Pure and deterministic: same registries in, same task list out. */
export function deriveTasks(existing: ConciergeTask[], src: DerivedSources): ConciergeTask[] {
  const claimedRoutes = new Set(existing.map((t) => t.route));
  const claimed = new Set<string>();
  for (const t of existing) for (const k of t.keywords) {
    claimed.add(norm(k));
    for (const w of norm(k).split(' ')) { claimed.add(w); claimed.add(fold(w)); }
  }
  const free = (words: string[]) => [...new Set(words.filter((w) => w && !claimed.has(w)))];

  const derived: ConciergeTask[] = [];

  for (const item of src.nav) {
    if (claimedRoutes.has(item.to)) continue;
    derived.push({
      id: `nav:${item.to}`,
      label: `Open ${item.label}`,
      keywords: free([norm(item.label), ...significantWords(item.label)]),
      kind: 'navigate',
      route: item.to,
      steps: [`${item.label} opens on its live work — set-once controls stay behind its setup disclosure`],
    });
  }

  for (const t of src.templates) {
    derived.push({
      id: `tpl:${t.id}`,
      label: `Build "${t.title}" (one-click template)`,
      keywords: free([norm(t.title), ...significantWords(t.title)]),
      kind: 'create',
      route: '/garvis/webs',
      templateId: t.id,
      steps: [
        `Tap "${t.title}" under "Build in one click" — one press builds the whole operation, no AI needed`,
        'Review the areas it created — rename or trim any time',
        'Anything it wants to send still waits for you in Queue',
      ],
    });
  }

  for (const p of src.presets) {
    derived.push({
      id: `preset:${p.id}`,
      label: `Start the ${p.label} channel`,
      keywords: free([norm(p.label), ...significantWords(p.label), ...significantWords(p.niche, 5).slice(0, 8)]),
      kind: 'navigate',
      route: '/garvis/channels',
      steps: [
        'Press "Start a channel" — one click sets up the whole line',
        `Pick the "${p.label}" preset inside the studio`,
        'Draft the first episode',
      ],
    });
  }

  for (const c of src.capabilities) {
    if (c.status === 'not_built') continue;
    derived.push({
      id: `cap:${c.id}`,
      label: `Set up: ${c.title}`,
      keywords: free([norm(c.title), ...significantWords(c.title, 4)]),
      kind: 'navigate',
      route: '/garvis/automations',
      steps: [
        `Find "${c.title}" on Automations — its card says what it does, its rung, and its price`,
        'Turn it on from the card — anything it sends stays approval-gated in Queue',
      ],
    });
  }

  return [...existing, ...derived];
}
