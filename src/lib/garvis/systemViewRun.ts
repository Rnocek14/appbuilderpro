// src/lib/garvis/systemViewRun.ts
// Impure half of the System altitude: fetch the rows one world's sky is made of, adapt them to
// the pure compiler's input shapes, return the scene. Three sources, no forks:
//   * loadWeb        — the same chartered clusters + rollup the WorkWeb page renders
//   * worldIntelRun  — refresh-then-read, so the star is never staler than this visit
//   * loadRankedMoves — the ONE Next Move engine; comets are its world-scoped output
// The only query this file adds is the 7-day artifact count per cluster — planet glow must come
// from counted created_at rows, and the loaded web doesn't carry timestamps.

import { supabase } from '../supabase';
import { loadWeb } from './workwebRun';
import { refreshWorldIntelligence, getWorldIntelligence } from './worldIntelRun';
import { loadRankedMoves } from './nextMoveRun';
import { compileSystemScene, type SystemScene, type SceneClusterIn, type SceneIntelIn } from './systemView';

export async function loadSystemScene(worldId: string): Promise<SystemScene | null> {
  const now = new Date();

  // Refresh the deterministic Living State first (the heartbeat updates when observed), in
  // parallel with the web and the ranked moves — then read the intelligence row it wrote.
  const [web, ranked] = await Promise.all([
    loadWeb(worldId),
    loadRankedMoves(now),
    refreshWorldIntelligence(worldId).catch(() => null),
  ]).then(([w, r]) => [w, r] as const);
  if (!web) return null;
  const intelRow = await getWorldIntelligence(worldId).catch(() => null);

  const chartered = web.clusters.filter((c) => c.charter);

  // Counted glow: artifacts created in the last 7 days, per cluster. Undercount-honest — an
  // area with no rows this week renders unlit, whatever it "feels" like.
  const weekAgoIso = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const arts7 = new Map<string, number>();
  if (chartered.length) {
    const { data } = await supabase.from('knowledge_artifacts')
      .select('cluster_id')
      .in('cluster_id', chartered.map((c) => c.id))
      .gte('created_at', weekAgoIso)
      .limit(1000);
    for (const a of data ?? []) {
      const cid = a.cluster_id as string;
      arts7.set(cid, (arts7.get(cid) ?? 0) + 1);
    }
  }

  const clusters: SceneClusterIn[] = chartered.map((c) => ({
    id: c.id, slug: c.slug, parentSlug: c.parentSlug, title: c.title,
    archetype: c.charter!.archetype,
    status: c.liveStatus ?? c.charter!.status,
    artifactsTotal: c.artifacts.length,
    artifacts7d: arts7.get(c.id) ?? 0,
    pendingApprovals: c.pendingApprovals,
  }));

  const intel: SceneIntelIn | null = intelRow?.state
    ? {
        momentum: intelRow.state.momentum
          ? { label: intelRow.state.momentum.label, evidence: intelRow.state.momentum.evidence }
          : null,
        blockers: intelRow.state.blockers ?? [],
        risks: intelRow.state.risks ?? [],
        openQuestions: intelRow.open_questions ?? [],
        recommendation: intelRow.recommendation,
        objective: intelRow.objective,
        strategy: intelRow.state.strategy,
        lastReflectedAt: intelRow.last_reflected_at,
      }
    : null;

  return compileSystemScene({
    worldId,
    worldTitle: web.title,
    clusters,
    intel,
    moves: ranked.moves,
    asOf: now.toISOString(),
  });
}
