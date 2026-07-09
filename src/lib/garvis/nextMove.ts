// src/lib/garvis/nextMove.ts
// THE NEXT MOVE ENGINE — pure core (no Supabase, no DOM; verified by nextMove.verify.ts).
//
// The anticipation layer's answer to "how does Garvis decide what should happen next?"
// (docs/garvis-anticipation-design.md §4, docs/garvis-universe-model.md §8): collectors are pure
// functions over rows the spine already emits; ranking is DETERMINISTIC (urgency × value × decay);
// the LLM is never asked to rank and never invents a number. Every move's `why` answers the round-4
// requirement — "why should I care?" — with evidence from the rows themselves, or it doesn't ship.
//
// No-Theater rules apply: every line here maps to real state. The cold-start floor (blocking_empty)
// needs zero history, so the waking moment is never an empty room on day one.
//
// Optimization target, for the record: Garvis optimizes INTELLECTUAL MOMENTUM — every move exists
// to keep the user moving, never to notify for notification's sake. Max three surfaced; scarcity is
// what makes it read as judgment.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MoveKind =
  | 'reply_unanswered'   // the highest-value event in the system
  | 'approval_waiting'   // the user IS the bottleneck
  | 'followup_staged'    // curated drafts ready to queue
  | 'natural_next'       // a play finished; nothing queued from its outputs
  | 'blocking_empty'     // structural floor: an empty area blocks a live one (needs no history)
  | 'insight_connection' // "Garvis noticed" — the brain found a link
  | 'reflection_due'     // enough happened in a world that a reflection would teach something
  | 'intel_stale'        // the world's research is old enough to mislead
  | 'draft_waiting';     // genesis designed a world; it exists only if the user approves it

export interface NextMove {
  key: string;                 // stable identity for dedupe + dismissal
  kind: MoveKind;
  title: string;               // one line, plain language
  why: string;                 // WHY SHOULD I CARE — evidence from rows, never invented
  action: { label: string; route: string };
  score: number;               // deterministic; filled by rankMoves
  bornAt: string;              // ISO — drives urgency + decay
  /** The reasoning layer (round 5): recommendation rationale + expected outcome. `basis` is the
   *  honesty tag — 'measured' only when it comes from THIS account's rows; 'heuristic' when it's
   *  domain knowledge (and the UI says so); 'structural' when it's pure dependency logic. */
  expected?: { text: string; basis: 'measured' | 'heuristic' | 'structural' };
}

export interface Dismissals { [key: string]: string } // key → ISO timestamp of dismissal

// Row shapes — the minimal projections the impure layer fetches. Kept structural so the pure core
// never imports Supabase types.
export interface ApprovalRowIn { id: string; kind: string; title: string; created_at: string }
export interface ReplyRowIn {
  id: string; from_address: string | null; subject: string | null;
  classification: string; received_at: string; world_id: string | null; has_next_touch: boolean;
}
export interface StagedRowIn { campaign_id: string; world_id: string | null; to_address: string | null; steps: number; oldest_created_at: string }
export interface InsightRowIn { id: string; title: string; body: string; score: number; created_at: string }
export interface FloorIn {
  worldId: string; worldTitle: string;
  audienceEmpty: boolean;      // an audience-archetype cluster exists with zero contacts behind it
  brandEmpty: boolean;         // a vault/brand cluster exists but no brand kit saved
  launchActive: boolean;       // a launch/loop cluster has artifacts or queued work (the blockee)
  asOf: string;
}
export interface MissionDoneIn { missionId: string; worldId: string | null; subject: string | null; artifactCount: number; sendsQueued: number; updated_at: string }

// ---------------------------------------------------------------------------
// Collectors — rows in, moves out. Pure. Every why-line carries its evidence.
// ---------------------------------------------------------------------------

const short = (s: string | null | undefined, n = 60) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function collectReplies(rows: ReplyRowIn[]): NextMove[] {
  return rows
    .filter((r) => r.classification === 'positive' && !r.has_next_touch)
    .map((r) => ({
      key: `reply:${r.id}`,
      kind: 'reply_unanswered' as const,
      title: `${short(r.from_address, 40) || 'A prospect'} replied — answer while it's warm`,
      why: `They replied "${short(r.subject, 40) || 'interested'}" and no next touch is queued. Warm replies cool fast.`,
      action: { label: 'Draft the follow-up', route: r.world_id ? `/garvis/webs/${r.world_id}` : '/garvis/webs' },
      score: 0,
      bornAt: r.received_at,
      expected: { text: 'Answering today keeps the thread alive — interest decays fast after the first day or two.', basis: 'heuristic' },
    }));
}

export function collectApprovals(rows: ApprovalRowIn[]): NextMove[] {
  if (!rows.length) return [];
  // One move for the whole queue — the queue is one decision surface, not N notifications.
  const oldest = rows.reduce((a, b) => (a.created_at < b.created_at ? a : b));
  const kinds = [...new Set(rows.map((r) => r.kind.replace(/_/g, ' ')))].slice(0, 3).join(', ');
  return [{
    key: 'approvals:pending',
    kind: 'approval_waiting',
    title: rows.length === 1 ? `1 action is waiting for your approval` : `${rows.length} actions are waiting for your approval`,
    why: `${kinds} — nothing goes out without you, and it's been waiting since you were last here.`,
    action: { label: 'Review & decide', route: '/garvis/approvals' },
    score: 0,
    bornAt: oldest.created_at,
  }];
}

export function collectStagedFollowups(rows: StagedRowIn[]): NextMove[] {
  return rows.map((r) => ({
    key: `staged:${r.campaign_id}`,
    kind: 'followup_staged' as const,
    title: `Follow-up drafts are ready for ${short(r.to_address, 36) || 'a contact'}`,
    why: `Touch 1 sent; ${r.steps} curated follow-up${r.steps === 1 ? '' : 's'} sit as drafts. Sequences work when the cadence holds.`,
    action: { label: 'Queue the next touch', route: r.world_id ? `/garvis/webs/${r.world_id}` : '/garvis/webs' },
    score: 0,
    bornAt: r.oldest_created_at,
  }));
}

export function collectInsights(rows: InsightRowIn[]): NextMove[] {
  return rows
    .filter((r) => r.score >= 0.5) // only strong connections earn a slot (score is cosine, never invented)
    .map((r) => ({
      key: `insight:${r.id}`,
      kind: 'insight_connection' as const,
      title: short(r.title, 80) || 'Garvis noticed a connection',
      why: `${short(r.body, 110)} (${Math.round(r.score * 100)}% similar — measured, not guessed.)`,
      action: { label: 'See the connection', route: '/garvis/brain' },
      score: 0,
      bornAt: r.created_at,
    }));
}

/** The cold-start floor: needs no history — computable from structure alone. */
export function collectFloor(rows: FloorIn[]): NextMove[] {
  const out: NextMove[] = [];
  for (const f of rows) {
    if (f.audienceEmpty && f.launchActive) {
      out.push({
        key: `floor:audience:${f.worldId}`,
        kind: 'blocking_empty',
        title: `${f.worldTitle}: the mailing list is empty — and it's blocking sends`,
        why: `Work is staged to go out, but there's nobody to send it to yet. One CSV unblocks the whole channel.`,
        action: { label: 'Upload the list', route: `/garvis/webs/${f.worldId}` },
        score: 0, bornAt: f.asOf,
        expected: { text: 'Unblocks every queued send in this channel at once.', basis: 'structural' },
      });
    }
    if (f.brandEmpty) {
      out.push({
        key: `floor:brand:${f.worldId}`,
        kind: 'blocking_empty',
        title: `${f.worldTitle}: the brand vault is empty`,
        why: `Every studio writes in the brand's voice — logo, tone, compliance line. Five minutes here upgrades everything downstream.`,
        action: { label: 'Set up the brand', route: `/garvis/webs/${f.worldId}` },
        score: 0, bornAt: f.asOf,
      });
    }
  }
  return out;
}

export interface WorldIntelIn {
  worldId: string; worldTitle: string;
  reflectionDueNow: boolean; events7d: number;
  intelAgeDays: number | null;
  topOpenQuestion: string | null;
  asOf: string;
}

export interface DraftRowIn { id: string; title: string; areas: number; created_at: string }

/** Genesis drafts: a designed world awaiting judgment. Structural — the row IS the evidence. */
export function collectDrafts(rows: DraftRowIn[]): NextMove[] {
  return rows.map((r) => ({
    key: `draft:${r.id}`,
    kind: 'draft_waiting' as const,
    title: `A draft world awaits your review — "${short(r.title, 48)}"`,
    why: `Genesis designed ${r.areas} production area${r.areas === 1 ? '' : 's'} from your intent. Nothing exists until you approve it.`,
    action: { label: 'Review the draft', route: '/garvis/webs' },
    score: 0,
    bornAt: r.created_at,
    expected: { text: 'Approving charters the web — every area arrives with its tools and its stated reason.', basis: 'structural' as const },
  }));
}

/** Rule 6 made literal: the intelligence layer feeds the morning. */
export function collectWorldIntel(rows: WorldIntelIn[]): NextMove[] {
  const out: NextMove[] = [];
  for (const w of rows) {
    if (w.reflectionDueNow) {
      out.push({
        key: `reflect:${w.worldId}`,
        kind: 'reflection_due',
        title: `${w.worldTitle}: a week's worth of work is worth a reflection`,
        why: `${w.events7d} recorded events since the last reflection${w.topOpenQuestion ? ` — and one question is still open: "${short(w.topOpenQuestion, 80)}"` : ''}. Lessons compound only if they're written down.`,
        action: { label: 'Reflect now', route: `/garvis/webs/${w.worldId}` },
        score: 0, bornAt: w.asOf,
        expected: { text: 'A reflection turns this week\'s record into next week\'s strategy.', basis: 'structural' },
      });
    }
    if (w.intelAgeDays != null && w.intelAgeDays > 14) {
      out.push({
        key: `intel:${w.worldId}`,
        kind: 'intel_stale',
        title: `${w.worldTitle}: the market intel is ${Math.round(w.intelAgeDays)} days old`,
        why: `Campaigns are quoting research from ${Math.round(w.intelAgeDays)} days ago. Decisions age with their data.`,
        action: { label: 'Refresh the research', route: `/garvis/webs/${w.worldId}` },
        score: 0, bornAt: w.asOf,
      });
    }
  }
  return out;
}

export function collectNaturalNext(rows: MissionDoneIn[]): NextMove[] {
  return rows
    .filter((m) => m.artifactCount > 0 && m.sendsQueued === 0)
    .map((m) => ({
      key: `natural:${m.missionId}`,
      kind: 'natural_next' as const,
      title: `${short(m.subject, 50) || 'A play'} produced ${m.artifactCount} artifacts — nothing is queued yet`,
      why: `The creative is done and reviewed by nobody outside this room. Work that never ships is a draft, not a campaign.`,
      action: { label: 'Queue the first send', route: m.worldId ? `/garvis/webs/${m.worldId}` : '/garvis/webs' },
      score: 0,
      bornAt: m.updated_at,
    }));
}

// ---------------------------------------------------------------------------
// Ranking — deterministic. value(kind) + urgency(age) − dismissal penalty − staleness decay.
// ---------------------------------------------------------------------------

const BASE_VALUE: Record<MoveKind, number> = {
  reply_unanswered: 100,   // a warm human is worth more than anything else in the system
  approval_waiting: 90,    // the user is the bottleneck
  draft_waiting: 75,       // a designed world waiting on judgment — decide it before it goes stale
  natural_next: 60,
  followup_staged: 55,
  blocking_empty: 50,
  reflection_due: 45,      // learning compounds — but a warm reply still comes first
  insight_connection: 40,
  intel_stale: 30,
};

const HOUR = 3_600_000;
const DISMISS_PENALTY = 200;          // a dismissal silences a move…
const DISMISS_WINDOW_MS = 7 * 24 * HOUR; // …for seven days, then it may earn its way back
const STALE_AFTER_MS = 14 * 24 * HOUR;   // moves older than two weeks decay away entirely

export function scoreMove(m: NextMove, now: Date, dismissals: Dismissals): number {
  const age = now.getTime() - new Date(m.bornAt).getTime();
  if (age > STALE_AFTER_MS) return -1;
  const urgency = Math.min(Math.max(age, 0), 72 * HOUR) / (72 * HOUR) * 30; // grows for 3 days, caps
  const dismissedAt = dismissals[m.key];
  const penalty = dismissedAt && now.getTime() - new Date(dismissedAt).getTime() < DISMISS_WINDOW_MS ? DISMISS_PENALTY : 0;
  return BASE_VALUE[m.kind] + urgency - penalty;
}

/** Rank + dedupe. Returns ALL positive-scoring moves sorted (the UI caps display at 3; the cap
 *  limits emphasis, never access — "see all" shows the rest). */
export function rankMoves(moves: NextMove[], now: Date, dismissals: Dismissals = {}): NextMove[] {
  const seen = new Set<string>();
  return moves
    .filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)))
    .map((m) => ({ ...m, score: scoreMove(m, now, dismissals) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// The waking digest — greeting + "while you were away" lines from the record.
// ---------------------------------------------------------------------------

export function greetingFor(hour: number, name: string): string {
  if (hour < 5) return `Working late, ${name}.`;
  if (hour < 12) return `Good morning, ${name}.`;
  if (hour < 18) return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}

export interface MindEventIn { event_type: string; subject: string; occurred_at: string; payload?: Record<string, unknown> | null }
export interface AwayLine { text: string; occurredAt: string }

/** Narrative weaving (round 5 — observations, not notifications): when a sent email and a reply
 *  share a REAL campaign_id in their payloads, merge them into one causal observation. Only rows
 *  that actually connect get connected — narrative is a join, never a guess. */
function weave(events: MindEventIn[]): MindEventIn[] {
  const campaignOf = (e: MindEventIn) => (e.payload && typeof e.payload.campaign_id === 'string' ? e.payload.campaign_id : null);
  const repliedCampaigns = new Set(events.filter((e) => e.event_type === 'reply_received').map(campaignOf).filter(Boolean) as string[]);
  const out: MindEventIn[] = [];
  for (const e of events) {
    const cid = campaignOf(e);
    if (e.event_type === 'email_sent' && cid && repliedCampaigns.has(cid)) continue; // folded into the reply line
    if (e.event_type === 'reply_received' && cid && events.some((x) => x.event_type === 'email_sent' && campaignOf(x) === cid)) {
      out.push({ ...e, subject: `That send worked — ${e.subject}` });
    } else {
      out.push(e);
    }
  }
  return out;
}

// mind_events subjects are already written as human one-liners (that's their design contract) —
// the digest trusts them and only adds a light frame by type. Unknown types pass through as-is:
// the record is the source of truth, not this map.
const FRAME: Record<string, (s: string) => string> = {
  email_sent: (s) => s,
  reply_received: (s) => s,
  mission_planned: (s) => s,
  agent_run_finished: (s) => `Finished: ${s}`,
  agent_run_failed: (s) => `Needs a look: ${s}`,
  generation_completed: (s) => `Built: ${s}`,
  artifact_imported: (s) => s,
  note: (s) => s,
};

/** Compose the "while you were away" lines: woven (send→reply joins), newest first, deduped, capped. */
export function awayLines(events: MindEventIn[], sinceIso: string | null, cap = 4): AwayLine[] {
  const since = sinceIso ? new Date(sinceIso).getTime() : 0;
  const seen = new Set<string>();
  const out: AwayLine[] = [];
  for (const e of weave([...events]).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))) {
    if (new Date(e.occurred_at).getTime() <= since) continue;
    const subject = e.subject.trim();
    if (!subject || seen.has(subject)) continue;
    seen.add(subject);
    out.push({ text: (FRAME[e.event_type] ?? ((s: string) => s))(subject), occurredAt: e.occurred_at });
    if (out.length >= cap) break;
  }
  return out;
}

/** First-run seed — the one line allowed to exist without a row behind it, because it IS the
 *  invitation to create the first row. */
export const COLD_SKY_LINE = 'Say anything — a question, a business, a thing you want to build — and I\'ll make it a world.';
