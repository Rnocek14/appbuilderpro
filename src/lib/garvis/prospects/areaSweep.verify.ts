// src/lib/garvis/prospects/areaSweep.verify.ts — the county machine's pure half (npm run verify:areasweep).
// The runner is impure (network + DB) and is not tested here; what IS provable without I/O is the
// planning arithmetic the study's honesty rests on: which queries get asked, how the frame sentence
// describes exactly those queries, and that degenerate input plans nothing.

import { TRADE_SYNONYMS, synonymsFor, areaSweepPlan, frameSentence, frameNounFor } from './areaSweep';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── synonyms ──────────────────────────────────────────────────────────────
check('a known trade fans out', synonymsFor('plumbers').length >= 2);
check('the canonical noun leads its own set', synonymsFor('plumbers')[0] === 'plumbers');
check('a synonym resolves to its trade set (spacing/case forgiven)', synonymsFor('Plumbing Company').join() === synonymsFor('plumbers').join());
check('an unknown trade still sweeps as itself — no guessing', synonymsFor('taxidermists').join() === 'taxidermists');
check('empty niche yields no synonyms', synonymsFor('   ').length === 0);
check('every synonym table entry is non-empty', Object.values(TRADE_SYNONYMS).every((v) => v.length > 0 && v.every((s) => s.trim().length > 0)));

// ── the plan ──────────────────────────────────────────────────────────────
const towns = ['Lake Geneva WI', 'Delavan WI', 'Elkhorn WI'];
const plan = areaSweepPlan('plumbers', towns);
check('plan = towns × synonyms', plan.length === towns.length * synonymsFor('plumbers').length);
check('towns are the outer loop (progress reads geographically)', plan[0].town === plan[1].town);
check('every query carries a real synonym and a real town', plan.every((q) => q.niche.trim() && q.town.trim()));
check('duplicate towns are asked once', areaSweepPlan('plumbers', ['Delavan', 'delavan', ' DELAVAN ']).length === synonymsFor('plumbers').length);
check('whitespace towns are dropped', areaSweepPlan('plumbers', ['  ', 'Delavan']).length === synonymsFor('plumbers').length);
check('no towns ⇒ empty plan (a sweep of nowhere is not a sweep)', areaSweepPlan('plumbers', []).length === 0);
check('no niche ⇒ empty plan', areaSweepPlan('', towns).length === 0);
check('deterministic', JSON.stringify(areaSweepPlan('plumbers', towns)) === JSON.stringify(areaSweepPlan('plumbers', towns)));

// ── the frame sentence: describes exactly what the plan asks ──────────────
const frame = frameSentence('plumbers', towns);
check('frame states the exact query count', frame.includes(`${plan.length} searches`));
check('frame states the town count', /across 3 towns/.test(frame));
check('frame names every synonym verbatim', synonymsFor('plumbers').every((s) => frame.includes(`"${s}"`)));
check('frame states the dedupe rule', /deduplicated/.test(frame));
check('frame makes no claim about results (written before any exist)', !/found|discovered|\d+ businesses/.test(frame));
check('a single town reads singular', /across 1 town,/.test(frameSentence('plumbers', ['Elkhorn'])));

// ── the pitch noun ────────────────────────────────────────────────────────
check('plumbers → plumber', frameNounFor('plumbers') === 'plumber');
check('roofers → roofer', frameNounFor('roofers') === 'roofer');
check('a multiword canonical keeps its form', frameNounFor('restoration') === 'water damage restoration');
check('an unknown trade uses itself', frameNounFor('taxidermists') === 'taxidermist');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} area-sweep check(s) failed`);
