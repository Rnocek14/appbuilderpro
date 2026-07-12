// src/lib/garvis/inquiryRun.ts
// Impure half of the decision laboratory (mirrors clustering.ts / clusteringRun.ts): calls the
// model via explorerAI, then lets the SUBSTANCE GATES in inquiry.ts decide what's real enough to
// keep. A comparison that survives becomes (1) a durable artifact on the branch that asked and
// (2) a typed edge on the map — the discovered relationship is structure, not just prose. A theory
// scaffold that survives re-types its node (kind 'theory', epistemic 'hypothesis' unless the owner
// already judged it), lands as the branch's scaffold artifact, and grows up to three child
// 'experiment' sparks from its proposed tests. Thin output returns an error naming the gaps —
// never a silently saved shrug.

import { exploreComplete } from './explorerAI';
import {
  COMPARE_SYSTEM, buildCompareUser, parseComparison, comparisonArtifact, VERDICT_EDGE,
  THEORY_SYSTEM, buildTheoryUser, parseTheoryScaffold, theoryArtifact,
  type Comparison, type TheoryScaffold,
} from './inquiry';
import { addChild, normalizeGraph, slugify, type ClusterGraph, type Cluster } from './clustering';

const understandingOf = (c: Cluster): string =>
  // exclude source 'lab' from the fallback — a prior comparison/scaffold must not feed itself back in
  c.artifacts.find((a) => a.id === 'understanding')?.detail
    ?? c.artifacts.find((a) => a.kind === 'research' && a.source !== 'lab')?.detail ?? '';

export interface CompareResult { graph: ClusterGraph; costUsd: number; cmp: Comparison | null; error?: string }

export async function compareNodes(graph: ClusterGraph, aId: string, bId: string, worldTitle = ''): Promise<CompareResult> {
  const a = graph.clusters.find((c) => c.id === aId);
  const b = graph.clusters.find((c) => c.id === bId);
  if (!a || !b || aId === bId) return { graph, costUsd: 0, cmp: null, error: 'Pick two different thoughts to compare.' };

  const r = await exploreComplete([
    { role: 'system', content: COMPARE_SYSTEM },
    { role: 'user', content: buildCompareUser(
      { title: a.title, summary: a.summary, detail: understandingOf(a) },
      { title: b.title, summary: b.summary, detail: understandingOf(b) },
      worldTitle,
    ) },
  ], 1800);

  const { cmp, missing } = parseComparison(r.text);
  if (!cmp) return { graph, costUsd: r.costUsd, cmp: null, error: `Too thin to trust — missing ${missing.join('; ')}. Nothing was saved; try again.` };

  // 1. the durable record, on the branch that asked (same pair → same id → a recompare refreshes)
  const art = comparisonArtifact(a.title, b.title, cmp);
  const clusters = graph.clusters.map((c) =>
    c.id === aId ? { ...c, artifacts: [...c.artifacts.filter((x) => x.id !== art.id), art] } : c);

  // 2. the discovered relationship, recorded as map structure. The freshest deep comparison owns
  //    the pair's judgment edge; the leads_to discovery trail is never touched.
  const edges = [
    ...graph.edges.filter((e) =>
      e.type === 'leads_to'
      || !((e.sourceId === aId && e.targetId === bId) || (e.sourceId === bId && e.targetId === aId))),
    { sourceId: aId, targetId: bId, type: VERDICT_EDGE[cmp.verdict] },
  ];

  return { graph: normalizeGraph({ clusters, edges }), costUsd: r.costUsd, cmp };
}

export interface TheoryResult { graph: ClusterGraph; costUsd: number; scaffold: TheoryScaffold | null; error?: string }

export async function formalizeTheory(graph: ClusterGraph, focusId: string): Promise<TheoryResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0, scaffold: null, error: 'That thought is gone from the map.' };

  const r = await exploreComplete([
    { role: 'system', content: THEORY_SYSTEM },
    { role: 'user', content: buildTheoryUser(`${focus.title}. ${focus.summary}`.trim(), understandingOf(focus)) },
  ], 1800);

  const { scaffold, missing } = parseTheoryScaffold(r.text);
  if (!scaffold) return { graph, costUsd: r.costUsd, scaffold: null, error: `Not rigorous enough to save — missing ${missing.join('; ')}. Nothing was saved; try again.` };

  const art = theoryArtifact(scaffold);
  let g2: ClusterGraph = {
    ...graph,
    clusters: graph.clusters.map((c) => (c.id === focusId
      ? {
          ...c,
          kind: 'theory' as const,
          epistemic: c.epistemic ?? 'hypothesis', // the owner's existing judgment always wins
          artifacts: [...c.artifacts.filter((x) => x.id !== art.id), art],
        }
      : c)),
  };

  // proposed tests become real map objects — up to three 'experiment' sparks under the theory
  const childSlugs = new Set(g2.clusters.filter((c) => c.parentId === focusId).map((c) => c.id));
  for (const ex of scaffold.experiments.slice(0, 3)) {
    if (childSlugs.has(slugify(ex))) continue;
    const added = addChild(g2, focusId, { title: ex.slice(0, 80), kind: 'experiment' });
    if (added.id) g2 = added.graph;
  }

  return { graph: normalizeGraph(g2), costUsd: r.costUsd, scaffold };
}
