// src/lib/garvis/buildBrief.verify.ts — run: npx tsx src/lib/garvis/buildBrief.verify.ts
import { compileBuildBrief } from './buildBrief';
import type { ClusterGraph, Cluster } from './clustering';

function cl(p: Partial<Cluster> & { id: string; title: string }): Cluster {
  return {
    id: p.id, parentId: p.parentId ?? null, title: p.title, summary: p.summary ?? '',
    kind: p.kind ?? 'topic', salience: p.salience ?? 0.5, maturity: p.maturity ?? 'growing',
    trajectory: p.trajectory, turnRefs: [], artifacts: p.artifacts ?? [],
  };
}

let pass = 0;
function ok(cond: boolean, msg: string) { if (!cond) throw new Error('FAIL: ' + msg); pass++; console.log('ok:', msg); }

const graph: ClusterGraph = {
  clusters: [
    cl({ id: 'bees', title: 'How do bee hives work?', summary: 'A hive is a distributed system.',
      artifacts: [
        { id: 'understanding', kind: 'research', title: 'Understanding', detail: 'Thousands of bees follow simple local signals.' },
        { id: 's1', kind: 'link', title: 'nature.com', url: 'https://nature.com/x' },
      ] }),
    cl({ id: 'queen', parentId: 'bees', title: 'How does one queen influence 50,000 bees?', summary: 'Pheromone signalling.',
      artifacts: [{ id: 'understanding', kind: 'research', title: 'U', detail: 'The queen emits pheromones that suppress worker ovaries.' }] }),
    cl({ id: 'swarm', parentId: 'queen', title: 'Is a hive more like a brain or a city?', summary: 'Emergent intelligence.' }),
    cl({ id: 'ai', parentId: 'swarm', title: 'What can AI agents learn from swarms?', summary: 'Decentralized coordination.' }),
  ],
  edges: [],
};

// deep world (>8 would flip auto to branch; here 4 → wholeWorld auto true)
const branch = compileBuildBrief(graph, 'swarm', { openQuestions: ['Do bees vote?'] });
ok(branch !== null, 'compiles for a valid focus');
ok(compileBuildBrief(graph, 'nope') === null, 'returns null for unknown focus');

const b = branch!;
ok(b.prompt.includes('brain or a city'), 'prompt seeds from the focused idea title');
ok(b.prompt.includes('Brain'), 'prompt points the builder at the project Brain');
ok(b.brief.includes('How do bee hives work?  →  How does one queen'), 'brief includes the reasoning thread (ancestors → focus)');
ok(b.brief.includes('Research sources gathered') && b.brief.includes('nature.com'), 'brief carries gathered sources');
ok(b.brief.includes('Do bees vote?'), 'brief carries open questions the caller passed');
ok(b.brief.includes('What to build'), 'brief ends with a build directive');

// force branch-only on a big world: ancestors + focus + children only
const big: ClusterGraph = { clusters: Array.from({ length: 12 }, (_, i) => cl({ id: `n${i}`, parentId: i === 0 ? null : `n${i - 1}`, title: `Node ${i}` })), edges: [] };
const scoped = compileBuildBrief(big, 'n5', { wholeWorld: false })!;
ok(scoped.wholeWorld === false, 'respects explicit wholeWorld:false');
ok(scoped.brief.includes('Node 4  →  Node 5') || scoped.brief.includes('Node 5'), 'branch mode still includes the thread to focus');
ok(compileBuildBrief(big, 'n5')!.wholeWorld === false, 'big world (>8 nodes) auto-selects branch, not whole world');
ok(compileBuildBrief(graph, 'swarm')!.wholeWorld === true, 'small world (<=8 nodes) auto-selects whole world');

console.log(`\nAll buildBrief checks passed (${pass}).`);
