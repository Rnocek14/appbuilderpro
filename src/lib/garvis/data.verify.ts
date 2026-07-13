// src/lib/garvis/data.verify.ts
// Run: npx tsx src/lib/garvis/data.verify.ts
// Verifies the Data & Numbers workspace's pure core: the CSV parser is real (quotes, embedded commas,
// currency), type inference is correct, statistics are computed exactly (the numbers are NEVER a
// model's job), aggregation is deterministic, and the fact sheet the model narrates over carries only
// computed figures.

import {
  parseCSV, toNumber, describe, groupBy, dataFacts, buildDataUser, fmtNum, analysisArtifact,
  DATA_SYSTEM, type NumberStats, type TextStats,
} from './data';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('data.verify');

// 1 — the parser is real: quoted fields, embedded commas, "" escapes, currency, CRLF.
{
  const csv = 'region,sales,note\r\n"West, Inc","$1,200","He said ""hi"""\nEast,900,plain';
  const t = parseCSV(csv);
  check('headers parsed', t.columns.map((c) => c.name).join(',') === 'region,sales,note');
  check('quoted field with a comma stays one cell', t.rows[0][0] === 'West, Inc');
  check('currency $1,200 becomes the number 1200', t.rows[0][1] === 1200);
  check('escaped "" becomes a single quote', t.rows[0][2] === 'He said "hi"');
  check('second data row parsed', t.rows[1][0] === 'East' && t.rows[1][1] === 900);
}

// 2 — type inference: number vs date vs text; empty cells → null.
{
  const t = parseCSV('name,amount,when\nA,10,2024-01-05\nB,,2024-02-10\nC,30,2024-03-01');
  check('numeric column typed number', t.columns[1].type === 'number');
  check('date column typed date', t.columns[2].type === 'date');
  check('name column typed text', t.columns[0].type === 'text');
  check('an empty numeric cell is null, not 0', t.rows[1][1] === null);
}

// 3 — toNumber tolerates currency/percent, rejects words.
{
  check('$1,234.50 → 1234.5', toNumber('$1,234.50') === 1234.5);
  check('45% → 45', toNumber('45%') === 45);
  check('"hello" → null', toNumber('hello') === null);
  check('empty → null', toNumber('   ') === null);
}

// 4 — statistics are computed EXACTLY (the whole point: no model does this).
{
  const t = parseCSV('team,pts\nA,10\nB,20\nC,30\nD,40');
  const stats = describe(t);
  const pts = stats.find((s) => s.name === 'pts') as NumberStats;
  check('count', pts.count === 4);
  check('sum', pts.sum === 100);
  check('mean', pts.mean === 25);
  check('median of even set is the average of the two middles', pts.median === 25);
  check('min/max', pts.min === 10 && pts.max === 40);
  // sample stddev of [10,20,30,40] = sqrt(1666.67) ≈ 12.909944
  check('sample stddev', Math.abs(pts.stddev - 12.909944) < 1e-4);
}

// 5 — text stats: distinct + top values, deterministic.
{
  const t = parseCSV('city,n\nNYC,1\nLA,1\nNYC,1\nNYC,1\nLA,1');
  const city = describe(t).find((s) => s.name === 'city') as TextStats;
  check('distinct counted', city.distinct === 2);
  check('top value is the most frequent', city.top[0].value === 'NYC' && city.top[0].count === 3);
}

// 6 — groupBy aggregates from real data, deterministically; guards bad ops.
{
  const t = parseCSV('region,sales\nWest,100\nEast,50\nWest,200\nEast,50');
  const sum = groupBy(t, 'region', 'sales', 'sum');
  check('sum by group, sorted by value desc', sum[0].key === 'West' && sum[0].value === 300 && sum[1].key === 'East' && sum[1].value === 100);
  const mean = groupBy(t, 'region', 'sales', 'mean');
  check('mean by group', mean.find((g) => g.key === 'East')?.value === 50);
  const count = groupBy(t, 'region', 'sales', 'count');
  check('count by group ignores the value column', count.find((g) => g.key === 'West')?.value === 2);
  check('grouping a non-numeric value column (for sum) returns nothing, not garbage', groupBy(t, 'region', 'region', 'sum').length === 0);
  check('unknown group column returns []', groupBy(t, 'nope', 'sales', 'sum').length === 0);
}

// 7 — the fact sheet carries computed figures and only those; the prompt forbids inventing numbers.
{
  const t = parseCSV('team,pts\nA,10\nB,30');
  const facts = dataFacts(t, describe(t));
  check('fact sheet states the real sum + mean', facts.includes('sum 40') && facts.includes('mean 20'));
  check('fact sheet notes row/col shape', facts.includes('2 rows') && facts.includes('2 columns'));
  const user = buildDataUser('what stands out?', facts);
  check('user turn carries the question + facts', user.includes('what stands out?') && user.includes('FACT SHEET'));
  check('system forbids inventing or computing numbers', /never state a figure|never compute/i.test(DATA_SYSTEM));
}

// 8 — formatting + saved record.
{
  check('fmtNum groups thousands, trims decimals', fmtNum(1234.5) === '1,234.5' && fmtNum(1000) === '1,000');
  const a1 = analysisArtifact('Q3 sales', 'TABLE: 2 rows', 'Sales were flat.');
  const a2 = analysisArtifact('Q3 sales', 'TABLE: 2 rows', 'Sales were flat.');
  check('analysis artifact is deterministic + carries the fact sheet', a1.id === a2.id && a1.id.startsWith('data-') && a1.detail.includes('TABLE: 2 rows'));
  const noNarr = analysisArtifact('Raw', 'TABLE: 5 rows', '');
  check('with no narrative, the computed facts still stand as the record', noNarr.detail === 'TABLE: 5 rows');
}

console.log(`\ndata.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} data check(s) failed`);
