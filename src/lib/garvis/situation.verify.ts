// src/lib/garvis/situation.verify.ts — the situation compiler's contract (npm run verify:situation).

import { compileSituation, SITUATION_BUDGET, type SituationInputs } from './situation';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const EMPTY: SituationInputs = {
  worlds: [], arcs: [], engagements: [], standingOrders: [],
  pendingApprovals: 0, newOpportunities: 0, outstandingInvoicesUsd: 0, clockAlive: null,
};

// Empty state is honest, never blank.
const empty = compileSituation(EMPTY);
check('empty situation names the empty state honestly', empty.includes('No businesses exist yet'));
check('empty situation invents no counts', !/\d+ approval|\$\d/.test(empty));

// Every line derives from inputs.
const full = compileSituation({
  worlds: [{ title: 'Northstar' }, { title: 'Mural Co' }],
  arcs: [
    { title: 'Launch Northstar', status: 'waiting', waiting_reason: 'approve the company draft' },
    { title: 'Old push', status: 'done' },
    { title: 'Hunt setup', status: 'ready' },
  ],
  engagements: [{ client_name: 'Jane Roe', status: 'active', received: 4, total: 9 }],
  standingOrders: [
    { kind: 'opportunity_hunt', label: 'Mural jobs', status: 'active' },
    { kind: 'watch_url', label: 'Paused watch', status: 'paused' },
  ],
  pendingApprovals: 3, newOpportunities: 7, outstandingInvoicesUsd: 1200.5, clockAlive: false,
});
check('businesses listed by exact title', full.includes('"Northstar"') && full.includes('"Mural Co"'));
check('waiting arc carries its reason and a do-not-replan note', full.includes('approve the company draft') && full.includes('do not re-plan'));
check('finished arcs stay out of the situation', !full.includes('Old push'));
check('ready arcs appear (they are about to move)', full.includes('Hunt setup'));
check('client intake progress is stated as received/total', full.includes('Jane Roe') && full.includes('4/9'));
check('paused standing orders are not presented as active', !full.includes('Paused watch'));
check('queue, feed, and money lines carry the real numbers', full.includes('3 approval') && full.includes('7 new opportunity') && full.includes('$1200.50'));
check('a dead clock is a loud warning', full.includes('NOT ticking'));

// Unknown clock state is silence, not a guess.
const unknownClock = compileSituation({ ...EMPTY, worlds: [{ title: 'X' }], clockAlive: null });
check('unknown clock state produces no claim either way', !unknownClock.includes('ticking'));

// Budget: many inputs never exceed the cap, and truncation is announced.
const big = compileSituation({
  ...EMPTY,
  worlds: [{ title: 'W' }],
  arcs: Array.from({ length: 200 }, (_, i) => ({ title: `Arc number ${i} with a fairly long title for padding`, status: 'waiting', waiting_reason: 'x'.repeat(120) })),
});
check(`digest never exceeds SITUATION_BUDGET (${SITUATION_BUDGET})`, big.length <= SITUATION_BUDGET);
check('truncation is announced, not silent', big.includes('truncated'));

// Determinism.
check('same inputs → identical digest', compileSituation(EMPTY) === compileSituation(EMPTY));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} situation check(s) failed`);
