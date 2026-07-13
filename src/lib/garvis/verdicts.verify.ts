// src/lib/garvis/verdicts.verify.ts
// Run: npx tsx src/lib/garvis/verdicts.verify.ts
// Verifies the kept-vs-rewritten contract: no fake 0% on zero data, no percentage theater on tiny
// samples, real rates only with real signal — the same discipline the rest of the ledger runs on.

import { rewriteRate, verdictLine } from './verdicts';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('verdicts.verify');

check('zero verdicts → null rate, never a fake 0%', rewriteRate({ kept: 0, rewritten: 0 }) === null);
check('real rate computed', rewriteRate({ kept: 3, rewritten: 1 }) === 0.25);
check('all rewritten → 1', rewriteRate({ kept: 0, rewritten: 4 }) === 1);

const empty = verdictLine('assist', { kept: 0, rewritten: 0 });
check('zero verdicts → an invitation, not a statistic', /no verdicts yet/i.test(empty) && !empty.includes('%'));

const tiny = verdictLine('assist', { kept: 2, rewritten: 1 });
check('a tiny sample shows counts but NO percentage (no precision theater)', tiny.includes('2 replies kept') && !tiny.includes('%'));
check('tiny sample names when the rate appears', /rate shown from 5/i.test(tiny));

const real = verdictLine('assist', { kept: 6, rewritten: 2 });
check('enough signal → the real rate with its basis', real.includes('25% rewrite rate') && real.includes('8 verdicts'));

const doc = verdictLine('deliver', { kept: 1, rewritten: 0 });
check('deliver kind speaks in documents, singular handled', doc.includes('1 document kept'));

console.log(`\nverdicts.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} verdicts check(s) failed`);
