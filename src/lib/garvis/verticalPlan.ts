// src/lib/garvis/verticalPlan.ts
// THE VERTICAL EMPIRE PLANNER — pure core. "Plan seven verticals" becomes a STRUCTURED plan:
// N faceless channels, each with a niche, persona, look, voice, and its first three episode
// ideas — and "Implement" compiles it into the orchestrator's reviewable contract (one
// launch_vertical step per channel) so ONE press actually builds the fleet: world + channel +
// CTA pointed at the marketed thing + the daily draft clock + episode one drafted.
// Honesty spine: the notes say exactly what implement DOES and what it deliberately does NOT
// (render/publish stay behind keys, the studio's Produce press, and the Queue).

import type { CompiledPlan } from './orchestrator';

export interface VerticalSpec {
  libId: string;
  name: string;              // the channel's name (editable)
  niche: string;
  persona: string;
  visualStyle: string;
  mood: 'warm' | 'upbeat' | 'cinematic' | 'minimal';
  voice: string;
  why: string;               // one honest line: why this vertical earns a following
  firstIdeas: string[];      // three episode topics to start the clock
}

export interface VerticalPlan {
  title: string;
  summary: string;
  ctaUrl: string | null;     // where every channel routes its audience (the marketed thing)
  ctaLabel: string;
  verticals: VerticalSpec[];
}

/** The curated library — faceless niches that reliably build followings, each with craft-true
 *  persona/look notes and three starter topics. Deterministic order = plan order. */
export const VERTICAL_LIBRARY: VerticalSpec[] = [
  {
    libId: 'finance_facts', name: 'Money Facts', niche: 'personal finance and money facts',
    persona: 'calm, numerate, never preachy — the friend who read the fine print', visualStyle: 'clean charts, bold numbers, dark background',
    mood: 'minimal', voice: 'onyx', why: 'evergreen search + high advertiser value; facts format survives faceless delivery',
    firstIdeas: ['the rule of 72 in 30 seconds', 'what a credit score actually measures', 'why the latte theory is wrong'],
  },
  {
    libId: 'curiosity_facts', name: 'Did You Know', niche: 'surprising science, history and world facts',
    persona: 'wide-eyed but precise — every claim cited', visualStyle: 'archival imagery, punchy captions',
    mood: 'upbeat', voice: 'nova', why: 'broadest possible audience; the classic faceless growth engine',
    firstIdeas: ['the shortest war in history', 'why octopuses have three hearts', 'the city that moved a river'],
  },
  {
    libId: 'caregiver_health', name: 'Caregiver Notes', niche: 'stroke recovery and aphasia education for family caregivers',
    persona: 'warm, practical, clinically careful — never medical advice', visualStyle: 'soft light, hands and homes',
    mood: 'warm', voice: 'shimmer', why: 'underserved, high-trust niche; natural funnel for a recovery app',
    firstIdeas: ['three aphasia myths families believe', 'what the first 90 days actually look like', 'a caregiver morning routine that works'],
  },
  {
    libId: 'sleep_science', name: 'Sleep Signals', niche: 'sleep and recovery science made usable',
    persona: 'evidence-first, gentle, anti-hustle', visualStyle: 'night tones, slow motion',
    mood: 'cinematic', voice: 'onyx', why: 'universal problem + product-adjacent (apps, routines)',
    firstIdeas: ['why you wake at 3am', 'caffeine half-life in plain numbers', 'the 10-3-2-1 wind-down rule'],
  },
  {
    libId: 'tiny_habits', name: 'Two-Minute Habits', niche: 'micro-productivity and habit science',
    persona: 'no guru energy — small claims, real citations', visualStyle: 'minimal type cards, satisfying loops',
    mood: 'minimal', voice: 'nova', why: 'self-improvement scale with a faceless-friendly format',
    firstIdeas: ['the two-minute rule, honestly', 'habit stacking with one real example', 'why streaks break and what survives'],
  },
  {
    libId: 'home_hacks', name: 'House Sense', niche: 'home maintenance facts and seasonal checklists',
    persona: 'the practical neighbor who fixed it already', visualStyle: 'bright how-to close-ups',
    mood: 'upbeat', voice: 'echo', why: 'high-save content; local-service adjacent (real estate, trades)',
    firstIdeas: ['the five-minute furnace filter check', 'what water heaters cost you silently', 'gutter season in one checklist'],
  },
  {
    libId: 'local_market', name: 'Market in Minutes', niche: 'plain-language real estate and local market facts',
    persona: 'numbers first, never hype', visualStyle: 'map overlays, listing b-roll style cards',
    mood: 'minimal', voice: 'onyx', why: 'feeds any real-estate operation; trust compounds locally',
    firstIdeas: ['what a comp actually is', 'why list price is a strategy not a value', 'the true cost of waiting to sell'],
  },
  {
    libId: 'pet_care', name: 'Good Dog Facts', niche: 'evidence-based pet care and behavior facts',
    persona: 'kind, vet-literature literate, no fearmongering', visualStyle: 'warm pet footage cards',
    mood: 'warm', voice: 'shimmer', why: 'massive engagement niche; product and service adjacent',
    firstIdeas: ['why dogs tilt their heads', 'the toxic foods list people forget', 'what tail wags actually mean'],
  },
  {
    libId: 'ai_tools', name: 'One AI Thing', niche: 'one useful AI capability per episode, honestly demoed',
    persona: 'skeptical practitioner — shows limits too', visualStyle: 'screen-capture style cards',
    mood: 'minimal', voice: 'nova', why: 'surging search interest; natural funnel for a software product',
    firstIdeas: ['make a spreadsheet clean itself', 'the prompt pattern that actually helps', 'what AI still gets wrong about email'],
  },
  {
    libId: 'maker_channel', name: 'Made By Hand', niche: 'handmade craft, studio process and product stories',
    persona: 'quiet process narration, materials named', visualStyle: 'macro process shots',
    mood: 'cinematic', voice: 'echo', why: 'process content retains; commerce-ready audience',
    firstIdeas: ['why linen thread costs more', 'one tool that changed the studio', 'from sketch to first sale'],
  },
];

/** Build the structured plan: the first N library verticals (deterministic), CTA carried onto
 *  every one. Count clamps honestly to what the library holds. */
export function buildVerticalPlan(count: number, opts: { ctaUrl?: string | null; ctaLabel?: string; marketed?: string } = {}): VerticalPlan {
  const n = Math.max(1, Math.min(Math.floor(count) || 1, VERTICAL_LIBRARY.length));
  const marketed = opts.marketed?.trim();
  return {
    title: `${n} vertical channels${marketed ? ` funneling to ${marketed}` : ''}`,
    summary: `One faceless channel per niche, each with its own name, persona, look and voice. Every channel points its CTA at ${marketed || 'the thing you are marketing'} and runs the daily draft clock.`,
    ctaUrl: opts.ctaUrl?.trim() || null,
    ctaLabel: opts.ctaLabel?.trim() || 'Learn more',
    verticals: VERTICAL_LIBRARY.slice(0, n).map((v) => ({ ...v, firstIdeas: [...v.firstIdeas] })),
  };
}

/** Compile the plan into the orchestrator's reviewable contract — one launch_vertical step per
 *  channel. Holes/questions carry the honesty: a missing CTA is a QUESTION (the funnel is the
 *  point), production limits are stated, nothing is hidden in the steps. */
export function planToArc(plan: VerticalPlan): CompiledPlan {
  return {
    title: plan.title,
    summary: plan.summary,
    steps: plan.verticals.map((v, i) => ({
      action: 'launch_vertical',
      params: {
        vertical: v.libId,
        name: v.name,
        niche: v.niche,
        first_topic: v.firstIdeas[0] ?? '',
        ...(plan.ctaUrl ? { cta_url: plan.ctaUrl, cta_label: plan.ctaLabel } : {}),
      },
      why: v.why,
      after: i === 0 ? [] : [i - 1],   // sequential — honest pacing over a burst of parallel spend
    })),
    holes: [
      'Rendering and posting are NOT in this run: episodes arrive as drafted scripts; Produce (illustrate + narrate + render) happens in each studio, and posting waits in your Queue.',
    ],
    questions: plan.ctaUrl ? [] : ['Where should these audiences funnel? Set the CTA link (your app store page, site, or landing page) — without it the channels grow but route nowhere.'],
  };
}

/** What implement DOES and deliberately does NOT — rendered above the button, spoken plainly. */
export function planNotes(plan: VerticalPlan): string[] {
  return [
    `Implement builds ${plan.verticals.length} channel operations: world + channel + ${plan.ctaUrl ? 'CTA wired' : 'CTA left open'} + the daily draft clock armed + episode one drafted.`,
    'Drafting uses your AI key and credits; with no key set, channels still stand and the clock drafts when the key arrives.',
    'Nothing renders or posts from this press — production is per-episode in each studio, and every post waits in your Queue.',
  ];
}

const COUNT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, couple: 2, few: 3, several: 4,
};

/** "plan seven verticals" → 7. Null when the sentence names no count (caller picks the default). */
export function verticalCount(sentence: string): number | null {
  const t = sentence.toLowerCase();
  const digit = /(\d{1,2})\s*(vertical|niche|channel)/.exec(t);
  if (digit) return Math.max(1, Math.min(parseInt(digit[1]!, 10), VERTICAL_LIBRARY.length));
  const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten|couple|few|several)\b[\s\w]{0,12}?(vertical|niche|channel)/.exec(t);
  if (word) return Math.max(1, Math.min(COUNT_WORDS[word[1]!] ?? 1, VERTICAL_LIBRARY.length));
  return null;
}
