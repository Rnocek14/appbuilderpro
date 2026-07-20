// src/lib/garvis/orchestratorCases.verify.ts
// INTENT COVERAGE SUITE (run: `npm run verify:orchestratorcases`). 32 realistic operator intents —
// ventures, tools, hunts, one-offs, out-of-domain, underspecified, and over-reaching asks — each
// with the CORRECT compile the model contract demands, run through the REAL parse gauntlet against
// the REAL catalog. This pins the intended intent→plan mapping as executable checks:
//   - the right actions survive, in order;
//   - what the system can't do lands in holes (never a faked step);
//   - what the intent didn't say lands in questions (never an invented param);
//   - the whole catalog is exercised (an action no case uses is dead weight or a missing case).
// Live compiles depend on the model honoring COMPILER_SYSTEM — this suite is the contract those
// compiles are graded against, and the regression net when the catalog grows.

import { parsePlan, type PlanStep } from './orchestrator';
import { ACTION_SPECS } from './actionCatalog';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const step = (action: string, params: Record<string, string>, why: string, after: number[] = []): PlanStep =>
  ({ action, params, why, after });
const plan = (steps: PlanStep[], holes: string[] = [], questions: string[] = []) =>
  JSON.stringify({ title: 'Case plan', summary: 'The compiled read of the intent under test.', steps, holes, questions });

interface Case {
  name: string;
  /** What the operator says — documentation for humans reading this suite. */
  intent: string;
  /** The CORRECT model output for this intent (the contract live compiles are graded against). */
  compile: string;
  /** Actions expected to SURVIVE the gauntlet, in order. */
  actions: string[];
  minHoles?: number;
  minQuestions?: number;
}

const W = (why: string) => `Because the intent calls for it: ${why}`;

const CASES: Case[] = [
  {
    name: 'venture: full setup compiles to founding + the approval-seam question',
    intent: 'Start a marketing agency for home-service companies and get it fully set up',
    compile: plan([step('found_company', { intent: 'marketing agency for home-service companies' }, W('the venture does not exist in the system yet'))],
      [], ['After approving the company draft, say "research and write the plan for it" — plans need the approved company to exist.']),
    actions: ['found_company'], minQuestions: 1,
  },
  {
    name: 'existing business: research then plan, dependency-ordered',
    intent: 'Research the market for Lakefront Media and write me a deep business plan',
    compile: plan([
      step('research_market', { world: 'Lakefront Media' }, W('the plan should inherit grounded findings')),
      step('business_plan', { world: 'Lakefront Media' }, W('a persisted, red-teamed plan is the deliverable'), [0]),
    ]),
    actions: ['research_market', 'business_plan'],
  },
  {
    name: 'the mural hunt (the headline case)',
    intent: 'Find all mural and custom art jobs in Wisconsin',
    compile: plan([step('hunt_opportunities', { focus: 'mural and custom art jobs', region: 'Wisconsin' }, W('finding work is exactly what the hunt does'))]),
    actions: ['hunt_opportunities'],
  },
  {
    name: 'watch with a supplied URL',
    intent: 'Watch my competitor\'s pricing page daily: https://rival.com/pricing',
    compile: plan([step('watch_page', { url: 'https://rival.com/pricing', label: 'Rival pricing page', cadence: 'daily' }, W('a change on that page is a signal the operator wants'))]),
    actions: ['watch_page'],
  },
  {
    name: 'watch WITHOUT a URL demotes to a question, never an invented link',
    intent: 'Watch my competitor\'s pricing page daily',
    compile: plan([step('watch_page', { label: 'Competitor pricing page' }, W('a change on that page is a signal the operator wants'))]),
    actions: [], minQuestions: 1,
  },
  {
    name: 'the wardrobe room: a custom tool routes to the builder, embedding is an honest hole',
    intent: 'Build me a wardrobe room where I render t-shirt designs, try print placements, and compare shirt brands',
    compile: plan([step('build_app', { idea: 'A wardrobe room: upload t-shirt designs, render them on shirt mockups, drag print placement, compare shirt brands/colors side by side, save favorites' }, W('a purpose-built interactive tool is a builder job'))],
      ['Using the wardrobe room INSIDE Garvis as an embedded canvas — generated apps open in the builder/deployed URL today, not as in-system rooms.']),
    actions: ['build_app'], minHoles: 1,
  },
  {
    name: 'campaign with an over-reach: drafting is real, blanket auto-posting is a hole',
    intent: 'Launch a campaign for my new candle drop and post it everywhere automatically',
    compile: plan([step('marketing_campaign', { subject: 'New candle drop launch' }, W('a full campaign with drafts is the core of the ask'))],
      ['Posting "everywhere automatically" with no review — every post goes through your approval; approved scheduled posts do go out unattended.']),
    actions: ['marketing_campaign'], minHoles: 1,
  },
  {
    name: 'bulk cold blast to STRANGERS: still an honest hole, nothing faked',
    intent: 'Send a cold email blast to 5000 contractors tomorrow',
    compile: plan([], ['Cold outreach to a list of strangers you have not imported — email_segment only reaches YOUR contacts by stage, and 5000 cold sends in a day would trip the cap/warmup by design.']),
    actions: [], minHoles: 1,
  },
  {
    name: 'bulk email to OWN segment: a real single-approval batch',
    intent: 'Email all my qualified contacts about the spring promo: subject "Spring tune-up" body "Hi {{first_name}}, spring slots are open..."',
    compile: plan([step('email_segment', { segment: 'qualified', subject: 'Spring tune-up', body: 'Hi {{first_name}}, spring slots are open...' }, W('one dictated email to an owned segment is exactly the batch rail'))]),
    actions: ['email_segment'],
  },
  {
    name: 'a question, not a task',
    intent: 'What can you actually do?',
    compile: plan([], [], ['Ask for any venture, plan, campaign, hunt, watch, digest, post, tool, or thesis — say the whole thing and it compiles into steps.']),
    actions: [], minQuestions: 1,
  },
  {
    name: 'digest for a named business',
    intent: 'Set up a daily digest for Riverline Realty',
    compile: plan([step('cadence_digest', { world: 'Riverline Realty', cadence: 'daily' }, W('a recurring digest of real activity is exactly this order'))]),
    actions: ['cadence_digest'],
  },
  {
    name: 'two ventures in one breath: two foundings',
    intent: 'Found two companies: a pressure-washing brand and a pet-photography studio',
    compile: plan([
      step('found_company', { intent: 'pressure-washing brand' }, W('first distinct venture')),
      step('found_company', { intent: 'pet-photography studio' }, W('second distinct venture')),
    ]),
    actions: ['found_company', 'found_company'],
  },
  {
    name: 'paperwork: templating is a real step, TRIGGERED automation stays a hole',
    intent: 'Template my listing paperwork and automate DocuSign for every new client',
    compile: plan([step('template_document', { note: 'listing paperwork' }, W('sample→template extraction, fill, and approval-gated signature sends exist in the studio'))],
      ['Fully automatic per-new-client DocuSign (trigger → auto-fill → auto-send with no review) — sends stay behind approvals, and trigger wiring is not built yet.']),
    actions: ['template_document'], minHoles: 1,
  },
  {
    name: 'client engagement: onboard_client, never found_company',
    intent: 'Add my client Jane the realtor — I do her marketing',
    compile: plan([step('onboard_client', { client_name: 'Jane', business: 'residential realty', scope: 'marketing' }, W('work FOR someone else\'s business is an engagement, not the operator\'s own venture'))]),
    actions: ['onboard_client'],
  },
  {
    name: 'client onboarding + their campaign: engagement first, campaign question-gated on the world',
    intent: 'Take on Rick\'s roofing company for marketing and paperwork, and start his first campaign',
    compile: plan([step('onboard_client', { client_name: 'Rick', business: 'roofing company', scope: 'marketing + paperwork' }, W('the engagement and intake come first'))],
      ['Client paperwork templating/automation — the Paperwork Engine is not built yet; the intake checklist collects his document samples meanwhile.'],
      ['After approving Rick\'s world draft and linking it in the Client book, say "campaign for Rick\'s roofing" so the strategy grounds in his world.']),
    actions: ['onboard_client'], minHoles: 1, minQuestions: 1,
  },
  {
    name: 'a durable position becomes a proposed thesis',
    intent: 'Remember this: we never discount below 20% margin',
    compile: plan([step('record_thesis', { title: 'Never discount below 20% margin', body: 'We never discount below 20% margin.' }, W('a durable constraint worth carrying into every future decision'))]),
    actions: ['record_thesis'],
  },
  {
    name: 'heartbeat question routes to the master switch',
    intent: 'Is my automation heartbeat actually running?',
    compile: plan([step('check_master_switch', {}, W('the operator is asking exactly what this action reads'))]),
    actions: ['check_master_switch'],
  },
  {
    name: 'RFP monitoring phrased as a scraper request → the hunt',
    intent: 'Build a scraper that monitors government sites for construction public-art RFPs',
    compile: plan([step('hunt_opportunities', { focus: 'construction public-art RFPs on government sites' }, W('scheduled search + extraction is what the hunt is; no custom scraper needed'))]),
    actions: ['hunt_opportunities'],
  },
  {
    name: 'a personal tool routes to the builder',
    intent: 'Make me a personal finance tracker app',
    compile: plan([step('build_app', { idea: 'Personal finance tracker: accounts, transactions, monthly budgets, charts' }, W('a standalone tool is a builder job'))]),
    actions: ['build_app'],
  },
  {
    name: 'follower-growth over-reach: campaign is real, growth mechanics are a hole',
    intent: 'Grow my Instagram to 100k followers',
    compile: plan([step('marketing_campaign', { subject: 'Instagram growth push', brief: 'content engine aimed at follower growth' }, W('a content campaign is the real lever available'))],
      ['Follower-growth mechanics (engagement pods, paid growth, DM automation) — no such machinery exists, and posting still goes through your approvals.']),
    actions: ['marketing_campaign'], minHoles: 1,
  },
  {
    name: 'out-of-domain: thin answer with questions, no forced steps',
    intent: 'Plan my wedding',
    compile: plan([], [], ['This system runs ventures — for a wedding, the honest offer is a planning TOOL: say "build me a wedding planner app" and the builder makes one.']),
    actions: [], minQuestions: 1,
  },
  {
    name: 'ad spend: read-only rail, honest hole',
    intent: 'Buy me $500 of Google ads',
    compile: plan([], ['Placing/managing ad spend — the ads rail is deliberately read-only (sync + anomaly alerts); it never spends money.']),
    actions: [], minHoles: 1,
  },
  {
    name: 'plan for a possibly-unknown business: step survives, runtime resolves honestly',
    intent: 'Write a business plan for the t-shirt company',
    compile: plan([step('business_plan', { world: 't-shirt company' }, W('a persisted plan for the named business'))]),
    actions: ['business_plan'],
  },
  {
    name: 'three watches, three URLs, three steps',
    intent: 'Watch these weekly: https://a.gov/rfps https://b.org/grants https://c.city/calls',
    compile: plan([
      step('watch_page', { url: 'https://a.gov/rfps', label: 'a.gov RFPs', cadence: 'weekly' }, W('first listed page')),
      step('watch_page', { url: 'https://b.org/grants', label: 'b.org grants', cadence: 'weekly' }, W('second listed page')),
      step('watch_page', { url: 'https://c.city/calls', label: 'c.city calls', cadence: 'weekly' }, W('third listed page')),
    ]),
    actions: ['watch_page', 'watch_page', 'watch_page'],
  },
  {
    name: 'email automation system: composable automations are a hole, digest is the honest offer',
    intent: 'Build me an email automation system for Lakefront Media',
    compile: plan([step('cadence_digest', { world: 'Lakefront Media' }, W('the recurring-email piece that exists today'))],
      ['A composable email automation builder (triggers → conditions → sends) — the trigger engine exists for canned date-anchored flows but cannot be authored from intent yet.']),
    actions: ['cadence_digest'], minHoles: 1,
  },
  {
    name: 'the everything-launch: founding + site + campaign, beta-user recruiting is a hole',
    intent: 'Do everything to launch my SaaS idea: company, plan, site, campaign, find beta users',
    compile: plan([
      step('found_company', { intent: 'SaaS product venture' }, W('the company does not exist yet')),
      step('build_app', { idea: 'Marketing site + waitlist for the SaaS' }, W('the site can build in parallel with founding')),
      step('marketing_campaign', { subject: 'SaaS launch' }, W('launch assets as drafts'), [0]),
    ], ['Recruiting beta users — no user-recruiting machinery exists (the hunt finds work/opportunities, not signups).'],
      ['After approving the company draft, ask for its plan — it needs the approved company to exist.']),
    actions: ['found_company', 'build_app', 'marketing_campaign'], minHoles: 1, minQuestions: 1,
  },
  {
    name: 'free-floating research: honest hole (research is business-bound today)',
    intent: 'Research whether AI headshot apps are a saturated market',
    compile: plan([], ['Stand-alone market research with no business to attach it to — research is business-bound today; found the venture first (or ask inside a builder project, where research is project-bound).']),
    actions: [], minHoles: 1,
  },
  {
    name: 'weekly artist grants → weekly hunt',
    intent: 'Check for new grants for artists every week and tell me',
    compile: plan([step('hunt_opportunities', { focus: 'grants for artists', cadence: 'weekly' }, W('a scheduled hunt with a ping is exactly this'))]),
    actions: ['hunt_opportunities'],
  },
  {
    name: 'one-off social post → queued behind approval',
    intent: 'Post "we\'re hiring" on my socials',
    compile: plan([step('queue_social_post', { text: 'We\'re hiring!', platforms: 'twitter, linkedin' }, W('a single dictated post, queued for approval'))]),
    actions: ['queue_social_post'],
  },
  {
    name: 'research-grounded campaign for a named business',
    intent: 'Turn my research into a campaign for Acme Fitness',
    compile: plan([step('marketing_campaign', { subject: 'Acme Fitness campaign', world: 'Acme Fitness' }, W('naming the business grounds the strategy in its research'))]),
    actions: ['marketing_campaign'],
  },
  {
    name: 'second brand on its own domain: founding is real, custom domains are a hole',
    intent: 'Spin up a second brand on a separate domain',
    compile: plan([step('found_company', { intent: 'second brand venture' }, W('a distinct company draft'))],
      ['Custom domains — deployed sites ship on generated subdomains today; per-brand sender identity exists, but domains are not provisioned.']),
    actions: ['found_company'], minHoles: 1,
  },
  {
    name: 'invoice chasing: already built into the heartbeat — verify the clock, add nothing',
    intent: 'Automate invoice chasing for late clients',
    compile: plan([step('check_master_switch', {}, W('invoice chasing already runs daily on the heartbeat — the only question is whether the clock is ticking'))]),
    actions: ['check_master_switch'],
  },
  {
    name: 'brother combo: site + plan for an existing business',
    intent: 'Make a landing page for Mural Works and write its business plan',
    compile: plan([
      step('build_app', { idea: 'Landing page for Mural Works, a mural and custom art studio' }, W('the site half of the ask')),
      step('business_plan', { world: 'Mural Works' }, W('the plan half — multi-pass, persisted')),
    ]),
    actions: ['build_app', 'business_plan'],
  },
  {
    name: 'digest-for-everything without names → a question, not guessed worlds',
    intent: 'Give me a digest of everything happening across all my businesses every morning',
    compile: plan([], [], ['Which businesses? Name them (one digest each) — digests are per-business and the intent did not say which.']),
    actions: [], minQuestions: 1,
  },
  {
    name: 'gauntlet integration: an invented action is dropped, the honest hole survives',
    intent: '(model misbehavior fixture) blast my list',
    compile: plan([step('send_bulk_email', { list: 'all' }, W('a model hallucinating a capability that does not exist'))],
      ['Bulk sending is not an orchestrator action yet.']),
    actions: [], minHoles: 1,
  },
  // ---- catalog expansion (July 2026): the new actions, each pinned ----
  {
    name: 'invoice with stated amount compiles; the send stays behind the Queue',
    intent: 'Bill Jane Roe (jane@roe.com) $450 for the lakefront listing photos, due August 1st',
    compile: plan([step('create_invoice', { title: 'Lakefront listing photos', to_email: 'jane@roe.com', amount_usd: '450', due_date: '2026-08-01' }, W('a stated amount and recipient make a real draft invoice'))]),
    actions: ['create_invoice'],
  },
  {
    name: 'invoice WITHOUT an amount demotes to a question, never an invented number',
    intent: 'Invoice Jane for the photography work',
    compile: plan([step('create_invoice', { title: 'Photography work' }, W('billing is the ask — but the amount and email were never stated'))]),
    actions: [], minQuestions: 1,
  },
  {
    name: 'a remind-me becomes a timed reminder',
    intent: 'Remind me Thursday to follow up with the print shop about shirt samples',
    compile: plan([step('add_reminder', { title: 'Follow up with the print shop about shirt samples', due_at: '2026-07-23T15:00:00Z' }, W('a timed nudge is exactly what reminders do'))]),
    actions: ['add_reminder'],
  },
  {
    name: 'weekly content for an existing business arms a judged content week',
    intent: 'Keep Northstar\'s socials active — a few posts every week in its voice',
    compile: plan([step('start_content_week', { world: 'Northstar', posts_per_week: '3' }, W('recurring judged content staged behind one weekly approval'))]),
    actions: ['start_content_week'],
  },
  {
    name: 'keep-ideas-coming arms an idea stream on the business board',
    intent: 'Brainstorm fresh angles for Mural Co every week and put them on its board',
    compile: plan([step('start_idea_stream', { world: 'Mural Co', cadence: 'weekly' }, W('a non-repeating stream of angles is the idea stream\'s job'))]),
    actions: ['start_idea_stream'],
  },
  {
    name: 'find-me-clients arms the daily hunt; pitches wait in the Queue',
    intent: 'Find me web design clients — go after landscapers',
    compile: plan([step('start_client_hunt', { niche: 'landscapers' }, W('automatic discovery, audits, demos, and pitch drafts are the hunt machine'))]),
    actions: ['start_client_hunt'],
  },
  {
    name: 'a named person with an email lands in the CRM',
    intent: 'Add Sam Ortiz, sam@ortizbuilds.com, to my contacts for Northstar',
    compile: plan([step('add_contact', { name: 'Sam Ortiz', email: 'sam@ortizbuilds.com', world: 'Northstar' }, W('a real person from the intent belongs in the CRM'))]),
    actions: ['add_contact'],
  },
];

for (const c of CASES) {
  const res = parsePlan(c.compile, ACTION_SPECS);
  const got = res.plan ? res.plan.steps.map((s) => s.action) : [];
  const holes = res.plan?.holes.length ?? 0;
  const questions = res.plan?.questions.length ?? 0;
  const ok =
    !!res.plan &&
    got.join(',') === c.actions.join(',') &&
    holes >= (c.minHoles ?? 0) &&
    questions >= (c.minQuestions ?? 0);
  check(c.name, ok, `intent="${c.intent}" got=[${got.join(',')}] holes=${holes} questions=${questions}`);
}

// Catalog coverage: every action the catalog offers is exercised by at least one case.
const used = new Set(CASES.flatMap((c) => c.actions));
for (const spec of ACTION_SPECS) {
  check(`catalog coverage: ${spec.id} is exercised`, used.has(spec.id));
}

console.log(`\n${passed}/${passed + failed} passed (${CASES.length} intents, ${ACTION_SPECS.length} catalog actions)`);
if (failed > 0) throw new Error(`${failed} orchestrator case(s) failed`);
