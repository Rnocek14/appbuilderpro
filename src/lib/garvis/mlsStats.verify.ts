// src/lib/garvis/mlsStats.verify.ts — proof the market stats never dress up thin data.
// Run: npx tsx src/lib/garvis/mlsStats.verify.ts

import { median, marketStats, soldLast12ByZip, statsLine, type MlsRow } from './mlsStats';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const NOW = '2026-07-13T12:00:00Z';
const row = (over: Partial<MlsRow>): MlsRow => ({
  listing_key: 'k', status: 'Active', list_price: null, close_price: null,
  address1: '', city: '', zip: '53147', property_type: 'Residential',
  beds: null, baths: null, sqft: null, list_date: null, close_date: null, dom: null, ...over,
});

// --- median ------------------------------------------------------------------
check('median of odd set', median([3, 1, 2]) === 2);
check('median of even set averages', median([1, 2, 3, 4]) === 2.5);
check('median of empty → null, never 0', median([]) === null);

// --- honest thin-data behavior --------------------------------------------------
const thin = marketStats([
  row({ status: 'Closed', close_date: '2026-05-01', close_price: 500000, dom: 30 }),
  row({ status: 'Active' }),
], NOW);
check('one sale → no median close, reason stated', thin.medianClose === null
  && thin.notes.some((n) => n.includes('median close price needs')));
check('counts are still real even when medians refuse', thin.activeCount === 1 && thin.soldLast12 === 1);
check('months of supply refuses on thin sales', thin.monthsOfSupply === null);

// --- real computation -------------------------------------------------------------
const rows: MlsRow[] = [
  row({ status: 'Closed', close_date: '2026-06-01', close_price: 400000, dom: 20, sqft: 2000 }),
  row({ status: 'Closed', close_date: '2026-03-15', close_price: 600000, dom: 40, sqft: 3000 }),
  row({ status: 'Closed', close_date: '2025-09-10', close_price: 500000, dom: 30, sqft: 2500 }),
  row({ status: 'Closed', close_date: '2024-01-01', close_price: 900000, dom: 90 }), // beyond 12 mo — excluded
  row({ status: 'Active', list_price: 550000 }),
  row({ status: 'Active', list_price: 450000 }),
  row({ status: 'Pending' }),
];
const s = marketStats(rows, NOW);
check('sold-last-12 excludes older sales', s.soldLast12 === 3);
check('median close from the window only', s.medianClose === 500000);
check('median DOM computed', s.medianDom === 30);
check('price/sqft median computed and rounded', s.medianPricePerSqft === 200);
check('months of supply = active ÷ monthly sold pace', s.monthsOfSupply === 8);
check('no notes when every stat is real', s.notes.length === 0);
check('pending is neither active nor sold', s.activeCount === 2);

// --- zip turnover (the farm-math numerator) ----------------------------------------
check('sold-by-zip counts the window for the zip', soldLast12ByZip(rows, '53147', NOW) === 3);
check('other zip → 0, never borrowed', soldLast12ByZip(rows, '60601', NOW) === 0);
check('blank zip → 0', soldLast12ByZip(rows, '', NOW) === 0);

// --- the line says what it doesn't know ----------------------------------------------
check('stats line carries real numbers', statsLine(s).includes('median close $500,000') && statsLine(s).includes('8 months of supply'));
check('thin line SAYS not enough data', statsLine(thin).includes('not enough data'));

// --- determinism -------------------------------------------------------------------------
check('deterministic', JSON.stringify(marketStats(rows, NOW)) === JSON.stringify(marketStats(rows, NOW)));

console.log(`\nmlsStats.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
