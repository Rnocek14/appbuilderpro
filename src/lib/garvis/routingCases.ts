// src/lib/garvis/routingCases.ts
// THE ROUTING CASE TABLE — one table, two consumers:
//   1. orchestratorCases.verify.ts (CI, deterministic): each case's `compile` is the CORRECT model
//      output, run through the REAL parse gauntlet — the contract live compiles are graded against.
//   2. scripts/routingEvalRun.ts (live, needs ANTHROPIC_API_KEY): feeds each case's `intent` to the
//      REAL compiler prompt (COMPILER_SYSTEM + catalogContext) and grades what the model actually
//      chose — actions exact, forbidden siblings absent. This is where routing misses like
//      2026-08-18 ("find websites we could build" → RFP hunt) get caught BEFORE an operator does.
// When a live miss happens: fix the catalog boundary, then add the literal phrasing here with the
// confusable sibling in `forbid`. The table only grows.

import type { PlanStep } from './orchestrator';

export interface RoutingCase {
  name: string;
  /** What the operator says — fed verbatim to the live compiler by the eval. */
  intent: string;
  /** The CORRECT model output for this intent (the contract live compiles are graded against). */
  compile: string;
  /** Actions expected to SURVIVE the gauntlet, in order. */
  actions: string[];
  /** Actions that must NOT appear — the confusable siblings a router could mistake this for. */
  forbid?: string[];
  minHoles?: number;
  minQuestions?: number;
  /** false = parser fixture, not a real intent — the live eval skips it. */
  liveEval?: boolean;
}

export const step = (action: string, params: Record<string, string>, why: string, after: number[] = []): PlanStep =>
  ({ action, params, why, after });
export const plan = (steps: PlanStep[], holes: string[] = [], questions: string[] = []) =>
  JSON.stringify({ title: 'Case plan', summary: 'The compiled read of the intent under test.', steps, holes, questions });
export const W = (why: string) => `Because the intent calls for it: ${why}`;

export const ROUTING_CASES: RoutingCase[] = [
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
    name: 'one-shot episode: "draft an episode about X" compiles to draft_episode, not a weekly order',
    intent: 'Draft an episode about why mortgage rates move for my channel',
    compile: plan([step('draft_episode', { topic: 'why mortgage rates move' }, W('the operator wants ONE cited episode drafted now, not a recurring order'))]),
    actions: ['draft_episode'],
  },
  {
    name: 'strategist: "market my stroke app" stands up the mapped operation, wires the CTA, records the why; Reddit is an honest hole',
    intent: 'Start marketing my stroke recovery app mind-weave-recover (https://mindweave.app) — the caregiver channel audience is exactly who needs it',
    compile: plan([
      step('start_app_marketing', { app: 'mind-weave-recover' }, W('the marketing work needs its mapped operation — areas for intel, articles, social, video, results')),
      step('record_thesis', { title: 'Stroke app marketing: route the caregiver audience first', body: 'The caregiver channel audience matches the stroke app: route that attention to the app before buying any new audience.' }, W('the strategy and its reasoning should be a persisted, reviewable record'), [0]),
      step('point_channel_cta', { url: 'https://mindweave.app', channel: 'caregiver', label: 'Try the free tool' }, W('the channel already owns the exact audience the app serves — its CTA is the shortest path'), [0]),
      step('research_market', { world: 'mind-weave-recover Marketing' }, W('competitor intel on recovery apps grounds every later article and post'), [0]),
    ], ['Community threads (e.g. a recovery-milestones post in r/stroke linking the free tool) need human hands — no catalog action posts to Reddit.']),
    actions: ['start_app_marketing', 'record_thesis', 'point_channel_cta', 'research_market'], minHoles: 1,
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
    name: 'the wardrobe room: build in the builder, then mount_room brings it home (no longer a hole)',
    intent: 'Build me a wardrobe room where I render t-shirt designs, try print placements, and compare shirt brands',
    compile: plan([step('build_app', { idea: 'A wardrobe room: upload t-shirt designs, render them on shirt mockups, drag print placement, compare shirt brands/colors side by side, save favorites' }, W('a purpose-built interactive tool is a builder job'))],
      [], ['After deploying it, say "mount <its URL> as the Wardrobe room in <business>" — mounting needs the deployed URL, and then you use it without leaving Garvis.']),
    actions: ['build_app'], minQuestions: 1,
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
    actions: [], minHoles: 1, liveEval: false,
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
    // The live miss of 2026-08-18: this exact operator phrasing compiled to found_company +
    // hunt_opportunities (bidding on posted RFPs) and died there. "Find websites we could build
    // new ones for" means WE pitch — the client hunt, whole and alone. No company founding, no
    // RFP feed, no invented niche; breadth is a question, never a guess.
    name: 'find-websites-to-rebuild is the client hunt — never the RFP hunt, never a new company',
    intent: 'lets find some websites we could build new ones and automations',
    compile: plan(
      [step('start_client_hunt', {}, W('finding businesses with weak sites and pitching new sites + automations IS the client-hunt machine'))],
      [],
      ['Should the hunt focus on a niche or geography, or stay broad?'],
    ),
    actions: ['start_client_hunt'],
    minQuestions: 1,
  },
  {
    name: 'mount a deployed tool as an in-business room (the wardrobe room comes home)',
    intent: 'Mount https://wardrobe.fableforge.app as the Wardrobe room in my Threadline business',
    compile: plan([step('mount_room', { world: 'Threadline', title: 'Wardrobe room', url: 'https://wardrobe.fableforge.app' }, W('a deployed tool used in-place belongs inside its business'))]),
    actions: ['mount_room'],
  },
  {
    name: 'mount WITHOUT a URL demotes to a question, never an invented link',
    intent: 'Put the wardrobe tool inside my Threadline business',
    compile: plan([step('mount_room', { world: 'Threadline', title: 'Wardrobe room' }, W('mounting is the ask but no deployed URL was given'))]),
    actions: [], minQuestions: 1,
  },
  {
    name: 'a named person with an email lands in the CRM',
    intent: 'Add Sam Ortiz, sam@ortizbuilds.com, to my contacts for Northstar',
    compile: plan([step('add_contact', { name: 'Sam Ortiz', email: 'sam@ortizbuilds.com', world: 'Northstar' }, W('a real person from the intent belongs in the CRM'))]),
    actions: ['add_contact'],
  },
  {
    name: 'the vertical empire: one launch_vertical per niche, sequential, CTA riding every step; production is an honest hole',
    intent: 'Build followings in two niches — money facts and pet care — and funnel them both at https://mindweave.app',
    compile: plan([
      step('launch_vertical', { vertical: 'finance_facts', name: 'Money Facts', niche: 'personal finance and money facts', cta_url: 'https://mindweave.app', first_topic: 'the rule of 72 in 30 seconds' }, W('one complete standing channel operation per niche is the vertical planner\'s unit')),
      step('launch_vertical', { vertical: 'pet_care', name: 'Good Dog Facts', niche: 'evidence-based pet care and behavior facts', cta_url: 'https://mindweave.app', first_topic: 'why dogs tilt their heads' }, W('the second niche gets its own operation, paced after the first — sequential spend, not a burst'), [0]),
    ], ['Rendering and posting are NOT in this run: episodes arrive as drafted scripts; Produce happens per-episode in each studio and every post waits in the Queue.']),
    actions: ['launch_vertical', 'launch_vertical'], minHoles: 1,
  },
  // ---- boundary battery (Aug 2026): every confusable pair, pinned from both sides ----
  // Class 1 — WE pitch (client hunt) vs. THEY posted (opportunity hunt): the 2026-08-18 miss class.
  {
    name: 'restaurants-with-terrible-websites is the client hunt, niche extracted',
    intent: 'Find restaurants around town with terrible websites and lets pitch them redesigns',
    compile: plan([step('start_client_hunt', { niche: 'restaurants' }, W('WE are pitching redesigns to discovered businesses — the hunt machine, niche stated'))]),
    actions: ['start_client_hunt'], forbid: ['hunt_opportunities', 'found_company'],
  },
  {
    name: 'posted RFPs from school districts is the opportunity hunt',
    intent: 'Are there any web development RFPs posted by school districts?',
    compile: plan([step('hunt_opportunities', { focus: 'school district web development RFPs' }, W('someone else POSTED the work — finding and triaging it is the opportunity feed'))]),
    actions: ['hunt_opportunities'], forbid: ['start_client_hunt'],
  },
  {
    name: 'gyms-without-booking + pitch automations is the client hunt',
    intent: "Find local gyms that don't have online booking and pitch them automations",
    compile: plan([step('start_client_hunt', { niche: 'gyms' }, W('discovering businesses with a gap and pitching THEM is the client hunt — automations are part of the pitch'))]),
    actions: ['start_client_hunt'], forbid: ['hunt_opportunities'],
  },
  {
    name: 'freelance gigs to apply for is the opportunity hunt',
    intent: 'Look for freelance automation gigs I could apply for',
    compile: plan([step('hunt_opportunities', { focus: 'freelance automation gigs' }, W('applying to posted gigs is finding posted work, not pitching discovered businesses'))]),
    actions: ['hunt_opportunities'], forbid: ['start_client_hunt'],
  },
  {
    name: 'get-us-more-website-customers is the client hunt, breadth asked not guessed',
    intent: 'Go get us more website customers',
    compile: plan([step('start_client_hunt', {}, W('more customers to pitch = the acquisition machine'))],
      [], ['Should the hunt focus on a niche or geography, or stay broad?']),
    actions: ['start_client_hunt'], forbid: ['hunt_opportunities', 'marketing_campaign'], minQuestions: 1,
  },
  {
    name: 'outdated-sites-build-them-better is ONE client hunt — the hunt already builds the demos',
    intent: 'Hunt down businesses with outdated sites and build them something better',
    compile: plan([step('start_client_hunt', {}, W('the hunt already audits sites and builds demo previews — a separate build step would double the machine'))]),
    actions: ['start_client_hunt'], forbid: ['hunt_opportunities', 'build_app'],
  },
  // Class 2 — my venture (found_company) vs. their business (onboard_client) vs. a person (add_contact).
  {
    name: 'starting-my-own-company is a founding, never a client engagement',
    intent: "I'm starting a pool cleaning company",
    compile: plan([step('found_company', { intent: 'pool cleaning company' }, W('the operator\'s own new venture'))]),
    actions: ['found_company'], forbid: ['onboard_client'],
  },
  {
    name: 'hired-to-run-their-marketing is a client engagement, never a founding',
    intent: 'My buddy Dave hired me to run marketing for his HVAC business',
    compile: plan([step('onboard_client', { client_name: 'Dave', business: 'HVAC', scope: 'marketing' }, W('work FOR someone else\'s business is an engagement'))]),
    actions: ['onboard_client'], forbid: ['found_company'],
  },
  {
    name: 'a person to remember is a contact, never a client engagement',
    intent: "Save Maria's info — maria@lakeshore.com, she might list her house this fall",
    compile: plan([step('add_contact', { name: 'Maria', email: 'maria@lakeshore.com' }, W('a real person to keep, not an engagement to run'))]),
    actions: ['add_contact'], forbid: ['onboard_client'],
  },
  // Class 3 — a tool (build_app) vs. a venture (found_company).
  {
    name: 'an embeddable calculator is a builder job, never a company',
    intent: 'Build a mortgage calculator I can embed on my site',
    compile: plan([step('build_app', { idea: 'Embeddable mortgage calculator: loan amount, rate, term, monthly payment breakdown' }, W('a standalone tool is a builder job'))]),
    actions: ['build_app'], forbid: ['found_company'],
  },
  {
    name: 'turn-my-idea-into-a-business is a founding, never just an app',
    intent: 'Turn my meal-prep idea into an actual business',
    compile: plan([step('found_company', { intent: 'meal-prep business' }, W('an actual business is a venture, not a tool'))]),
    actions: ['found_company'], forbid: ['build_app'],
  },
  // Class 4 — the marketing quadrant: app marketing / campaign / one post / content week.
  {
    name: 'get-the-word-out-about-my-app stands up app marketing, not a bare campaign',
    intent: 'Get the word out about my inspection booking app',
    compile: plan([step('start_app_marketing', { app: 'inspection booking app' }, W('marketing an app needs its mapped operation — intel, articles, social, results'))]),
    actions: ['start_app_marketing'], forbid: ['marketing_campaign'],
  },
  {
    name: 'a promo for a named business is a campaign, not app marketing',
    intent: 'Run a spring promo campaign for Northstar',
    compile: plan([step('marketing_campaign', { subject: 'Northstar spring promo', world: 'Northstar' }, W('a business campaign with drafts is exactly this'))]),
    actions: ['marketing_campaign'], forbid: ['start_app_marketing'],
  },
  {
    name: 'one dictated post is queue_social_post, never a whole campaign',
    intent: 'Post that we hit 100 clients on linkedin',
    compile: plan([step('queue_social_post', { text: 'We just hit 100 clients!', platforms: 'linkedin' }, W('a single dictated post, queued for approval'))]),
    actions: ['queue_social_post'], forbid: ['marketing_campaign', 'start_content_week'],
  },
  {
    name: 'a-few-posts-a-week is the content week, never a one-off post or campaign',
    intent: 'Keep my socials warm with a few posts a week for Mural Co',
    compile: plan([step('start_content_week', { world: 'Mural Co', posts_per_week: '3' }, W('recurring judged content behind one weekly approval'))]),
    actions: ['start_content_week'], forbid: ['queue_social_post', 'marketing_campaign'],
  },
  // Class 5 — email to contacts vs. a digest to ME vs. a reminder to ME.
  {
    name: 'a dictated email to an owned segment is the batch rail, never a digest',
    intent: 'Email all my new leads about the fall special: subject "Fall tune-up special" body "Hi {{first_name}}, fall slots just opened..."',
    compile: plan([step('email_segment', { segment: 'lead', subject: 'Fall tune-up special', body: 'Hi {{first_name}}, fall slots just opened...' }, W('one dictated email to an owned segment'))]),
    actions: ['email_segment'], forbid: ['cadence_digest', 'marketing_campaign'],
  },
  {
    name: 'a weekly pipeline summary to ME is a digest, never an email blast',
    intent: 'Every Friday send me where the pipeline stands for Riverline',
    compile: plan([step('cadence_digest', { world: 'Riverline', cadence: 'weekly' }, W('a recurring report of real activity to the operator'))]),
    actions: ['cadence_digest'], forbid: ['email_segment', 'add_reminder'],
  },
  {
    name: 'ping-me-tomorrow is a reminder, never a digest',
    intent: 'Ping me tomorrow morning to call the sign shop',
    compile: plan([step('add_reminder', { title: 'Call the sign shop', due_at: '2026-08-19T14:00:00Z' }, W('a single timed nudge'))]),
    actions: ['add_reminder'], forbid: ['cadence_digest'],
  },
  // Class 6 — watch a KNOWN page vs. hunt for UNKNOWN postings.
  {
    name: 'watch-this-url-for-changes is a page watch, never a hunt',
    intent: 'Keep an eye on https://rival.com/pricing and tell me when it changes',
    compile: plan([step('watch_page', { url: 'https://rival.com/pricing', label: 'Rival pricing page' }, W('a named page whose changes are the signal'))]),
    actions: ['watch_page'], forbid: ['hunt_opportunities'],
  },
  {
    name: 'keep-an-eye-out-for-new-contracts is a hunt, never a page watch',
    intent: 'Keep an eye out for new city sign-painting contracts',
    compile: plan([step('hunt_opportunities', { focus: 'city sign-painting contracts' }, W('no page was named — finding postings across the web is the hunt'))]),
    actions: ['hunt_opportunities'], forbid: ['watch_page'],
  },
  // Class 7 — research vs. thesis vs. plan.
  {
    name: 'dig-into-the-competition is research, never a full plan',
    intent: 'Dig into the competition for Lakefront Media',
    compile: plan([step('research_market', { world: 'Lakefront Media' }, W('grounded competitor findings are the ask — a plan was never mentioned'))]),
    actions: ['research_market'], forbid: ['business_plan'],
  },
  {
    name: 'write-down-my-core-belief is a thesis, never a plan or research',
    intent: 'Core belief: farms beat funnels for realtors — write that down',
    compile: plan([step('record_thesis', { title: 'Farms beat funnels for realtors', body: 'Geographic farming outperforms funnel spend for realtors — carry this into every marketing decision.' }, W('a durable position worth carrying into future decisions'))]),
    actions: ['record_thesis'], forbid: ['business_plan', 'research_market'],
  },
  // Class 8 — money: a real invoice vs. a document template.
  {
    name: 'bill-tom-with-amount-and-email compiles a real invoice draft',
    intent: 'Bill Tom $1200 for the automation setup, tom@hvacdave.com',
    compile: plan([step('create_invoice', { title: 'Automation setup', to_email: 'tom@hvacdave.com', amount_usd: '1200' }, W('a stated amount and recipient make a real draft invoice — the send waits in the Queue'))]),
    actions: ['create_invoice'], forbid: ['template_document'],
  },
  {
    name: 'a reusable proposal template is the paperwork studio, never an invoice',
    intent: 'Make me a reusable proposal template from my last proposal',
    compile: plan([step('template_document', { note: 'proposal template from the last proposal' }, W('sample→template extraction is the studio\'s job'))]),
    actions: ['template_document'], forbid: ['create_invoice'],
  },
];
