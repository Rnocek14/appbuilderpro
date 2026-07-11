// src/lib/garvis/worldIntel.verify.ts
// Standalone verification of World Intelligence (run: `npm run verify:worldintel`).
// Guards Sprint M's honesty contracts: momentum as derived-label-with-evidence (never a stored
// opinion), the deterministic living-state compile, the reflection EVIDENCE GATE (items without
// evidence are dropped, never repaired), cadence gating on real activity, heartbeat compilation.

import {
  momentumFrom, compileLivingState, parseReflection, reflectionDue, heartbeat, buildReflectionContext,
  REFLECT_SYSTEM, type LivingStateInput,
} from './worldIntel';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const NOW = new Date('2026-07-08T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

// 1. Momentum: label derived from counts, evidence attached.
{
  check('replies → surging, with counted evidence', (() => {
    const m = momentumFrom({ events7d: 4, artifacts7d: 1, sends7d: 1, replies7d: 2 });
    return m.label === 'surging' && m.evidence.includes('2 replies');
  })());
  check('moderate activity → steady', momentumFrom({ events7d: 6, artifacts7d: 0, sends7d: 0, replies7d: 0 }).label === 'steady');
  check('a trickle → slowing', momentumFrom({ events7d: 1, artifacts7d: 0, sends7d: 0, replies7d: 0 }).label === 'slowing');
  check('nothing → dormant, honestly worded', (() => {
    const m = momentumFrom({ events7d: 0, artifacts7d: 0, sends7d: 0, replies7d: 0 });
    return m.label === 'dormant' && m.evidence === 'no activity this week';
  })());
  // G5: inbound demand is the strongest signal, and its evidence leads.
  check('a lead → surging, lead-first evidence', (() => {
    const m = momentumFrom({ events7d: 0, artifacts7d: 0, sends7d: 0, replies7d: 0, leads7d: 1, visits7d: 3 });
    return m.label === 'surging' && m.evidence.startsWith('1 lead');
  })());
  check('site visits alone → steady/slowing (never surging without a human signal)', (() => {
    const a = momentumFrom({ events7d: 0, artifacts7d: 0, sends7d: 0, replies7d: 0, visits7d: 12 });
    const b = momentumFrom({ events7d: 0, artifacts7d: 0, sends7d: 0, replies7d: 0, visits7d: 2 });
    return a.label === 'steady' && a.evidence.includes('12 site visits') && b.label === 'slowing';
  })());
  check('un-instrumented worlds (no leads/visits fields) behave exactly as before', (() => {
    const m = momentumFrom({ events7d: 6, artifacts7d: 0, sends7d: 0, replies7d: 0 });
    return m.label === 'steady' && !m.evidence.includes('lead') && !m.evidence.includes('visit');
  })());
}

// 2. Living State: deterministic, every blocker/risk carries evidence by construction.
{
  const input: LivingStateInput = {
    objective: '20 new listings by spring', activePlayTitle: 'Lakefront Seller Campaign',
    audienceEmpty: true, brandEmpty: false, pendingApprovals: 2, oldestPendingHours: 26,
    intelAgeDays: 21, signals: { events7d: 8, artifacts7d: 2, sends7d: 0, replies7d: 0 }, openQuestions: ['Lakefront or move-up sellers?', ''],
  };
  const s = compileLivingState(input);
  check('blockers include the empty list with counted evidence', s.blockers.some((b) => b.text.includes('Mailing list') && b.evidence.includes('0 contacts')));
  check('approval blocker cites the oldest wait', s.blockers.some((b) => b.evidence.includes('26h')));
  check('stale intel is a risk with its age as evidence', s.risks.some((r) => r.evidence.includes('21 days')));
  check('every blocker and risk carries evidence', [...s.blockers, ...s.risks].every((x) => x.evidence.length > 0));
  check('open questions trimmed of blanks', s.openQuestions.length === 1);
  check('no intel at all is itself a named risk', compileLivingState({ ...input, intelAgeDays: null }).risks.some((r) => r.text.includes('No market intel')));
}

// 3. Reflection: the evidence gate.
{
  const r = parseReflection(JSON.stringify({
    tried: [
      { text: 'Postcard variant A to lakefront list', evidence: '41 sent on 07-01' },
      { text: 'A thing I made up', evidence: '' },                       // ← must be dropped
    ],
    learned: [{ text: 'Statement copy beats question copy', evidence: '5 replies vs 0 across A/B sends' }],
    implications: [
      { observation: 'Replies came from lakefront owners only', implication: 'Narrow the list to frontage parcels', evidence: 'all 5 replies matched lakefront addresses' },
      { observation: 'ghost', implication: 'ghost', evidence: '' },      // ← must be dropped
    ],
    recommendation: 'Double down on the quiet-listing angle for lakefront owners.',
    openQuestions: ['Do move-up sellers deserve their own angle?'],
  }));
  check('evidence gate: tried item without evidence is DROPPED', r.tried.length === 1 && r.tried[0].text.includes('Postcard'));
  check('evidence gate: implication without evidence is DROPPED', r.implications.length === 1);
  check('learned items survive with evidence intact', r.learned[0].evidence.includes('5 replies vs 0'));
  check('recommendation and questions parse', r.recommendation!.includes('quiet-listing') && r.openQuestions.length === 1);
  check('garbage → empty reflection, never a throw', parseReflection('the model wrote prose').tried.length === 0);
  check('fenced JSON still parses', parseReflection('```json\n{"tried":[],"learned":[],"implications":[],"recommendation":"x","openQuestions":[]}\n```').recommendation === 'x');
  check('system prompt states the evidence rule and bans invention', REFLECT_SYSTEM.includes('DELETED') && REFLECT_SYSTEM.includes('Never invent numbers'));
}

// 4. Cadence: no activity → no ritual.
{
  check('due when never reflected AND enough activity', reflectionDue(null, 8, NOW) === true);
  check('not due with thin activity even if never reflected', reflectionDue(null, 2, NOW) === false);
  check('not due again within 7 days', reflectionDue(daysAgo(3), 20, NOW) === false);
  check('due again after 7 days with activity', reflectionDue(daysAgo(9), 8, NOW) === true);
}

// 5. Heartbeat + context pack.
{
  const s = compileLivingState({
    objective: 'Win lakefront listings', activePlayTitle: 'Seller play', audienceEmpty: false, brandEmpty: false,
    pendingApprovals: 0, oldestPendingHours: null, intelAgeDays: 3,
    signals: { events7d: 12, artifacts7d: 4, sends7d: 2, replies7d: 1 }, openQuestions: [],
  });
  const hb = heartbeat(s, { changedLine: 'That send worked — Jane replied', recommendation: 'Answer Jane today' });
  check('heartbeat answers all six questions', [hb.accomplishing, hb.doing, hb.blocking, hb.changed, hb.matters, hb.next].every((x) => x.length > 0));
  check('heartbeat doing-line carries the momentum evidence', hb.doing.includes('surging') && hb.doing.includes('this week'));

  const ctx = buildReflectionContext({
    worldTitle: 'Mom Real Estate', objective: 'Win listings',
    events: Array.from({ length: 40 }, (_, i) => ({ subject: `event ${i}`, occurred_at: daysAgo(i) })),
    artifacts: [{ title: 'Postcard A', kind: 'post' }],
    results: { sent: 41, replies: 5, approvals: 3 },
    state: s,
  }, 2000);
  check('reflection context respects its byte budget', ctx.length <= 2000);
  check('reflection context leads with the world + counted results', ctx.startsWith('WORLD:') && ctx.includes('sent 41, replies 5'));
}

console.log(`\nworldIntel.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} worldIntel check(s) failed`);
