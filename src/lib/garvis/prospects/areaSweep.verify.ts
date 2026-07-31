// src/lib/garvis/prospects/areaSweep.verify.ts — the county machine's pure half (npm run verify:areasweep).
// The runner is impure (network + DB) and is not tested here; what IS provable without I/O is the
// planning arithmetic the study's honesty rests on: which queries get asked, how the frame sentence
// describes exactly those queries, and that degenerate input plans nothing.

import { TRADE_SYNONYMS, synonymsFor, areaSweepPlan, frameSentence, frameNounFor, parseTownList } from './areaSweep';

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


// ── coverage: the table must span the revenue model, not just the obvious trades ──
check('30+ trades catalogued', Object.keys(TRADE_SYNONYMS).length >= 30);
check('every high-ticket home-service trade present',
  ['roofers', 'hvac', 'restoration', 'remodelers', 'contractors', 'pools', 'foundation', 'solar'].every((k) => k in TRADE_SYNONYMS));
check('appointment-driven health/professional trades present',
  ['dentists', 'chiropractors', 'veterinarians', 'medspas', 'lawyers', 'accountants'].every((k) => k in TRADE_SYNONYMS));
check('no synonym appears under two trades (a business must land in one frame)',
  (() => { const all = Object.values(TRADE_SYNONYMS).flat(); return new Set(all).size === all.length; })());
check('no trade key collides with another trade\'s synonym (lookup must be unambiguous)',
  Object.keys(TRADE_SYNONYMS).every((k) =>
    Object.entries(TRADE_SYNONYMS).every(([k2, v2]) => k === k2 || !v2.some((s) => s.replace(/\s+/g, '') === k))));


// ── parseTownList: the placeholder's own example must not become a study ──
// The UI teaches "Lake Geneva, WI"; a naive comma-split turns that into a two-town study where one
// town is the state of Wisconsin. Caught by driving the UI exactly as the placeholder suggests.
check('"Lake Geneva, WI" is ONE town, not a study', parseTownList('Lake Geneva, WI').join('|') === 'Lake Geneva, WI');
check('a bare state code never survives as a town', !parseTownList('Lake Geneva, WI, Delavan, WI').some((t) => /^WI$/i.test(t)));
check('"Town, ST, Town, ST" is two towns', parseTownList('Lake Geneva, WI, Delavan, WI').length === 2);
check('one explicit state extends to stateless towns (Delavan alone is also in Illinois)',
  parseTownList('Lake Geneva, Delavan, Elkhorn WI').join('|') === 'Lake Geneva, WI|Delavan, WI|Elkhorn WI');
check('no state anywhere ⇒ towns pass through untouched', parseTownList('Fontana, Sharon, Genoa City').join('|') === 'Fontana|Sharon|Genoa City');
check('disagreeing states are never papered over by inference',
  parseTownList('Beloit WI, Rockton IL, Sharon').includes('Sharon'));
check('lowercase state codes are recognised', parseTownList('lake geneva, wi').length === 1);
check('a leading orphan state code is dropped', parseTownList('WI, Delavan, Elkhorn').every((t) => !/^WI$/i.test(t)));
check('dedupe is case-insensitive', parseTownList('Delavan, delavan, DELAVAN').length === 1);
check('empty input parses to nothing', parseTownList('   ').length === 0);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} area-sweep check(s) failed`);
