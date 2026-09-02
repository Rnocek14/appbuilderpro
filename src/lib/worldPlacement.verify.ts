// worldPlacement.verify.ts — the placement laws (docs/dot-field-map.md §5, must-prove 1).
//   npm run verify:worldplacement
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeItems, layoutRegions, argmaxAt, cellDepth, persistedFrom, fnv1a, ring,
  SPREAD_BASE, SPREAD_PER_RADIUS, WEIGHT_FLOOR, type Item, type WheelRegion } from './worldPlacement';

console.log('worldPlacement.verify — stable by construction, and by persistence when you say so\n');

const GEO = { cols: 47, rows: 47 };
const REGIONS: WheelRegion[] = [];
for (let s = 0; s < 8; s++) { REGIONS.push({ key: `k${s}a`, sector: s, radius: 0.3 }); REGIONS.push({ key: `k${s}b`, sector: s, radius: 0.75 }); }
const items = (n: number, salt = ''): Item[] => Array.from({ length: n }, (_, i) => {
  const s = i % 8; const deep = i % 3 === 0; const R = REGIONS[s * 2 + (deep ? 1 : 0)];
  const j = (parseInt(fnv1a('j' + i + salt), 16) % 1000) / 1000;
  return { id: `it-${i}${salt}`, region: R.key, sector: s, radius: Math.min(0.97, Math.max(0.18, R.radius + (j - 0.5) * 0.16)) };
});

// 1. determinism: same input → identical cells and hash
const A = placeItems(items(200), REGIONS, GEO);
const A2 = placeItems(items(200), REGIONS, GEO);
assert.deepEqual(A, A2, 'placement is not deterministic');
console.log(`  ok   deterministic: ${A.cells.length} placed, ${A.unplaced.length} unplaced, hash ${A.hash}`);

// 2. input order never matters
const shuffled = items(200).sort((x, y) => (fnv1a('s' + x.id) < fnv1a('s' + y.id) ? -1 : 1));
const S = placeItems(shuffled, REGIONS, GEO);
assert.deepEqual(S, A, 'input order changed the layout');
console.log('  ok   input order is irrelevant');

// 3. every cell unique, inside the rim, and under its own region's argmax
const placedR = layoutRegions(REGIONS, GEO);
const seen = new Set<string>();
for (const p of A.cells) {
  const k = p.c + ',' + p.r;
  assert.ok(!seen.has(k), `cell ${k} used twice`); seen.add(k);
  assert.ok(cellDepth(p.c, p.r, GEO) <= 1, `${p.id} placed beyond the rim`);
  assert.equal(placedR[argmaxAt(p.c, p.r, placedR).index].key, p.region, `${p.id} sits under another region's land`);
}
assert.equal(A.unplaced.length, 0, 'a 200-item world should fit');
console.log('  ok   every item sits in its own region, inside the rim, one per cell');

// 4. persistence: a layout of 150 survives a top-up to 200 unchanged
const first = placeItems(items(150), REGIONS, GEO);
const topped = placeItems(items(200), REGIONS, GEO, persistedFrom(first));
const byId = new Map(topped.cells.map((p) => [p.id, p]));
for (const p of first.cells) { const q = byId.get(p.id)!; assert.ok(q && q.c === p.c && q.r === p.r, `${p.id} moved on top-up`); }
assert.equal(topped.cells.length, 200, 'top-up lost items');
assert.notEqual(topped.hash, first.hash, 'a top-up must change the layout hash');
console.log('  ok   by persistence: 150 placed cells unchanged after a 50-item top-up');

// 5. without persistence a top-up MAY move items — the two claims are different and the suite says so
const fresh = placeItems(items(200), REGIONS, GEO);
let moved = 0; const freshById = new Map(fresh.cells.map((p) => [p.id, p]));
for (const p of first.cells) { const q = freshById.get(p.id)!; if (q.c !== p.c || q.r !== p.r) moved++; }
console.log(`  ok   without persistence a top-up moved ${moved} of 150 — which is why the edition JSON ships its cells`);

// 6. a changed item changes the hash
const changed = items(200); changed[7] = { ...changed[7], sector: (changed[7].sector + 4) % 8, region: REGIONS[((changed[7].sector + 4) % 8) * 2].key };
assert.notEqual(placeItems(changed, REGIONS, GEO).hash, A.hash, 'moving an item did not change the hash');
console.log('  ok   the layout hash sees a moved item');

// 7. an unknown region is an error, never a silent drop
assert.throws(() => placeItems([{ id: 'x', region: 'nope', sector: 0, radius: 0.5 }], REGIONS, GEO), /unknown region/);
// 8. the spiral ring is complete and ordered
assert.equal(ring(2).length, 16); assert.deepEqual(ring(1)[0], [-1, -1]);
console.log('  ok   unknown regions throw; the spiral ring is complete and ordered');

// 9. the prototype's staged geometry uses the same formulas — the two must never drift apart
const src = readFileSync(new URL('../../prototypes/the-drift.html', import.meta.url), 'utf8');
assert.ok(src.includes(`R.spread = ${SPREAD_BASE} + ${SPREAD_PER_RADIUS} * R.radius;`), 'the prototype changed its region spread formula');
assert.ok(src.includes(`) + ${WEIGHT_FLOOR};`), 'the prototype changed its weight floor');
assert.ok(src.includes('RIM = (Math.min(WCOLS, WROWS) - 3)/2'), 'the prototype changed its rim');
assert.ok(src.includes('R.cc = HUB_C + R.radius * RIM * Math.cos(a); R.cr = HUB_R - R.radius * RIM * Math.sin(a);'), 'the prototype changed its region placement');
console.log('  ok   the prototype and the core share spread, floor, rim and placement formulas');

console.log(`\nworldPlacement.verify: 0 problems`);
