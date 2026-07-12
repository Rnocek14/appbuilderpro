// src/lib/garvis/universeMap.ts
// PURE graph ↔ rows mapping for Knowledge Universe sync (app_0013 + app_0018 schema). Kept free of
// Supabase/DOM imports so it's unit-testable under tsx (universe.verify.ts) — the impure sync layer
// in universe.ts is the only caller with a database.
//
// `idFor` maps a stable client key to a row uuid; the caller feeds it existing ids (so saves UPDATE
// rows in place) and mints uuids for new keys. Cluster key = slug; artifact key = `${slug}\n${artifactId}`.

import { slugify, EPISTEMICS, type Artifact, type ArtifactKind, type Cluster, type ClusterGraph, type ClusterKind, type ClusterMaturity, type EdgeType, type Epistemic } from './clustering';

export interface ClusterRow {
  id: string; owner_id: string; world_id: string; parent_id: string | null;
  slug: string; title: string; summary: string | null; trajectory: string | null;
  kind: ClusterKind; maturity: ClusterMaturity; salience: number; turn_refs: number[];
  epistemic?: string | null; // app_0049 — optional so pre-migration rows still map
}
export interface EdgeRow {
  owner_id: string; world_id: string; source_id: string; target_id: string; type: string;
}
export interface ArtifactRow {
  id: string; owner_id: string; cluster_id: string; slug: string;
  kind: ArtifactKind; title: string; detail: string | null; url: string | null; thumb: string | null; source: string | null;
}

const orNull = (s: string | undefined): string | null => (s !== undefined && s !== '' ? s : null);
const orUndef = (s: string | null | undefined): string | undefined => (s === null || s === undefined || s === '' ? undefined : s);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isWorldUuid = (id: string): boolean => UUID_RE.test(id);

/**
 * Which existing cluster rows may a sync delete? ONLY unchartered ones the local graph no longer
 * contains. A row with a charter is a PRODUCTION AREA — it may exist only server-side (created by
 * instantiateWeb / the studios, never seen by this browser's explorer graph), and deleting it
 * would cascade away its artifacts, versions, and files. The universe only grows; commitments
 * are never collateral damage of a thought-graph sync.
 */
export function deletableStaleClusters(
  existing: { id: string; charter: unknown }[],
  keepIds: string[],
): string[] {
  const keep = new Set(keepIds);
  return existing.filter((r) => !keep.has(r.id) && (r.charter === null || r.charter === undefined)).map((r) => r.id);
}

/** Flatten a graph into DB rows. Pure: no Supabase, no randomness of its own. */
export function graphToRows(
  graph: ClusterGraph, worldId: string, ownerId: string, idFor: (key: string) => string,
): { clusters: ClusterRow[]; edges: EdgeRow[]; artifacts: ArtifactRow[] } {
  const clusters: ClusterRow[] = graph.clusters.map((c) => ({
    id: idFor(c.id),
    owner_id: ownerId,
    world_id: worldId,
    parent_id: c.parentId ? idFor(c.parentId) : null,
    slug: c.id,
    title: c.title,
    summary: orNull(c.summary),
    trajectory: orNull(c.trajectory),
    kind: c.kind,
    maturity: c.maturity,
    salience: Math.round(c.salience * 100) / 100, // numeric(3,2)
    turn_refs: c.turnRefs,
    epistemic: c.epistemic ?? null,
  }));
  const edges: EdgeRow[] = graph.edges.map((e) => ({
    owner_id: ownerId, world_id: worldId,
    source_id: idFor(e.sourceId), target_id: idFor(e.targetId), type: e.type,
  }));
  const artifacts: ArtifactRow[] = graph.clusters.flatMap((c) =>
    c.artifacts.map((a) => ({
      id: idFor(`${c.id}\n${a.id}`),
      owner_id: ownerId,
      cluster_id: idFor(c.id),
      slug: a.id,
      kind: a.kind,
      title: a.title,
      detail: orNull(a.detail),
      url: orNull(a.url),
      thumb: orNull(a.thumb),
      source: orNull(a.source),
    })),
  );
  return { clusters, edges, artifacts };
}

/** Rebuild the client graph from DB rows. Inverse of graphToRows (modulo empty-string↔null). */
export function rowsToGraph(clusters: ClusterRow[], edges: EdgeRow[], artifacts: ArtifactRow[]): ClusterGraph {
  const slugById = new Map(clusters.map((r) => [r.id, r.slug]));
  const artsByCluster = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const list = artsByCluster.get(a.cluster_id) ?? [];
    list.push({
      id: a.slug || slugify(a.title),
      kind: a.kind,
      title: a.title,
      detail: orUndef(a.detail),
      source: orUndef(a.source),
      url: orUndef(a.url),
      thumb: orUndef(a.thumb),
    });
    artsByCluster.set(a.cluster_id, list);
  }
  const outClusters: Cluster[] = clusters.map((r) => ({
    id: r.slug,
    parentId: r.parent_id ? slugById.get(r.parent_id) ?? null : null,
    title: r.title,
    summary: r.summary ?? '',
    kind: r.kind,
    salience: Number(r.salience),
    maturity: r.maturity,
    epistemic: EPISTEMICS.includes(r.epistemic as Epistemic) ? (r.epistemic as Epistemic) : undefined,
    trajectory: orUndef(r.trajectory),
    turnRefs: r.turn_refs ?? [],
    artifacts: artsByCluster.get(r.id) ?? [],
  }));
  const outEdges = edges
    .map((e) => ({ sourceId: slugById.get(e.source_id) ?? '', targetId: slugById.get(e.target_id) ?? '', type: e.type as EdgeType }))
    .filter((e) => e.sourceId && e.targetId);
  return { clusters: outClusters, edges: outEdges };
}
