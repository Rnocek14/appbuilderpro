// src/lib/garvis/timelines.verify.ts — proof the timeline core keeps its promises.
// Run: npx tsx src/lib/garvis/timelines.verify.ts

import {
  TIMELINE_TEMPLATES, addDays, instantiateTimeline, isOverdue, overdueCount, nextStep, timelineLine,
} from './timelines';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// --- templates carry their honesty note --------------------------------------
check('both kinds exist with steps', TIMELINE_TEMPLATES.listing.steps.length >= 5 && TIMELINE_TEMPLATES.purchase.steps.length >= 7);
check('templates say the offsets are conventions, not law',
  TIMELINE_TEMPLATES.purchase.note.includes('YOUR contract') && TIMELINE_TEMPLATES.listing.note.includes('adjust'));
check('purchase covers the load-bearing milestones', ['Earnest money', 'Inspection', 'Financing', 'walkthrough', 'Closing']
  .every((k) => TIMELINE_TEMPLATES.purchase.steps.some((s) => s.title.toLowerCase().includes(k.toLowerCase()))));

// --- date math ------------------------------------------------------------------
check('addDays forward', addDays('2026-07-13', 3) === '2026-07-16');
check('addDays negative (before the anchor)', addDays('2026-07-13', -7) === '2026-07-06');
check('addDays across a month boundary', addDays('2026-07-30', 5) === '2026-08-04');

// --- instantiate -------------------------------------------------------------------
const plan = instantiateTimeline('purchase', '2026-07-01');
check('every step gets a due date from the anchor', plan.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.dueDate)));
check('earnest money lands at anchor+3', plan.find((s) => s.title.includes('Earnest'))?.dueDate === '2026-07-04');
check('closing lands at anchor+45', plan.find((s) => s.title === 'Closing')?.dueDate === '2026-08-15');
check('steps come out due-date ordered with positions', plan.every((s, i) => s.position === i)
  && plan.every((s, i) => i === 0 || plan[i - 1].dueDate <= s.dueDate));
const listing = instantiateTimeline('listing', '2026-07-13');
check('negative offsets sort BEFORE the anchor step', listing[0].title.includes('Photos') && listing[0].dueDate === '2026-07-06');
check('deterministic', JSON.stringify(instantiateTimeline('purchase', '2026-07-01')) === JSON.stringify(plan));

// --- overdue honesty ------------------------------------------------------------------
const TODAY = '2026-07-13';
check('due yesterday + not done = overdue', isOverdue({ title: 'x', dueDate: '2026-07-12', done: false }, TODAY));
check('due today is NOT overdue yet', !isOverdue({ title: 'x', dueDate: '2026-07-13', done: false }, TODAY));
check('done is never overdue', !isOverdue({ title: 'x', dueDate: '2020-01-01', done: true }, TODAY));
check('undated is never overdue', !isOverdue({ title: 'x', dueDate: null, done: false }, TODAY));

// --- next step + line -----------------------------------------------------------------
const steps = [
  { title: 'a', dueDate: '2026-07-10', done: true },
  { title: 'b', dueDate: '2026-07-11', done: false },
  { title: 'c', dueDate: '2026-07-20', done: false },
  { title: 'd', dueDate: null, done: false },
];
check('next step = earliest open by date', nextStep(steps)?.title === 'b');
check('overdue counted exactly', overdueCount(steps, TODAY) === 1);
check('line carries counts + OVERDUE + next', (() => {
  const l = timelineLine(steps, TODAY);
  return l.includes('1/4 done') && l.includes('1 OVERDUE') && l.includes('next: b');
})());
check('all-done line says done', timelineLine(steps.map((s) => ({ ...s, done: true })), TODAY) === 'all 4 steps done');
check('empty line honest', timelineLine([], TODAY) === 'no steps');

console.log(`\ntimelines.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
