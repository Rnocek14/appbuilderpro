// src/lib/garvis/clusteringRun.ts
// Impure half of the clustering spike (mirrors marketing.ts / marketingRun.ts): it calls the model
// via rawComplete, then runs the deterministic rails from clustering.ts (canonicalize + merge).
// Also hosts the "Explorer" actions — expand/split a cluster, attach generated media — that make
// the universe feel alive. Kept separate so clustering.ts stays Supabase/LLM-free and testable.

import { rawComplete, streamComplete } from '../aiClient';
import { estimateCostUsd, shortScriptDirect } from './directBrain';
import { embedTexts, cosine } from './embeddings';
import { fetchWikipedia, fetchYouTube, youTubeSearchUrl, perplexityDiscover, perplexityAvailable, serperImages, serperVideos, serperAvailable, discoverAvailable } from './discover';
import {
  CLUSTER_SYSTEM,
  EXTEND_SYSTEM,
  EXPAND_SYSTEM,
  IMAGE_CONCEPT_SYSTEM,
  LEAD_SYSTEM,
  LEADS_SYSTEM,
  OVERVIEW_SYSTEM,
  REFRAME_SYSTEM,
  THINK_SYSTEM,
  MIND_SYSTEM,
  BRIDGE_SYSTEM,
  DECOMPOSE_SYSTEM,
  ANGLE_SYSTEM,
  SYNTHESIZE_SYSTEM,
  THEME_SYSTEM,
  universeConnections,
  buildBridgeUser,
  buildDecomposeUser,
  buildAngleUser,
  buildSynthesizeUser,
  buildThemeUser,
  buildMindUser,
  buildClusterUser,
  buildExtendUser,
  buildExpandUser,
  buildImageUser,
  buildLeadUser,
  buildOverviewUser,
  buildThinkUser,
  normalizeGraph,
  dedupeClusters,
  canonicalizeAgainstPrev,
  applyIdRemap,
  mergeGraphs,
  stabilityReport,
  relatedClusters,
  addChild,
  titleSimilarity,
  slugify,
  type ClusterGraph,
  type Cluster,
  type ClusterKind,
  type Artifact,
  type Turn,
  type ExpandMode,
  type StabilityReport,
  type RelatedCluster,
  type Lead,
  type LeadKind,
  type CuriosityState,
  type ThinkSuggestion,
  type GarvisMind,
  type RawGraph,
} from './clustering';

const STATES: CuriosityState[] = ['exploring', 'wondering', 'comparing', 'deciding', 'challenging', 'creating', 'stuck', 'refining'];
const SUGGESTION_ACTIONS = ['investigate', 'reframe', 'deeper', 'none'];

/** Tolerant JSON extractor (mirrors directBrain.extractJson). */
function extractJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response.');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

const embedText = (c: Cluster) => `${c.title}. ${c.summary}`.trim();

export interface ClusterResult { graph: ClusterGraph; costUsd: number }

/** One-shot: cluster a whole conversation from scratch. */
export async function clusterConversation(turns: Turn[]): Promise<ClusterResult> {
  const r = await rawComplete(
    [
      { role: 'system', content: CLUSTER_SYSTEM },
      { role: 'user', content: buildClusterUser(turns) },
    ],
    3500,
  );
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  try {
    return { graph: dedupeClusters(normalizeGraph(extractJson<RawGraph>(r.text))), costUsd };
  } catch {
    return { graph: { clusters: [], edges: [] }, costUsd };
  }
}

const EMBED_MATCH = 0.82; // cosine threshold for "same thread" (meaning-based entity resolution)

/**
 * MEANING-based canonicalization: embed prior + new clusters and snap each new cluster onto the
 * nearest prior one above EMBED_MATCH. Catches rewordings with no shared spelling
 * ("info paradox" ↔ "the information-loss problem"). Returns null if embeddings are unavailable so
 * the caller falls back to the lexical canonicalizeAgainstPrev.
 */
async function embeddingCanonicalize(prev: ClusterGraph, next: ClusterGraph): Promise<ClusterGraph | null> {
  const prevIds = new Set(prev.clusters.map((c) => c.id));
  const fresh = next.clusters.filter((c) => !prevIds.has(c.id));
  if (!prev.clusters.length || !fresh.length) return next;
  const vecs = await embedTexts([...prev.clusters.map(embedText), ...fresh.map(embedText)]);
  if (!vecs) return null;
  const prevVecs = vecs.slice(0, prev.clusters.length);
  const freshVecs = vecs.slice(prev.clusters.length);
  const remap = new Map<string, string>();
  for (let i = 0; i < fresh.length; i++) {
    let bestId: string | null = null;
    let bestScore = EMBED_MATCH;
    for (let j = 0; j < prev.clusters.length; j++) {
      const score = cosine(freshVecs[i], prevVecs[j]);
      if (score >= bestScore) { bestScore = score; bestId = prev.clusters[j].id; }
    }
    if (bestId) remap.set(fresh[i].id, bestId);
  }
  return applyIdRemap(next, remap);
}

export interface ExtendResult extends ClusterResult { report: StabilityReport; matchedBy: 'embeddings' | 'lexical' }

/**
 * Incremental: extend an existing map with new turns. Pipeline of the stability rails:
 *   model output → canonicalize (embeddings if available, else lexical) → stabilityReport
 *                → mergeGraphs (re-add dropped, freeze structure).
 */
export async function extendClusters(prev: ClusterGraph, newTurns: Turn[]): Promise<ExtendResult> {
  const r = await rawComplete(
    [
      { role: 'system', content: EXTEND_SYSTEM },
      { role: 'user', content: buildExtendUser(prev, newTurns) },
    ],
    3500,
  );
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let raw: ClusterGraph;
  try {
    raw = normalizeGraph(extractJson<RawGraph>(r.text));
  } catch {
    raw = prev; // fail soft: keep the existing map rather than wiping it
  }
  const prevIds = new Set(prev.clusters.map((c) => c.id));
  const embedded = await embeddingCanonicalize(prev, raw);
  const matchedBy = embedded ? 'embeddings' : 'lexical';
  const canon = embedded ?? canonicalizeAgainstPrev(prev, raw);
  const newBefore = raw.clusters.filter((c) => !prevIds.has(c.id)).length;
  const newAfter = canon.clusters.filter((c) => !prevIds.has(c.id)).length;
  const renamedAnchored = Math.max(0, newBefore - newAfter);
  const report = stabilityReport(prev, canon, renamedAnchored);
  return { graph: mergeGraphs(prev, canon), costUsd, report, matchedBy };
}

// ---------------------------------------------------------------------------
// Explorer actions — grow the universe on demand
// ---------------------------------------------------------------------------

export interface ActionResult { graph: ClusterGraph; costUsd: number; newIds: string[] }

/** Expand a cluster into child threads (deeper subtopics / questions / directions). */
export async function expandCluster(graph: ClusterGraph, focusId: string, mode: ExpandMode): Promise<ActionResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0, newIds: [] };
  const nearby = graph.clusters.filter((c) => c.parentId === focusId).map((c) => c.title);
  const r = await rawComplete(
    [
      { role: 'system', content: EXPAND_SYSTEM },
      { role: 'user', content: buildExpandUser(focus, mode, nearby) },
    ],
    1500,
  );
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let children: Record<string, unknown>[] = [];
  try {
    children = (extractJson<{ children?: unknown[] }>(r.text).children ?? []) as Record<string, unknown>[];
  } catch {
    return { graph, costUsd, newIds: [] };
  }
  const existing = new Set(graph.clusters.map((c) => c.id));
  const newIds: string[] = [];
  const added = children
    .filter((c) => typeof c?.title === 'string' && (c.title as string).trim())
    .map((c) => {
      let id = slugify(c.title as string);
      while (existing.has(id)) id = `${id}-2`;
      existing.add(id);
      newIds.push(id);
      return { id, parentId: focusId, title: c.title, summary: c.summary ?? '', kind: c.kind ?? 'idea', salience: c.salience ?? 0.5, artifacts: [] };
    });
  if (!added.length) return { graph, costUsd, newIds: [] };
  const merged = normalizeGraph({ clusters: [...graph.clusters, ...added], edges: graph.edges });
  return { graph: merged, costUsd, newIds };
}

const LEAD_KINDS: LeadKind[] = ['dig', 'question', 'tangent'];

/**
 * STREAMED answer — first paint in <1s. Streams vivid prose (takeaway + understanding) via onDelta,
 * then writes summary + the understanding artifact onto the focus. The fast, always-works-in-browser
 * (Anthropic) instant layer; gatherDiscover later upgrades the understanding to Perplexity's if available.
 */
export async function streamOverview(graph: ClusterGraph, focusId: string, trail: string[], onDelta: (text: string) => void): Promise<{ graph: ClusterGraph; costUsd: number }> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0 };
  let acc = '';
  let usd = 0;
  const full = await streamComplete(
    [{ role: 'system', content: OVERVIEW_SYSTEM }, { role: 'user', content: buildOverviewUser(focus, trail) }],
    500,
    (d) => { acc += d; onDelta(acc); },
    undefined,
    (u) => { usd = estimateCostUsd(u.inputTokens, u.outputTokens); },
  );
  const text = (full || acc).trim();
  const parts = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const takeaway = parts[0] ?? '';
  const overview = parts.slice(1).join('\n\n') || takeaway;
  const understanding: Artifact = { id: 'understanding', kind: 'research', title: `Understanding: ${focus.title}`, detail: overview, source: 'garvis' };
  const nextGraph: ClusterGraph = {
    ...graph,
    clusters: graph.clusters.map((c) => (c.id === focusId ? { ...c, summary: takeaway || c.summary, artifacts: [understanding, ...c.artifacts.filter((a) => a.id !== 'understanding')] } : c)),
  };
  return { graph: nextGraph, costUsd: usd };
}

/** Leaner currents-only call (trajectory + leads); the streamed overview handles understanding. */
export async function fetchLeads(graph: ClusterGraph, focusId: string, trail: string[]): Promise<LeadsResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, leads: [], costUsd: 0 };
  const r = await rawComplete([{ role: 'system', content: LEADS_SYSTEM }, { role: 'user', content: buildLeadUser(focus, trail) }], 600);
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let parsed: { trajectory?: string; leads?: { label?: string; kind?: string }[] } = {};
  try { parsed = extractJson(r.text); } catch { return { graph, leads: [], costUsd }; }
  const leads: Lead[] = (parsed.leads ?? []).filter((l) => typeof l?.label === 'string' && l.label.trim()).slice(0, 6)
    .map((l) => ({ label: l.label!.trim(), kind: LEAD_KINDS.includes(l.kind as LeadKind) ? (l.kind as LeadKind) : 'dig' }));
  const trajectory = typeof parsed.trajectory === 'string' ? parsed.trajectory.trim() : '';
  const nextGraph = trajectory ? { ...graph, clusters: graph.clusters.map((c) => (c.id === focusId ? { ...c, trajectory } : c)) } : graph;
  return { graph: nextGraph, leads, costUsd };
}

export interface LeadsResult { graph: ClusterGraph; leads: Lead[]; costUsd: number }

/**
 * The rabbit hole: high-scent next dives + a forward trajectory for the focused cluster. One small
 * LLM call (cache per cluster id in the UI). Trajectory is written onto the cluster so it persists.
 */
export async function exploreLeads(graph: ClusterGraph, focusId: string, trail: string[] = []): Promise<LeadsResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, leads: [], costUsd: 0 };
  const r = await rawComplete(
    [
      { role: 'system', content: LEAD_SYSTEM },
      { role: 'user', content: buildLeadUser(focus, trail) },
    ],
    700,
  );
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let parsed: { takeaway?: string; overview?: string; why?: string; trajectory?: string; leads?: { label?: string; kind?: string }[] } = {};
  try { parsed = extractJson(r.text); } catch { return { graph, leads: [], costUsd }; }
  const leads: Lead[] = (parsed.leads ?? [])
    .filter((l) => typeof l?.label === 'string' && l.label.trim())
    .slice(0, 6)
    .map((l) => ({ label: l.label!.trim(), kind: LEAD_KINDS.includes(l.kind as LeadKind) ? (l.kind as LeadKind) : 'dig' }));
  const takeaway = typeof parsed.takeaway === 'string' ? parsed.takeaway.trim() : '';
  const overview = typeof parsed.overview === 'string' ? parsed.overview.trim() : '';
  const why = typeof parsed.why === 'string' ? parsed.why.trim() : '';
  const trajectory = typeof parsed.trajectory === 'string' ? parsed.trajectory.trim() : '';
  // Write the synthesized ANSWER onto the cluster: takeaway → the 3-second summary; overview+why →
  // an "understanding" artifact the Idea Room reads. This is what makes it feel like an answer, not links.
  const understanding: Artifact | null = overview || why
    ? { id: 'understanding', kind: 'research', title: 'Understanding', detail: [overview, why && `Why it matters: ${why}`].filter(Boolean).join('\n\n'), source: 'garvis' }
    : null;
  const nextGraph: ClusterGraph = {
    ...graph,
    clusters: graph.clusters.map((c) => {
      if (c.id !== focusId) return c;
      const artifacts = understanding && !c.artifacts.some((a) => a.id === 'understanding')
        ? [understanding, ...c.artifacts]
        : c.artifacts;
      return { ...c, summary: takeaway || c.summary, trajectory: trajectory || c.trajectory, artifacts };
    }),
  };
  return { graph: nextGraph, leads, costUsd };
}

export interface Prospect {
  topic: string;
  summary: string;
  trajectory?: string;
  understanding?: Artifact;
  images: Artifact[];
  leads: Lead[];
  costUsd: number;
}

/**
 * PREDICTIVE CURIOSITY — compose a prospective idea (a likely next direction) in the background,
 * WITHOUT touching the live universe. Returns everything an Idea Room needs (answer + images +
 * next leads) so that when the user drifts into it, it's already there — no loading. The caller
 * caches these by topic and applies one on arrival.
 */
export async function composeProspect(topic: string, trail: string[] = []): Promise<Prospect> {
  const slug = slugify(topic);
  let g: ClusterGraph = normalizeGraph({
    clusters: [{ id: slug, parentId: null, title: topic, summary: '', kind: 'topic', salience: 0.7, maturity: 'spark', turnRefs: [], artifacts: [] }],
    edges: [],
  });
  let leads: Lead[] = [];
  let costUsd = 0;
  try { const r = await exploreLeads(g, slug, trail); g = r.graph; leads = r.leads; costUsd += r.costUsd; } catch { /* lone */ }
  try {
    if (discoverAvailable()) {
      const r = await gatherDiscover(g, slug);
      if (r.found) { g = r.graph; costUsd += r.costUsd; }
      else { const w = await gatherWikiMedia(g, slug); g = w.graph; }
    } else { const w = await gatherWikiMedia(g, slug); g = w.graph; }
  } catch { /* no media */ }
  const c = g.clusters.find((x) => x.id === slug);
  return {
    topic,
    summary: c?.summary ?? '',
    trajectory: c?.trajectory,
    understanding: c?.artifacts.find((a) => a.id === 'understanding'),
    images: c?.artifacts.filter((a) => a.kind === 'image') ?? [],
    leads,
    costUsd,
  };
}

export interface ThoughtMove { graph: ClusterGraph; focusId: string; costUsd: number; created: boolean; state?: CuriosityState; suggestion?: ThinkSuggestion }

/**
 * LIVING CONVERSATION + CURIOSITY-STATE MODELING — interpret a spoken/typed thought: move the focus
 * to where the mind went, AND read the user's cognitive STATE + the single best next move for it.
 * The map follows the conversation; the behavior adapts to the mode.
 */
export async function interpretThought(graph: ClusterGraph, focusId: string, utterance: string): Promise<ThoughtMove> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus || !utterance.trim()) return { graph, focusId, costUsd: 0, created: false };
  const children = graph.clusters.filter((c) => c.parentId === focusId);
  const r = await rawComplete(
    [
      { role: 'system', content: THINK_SYSTEM },
      { role: 'user', content: buildThinkUser(focus, children.map((c) => c.title), utterance) },
    ],
    450,
  );
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let parsed: { target?: string; title?: string; kind?: string; state?: string; suggestion?: { label?: string; action?: string } } = {};
  try { parsed = extractJson(r.text); } catch { return { graph, focusId, costUsd, created: false }; }
  const state = STATES.includes(parsed.state as CuriosityState) ? (parsed.state as CuriosityState) : undefined;
  const sg = parsed.suggestion;
  const suggestion: ThinkSuggestion | undefined = sg && sg.label && SUGGESTION_ACTIONS.includes(sg.action as string) && sg.action !== 'none'
    ? { label: sg.label.trim().slice(0, 40), action: sg.action as ThinkSuggestion['action'] }
    : undefined;
  const title = (parsed.title || utterance).trim();
  const kind = (['dig', 'question', 'tangent'].includes(parsed.kind as string) ? parsed.kind : 'dig') as LeadKind;
  if (parsed.target === 'existing' && children.length) {
    const best = children.map((c) => ({ c, s: titleSimilarity(c.title, title) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.45) return { graph, focusId: best.c.id, costUsd, created: false, state, suggestion };
  }
  const ck: ClusterKind = kind === 'question' ? 'question' : kind === 'tangent' ? 'idea' : 'topic';
  const { graph: g2, id } = addChild(graph, focusId, { title, kind: ck });
  return id ? { graph: g2, focusId: id, costUsd, created: true, state, suggestion } : { graph, focusId, costUsd, created: false, state, suggestion };
}

/** REFRAME — when the user is stuck, re-explain the focus from a completely different angle (streamed). */
export async function reframe(graph: ClusterGraph, focusId: string, onDelta: (text: string) => void): Promise<{ graph: ClusterGraph; costUsd: number }> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0 };
  let acc = '';
  let usd = 0;
  const full = await streamComplete(
    [{ role: 'system', content: REFRAME_SYSTEM }, { role: 'user', content: buildOverviewUser(focus) }],
    500,
    (d) => { acc += d; onDelta(acc); },
    undefined,
    (u) => { usd = estimateCostUsd(u.inputTokens, u.outputTokens); },
  );
  const text = (full || acc).trim();
  const parts = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const understanding: Artifact = { id: 'understanding', kind: 'research', title: 'A different angle', detail: parts.slice(1).join('\n\n') || text, source: 'garvis' };
  const nextGraph: ClusterGraph = { ...graph, clusters: graph.clusters.map((c) => (c.id === focusId ? { ...c, summary: parts[0] || c.summary, artifacts: [understanding, ...c.artifacts.filter((a) => a.id !== 'understanding')] } : c)) };
  return { graph: nextGraph, costUsd: usd };
}

export interface Bridge { targetId: string; targetTitle: string; why: string; costUsd: number }

/** THE WOW: an LLM finds a surprising, non-obvious connection from the focus to ANOTHER idea in the
 *  user's universe and says why. Returns null if there's nothing to bridge to. */
export async function findBridge(graph: ClusterGraph, focusId: string): Promise<Bridge | null> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return null;
  // candidate pool: distant universe connections first; else any other cluster
  const cands = universeConnections(graph, focusId, { limit: 18, min: 0.12 });
  const pool = (cands.length ? cands.map((c) => graph.clusters.find((x) => x.id === c.id)!).filter(Boolean) : graph.clusters.filter((c) => c.id !== focusId)).slice(0, 20);
  if (!pool.length) return null;
  const r = await rawComplete([{ role: 'system', content: BRIDGE_SYSTEM }, { role: 'user', content: buildBridgeUser(focus, pool.map((c) => c.title)) }], 220);
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let parsed: { title?: string; why?: string } = {};
  try { parsed = extractJson(r.text); } catch { return null; }
  const title = (parsed.title ?? '').trim();
  if (!title) return null;
  const target = pool.find((c) => titleSimilarity(c.title, title) >= 0.6) ?? pool.find((c) => c.title === title);
  if (!target) return null;
  return { targetId: target.id, targetTitle: target.title, why: (parsed.why ?? '').trim(), costUsd };
}

/**
 * INVESTIGATION — the leap from display to reasoning. Decompose the focus into analyst angles, spawn
 * a node per angle, research them ALL IN PARALLEL (each fills its node as it lands — you watch the
 * team work), then synthesize a verdict onto the focus. `onProgress(graph)` streams every update so
 * the map comes alive in real time.
 */
export async function investigate(graph: ClusterGraph, focusId: string, onProgress: (g: ClusterGraph) => void): Promise<{ graph: ClusterGraph; costUsd: number }> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0 };
  let cost = 0;

  // 1. decompose into angles
  const dr = await rawComplete([{ role: 'system', content: DECOMPOSE_SYSTEM }, { role: 'user', content: buildDecomposeUser(focus) }], 400);
  cost += estimateCostUsd(dr.inputTokens, dr.outputTokens);
  let angles: { title?: string }[] = [];
  try { angles = (extractJson<{ angles?: { title?: string }[] }>(dr.text).angles ?? []); } catch { return { graph, costUsd: cost }; }
  const titles = angles.map((a) => (a?.title ?? '').trim()).filter(Boolean).slice(0, 6);
  if (!titles.length) return { graph, costUsd: cost };

  // 2. spawn an investigator node per angle (marked "investigating…")
  let g = graph;
  const investigators: { id: string; title: string }[] = [];
  for (const t of titles) {
    const { graph: g2, id } = addChild(g, focusId, { title: t, kind: 'investigation' });
    if (id) { g = { ...g2, clusters: g2.clusters.map((c) => (c.id === id ? { ...c, summary: 'Investigating…' } : c)) }; investigators.push({ id, title: t }); }
  }
  onProgress(g);

  // 3. research every angle IN PARALLEL — each fills its own node as it returns
  await Promise.all(investigators.map(({ id, title }) =>
    rawComplete([{ role: 'system', content: ANGLE_SYSTEM }, { role: 'user', content: buildAngleUser(focus.title, title) }], 400)
      .then((r) => {
        cost += estimateCostUsd(r.inputTokens, r.outputTokens);
        const finding = r.text.trim();
        const understanding: Artifact = { id: 'understanding', kind: 'research', title: 'Finding', detail: finding, source: 'garvis' };
        g = { ...g, clusters: g.clusters.map((c) => (c.id === id ? { ...c, summary: finding.split(/(?<=\.)\s/)[0].slice(0, 150), artifacts: [understanding, ...c.artifacts.filter((a) => a.id !== 'understanding')] } : c)) };
        onProgress(g);
      })
      .catch(() => { /* one angle failing shouldn't sink the investigation */ }),
  ));

  // 4. synthesize a verdict onto the focus
  const findings = investigators.map((iv) => ({ title: iv.title, finding: g.clusters.find((c) => c.id === iv.id)?.artifacts.find((a) => a.id === 'understanding')?.detail ?? '' })).filter((f) => f.finding);
  if (findings.length) {
    const sr = await rawComplete([{ role: 'system', content: SYNTHESIZE_SYSTEM }, { role: 'user', content: buildSynthesizeUser(focus, findings) }], 600);
    cost += estimateCostUsd(sr.inputTokens, sr.outputTokens);
    const conclusion = sr.text.trim();
    const understanding: Artifact = { id: 'understanding', kind: 'research', title: 'Synthesis', detail: conclusion, source: 'garvis' };
    g = { ...g, clusters: g.clusters.map((c) => (c.id === focusId ? { ...c, artifacts: [understanding, ...c.artifacts.filter((a) => a.id !== 'understanding')] } : c)) };
    onProgress(g);
  }
  return { graph: g, costUsd: cost };
}

/**
 * GARVIS'S MIND — refresh the continuously-evolving internal model of where the user's mind is, from
 * their PATH through ideas + recent utterances. This is the substrate the rest of the experience
 * should increasingly emerge from (suggestions, noticing, emphasis).
 */
export async function updateMind(graph: ClusterGraph, focusId: string, path: string[], recent: string[]): Promise<{ mind: GarvisMind; costUsd: number } | null> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return null;
  const r = await rawComplete([{ role: 'system', content: MIND_SYSTEM }, { role: 'user', content: buildMindUser(path, recent, focus.title) }], 400);
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let p: { intent?: string; state?: string; nextDirections?: string[]; anomaly?: string; confidence?: number } = {};
  try { p = extractJson(r.text); } catch { return null; }
  const state = STATES.includes(p.state as CuriosityState) ? (p.state as CuriosityState) : 'exploring';
  const confidence = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5;
  return {
    mind: {
      intent: (p.intent ?? '').trim(),
      state,
      nextDirections: (Array.isArray(p.nextDirections) ? p.nextDirections : []).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).slice(0, 4),
      anomaly: (p.anomaly ?? '').trim(),
      confidence,
      updatedAt: '',
    },
    costUsd,
  };
}

export interface Notice { id: string; kind: 'connection' | 'pattern'; text: string; targetId?: string; costUsd: number }
const nid = () => `n_${Math.random().toString(36).slice(2, 9)}`;

/** Recurring-theme notice: "you keep circling X across A, B, C" — the intellectual-fingerprint beat. */
async function detectTheme(graph: ClusterGraph): Promise<Notice | null> {
  const titles = graph.clusters.map((c) => c.title);
  if (titles.length < 5) return null;
  const r = await rawComplete([{ role: 'system', content: THEME_SYSTEM }, { role: 'user', content: buildThemeUser(titles) }], 300);
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let p: { theme?: string; members?: string[] } = {};
  try { p = extractJson(r.text); } catch { return null; }
  if (!p.theme || !(p.members && p.members.length >= 3)) return null;
  const target = graph.clusters.find((c) => p.members!.some((m) => titleSimilarity(c.title, m) >= 0.6));
  return { id: nid(), kind: 'pattern', text: `You keep circling ${p.theme} — ${p.members.slice(0, 3).join(', ')}`, targetId: target?.id, costUsd };
}

/**
 * PROACTIVE OBSERVATION — Garvis looks at your universe and surfaces ONE unprompted insight: a
 * recurring theme in how you think, or a surprising connection between distant ideas. Returns null
 * if there's nothing worth saying yet. Meant to be called on a calm cadence (the heartbeat).
 */
export async function observe(graph: ClusterGraph, opts?: { anchorId?: string; mind?: GarvisMind | null }): Promise<Notice | null> {
  const all = graph.clusters;
  if (all.length < 4) return null;
  // patterns once the universe has some breadth; otherwise look for a surprising connection
  if (all.length >= 6 && Math.random() < 0.5) {
    const t = await detectTheme(graph);
    if (t) return t;
  }
  // ANCHOR ON THE MIND — observe where the user's thinking is actually heading (intent + next directions),
  // not a random idea. Falls back to the given anchor, then to random.
  let anchorId = (opts?.anchorId && all.some((c) => c.id === opts.anchorId)) ? opts.anchorId! : '';
  const dirs = opts?.mind ? [opts.mind.intent, ...opts.mind.nextDirections].map((s) => s.trim()).filter(Boolean) : [];
  if (dirs.length) {
    let best = '', bestS = 0.45;
    for (const c of all) { const s = Math.max(...dirs.map((d) => titleSimilarity(c.title, d))); if (s > bestS) { bestS = s; best = c.id; } }
    if (best) anchorId = best;
  }
  if (!anchorId) anchorId = all[Math.floor(Math.random() * all.length)].id;
  const b = await findBridge(graph, anchorId);
  if (b && b.why) {
    const anchorTitle = all.find((c) => c.id === anchorId)?.title ?? '';
    return { id: nid(), kind: 'connection', text: `${anchorTitle} ↔ ${b.targetTitle}: ${b.why}`, targetId: b.targetId, costUsd: b.costUsd };
  }
  return null;
}

function attachArtifact(graph: ClusterGraph, focusId: string, artifact: Artifact): ClusterGraph {
  return {
    ...graph,
    clusters: graph.clusters.map((c) =>
      c.id === focusId ? { ...c, artifacts: [...c.artifacts, artifact] } : c,
    ),
  };
}

/** Attach many artifacts to a cluster, skipping ids it already has (idempotent re-gather). */
function attachMany(graph: ClusterGraph, focusId: string, arts: Artifact[]): ClusterGraph {
  return {
    ...graph,
    clusters: graph.clusters.map((c) => {
      if (c.id !== focusId) return c;
      const have = new Set(c.artifacts.map((a) => a.id));
      const add = arts.filter((a) => !have.has(a.id));
      return add.length ? { ...c, artifacts: [...c.artifacts, ...add] } : c;
    }),
  };
}

export interface GatherResult { graph: ClusterGraph; found: number }

/** REAL media (free, no key): Wikipedia overview + images → attached as artifacts on the cluster. */
export async function gatherWikiMedia(graph: ClusterGraph, focusId: string): Promise<GatherResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, found: 0 };
  const { images, overview, overviewUrl } = await fetchWikipedia(focus.title);
  const arts: Artifact[] = [];
  if (overview) arts.push({ id: 'overview', kind: 'research', title: `Overview: ${focus.title}`, detail: overview, url: overviewUrl, source: 'wikipedia' });
  images.forEach((im, i) => arts.push({ id: `wiki-img-${i}`, kind: 'image', title: im.title || focus.title, url: im.url, thumb: im.thumb, source: im.source }));
  if (!arts.length) return { graph, found: 0 };
  return { graph: attachMany(graph, focusId, arts), found: arts.length };
}

export { perplexityAvailable, serperAvailable, discoverAvailable };

/**
 * REAL "interesting search": a synthesized understanding (Perplexity Sonar) + real Google images
 * (Serper) + sources, attached to the cluster. Perplexity's understanding overwrites the lighter
 * exploreLeads one. Returns found:0 when nothing came back (no key / CORS / quota) so the caller
 * falls back to Wikipedia.
 */
export async function gatherDiscover(graph: ClusterGraph, focusId: string): Promise<GatherResult & { costUsd: number }> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, found: 0, costUsd: 0 };
  const [d, serpImgs] = await Promise.all([
    perplexityAvailable() ? perplexityDiscover(focus.title) : Promise.resolve(null),
    serperAvailable() ? serperImages(focus.title) : Promise.resolve([]),
  ]);
  const overview = d?.overview ?? '';
  const sources = d?.sources ?? [];
  const images = serpImgs.length ? serpImgs : (d?.images ?? []); // prefer Google images
  if (!overview && !images.length) return { graph, found: 0, costUsd: 0 };
  const arts: Artifact[] = [];
  if (overview) arts.push({ id: 'understanding', kind: 'research', title: `Understanding: ${focus.title}`, detail: overview, source: 'perplexity' });
  images.forEach((im, i) => arts.push({ id: `disc-img-${i}`, kind: 'image', title: im.title || focus.title, url: im.url, thumb: im.thumb, source: im.source }));
  sources.forEach((s, i) => arts.push({ id: `src-${i}`, kind: 'link', title: (s.title || s.url).slice(0, 90), url: s.url, source: 'web' }));
  // only replace the understanding if we actually got a new one
  const cleaned: ClusterGraph = overview
    ? { ...graph, clusters: graph.clusters.map((c) => (c.id === focusId ? { ...c, artifacts: c.artifacts.filter((a) => a.id !== 'understanding') } : c)) }
    : graph;
  return { graph: attachMany(cleaned, focusId, arts), found: arts.length, costUsd: d?.costUsd ?? 0 };
}

/** REAL explainer videos via web_search (Anthropic) → video artifacts; falls back to a search link. */
export async function gatherVideos(graph: ClusterGraph, focusId: string): Promise<GatherResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, found: 0 };
  let videos = serperAvailable() ? await serperVideos(focus.title) : [];
  if (!videos.length) videos = (await fetchYouTube(focus.title)).videos; // fallback to web_search
  const arts: Artifact[] = videos.length
    ? videos.map((v, i) => ({ id: `yt-${v.videoId ?? i}`, kind: 'video' as const, title: v.title, url: v.url, thumb: v.thumb, source: 'youtube' }))
    : [{ id: 'yt-search', kind: 'video' as const, title: `Search YouTube: ${focus.title}`, url: youTubeSearchUrl(focus.title), source: 'youtube' }];
  return { graph: attachMany(graph, focusId, arts), found: videos.length };
}

/** Generate a short-form VIDEO concept for a cluster and attach it as an artifact. */
export async function generateVideoArtifact(graph: ClusterGraph, focusId: string): Promise<ClusterResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0 };
  const out = await shortScriptDirect({ topic: focus.title, goal: focus.summary, platform: 'short-form (Reels/Shorts/TikTok)' });
  const detail = [out.hook && `HOOK: ${out.hook}`, out.script && `SCRIPT: ${out.script}`, out.cta && `CTA: ${out.cta}`]
    .filter(Boolean)
    .join('\n');
  const artifact: Artifact = { id: slugify(`video ${focus.title}`), kind: 'video', title: `Video concept: ${focus.title}`, detail, source: 'generated' };
  return { graph: attachArtifact(graph, focusId, artifact), costUsd: (out.costUsd as number) ?? 0 };
}

/** Generate an IMAGE concept (a prompt) for a cluster and attach it as an artifact. */
export async function generateImageArtifact(graph: ClusterGraph, focusId: string): Promise<ClusterResult> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return { graph, costUsd: 0 };
  const r = await rawComplete(
    [
      { role: 'system', content: IMAGE_CONCEPT_SYSTEM },
      { role: 'user', content: buildImageUser(focus) },
    ],
    600,
  );
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let parsed: { title?: string; prompt?: string; style?: string } = {};
  try { parsed = extractJson(r.text); } catch { parsed = { prompt: r.text }; }
  const artifact: Artifact = {
    id: slugify(`image ${focus.title}`),
    kind: 'image',
    title: parsed.title?.trim() || `Image concept: ${focus.title}`,
    detail: [parsed.prompt, parsed.style && `Style: ${parsed.style}`].filter(Boolean).join('\n'),
    source: 'generated',
  };
  return { graph: attachArtifact(graph, focusId, artifact), costUsd };
}

/**
 * "Similar ideas" for a focus cluster. Uses embeddings (cross-domain matches) when available,
 * blended with structural relations; falls back to the pure lexical relatedClusters otherwise.
 */
export async function findSimilarClusters(graph: ClusterGraph, focusId: string): Promise<RelatedCluster[]> {
  const focus = graph.clusters.find((c) => c.id === focusId);
  if (!focus) return [];
  const vecs = await embedTexts(graph.clusters.map(embedText));
  if (!vecs) return relatedClusters(graph, focusId); // lexical fallback
  // Embedding cosine over the full set, fed into the structural blend in relatedClusters.
  const fi = graph.clusters.findIndex((c) => c.id === focusId);
  const rowByTitle = new Map(graph.clusters.map((c, i) => [c.title, i]));
  return relatedClusters(graph, focusId, {
    similarity: (_focusTitle, otherTitle) => {
      const oi = rowByTitle.get(otherTitle);
      return oi === undefined || fi < 0 ? 0 : cosine(vecs[fi], vecs[oi]);
    },
  });
}
