// src/lib/garvis/webLayout.verify.ts — run: npx tsx src/lib/garvis/webLayout.verify.ts
// Proves the reusable web layout is deterministic, honest (nothing dropped), size-encodes the metric,
// and stays on-canvas.

import { layoutWeb, type WebNode, type WebGroupDef } from './webLayout';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const GROUPS: WebGroupDef[] = [
  { key: 'weak', label: 'Weak sites', color: '#FF8A3D' },
  { key: 'dated', label: 'Dated', color: '#E7B45A' },
  { key: 'solid', label: 'Already solid', color: '#5FC08A' },
];
const NODES: WebNode[] = [
  { id: 'a', label: 'Joe’s Roofing', group: 'weak', metric: 90 },
  { id: 'b', label: 'Ace Plumbing', group: 'weak', metric: 70 },
  { id: 'c', label: 'Bright Dental', group: 'dated', metric: 40 },
  { id: 'd', label: 'Modern HVAC', group: 'solid', metric: 10 },
  { id: 'e', label: 'Lakeside Law', group: 'weak', metric: 85 },
];

const L = layoutWeb(NODES, GROUPS);
ok('places every node (nothing dropped)', L.nodes.length === NODES.length);
ok('one hub per non-empty group', L.hubs.length === 3 && L.hubs.map((h) => h.key).sort().join() === 'dated,solid,weak');
ok('hub counts are right', L.hubs.find((h) => h.key === 'weak')!.count === 3 && L.hubs.find((h) => h.key === 'solid')!.count === 1);
ok('nodes carry their group color', L.nodes.find((n) => n.id === 'a')!.color === '#FF8A3D' && L.nodes.find((n) => n.id === 'd')!.color === '#5FC08A');

// size encodes the metric: the biggest-metric node is the biggest orb; the smallest is the smallest.
const rById = new Map(L.nodes.map((n) => [n.id, n.r]));
ok('biggest metric → biggest orb', rById.get('a')! >= rById.get('b')! && rById.get('a')! >= rById.get('d')!);
ok('smallest metric → smallest orb', rById.get('d')! <= rById.get('c')! && rById.get('d')! <= rById.get('a')!);

// everything stays on canvas
ok('all nodes within [0,100] with padding', L.nodes.every((n) => n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100));

// exactly one "primary" (the standout) per constellation, and it's the biggest-metric member
ok('one primary per group', L.hubs.every((h) => L.nodes.filter((n) => n.group === h.key && n.primary).length === 1));
ok('the weak primary is the biggest-metric weak node', L.nodes.find((n) => n.group === 'weak' && n.primary)!.id === 'a');

// determinism
const L2 = layoutWeb(NODES, GROUPS);
ok('deterministic: identical layout for identical input', JSON.stringify(L) === JSON.stringify(L2));

// empty input → honest empty
const E = layoutWeb([], GROUPS);
ok('empty input → empty:true, no nodes/hubs', E.empty === true && E.nodes.length === 0 && E.hubs.length === 0);

// a node in an undeclared group is NOT dropped — it lands in a trailing "Other" constellation
const withOrphan = layoutWeb([...NODES, { id: 'z', label: 'Mystery', group: 'unknownkind', metric: 5 }], GROUPS);
ok('undeclared-group node kept (Other hub)', withOrphan.nodes.some((n) => n.id === 'z') && withOrphan.hubs.some((h) => h.key === '__other'));

// single group → hub centered
const one = layoutWeb([{ id: 'x', label: 'Solo', group: 'weak', metric: 1 }], GROUPS);
ok('single group hub is centered', Math.abs(one.hubs[0].x - 50) < 0.001 && Math.abs(one.hubs[0].y - 50) < 0.001);

// metric defaults + all-equal metrics don't blow up (uniform mid size)
const flat = layoutWeb([{ id: 'p', label: 'P', group: 'weak' }, { id: 'q', label: 'Q', group: 'weak' }], GROUPS);
ok('missing metric → still placed, valid radius', flat.nodes.length === 2 && flat.nodes.every((n) => n.r >= 16 && n.r <= 46));

console.log(`\nwebLayout.verify: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
