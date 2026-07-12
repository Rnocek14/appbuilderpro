// src/lib/garvis/nextMove.verify.ts
// Standalone verification of the Next Move engine (run: `npm run verify:nextmove`).
// Guards the anticipation contracts: deterministic ranking, the reply-beats-everything ordering,
// dismissal silencing + expiry, staleness decay, cold-start floor, why-lines carrying evidence,
// digest composition (since-filter, dedupe, cap, unknown-type passthrough).

import {
  collectReplies, collectApprovals, collectStagedFollowups, collectInsights, collectFloor,
  collectNaturalNext, collectWorldIntel, collectDrafts, collectLeads, collectReminders, collectTrails, rankMoves, scoreMove, greetingFor, awayLines, COLD_SKY_LINE,
  type NextMove, type Dismissals,
} from './nextMove';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const NOW = new Date('2026-07-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// 1. Collectors — evidence in the why-lines, correct filtering.
{
  const replies = collectReplies([
    { id: 'r1', from_address: 'bob@pier.example', subject: 'interested', classification: 'positive', received_at: hoursAgo(2), world_id: 'w1', has_next_touch: false },
    { id: 'r2', from_address: 'no@x.com', subject: 'stop', classification: 'negative', received_at: hoursAgo(2), world_id: null, has_next_touch: false },
    { id: 'r3', from_address: 'done@x.com', subject: 'yes', classification: 'positive', received_at: hoursAgo(2), world_id: null, has_next_touch: true },
  ]);
  check('replies: only positive without a next touch', replies.length === 1 && replies[0].key === 'reply:r1');
  check('replies: why carries the quoted evidence', replies[0].why.includes('"interested"') && replies[0].why.includes('no next touch'));
  check('replies: routes to the world', replies[0].action.route === '/garvis/webs/w1');

  // G5: a website lead is inbound demand — one move per human, evidence quoted, top-ranked.
  const leads = collectLeads([
    { id: 'l1', world_id: 'w1', name: 'Dana', email: 'dana@x.co', message: 'Do you take commissions?', source: 'postcard-qr', created_at: hoursAgo(1) },
    { id: 'l2', world_id: 'w1', name: null, email: 'sam@y.co', message: null, source: 'website', created_at: hoursAgo(3) },
  ]);
  check('leads: one move per lead, keyed by id', leads.length === 2 && leads[0].key === 'lead:l1' && leads[1].key === 'lead:l2');
  check('leads: why quotes the message + attribution', leads[0].why.includes('commissions') && leads[0].why.includes('postcard-qr'));
  check('leads: nameless lead falls back to email, routes to the world', leads[1].title.includes('sam@y.co') && leads[1].action.route === '/garvis/webs/w1');
  check('leads: rank with warm replies at the very top', (() => {
    const ranked = rankMoves([...replies, ...leads], NOW, {});
    return ranked[0].kind === 'lead_waiting' || ranked[0].kind === 'reply_unanswered';
  })());

  // Tier 1: the user's own reminders — due surfaces, future stays quiet, and they outrank inference.
  const reminders = collectReminders([
    { id: 'rm1', title: 'Call the printer', world_id: null, due_at: hoursAgo(1), created_at: hoursAgo(48) },
    { id: 'rm2', title: 'Future thing', world_id: 'w1', due_at: new Date(NOW.getTime() + 48 * 3_600_000).toISOString(), created_at: hoursAgo(1) },
    { id: 'rm3', title: 'Standing note', world_id: null, due_at: null, created_at: hoursAgo(2) },
  ], NOW);
  check('reminders: due + no-due surface, future stays quiet', reminders.length === 2 && reminders.some((r) => r.key === 'reminder:rm1') && reminders.some((r) => r.key === 'reminder:rm3') && !reminders.some((r) => r.key === 'reminder:rm2'));
  check('reminders: the user\'s words outrank Garvis inference (top of the cockpit)', (() => {
    const ranked = rankMoves([...leads, ...reminders], NOW, {});
    return ranked[0].kind === 'reminder_due';
  })());
  check('reminders: expected outcome is labeled measured (it IS the user\'s own datum)', reminders[0].expected?.basis === 'measured');

  const approvals = collectApprovals([
    { id: 'a1', kind: 'send_email', title: 'Touch 1', created_at: hoursAgo(5) },
    { id: 'a2', kind: 'send_email', title: 'Print run', created_at: hoursAgo(1) },
  ]);
  check('approvals: one move for the whole queue', approvals.length === 1 && approvals[0].title.startsWith('2 actions'));
  check('approvals: bornAt is the OLDEST pending', approvals[0].bornAt === hoursAgo(5));
  check('approvals: empty queue → no move', collectApprovals([]).length === 0);

  const insights = collectInsights([
    { id: 'i1', title: 'Neuroscience doc connects to Stoke onboarding', body: 'High overlap with habit-loop research.', score: 0.72, created_at: hoursAgo(3) },
    { id: 'i2', title: 'weak', body: 'meh', score: 0.31, created_at: hoursAgo(3) },
  ]);
  check('insights: below-threshold connections do not earn a slot', insights.length === 1 && insights[0].key === 'insight:i1');
  check('insights: why shows the measured similarity', insights[0].why.includes('72%') && insights[0].why.includes('measured'));

  const floor = collectFloor([{ worldId: 'w1', worldTitle: 'Mom Real Estate', audienceEmpty: true, brandEmpty: true, launchActive: true, asOf: hoursAgo(0) }]);
  check('floor: empty audience blocking a live channel surfaces', floor.some((m) => m.key === 'floor:audience:w1'));
  check('floor: empty brand vault surfaces', floor.some((m) => m.key === 'floor:brand:w1'));
  check('floor: audience-empty without live launch stays quiet', collectFloor([{ worldId: 'w2', worldTitle: 'X', audienceEmpty: true, brandEmpty: false, launchActive: false, asOf: hoursAgo(0) }]).length === 0);

  const nat = collectNaturalNext([
    { missionId: 'm1', worldId: 'w1', subject: 'Lakefront Seller', artifactCount: 12, sendsQueued: 0, updated_at: hoursAgo(6) },
    { missionId: 'm2', worldId: 'w1', subject: 'Other', artifactCount: 12, sendsQueued: 2, updated_at: hoursAgo(6) },
  ]);
  check('natural-next: fires only when nothing is queued', nat.length === 1 && nat[0].key === 'natural:m1');

  const staged = collectStagedFollowups([{ campaign_id: 'c1', world_id: 'w1', to_address: 'jane@lake.example', steps: 2, oldest_created_at: hoursAgo(30) }]);
  check('staged: why counts the drafts', staged[0].why.includes('2 curated follow-ups'));
}

// 2. Ranking — deterministic, reply beats approval beats the rest; urgency grows with age.
{
  const mk = (kind: NextMove['kind'], key: string, ageH: number): NextMove => ({
    key, kind, title: key, why: 'w', action: { label: 'l', route: '/' }, score: 0, bornAt: hoursAgo(ageH),
  });
  const ranked = rankMoves([
    mk('insight_connection', 'i', 2), mk('approval_waiting', 'a', 2), mk('reply_unanswered', 'r', 2), mk('blocking_empty', 'f', 2),
  ], NOW);
  check('reply > approval > floor > insight', ranked.map((m) => m.key).join(',') === 'r,a,f,i', ranked.map((m) => m.key).join(','));
  check('same move, older → higher score', scoreMove(mk('approval_waiting', 'x', 48), NOW, {}) > scoreMove(mk('approval_waiting', 'x', 1), NOW, {}));
  check('urgency caps at 72h (72h and 200h score identically)', scoreMove(mk('approval_waiting', 'x', 72), NOW, {}) === scoreMove(mk('approval_waiting', 'x', 200), NOW, {}));
  check('stale (>14d) moves decay out entirely', rankMoves([mk('reply_unanswered', 'old', 15 * 24)], NOW).length === 0);
  check('duplicate keys dedupe', rankMoves([mk('approval_waiting', 'dup', 1), mk('approval_waiting', 'dup', 1)], NOW).length === 1);
}

// 3. Dismissals — silence for 7 days, then earn the slot back.
{
  const m: NextMove = { key: 'reply:r1', kind: 'reply_unanswered', title: 't', why: 'w', action: { label: 'l', route: '/' }, score: 0, bornAt: hoursAgo(2) };
  const freshDismiss: Dismissals = { 'reply:r1': hoursAgo(24) };
  const oldDismiss: Dismissals = { 'reply:r1': hoursAgo(8 * 24) };
  check('a fresh dismissal silences the move', rankMoves([m], NOW, freshDismiss).length === 0);
  check('a dismissal expires after 7 days', rankMoves([m], NOW, oldDismiss).length === 1);
}

// 4. Greeting + away lines.
{
  check('greeting knows the hours', greetingFor(3, 'R').startsWith('Working late') && greetingFor(9, 'R').startsWith('Good morning')
    && greetingFor(14, 'R').startsWith('Good afternoon') && greetingFor(21, 'R').startsWith('Good evening'));

  const lines = awayLines([
    { event_type: 'email_sent', subject: 'Sent "Touch 1" to jane@lake.example', occurred_at: hoursAgo(1) },
    { event_type: 'agent_run_failed', subject: 'Marketing run hit a rate limit', occurred_at: hoursAgo(2) },
    { event_type: 'email_sent', subject: 'Sent "Touch 1" to jane@lake.example', occurred_at: hoursAgo(3) }, // dup subject
    { event_type: 'weird_future_type', subject: 'Something new happened', occurred_at: hoursAgo(4) },
    { event_type: 'note', subject: 'ancient', occurred_at: hoursAgo(100) },
  ], hoursAgo(50));
  check('away: newest first, deduped by subject', lines[0].text.includes('Touch 1') && lines.filter((l) => l.text.includes('Touch 1')).length === 1);
  check('away: since-filter drops old events', !lines.some((l) => l.text === 'ancient'));
  check('away: failures are framed as needing a look', lines.some((l) => l.text.startsWith('Needs a look:')));
  check('away: unknown event types pass through (the record wins)', lines.some((l) => l.text === 'Something new happened'));
  check('away: caps at 4', awayLines(Array.from({ length: 10 }, (_, i) => ({ event_type: 'note', subject: `s${i}`, occurred_at: hoursAgo(i + 1) })), null).length === 4);
  check('cold-sky line exists for first run', COLD_SKY_LINE.includes('Say anything'));
}

// 5. Round-5: the reasoning layer is honestly labeled; narrative weaving joins only real rows.
{
  const reply = collectReplies([{ id: 'r1', from_address: 'b@x.co', subject: 'yes', classification: 'positive', received_at: hoursAgo(1), world_id: null, has_next_touch: false }])[0];
  check('reply expected-outcome is labeled heuristic (not our data yet)', reply.expected?.basis === 'heuristic');
  const floor = collectFloor([{ worldId: 'w', worldTitle: 'W', audienceEmpty: true, brandEmpty: false, launchActive: true, asOf: hoursAgo(0) }])[0];
  check('structural expectations are labeled structural', floor.expected?.basis === 'structural');

  const woven = awayLines([
    { event_type: 'email_sent', subject: 'Sent "Touch 1" to jane@lake.example', occurred_at: hoursAgo(9), payload: { campaign_id: 'c1' } },
    { event_type: 'reply_received', subject: 'positive reply from jane@lake.example', occurred_at: hoursAgo(2), payload: { campaign_id: 'c1' } },
    { event_type: 'email_sent', subject: 'Sent "Touch 1" to bob@pier.example', occurred_at: hoursAgo(8), payload: { campaign_id: 'c2' } },
  ], null);
  check('weave: send+reply on the SAME campaign merge into one causal observation',
    woven.some((l) => l.text.startsWith('That send worked —')) && !woven.some((l) => l.text.includes('jane@lake.example') && l.text.startsWith('Sent')));
  check('weave: an unanswered send stays a plain send line', woven.some((l) => l.text === 'Sent "Touch 1" to bob@pier.example'));
  const unwoven = awayLines([
    { event_type: 'email_sent', subject: 'Sent "A" to a@x.co', occurred_at: hoursAgo(3), payload: { campaign_id: 'c1' } },
    { event_type: 'reply_received', subject: 'reply from someone else', occurred_at: hoursAgo(2), payload: { campaign_id: 'OTHER' } },
  ], null);
  check('weave: different campaigns never get connected (narrative is a join, not a guess)',
    !unwoven.some((l) => l.text.startsWith('That send worked —')));
}

// 6. Sprint M: world intelligence feeds the morning (Rule 6 made literal).
{
  const rows = collectWorldIntel([
    { worldId: 'w1', worldTitle: 'Mom Real Estate', reflectionDueNow: true, events7d: 9, intelAgeDays: 21, topOpenQuestion: 'Lakefront or move-up sellers?', asOf: hoursAgo(0) },
    { worldId: 'w2', worldTitle: 'Quiet World', reflectionDueNow: false, events7d: 1, intelAgeDays: 3, topOpenQuestion: null, asOf: hoursAgo(0) },
  ]);
  check('reflection-due surfaces with the counted event evidence + open question', (() => {
    const r = rows.find((m) => m.key === 'reflect:w1');
    return !!r && r.why.includes('9 recorded events') && r.why.includes('Lakefront or move-up');
  })());
  check('stale intel surfaces with its age as evidence', (() => {
    const r = rows.find((m) => m.key === 'intel:w1');
    return !!r && r.title.includes('21 days old');
  })());
  check('a quiet, fresh world produces no intelligence moves', !rows.some((m) => m.key.endsWith('w2')));
  const mk2 = (kind: NextMove['kind'], key: string): NextMove => ({ key, kind, title: key, why: 'w', action: { label: 'l', route: '/' }, score: 0, bornAt: hoursAgo(2) });
  const order = rankMoves([mk2('reflection_due', 'ref'), mk2('reply_unanswered', 'rep'), mk2('intel_stale', 'int'), mk2('insight_connection', 'ins')], NOW);
  check('ranking: reply > reflection > insight > stale-intel', order.map((m) => m.key).join(',') === 'rep,ref,ins,int', order.map((m) => m.key).join(','));
}

// 7. Genesis drafts — a designed world waits loudly, outranked only by humans and approvals.
{
  const drafts = collectDrafts([{ id: 'd1', title: 'Artist Brother Art Business', areas: 9, created_at: hoursAgo(3) }]);
  check('a draft becomes a move with counted evidence in the why', drafts.length === 1 && drafts[0].why.includes('9 production areas'));
  check('the draft move states the boundary: nothing exists until approved', drafts[0].why.includes('Nothing exists until you approve'));
  check('draft expectation is labeled structural, never a prediction', drafts[0].expected?.basis === 'structural');
  const ranked = rankMoves([
    ...collectDrafts([{ id: 'd1', title: 'X', areas: 5, created_at: hoursAgo(1) }]),
    ...collectApprovals([{ id: 'a1', kind: 'send_email', title: 'send', created_at: hoursAgo(1) }]),
    ...collectNaturalNext([{ missionId: 'm1', worldId: 'w1', subject: 's', artifactCount: 3, sendsQueued: 0, updated_at: hoursAgo(1) }]),
  ], NOW, {});
  check('ranking: approval > draft > natural next', ranked.map((m) => m.kind).join(',') === 'approval_waiting,draft_waiting,natural_next', ranked.map((m) => m.kind).join(','));
}

// 8. Warm trails — the rabbit hole nudges honestly: one at most, real dives only, right window.
{
  const trail = (worldId: string, clusterCount: number, ageH: number) =>
    ({ worldId, title: `World ${worldId}`, clusterCount, updatedAt: hoursAgo(ageH) });
  check('trail: a fresh dive (<20h) stays quiet — mid-dive nudges are noise', collectTrails([trail('w1', 8, 3)], NOW).length === 0);
  check('trail: a spark that never grew (<3 ideas) stays quiet', collectTrails([trail('w1', 2, 48)], NOW).length === 0);
  check('trail: a cold trail (>7d) stays quiet', collectTrails([trail('w1', 8, 8 * 24)], NOW).length === 0);
  const warm = collectTrails([trail('w1', 9, 48)], NOW);
  check('trail: a warm real dive surfaces with counted evidence', warm.length === 1 && warm[0].why.includes('9 ideas') && warm[0].why.includes('2 days ago'));
  check('trail: deep-links into the specific world', warm[0].action.route === '/garvis/explore?world=w1');
  check('trail: at most ONE — the most recent wins', (() => {
    const out = collectTrails([trail('older', 12, 96), trail('newer', 5, 30)], NOW);
    return out.length === 1 && out[0].key === 'trail:newer';
  })());
  check('trail: yesterday reads as yesterday', collectTrails([trail('w1', 4, 22)], NOW)[0].why.includes('yesterday'));
  // same bornAt across kinds so the check compares BASE VALUES, not urgency accrual
  const mk3 = (kind: NextMove['kind'], key: string): NextMove => ({ key, kind, title: key, why: 'w', action: { label: 'l', route: '/' }, score: 0, bornAt: hoursAgo(48) });
  const order = rankMoves([...collectTrails([trail('w1', 9, 48)], NOW), mk3('reply_unanswered', 'rep'), mk3('insight_connection', 'ins'), mk3('intel_stale', 'int')], NOW);
  check('ranking: reply > insight > trail > stale-intel', order.map((m) => m.kind).join(',') === 'reply_unanswered,insight_connection,trail_open,intel_stale', order.map((m) => m.kind).join(','));
}

console.log(`\nnextMove.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} nextMove check(s) failed`);
