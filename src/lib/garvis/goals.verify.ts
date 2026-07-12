// src/lib/garvis/goals.verify.ts — run: npx tsx src/lib/garvis/goals.verify.ts
// Verifies the goals core's honesty contract: no percentage without a real numerator AND
// denominator; measured basis only from real facts; the focus boost is deterministic, names the
// goal, and touches only goal-world moves.

import { goalProgress, applyGoalFocus, goalContextLine, worldIdFromRoute, type WorldGoal } from './goals';
import type { NextMove } from './nextMove';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';

const goal = (over: Partial<WorldGoal> = {}): WorldGoal => ({
  id: 'g1', world_id: W1, title: '10 seller leads a month', why: '', metric_kind: 'leads',
  target_value: 10, current_manual: null, target_date: null, status: 'active',
  created_at: '2026-07-01T00:00:00Z', ...over,
});

// ---- goalProgress: honesty states ----
{
  const p = goalProgress(goal(), { leads: 4, visits: null });
  check('measured leads: measurable, basis measured', p.measurable && p.basis === 'measured' && p.current === 4);
  check('measured leads: pct = 40', p.pct === 40);

  const p2 = goalProgress(goal(), { leads: null, visits: null });
  check('uninstrumented: NOT measurable, no pct, honest note', !p2.measurable && p2.pct === null && /not instrumented/i.test(p2.note));

  const p3 = goalProgress(goal({ metric_kind: 'none', target_value: null }), { leads: 99, visits: 99 });
  check('metric none: directional, no meter even with facts present', !p3.measurable && p3.pct === null && p3.basis === 'none');

  const p4 = goalProgress(goal({ metric_kind: 'manual', current_manual: 3, target_value: 12 }), { leads: null, visits: null });
  check('manual: measurable, basis manual (labeled the owner\'s own count)', p4.measurable && p4.basis === 'manual' && p4.pct === 25 && /your own/i.test(p4.note));

  const p5 = goalProgress(goal({ metric_kind: 'manual', current_manual: null }), { leads: null, visits: null });
  check('manual without a logged number: not measurable', !p5.measurable && p5.pct === null);

  const p6 = goalProgress(goal({ target_value: null }), { leads: 7, visits: null });
  check('no target: current shown, pct stays null (no invented denominator)', p6.measurable && p6.current === 7 && p6.pct === null);

  const p7 = goalProgress(goal({ target_value: 5 }), { leads: 50, visits: null });
  check('overshoot caps at 100', p7.pct === 100);

  const p8 = goalProgress(goal({ metric_kind: 'visits', target_value: 100 }), { leads: null, visits: 30 });
  check('visits metric reads the visits fact', p8.current === 30 && p8.pct === 30);
}

// ---- worldIdFromRoute ----
{
  check('extracts world id from webs route', worldIdFromRoute(`/garvis/webs/${W1}`) === W1);
  check('extracts world id from system route', worldIdFromRoute(`/garvis/system/${W2}`) === W2);
  check('non-world route → null', worldIdFromRoute('/garvis/command') === null);
}

// ---- applyGoalFocus: deterministic, named, scoped ----
{
  const now = new Date('2026-07-11T12:00:00Z');
  const mv = (key: string, route: string, score: number): NextMove => ({
    key, kind: 'natural_next', title: key, why: 'Base why.', action: { label: 'Go', route },
    score, bornAt: '2026-07-10T00:00:00Z',
  });
  // Pre-ranked, as rankMoves hands them over (highest first) — applyGoalFocus preserves that
  // ranking when it changes nothing and re-derives it when it boosts.
  const moves = [
    mv('c', '/garvis/command', 70),      // no world
    mv('b', `/garvis/webs/${W2}`, 62),   // other world — outranks a before focus
    mv('a', `/garvis/webs/${W1}`, 60),   // goal world
  ];
  const out = applyGoalFocus(moves, [goal()], now);
  const a = out.find((m) => m.key === 'a')!, b = out.find((m) => m.key === 'b')!, c = out.find((m) => m.key === 'c')!;
  check('goal-world move gains the focus boost (+15)', a.score === 75);
  check('other-world and worldless moves untouched', b.score === 62 && c.score === 70);
  check('goal is NAMED in the why', /Advances your goal “10 seller leads a month”/.test(a.why));
  check('order re-derived: goal move now first', out[0].key === 'a');

  const soon = applyGoalFocus(moves, [goal({ target_date: '2026-07-20' })], now);
  check('deadline within 14 days adds +10 and the date', soon.find((m) => m.key === 'a')!.score === 85 && /due 2026-07-20/.test(soon.find((m) => m.key === 'a')!.why));

  const far = applyGoalFocus(moves, [goal({ target_date: '2026-12-01' })], now);
  check('distant deadline: focus only, no deadline bump', far.find((m) => m.key === 'a')!.score === 75);

  const past = applyGoalFocus(moves, [goal({ target_date: '2026-07-01' })], now);
  check('past deadline: no deadline bump (never fake urgency)', past.find((m) => m.key === 'a')!.score === 75);

  const paused = applyGoalFocus(moves, [goal({ status: 'paused' })], now);
  check('paused/achieved goals do not steer', paused.find((m) => m.key === 'a')!.score === 60 && paused[0].key === 'c');

  const twice = applyGoalFocus(moves, [goal()], now);
  check('deterministic: same inputs → same output', JSON.stringify(twice) === JSON.stringify(out));
}

// ---- goalContextLine ----
{
  const line = goalContextLine(goal(), { measurable: true, current: 4, target: 10, pct: 40, basis: 'measured', note: '' });
  check('context line labels owner-stated + measured progress', /owner-stated/.test(line) && /4 of 10 \(measured\)/.test(line));
  check('context line aims the work at the goal', /Aim every recommendation/.test(line));
  check('no goal → empty string (callers skip injection)', goalContextLine(null) === '');
  check('paused goal → empty string', goalContextLine(goal({ status: 'paused' })) === '');
  const noProg = goalContextLine(goal());
  check('no progress passed → no progress claimed', !/Progress:/.test(noProg));
}

if (failures) { throw new Error(`${failures} goals verify check(s) FAILED`); }
console.log('\nAll goals checks passed.');
