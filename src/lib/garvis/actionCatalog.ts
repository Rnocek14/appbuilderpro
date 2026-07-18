// src/lib/garvis/actionCatalog.ts
// THE ACTION CATALOG (pure) — the specs half of the Orchestrator's registry: what each action is,
// when the compiler should reach for it, and what it produces. Split from actionRegistry.ts so
// the compiler prompt and the intent-coverage suite (orchestratorCases.verify.ts) run with ZERO
// impure imports — the executors (DB/model calls) stay in actionRegistry.ts, which zips these
// specs with its executor table by id (a missing/extra executor is a startup error, not drift).
//
// Growing this catalog IS growing Garvis's agency. The rule stands: if a human can click it, the
// brain can propose it — and nothing else.

import type { ActionSpec } from './orchestrator';

export const ACTION_SPECS: ActionSpec[] = [
  {
    id: 'found_company',
    title: 'Found a company',
    category: 'company',
    risk: 'spend',
    description: 'Run business genesis on a one-line venture intent: DNA synthesis → a designed company (chartered areas, seeded playbooks, opening play) as a REVIEWABLE DRAFT. Use once per distinct company in the intent — for the OPERATOR\'S OWN ventures only. Doing marketing/paperwork FOR someone else\'s existing business (a client engagement) is NOT founding a company — that capability does not exist yet and belongs in holes.',
    params: [{ name: 'intent', required: true, hint: 'the venture in one sentence, in the operator\'s words' }],
    produces: 'a company draft awaiting review/approval on the Businesses page (a live world only after approval)',
  },
  {
    id: 'research_market',
    title: 'Research the market',
    category: 'planning',
    risk: 'spend',
    description: 'Run the grounded (Serper-cited when configured) market research producer for an EXISTING business — real snippets in, cited brief out, persisted as a knowledge artifact. Run before plans/campaigns so they inherit real research. Research without an existing business to attach it to has no action yet — that goes in holes.',
    params: [{ name: 'world', required: true, hint: 'the business name (must already exist)' }],
    produces: 'a persisted research brief artifact in the business (cited when search is configured, framework-only when not)',
  },
  {
    id: 'business_plan',
    title: 'Write the business plan',
    category: 'planning',
    risk: 'spend',
    description: 'MULTI-PASS business plan for an EXISTING business: auto-runs grounded research when none is on record, drafts against the full findings, red-teams the draft (consultant slop, unsupported claims, hollow operations), and refines against every fix. Order after research_market when both appear. A plan for a company being founded in THIS SAME plan cannot run yet (the company exists only after the operator approves its draft) — put the follow-up in questions instead.',
    params: [{ name: 'world', required: true, hint: 'the business name (must already exist)' }],
    produces: 'a persisted, red-teamed business-plan artifact (plus the research it auto-ran, if any); thin output rejected, never shipped',
  },
  {
    id: 'marketing_campaign',
    title: 'Generate a marketing campaign',
    category: 'marketing',
    risk: 'spend',
    description: 'Run the 3-stage campaign generator (strategy+calendar → posts → email/landing copy). Pass `world` to ground the strategy in that business\'s newest research brief. Everything lands as DRAFTS the operator reviews in Marketing; social drafts can then queue through the real approval-gated posting rail.',
    params: [
      { name: 'subject', required: true, hint: 'what the campaign is selling/announcing' },
      { name: 'brief', required: false, hint: 'angle, audience, constraints — in the operator\'s words' },
      { name: 'world', required: false, hint: 'an existing business whose research should ground the strategy' },
    ],
    produces: 'a campaign with draft assets in Marketing, research-grounded when a business is named (nothing publishes without per-asset review)',
  },
  {
    id: 'queue_social_post',
    title: 'Queue a social post',
    category: 'marketing',
    risk: 'outbound',
    description: 'Queue ONE specific social post (text supplied or clearly dictated by the intent) behind a PENDING approval — it posts via the connected accounts only after the operator approves it in the Queue. For a one-off announcement, not a campaign.',
    params: [
      { name: 'text', required: true, hint: 'the post text, in the operator\'s voice' },
      { name: 'platforms', required: false, hint: 'comma-separated: twitter, linkedin, facebook, instagram (default twitter)' },
    ],
    produces: 'a queued post + a pending approval in the Queue (nothing posts until approved)',
  },
  {
    id: 'hunt_opportunities',
    title: 'Hunt for opportunities',
    category: 'automation',
    risk: 'safe',
    description: 'Standing hunt for real work: jobs, RFPs, grants, commissions, open calls matching a focus (e.g. "mural commissions and public art projects"). Runs scheduled web-search sweeps, reads the results, extracts ONLY opportunities the pages actually describe, and files them deduped in the Opportunity feed for triage. Use when the intent is about FINDING work/opportunities, not customers to pitch.',
    params: [
      { name: 'focus', required: true, hint: 'what to hunt, in the operator\'s words ("mural and custom art jobs")' },
      { name: 'region', required: false, hint: 'geography to prefer ("Wisconsin", "Chicago area")' },
      { name: 'cadence', required: false, hint: 'daily | weekly (default daily)' },
      { name: 'world', required: false, hint: 'the business this hunt feeds (must already exist)' },
    ],
    produces: 'an armed daily/weekly hunt filling the Opportunity feed (needs SERPER_API_KEY + the armed heartbeat; JS-rendered pages are flagged unreadable, never silently skipped)',
  },
  {
    id: 'watch_page',
    title: 'Watch a page',
    category: 'automation',
    risk: 'safe',
    description: 'Standing order that fetches a URL on a cadence and records/notifies on change — for grant listings, RFP boards, competitor pages. One order per URL, and the intent must SUPPLY the URL; never invent one. Static HTML only (JS-rendered portals will read as unchanged).',
    params: [
      { name: 'url', required: true, hint: 'the exact page URL to watch' },
      { name: 'label', required: true, hint: 'what this watch is for, in plain words' },
      { name: 'cadence', required: false, hint: 'hourly | daily | weekly (default daily)' },
    ],
    produces: 'an armed standing order (fires only while the heartbeat is armed — Health page shows the clock)',
  },
  {
    id: 'cadence_digest',
    title: 'Schedule a business digest',
    category: 'automation',
    risk: 'safe',
    description: 'Standing order that compiles a recurring digest of an EXISTING business\'s real activity on a cadence.',
    params: [
      { name: 'world', required: true, hint: 'the business name (must already exist)' },
      { name: 'cadence', required: false, hint: 'daily | weekly (default weekly)' },
    ],
    produces: 'an armed digest order for that business (fires only while the heartbeat is armed)',
  },
  {
    id: 'build_app',
    title: 'Build an app or website',
    category: 'app',
    risk: 'safe',
    description: 'Hand the intent to the app builder (compile-verified generation pipeline, live preview, one-click deploy). Use for websites, portfolios, landing pages, AND custom tools/rooms/utilities the operator wants to USE — a design-mockup room, a tracker, a calculator, an internal dashboard. The build itself runs in the builder workspace; describe the tool faithfully in the idea.',
    params: [{ name: 'idea', required: true, hint: 'what to build, in one or two sentences — include what the operator will DO in it' }],
    produces: 'the builder pre-filled with this idea — generation, verification and deploy happen there',
  },
  {
    id: 'record_thesis',
    title: 'Record an operating thesis',
    category: 'setup',
    risk: 'safe',
    description: 'File a stated strategy/belief/constraint from the intent as PROPOSED knowledge (the operator approves it into reasoning memory). Use when the intent states a durable position worth remembering, not for tasks.',
    params: [
      { name: 'title', required: true, hint: 'the thesis in <=80 chars' },
      { name: 'body', required: true, hint: 'the thesis itself, 1-3 sentences, in the operator\'s words' },
    ],
    produces: 'a proposed knowledge row awaiting approval (approved lessons reach every agent run and builder edit)',
  },
  {
    id: 'check_master_switch',
    title: 'Check the master switch',
    category: 'setup',
    risk: 'safe',
    description: 'Verify the unattended layer is actually running (heartbeat ticking). Add as a first step when the plan creates automations, so the operator learns immediately if scheduled work cannot fire. Also the right single step when the intent asks about built-in unattended loops (follow-ups, invoice chasing, morning brief) — those run on the heartbeat already.',
    params: [],
    produces: 'an honest reading of the clock (alive / stale / never ticked) with the fix location',
  },
];

/** The pure specs (what the compiler prompt and the coverage suite see). */
export function actionSpecs(): ActionSpec[] {
  return ACTION_SPECS;
}
