// src/lib/garvis/gardener.verify.ts
// Standalone verification of the gardener (run: `npm run verify:gardener`).
// Guards the honesty contract: recurrence means ≥2 DISTINCT worlds (depth in one world never
// counts), grouping is measured lexical similarity, nothing is merged or deleted, output is
// deterministic and capped.

import { recurringThreads, type GardenClusterIn } from './gardener';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const row = (worldId: string, title: string, kind = 'question'): GardenClusterIn =>
  ({ worldId, worldTitle: `World ${worldId}`, title, kind });

// 1. The flagship: the same unresolved theme across three explorations surfaces once, with evidence.
{
  const threads = recurringThreads([
    row('time', 'Is reality fundamentally relational?'),
    row('time', 'Entropy and the arrow of time'),
    row('consciousness', 'Is reality fundamentally relational?'),
    row('simulation', 'Reality as fundamentally relational'),
    row('simulation', 'NPC behavior models', 'topic'),
  ]);
  check('one recurring thread found', threads.length === 1);
  check('evidence counts distinct worlds (3)', threads[0].worldCount === 3);
  check('one appearance per world, worlds named', threads[0].appearances.length === 3 && threads[0].appearances.some((a) => a.worldTitle === 'World consciousness'));
  check('representative title is the most specific member', threads[0].title === 'Reality as fundamentally relational' || threads[0].title === 'Is reality fundamentally relational?');
}

// 2. Depth inside ONE world is never recurrence.
{
  const threads = recurringThreads([
    row('time', 'Is time emergent?'),
    row('time', 'Emergent time'),
    row('time', 'Time as emergent property'),
  ]);
  check('ten branches in one world ≠ a recurring thread', threads.length === 0);
}

// 3. Unrelated titles never group; artifacts are excluded.
{
  const threads = recurringThreads([
    row('a', 'Black hole thermodynamics'),
    row('b', 'Lake Geneva sponsor pricing'),
    row('a', 'Generated postcard v3', 'artifact'),
    row('b', 'Generated postcard v3', 'artifact'),
  ]);
  check('unrelated titles do not group', threads.length === 0);
  check('artifact nodes recur for boring reasons — excluded', !threads.some((t) => t.title.includes('postcard')));
}

// 4. Deterministic ordering + cap: most-recurring first, ties by title, at most `cap`.
{
  const rows: GardenClusterIn[] = [];
  for (const t of ['alpha ideas', 'beta ideas', 'gamma ideas', 'delta ideas', 'epsilon ideas', 'zeta ideas']) {
    rows.push(row('w1', t), row('w2', t));
  }
  rows.push(row('w3', 'alpha ideas')); // alpha spans 3 worlds — must lead
  const threads = recurringThreads(rows);
  check('capped at 5', threads.length === 5);
  check('most-recurring leads', threads[0].title === 'alpha ideas' && threads[0].worldCount === 3);
  const again = recurringThreads(rows);
  check('deterministic: same input → same output', JSON.stringify(again) === JSON.stringify(threads));
}

// 5. The gardener only surfaces — the input is never mutated.
{
  const rows = [row('a', 'Is time emergent?'), row('b', 'Emergent time')];
  const snapshot = JSON.stringify(rows);
  recurringThreads(rows);
  check('input rows untouched (surfacing, never folding)', JSON.stringify(rows) === snapshot);
}

console.log(`\ngardener.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} gardener check(s) failed`);
