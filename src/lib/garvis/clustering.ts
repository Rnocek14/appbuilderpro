// src/lib/garvis/clustering.ts
// SPIKE — the go/no-go gate for the Knowledge Universe (Worlds → Clusters → Artifacts → Workflows).
// It proves the one thing the whole vision rests on: can we turn a free-flowing conversation into a
// STABLE, well-shaped cluster graph? In-memory only, no Supabase, no UI polish. Two questions, and
// the second is the usual killer:
//   1. one-shot QUALITY      — right granularity, sensible parents, meaningful cross-links, salience
//   2. incremental STABILITY — adding turns EXTENDS the map instead of reshuffling/renaming it
//
// Research that shaped this (see the design notes in the PR / memory):
//   • Obsidian's global graph fails because it's a flat "hairball" with no hierarchy and no way to
//     tell an important node from a trivial one → we carry HIERARCHY (parentId) + SALIENCE.
//   • GraphRAG builds a hierarchy of communities, each summarized at a level → we mirror that with
//     nested clusters + per-cluster summaries (the basis of semantic zoom later).
//   • Stable incremental clustering = match new content to an existing cluster within a similarity
//     threshold, never re-partition old data → canonicalizeAgainstPrev + parent-frozen mergeGraphs.
//   • Dialogue topic segmentation = find natural topic-shift boundaries first → the prompt segments
//     before it structures.
//
// Convention mirrors the rest of garvis/: this module is the PURE half (types, prompt builders,
// tolerant parsers, deterministic guards) — LLM-free, Supabase-free, unit-tested in
// clustering.verify.ts. The thin impure half (clusterConversation / extendClusters) lives in
// clusteringRun.ts, exactly like marketing.ts / marketingRun.ts.

export type ClusterKind = 'topic' | 'question' | 'idea' | 'investigation' | 'artifact' | 'project';
export type EdgeType = 'relates' | 'leads_to' | 'contradicts' | 'supports';

// A concrete OUTPUT produced or referenced in the conversation — the "nothing gets lost" promise.
// Lives ON the cluster it belongs to, so a generated image / video concept / diagram / research
// finding / document is always one hop from the idea that spawned it.
export type ArtifactKind = 'image' | 'video' | 'diagram' | 'research' | 'doc' | 'link' | 'post' | 'data';
export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  detail?: string;       // the prompt/script/finding/body — the actual content
  source?: string;       // 'conversation' | 'generated' | 'wikipedia' | a provider name
  url?: string;          // real link (image file, YouTube video, article) when fetched from the web
  thumb?: string;        // thumbnail image url for media artifacts
}

// A cluster is a "living thought": its maturity reflects how it behaves over time, not just a status.
export type ClusterMaturity = 'spark' | 'growing' | 'mature' | 'building' | 'finished' | 'dormant' | 'archived';

export interface Cluster {
  id: string;            // stable kebab-case slug; REUSED + canonicalized across incremental runs
  parentId: string | null;
  title: string;
  summary: string;
  kind: ClusterKind;
  salience: number;      // 0..1 — how central this thread is (core vs trivia). Drives DOI/zoom later.
  maturity: ClusterMaturity;
  trajectory?: string;   // "where is it going" — the forward-looking line that makes it a companion
  turnRefs: number[];    // indices of the conversation turns that fed this cluster ("ideas")
  artifacts: Artifact[]; // media / results / docs attached to this thread
}

// A high-"scent" next dive (information-foraging trigger). The engine of the rabbit hole — each is a
// one-click descent into a related subject, a provocative question, or a surprising tangent.
// `tease` is the scent payload (Pirolli & Card: proximal cues drive the pursue/skip decision) — one
// whispered line about what's behind the door, always withheld, never a spoiler.
export type LeadKind = 'dig' | 'question' | 'tangent';
export interface Lead { label: string; kind: LeadKind; tease?: string }
export interface ClusterEdge {
  sourceId: string;
  targetId: string;
  type: EdgeType;
}
export interface ClusterGraph {
  clusters: Cluster[];
  edges: ClusterEdge[];
}

export interface Turn { i: number; role: 'user' | 'assistant'; text: string }

export interface RawGraph { clusters?: unknown[]; edges?: unknown[] }

const KINDS: ClusterKind[] = ['topic', 'question', 'idea', 'investigation', 'artifact', 'project'];
const EDGE_TYPES: EdgeType[] = ['relates', 'leads_to', 'contradicts', 'supports'];
const MATURITIES: ClusterMaturity[] = ['spark', 'growing', 'mature', 'building', 'finished', 'dormant', 'archived'];
const ARTIFACT_KINDS: ArtifactKind[] = ['image', 'video', 'diagram', 'research', 'doc', 'link', 'post', 'data'];

/** Parse + sanitize the artifacts array on a cluster. */
function parseArtifacts(raw: unknown): Artifact[] {
  if (!Array.isArray(raw)) return [];
  const out: Artifact[] = [];
  const seen = new Set<string>();
  for (const a of raw as Record<string, unknown>[]) {
    const title = typeof a?.title === 'string' ? a.title.trim() : '';
    if (!title) continue;
    let id = typeof a?.id === 'string' && a.id.trim() ? slugify(a.id) : slugify(title);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    out.push({
      id,
      kind: ARTIFACT_KINDS.includes(a?.kind as ArtifactKind) ? (a.kind as ArtifactKind) : 'doc',
      title,
      detail: typeof a?.detail === 'string' ? a.detail.trim() : undefined,
      source: typeof a?.source === 'string' ? a.source.trim() : 'conversation',
      url: typeof a?.url === 'string' ? a.url.trim() : undefined,
      thumb: typeof a?.thumb === 'string' ? a.thumb.trim() : undefined,
    });
  }
  return out;
}

/** Union two artifact lists by id (used when folding clusters). */
function mergeArtifacts(a: Artifact[], b: Artifact[]): Artifact[] {
  const byId = new Map(a.map((x) => [x.id, x]));
  for (const x of b) if (!byId.has(x.id)) byId.set(x.id, x);
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// PURE helpers (LLM-free, deterministic, tested by clustering.verify.ts)
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'node'
  );
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'this', 'that', 'how', 'why', 'what']);

/** Content tokens of a title (lowercased, stopwords dropped) — for cheap lexical matching. */
export function titleTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/**
 * Lexical similarity of two titles in [0,1]. Combines Jaccard over content tokens with a strong
 * substring-containment signal ("information paradox" ⊂ "the information paradox"). This is the
 * cheap, dependency-free first cut at entity resolution; embeddings are the production upgrade.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter); // Jaccard
}

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(1, v));
}

/**
 * Normalize a raw model graph into a valid ClusterGraph. Fails SOFT (garbage → empty graph):
 * - assigns/repairs ids (slug of title; dedupes collisions deterministically)
 * - drops clusters with no title; clamps kind/edge-type/salience to valid ranges
 * - repairs dangling parentId → null (multiple roots allowed); breaks parent self-loops
 * - drops edges that are self-loops, duplicated, or point at a missing node
 */
export function normalizeGraph(raw: RawGraph): ClusterGraph {
  const rawClusters = Array.isArray(raw?.clusters) ? raw.clusters : [];
  const seen = new Set<string>();
  const clusters: Cluster[] = [];
  for (const c of rawClusters as Record<string, unknown>[]) {
    const title = typeof c?.title === 'string' ? c.title.trim() : '';
    if (!title) continue;
    let id = typeof c?.id === 'string' && c.id.trim() ? slugify(c.id) : slugify(title);
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    clusters.push({
      id,
      parentId: typeof c?.parentId === 'string' && c.parentId.trim() ? slugify(c.parentId) : null,
      title,
      summary: typeof c?.summary === 'string' ? c.summary.trim() : '',
      kind: KINDS.includes(c?.kind as ClusterKind) ? (c.kind as ClusterKind) : 'topic',
      salience: clamp01(c?.salience, 0.5),
      maturity: MATURITIES.includes(c?.maturity as ClusterMaturity) ? (c.maturity as ClusterMaturity) : 'growing',
      trajectory: typeof c?.trajectory === 'string' && c.trajectory.trim() ? c.trajectory.trim() : undefined,
      turnRefs: Array.isArray(c?.turnRefs)
        ? ((c.turnRefs as unknown[]).filter((n) => typeof n === 'number') as number[])
        : [],
      artifacts: parseArtifacts(c?.artifacts),
    });
  }
  const ids = new Set(clusters.map((c) => c.id));
  for (const c of clusters) {
    if (c.parentId === c.id) c.parentId = null;            // self-parent
    if (c.parentId && !ids.has(c.parentId)) c.parentId = null; // dangling
  }

  const rawEdges = Array.isArray(raw?.edges) ? raw.edges : [];
  const edges: ClusterEdge[] = [];
  const edgeSeen = new Set<string>();
  for (const e of rawEdges as Record<string, unknown>[]) {
    const s = typeof e?.sourceId === 'string' ? slugify(e.sourceId) : '';
    const t = typeof e?.targetId === 'string' ? slugify(e.targetId) : '';
    if (!s || !t || s === t || !ids.has(s) || !ids.has(t)) continue;
    const type = EDGE_TYPES.includes(e?.type as EdgeType) ? (e.type as EdgeType) : 'relates';
    const key = `${s}|${t}|${type}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ sourceId: s, targetId: t, type });
  }
  return { clusters, edges };
}

const MERGE_THRESHOLD = 0.6; // lexical-similarity cutoff for "these two titles are the same thread"

/** Union turnRefs + artifacts, prefer the richer summary, keep the higher salience. */
function foldCluster(keep: Cluster, drop: Cluster): Cluster {
  return {
    ...keep,
    summary: keep.summary.length >= drop.summary.length ? keep.summary : drop.summary,
    salience: Math.max(keep.salience, drop.salience),
    turnRefs: [...new Set([...keep.turnRefs, ...drop.turnRefs])].sort((a, b) => a - b),
    artifacts: mergeArtifacts(keep.artifacts, drop.artifacts),
  };
}

/**
 * Collapse near-duplicate clusters WITHIN one graph (model emitted "Black holes" and "Black hole"
 * as two nodes). The earlier/ higher-salience node wins its id; edges/parents are remapped.
 */
export function dedupeClusters(g: ClusterGraph): ClusterGraph {
  const kept: Cluster[] = [];
  const remap = new Map<string, string>(); // droppedId -> keptId
  for (const c of g.clusters) {
    const match = kept.find((k) => titleSimilarity(k.title, c.title) >= MERGE_THRESHOLD);
    if (match) {
      const idx = kept.indexOf(match);
      kept[idx] = foldCluster(match, c);
      remap.set(c.id, match.id);
    } else {
      kept.push(c);
    }
  }
  const resolve = (id: string | null) => (id && remap.get(id)) || id;
  for (const c of kept) c.parentId = resolve(c.parentId);
  const edges = g.edges.map((e) => ({ ...e, sourceId: resolve(e.sourceId)!, targetId: resolve(e.targetId)! }));
  return normalizeGraph({ clusters: kept, edges });
}

/**
 * STABILITY RAIL #1 (entity resolution): remap the model's NEW clusters onto EXISTING ids when they
 * clearly describe the same thread (reworded title). This is the research-backed "match to an
 * existing cluster within a threshold instead of spawning a new one." Without it, the model
 * rewording "Information paradox" → "The information-loss problem" silently forks the thread.
 */
export function canonicalizeAgainstPrev(prev: ClusterGraph, next: ClusterGraph): ClusterGraph {
  const prevById = new Map(prev.clusters.map((c) => [c.id, c]));
  const remap = new Map<string, string>();
  for (const c of next.clusters) {
    if (prevById.has(c.id)) continue; // already anchored by id — good
    let best: { id: string; score: number } | null = null;
    for (const p of prev.clusters) {
      const score = titleSimilarity(p.title, c.title);
      if (score >= MERGE_THRESHOLD && (!best || score > best.score)) best = { id: p.id, score };
    }
    if (best) remap.set(c.id, best.id);
  }
  return applyIdRemap(next, remap);
}

/**
 * Apply an id remap (oldId → newId) to a graph, FOLDING any clusters that now collide (the reworded
 * node onto its prior twin) instead of letting normalizeGraph suffix it to "-2". Shared by the
 * lexical (canonicalizeAgainstPrev) and embedding-based stability paths.
 */
export function applyIdRemap(g: ClusterGraph, remap: Map<string, string>): ClusterGraph {
  if (!remap.size) return g;
  const resolve = (id: string | null) => (id && remap.get(id)) || id;
  const byId = new Map<string, Cluster>();
  for (const c of g.clusters) {
    const remapped: Cluster = { ...c, id: resolve(c.id)!, parentId: resolve(c.parentId) };
    const existing = byId.get(remapped.id);
    byId.set(remapped.id, existing ? foldCluster(existing, remapped) : remapped);
  }
  const edges = g.edges.map((e) => ({ ...e, sourceId: resolve(e.sourceId)!, targetId: resolve(e.targetId)! }));
  return normalizeGraph({ clusters: [...byId.values()], edges });
}

/**
 * STABILITY RAIL #2 (no silent loss + frozen structure): merge an incremental result into the prior
 * map. The prompt ASKS the model to be stable; this ENFORCES it regardless of what came back:
 *   - every prior cluster survives (re-added if the model dropped it)
 *   - a persisted cluster KEEPS ITS PRIOR PARENT — existing structure is frozen so the map never
 *     reshuffles under the user; only genuinely new clusters get placed. (Content — title/summary/
 *     salience — is allowed to refresh; only the parent/identity is locked.)
 * Run canonicalizeAgainstPrev first so reworded clusters are already anchored to their prior ids.
 */
export function mergeGraphs(prev: ClusterGraph, next: ClusterGraph): ClusterGraph {
  const prevById = new Map(prev.clusters.map((c) => [c.id, c]));
  const out = new Map<string, Cluster>();
  for (const c of next.clusters) {
    const prior = prevById.get(c.id);
    out.set(
      c.id,
      prior
        ? {
            ...c,
            parentId: prior.parentId, // FREEZE structure
            turnRefs: [...new Set([...prior.turnRefs, ...c.turnRefs])].sort((a, b) => a - b),
            artifacts: mergeArtifacts(prior.artifacts, c.artifacts), // never drop a prior artifact
          }
        : c,
    );
  }
  for (const c of prev.clusters) if (!out.has(c.id)) out.set(c.id, c);
  return normalizeGraph({ clusters: [...out.values()], edges: [...prev.edges, ...next.edges] });
}

export interface StabilityReport {
  prevCount: number;
  persisted: number;       // ids present in BOTH prev and next (after canonicalization)
  added: string[];         // ids new in next
  dropped: string[];       // prev ids the model omitted (mergeGraphs RE-ADDS these)
  reparented: string[];    // persisted ids the model TRIED to re-home (mergeGraphs FREEZES these)
  renamedAnchored: number; // reworded dupes snapped back onto a prior id by canonicalization
  persistedPct: number;    // persisted / prevCount  (1 = perfectly stable)
}

/** Compare a model's raw incremental graph against the previous one. Pure. Pass the CANONICALIZED
 *  next so "reworded → snapped to prior id" counts as persisted, not as drop+add. */
export function stabilityReport(prev: ClusterGraph, canonicalizedNext: ClusterGraph, renamedAnchored = 0): StabilityReport {
  const prevById = new Map(prev.clusters.map((c) => [c.id, c]));
  const nextIds = new Set(canonicalizedNext.clusters.map((c) => c.id));
  const added = canonicalizedNext.clusters.filter((c) => !prevById.has(c.id)).map((c) => c.id);
  const dropped = prev.clusters.filter((c) => !nextIds.has(c.id)).map((c) => c.id);
  let persisted = 0;
  const reparented: string[] = [];
  for (const c of canonicalizedNext.clusters) {
    const p = prevById.get(c.id);
    if (!p) continue;
    persisted++;
    if ((p.parentId ?? null) !== (c.parentId ?? null)) reparented.push(c.id);
  }
  return {
    prevCount: prev.clusters.length,
    persisted,
    added,
    dropped,
    reparented,
    renamedAnchored,
    persistedPct: prev.clusters.length ? persisted / prev.clusters.length : 1,
  };
}

export interface RelatedCluster { id: string; score: number; reason: 'linked' | 'sibling' | 'similar' }

/**
 * "Similar ideas" for a focus cluster, by combining structure (edges, siblings) with lexical title
 * similarity. Pure + cheap; the impure layer can REPLACE the lexical term with embedding cosine for
 * cross-domain matches ("information networks" in physics vs hyperlocal news). Excludes self, direct
 * parent, and direct children (those are already shown by the navigation).
 */
export function relatedClusters(
  g: ClusterGraph,
  focusId: string,
  opts?: { limit?: number; similarity?: (a: string, b: string) => number },
): RelatedCluster[] {
  const focus = g.clusters.find((c) => c.id === focusId);
  if (!focus) return [];
  const sim = opts?.similarity ?? titleSimilarity;
  const limit = opts?.limit ?? 6;
  const childIds = new Set(g.clusters.filter((c) => c.parentId === focusId).map((c) => c.id));
  const linked = new Set<string>();
  for (const e of g.edges) {
    if (e.sourceId === focusId) linked.add(e.targetId);
    if (e.targetId === focusId) linked.add(e.sourceId);
  }
  const out: RelatedCluster[] = [];
  for (const c of g.clusters) {
    if (c.id === focusId || c.id === focus.parentId || childIds.has(c.id)) continue;
    const s = sim(focus.title, c.title);
    if (linked.has(c.id)) out.push({ id: c.id, score: 1, reason: 'linked' });
    else if (focus.parentId && c.parentId === focus.parentId) out.push({ id: c.id, score: 0.5 + 0.5 * s, reason: 'sibling' });
    else if (s >= 0.3) out.push({ id: c.id, score: s, reason: 'similar' });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------------------
// CLEAN BRANCHING — accumulate → promote → split-on-substructure → never reshuffle.
// All pure + deterministic: the model proposes subgroups/cohesion; THESE gates decide, with
// hysteresis, so branching can't flicker into a hairball. (Evolutionary-clustering "history cost"
// + classic split-on-cohesion criterion.)
// ---------------------------------------------------------------------------

export interface BranchConfig {
  minSpawn: number;       // loose ideas that must cohere before a cluster is born
  spawnCohesion: number;  // how tight that little group must be (0..1)
  splitSize: number;      // a cluster only considers splitting past ~7±2 ideas
  splitCohesion: number;  // a subgroup only counts if it's internally cohesive (0..1)
  minSubgroups: number;   // need real sub-structure (≥2 cohesive subgroups), not just size
  hysteresis: number;     // condition must hold this many updates before we act (no flicker)
}
export const BRANCH_DEFAULTS: BranchConfig = {
  minSpawn: 2, spawnCohesion: 0.6, splitSize: 7, splitCohesion: 0.5, minSubgroups: 2, hysteresis: 2,
};

/** Gravity: should a coherent little group of loose thoughts become a cluster? */
export function shouldSpawnCluster(group: { size: number; cohesion: number }, cfg: BranchConfig = BRANCH_DEFAULTS): boolean {
  return group.size >= cfg.minSpawn && group.cohesion >= cfg.spawnCohesion;
}

export interface SubgroupStat { size: number; cohesion: number }
/**
 * Split a cluster into branches ONLY when it's big AND has real sub-structure AND that has held
 * stable (hysteresis). A big-but-coherent topic stays a single node. This is what keeps branching
 * clean instead of exploding.
 */
export function shouldSplit(
  input: { ideas: number; subgroups: SubgroupStat[]; heldFor: number },
  cfg: BranchConfig = BRANCH_DEFAULTS,
): boolean {
  if (input.ideas <= cfg.splitSize) return false;
  const strong = input.subgroups.filter((s) => s.size >= 2 && s.cohesion >= cfg.splitCohesion);
  if (strong.length < cfg.minSubgroups) return false;
  return input.heldFor >= cfg.hysteresis;
}

/**
 * Apply a split: add child branches UNDER the cluster (structure is only ever ADDED, never the spine
 * reshuffled) and distribute the parent's ideas into them. The parent stays the umbrella. Pure.
 */
export function splitCluster(graph: ClusterGraph, parentId: string, groups: { title: string; turnRefs: number[] }[]): ClusterGraph {
  const parent = graph.clusters.find((c) => c.id === parentId);
  if (!parent || groups.length < 2) return graph;
  const existing = new Set(graph.clusters.map((c) => c.id));
  const children: Cluster[] = groups.map((g) => {
    let id = slugify(g.title);
    while (existing.has(id)) id = `${id}-2`;
    existing.add(id);
    return {
      id, parentId, title: g.title, summary: '', kind: 'topic' as ClusterKind,
      salience: Math.max(0.3, parent.salience * 0.85), maturity: 'growing' as ClusterMaturity,
      turnRefs: [...new Set(g.turnRefs)].sort((a, b) => a - b), artifacts: [],
    };
  });
  return normalizeGraph({ clusters: [...graph.clusters, ...children], edges: graph.edges });
}

/** Visual "pressure" 0..1 — how full a cluster feels relative to its split point. Drives the fill
 *  bar that makes a split feel inevitable rather than random. Children relieve pressure. */
export function pressure(c: Cluster, childCount = 0, cfg: BranchConfig = BRANCH_DEFAULTS): number {
  if (childCount >= cfg.minSubgroups) return 0; // already branched — no pressure
  return Math.max(0, Math.min(1, c.turnRefs.length / cfg.splitSize));
}

/** Add ONE child branch under a cluster (a lead dive). Pure; only ADDS — never reshuffles. */
export function addChild(graph: ClusterGraph, parentId: string, opts: { title: string; kind?: ClusterKind }): { graph: ClusterGraph; id: string } {
  const parent = graph.clusters.find((c) => c.id === parentId);
  if (!parent) return { graph, id: '' };
  const existing = new Set(graph.clusters.map((c) => c.id));
  let id = slugify(opts.title);
  while (existing.has(id)) id = `${id}-2`;
  const child: Cluster = {
    id, parentId, title: opts.title, summary: '', kind: opts.kind ?? 'topic',
    salience: Math.max(0.3, parent.salience * 0.85), maturity: 'spark', turnRefs: [], artifacts: [],
  };
  return { graph: normalizeGraph({ clusters: [...graph.clusters, child], edges: graph.edges }), id };
}

/**
 * Derive a "living thought" maturity from a cluster's signals. Pure (recency is passed in, not read
 * from the clock, so it's testable). Precedence: explicit end states first, then activity level.
 */
export function deriveMaturity(s: { ideas: number; children: number; artifacts: number; finished?: boolean; idle?: boolean }): ClusterMaturity {
  if (s.finished) return 'finished';
  if (s.idle) return 'dormant';
  if (s.children >= 2 && s.artifacts >= 2) return 'building';   // actively producing across branches
  if (s.children >= 2 || s.ideas >= 7) return 'mature';
  if (s.ideas >= 3 || s.artifacts >= 1) return 'growing';
  return 'spark';
}

// ---------------------------------------------------------------------------
// THE CONNECTION ENGINE — the moat. Links the focused idea to OTHER parts of YOUR universe (not the
// obvious parent/children/siblings — the distant branches), which is the thing a stateless chatbot
// structurally cannot do. Gets more valuable the bigger your universe grows.
// ---------------------------------------------------------------------------

export interface UniverseConnection { id: string; score: number; crossWorld: boolean }

/** Connections from the focus to DISTANT parts of the universe (excludes its own family). Pure;
 *  pass an embedding-backed `similarity` for true cross-domain links, else lexical. */
export function universeConnections(g: ClusterGraph, focusId: string, opts?: { limit?: number; similarity?: (a: string, b: string) => number; min?: number }): UniverseConnection[] {
  const byId = new Map(g.clusters.map((c) => [c.id, c]));
  const focus = byId.get(focusId);
  if (!focus) return [];
  const sim = opts?.similarity ?? titleSimilarity;
  const limit = opts?.limit ?? 6;
  const min = opts?.min ?? 0.22;
  const fam = new Set<string>([focusId]);
  for (let cur = focus.parentId, gd = 0; cur && gd < 64; gd++) { fam.add(cur); cur = byId.get(cur)?.parentId ?? null; } // ancestors
  const stack = [focusId]; // descendants
  while (stack.length) { const id = stack.pop()!; for (const c of g.clusters) if (c.parentId === id && !fam.has(c.id)) { fam.add(c.id); stack.push(c.id); } }
  if (focus.parentId) for (const c of g.clusters) if (c.parentId === focus.parentId) fam.add(c.id); // siblings
  const rootOf = (id: string): string => { let c = id, p = byId.get(id)?.parentId ?? null, gd = 0; while (p && gd++ < 64) { c = p; p = byId.get(p)?.parentId ?? null; } return c; };
  const fRoot = rootOf(focusId);
  const out: UniverseConnection[] = [];
  for (const c of g.clusters) {
    if (fam.has(c.id)) continue;
    const crossWorld = rootOf(c.id) !== fRoot;
    const score = sim(focus.title, c.title) + (crossWorld ? 0.12 : 0);
    if (score >= min) out.push({ id: c.id, score, crossWorld });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// A surprising, non-obvious bridge between the focus and ANOTHER idea in the user's universe.
export const BRIDGE_SYSTEM = `You find a SURPRISING, non-obvious connection between the idea the user
is on and something ELSE they've already explored. Given the current idea and a list of other ideas
in their universe, pick the ONE that connects in a genuinely illuminating, "wait — these are the same
shape!" way (ideally a DIFFERENT domain — e.g. "human memory reconstructs like distributed databases
replicate"). Output EXACTLY ONE JSON object, no prose:
{"title":"<the exact title from the list>","why":"<one vivid sentence naming the surprising link>"}
If nothing genuinely connects, output {"title":"","why":""}.`;

export function buildBridgeUser(focus: Cluster, others: string[]): string {
  return [
    `CURRENT IDEA: ${focus.title}`,
    focus.summary ? `(${focus.summary})` : '',
    'OTHER IDEAS IN THEIR UNIVERSE:',
    others.map((t) => `- ${t}`).join('\n'),
    'Pick the most surprising, illuminating connection. Return the JSON.',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// INVESTIGATION — AI as reasoning, not retrieval. Decompose a question into the angles a sharp
// analyst would pursue, investigate each IN PARALLEL (you watch them light up), then SYNTHESIZE a
// verdict. This is the leap from "display an answer" to "make thinking visible" (the Jarvis moment).
// ---------------------------------------------------------------------------

export const DECOMPOSE_SYSTEM = `You are a brilliant analyst breaking a question/topic into the ANGLES
you'd actually investigate to understand or answer it well. Pick the 4-6 most illuminating angles for
THIS question — drawn from things like: the core mechanism, what the evidence shows, the strongest
counter-argument, the economics/tradeoffs, precedent & real examples, second-order effects, who
disagrees and why. Each angle gets a short, specific title (a mini-question or claim, not a category).
Output EXACTLY ONE JSON object: {"angles":[{"title":"…"}]}`;

export function buildDecomposeUser(focus: Cluster): string {
  return [`QUESTION / TOPIC: ${focus.title}`, focus.summary ? `(${focus.summary})` : '', 'Give the angles to investigate. Return the JSON.'].filter(Boolean).join('\n');
}

export const ANGLE_SYSTEM = `You are ONE investigator on an analyst team, assigned a single angle of a
larger question. Investigate ONLY your angle: 3-4 tight, specific, evidence-minded sentences that take
a clear stance (not wishy-washy). Plain prose, no preamble, no headers.`;

export function buildAngleUser(question: string, angle: string): string {
  return `OVERALL QUESTION: ${question}\nYOUR ANGLE: ${angle}\n\nInvestigate your angle now.`;
}

export const SYNTHESIZE_SYSTEM = `You are the LEAD analyst synthesizing your team's findings into a
conclusion. Output plain prose in this shape (no markdown headers):
- A one-sentence VERDICT (take a real position).
- 2-3 sentences weaving the findings into WHY.
- A confidence read in plain words (e.g. "fairly confident", "genuinely uncertain") and the single
  strongest objection / what would change the verdict.`;

export function buildSynthesizeUser(focus: Cluster, findings: { title: string; finding: string }[]): string {
  return [
    `QUESTION: ${focus.title}`,
    'YOUR TEAM\'S FINDINGS:',
    findings.map((f) => `• ${f.title}: ${f.finding}`).join('\n'),
    '\nSynthesize the verdict now.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// ANTICIPATORY / PROACTIVE — Garvis notices things you didn't ask for: recurring themes in HOW you
// think, surprising connections, "you should see this." Calm, peripheral. The Jarvis "ahead of you".
// ---------------------------------------------------------------------------

export const THEME_SYSTEM = `You spot the recurring intellectual THEME in how someone explores. Given a
list of ideas they've explored, find ONE underlying theme that quietly connects SEVERAL of them —
ideally across DIFFERENT domains (e.g. "information moving through systems" connecting physics, AI
memory, and local news). Output EXACTLY ONE JSON object: {"theme":"<short phrase>","members":["<the
exact titles that share it>"]}. Only if there's a GENUINE recurring thread (3+ ideas); otherwise
output {"theme":"","members":[]}.`;

export function buildThemeUser(titles: string[]): string {
  return `IDEAS THEY'VE EXPLORED:\n${titles.map((t) => `- ${t}`).join('\n')}\n\nWhat recurring theme connects several of these? Return the JSON.`;
}

export interface GraphStats { nodes: number; edges: number; roots: number; maxDepth: number; orphans: number; avgSalience: number; artifacts: number }

/** Shape metrics for the spike's "model card" — quick eyeball of granularity/connectedness. */
export function graphStats(g: ClusterGraph): GraphStats {
  const byId = new Map(g.clusters.map((c) => [c.id, c]));
  const hasChild = new Set(g.clusters.filter((c) => c.parentId).map((c) => c.parentId as string));
  const inEdge = new Set<string>();
  for (const e of g.edges) { inEdge.add(e.sourceId); inEdge.add(e.targetId); }
  const depthOf = (c: Cluster, guard = 0): number => {
    if (!c.parentId || guard > 64) return 0;
    const p = byId.get(c.parentId);
    return p ? 1 + depthOf(p, guard + 1) : 0;
  };
  return {
    nodes: g.clusters.length,
    edges: g.edges.length,
    roots: g.clusters.filter((c) => !c.parentId).length,
    maxDepth: g.clusters.reduce((m, c) => Math.max(m, depthOf(c)), 0),
    orphans: g.clusters.filter((c) => !c.parentId && !hasChild.has(c.id) && !inEdge.has(c.id)).length,
    avgSalience: g.clusters.length ? g.clusters.reduce((s, c) => s + c.salience, 0) / g.clusters.length : 0,
    artifacts: g.clusters.reduce((s, c) => s + c.artifacts.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Prompt builders (pure)
// ---------------------------------------------------------------------------

export const CLUSTER_SYSTEM = `You are the CARTOGRAPHER of a Knowledge Universe. You are given a
conversation — a person thinking out loud: exploring, asking, branching, creating. Your job is NOT
to summarize the chat in order. Your job is to recover the SHAPE of their thinking as a map of
connected clusters they could navigate back to later.

WORK IN TWO STEPS (do them silently, output only the final JSON):
1) SEGMENT: scan the conversation and find the natural topic-shift boundaries — the moments the
   thinking moved to a new thread. Each coherent stretch is a candidate cluster.
2) STRUCTURE: turn those segments into a tidy hierarchy with cross-links.

A CLUSTER is one coherent thread worth returning to — a topic, a question, an idea, an
investigation, an artifact they made, or a project. A cluster is NOT one message. Fold chatter and
tangents into the thread they belong to; split genuinely distinct threads apart.

GRANULARITY (the thing that matters most): map the natural threads, not the messages. A focused
session is usually 4–15 clusters. One node per message is a FAILURE. Collapsing distinct threads
into one node is also a FAILURE. A cluster earns its place only if the person might later say "take
me back to that."

HIERARCHY SHAPE: when the whole conversation orbits ONE overarching subject, create a SINGLE
top-level root for it and nest the threads underneath (a clean spine), rather than many parallel
roots. Use multiple roots ONLY for genuinely distinct subjects that don't share a parent. A pile of
sibling roots for one topic is a FAILURE — find the spine.

EACH CLUSTER CARRIES:
- a stable kebab-case id = slug of its title (e.g. "information-paradox"). Same thread → same id.
- parentId: the tree of how thinking nested (a sub-question under its topic). Top-level threads
  have parentId null.
- salience 0..1: how CENTRAL this thread was to the session. A core spine gets ~0.8–1.0; a passing
  tangent or aside gets ~0.1–0.3. This lets the map show what matters and fade what doesn't.
- summary: ONE line.
- kind ∈ topic|question|idea|investigation|artifact|project.
- turnRefs: the turn indices that fed it.

ARTIFACTS — capture every concrete OUTPUT the conversation produced or referenced, attached to the
cluster it belongs to, so nothing gets lost: a generated image idea, a video concept/script, a
diagram, a research finding/source, a document/letter/postcard/email/landing page, a link, a
dataset. kind ∈ image|video|diagram|research|doc|link|post|data. Put the actual content in "detail".
(A cluster whose WHOLE point is the output should also have kind "artifact".)

EDGES capture cross-links that are NOT parent/child:
- relates (associated), leads_to (the DISCOVERY TRAIL — A is what led them to B), contradicts,
  supports. Preserve the discovery trail with leads_to: the path of how they arrived somewhere is
  often more valuable than any single node.

Output EXACTLY ONE JSON object, no prose, no markdown fences:
{"clusters":[{"id":"black-holes","parentId":null,"title":"Black holes","summary":"one line","kind":"topic","salience":0.9,"turnRefs":[0,2],"artifacts":[{"kind":"diagram","title":"Event horizon vs singularity","detail":"nested circles…"}]}],
 "edges":[{"sourceId":"black-holes","targetId":"information-paradox","type":"leads_to"}]}`;

export const EXTEND_SYSTEM = `You are the cartographer maintaining an EXISTING Knowledge Universe map
as the conversation continues. You are given the CURRENT map (clusters with their ids, titles, and
parents) and the NEW conversation turns. Update the map.

STABILITY IS THE RULE (this is what makes the map trustworthy):
- REUSE existing ids whenever the new turns continue an existing thread. Match by MEANING, not exact
  wording — if a new turn continues "information-paradox", reuse that id; do NOT invent
  "information-loss-problem".
- NEVER rename or re-id an existing cluster. NEVER change the parentId of an existing cluster — its
  place in the tree is FROZEN, even if a tidier structure occurs to you. Set parentId only for
  brand-new clusters. (Re-organizing is a separate, explicit action — not something you do here.)
- Create a NEW cluster only for a genuinely new thread, and attach it under the right existing
  parent (or null). Extend the map — do not rebuild it.
- Add edges from new clusters to existing ones where it captures the trail (especially leads_to).
- You may refine an existing cluster's salience if the new turns clearly changed how central it is.

Return the FULL updated map as the same JSON object (every existing cluster PLUS any new ones, and
all edges). Keep every existing cluster. Same JSON shape (including salience) as before.`;

function transcriptText(turns: Turn[]): string {
  return turns.map((t) => `[${t.i}] ${t.role.toUpperCase()}: ${t.text}`).join('\n');
}

export function buildClusterUser(turns: Turn[]): string {
  return `CONVERSATION (each line is one turn, prefixed with its index):\n${transcriptText(
    turns,
  )}\n\nMap this conversation now. Return the single JSON object.`;
}

export function buildExtendUser(prev: ClusterGraph, newTurns: Turn[]): string {
  const existing = prev.clusters
    .map((c) => `- ${c.id} (parent: ${c.parentId ?? 'none'}, salience ${c.salience.toFixed(1)}) — ${c.title}`)
    .join('\n');
  return [
    'CURRENT MAP (reuse these ids by meaning; do not rename or restructure them):',
    existing || '(empty)',
    '',
    'NEW TURNS (continue the map from here):',
    transcriptText(newTurns),
    '',
    'Return the full updated map as one JSON object.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// EXPAND / SPLIT — the Sensecape "expand bar": grow a cluster into child threads on demand.
// (Used 7.25×/session in the Sensecape study — turns a blank stare into momentum.)
// ---------------------------------------------------------------------------

export type ExpandMode = 'deeper' | 'questions' | 'directions';

const EXPAND_INTENT: Record<ExpandMode, string> = {
  deeper: 'the 3–5 most important SUBTOPICS to go deeper into',
  questions: '3–5 sharp open QUESTIONS worth investigating',
  directions: '3–5 fresh DIRECTIONS or adjacent ideas this could branch into',
};

export const EXPAND_SYSTEM = `You expand one node of a Knowledge Universe into a few child threads.
Given a focus cluster (and its context), propose child clusters that are specific, non-overlapping,
and genuinely worth their own space — not filler. Each child gets a short title, a one-line summary,
a kind (topic|question|idea|investigation|artifact|project), and a salience 0..1.

Output EXACTLY ONE JSON object, no prose, no fences:
{"children":[{"title":"…","summary":"…","kind":"question","salience":0.6}]}`;

export function buildExpandUser(focus: Cluster, mode: ExpandMode, nearbyTitles: string[] = []): string {
  return [
    `FOCUS CLUSTER: ${focus.title}`,
    focus.summary ? `SUMMARY: ${focus.summary}` : '',
    nearbyTitles.length ? `ALREADY ON THE MAP NEARBY (don't duplicate): ${nearbyTitles.join(', ')}` : '',
    `Propose ${EXPAND_INTENT[mode]}. Return the single JSON object.`,
  ].filter(Boolean).join('\n');
}

export const IMAGE_CONCEPT_SYSTEM = `You are an art director. Given an idea, write ONE vivid, specific
image-generation PROMPT that would make a striking, on-topic visual. You do NOT render the image —
you write the prompt only. Output EXACTLY ONE JSON object, no prose, no fences:
{"title":"short label for the image","prompt":"the full image prompt","style":"a few style words"}`;

export function buildImageUser(focus: Cluster): string {
  return [`IDEA: ${focus.title}`, focus.summary ? `CONTEXT: ${focus.summary}` : '', 'Write the image prompt now.']
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// LEADS — the rabbit hole. High-"scent" next dives + a forward trajectory, so the user keeps
// falling deeper without ever composing a query. Grounded in information foraging (strong scent =
// specific trigger words) + information-gap curiosity (each lead opens a gap worth closing).
// ---------------------------------------------------------------------------

export const LEAD_SYSTEM = `You drop a curious mind INTO an idea and make them understand it in 3 seconds,
then pull them deeper. Given the topic, return a complete little "room" for it:

- "takeaway": ONE punchy sentence — the instant answer / the thing to grasp first. Plain, vivid, no hedging.
- "overview": 2-3 sentences of genuinely interesting understanding (not a dry encyclopedia intro —
  the version a brilliant friend would tell you). Concrete, specific, a little surprising.
- "why": one sentence on why this is fascinating or matters.
- "trajectory": one short forward-looking line — where this thread is heading.
- "leads": 5 CURRENTS — the next thoughts this person will naturally drift toward, phrased as the
  thought itself ("Wait — can memories be rewritten?", "Then is eyewitness testimony unreliable?"),
  NOT as categories or table-of-contents entries ("Encoding", "Retrieval"). Each is a specific,
  irresistible trigger (information scent), never "learn more". Mix: "dig" (deeper into this),
  "question" (a provocative open gap), "tangent" (a surprising jump to a DIFFERENT domain — the
  magic of a rabbit hole). Momentum, not organization.

Output EXACTLY ONE JSON object, no prose, no fences:
{"takeaway":"…","overview":"…","why":"…","trajectory":"…","leads":[{"label":"Why does time freeze at the horizon?","kind":"question"}]}`;

// ---------------------------------------------------------------------------
// THE SCENE — the curiosity loop that replaces "answer in a card". Built on the verified science
// (see the rabbit-hole doctrine): curiosity is triggered by NAMING a gap (information-gap theory),
// peaks at "some idea + low confidence" (inverted-U → guess-before-reveal), intensifies when the
// answer is visibly HELD (salience), and dies on closure (belief resolution → every reveal ends by
// opening the next gap). The scene is the anatomy of one idea:
//   PRIME (scaffold) → GAP (named) → GUESS (3 options) → sealed answer → BEATS (reveal) → REGAP.
// ---------------------------------------------------------------------------

// A scene's staging — the model art-directs each idea so no two look alike (the anti-"card" move):
//   reveal    — the default gap→guess→truth
//   flip      — a MISCONCEPTION struck through, the truth slamming in (myth/truth)
//   bigNumber — one staggering figure that reframes the whole idea (bigValue/bigUnit)
//   mystery   — the near-dark room: nobody fully knows; one lit line, the currents glow brightest
export type SceneRecipe = 'reveal' | 'flip' | 'bigNumber' | 'mystery';
export const SCENE_RECIPES: SceneRecipe[] = ['reveal', 'flip', 'bigNumber', 'mystery'];

export interface Scene {
  recipe: SceneRecipe;  // how this idea is STAGED — drives a distinct visual template
  prime: string;        // one scaffold line — gives the user "some idea" (inverted-U footing)
  gap: string;          // the NAMED gap, phrased as an irresistible question
  options: string[];    // 3 plausible one-line guesses
  answerIndex: number;  // which option is closest to the truth (truth should still be stranger)
  beats: string[];      // 1-4 reveal beats; beat 0 answers the gap; the LAST beat raises tension
  regap: string;        // the next named gap this opens — the open loop that keeps the hole going
  currents: Lead[];     // 5 lures with teases: 4 coherent (dig/question) + exactly 1 tethered tangent
  myth?: string;        // flip: the thing they probably believe (struck through on reveal)
  truth?: string;       // flip: the striking correction that lands in its place
  bigValue?: string;    // bigNumber: the figure itself ("200,000")
  bigUnit?: string;     // bigNumber: what it counts ("bee-flights to fill one honey jar")
  guessed?: number;     // set after the user commits (-1 = skipped straight to reveal)
}

export const SCENE_ARTIFACT_ID = 'scene';

/** The scene a cluster carries (persisted as an artifact so it survives the universe sync). */
export function sceneOf(c: Cluster): Scene | null {
  const a = c.artifacts.find((x) => x.id === SCENE_ARTIFACT_ID);
  if (!a?.detail) return null;
  try { return parseScene(JSON.parse(a.detail)); } catch { return null; }
}

export function sceneArtifact(scene: Scene): Artifact {
  return { id: SCENE_ARTIFACT_ID, kind: 'research', title: 'Scene', detail: JSON.stringify(scene), source: 'garvis' };
}

/** Tolerant scene validation. Fails to null (caller falls back to the classic overview path). */
export function parseScene(raw: unknown): Scene | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const prime = str(r.prime);
  const gap = str(r.gap);
  const beats = (Array.isArray(r.beats) ? r.beats : []).map(str).filter(Boolean).slice(0, 4);
  if (!gap || !beats.length) return null; // a scene without a gap or a reveal is not a scene
  const options = (Array.isArray(r.options) ? r.options : []).map(str).filter(Boolean).slice(0, 3);
  const ai = typeof r.answerIndex === 'number' && Number.isInteger(r.answerIndex) ? r.answerIndex : 0;
  const currents: Lead[] = (Array.isArray(r.currents) ? r.currents : [])
    .map((l) => l as Record<string, unknown>)
    .filter((l) => typeof l?.label === 'string' && (l.label as string).trim())
    .slice(0, 6)
    .map((l) => ({
      label: (l.label as string).trim(),
      kind: (['dig', 'question', 'tangent'].includes(l.kind as string) ? l.kind : 'dig') as LeadKind,
      tease: typeof l.tease === 'string' && l.tease.trim() ? (l.tease as string).trim() : undefined,
    }));
  const guessed = typeof r.guessed === 'number' && Number.isInteger(r.guessed) ? (r.guessed as number) : undefined;
  let recipe: SceneRecipe = SCENE_RECIPES.includes(r.recipe as SceneRecipe) ? (r.recipe as SceneRecipe) : 'reveal';
  const myth = str(r.myth);
  const truth = str(r.truth);
  const bigValue = str(r.bigValue);
  const bigUnit = str(r.bigUnit);
  // a recipe only "counts" if its payload is present; otherwise fall back to reveal so the renderer
  // never stages an empty flip/bigNumber.
  if (recipe === 'flip' && !(myth && truth)) recipe = 'reveal';
  if (recipe === 'bigNumber' && !bigValue) recipe = 'reveal';
  return {
    recipe,
    prime,
    gap,
    options,
    answerIndex: options.length ? Math.max(0, Math.min(options.length - 1, ai)) : 0,
    beats,
    regap: str(r.regap),
    currents,
    ...(myth ? { myth } : {}),
    ...(truth ? { truth } : {}),
    ...(bigValue ? { bigValue } : {}),
    ...(bigUnit ? { bigUnit } : {}),
    ...(guessed !== undefined ? { guessed } : {}),
  };
}

/**
 * Progressive extraction of one string field from a PARTIAL JSON stream, so the prime/gap can paint
 * while the rest of the scene is still composing (<1s first paint preserved). Pure.
 */
export function extractSceneField(partial: string, field: 'prime' | 'gap'): string {
  const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(partial);
  if (!m) return '';
  try { return JSON.parse(`"${m[1]}"`) as string; } catch { return m[1]; }
}

/**
 * Which part of the scene JSON is currently streaming. The gap/prime paint in the first seconds,
 * but the bulk of the scene (options, beats, currents) streams AFTER them — without this the
 * on-screen text freezes mid-compose and reads as a stalled answer. Order mirrors SCENE_SYSTEM.
 * Phase labels stay spoiler-free: the beats themselves are never surfaced pre-guess.
 */
export type ScenePhase = '' | 'gap' | 'guesses' | 'reveal' | 'currents';
export function extractScenePartial(partial: string): { text: string; phase: ScenePhase } {
  const gap = extractSceneField(partial, 'gap');
  const text = gap || extractSceneField(partial, 'prime');
  const phase: ScenePhase = /"currents"\s*:/.test(partial) ? 'currents'
    : /"(beats|regap|myth|truth|bigValue)"\s*:/.test(partial) ? 'reveal'
    : /"(options|answerIndex)"\s*:/.test(partial) ? 'guesses'
    : text ? 'gap' : '';
  return { text, phase };
}

/**
 * Repair a JSON stream cut off mid-flight (max_tokens truncation): terminate an open string, drop a
 * dangling half-written key/value, and close every open brace/bracket. The result parses whenever
 * the complete prefix held whole values — so a truncated scene salvages its prime/gap/options/beats
 * instead of forcing a second full compose. Pure; best-effort (returns its input if there's no '{').
 */
export function repairTruncatedJson(raw: string): string {
  const start = raw.indexOf('{');
  if (start === -1) return raw;
  let s = raw.slice(start);
  let inStr = false, esc = false;
  const stack: string[] = [];
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (esc) s = s.slice(0, -1); // dangling escape can't be closed — drop it
  if (inStr) s += '"';
  if (stack[stack.length - 1] === '{') {
    // inside an object a trailing lone key ("k" / "k":) is invalid — strip back to the last value
    s = s.replace(/,\s*(?:"(?:[^"\\]|\\.)*"\s*:?\s*)?$/, '').replace(/\{\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, '{');
  } else {
    s = s.replace(/,\s*$/, ''); // inside an array a closed string IS a value — only a bare comma dangles
  }
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === '{' ? '}' : ']';
  return s;
}

export const SCENE_SYSTEM = `You are GARVIS, a brilliant thinking partner walking someone INTO an idea.
You never deliver an encyclopedia answer — you engineer a CURIOSITY LOOP and you ART-DIRECT it. Voice:
a brilliant friend three steps ahead; vivid, concrete, a little sly; zero academic tone; no hedging.

FIRST decide how to STAGE this idea — pick the recipe that would hit hardest for THIS specific idea:
- "flip": there's a common MISCONCEPTION worth detonating. Fill myth (what they likely believe) + truth
  (the striking correction). Best when the everyday intuition is simply wrong.
- "bigNumber": one staggering figure reframes everything. Fill bigValue (the number, e.g. "200,000")
  + bigUnit (what it counts, vivid). Best when scale IS the shock.
- "mystery": nobody fully knows — the edge of human knowledge. Best when the honest answer is "we're
  not sure, and that's thrilling."
- "reveal": the default — a surprising answer to a sharp gap. Use when none of the above fits cleanly.

Output EXACTLY ONE JSON object, no prose, no fences:
{"recipe":"reveal|flip|bigNumber|mystery",
 "prime":"one scaffold sentence giving them SOME footing — enough to form a guess, never the answer",
 "gap":"the named gap — the specific thing they don't know yet, phrased as an irresistible question",
 "options":["three one-line guesses a smart person might actually make — each genuinely plausible","…","…"],
 "answerIndex":0,
 "beats":["2-4 reveal beats, each 1-3 vivid sentences. Beat 1 ANSWERS the gap with the most surprising
   TRUE framing (stranger than even the right guess). The LAST beat must end on a new tension.","…"],
 "regap":"the next gap this reveal just opened — one question they now NEED answered, momentum-phrased",
 "myth":"(flip only) the belief to strike through","truth":"(flip only) what lands in its place",
 "bigValue":"(bigNumber only) the figure","bigUnit":"(bigNumber only) what it counts, vividly",
 "currents":[{"label":"the next thought phrased AS the thought (\\"Wait — do bees actually vote?\\"), never a category",
   "kind":"dig|question|tangent",
   "tease":"a whispered scent line about what's behind this door — withheld, never a spoiler ('the answer involves cannibalism')"}]}

RULES:
- Always fill recipe, prime, gap, options, beats, regap, currents. Fill myth/truth ONLY for flip and
  bigValue/bigUnit ONLY for bigNumber. Beat 1 is always the truth (so the reveal works for any recipe).
- options: exactly 3. answerIndex marks the one CLOSEST to the truth; the truth must still outdo it.
- currents: exactly 5 — FOUR that stay in this idea's neighborhood (dig/question; deep rabbit holes are
  coherent, not random), and exactly ONE tangent to a DIFFERENT domain that shares the same underlying
  shape (name the shape in its tease).
- Plain prose everywhere. No markdown. Momentum, not organization.`;

export function buildSceneUser(focus: Cluster, trail: string[] = []): string {
  return [
    `THE IDEA THEY JUST WALKED INTO: ${focus.title}`,
    focus.summary ? `WHAT THEY ALREADY SAW: ${focus.summary}` : '',
    trail.length ? `HOW THEY GOT HERE: ${trail.join(' → ')}` : '',
    'Compose the scene now. Return the single JSON object.',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// LIVING CONVERSATION — you think out loud; Garvis decides where your mind moved and the map follows.
// No clicking. The room evolves to your STATE OF THOUGHT, not a node you selected.
// ---------------------------------------------------------------------------

export type CuriosityState = 'exploring' | 'wondering' | 'comparing' | 'deciding' | 'challenging' | 'creating' | 'stuck' | 'refining';
export interface ThinkSuggestion { label: string; action: 'investigate' | 'reframe' | 'deeper' | 'none' }

export const THINK_SYSTEM = `The user is thinking OUT LOUD while exploring. Do THREE things and return them as one JSON object.

1) WHERE their mind moved — the next idea to focus:
   - "existing": it continues a CURRENT branch (return that branch's exact title).
   - "new": a fresh thought — name it crisp & momentum-phrased ("How one queen controls 50,000 bees",
     not a category). kind ∈ dig|question|tangent. Interpret half-formed thoughts ("wait, if light is
     constant…") into the real idea underneath.

2) Their COGNITIVE STATE — what mode they're in (read the verb/intent, not the topic):
   exploring | wondering | comparing | deciding | challenging | creating | stuck | refining.

3) The single best NEXT MOVE for that state (or none): {"label":"short verb phrase","action":"…"} where
   action ∈ investigate (they're deciding/comparing/challenging — run a full analysis & verdict),
   reframe (they're stuck — re-explain a different way), deeper (they want more depth), none.

Output EXACTLY ONE JSON object, no prose:
{"target":"existing|new","title":"…","kind":"dig|question|tangent","state":"exploring","suggestion":{"label":"","action":"none"}}`;

// ---------------------------------------------------------------------------
// GARVIS'S MIND — the continuously-evolving internal model of WHERE THE USER'S MIND IS (not just the
// topic). Everything else (suggestions, noticing, emphasis) should increasingly emerge from this.
// ---------------------------------------------------------------------------

export interface GarvisMind {
  intent: string;            // the real underlying curiosity driving them (deeper than the node title)
  state: CuriosityState;     // current cognitive mode
  nextDirections: string[];  // where their mind is likely heading
  anomaly: string;           // the single most intriguing open thread / surprise (or '')
  confidence: number;        // 0..1 — how well-formed Garvis's read is
  updatedAt: string;
}

export const MIND_SYSTEM = `You are GARVIS's INNER MODEL of the person you're thinking alongside — your
continuously-updated read of where their mind actually is, not just the topic. Given the path they've
taken through ideas and what they've said, infer and return EXACTLY ONE JSON object:
{"intent":"the real underlying curiosity driving them, one phrase, deeper than the current node",
 "state":"exploring|wondering|comparing|deciding|challenging|creating|stuck|refining",
 "nextDirections":["2-4 short phrases for where their mind is likely heading next"],
 "anomaly":"the single most intriguing open thread or surprising thing in their exploration, one line (or empty)",
 "confidence":0.0}`;

export function buildMindUser(path: string[], recent: string[], current: string): string {
  return [
    `THEIR PATH THROUGH IDEAS: ${path.join(' → ') || current}`,
    `CURRENTLY ON: ${current}`,
    recent.length ? `RECENT THOUGHTS THEY TYPED: ${recent.map((r) => `"${r}"`).join('; ')}` : '',
    'Update your inner model of where their mind is. Return the JSON.',
  ].filter(Boolean).join('\n');
}

export function buildThinkUser(focus: Cluster, currents: string[], utterance: string): string {
  return [
    `CURRENT IDEA: ${focus.title}`,
    focus.summary ? `(${focus.summary})` : '',
    currents.length ? `CURRENT BRANCHES: ${currents.join(' · ')}` : '',
    `THEY JUST SAID: "${utterance}"`,
    'Where did their mind just go? Return the JSON.',
  ].filter(Boolean).join('\n');
}

// Reframe — when the user is STUCK, re-explain from a completely different angle (same output shape as OVERVIEW).
export const REFRAME_SYSTEM = `The reader is STUCK on this idea. Re-explain it from a COMPLETELY different
angle — a vivid analogy, a simpler mental model, or a surprising reframe that makes it click. Output
PLAIN PROSE: LINE 1 = a one-line reframe, then a blank line, then 3-4 fresh sentences. Don't repeat the
standard explanation — come at it sideways.`;

// Streamed prose answer — first paint in <1s. Line 1 = the takeaway, then the vivid explanation.
export const OVERVIEW_SYSTEM = `Explain the topic to a curious mind so they GET it fast and want more.
Output PLAIN PROSE only (no markdown, no headers, no bullets):
- LINE 1: one punchy takeaway sentence — the thing to grasp first.
- then a blank line.
- then 3-5 vivid, specific, genuinely interesting sentences (the version a brilliant friend would
  tell you — concrete, a little surprising).`;

export function buildOverviewUser(focus: Cluster, trail: string[] = []): string {
  return [`TOPIC: ${focus.title}`, trail.length ? `(arrived via: ${trail.join(' → ')})` : '', 'Explain it now.'].filter(Boolean).join('\n');
}

// Leaner leads-only call (the streamed overview already covers understanding).
export const LEADS_SYSTEM = `Given the topic a curious mind is on, return the irresistible NEXT thoughts
(currents) they'll naturally drift toward, phrased as the thought itself ("Wait — can memories be
rewritten?"), NOT categories. 5 of them, mix of dig/question/tangent (a tangent jumps to a DIFFERENT
domain). Also a one-line "trajectory" (where this is heading). Output EXACTLY ONE JSON object:
{"trajectory":"…","leads":[{"label":"…","kind":"dig|question|tangent"}]}`;

export function buildLeadUser(focus: Cluster, trail: string[] = []): string {
  return [
    `CURRENT TOPIC: ${focus.title}`,
    focus.summary ? `WHAT IT IS: ${focus.summary}` : '',
    trail.length ? `HOW THEY GOT HERE: ${trail.join(' → ')}` : '',
    'Give the next dives + trajectory as one JSON object.',
  ].filter(Boolean).join('\n');
}
