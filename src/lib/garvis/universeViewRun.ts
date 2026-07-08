// src/lib/garvis/universeViewRun.ts
// Impure half of the Universe altitude: fetch every world's rows, resolve insight refs to the
// worlds they actually live in, and hand the pure compiler its inputs. All queries are bounded;
// where a bound truncates, the sky UNDERCOUNTS — a dimmer universe is honest, an invented one is
// not. Comets come from the same loadRankedMoves the waking moment uses (one engine, three
// altitudes); events come from the append-only mind_events record, world-tagged only.

import { supabase } from '../supabase';
import { loadRankedMoves } from './nextMoveRun';
import {
  compileUniverseScene,
  type UniverseScene, type UniverseWorldIn, type InsightWorldsIn, type UniverseEventIn,
} from './universeView';
import type { MomentumLabel } from './worldIntel';

interface RefEntry { subject_type?: string; subject_id?: string }

export async function loadUniverseScene(): Promise<UniverseScene> {
  const now = new Date();

  const [worldsQ, intelQ, clustersQ, insightsQ, eventsQ, ranked] = await Promise.all([
    supabase.from('knowledge_worlds').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(100),
    supabase.from('world_intelligence').select('world_id, state'),
    supabase.from('knowledge_clusters').select('id, world_id, charter').limit(2000),
    supabase.from('insights').select('id, title, score, refs, created_at').eq('kind', 'connection').order('score', { ascending: false }).limit(60),
    supabase.from('mind_events').select('subject, occurred_at, payload').order('occurred_at', { ascending: false }).limit(300),
    loadRankedMoves(now),
  ]);

  const worlds = worldsQ.data ?? [];
  const clusters = clustersQ.data ?? [];
  const worldByCluster = new Map(clusters.map((c) => [c.id as string, c.world_id as string]));

  // Mass: clusters per world from the fetch above; artifacts per world via cluster ownership.
  const clusterCount = new Map<string, number>();
  const charteredCount = new Map<string, number>();
  for (const c of clusters) {
    const wid = c.world_id as string;
    clusterCount.set(wid, (clusterCount.get(wid) ?? 0) + 1);
    if (c.charter) charteredCount.set(wid, (charteredCount.get(wid) ?? 0) + 1);
  }
  const artifactCount = new Map<string, number>();
  if (clusters.length) {
    const { data: arts } = await supabase.from('knowledge_artifacts').select('cluster_id').limit(5000);
    for (const a of arts ?? []) {
      const wid = worldByCluster.get(a.cluster_id as string);
      if (wid) artifactCount.set(wid, (artifactCount.get(wid) ?? 0) + 1);
    }
  }

  // Momentum: the persisted Living State's derived label — never recomputed as an opinion here.
  const momentumByWorld = new Map<string, { label: MomentumLabel; evidence: string }>();
  for (const row of intelQ.data ?? []) {
    const state = row.state as { momentum?: { label?: MomentumLabel; evidence?: string } } | null;
    if (state?.momentum?.label && state.momentum.evidence) {
      momentumByWorld.set(row.world_id as string, { label: state.momentum.label, evidence: state.momentum.evidence });
    }
  }

  const worldsIn: UniverseWorldIn[] = worlds.map((w) => ({
    id: w.id as string,
    title: (w.title as string) ?? 'Untitled world',
    charteredClusters: charteredCount.get(w.id as string) ?? 0,
    clusters: clusterCount.get(w.id as string) ?? 0,
    artifacts: artifactCount.get(w.id as string) ?? 0,
    momentum: momentumByWorld.get(w.id as string) ?? null,
    updated_at: w.updated_at as string,
  }));

  // Insight refs → worlds. Three resolvable subject types; anything else is skipped, never
  // guessed: document → documents.world_id, cluster → the fetch above, artifact → its cluster.
  const insights = insightsQ.data ?? [];
  const docIds = new Set<string>();
  const artIds = new Set<string>();
  for (const ins of insights) {
    for (const ref of (ins.refs as RefEntry[] | null) ?? []) {
      if (!ref?.subject_id) continue;
      if (ref.subject_type === 'document') docIds.add(ref.subject_id);
      if (ref.subject_type === 'artifact') artIds.add(ref.subject_id);
    }
  }
  const worldByDoc = new Map<string, string>();
  if (docIds.size) {
    const { data } = await supabase.from('documents').select('id, world_id').in('id', [...docIds]);
    for (const d of data ?? []) if (d.world_id) worldByDoc.set(d.id as string, d.world_id as string);
  }
  const worldByArtifact = new Map<string, string>();
  if (artIds.size) {
    const { data } = await supabase.from('knowledge_artifacts').select('id, cluster_id').in('id', [...artIds]);
    for (const a of data ?? []) {
      const wid = worldByCluster.get(a.cluster_id as string);
      if (wid) worldByArtifact.set(a.id as string, wid);
    }
  }
  const insightsIn: InsightWorldsIn[] = insights.map((ins) => {
    const resolved = new Set<string>();
    for (const ref of (ins.refs as RefEntry[] | null) ?? []) {
      if (!ref?.subject_id) continue;
      const wid = ref.subject_type === 'document' ? worldByDoc.get(ref.subject_id)
        : ref.subject_type === 'cluster' ? worldByCluster.get(ref.subject_id)
        : ref.subject_type === 'artifact' ? worldByArtifact.get(ref.subject_id)
        : undefined;
      if (wid) resolved.add(wid);
    }
    return {
      insightId: ins.id as string,
      title: ins.title as string,
      score: Number(ins.score),
      worlds: [...resolved],
      created_at: ins.created_at as string,
    };
  });

  const eventsIn: UniverseEventIn[] = (eventsQ.data ?? []).map((e) => {
    const p = e.payload as Record<string, unknown> | null;
    return {
      subject: e.subject as string,
      occurred_at: e.occurred_at as string,
      worldId: p && typeof p.world_id === 'string' ? p.world_id : null,
    };
  });

  return compileUniverseScene({
    worlds: worldsIn,
    insights: insightsIn,
    moves: ranked.moves,
    events: eventsIn,
    asOf: now.toISOString(),
  });
}
