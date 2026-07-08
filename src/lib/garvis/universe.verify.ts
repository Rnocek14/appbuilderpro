// src/lib/garvis/universe.verify.ts
// Dependency-free unit checks for the PURE universe sync mapping (universeMap.ts) — the guarantee
// that a universe survives the trip browser graph → app_0013 rows → browser graph with nothing
// lost: hierarchy, edges, artifacts, salience, maturity, trajectory. Run: npm run verify:universe
// Mirrors the other garvis *.verify.ts files.

import { graphToRows, rowsToGraph, isWorldUuid, deletableStaleClusters } from './universeMap';
import type { ClusterGraph } from './clustering';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

console.log('universe.verify');

// deterministic id minting for the test (production uses existing ids + crypto.randomUUID)
const idFor = (key: string) => `uuid:${key}`;

const graph: ClusterGraph = {
  clusters: [
    {
      id: 'bee-hives', parentId: null, title: 'How bee hives work',
      summary: 'A hive is a living distributed system.', kind: 'topic', salience: 1,
      maturity: 'growing', trajectory: 'heading toward swarm intelligence', turnRefs: [0, 2],
      artifacts: [
        { id: 'understanding', kind: 'research', title: 'Understanding: bee hives', detail: 'Thousands of bees follow simple signals…', source: 'garvis' },
        { id: 'wiki-img-0', kind: 'image', title: 'Honeycomb', url: 'https://img/honeycomb.jpg', thumb: 'https://img/honeycomb_t.jpg', source: 'wikipedia' },
      ],
    },
    {
      id: 'queen-control', parentId: 'bee-hives', title: 'How one queen influences 50,000 bees',
      summary: '', kind: 'question', salience: 0.678, maturity: 'spark', turnRefs: [],
      artifacts: [{ id: 'yt-abc123', kind: 'video', title: 'Queen pheromones explained', url: 'https://youtube.com/watch?v=abc', thumb: 'https://img.youtube.com/abc.jpg', source: 'youtube' }],
    },
    {
      id: 'distributed-ai', parentId: 'bee-hives', title: 'Is this like distributed AI?',
      summary: 'Swarms and agent fleets share a shape.', kind: 'idea', salience: 0.8,
      maturity: 'spark', turnRefs: [5], artifacts: [],
    },
  ],
  edges: [
    { sourceId: 'bee-hives', targetId: 'distributed-ai', type: 'leads_to' },
    { sourceId: 'queen-control', targetId: 'distributed-ai', type: 'relates' },
  ],
};

const rows = graphToRows(graph, 'world-1', 'owner-1', idFor);

// --- rows shape ---
check('one row per cluster', rows.clusters.length === 3);
check('cluster id from idFor(slug)', rows.clusters[0].id === 'uuid:bee-hives');
check('slug carries the client id', rows.clusters[0].slug === 'bee-hives');
check('root parent_id is null', rows.clusters[0].parent_id === null);
check('child parent_id resolves through idFor', rows.clusters[1].parent_id === 'uuid:bee-hives');
check('salience rounded to numeric(3,2)', rows.clusters[1].salience === 0.68);
check('empty summary stored as null', rows.clusters[1].summary === null);
check('trajectory carried', rows.clusters[0].trajectory === 'heading toward swarm intelligence');
check('turn_refs carried', JSON.stringify(rows.clusters[0].turn_refs) === '[0,2]');
check('one row per artifact', rows.artifacts.length === 3);
check('artifact keyed per cluster (understanding)', rows.artifacts[0].id === 'uuid:bee-hives\nunderstanding');
check('artifact cluster_id matches its cluster', rows.artifacts[2].cluster_id === 'uuid:queen-control');
check('artifact slug carries client artifact id', rows.artifacts[2].slug === 'yt-abc123');
check('artifact missing url stored as null', rows.artifacts[0].url === null);
check('edges resolve endpoints through idFor', rows.edges[0].source_id === 'uuid:bee-hives' && rows.edges[0].target_id === 'uuid:distributed-ai');
check('edge type carried', rows.edges[0].type === 'leads_to');
check('owner/world stamped on every row', rows.clusters.every((c) => c.owner_id === 'owner-1' && c.world_id === 'world-1') && rows.edges.every((e) => e.world_id === 'world-1') && rows.artifacts.every((a) => a.owner_id === 'owner-1'));

// --- round trip: graph → rows → graph is lossless ---
// canonical stringify (sorted keys, undefined dropped) so literal key order can't fake a diff
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canon(x)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(v);
}
const back = rowsToGraph(rows.clusters, rows.edges, rows.artifacts);
{
  // salience 0.678 legitimately rounds to 0.68 on the way in — compare against the stored value
  const expected: ClusterGraph = {
    ...graph,
    clusters: graph.clusters.map((c) => ({ ...c, salience: Math.round(c.salience * 100) / 100 })),
  };
  check('round trip preserves the whole graph', canon(back) === canon(expected));
}
check('round trip keeps hierarchy (child → parent slug)', back.clusters[1].parentId === 'bee-hives');
check('round trip keeps artifacts on their cluster', back.clusters[0].artifacts.length === 2 && back.clusters[0].artifacts[0].id === 'understanding');
check('round trip restores undefined for null detail', back.clusters[1].artifacts[0].detail === undefined);
check('round trip keeps both edges', back.edges.length === 2);

// --- resilience ---
{
  const dangling = rowsToGraph(rows.clusters, [...rows.edges, { owner_id: 'o', world_id: 'w', source_id: 'uuid:missing', target_id: 'uuid:bee-hives', type: 'relates' }], rows.artifacts);
  check('edge to a missing cluster is dropped, not crashed', dangling.edges.length === 2);
}
{
  const noSlug = rowsToGraph(rows.clusters, [], [{ ...rows.artifacts[0], slug: '' }]);
  check('artifact without slug falls back to slugified title', noSlug.clusters[0].artifacts[0].id === 'understanding-bee-hives');
}

// --- isWorldUuid (local u_ ids vs server uuids) ---
check('server uuid recognized', isWorldUuid('a3bb189e-8bf9-3888-9912-ace4e6543002'));
check('local u_ id rejected', !isWorldUuid('u_x8k2m1q9'));

// --- the sync guard: chartered clusters are never stale-deleted ---
{
  const existing = [
    { id: 'thought-1', charter: null },                                  // plain thought, folded away locally
    { id: 'area-1', charter: { archetype: 'launch', flavor: 'email' } }, // server-side production area
    { id: 'thought-2', charter: null },                                  // still present locally
  ];
  const stale = deletableStaleClusters(existing, ['thought-2']);
  check('an unchartered cluster the graph dropped IS deletable', stale.includes('thought-1'));
  check('a CHARTERED cluster absent from the local graph is NEVER deletable', !stale.includes('area-1'));
  check('a cluster the graph still contains is kept', !stale.includes('thought-2'));
}

console.log(`\nuniverse.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} universe check(s) failed`);
