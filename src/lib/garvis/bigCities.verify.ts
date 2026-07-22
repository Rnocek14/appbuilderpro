// Run: npx tsx src/lib/garvis/bigCities.verify.ts
import { BIG_METROS, bigMetroCities } from './bigCities';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('bigCities.verify');

check('a broad grid (150+ metros) for "everything"', BIG_METROS.length >= 150);
check('every row is [city, state] with a 2-letter state', BIG_METROS.every(([c, s]) => typeof c === 'string' && c.length > 0 && /^[A-Z]{2}$/.test(s)));
check('no duplicate city|state', new Set(BIG_METROS.map(([c, s]) => `${c}|${s}`.toLowerCase())).size === BIG_METROS.length);
check('covers many states (nationwide, not one region)', new Set(BIG_METROS.map(([, s]) => s)).size >= 25);
check('bigMetroCities() maps to {city, state} objects', (() => { const o = bigMetroCities(); return o.length === BIG_METROS.length && !!o[0].city && !!o[0].state; })());

console.log(`\nbigCities.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} bigCities check(s) failed`);
