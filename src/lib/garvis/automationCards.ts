// src/lib/garvis/automationCards.ts
// THE STANDING CARDS — pure core (verified by automationCards.verify.ts). Every automated thing in
// this app explains itself with the same card, built on the trust-calibration evidence base
// (Lee & See's purpose/process/performance triad; Sarter & Woods observability; the shipped-product
// teardown of Zapier/Lindy/HubSpot/Agentforce):
//   - WHEN + DOES: the trigger-grammar sentence ("When X happens → it does Y") every legible
//     product converges on.
//   - THREE RUNGS, named by what THE HUMAN does, uniform across every card, never self-changing.
//     Our approval spine makes the ladder structural truth: anything that SENDS sits at
//     "drafts — you approve" (the Queue is the gate); "runs on its own" is reserved for work that
//     reads and records but never sends. The one exception (missed-call text-back sends the
//     owner's own saved template instantly) is explicit, bounded, and whitelisted by name.
//   - REPLACES in scope terms, never hours/FTE claims (the 11x lesson: unconditional
//     replacement claims are the documented overclaim disaster).
//   - THE SOP: 3-7 verifiable numbered steps with the human checkpoint marked inline.
//   - HUMAN + NEVER: what stays yours, and the boundary it will not cross (the antidote to
//     name-induced overexpectation).
//   - Mechanism language throughout — no personas, no "AI employee", no first-person agency.
// Deterministic data + pure helpers. The verify suite is the honesty gate: full coverage of the
// heartbeat jobs and standing-order kinds, rung discipline for send-capable rails, banned-claim
// and persona linting of every card's copy.

import { EXPECTED_JOBS } from './systemControl';
import type { OrderKind } from './standing';

export type AutonomyRung = 'suggests' | 'drafts' | 'runs';

/** ONE label per rung, used verbatim everywhere — uniform mode semantics across every card
 *  (mode proliferation and inconsistent meanings are the documented cause of mode confusion). */
export const RUNG_LABEL: Record<AutonomyRung, string> = {
  suggests: 'It suggests — you decide',
  drafts: 'It drafts — you approve',
  runs: 'Runs on its own — never sends',
};

export interface AutomationCard {
  id: string;
  name: string;            // boundary-encoding, non-persona ("Invoice chase drafter", not "your AR assistant")
  when: string;            // the trigger in plain words ("Every day", "When a lead lands", "On the channel's clock")
  does: string;            // one sentence: when X → it does Y
  replaces: string;        // the manual work, in scope terms — never an hours claim
  rung: AutonomyRung;
  human: string;           // what stays yours
  never: string;           // the boundary it will not cross
  sop: string[];           // 3-7 verifiable steps; human checkpoints marked inline
  killSwitch: string;      // where to turn it off
  doneBy: string;          // the rail/function that executes (mechanism language)
}

// ---------------------------------------------------------------------------
// The heartbeat fleet — the 13 cron jobs garvis_arm_heartbeat schedules.
// ---------------------------------------------------------------------------
export const HEARTBEAT_CARDS: Record<(typeof EXPECTED_JOBS)[number], AutomationCard> = {
  'garvis-pulse-hourly': {
    id: 'garvis-pulse-hourly', name: 'Pulse', when: 'Every hour',
    does: 'Sweeps every world for anything that needs you — new leads, stalled work, due checks — and updates the waking-moment feed.',
    replaces: 'Opening each world to see if anything happened.',
    rung: 'runs',
    human: 'You act on what it surfaces; it only points.',
    never: 'Never messages anyone, never changes your work.',
    sop: ['Scan each world for new events since the last pulse', 'Rank what needs attention', 'Write the findings to the feed'],
    killSwitch: 'System health → Master switch', doneBy: 'garvis-pulse',
  },
  'garvis-worker-tick': {
    id: 'garvis-worker-tick', name: 'Approved-work runner', when: 'Every 5 minutes',
    does: 'Executes work you already approved in the Queue — sends, publishes, deploys — exactly as approved.',
    replaces: 'Pressing go on each approved item yourself.',
    rung: 'drafts',
    human: 'Every item it runs passed your approval first; unapproved work never moves.',
    never: 'Never invents work — it only executes what carries your approval.',
    sop: ['Pick up only work that passed your approval in the Queue', 'Verify the approval matches the payload (hash check)', 'Execute through the one gated send path', 'Record the run and its result'],
    killSwitch: 'System health → Master switch', doneBy: 'garvis-worker',
  },
  'garvis-standing-tick': {
    id: 'garvis-standing-tick', name: 'Standing-orders clock', when: 'Every 15 minutes',
    does: 'Runs due standing orders — page watches, digests, hunts, channel drafts — and records what they found.',
    replaces: 'Remembering to run your recurring checks.',
    rung: 'runs',
    human: 'You set the orders and read the findings.',
    never: 'Never sends anything — findings land in the world, drafts land in your review.',
    sop: ['Find orders past their next-run time', 'Run each through its worker', 'Save findings as world artifacts', 'Schedule the next run'],
    killSwitch: 'The order\'s pause button, or System health → Master switch', doneBy: 'standing-worker',
  },
  'garvis-followups-daily': {
    id: 'garvis-followups-daily', name: 'Follow-up drafter', when: 'Every day at 13:00 UTC',
    does: 'Finds outreach that went quiet and drafts the polite bump — into your Queue, not the wire.',
    replaces: 'Combing sent mail for threads that need a nudge.',
    rung: 'drafts',
    human: 'You approve or discard every draft in the Queue.',
    never: 'Never sends on its own; suppression and unsubscribes always respected.',
    sop: ['Find threads quiet past the follow-up window', 'Draft a short bump in your voice', 'Queue each draft → waits for your approval', 'Send only after you approve'],
    killSwitch: 'System health → Master switch', doneBy: 'outreach-followups',
  },
  'garvis-inbox-draft-daily': {
    id: 'garvis-inbox-draft-daily', name: 'Inbox reply drafter', when: 'Every day',
    does: 'Reads unanswered inbound messages and drafts replies from your saved answers — ready in the Queue.',
    replaces: 'Writing each routine reply from scratch.',
    rung: 'drafts',
    human: 'You review, edit, and approve every reply.',
    never: 'Never answers anyone directly; unsure messages are left for you with a note.',
    sop: ['Collect unanswered inbound messages', 'Match each against your knowledge base', 'Draft a reply where confident → waits in your Queue', 'Flag the ones it could not answer'],
    killSwitch: 'System health → Master switch', doneBy: 'inbox-draft worker',
  },
  'garvis-ads-watch-daily': {
    id: 'garvis-ads-watch-daily', name: 'Ads watcher', when: 'Every day at 10:15 UTC',
    does: 'Reads your connected ad accounts and flags spend drift, dead creatives, and broken links.',
    replaces: 'Logging into ad managers to check nothing is burning money.',
    rung: 'runs',
    human: 'You decide what to pause or change.',
    never: 'Never edits campaigns or budgets.',
    sop: ['Pull yesterday\'s numbers per campaign', 'Compare against the watch rules', 'Write findings and alerts to the world'],
    killSwitch: 'System health → Master switch', doneBy: 'ads-watch',
  },
  'garvis-invoice-chase-daily': {
    id: 'garvis-invoice-chase-daily', name: 'Invoice chase drafter', when: 'Every day',
    does: 'Finds overdue invoices and drafts the reminder ladder — friendly, firm, final — into your Queue.',
    replaces: 'Tracking who owes you and writing awkward reminder emails.',
    rung: 'drafts',
    human: 'You approve every reminder before it sends.',
    never: 'Never sends a chase on its own; never threatens — the copy stays professional.',
    sop: ['Find invoices past due', 'Pick the right rung of the reminder ladder', 'Draft the reminder → waits for your approval', 'Record the chase after you approve'],
    killSwitch: 'System health → Master switch', doneBy: 'invoice-chase',
  },
  'garvis-scorecard-weekly': {
    id: 'garvis-scorecard-weekly', name: 'Weekly scorecard', when: 'Every week',
    does: 'Compiles the week across every world — what ran, what landed, what went quiet — into one honest report.',
    replaces: 'Assembling your own week-in-review from a dozen pages.',
    rung: 'runs',
    human: 'You read it; it changes nothing.',
    never: 'Never sends the scorecard anywhere — it waits for you.',
    sop: ['Gather the week\'s events per world', 'Compute the honest numbers (no vanity metrics)', 'Write the scorecard artifact'],
    killSwitch: 'System health → Master switch', doneBy: 'garvis-scorecard',
  },
  'garvis-reactivate-monthly': {
    id: 'garvis-reactivate-monthly', name: 'Reactivation drafter', when: 'Monthly',
    does: 'Finds past clients and contacts gone quiet for months and drafts a warm check-in — into your Queue.',
    replaces: 'Remembering which old clients to reach back out to.',
    rung: 'drafts',
    human: 'You approve every check-in before it sends.',
    never: 'Never contacts anyone on its own; only warm lists, never cold.',
    sop: ['Find contacts quiet past the reactivation window', 'Draft a warm, specific check-in each', 'Queue each draft → waits for your approval'],
    killSwitch: 'System health → Master switch', doneBy: 'outreach-reactivate',
  },
  'garvis-consolidate-weekly': {
    id: 'garvis-consolidate-weekly', name: 'Memory consolidation', when: 'Every week',
    does: 'Tidies each world\'s knowledge — merges duplicates, promotes what mattered, archives what died.',
    replaces: 'Manual knowledge-base gardening.',
    rung: 'runs',
    human: 'Structure changes surface for review; nothing is deleted silently.',
    never: 'Never destroys content — archived is recoverable, deletions need you.',
    sop: ['Scan each world\'s knowledge graph', 'Propose merges and promotions', 'Apply the safe ones; queue the rest for review'],
    killSwitch: 'System health → Master switch', doneBy: 'garvis-consolidate',
  },
  'garvis-social-sync': {
    id: 'garvis-social-sync', name: 'Social metrics sync', when: 'Every few hours',
    does: 'Pulls views, watch-time, and engagement for your published posts back into the learning loop.',
    replaces: 'Copying numbers out of five platform dashboards.',
    rung: 'runs',
    human: 'You read the verdicts the loop computes from it.',
    never: 'Never posts, edits, or deletes anything on your accounts.',
    sop: ['List recently posted content', 'Fetch each post\'s real metrics', 'Store them for baselines, verdicts, and the channel pulse'],
    killSwitch: 'System health → Master switch', doneBy: 'social-sync',
  },
  'garvis-canary-nightly': {
    id: 'garvis-canary-nightly', name: 'Nightly canary', when: 'Every night',
    does: 'Exercises the critical paths end to end and records what broke before you find out the hard way.',
    replaces: 'Discovering a dead integration only when you needed it.',
    rung: 'runs',
    human: 'You read the report; broken things wait for your fix.',
    never: 'Never repairs anything itself — it only detects and reports.',
    sop: ['Run each critical-path probe', 'Compare against expected behavior', 'Write the canary report with failures first'],
    killSwitch: 'System health → Master switch', doneBy: 'garvis-canary',
  },
  'garvis-mls-sync': {
    id: 'garvis-mls-sync', name: 'MLS feed sync', when: 'Every day',
    does: 'Pulls fresh listing data from your MLS feed so market stats and campaigns build on current inventory.',
    replaces: 'Manually refreshing the listing feed before using it.',
    rung: 'runs',
    human: 'You use the data; it only fetches.',
    never: 'Never publishes or sends anything from the feed.',
    sop: ['Fetch listings changed since the last sync', 'Update the local market data', 'Record the sync result'],
    killSwitch: 'System health → Master switch', doneBy: 'mls-sync',
  },
};

// ---------------------------------------------------------------------------
// Standing-order kinds — the per-world clock.
// ---------------------------------------------------------------------------
export const ORDER_CARDS: Record<OrderKind, AutomationCard> = {
  watch_url: {
    id: 'watch_url', name: 'Page watch', when: 'On the cadence you set',
    does: 'Checks a page you care about and records when its content actually changes.',
    replaces: 'Re-visiting the page to see if anything moved.',
    rung: 'runs',
    human: 'You decide what a change means.',
    never: 'Never acts on a change — it only records and surfaces it.',
    sop: ['Fetch the page', 'Compare against the last snapshot', 'Record changed / unchanged / unreachable — honestly'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  cadence_digest: {
    id: 'cadence_digest', name: 'World digest', when: 'On the cadence you set',
    does: 'Summarizes what happened in this world since the last digest — activity, findings, stalls.',
    replaces: 'Scrolling the world\'s history to catch up.',
    rung: 'runs',
    human: 'You read it; it changes nothing.',
    never: 'Never sends the digest anywhere.',
    sop: ['Gather events since the last digest', 'Summarize with the quiet parts included', 'Save the digest to the world'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  client_hunt: {
    id: 'client_hunt', name: 'Client hunt', when: 'On the cadence you set',
    does: 'Searches for businesses matching your target profile and records the candidates it found.',
    replaces: 'Manual prospect list building.',
    rung: 'suggests',
    human: 'You pick who to actually pursue.',
    never: 'Never contacts anyone it finds.',
    sop: ['Run the hunt against your profile', 'Score and dedupe candidates', 'Save the catch for your triage'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  idea_stream: {
    id: 'idea_stream', name: 'Idea stream', when: 'On the cadence you set',
    does: 'Generates fresh angles and ideas for this world from its own knowledge and goals.',
    replaces: 'Staring at a blank page for the next angle.',
    rung: 'suggests',
    human: 'You pick which ideas become work.',
    never: 'Never turns an idea into action by itself.',
    sop: ['Read the world\'s goal and recent work', 'Generate distinct new angles', 'Save them for your review'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  content_week: {
    id: 'content_week', name: 'Content week planner', when: 'Weekly',
    does: 'Drafts a week of content ideas for this world — themes, hooks, formats — for your review.',
    replaces: 'Planning the content calendar by hand.',
    rung: 'suggests',
    human: 'You choose what gets produced.',
    never: 'Never produces or posts the content itself.',
    sop: ['Read what worked recently', 'Draft the week\'s slate', 'Save it for your review'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  opportunity_hunt: {
    id: 'opportunity_hunt', name: 'Opportunity hunt', when: 'On the cadence you set',
    does: 'Scans for jobs, RFPs, grants, and commissions that match this world and records the catches.',
    replaces: 'Trawling listing sites for relevant opportunities.',
    rung: 'suggests',
    human: 'You triage the feed and decide what to chase.',
    never: 'Never applies or responds to anything.',
    sop: ['Scan the configured sources', 'Match against this world\'s profile', 'Save catches to the opportunity feed'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  area_study: {
    id: 'area_study', name: 'Area study', when: 'On the cadence you set',
    does: 'Sweeps the businesses of an area and compiles honest cohort stats — only what was actually scanned.',
    replaces: 'Researching a territory business by business.',
    rung: 'runs',
    human: 'You use the study; unreachable sites are disclosed, never guessed.',
    never: 'Never contacts the businesses it studies.',
    sop: ['Sweep the area\'s businesses', 'Scan what is reachable; count the rest honestly', 'Compile the study with its limits stated'],
    killSwitch: 'Pause on the order\'s row', doneBy: 'standing-worker',
  },
  episode_draft: {
    id: 'episode_draft', name: 'Daily episode drafter', when: 'Daily, on the channel\'s clock',
    does: 'Drafts the next cited episode for your channel — script, hooks, sources — informed by which hooks won.',
    replaces: 'Coming up with tomorrow\'s episode from scratch every day.',
    rung: 'drafts',
    human: 'You review the script, produce it (or film it), and approve the post — every step stays yours.',
    never: 'Never produces, renders, or posts on its own — a draft is where it stops.',
    sop: ['Read the channel\'s winning and quiet hooks', 'Draft a cited script avoiding recent topics', 'Flag uncited claims for review', 'Save as a draft episode → production and posting wait for you'],
    killSwitch: 'The auto-draft chip on the channel, or pause the order', doneBy: 'standing-worker',
  },
};

/** The capability rungs (Automations page): explicit per-capability, because the rail alone
 *  doesn't tell the whole truth. missed_call_text_back is the ONE send-without-approval in the
 *  product — the instant text-back of the owner's own saved template — and is whitelisted here
 *  by name; everything else that can send drafts into the Queue. */
export const CAPABILITY_RUNG: Record<string, AutonomyRung> = {
  lead_followup: 'drafts',
  review_request: 'drafts',
  invoice_chase: 'drafts',
  reactivation: 'drafts',
  seasonal_maintenance: 'drafts',
  hygiene_recall: 'drafts',
  online_booking: 'runs',
  missed_call_text_back: 'runs',
  esign_paperwork: 'drafts',
  appointment_reminder: 'drafts',
};

/** Send-capable rungs must be 'drafts' unless whitelisted — the structural honesty check. */
export const SEND_WITHOUT_APPROVAL_WHITELIST = ['missed_call_text_back'];

export function cardForOrderKind(kind: OrderKind): AutomationCard {
  return ORDER_CARDS[kind];
}

export function cardForJob(job: string): AutomationCard | null {
  return (HEARTBEAT_CARDS as Record<string, AutomationCard>)[job] ?? null;
}
