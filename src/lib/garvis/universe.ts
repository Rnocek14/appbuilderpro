// src/lib/garvis/universe.ts
// Persistence for the Knowledge Universe — the substrate the epiphany engine, patterns, and
// "welcome back" all stand on. THE RULE: the universe only grows. Nothing the user explored is
// ever silently destroyed — starting a new curiosity opens a NEW world; the old ones keep living.
//
// Two layers, local-first:
//   * localStorage multi-world store ('ff:worlds:v1') — instant, offline, survives every session.
//     (Migrates the legacy single-universe 'ff:universe:v1' key on first load.)
//   * Supabase app_0013 tables (worlds/clusters/edges/artifacts) — cross-device, and the substrate
//     pgvector + the heartbeat build on. syncUniverse() pushes the current world up (best-effort,
//     throttled by an in-flight guard); listWorlds()/loadWorld() merge both layers.
//
// The graph↔rows mapping is PURE (graphToRows / rowsToGraph, tested in universe.verify.ts); only
// the thin sync functions touch Supabase.

import { supabase, supabaseConfigured } from '../supabase';
import type { ClusterGraph } from './clustering';
import { graphToRows, rowsToGraph, isWorldUuid, deletableStaleClusters, type ClusterRow, type EdgeRow, type ArtifactRow } from './universeMap';

export { graphToRows, rowsToGraph, isWorldUuid, type ClusterRow, type EdgeRow, type ArtifactRow };

export interface Universe {
  id: string;
  title: string;
  graph: ClusterGraph;
  focusId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorldMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** present in this browser's local store (openable offline) */
  local: boolean;
  /** present in Supabase (openable from any device) */
  remote: boolean;
  clusterCount?: number;
}

const KEY_WORLDS = 'ff:worlds:v1';
const KEY_CURRENT = 'ff:worlds:current';
const LEGACY_KEY = 'ff:universe:v1';

function now(): string {
  // Date is fine in app code (the no-Date rule is only for workflow scripts).
  return new Date().toISOString();
}

export function newUniverse(title: string, graph: ClusterGraph, focusId: string | null): Universe {
  const ts = now();
  return { id: `u_${Math.random().toString(36).slice(2, 10)}`, title, graph, focusId, createdAt: ts, updatedAt: ts };
}

// ---------------------------------------------------------------------------
// Local store (multi-world)
// ---------------------------------------------------------------------------

function readStore(): Record<string, Universe> {
  try {
    migrateLegacy();
    const raw = localStorage.getItem(KEY_WORLDS);
    if (!raw) return {};
    const store = JSON.parse(raw) as Record<string, Universe>;
    return store && typeof store === 'object' ? store : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Universe>): void {
  try { localStorage.setItem(KEY_WORLDS, JSON.stringify(store)); } catch { /* storage full — fail silent */ }
}

/** One-time move of the old single-universe key into the multi-world store. */
function migrateLegacy(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const u = JSON.parse(raw) as Universe;
    if (u?.graph?.clusters && u.id) {
      const cur = localStorage.getItem(KEY_WORLDS);
      const store = cur ? (JSON.parse(cur) as Record<string, Universe>) : {};
      if (!store[u.id]) { store[u.id] = u; localStorage.setItem(KEY_WORLDS, JSON.stringify(store)); }
      if (!localStorage.getItem(KEY_CURRENT)) localStorage.setItem(KEY_CURRENT, u.id);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}

/** The world the user was last in (or null on a fresh browser). */
export function loadUniverse(): Universe | null {
  try {
    const store = readStore();
    const id = localStorage.getItem(KEY_CURRENT);
    const u = (id && store[id]) || null;
    return u?.graph?.clusters ? u : null;
  } catch {
    return null;
  }
}

/** Save a world locally and mark it current. Never touches other worlds. */
export function saveUniverse(u: Universe): void {
  try {
    const store = readStore();
    store[u.id] = { ...u, updatedAt: now() };
    writeStore(store);
    localStorage.setItem(KEY_CURRENT, u.id);
  } catch { /* fail silent */ }
}

/** Leave the current world WITHOUT deleting anything — the cold-start screen shows all worlds. */
export function leaveUniverse(): void {
  try { localStorage.removeItem(KEY_CURRENT); } catch { /* ignore */ }
}

/** Re-key a world after the first cloud push assigns its server uuid. */
function rekeyLocal(oldId: string, newId: string): void {
  try {
    const store = readStore();
    const u = store[oldId];
    if (!u) return;
    delete store[oldId];
    store[newId] = { ...u, id: newId };
    writeStore(store);
    if (localStorage.getItem(KEY_CURRENT) === oldId) localStorage.setItem(KEY_CURRENT, newId);
  } catch { /* ignore */ }
}

function localMetas(): WorldMeta[] {
  const store = readStore();
  return Object.values(store).map((u) => ({
    id: u.id, title: u.title, createdAt: u.createdAt, updatedAt: u.updatedAt,
    local: true, remote: false, clusterCount: u.graph.clusters.length,
  }));
}

/** Human "last seen" string for the welcome-back line. */
export function lastSeen(u: { updatedAt: string }): string {
  try {
    const ms = Date.now() - new Date(u.updatedAt).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  } catch {
    return 'earlier';
  }
}

// ---------------------------------------------------------------------------
// Supabase sync (best-effort; the local store is always the safety net)
// ---------------------------------------------------------------------------

async function sessionUserId(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch { return null; }
}

let syncing = false;
let pending: Universe | null = null;

/**
 * Push a world to Supabase. Returns the world's server id (a uuid — the caller should adopt it via
 * saveUniverse if it differs from u.id), or null when sync isn't possible (offline / signed out).
 * Guarded: one push in flight; a save arriving mid-push runs after (latest wins).
 */
export async function syncUniverse(u: Universe): Promise<string | null> {
  const uid = await sessionUserId();
  if (!uid) return null;
  if (syncing) { pending = u; return null; }
  syncing = true;
  try {
    // 1. the world row (insert on first push; the touch trigger keeps updated_at fresh on update)
    let worldId = isWorldUuid(u.id) ? u.id : null;
    if (worldId) {
      const { error } = await supabase.from('knowledge_worlds')
        .update({ title: u.title, focus_slug: u.focusId }).eq('id', worldId);
      if (error) return null;
    } else {
      const { data, error } = await supabase.from('knowledge_worlds')
        .insert({ owner_id: uid, title: u.title, focus_slug: u.focusId }).select('id').single();
      if (error || !data) return null;
      worldId = data.id as string;
      rekeyLocal(u.id, worldId);
    }

    // 2. reuse existing row ids so saves UPDATE instead of duplicating
    const { data: exClusters } = await supabase.from('knowledge_clusters').select('id, slug, charter').eq('world_id', worldId);
    const ids = new Map<string, string>((exClusters ?? []).map((r) => [r.slug as string, r.id as string]));
    const exClusterIds = (exClusters ?? []).map((r) => r.id as string);
    if (exClusterIds.length) {
      const { data: exArts } = await supabase.from('knowledge_artifacts').select('id, cluster_id, slug').in('cluster_id', exClusterIds);
      const slugByClusterId = new Map((exClusters ?? []).map((r) => [r.id as string, r.slug as string]));
      for (const a of exArts ?? []) {
        const cs = slugByClusterId.get(a.cluster_id as string);
        if (cs && a.slug) ids.set(`${cs}\n${a.slug}`, a.id as string);
      }
    }
    const idFor = (key: string): string => {
      let id = ids.get(key);
      if (!id) { id = crypto.randomUUID(); ids.set(key, id); }
      return id;
    };

    const rows = graphToRows(u.graph, worldId, uid, idFor);

    // 3. clusters first WITHOUT parent_id (a child can arrive before its parent), then set parents
    const { error: cErr } = await supabase.from('knowledge_clusters')
      .upsert(rows.clusters.map((c) => ({ ...c, parent_id: null })), { onConflict: 'world_id,slug' });
    if (cErr) return null;
    const withParent = rows.clusters.filter((c) => c.parent_id);
    if (withParent.length) {
      await supabase.from('knowledge_clusters')
        .upsert(withParent, { onConflict: 'world_id,slug' });
    }
    // drop clusters whose thread was folded away (dedupe) — cascade cleans their edges/artifacts.
    // GUARD: chartered clusters are production areas that may exist only server-side (instantiated
    // webs, studios); they are NEVER stale-deleted by a thought-graph sync (deletableStaleClusters).
    const stale = deletableStaleClusters(
      (exClusters ?? []).map((r) => ({ id: r.id as string, charter: (r as { charter?: unknown }).charter ?? null })),
      rows.clusters.map((c) => c.id),
    );
    if (stale.length) await supabase.from('knowledge_clusters').delete().in('id', stale);

    // 4. edges have no client identity — replace the set (small)
    await supabase.from('knowledge_cluster_edges').delete().eq('world_id', worldId);
    if (rows.edges.length) await supabase.from('knowledge_cluster_edges').insert(rows.edges);

    // 5. artifacts upsert by (cluster_id, slug)
    if (rows.artifacts.length) {
      await supabase.from('knowledge_artifacts').upsert(rows.artifacts, { onConflict: 'cluster_id,slug' });
    }
    return worldId;
  } catch {
    return null; // best-effort: local store already has it
  } finally {
    syncing = false;
    if (pending) { const nxt = pending; pending = null; void syncUniverse(nxt); }
  }
}

/** All worlds, local + cloud merged by id (cloud metadata wins; `local`/`remote` flags kept). */
export async function listWorlds(): Promise<WorldMeta[]> {
  const merged = new Map<string, WorldMeta>(localMetas().map((m) => [m.id, m]));
  const uid = await sessionUserId();
  if (uid) {
    try {
      const { data } = await supabase.from('knowledge_worlds')
        .select('id, title, created_at, updated_at')
        .order('updated_at', { ascending: false }).limit(50);
      for (const w of data ?? []) {
        const prev = merged.get(w.id as string);
        merged.set(w.id as string, {
          id: w.id as string, title: (w.title as string) ?? 'Untitled world',
          createdAt: w.created_at as string, updatedAt: w.updated_at as string,
          local: prev?.local ?? false, remote: true, clusterCount: prev?.clusterCount,
        });
      }
    } catch { /* offline — local list stands */ }
  }
  return [...merged.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Open a world: local store first (instant), else pull it from Supabase and cache it locally. */
export async function loadWorld(id: string): Promise<Universe | null> {
  const store = readStore();
  if (store[id]?.graph?.clusters) {
    try { localStorage.setItem(KEY_CURRENT, id); } catch { /* ignore */ }
    return store[id];
  }
  const uid = await sessionUserId();
  if (!uid || !isWorldUuid(id)) return null;
  try {
    const [{ data: world }, { data: clusters }] = await Promise.all([
      supabase.from('knowledge_worlds').select('id, title, focus_slug, created_at, updated_at').eq('id', id).single(),
      supabase.from('knowledge_clusters').select('id, owner_id, world_id, parent_id, slug, title, summary, trajectory, kind, maturity, salience, turn_refs').eq('world_id', id),
    ]);
    if (!world || !clusters) return null;
    const clusterIds = clusters.map((c) => c.id as string);
    const [{ data: edges }, { data: artifacts }] = await Promise.all([
      supabase.from('knowledge_cluster_edges').select('owner_id, world_id, source_id, target_id, type').eq('world_id', id),
      clusterIds.length
        ? supabase.from('knowledge_artifacts').select('id, owner_id, cluster_id, slug, kind, title, detail, url, thumb, source').in('cluster_id', clusterIds).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as ArtifactRow[] }),
    ]);
    const graph = rowsToGraph(clusters as unknown as ClusterRow[], (edges ?? []) as unknown as EdgeRow[], (artifacts ?? []) as unknown as ArtifactRow[]);
    if (!graph.clusters.length) return null;
    const focusSlug = (world.focus_slug as string | null) ?? null;
    const u: Universe = {
      id, title: (world.title as string) ?? 'Untitled world', graph,
      focusId: focusSlug && graph.clusters.some((c) => c.id === focusSlug) ? focusSlug : graph.clusters.find((c) => !c.parentId)?.id ?? null,
      createdAt: world.created_at as string, updatedAt: world.updated_at as string,
    };
    saveUniverse(u);
    return u;
  } catch {
    return null;
  }
}
