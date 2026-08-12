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

import { verticalCount } from './verticalPlan';
import { matchPlanShape } from './masterPlan';

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
  /** WORLD×AREA cross-match: when a word from EACH set hits ("mom" + "video"), the pairing IS
   *  the meaning — matchTasks adds a bonus so the operator's own asset graph outranks generic
   *  doors. Only world-area tasks (deriveWorldTasks) set this. */
  crossSets?: [string[], string[]];
  steps: string[];           // the walkthrough shown in the dock after arrival (2-6 steps)
}

export const CONCIERGE_TASKS: ConciergeTask[] = [
  {
    id: 'postcard',
    label: 'Get a postcard ready to mail',
    keywords: ['postcard', 'post card', 'mail', 'mailer', 'direct mail', 'moms', "mom's", 'mom', 'real estate', 'card', 'just sold', 'just listed'],
    kind: 'navigate',
    // Deep-links INTO the area (?area= auto-opens it) — the machine taps the node, not you.
    route: '/garvis/webs/{worldId}?area=direct-mail',
    worldSlug: 'direct-mail',
    steps: [
      "You're already on the Postcard board — pick a kind, type the idea, hit Make; real facts fill in",
      'Compare the versions, star the keeper, Print',
      'Mail runs need your Approve in Queue — nothing sends without you',
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
    id: 'reel',
    label: 'Make an AI reel',
    // 'reel about/on/for' phrases outvote a topic's own place-words ("a reel about lake geneva"
    // must open the reel studio with lake geneva as the TOPIC, not the market page).
    keywords: ['reel', 'reels', 'ai video', 'ai videos', 'faceless video', 'vertical video', 'short video', 'reel about', 'reel on', 'reel for'],
    kind: 'navigate',
    route: '/garvis/webs/{worldId}?area=growth-studio',
    worldSlug: 'growth-studio',
    steps: [
      "You're in the channel studio — your topic rode into the box; press Draft a cited episode",
      'Hook variants come back — pick one, produce it faceless, or film the shot list yourself',
      'The post waits for your approval in Queue — nothing publishes itself',
    ],
  },
  {
    id: 'grow-verticals',
    label: 'Grow vertical channels (followings that funnel somewhere)',
    // The STRATEGY ask: "ai slop videos", "instagram verticals", "build a following … to market
    // my app". The door is Channels — one faceless channel per niche, each CTA pointed at the
    // thing being marketed. Phrases carry the intent words the app-builder must never steal
    // ("build a following" is audience work, not software).
    keywords: [
      'verticals', 'vertical', 'niches', 'ai slop', 'slop', 'slop videos', 'slop channels',
      'following', 'followers', 'build a following', 'grow a following', 'build an audience',
      'grow an audience', 'instagram', 'tiktok',
    ],
    kind: 'navigate',
    route: '/garvis/channels?plan=verticals',
    steps: [
      'The planner is open — one channel per niche, each with its persona, look, and first episodes',
      'Point the CTA link at the thing you\'re marketing — every channel funnels there',
      'Press Implement — channels, the daily draft clock, and episode one land in one run',
      'Everything posts through your Queue — nothing goes out without you',
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
    keywords: ['waiting', 'approve', 'approvals', 'queue', 'pending', 'decisions', 'waiting on me'],
    kind: 'navigate',
    route: '/garvis/queue',
    steps: ['One pass, top to bottom — j/k to move, a to approve, x to reject'],
  },
  {
    id: 'prospects',
    label: 'Find new prospects',
    keywords: ['prospects', 'leads', 'find', 'pipeline', 'scrape', 'new clients'],
    kind: 'navigate',
    route: '/garvis/leads',
    steps: ['Press "Scrape the web" — the pipeline fills on its own', 'Open any prospect → "Build & send" makes the demo and pitch in one click'],
  },
  {
    id: 'new-app',
    label: 'Create a new app project',
    keywords: ['project', 'app', 'build', 'create', 'software', 'website', 'builder'],
    kind: 'navigate',
    route: '/new',
    steps: ['Describe the app — the builder scaffolds it', 'Iterate in the project workspace; deploys stay approval-gated'],
  },
  {
    id: 'new-realtor',
    label: 'Add another real-estate agent (their whole marketing system)',
    keywords: ['add', 'another', 'real estate', 'realtor', 'agent', 'new client', 'onboard'],
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
    id: 'client-book',
    label: 'Open my client book (existing clients)',
    // Bare 'clients' means the people you HAVE — prospecting keeps 'new clients'/'leads'.
    keywords: ['clients', 'client book', 'my clients', 'client list'],
    kind: 'navigate',
    route: '/garvis/client-book',
    steps: ['Your clients load on their own — tap one for the full record', 'Add a client with the one button; follow-ups ride the Queue'],
  },
  {
    id: 'mailing-lists',
    label: 'Work the mailing lists / neighborhood farm',
    keywords: ['mailing list', 'mailing lists', 'mailing', 'farm', 'farming', 'neighborhood farm', 'owner list'],
    kind: 'navigate',
    route: '/garvis/webs/{worldId}?area=mailing-lists',
    worldSlug: 'mailing-lists',
    steps: [
      'The lists desk opens on the real audience — every contact is a stored row, never invented',
      'The Farm panel schedules the monthly mailing from your saved postcard design',
      'Every send still lands in Queue for your approval',
    ],
  },
  {
    id: 'money',
    label: 'Check my money / invoices',
    keywords: ['money', 'invoices', 'revenue', 'billing', 'paid', 'owe', 'owed'],
    kind: 'navigate',
    route: '/garvis/money',
    steps: ['The honest picture loads on its own — invoices, subscriptions, what is owed', 'To chase unpaid invoices automatically, turn on Invoice chasing under Automations'],
  },
  {
    id: 'spend-caps',
    label: 'Set my AI spending caps',
    keywords: ['spend', 'caps', 'limit', 'api', 'keys', 'settings', 'budget'],
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
    keywords: ['whats next', "what's next", 'what should i do', 'where do i start', 'next move', 'plan my day', 'what now', 'im lost', "i'm lost", 'home', 'go home', 'homepage', 'my day', 'today'],
    kind: 'navigate',
    route: '/garvis/command',
    steps: [
      'Home opens on your next move — the top card is the answer, with why',
      'Work it or skip to the next; anything needing approval lives in Queue',
    ],
  },
  {
    id: 'orchestrate',
    label: 'Make me a plan (one reviewable plan over everything Garvis can do)',
    keywords: [
      'orchestrate', 'whole plan', 'big plan', 'everything at once', 'multiple things', 'compile',
      'plan out', 'plan how', 'make a plan', 'make me a plan', 'game plan', 'strategy', 'roadmap',
    ],
    kind: 'navigate',
    route: '/garvis/orchestrate',
    steps: [
      'A known play arrives already compiled — anything else, press "Compile the plan"',
      'Review each step: its why, its risk, what it produces; holes and questions show honestly',
      'Approve to run — anything outbound still waits for you in Queue',
    ],
  },
  {
    id: 'send-emails',
    label: 'Send emails to a group (compiled + approval-gated)',
    keywords: ['email', 'emails', 'send emails', 'email blast', 'newsletter', 'email my', 'past clients'],
    kind: 'navigate',
    route: '/garvis/orchestrate',
    steps: [
      'Your ask is in the intent box — press "Compile the plan"; it drafts an email step for the right segment',
      'Answer anything it asks (which list, what about) — it never invents recipients',
      'The send lands in Queue — nothing mails until you approve it there',
    ],
  },
  {
    id: 'listings',
    label: 'Pull the housing market / listings data',
    keywords: ['listings', 'houses', 'mls', 'housing', 'sold', 'market data', 'market', 'lake geneva', 'properties', 'scraper'],
    kind: 'navigate',
    route: '/garvis/webs/{worldId}?area=lake-geneva-market',
    worldSlug: 'lake-geneva-market',
    steps: [
      'This is the Market area — its numbers come from the real MLS/RESO feed, never invented',
      'Press refresh on the market panel to pull the latest listings for the area',
      'Stats (inventory, solds by zip) feed the Farm and postcard math automatically',
    ],
  },
  {
    id: 'app-marketing',
    label: 'Market one of my apps (the whole mapped operation)',
    keywords: ['market my app', 'market the app', 'app marketing', 'marketing', 'promote', 'promotion', 'marketing plan', 'marketing for', 'seo'],
    kind: 'navigate',
    route: '/garvis/orchestrate',
    steps: [
      'Your ask is in the intent box — press "Compile the plan"',
      'The plan stands up the mapped operation: competitor intel, SEO articles, social, video ideas, results',
      'Approve to run — the new business\'s canvas IS the plan, with a completeness % that rises as areas fill',
    ],
  },
  {
    id: 'design-board',
    label: 'Design on the board (logos, concepts — spread, compare, riff)',
    keywords: ['logo', 'logos', 'logo concepts', 'design board', 'moodboard', 'mood board', 'crest', 'monogram', 'wordmark', 'design', 'designs'],
    kind: 'navigate',
    route: '/garvis/webs',
    steps: [
      "Open the business, then tap its Brand node — the creative board spreads",
      'Press "Make a concept" — each lands as a tile beside the others, never replacing them',
      'Click any tile and SAY what to change ("more minimal", "warmer") — the riff keeps its parent',
      'Star the keepers, group directions, archive the rest — the board is the memory',
    ],
  },
  {
    // Reached ONLY through the dock's brief-capture card (no keywords — pasted briefs skip
    // matching entirely); the guide that meets the operator on the Businesses page.
    id: 'big-brief',
    label: 'Design the business from my brief',
    keywords: [],
    kind: 'navigate',
    route: '/garvis/webs',
    steps: [
      'Your ENTIRE brief is in the intent box — every section, untouched',
      'Press "Draft the web" — Garvis designs the whole operation around it (brand vault, studios, results)',
      'Approve the draft; then say "do research the market for <name>" and the intel area fills',
    ],
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm with Garvis (ideas, angles, strategies)',
    keywords: ['brainstorm', 'ideas', 'creative', 'strategies', 'come up with', 'new angles', 'think with me', 'ideate', 'inspiration', 'instagram'],
    kind: 'navigate',
    route: '/garvis/command',
    steps: [
      'Garvis is already thinking about it — your ask sent itself into the conversation',
      'Push back and riff — anything consequential it proposes becomes an approval-gated mission',
      'Keep what you like: send winners into the right studio from the chat',
    ],
  },
  {
    id: 'explore',
    label: 'Explore an idea (the Knowledge Universe)',
    // 'galaxy'/'universe' stay with the Galaxy nav page (every world in one sky) — this is the
    // curiosity spike, a different door.
    keywords: ['explore', 'explorer', 'curious', 'rabbit hole', 'learn about', 'deep dive'],
    kind: 'navigate',
    route: '/garvis/explore',
    steps: [
      'Say what you\'re curious about — it becomes a living galaxy you can dive into',
      'Branch and gather as you go; the universe only grows, it never erases a world',
    ],
  },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();

/** Universal navigation verbs. They BOOST, never carry: a verb phrase adds its weight only to
 *  tasks the sentence already hits on a distinctive word — so "take me to the fleet" or "check
 *  my money" clears the match threshold — but a verb alone matches nothing, and because every
 *  real match gets the same boost, the lead between two candidates (the confidence signal) is
 *  never distorted. None of these may appear as a task keyword (the verify suite holds that). */
export const NAV_VERBS = [
  'open', 'go to', 'show me', 'take me to', 'where is', 'set up', 'work on',
  'check', 'see', 'view', 'look at', 'whats', "what's", 'i want to', 'i need to', 'lets', 'make',
];

export interface ConciergeMatch {
  task: ConciergeTask;
  score: number;
}

/** Score every task against the operator's sentence: +1 per keyword hit (multi-word keywords are
 *  worth their word count — 'direct mail' beats 'mail'), plus a UNIQUENESS bonus (+1) when no
 *  other task in the list claims that keyword — a word only one task owns IS the operator naming
 *  that task, so "check my money" resolves on one distinctive word. Tasks with at least one real
 *  hit also get the universal verb boost. Deterministic; ties break by registry order. */
export function matchTasks(input: string, tasks: ConciergeTask[] = CONCIERGE_TASKS, minScore = 2): ConciergeMatch[] {
  const text = ` ${norm(input)} `;
  if (text.trim().length < 3) return [];
  const owners = new Map<string, number>();
  // Cross-set (world×area) tasks ride on PAIRINGS, not word ownership — they never dilute the
  // uniqueness of another task's vocabulary ("brand" stays the clothing-brand task's word).
  for (const t of tasks) { if (t.crossSets) continue; for (const k of new Set(t.keywords.map(norm))) owners.set(k, (owners.get(k) ?? 0) + 1); }
  const verbBoost = NAV_VERBS.reduce((n, v) => n + (text.includes(` ${norm(v)} `) ? norm(v).split(' ').length : 0), 0);
  return tasks
    .map((task) => {
      let base = task.keywords.reduce((n, k) => {
        const nk = norm(k);
        if (!text.includes(` ${nk} `)) return n;
        return n + nk.split(' ').length + (owners.get(nk) === 1 ? 1 : 0);
      }, 0);
      // The WORLD×AREA cross rule: "mom" and "video" are each weak alone, but together they
      // name exactly one place. A cross task fires ONLY on the pairing (either word alone is
      // someone else's business), and the pairing earns a bonus beyond the sum of its words.
      if (task.crossSets) {
        const hit = (set: string[]) => set.some((w) => text.includes(` ${norm(w)} `));
        base = hit(task.crossSets[0]) && hit(task.crossSets[1]) ? base + 2 : 0;
      }
      return { task, score: base > 0 ? base + verbBoost : 0 };
    })
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

export interface Resolution {
  kind: 'go' | 'suggest' | 'compound' | 'none';
  task?: ConciergeTask;
  route?: string;              // fully resolved (worldId substituted) when kind === 'go'
  missingWorld?: boolean;      // the task wanted a world that doesn't exist yet
  suggestions?: ConciergeTask[];
}

// ---------------------------------------------------------------------------------------------
// TIER 0 — LEARNED SHORTCUTS. When the AI tier resolves a sentence, the dock remembers the
// mapping (localStorage, exact normalized sentence → task id), so the operator's own phrasing
// becomes instant and free the second time. Pure helpers; the dock owns storage.
// ---------------------------------------------------------------------------------------------

export interface ConciergeAlias { sentence: string; taskId: string }

/** The normalized form used as an alias's identity (also the DB primary-key component). */
export const aliasKey = (s: string): string => norm(s);

/** Exact-phrase lookup (normalized). Returns the learned task id or null. */
export function aliasLookup(input: string, aliases: ConciergeAlias[]): string | null {
  const n = norm(input);
  if (!n) return null;
  return aliases.find((a) => norm(a.sentence) === n)?.taskId ?? null;
}

/** Remember a resolution, newest first, deduped by normalized sentence, capped. */
export function aliasRemember(input: string, taskId: string, aliases: ConciergeAlias[], cap = 50): ConciergeAlias[] {
  const n = norm(input);
  if (!n || n.length < 3 || !taskId) return aliases;
  const rest = aliases.filter((a) => norm(a.sentence) !== n);
  return [{ sentence: input.trim().slice(0, 200), taskId }, ...rest].slice(0, cap);
}

/** The Stark prefix: "garvis …" / "hey garvis …" is courtesy, "do …" is an execution order.
 *  Returns the stripped sentence and whether the operator explicitly asked for EXECUTION. */
export function parseCommandPrefix(input: string): { sentence: string; execute: boolean } {
  let s = input.trim();
  const courtesy = /^(hey |ok |okay )?garvis[,:]?\s+/i;
  if (courtesy.test(s)) s = s.replace(courtesy, '');
  const doPrefix = /^(do|run|execute|just do)[,:]?\s+/i;
  if (doPrefix.test(s)) return { sentence: s.replace(doPrefix, '').trim(), execute: true };
  return { sentence: s.trim(), execute: false };
}

/** While a compiled plan is on screen, sentences like "actually make it 5 posts" are REVISIONS
 *  of that plan, not new commands. Word-anchored so ordinary asks never trigger it. */
export function isRevision(input: string): boolean {
  return /^(actually|instead|change|swap|make it|make that|add|remove|drop|skip|no[,.]|wait[,.]|also add)\b/i.test(input.trim());
}

/** The Explore bridge: "explore lakefront resort branding" should FALL INTO a galaxy of that
 *  topic, not land on an empty prompt. Strips the explore-verbs and returns the topic to dive
 *  on, or null when there is none (plain "lets explore" → the open page is right). */
export function exploreDive(sentence: string): string | null {
  const stripped = sentence.trim()
    .replace(/^(lets |let's |lets go |can we |i want to |im |i'm )?(explore|deep dive into|deep dive on|learn about|go down the rabbit hole on|curious about)[:,]?\s*/i, '')
    .trim();
  // Only a stripped VERB yields a confident topic; an unchanged sentence means the operator
  // matched on a bare keyword ("rabbit hole") — the open page is the honest landing.
  if (!stripped || norm(stripped) === norm(sentence)) return null;
  return stripped.slice(0, 120);
}

// ---------------------------------------------------------------------------------------------
// SMALL TALK & HALTS — polite noise and stop-words deserve a FREE, honest, instant answer, never
// a navigation guess or a metered AI call. Two real misroutes forced this tier: "never mind"
// confidently opened a project named Mind Weave, and "cancel the mail run" opened the postcard
// page as if asked to make one. Negations are the opposite of intent.
// ---------------------------------------------------------------------------------------------

export interface SmallTalk { kind: 'greet' | 'thanks' | 'affirm' | 'closure' | 'halt'; text: string }

const GREET_RE = /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening))( garvis)?[.!]*$/;
const THANKS_RE = /^(thanks|thank you|thank u|ty|thx|appreciate (it|you))( garvis)?( so much)?[.!]*$/;
const AFFIRM_RE = /^(ok|okay|k|yes|yep|yeah|cool|nice|great|perfect|awesome|good job|well done|love it|lol)[.!]*$/;
const CLOSURE_RE = /^(no|nope|nevermind|never mind|forget it|nothing|nah|na)[.!]*$/;
const HALT_RE = /^(stop|cancel|halt|abort|pause)\b|^(dont|don't|do not)\b/;

/** Classify chatter and halts. Null = a real ask — the tiers proceed. Deterministic. */
export function smallTalk(input: string): SmallTalk | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  if (GREET_RE.test(t)) return { kind: 'greet', text: "Hey. Say a door (“queue”), ask a number (“how many approvals”), or tell me what to make." };
  if (THANKS_RE.test(t)) return { kind: 'thanks', text: 'Anytime.' };
  if (AFFIRM_RE.test(t)) return { kind: 'affirm', text: 'Good. Next?' };
  if (CLOSURE_RE.test(t)) return { kind: 'closure', text: 'Dropped it — nothing was created.' };
  if (HALT_RE.test(t)) return {
    kind: 'halt',
    text: 'Nothing is mid-flight from this box. Anything outbound is still WAITING in your Queue (reject it there); running arcs live on Missions; the whole system’s Master Switch is on Mission Control.',
  };
  return null;
}

/** "go back" is a browser verb, not a destination. The dock steps back one page. */
export function isGoBack(input: string): boolean {
  return /^(go back|take me back|back)[.!]*$/.test(input.trim().toLowerCase());
}

/** The reel bridge: "lets make an ai video for real estate" carries its TOPIC into the reel
 *  studio's idea box, so the format's idea cards appear already about the right thing. Strips
 *  the ask-shell (verbs, articles, the video/reel nouns and their connectors) and returns what
 *  remains, or null when the sentence was all shell ("make a reel") — the studio then opens on
 *  its own seeded topic, honestly. */
export function reelTopic(sentence: string): string | null {
  let s = sentence.trim()
    .replace(/^(hey |ok |okay )?garvis[,:]?\s+/i, '')
    .replace(/^(lets |let's |can we |i want to |i need to |please )+/i, '')
    .replace(/^(make|create|draft|generate|do|shoot)\s+(me\s+)?(an?\s+)?/i, '')
    .replace(/^(ai|faceless|vertical|short)\s+/i, '')
    .replace(/^(video|videos|reel|reels)\s*(for|about|on|of)?\s*/i, '')
    .trim();
  s = s.replace(/\s+(reel|reels|video|videos)$/i, '').trim();
  if (!s || norm(s) === norm(sentence)) return null;
  return s.slice(0, 120);
}

/** A pasted BRIEF (a whole project written out — sections, paragraphs, a wall of thinking) is
 *  the most valuable input the system receives, and keyword-matching it would mangle it. Long
 *  or multi-line text is a brief: it skips every matching tier and rides INTACT into genesis
 *  (the business designer) or Orchestrate — never truncated, never replaced by a canned intent. */
export function isBrief(text: string): boolean {
  const t = text.trim();
  return t.length >= 280 || (t.match(/\n/g)?.length ?? 0) >= 3;
}

// ---------------------------------------------------------------------------------------------
// THE STATS TIER — number questions answered from REAL rows, free and instant, before the
// metered AI tier. Pure matching here; the queries live in conciergeStats.ts (impure).
// ---------------------------------------------------------------------------------------------

export interface StatQuery { id: string; keywords: string[] }

export const STAT_QUERIES: StatQuery[] = [
  { id: 'approvals_waiting', keywords: ['how many approvals', 'approvals waiting', 'anything waiting', 'pending approvals', 'how many pending', 'how many things are waiting'] },
  { id: 'episode_stats', keywords: ['how are my episodes', 'episode views', 'how did my videos do', 'channel stats', 'how is the channel doing', 'views this week', 'how many views', 'what worked', 'whats working', "what's working"] },
  { id: 'revenue_month', keywords: ['revenue this month', 'how much did i make', 'how much money did i make', 'income this month', 'what did i earn', 'how much have i made'] },
  { id: 'pipeline_count', keywords: ['how many leads', 'how many prospects', 'pipeline size', 'how big is my pipeline', 'how many businesses have you found'] },
  { id: 'arcs_running', keywords: ['what are you working on', 'whats running', "what's running", 'running arcs', 'active plans', 'what is in flight', 'what are you doing'] },
  { id: 'portfolio', keywords: ['how complete', 'portfolio status', 'project completeness', 'how far along', 'percent complete', 'completeness', 'hows my portfolio', 'how are my projects', 'app going', 'project going', 'hows the app', 'how are the apps'] },
];

/** Match a sentence to ONE stat, or null. Phrase-anchored (multi-word keywords only score when
 *  present verbatim), so command sentences like "check my money" never become stats. */
export function statsFor(input: string): string | null {
  const text = ` ${norm(input)} `;
  if (text.trim().length < 3) return null;
  let best: { id: string; score: number } | null = null;
  for (const q of STAT_QUERIES) {
    const score = q.keywords.reduce((n, k) => n + (text.includes(` ${norm(k)} `) ? norm(k).split(' ').length : 0), 0);
    if (score >= 2 && (!best || score > best.score)) best = { id: q.id, score };
  }
  return best?.id ?? null;
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

const CONJUNCTION = /\b(and|then|also|plus|after that)\b/;
const PROCEDURAL_QUESTION = /^(how do i|how to|can i|can you)\b/;
// Idioms where verb+noun means a DIFFERENT thing than the words: "open house" is a real-estate
// event, not "open the houses page". Stripped from the sentence before matching, so these asks
// reach the AI tier and get an honest answer instead of a confident misroute.
const IDIOMS = ['open house', 'open houses'];

/** Resolve a sentence to ONE confident action, honest suggestions, a COMPOUND handoff, or
 *  nothing. Confident = the top match leads by ≥2 or is the only match. A sentence that joins
 *  two different destinations with a conjunction ("find leads then email them") is a compound
 *  intent, not an ambiguity — the answer is Orchestrate (one reviewable plan), with the pieces
 *  offered as suggestions. A world-scoped task without its world falls back to the Businesses
 *  page with missingWorld set — the dock says so instead of pretending. */
export function resolve(input: string, worlds: ConciergeWorld[], tasks: ConciergeTask[] = CONCIERGE_TASKS): Resolution {
  let cleaned = ` ${norm(input)} `;
  for (const idiom of IDIOMS) cleaned = cleaned.split(` ${idiom} `).join(' ');
  const matches = matchTasks(cleaned.trim(), tasks);
  if (!matches.length) {
    // A procedural QUESTION never rides the weak tier either — "how do i connect my tiktok
    // account" wants an ANSWER, not two doors that share the word 'tiktok'.
    if (PROCEDURAL_QUESTION.test(norm(input))) return { kind: 'none' };
    // Sub-threshold degradation: a single SHARED-word hit ("system health" → the Health page and
    // the health channel preset) is a real signal even though no task clears the bar — offer the
    // hits as suggestions instead of pretending the sentence meant nothing.
    const weak = matchTasks(cleaned.trim(), tasks, 1);
    if (weak.length) return { kind: 'suggest', suggestions: weak.slice(0, 3).map((m) => m.task) };
    return { kind: 'none' };
  }
  const [top, second] = matches;
  // A procedural QUESTION with only a weak match wants an ANSWER, not a page — hand it to the
  // AI tier ("how do i connect my tiktok account" should be explained, not routed on 'tiktok').
  if (PROCEDURAL_QUESTION.test(norm(input)) && top.score < 4) return { kind: 'none' };
  // "plan seven verticals and make a structured plan" is ONE intent, not a compound: a sentence
  // that COUNTS its verticals/niches/channels is the vertical planner's signature, and the
  // planning clause restates the same artifact ('plan' alone would tie this into the
  // business-plan door). The counted door outranks the conjunction.
  const counted = matches.slice(0, 2).find((m) => m.task.id === 'grow-verticals');
  if (counted && verticalCount(input) !== null) {
    return { kind: 'go', task: counted.task, route: routeFor(counted.task, worlds).route };
  }
  // A plan-shaped sentence whose TOP door is already the planner goes CONFIDENTLY: the known
  // play compiles itself the moment Orchestrate opens (deterministic tier — no AI, no key), so
  // the door is not one option among three, it IS the answer. Scoped to top-match-only so the
  // prospect/genesis doors keep every sentence they own today.
  if (top.task.id === 'orchestrate' && matchPlanShape(input)) {
    return { kind: 'go', task: top.task, route: routeFor(top.task, worlds).route };
  }
  const distinctRoutes = new Set(matches.map((m) => m.task.route));
  if (CONJUNCTION.test(norm(input)) && distinctRoutes.size >= 2 && top.task.route !== '/garvis/orchestrate') {
    return { kind: 'compound', route: '/garvis/orchestrate', suggestions: matches.slice(0, 3).map((m) => m.task) };
  }
  const confident = matches.length === 1 || top.score >= (second?.score ?? 0) + 2;
  if (!confident) {
    // A tie between tasks that all land on the SAME resolved page ("lets work on the channel" —
    // draft-episode vs start-channel, both /garvis/channels) is not a real ambiguity: go with
    // the top match instead of making the operator pick between identical destinations.
    const { route: topRoute, missingWorld: topMissing } = routeFor(top.task, worlds);
    const sameDoor = matches.slice(0, 3).every((m) =>
      m.task.kind === 'navigate' && routeFor(m.task, worlds).route === topRoute);
    if (sameDoor && top.task.kind === 'navigate' && !topMissing) {
      return { kind: 'go', task: top.task, route: topRoute };
    }
    return { kind: 'suggest', suggestions: matches.slice(0, 3).map((m) => m.task) };
  }
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

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'your', 'my', 'me', 'you', 'to', 'of', 'in', 'on', 'with', 'after', 'all', 'its', 'it', 'is', 'at', 'by', 'from', 'up', 'out', 'month', 'months', 'week', 'weeks', 'year', 'years', 'daily', 'weekly', 'monthly']);

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
 *  Pure and deterministic: same registries in, same task list out. Handwritten keywords gain
 *  their plural/singular folds ("postcards" finds the postcard task); derived tasks keep only
 *  unclaimed words, but a task's exact label phrase survives unless a handwritten task claims
 *  that phrase VERBATIM — so "projects" still opens Projects even though 'project' is claimed. */
export function deriveTasks(existing: ConciergeTask[], src: DerivedSources): ConciergeTask[] {
  const claimedRoutes = new Set(existing.map((t) => t.route));
  const claimedExact = new Set<string>();   // keywords + their words, no folds — the phrase gate
  const claimed = new Set<string>();        // + folds — the strict word gate
  for (const t of existing) for (const k of t.keywords) {
    claimedExact.add(norm(k));
    claimed.add(norm(k));
    for (const w of norm(k).split(' ')) { claimedExact.add(w); claimed.add(w); claimed.add(fold(w)); }
  }
  const free = (words: string[]) => [...new Set(words.filter((w) => w && !claimed.has(w)))];
  /** Keywords for a derived task: the label phrase (unless verbatim-claimed) + unclaimed words. */
  const kw = (label: string, extra: string[] = [], minLen = 3) => {
    const phrase = norm(label);
    const words = free([...significantWords(label, minLen), ...extra]);
    return phrase && !claimedExact.has(phrase) ? [...new Set([phrase, ...words])] : words;
  };
  const foldKeywords = (t: ConciergeTask): ConciergeTask => ({
    ...t,
    keywords: [...new Set(t.keywords.flatMap((k) => (k.includes(' ') ? [k] : [k, fold(norm(k))])))],
  });

  const derived: ConciergeTask[] = [];

  for (const item of src.nav) {
    if (claimedRoutes.has(item.to)) continue;
    derived.push({
      id: `nav:${item.to}`,
      label: `Open ${item.label}`,
      keywords: kw(item.label),
      kind: 'navigate',
      route: item.to,
      steps: [`${item.label} opens on its live work — set-once controls stay behind its setup disclosure`],
    });
  }

  for (const t of src.templates) {
    derived.push({
      id: `tpl:${t.id}`,
      label: `Build "${t.title}" (one-click template)`,
      keywords: kw(t.title),
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
      keywords: kw(p.label, significantWords(p.niche, 5).slice(0, 8)),
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
      keywords: kw(c.title, [], 4),
      kind: 'navigate',
      route: '/garvis/automations',
      steps: [
        `Find "${c.title}" on Automations — its card says what it does, its rung, and its price`,
        'Turn it on from the card — anything it sends stays approval-gated in Queue',
      ],
    });
  }

  return [...existing.map(foldKeywords), ...derived];
}

// ---------------------------------------------------------------------------------------------
// THE WORLD-KNOWLEDGE TIER — the operator's OWN worlds and areas are the primary vocabulary.
// "lets work on video for my mom" names a place ("mom" = the Mom world, "video" = its video
// area) and must land THERE, not in a suggestion list of generic doors. Every world becomes a
// sayable door; every recognizable area becomes a world×area task whose cross-match bonus makes
// the pairing beat any single shared word. Title words deliberately BYPASS the word-claim
// discipline — the operator's names for their own businesses are never strippable — and the
// acceptance corpus + eval harnesses hold the line that handwritten sentences still win.
// ---------------------------------------------------------------------------------------------

/** What an area slug is ABOUT, in the operator's words. Checked in order; first match wins. */
const AREA_VOCAB: [RegExp, string[]][] = [
  [/video|reel|film/, ['video', 'videos', 'film']],
  [/social|instagram|posts/, ['social', 'instagram', 'posts']],
  [/email|newsletter/, ['email', 'emails', 'newsletter']],
  [/brand/, ['brand', 'branding', 'logo']],
  [/merch|capsule|apparel/, ['merch', 'shirt', 'tee', 'hat', 'apparel']],
  [/list|audience|farm/, ['lists', 'audience']],
  [/market|analysis|intel/, ['market', 'analysis', 'research']],
  [/crm|follow/, ['crm', 'follow up', 'follow ups']],
  [/landing|site|web/, ['landing', 'website', 'pages']],
  [/ads|advert/, ['ads', 'advertising']],
  [/seo|article/, ['seo', 'articles']],
];

const prettySlug = (slug: string) => slug.replace(/-/g, ' ');

/** Derive doors from the operator's real worlds: an "Open <world>" task per world, and a
 *  world×area task for every area whose slug names a known kind of work. Areas already owned by
 *  a handwritten task (postcard's direct-mail, reel's growth-studio…) are skipped — the
 *  handwritten steps are better and twins would split the score. */
export function deriveWorldTasks(existing: ConciergeTask[], worlds: ConciergeWorld[]): ConciergeTask[] {
  const ownedSlugs = new Set(existing.map((t) => t.worldSlug).filter(Boolean));
  // "Open <world>" tasks obey the normal claim discipline — a world named with generic words
  // ("Caregiver Channel") must not steal 'channel' from the episode drafter. The full title
  // phrase always survives, so the complete name is always a door.
  const claimedExact = new Set<string>();
  const claimed = new Set<string>();
  // Words living ONLY inside multi-word claimed phrases ('real', 'estate' from "real estate")
  // can't serve as cross words — a title that contains someone's phrase must not intercept that
  // phrase's asks. Whole claimed keywords ('mom') still can: that overlap is the point.
  const phrasePart = new Set<string>();
  const wholeClaimed = new Set<string>();
  for (const t of existing) for (const k of t.keywords) {
    const nk = norm(k);
    claimedExact.add(nk);
    claimed.add(nk);
    const words = nk.split(' ');
    if (words.length === 1) { wholeClaimed.add(nk); wholeClaimed.add(fold(nk)); }
    for (const wd of words) {
      claimedExact.add(wd); claimed.add(wd); claimed.add(fold(wd));
      if (words.length > 1) { phrasePart.add(wd); phrasePart.add(fold(wd)); }
    }
  }
  const out = [...existing];
  for (const w of worlds.slice(0, 20)) {
    const title = w.title?.trim();
    if (!title) continue;
    const titleWords = significantWords(title);
    if (!titleWords.length) continue;
    const phrase = norm(title);
    const freeWords = titleWords.filter((wd) => !claimed.has(wd));
    out.push({
      id: `world:${w.id}`,
      label: `Open ${title}`,
      keywords: [...new Set([...(phrase && !claimedExact.has(phrase) ? [phrase] : []), ...freeWords])],
      kind: 'navigate',
      route: `/garvis/webs/${w.id}`,
      steps: [`${title} opens on its main work surface — every area is one tap from there`],
    });
    const crossTitleWords = titleWords.filter((wd) => !phrasePart.has(wd) || wholeClaimed.has(wd));
    for (const slug of [...new Set(w.slugs)].slice(0, 14)) {
      if (ownedSlugs.has(slug)) continue;
      if (!crossTitleWords.length) break;
      const vocab = AREA_VOCAB.find(([re]) => re.test(slug));
      if (!vocab) continue;
      out.push({
        id: `area:${w.id}:${slug}`,
        label: `${title} — ${prettySlug(slug)}`,
        keywords: [...new Set([...crossTitleWords, ...vocab[1]])],
        crossSets: [crossTitleWords, vocab[1]],
        kind: 'navigate',
        route: `/garvis/webs/${w.id}?area=${slug}`,
        steps: [
          `You're inside ${title} — the ${prettySlug(slug)} work is on screen`,
          'Anything it wants to send still waits for you in Queue',
        ],
      });
    }
  }
  return out;
}

/** The operator's BUILDER projects become sayable doors ("work on jims site" → that project's
 *  workspace). Same word-claim discipline as deriveTasks: existing tasks own their vocabulary,
 *  so a project can never outrank an acceptance-tested match — projects ride on their NAME
 *  words (plus 'site', when free). Two projects sharing every free word tie into an honest
 *  suggest, never a guess. */
export function withProjectTasks(tasks: ConciergeTask[], projects: { id: string; name: string }[]): ConciergeTask[] {
  if (!projects.length) return tasks;
  const claimedExact = new Set<string>();
  const claimed = new Set<string>();
  for (const t of tasks) for (const k of t.keywords) {
    claimedExact.add(norm(k));
    claimed.add(norm(k));
    for (const w of norm(k).split(' ')) { claimedExact.add(w); claimed.add(w); claimed.add(fold(w)); }
  }
  const out = [...tasks];
  for (const p of projects.slice(0, 40)) {
    if (!p.id || !p.name?.trim()) continue;
    const phrase = norm(p.name);
    const words = [...new Set([...significantWords(p.name), 'site', 'sites'].filter((w) => w && !claimed.has(w)))];
    out.push({
      id: `proj:${p.id}`,
      label: `Work on "${p.name.trim()}" in the builder`,
      keywords: phrase && !claimedExact.has(phrase) ? [...new Set([phrase, ...words])] : words,
      kind: 'navigate',
      route: `/project/${p.id}`,
      steps: [
        'The builder is open on this project — say the change in its chat',
        'Edits arrive as a reviewable diff; nothing applies until you press Apply',
      ],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// THE SURFACE TIER — when a working surface is mounted (a creative board, the site builder),
// it gets FIRST CLAIM on the sentence: "make one with a lake background" acts here, it doesn't
// navigate away. Pure parsers only; the registry the surfaces register into lives in
// surfaceBridge.ts (impure), and the claims stay conservative on purpose — a sentence naming a
// DIFFERENT door ("make a video for the channel" on the postcard board) is left unclaimed.
// ---------------------------------------------------------------------------------------------

export interface SurfaceAsk { kind: 'make' | 'riff' | 'instruct'; text: string }

// Deixis — the sentence points AT a piece on screen ("on this one"), typos in the noun and all.
// Bare "this/that" counts only when the sentence ends there or a clause break follows — "a post
// of this quarter's numbers" is a subject, not a pointer. (Tested against norm'd text: no punctuation.)
const RIFF_DEIXIS = /\bthis one\b|\b(on|of|off|from|like)\s+(this|that)(?=\s*$|\s+(but|and|so|then)\b)/;
const RIFF_WORD = /\b(rendition|version|variation|remix|riff)\b/;
const MAKE_LEAD = /^(make|create|generate|draft|design|do|give me)\s+(me\s+)?(one|another|a|an|some|\d+)\b/;
const ANCHOR = /\b(this one|this|that one|rendition\w*|version|variation|remix|riff)\b/gi;

/** What to change, pulled out of a riff sentence. The instruction usually FOLLOWS the pointing
 *  phrase ("…on this one but add text saying X" → "add text saying X"); when the sentence ends
 *  on the anchor ("make the sky pink on this one"), the instruction is what came before. Empty
 *  is honest — the board opens its rendition input instead of inventing a change. */
function riffInstruction(sentence: string): string {
  const s = sentence.trim();
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  ANCHOR.lastIndex = 0;
  while ((m = ANCHOR.exec(s))) last = m;
  const lead = (x: string) => x
    .replace(/^[\s,.;:—–-]+/, '')
    .replace(/^(but|and|so|then)\s+/i, '')
    .replace(/^(i want to|i want|i wanna|i'd like to|id like to|please|can you|could you)\s+/i, '')
    .replace(/^(but|and|so|then|on|off)\s+/i, '');
  const after = last ? lead(s.slice(last.index + last[0].length)).trim() : '';
  if (after) return after;
  const before = last ? s.slice(0, last.index) : s;
  return before
    .replace(/[\s,.;:—–-]+$/, '')
    .replace(/\s+(on|of|off|from|like|to|but|and|for)$/i, '')
    // Strip a riff LEAD ("spin a version of…") — but only with the riff word present: in
    // "make the sky pink on this one" the verb phrase IS the instruction and must survive.
    .replace(/^(make|spin|create|do|give me)\s+(me\s+)?(another|a|an|one)?\s*(rendition\w*|version|variation|remix|riff)\s*(on|of)?\s*/i, '')
    .trim();
}

/** The make-ask's payload, stripped of its lead ("make one with a background of lake" → "a
 *  background of lake"), the board's own noun, and the connector — what lands in the prompt box. */
function makePrompt(sentence: string, nouns: string[]): string {
  let s = sentence.trim().replace(/^(make|create|generate|draft|design|do|give me)\s+(me\s+)?(one|another|a couple of|a few|some|a|an|\d+)(\s+|$)/i, '');
  for (const n of nouns) {
    const re = new RegExp(`^${n.replace(/[^a-z0-9 ]/gi, '')}s?\\s+`, 'i');
    if (re.test(s)) { s = s.replace(re, ''); break; }
  }
  return s.replace(/^(with|about|of|for|that says|that say|saying|showing|featuring)\s+/i, '').trim();
}

/** Parse a sentence as a command for the OPEN creative board. Riff wins over make (riff asks
 *  often start with "make another…"); make claims only pure deixis ("one", "another", "some")
 *  or the board's own nouns — a plural like "posts" folds onto the noun "post". */
export function parseBoardCommand(sentence: string, nouns: string[]): SurfaceAsk | null {
  const t = sentence.trim();
  if (!t) return null;
  // Bare "another one" at a board means exactly that — make another (current kind, no prompt).
  if (/^(another( one)?|one more|do another|make another( one)?)$/.test(norm(t))) return { kind: 'make', text: '' };
  const lower = ` ${norm(t)} `;
  if (RIFF_DEIXIS.test(lower) || RIFF_WORD.test(lower)) return { kind: 'riff', text: riffInstruction(t) };
  const m = MAKE_LEAD.exec(norm(t));
  if (!m) return null;
  const hasNoun = nouns.some((n) => lower.includes(` ${norm(n)} `) || lower.includes(` ${fold(norm(n))} `));
  if (!(m[3] === 'one' || m[3] === 'another' || m[3] === 'some' || hasNoun)) return null;
  return { kind: 'make', text: makePrompt(t, nouns) };
}

/** Parse a sentence as an instruction for the OPEN builder project. Imperative build-verbs only —
 *  navigation ("open the queue"), questions ("how do i…"), and creation asks for OTHER doors are
 *  all left unclaimed so the normal tiers still work from inside the builder. */
const BUILDER_LEAD = /^(add|change|update|remove|delete|fix|redesign|restyle|rebuild|rework|implement|wire up|hook up|integrate|install|swap|replace|tweak|adjust|animate|automate|embed|connect|rename|restructure)\b/;
export function parseBuilderCommand(sentence: string): SurfaceAsk | null {
  const t = sentence.trim();
  if (t.length < 8 || !BUILDER_LEAD.test(norm(t))) return null;
  return { kind: 'instruct', text: t };
}
