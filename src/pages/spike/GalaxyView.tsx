// src/pages/spike/GalaxyView.tsx
// THE FLOWMAP — clean, readable map of your whole exploration (breadth) + a persistent right DETAIL
// panel for the focused idea (depth). Matches the reference design: the map stays glanceable (nodes
// are small cards with a few bullet sub-points + a 📎 count + thumbnail; media shows as thumbnails);
// the deep content (overview, artifacts grid, connections, next-thoughts) lives in the right panel,
// NOT crammed into the center. Every idea you visit persists in an organized radial tree so you can
// zoom out and see how far you wandered. Drift by clicking a node, a glowing current, or thinking out loud.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowRight, ArrowLeft, ExternalLink, Maximize2, Layers, HelpCircle, Shuffle, Wand2, Clapperboard, Play, Loader2, Paperclip, GitBranch,
  Telescope, CircleHelp, FolderKanban, BookOpen, CheckCircle2, Moon, Link2, Image as ImageIcon, FileText, Lightbulb, Repeat2, X, Flame, Lock,
  Scale, Atom, ClipboardCheck, Split, FlaskConical,
} from 'lucide-react';
import {
  universeConnections, addChild, slugify, titleSimilarity, sceneOf,
  type ClusterGraph, type Cluster, type ClusterKind, type ClusterMaturity, type Artifact, type ExpandMode, type Lead, type LeadKind, type UniverseConnection, type CuriosityState, type ThinkSuggestion, type GarvisMind, type ScenePhase,
} from '../../lib/garvis/clustering';
import { composeScene, recordSceneGuess, streamOverview, fetchLeads, expandCluster, gatherWikiMedia, gatherDiscover, gatherVideos, findBridge, investigate, observe, reframe, updateMind, composeProspect, interpretThought, discoverAvailable, type Prospect, type Bridge, type Notice } from '../../lib/garvis/clusteringRun';
import { recordPick, kindBias } from '../../lib/garvis/currents';
import { compileBuildBrief } from '../../lib/garvis/buildBrief';
import { patchWorkingState } from '../../lib/garvis/workingStateRun';
import { serperRelated, serperAvailable, youTubeId } from '../../lib/garvis/discover';
import { addLoopPure, closeLoopsPure, epiphanyCount, newLoop, readLoops, writeLoops, type OpenLoop } from '../../lib/garvis/loops';
import SceneStage, { type StageCurrent } from './SceneStage';

// HARMONIZED PALETTE — warm ember family dominates (topic/idea/project/artifact differ by
// weight, not hue), with exactly two disciplined cool accents that each carry real meaning:
// question = cool blue (an open loop), investigation/mind = one violet (a deep dive). No neon
// rainbow fighting the forge brand.
const MIND_HEX = '#B98CE0'; // the single violet of Garvis's mind — matches investigation + tangent
type ViewerItem = { kind: 'image' | 'video' | 'link'; url: string; title: string };

const STAGE_W = 4000, STAGE_H = 4000, CX = STAGE_W / 2, CY = STAGE_H / 2;
const RING = 360;
const PREFETCH_N = 3;

const KIND_HEX: Record<ClusterKind, string> = {
  topic: '#F2A44D', idea: '#FFC061', project: '#E5631F', artifact: '#E0B36A', // warm family, by weight
  question: '#5AA9E6', investigation: '#B98CE0', // the two meaningful cool accents
  // Lab vocabulary joins the SAME discipline — warm family by weight, cool accents keep their meaning:
  claim: '#E0B36A', evidence: '#F2A44D', scenario: '#FFC061', insight: '#E5631F', // warm, by weight
  theory: '#B98CE0',      // a deep dive of explanation — investigation's violet
  experiment: '#5AA9E6',  // an open loop to close — question's blue
};
const KIND_ICON: Record<ClusterKind, typeof Sparkles> = {
  topic: Sparkles, question: CircleHelp, idea: Sparkles, investigation: Telescope, artifact: BookOpen, project: FolderKanban,
  claim: Scale, theory: Atom, evidence: ClipboardCheck, scenario: Split, experiment: FlaskConical, insight: Lightbulb,
};
const MATURITY_LABEL: Record<ClusterMaturity, string> = {
  spark: 'spark', growing: 'growing', mature: 'mature', building: 'building', finished: 'done', dormant: 'dormant', archived: 'archived',
};
const LEAD_ICON: Record<LeadKind, typeof ArrowRight> = { dig: ArrowRight, question: HelpCircle, tangent: Shuffle };
const LEAD_HEX: Record<LeadKind, string> = { dig: '#F2A44D', question: '#5AA9E6', tangent: '#B98CE0' };
const leadToKind = (k: LeadKind): ClusterKind => (k === 'question' ? 'question' : k === 'tangent' ? 'idea' : 'topic');

const imagesOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'image' && (a.thumb || a.url));
const videosOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'video');
const linksOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'link');
const understandingOf = (c: Cluster) => c.artifacts.find((a) => a.id === 'understanding') ?? c.artifacts.find((a) => a.kind === 'research');
const firstImage = (c: Cluster) => imagesOf(c)[0]?.thumb;

interface Pos { x: number; y: number; depth: number }
function layoutTree(g: ClusterGraph): Map<string, Pos> {
  const childrenOf = new Map<string, Cluster[]>();
  for (const c of g.clusters) if (c.parentId) { const a = childrenOf.get(c.parentId) ?? []; a.push(c); childrenOf.set(c.parentId, a); }
  const roots = g.clusters.filter((c) => !c.parentId);
  const pos = new Map<string, Pos>();
  const leaves = (n: Cluster): number => { const k = childrenOf.get(n.id) ?? []; return k.length ? k.reduce((s, c) => s + leaves(c), 0) : 1; };
  const total = Math.max(1, roots.reduce((s, r) => s + leaves(r), 0));
  const assign = (n: Cluster, depth: number, a0: number, a1: number): number => {
    const kids = childrenOf.get(n.id) ?? [];
    let angle: number;
    if (!kids.length) angle = (a0 + a1) / 2;
    else { let cur = a0; const span = a1 - a0; const tot = Math.max(1, leaves(n)); const angles = kids.map((k) => { const w = leaves(k) / tot; const na = assign(k, depth + 1, cur, cur + span * w); cur += span * w; return na; }); angle = angles.reduce((s, x) => s + x, 0) / angles.length; }
    const r = depth * RING;
    pos.set(n.id, { x: CX + r * Math.cos(angle - Math.PI / 2), y: CY + r * Math.sin(angle - Math.PI / 2), depth });
    return angle;
  };
  let c0 = 0;
  for (const r of roots) { const w = leaves(r) / total; assign(r, 0, c0, c0 + Math.PI * 2 * w); c0 += Math.PI * 2 * w; }
  return pos;
}
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, off = Math.min(46, len * 0.1);
  return `M ${x1} ${y1} Q ${mx - (dy / len) * off} ${my + (dx / len) * off}, ${x2} ${y2}`;
}

interface Props {
  graph: ClusterGraph;
  setGraph: (g: ClusterGraph) => void;
  focusId: string | null;
  setFocusId: (id: string) => void;
  onCost?: (usd: number) => void;
  /** stable key for the per-world open-loop ledger */
  worldKey?: string;
}

export default function GalaxyView({ graph, setGraph, focusId, setFocusId, onCost, worldKey = 'local' }: Props) {
  const navigate = useNavigate();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.85);
  const [busy, setBusy] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [loading, setLoading] = useState({ answer: false, media: false, video: false });
  const [, setReadyTick] = useState(0);
  const [thought, setThought] = useState('');
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState('');
  const [streamText, setStreamText] = useState('');
  const [streamPhase, setStreamPhase] = useState<ScenePhase>(''); // which scene part is composing
  const [panelW, setPanelW] = useState(() => { const v = Number(localStorage.getItem('ff:panelw')); return v >= 280 ? Math.min(v, 720) : 360; });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticing, setNoticing] = useState(false);
  const [mind, setMind] = useState<GarvisMind | null>(() => { try { const r = localStorage.getItem('ff:mind:v1'); return r ? (JSON.parse(r) as GarvisMind) : null; } catch { return null; } });
  const [suggestion, setSuggestion] = useState<ThinkSuggestion | null>(null);
  const [viewer, setViewer] = useState<ViewerItem | null>(null);
  // OPEN LOOPS — the questions Garvis named that you haven't chased (embers on the map's edge)
  const [loops, setLoops] = useState<OpenLoop[]>(() => readLoops(worldKey));
  const [whisper, setWhisper] = useState(false);      // "had this one ready for you"
  const [nudge, setNudge] = useState<Lead | null>(null); // patch-leaving: the richer vein
  const [mapMode, setMapMode] = useState(false);      // zoomed out to the constellation vs. in the scene
  const [showPanel, setShowPanel] = useState(false);  // scene-mode depth drawer (details on demand)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const leadsCache = useRef<Record<string, Lead[]>>({});
  const leadsRef = useRef<Lead[]>([]);
  const whisperT = useRef(0);
  const prefetch = useRef<Record<string, Prospect | 'loading'>>({});
  const liveRef = useRef<{ graph: ClusterGraph; focusId: string | null; mind: GarvisMind | null }>({ graph, focusId, mind });
  const noticingRef = useRef(false);
  const lastObs = useRef(0);
  const recentUtter = useRef<string[]>([]);
  const lastMind = useRef(0);
  const refreshRef = useRef<() => void>(() => {});
  liveRef.current = { graph, focusId, mind };
  leadsRef.current = leads;

  useEffect(() => { setLoops(readLoops(worldKey)); }, [worldKey]);
  const updateLoops = (fn: (l: OpenLoop[]) => OpenLoop[]) =>
    setLoops((prev) => { const nxt = fn(prev); writeLoops(worldKey, nxt); return nxt; });

  const byId = useMemo(() => new Map(graph.clusters.map((c) => [c.id, c])), [graph]);
  const positions = useMemo(() => layoutTree(graph), [graph]);
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Cluster[]>();
    for (const c of graph.clusters) if (c.parentId) { const a = m.get(c.parentId) ?? []; a.push(c); m.set(c.parentId, a); }
    return m;
  }, [graph]);
  const roots = useMemo(() => graph.clusters.filter((c) => !c.parentId), [graph]);
  const focus = (focusId && byId.get(focusId)) || roots[0] || graph.clusters[0] || null;
  const parent = focus?.parentId ? byId.get(focus.parentId) : null;
  const connections = focus ? universeConnections(graph, focus.id) : [];

  useEffect(() => {
    if (!focus) return;
    const id = focus.id;
    const c0 = byId.get(id)!;
    setLeads(leadsCache.current[id] ?? sceneOf(c0)?.currents ?? []); setBridge(null); setStreamText(''); setStreamPhase(''); setSuggestion(null); setViewer(null); setNudge(null); setShowPanel(false);
    let cancelled = false;
    const trail = parent ? [parent.title] : [];
    const needAnswer = !c0.artifacts.some((a) => a.id === 'scene') && !c0.artifacts.some((a) => a.id === 'understanding');
    const needMedia = !c0.artifacts.some((a) => a.kind === 'image');
    const needVideo = !c0.artifacts.some((a) => a.kind === 'video');
    setLoading({ answer: needAnswer, media: needMedia, video: needVideo });
    setErr('');
    (async () => {
      let g = graph;
      if (needAnswer) {
        let gotLeads: Lead[] = [];
        try {
          // THE SCENE — one call composes the curiosity loop; the gap paints as it streams and the
          // phase line narrates the invisible tail (options/beats/currents) so it never reads stalled
          const sr = await composeScene(g, id, trail, (t, phase) => { if (!cancelled) { setStreamText(t); setStreamPhase(phase); } });
          if (cancelled) return;
          setStreamPhase('');
          if (sr.costUsd) onCost?.(sr.costUsd);
          if (sr.scene) {
            g = sr.graph; setGraph(g); setStreamText('');
            gotLeads = sr.leads; leadsCache.current[id] = sr.leads; setLeads(sr.leads);
            if (sr.scene.regap) updateLoops((l) => addLoopPure(l, newLoop(sr.scene!.regap, id)));
          } else {
            // classic fallback: streamed overview + separate currents (a bad JSON never dead-ends the map)
            const so = await streamOverview(g, id, trail, (t) => { if (!cancelled) setStreamText(t); });
            if (cancelled) return;
            g = so.graph; setGraph(g); if (so.costUsd) onCost?.(so.costUsd);
            const lr = await fetchLeads(g, id, trail);
            if (cancelled) return;
            g = lr.graph; gotLeads = lr.leads; leadsCache.current[id] = lr.leads; setLeads(lr.leads); setGraph(g); if (lr.costUsd) onCost?.(lr.costUsd);
          }
          if (serperAvailable()) void serperRelated(focus.title).then((rels) => {
            if (cancelled || !rels.length) return;
            const have = new Set(gotLeads.map((l) => slugify(l.label))); const merged = [...gotLeads];
            for (const q of rels) { const k = slugify(q); if (!have.has(k)) { have.add(k); merged.push({ label: q, kind: /\?\s*$/.test(q) ? 'question' : 'dig' }); } }
            leadsCache.current[id] = merged; setLeads(merged);
          }).catch(() => {});
        } catch (e) { if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not compose this idea — try again in a moment.'); }
        finally { if (!cancelled) setLoading((l) => ({ ...l, answer: false })); }
      }
      // Slow gathers (Serper/Wikipedia/YouTube) finish long after the user may have guessed or dived.
      // Writing their whole result graph back would clobber that state (the guess-then-snap-back bug),
      // so merge only the NEW artifacts for this cluster into the LIVE graph.
      const adoptMedia = (res: ClusterGraph) => {
        const upd = res.clusters.find((c) => c.id === id);
        if (!upd) return;
        const live = liveRef.current.graph;
        let changed = false;
        const merged = live.clusters.map((c) => {
          if (c.id !== id) return c;
          const have = new Set(c.artifacts.map((a) => a.id));
          const fresh = upd.artifacts.filter((a) => !have.has(a.id));
          if (!fresh.length) return c;
          changed = true;
          return { ...c, artifacts: [...c.artifacts, ...fresh] };
        });
        if (changed) { g = { ...live, clusters: merged }; setGraph(g); }
      };
      if (needMedia && !cancelled) {
        try {
          let got = false;
          if (discoverAvailable()) { const r = await gatherDiscover(g, id); if (!cancelled && r.found) { adoptMedia(r.graph); if (r.costUsd) onCost?.(r.costUsd); got = true; } }
          if (!got && !cancelled) { const w = await gatherWikiMedia(g, id); if (!cancelled && w.found) adoptMedia(w.graph); }
        } catch { /* best-effort */ }
        finally { if (!cancelled) setLoading((l) => ({ ...l, media: false })); }
      }
      if (needVideo && !cancelled) {
        try { const r = await gatherVideos(g, id); if (!cancelled && r.found) adoptMedia(r.graph); } catch { /* best-effort */ }
        finally { if (!cancelled) setLoading((l) => ({ ...l, video: false })); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id]);

  useEffect(() => {
    if (!focus || !leads.length) return;
    const trail = [parent?.title, focus.title].filter(Boolean) as string[];
    const bias = kindBias();
    // the regap is the hottest open loop — always hold ITS answer too (the sealed-envelope law)
    const regap = sceneOf(focus)?.regap;
    const cands: Lead[] = [...(regap ? [{ label: regap, kind: 'question' as LeadKind }] : []), ...[...leads].sort((a, b) => bias[b.kind] - bias[a.kind])];
    const top = cands.slice(0, PREFETCH_N);
    let cancelled = false;
    (async () => {
      for (const l of top) {
        const key = slugify(l.label);
        if (prefetch.current[key]) continue;
        prefetch.current[key] = 'loading'; setReadyTick((t) => t + 1);
        try { const p = await composeProspect(l.label, trail); prefetch.current[key] = p; if (!cancelled && p.costUsd) onCost?.(p.costUsd); }
        catch { delete prefetch.current[key]; }
        finally { setReadyTick((t) => t + 1); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, leads]);

  // PATCH-LEAVING (foraging law): when this idea has been consumed and dwell runs long, point at the
  // richer vein instead of letting the session stall out. One calm line, never a popup.
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => {
      const { graph: g, focusId: fid } = liveRef.current;
      if (!fid) return;
      const f = g.clusters.find((x) => x.id === fid);
      if (!f) return;
      const revealed = sceneOf(f) ? sceneOf(f)!.guessed !== undefined : f.artifacts.some((a) => a.id === 'understanding');
      if (!revealed) return;
      const kids = new Set(g.clusters.filter((x) => x.parentId === fid).map((x) => slugify(x.title)));
      const next = leadsRef.current.find((l) => !kids.has(slugify(l.label)));
      if (next) setNudge(next);
    }, 45000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id]);

  useEffect(() => {
    if (!focus) return;
    const p = positions.get(focus.id);
    if (p) setPan({ x: -(p.x - CX) * scale, y: -(p.y - CY) * scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id]);

  // HEARTBEAT — Garvis quietly looks at your universe and surfaces unprompted insights (Jarvis "ahead of you").
  // Only fires when the universe grew since last time, on a calm cadence, never interrupting.
  useEffect(() => {
    const tick = async () => {
      const { graph: g, focusId: fid, mind: md } = liveRef.current;
      if (g.clusters.length < 4 || g.clusters.length === lastObs.current || noticingRef.current) return;
      noticingRef.current = true; setNoticing(true); lastObs.current = g.clusters.length;
      try {
        const n = await observe(g, { anchorId: fid ?? undefined, mind: md });
        if (n) { setNotices((prev) => (prev.some((x) => x.text === n.text) ? prev : [n, ...prev].slice(0, 3))); if (n.costUsd) onCost?.(n.costUsd); }
      } finally { noticingRef.current = false; setNoticing(false); }
    };
    const iv = window.setInterval(tick, 90000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GARVIS'S MIND — persist the evolving inner model, and re-read it a few seconds after the gaze settles on a new idea.
  useEffect(() => { if (mind) { try { localStorage.setItem('ff:mind:v1', JSON.stringify(mind)); } catch { /* ignore */ } } }, [mind]);
  useEffect(() => {
    const t = window.setTimeout(() => refreshRef.current(), 4500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id]);

  if (!focus) return <p className="p-6 text-sm text-forge-dim">Name a curiosity to begin.</p>;

  // DIVE-AS-TRAVEL — a transition isn't a hard cut. Navigation happens immediately (the known-good
  // batched path), while two things make it read as MOTION THROUGH SPACE: (1) the map camera glides to
  // the destination node — set here for existing nodes, and the focus-change effect handles fresh dive
  // children once the layout recomputes; the .fm-stage's own .6s transform transition animates it.
  // (2) the scene wrapper is keyed by focus.id, so each new idea REMOUNTS and blooms in via ku-warp-in
  // (arrives from far — scale-up + deblur + fade). Reduced-motion users get an instant swap (index.css
  // zeroes animation durations globally).
  const travel = (id: string) => {
    if (id === focus.id && !mapMode) return;
    setMapMode(false);
    const target = positions.get(id);
    if (target) setPan({ x: -(target.x - CX) * scale, y: -(target.y - CY) * scale });
    if (id !== focus.id) { setFocusId(id); setBridge(null); }
  };
  const dive = (lead: Lead) => {
    recordPick(lead.kind);
    const { graph: g2, id } = addChild(graph, focus.id, { title: lead.label, kind: leadToKind(lead.kind) });
    if (!id) return;
    const p = prefetch.current[slugify(lead.label)];
    if (p && p !== 'loading') {
      const arts: Artifact[] = [...(p.scene ? [p.scene] : []), ...(p.understanding ? [p.understanding] : []), ...p.images];
      leadsCache.current[id] = p.leads;
      setGraph({ ...g2, clusters: g2.clusters.map((c) => (c.id === id ? { ...c, summary: p.summary || c.summary, trajectory: p.trajectory ?? c.trajectory, artifacts: [...arts, ...c.artifacts] } : c)) });
      // the anticipation, caught in the act — only whisper when it's TRUE
      setWhisper(true);
      window.clearTimeout(whisperT.current);
      whisperT.current = window.setTimeout(() => setWhisper(false), 2600);
    } else setGraph(g2);
    // chasing a question retires its ember (belief resolution: closed loops leave the stage)
    updateLoops((l) => closeLoopsPure(l, lead.label).kept);
    travel(id);
  };
  // Every action surfaces its failure. These were try/finally with no catch (deep scan P1): a
  // signed-out or out-of-credits throw became an unhandled rejection — the spinner stopped and
  // nothing happened, with no word to the user. setErr paints the banner at the top of the map.
  const say = (e: unknown, fallback: string) => setErr(e instanceof Error ? e.message : fallback);
  const run = async (label: string, fn: () => Promise<{ graph?: ClusterGraph; costUsd?: number }>) => {
    setBusy(label); setErr('');
    try { const res = await fn(); if (res.graph) setGraph(res.graph); if (res.costUsd) onCost?.(res.costUsd); }
    catch (e) { say(e, 'That didn\'t go through — try again in a moment.'); }
    finally { setBusy(null); }
  };
  const expand = (m: ExpandMode) => run(`x:${m}`, () => expandCluster(graph, focus.id, m));
  const surprise = async () => {
    setBusy('bridge'); setErr('');
    try { const b = await findBridge(graph, focus.id); if (b) { setBridge(b); if (b.costUsd) onCost?.(b.costUsd); } }
    catch (e) { say(e, 'Couldn\'t find a surprising connection right now.'); }
    finally { setBusy(null); }
  };
  const runInvestigation = async () => {
    setBusy('investigate'); setErr('');
    try { const r = await investigate(graph, focus.id, (g) => setGraph(g)); if (r.costUsd) onCost?.(r.costUsd); }
    catch (e) { say(e, 'The investigation stalled — try again in a moment.'); }
    finally { setBusy(null); }
  };
  const think = async () => {
    const u = thought.trim();
    if (!u || thinking) return;
    // FAST PATH — a clear question skips the interpret round-trip (dead air before any paint):
    // open its node NOW so the scene starts composing immediately, and re-read the mind after.
    // Matches an existing child first so re-asking doesn't spawn a duplicate.
    if (/\?\s*$/.test(u)) {
      recentUtter.current = [u, ...recentUtter.current].slice(0, 3);
      setThought(''); setSuggestion(null);
      const kids = graph.clusters.filter((c) => c.parentId === focus.id);
      const match = kids.map((c) => ({ c, s: titleSimilarity(c.title, u) })).sort((a, b) => b.s - a.s)[0];
      if (match && match.s >= 0.45) travel(match.c.id);
      else dive({ label: u, kind: 'question' });
      lastMind.current = 0; void refreshMind();
      return;
    }
    setThinking(true);
    try {
      const res = await interpretThought(graph, focus.id, u);
      if (res.costUsd) onCost?.(res.costUsd);
      recentUtter.current = [u, ...recentUtter.current].slice(0, 3);
      setThought(''); setGraph(res.graph); setSuggestion(res.suggestion ?? null);
      if (res.state) setMind((m) => (m ? { ...m, state: res.state! } : { intent: '', state: res.state!, nextDirections: [], anomaly: '', confidence: 0.4, updatedAt: '' }));
      if (res.focusId !== focus.id) {
        const nt = res.graph.clusters.find((c) => c.id === res.focusId)?.title;
        if (nt) updateLoops((l) => closeLoopsPure(l, nt).kept);
        travel(res.focusId);
      }
      lastMind.current = 0; void refreshMind(); // re-read the mind after a thought
    } catch (e) { say(e, 'Couldn\'t work that thought through — try rephrasing.'); }
    finally { setThinking(false); }
  };
  const reframeFocus = async () => {
    setBusy('reframe'); setStreamText(''); setErr('');
    try { const r = await reframe(graph, focus.id, (t) => setStreamText(t)); if (r.costUsd) onCost?.(r.costUsd); setGraph(r.graph); }
    catch (e) { say(e, 'Couldn\'t reframe this one right now.'); }
    finally { setBusy(null); }
  };
  const actSuggestion = (s: ThinkSuggestion) => {
    setSuggestion(null);
    if (s.action === 'investigate') runInvestigation();
    else if (s.action === 'reframe') reframeFocus();
    else if (s.action === 'deeper') expand('deeper');
  };
  // refresh GARVIS'S MIND from the path through ideas + recent thoughts (throttled)
  const refreshMind = async () => {
    const { graph: g, focusId: fid } = liveRef.current;
    if (!fid) return;
    const now = Date.now();
    if (now - lastMind.current < 15000) return;
    lastMind.current = now;
    const m = new Map(g.clusters.map((c) => [c.id, c]));
    const path: string[] = [];
    for (let cur = m.get(fid)?.parentId ?? null, gd = 0; cur && gd < 32; gd++) { const c = m.get(cur); if (!c) break; path.unshift(c.title); cur = c.parentId; }
    path.push(m.get(fid)?.title ?? '');
    try { const r = await updateMind(g, fid, path, recentUtter.current); if (r) { setMind({ ...r.mind, updatedAt: new Date().toISOString() }); if (r.costUsd) onCost?.(r.costUsd); } } catch { /* mind is best-effort */ }
  };
  refreshRef.current = refreshMind;

  // THE DOOR TO WORK MODE — compile the whole exploration (this idea + the reasoning thread that led
  // here + the branches/variations + gathered research/sources + the open questions I'm still chasing)
  // into a structured brief, so a rabbit hole becomes a fully-briefed build instead of a thin seed I'd
  // have to re-explain. The brief is too big for a URL, so it rides in localStorage; NewProject writes
  // it into the project Brain (persists into every future edit) and feeds it into the first generation.
  const buildThis = async () => {
    const compiled = compileBuildBrief(graph, focus.id, { openQuestions: leads.map((l) => l.label) });
    if (!compiled) return;
    try { localStorage.setItem('ff:build-brief', JSON.stringify(compiled)); } catch { /* falls back to prompt-only seed */ }
    // THE BATON (app_0052): the brief also rides the working_state row — tab/device/cache-proof.
    // AWAITED (review fix): fire-and-forget raced NewProject's consume-and-clear — the clear could
    // land first and the set second, re-staging a consumed brief on the row forever.
    await patchWorkingState({ build_brief: { brief: compiled as unknown as Record<string, unknown>, world: null } }).catch(() => { /* localStorage carries it */ });
    navigate('/new?from=constellation');
  };

  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); setScale((s) => Math.min(1.8, Math.max(0.16, s * (1 - e.deltaY * 0.0012)))); };
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }; };
  const onMove = (e: React.MouseEvent) => { if (drag.current) { if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 3) drag.current.moved = true; setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }); } };
  // Release AFTER the click event fires — node onClick guards check drag.current.moved, so a drag
  // that ends on a card must not read as a click (grab-anywhere panning starts on cards too now).
  const onUp = () => { const d = drag.current; if (!d) return; window.setTimeout(() => { if (drag.current === d) drag.current = null; }, 0); };
  const fit = () => { const p = positions.get(focus.id); setScale(0.85); if (p) setPan({ x: -(p.x - CX) * 0.85, y: -(p.y - CY) * 0.85 }); };
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = panelW;
    const move = (ev: MouseEvent) => setPanelW(Math.max(280, Math.min(720, startW + (startX - ev.clientX))));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); setPanelW((w) => { try { localStorage.setItem('ff:panelw', String(w)); } catch { /* ignore */ } return w; }); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  const hex = KIND_HEX[focus.kind];
  const focusPos = positions.get(focus.id) ?? { x: CX, y: CY, depth: 0 };
  const compact = scale < 0.55; // zoomed out → declutter to titles only
  // the active thread (root → focus → its children) stays bright; the rest of the sprawl dims back
  const activeIds = new Set<string>([focus.id]);
  { let cur = focus.parentId; let g = 0; while (cur && g++ < 64) { activeIds.add(cur); cur = byId.get(cur)?.parentId ?? null; } }
  for (const c of graph.clusters) if (c.parentId === focus.id) activeIds.add(c.id);
  const focusChildSlugs = new Set((childrenByParent.get(focus.id) ?? []).map((c) => slugify(c.title)));
  // Ghost leads ring the hub. Fewer of them, pushed further out than the child cards + media halo,
  // so the rings can't collide. The tease/epiphany detail lives in the scene rail, NOT on the map.
  const ghosts = leads.filter((l) => !focusChildSlugs.has(slugify(l.label))).slice(0, 6);
  const GHOST_R = 640;

  // GARVIS'S MIND, made visible — ideas that match where the thinking is heading (intent + next directions)
  // softly brighten and gain a violet aura. No words; the map just leans toward what's alive.
  const mindTerms = [mind?.intent, ...(mind?.nextDirections ?? [])].map((s) => (s ?? '').trim()).filter(Boolean);
  const affinity = (c: Cluster) => (mindTerms.length ? Math.max(0, ...mindTerms.map((t) => titleSimilarity(c.title, t))) : 0);

  // the subject's own media, scattered as floating tiles ringing the hub (the "Stark constellation")
  const halo = [
    ...imagesOf(focus).slice(0, 6).map((a) => ({ kind: 'img' as const, url: a.url || a.thumb || '', thumb: a.thumb || a.url || '', title: a.title })),
    ...videosOf(focus).slice(0, 2).map((v) => ({ kind: 'vid' as const, url: v.url, thumb: v.thumb || '', title: v.title })),
  ];
  const RMEDIA = 310; // the bloom is bigger than the old focus card — the constellation rings wider
  const haloPos = (i: number) => { const t = -Math.PI / 2 + (i / Math.max(1, halo.length)) * Math.PI * 2 + 0.5; return { x: focusPos.x + RMEDIA * Math.cos(t), y: focusPos.y + RMEDIA * Math.sin(t) }; };

  // ---- props for the cinematic SceneStage (the full-canvas "you are here") ----
  const stageTrail: string[] = [];
  { let cur = focus.parentId, gd = 0; const acc: string[] = []; while (cur && gd++ < 12) { const c = byId.get(cur); if (!c) break; acc.unshift(c.title); cur = c.parentId; } stageTrail.push(...acc); }
  const stageHero = imagesOf(focus)[0]?.url || imagesOf(focus)[0]?.thumb;
  const stageGallery = [
    ...imagesOf(focus).slice(1, 5).map((a) => ({ url: a.url || a.thumb || '', thumb: a.thumb || a.url || '', title: a.title, video: false })),
    ...videosOf(focus).slice(0, 2).map((v) => ({ url: v.url || '', thumb: v.thumb || '', title: v.title, video: true })),
  ].filter((m) => m.thumb);
  const stageCurrents: StageCurrent[] = ghosts.map((l) => {
    const pf = prefetch.current[slugify(l.label)];
    return { lead: l, ready: !!pf && pf !== 'loading', epiphany: epiphanyCount(l.label, loops) };
  });

  // minimap — a tiny overview of the whole sprawl so you stay oriented
  const pts = [...positions.entries()];
  const xsA = pts.map(([, p]) => p.x), ysA = pts.map(([, p]) => p.y);
  const minX = Math.min(...xsA), maxX = Math.max(...xsA), minY = Math.min(...ysA), maxY = Math.max(...ysA);
  const MW = 150, MH = 110, mpad = 12;
  const mscale = Math.min((MW - 2 * mpad) / Math.max(1, maxX - minX), (MH - 2 * mpad) / Math.max(1, maxY - minY), 0.06);
  const mmx = (x: number) => mpad + (x - minX) * mscale + (MW - 2 * mpad - (maxX - minX) * mscale) / 2;
  const mmy = (y: number) => mpad + (y - minY) * mscale + (MH - 2 * mpad - (maxY - minY) * mscale) / 2;

  return (
    <div className="flex h-full gap-3 p-3">
      {/* ---------- THE MAP ---------- */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-forge-border">
        <style>{`
          @keyframes fm-dash { to { stroke-dashoffset:-20 } }
          @keyframes fm-tw { 0%,100%{opacity:.22} 50%{opacity:.6} }
          @keyframes fm-breathe { 0%,100% { opacity:.3; transform:translate(-50%,-50%) scale(1) } 50% { opacity:.55; transform:translate(-50%,-50%) scale(1.12) } }
          .fm-node { transition: opacity .4s ease; }
          .fm-stage { transition: transform .6s cubic-bezier(.22,.9,.24,1); }
          .fm-flow { stroke-dasharray: 3 7; animation: fm-dash 1.2s linear infinite; }
          .fm-tw { animation: fm-tw 5s ease-in-out infinite; }
          .fm-breathe { animation: fm-breathe 6s ease-in-out infinite; }
          @keyframes fm-rise { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
          .fm-rise { animation: fm-rise .45s cubic-bezier(.2,.8,.2,1) both; }
          @keyframes ku-kb { from { transform: scale(1.06) translate(0,0) } to { transform: scale(1.16) translate(-2%, -2%) } }
          .ku-kb { animation: ku-kb 22s ease-in-out infinite alternate; }
          /* dive-as-travel: each new idea ARRIVES — blooms up from far (scale-up + deblur + fade) as
             the map camera glides to its node, so a dive reads as motion through space, not a cut. */
          @keyframes ku-warp-in { from { opacity:0; transform:scale(.9); filter:blur(9px) } to { opacity:1; transform:scale(1); filter:blur(0) } }
          .ku-warp-in { animation: ku-warp-in .66s cubic-bezier(.22,1,.36,1) both; transform-origin:center; will-change:transform,opacity,filter; }
        `}</style>
        <div className="absolute inset-0 cursor-grab active:cursor-grabbing" onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ background: `radial-gradient(1400px 900px at 50% 45%, ${hex}10, transparent 65%), radial-gradient(circle at 50% 50%, #0c0a14, #060509 82%) #060509` }}>
          <div className="fm-tw absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) .6px, transparent .6px)', backgroundSize: '130px 130px', transform: `translate(${pan.x * 0.03}px, ${pan.y * 0.03}px)` }} />
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)', backgroundSize: '60px 60px', transform: `translate(${pan.x * 0.08}px, ${pan.y * 0.08}px)`, opacity: 0.5 }} />
        </div>

        <div className="pointer-events-none absolute left-3 top-3 z-10 text-[11px] text-forge-dim/70">drag to roam · scroll to zoom out & see your whole rabbit hole · click any node</div>

        {/* OPEN QUESTIONS — the embers. Named gaps you haven't chased; each is one click from closing. */}
        {loops.length > 0 && (
          <div className="absolute left-3 top-9 z-10 w-60 space-y-1">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-amber-300/70"><Flame size={9} /> open questions · {loops.length}</div>
            {loops.slice(0, 4).map((l) => (
              <button key={l.id} onClick={() => dive({ label: l.text, kind: 'question' })}
                className="block w-full truncate rounded-lg border border-amber-400/25 bg-amber-400/5 px-2 py-1 text-left text-[10px] text-amber-100/80 backdrop-blur transition-colors hover:border-amber-400/50 hover:text-amber-50"
                title={l.text}>{l.text}</button>
            ))}
          </div>
        )}
        {err && <div className="absolute left-1/2 top-3 z-20 max-w-md -translate-x-1/2 rounded-lg border border-forge-err/40 bg-forge-err/15 px-3 py-1.5 text-center text-[11px] text-forge-err">{err}</div>}
        <button onClick={fit} className="absolute right-3 top-3 z-10 rounded-lg border border-forge-border bg-forge-panel/80 p-1.5 text-forge-dim hover:text-forge-ink" title="Recenter"><Maximize2 size={14} /></button>
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-forge-border bg-forge-panel/70 px-2 py-1 text-[10px] text-forge-dim">{graph.clusters.length} ideas explored</div>

        <div className="fm-stage absolute cursor-grab active:cursor-grabbing" onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ left: '50%', top: '50%', width: STAGE_W, height: STAGE_H, marginLeft: -CX, marginTop: -CY, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: 'center', transition: drag.current ? 'none' : undefined }}>
          <div className="fm-breathe pointer-events-none absolute rounded-full" style={{ left: focusPos.x, top: focusPos.y, width: 620, height: 620, background: `radial-gradient(circle, ${hex}1c, transparent 60%)` }} />
          <svg width={STAGE_W} height={STAGE_H} className="absolute inset-0" style={{ overflow: 'visible' }}>
            {graph.clusters.filter((c) => c.parentId && positions.get(c.id) && positions.get(c.parentId!)).map((c) => {
              const a = positions.get(c.parentId!)!; const b = positions.get(c.id)!;
              const onPath = c.id === focus.id || c.parentId === focus.id;
              return <path key={`e-${c.id}`} className={onPath ? 'fm-flow' : ''} d={edgePath(a.x, a.y, b.x, b.y)} fill="none" stroke={KIND_HEX[c.kind]} strokeWidth={onPath ? 2 : 1} strokeOpacity={onPath ? 0.6 : 0.2} strokeLinecap="round" />;
            })}
            {ghosts.map((l, i) => { const t = -Math.PI / 2 + (i / Math.max(1, ghosts.length)) * Math.PI * 2; const gx = focusPos.x + GHOST_R * Math.cos(t), gy = focusPos.y + GHOST_R * Math.sin(t); return <path key={`ge-${i}`} className="fm-flow" d={edgePath(focusPos.x, focusPos.y, gx, gy)} fill="none" stroke={LEAD_HEX[l.kind]} strokeWidth={1.2} strokeOpacity={0.32} strokeDasharray="2 6" />; })}
            {!compact && halo.map((m, i) => { const p = haloPos(i); return <path key={`me-${i}`} d={edgePath(focusPos.x, focusPos.y, p.x, p.y)} fill="none" stroke={hex} strokeWidth={1} strokeOpacity={0.22} strokeDasharray="1 6" />; })}
          </svg>

          {graph.clusters.map((c) => {
            const p = positions.get(c.id); if (!p) return null;
            const isFocus = c.id === focus.id;
            const active = activeIds.has(c.id);
            const aff = affinity(c);
            const onMind = aff > 0.5 && !isFocus;
            return (
              <div key={c.id} className="fm-node pointer-events-auto absolute" style={{ left: p.x, top: p.y, width: isFocus ? 244 : compact ? 150 : 196, transform: 'translate(-50%, -50%)', zIndex: isFocus ? 40 : active ? 20 : onMind ? 14 : 8, opacity: isFocus ? 1 : active ? 0.96 : Math.max(0.42, aff * 0.92) }}>
                {onMind && <span className="fm-breathe pointer-events-none absolute left-1/2 top-1/2 -z-10 rounded-full" style={{ width: 150, height: 150, transform: 'translate(-50%,-50%)', background: `radial-gradient(circle, ${MIND_HEX}38, transparent 70%)` }} />}
                <MapNode c={c} isFocus={isFocus} compact={compact && !isFocus} kids={childrenByParent.get(c.id) ?? []} onClick={() => { if (!drag.current?.moved) travel(c.id); }} />
              </div>
            );
          })}

          {/* the subject's media, ringing the hub — a constellation of content, not a card */}
          {!compact && halo.map((m, i) => {
            const p = haloPos(i);
            return (
              <button key={`m-${i}`} onClick={() => { if (!drag.current?.moved && m.url) setViewer({ kind: m.kind === 'vid' ? 'video' : 'image', url: m.url, title: m.title || focus.title }); }} title={m.title}
                className="fm-node pointer-events-auto absolute overflow-hidden rounded-xl border bg-forge-panel/80 transition-transform hover:scale-110"
                style={{ left: p.x, top: p.y, width: 94, height: 94, transform: 'translate(-50%,-50%)', borderColor: `${hex}55`, boxShadow: `0 0 18px -9px ${hex}`, zIndex: 16 }}>
                {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-forge-raised"><Play size={16} className="text-forge-dim" /></span>}
                {m.kind === 'vid' && <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Play size={18} className="text-white/90" /></span>}
              </button>
            );
          })}

          {ghosts.map((l, i) => {
            const t = -Math.PI / 2 + (i / Math.max(1, ghosts.length)) * Math.PI * 2;
            const gx = focusPos.x + GHOST_R * Math.cos(t), gy = focusPos.y + GHOST_R * Math.sin(t);
            const pf = prefetch.current[slugify(l.label)]; const ready = pf && pf !== 'loading';
            const lhex = LEAD_HEX[l.kind]; const LIcon = LEAD_ICON[l.kind];
            const ep = epiphanyCount(l.label, loops); // touching ≥2 open loops = an epiphany lure
            // Compact one-line lure on the map: icon + label, glow carries the "ready"/"epiphany"
            // signal. No tease, no epiphany sentence — that detail belongs in the scene, not the map.
            return (
              <div key={`g-${i}`} className="fm-node pointer-events-auto absolute" style={{ left: gx, top: gy, width: 184, transform: 'translate(-50%, -50%)', zIndex: 20 }}>
                <button onClick={() => { if (!drag.current?.moved) dive(l); }} title={l.tease || (ready ? 'Garvis is holding this answer' : l.label)}
                  className="group flex w-full items-center gap-1.5 rounded-full border bg-forge-panel/85 px-3 py-1.5 text-left backdrop-blur transition-all hover:scale-105"
                  style={{
                    borderColor: ep >= 2 ? '#fbbf2488' : ready ? `${lhex}77` : `${lhex}30`,
                    boxShadow: ep >= 2 ? '0 0 26px -8px #fbbf24' : ready ? `0 0 22px -8px ${lhex}` : 'none',
                  }}>
                  {ep >= 2 ? <Flame size={12} className="shrink-0 text-amber-300" /> : <LIcon size={12} style={{ color: lhex }} className="shrink-0" />}
                  <span className="truncate text-[11px] font-medium text-forge-ink/90 group-hover:text-forge-ink">{l.label}</span>
                  {ready ? <Lock size={9} className="ml-auto shrink-0" style={{ color: lhex }} /> : pf === 'loading' ? <Loader2 size={10} className="ml-auto shrink-0 animate-spin text-forge-dim/50" /> : null}
                </button>
              </div>
            );
          })}
        </div>

        {/* ============ THE SCENE — the full-canvas idea you're standing in (map is the zoom-out) ============ */}
        {!mapMode && (
          <div key={focus.id} className="absolute inset-0 z-30 ku-warp-in">
            <SceneStage
              focus={focus} scene={sceneOf(focus)} composing={loading.answer} partial={streamText} partialPhase={streamPhase} hex={hex}
              trail={stageTrail} heroUrl={stageHero} gallery={stageGallery} currents={stageCurrents}
              onGuess={(i) => setGraph(recordSceneGuess(graph, focus.id, i))}
              onDive={(l) => dive(l)}
              onOpenMedia={(m) => setViewer({ kind: m.video ? 'video' : 'image', url: m.url, title: m.title || focus.title })}
              onConstellation={() => setMapMode(true)}
              onDetails={() => setShowPanel(true)}
              onBuild={buildThis}
            />
          </div>
        )}
        {/* scene-mode depth drawer — the panel appears only when asked for, then gets out of the way */}
        {!mapMode && showPanel && (
          <div className="fm-rise absolute bottom-3 right-3 top-3 z-40 shadow-2xl" style={{ width: Math.min(panelW, 420) }}>
            <button onClick={() => setShowPanel(false)} className="absolute right-3 top-3 z-50 rounded-lg border border-forge-border bg-forge-panel/90 p-1 text-forge-dim hover:text-forge-ink" title="Close"><X size={13} /></button>
            <DetailPanel focus={focus} hex={hex} loading={loading} busy={busy} connections={connections} bridge={bridge} byId={byId} width={Math.min(panelW, 420)} streamText={streamText}
              onOpen={setViewer} onTravel={travel} onExpand={expand}
              onVideos={() => run('vid', () => gatherVideos(graph, focus.id))}
              onSurprise={surprise} onInvestigate={runInvestigation} />
          </div>
        )}
        {/* MEDIA VIEWER — center stage, over everything: images/videos open big, in place */}
        {viewer && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setViewer(null)}>
            <div className="relative h-full max-h-[680px] w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <Viewer item={viewer} hex={hex} onClose={() => setViewer(null)} />
            </div>
          </div>
        )}
        {/* zoomed OUT to the constellation — one tap back into the idea you were standing in */}
        {mapMode && (
          <button onClick={() => setMapMode(false)} className="absolute left-1/2 top-3 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-forge-ember/50 bg-forge-panel/90 px-3 py-1.5 text-[11px] font-medium text-forge-ember backdrop-blur transition-colors hover:bg-forge-ember/15">
            <ArrowLeft size={12} /> back to {focus.title.slice(0, 40)}
          </button>
        )}

        {/* GARVIS IS NOTICING — proactive, peripheral, calm. Surfaces unprompted insights about your universe. */}
        {(notices.length > 0 || noticing) && (
          <div className="absolute left-3 z-20 w-64 space-y-1.5" style={{ bottom: MH + 28 }}>
            {noticing && <div className="flex items-center gap-1.5 text-[10px] text-forge-ember/80"><Sparkles size={10} className="animate-pulse" /> Garvis is noticing…</div>}
            {notices.map((n) => {
              const NIcon = n.kind === 'pattern' ? Repeat2 : Lightbulb;
              const tint = n.kind === 'pattern' ? '#fbbf24' : '#a78bfa';
              return (
                <div key={n.id} className="fm-rise flex items-start gap-2 rounded-xl border bg-forge-panel/90 p-2.5 backdrop-blur" style={{ borderColor: `${tint}55`, boxShadow: `0 0 20px -10px ${tint}` }}>
                  <NIcon size={13} className="mt-0.5 shrink-0" style={{ color: tint }} />
                  <button onClick={() => n.targetId && travel(n.targetId)} className="flex-1 text-left text-[11px] leading-snug text-forge-dim hover:text-forge-ink">{n.text}</button>
                  <button onClick={() => setNotices((p) => p.filter((x) => x.id !== n.id))} className="shrink-0 text-forge-dim/40 hover:text-forge-dim"><X size={11} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* minimap — overview of the whole rabbit hole */}
        <div className="pointer-events-none absolute bottom-4 left-3 z-10 overflow-hidden rounded-lg border border-forge-border bg-forge-panel/70 backdrop-blur" style={{ width: MW, height: MH }}>
          {pts.map(([id, p]) => { const isF = id === focus.id; return <span key={id} className="absolute rounded-full" style={{ left: mmx(p.x), top: mmy(p.y), width: isF ? 6 : 3.5, height: isF ? 6 : 3.5, background: isF ? hex : 'rgba(255,255,255,0.45)', boxShadow: isF ? `0 0 6px ${hex}` : undefined, transform: 'translate(-50%,-50%)' }} />; })}
        </div>

        {/* GARVIS'S MIND — a calm, ambient read of where your thinking is going (constantly thinks, rarely speaks) */}
        {mind?.intent && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 max-w-[440px] -translate-x-1/2 text-center">
            <div className="text-[11px] leading-tight text-forge-dim/85">following your curiosity about <span className="text-forge-ember">{mind.intent}</span></div>
            {mind.anomaly && <div className="mt-0.5 text-[10px] leading-tight text-violet-300/80">✦ {mind.anomaly}</div>}
          </div>
        )}

        {/* Garvis's read of your cognitive state + the one move that fits it (behavior, not a widget).
            Floats ABOVE the scene (z-40); the ambient "state" chip is map-only to keep the scene clean. */}
        {((mind?.state && mapMode) || suggestion || nudge) && (
          <div className="absolute bottom-[176px] left-1/2 z-40 flex max-w-[92%] -translate-x-1/2 flex-wrap items-center justify-center gap-2">
            {mind?.state && mapMode && <span className="rounded-full border border-forge-border bg-forge-panel/80 px-2 py-0.5 text-[10px] text-forge-dim backdrop-blur">Garvis sees you <span className="text-forge-ember">{mind.state}</span></span>}
            {suggestion && <button onClick={() => actSuggestion(suggestion)} className="inline-flex items-center gap-1 rounded-full border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-0.5 text-[10px] font-medium text-forge-ember backdrop-blur transition-colors hover:bg-forge-ember/20">{suggestion.label} <ArrowRight size={10} /></button>}
            {nudge && (
              <button onClick={() => { setNudge(null); dive(nudge); }} className="fm-rise inline-flex max-w-[420px] items-center gap-1 truncate rounded-full border border-forge-border bg-forge-panel/85 px-2.5 py-0.5 text-[10px] text-forge-dim backdrop-blur transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                this one's mostly mapped — <span className="truncate font-medium text-forge-ember">{nudge.label}</span> <ArrowRight size={10} className="shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* the anticipation, caught in the act — shown only when the arrival really was pre-composed */}
        {whisper && (
          <div className="fm-rise pointer-events-none absolute bottom-[220px] left-1/2 z-40 -translate-x-1/2 rounded-full border border-forge-ember/40 bg-forge-panel/90 px-3 py-1 text-[11px] text-forge-ember backdrop-blur">
            <Sparkles size={11} className="mr-1 inline" /> had this one ready for you
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); think(); }} className="absolute bottom-4 left-1/2 z-40 flex w-[min(540px,92%)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-forge-border bg-forge-panel/90 p-2 shadow-2xl backdrop-blur">
          <Sparkles size={15} className="ml-1 shrink-0 text-forge-ember" />
          <input value={thought} onChange={(e) => setThought(e.target.value)} placeholder="think out loud — “wait, what about…”" className="flex-1 bg-transparent text-sm text-forge-ink outline-none placeholder:text-forge-dim/55" />
          {thinking ? <Loader2 size={16} className="mr-1 shrink-0 animate-spin text-forge-dim" /> : <button type="submit" disabled={!thought.trim()} className="shrink-0 rounded-lg p-1 text-forge-dim hover:text-forge-ember disabled:opacity-40"><ArrowRight size={16} /></button>}
        </form>
      </div>

      {/* ---------- THE DETAIL PANEL (depth) — constellation only; in the scene it's the on-demand drawer ---------- */}
      {mapMode && (
        <>
          <div onMouseDown={startResize} className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center" title="Drag to resize">
            <div className="h-16 w-1 rounded-full bg-forge-border transition-colors group-hover:bg-forge-ember/60" />
          </div>
          <DetailPanel focus={focus} hex={hex} loading={loading} busy={busy} connections={connections} bridge={bridge} byId={byId} width={panelW} streamText={streamText}
            onOpen={setViewer} onTravel={travel} onExpand={expand}
            onVideos={() => run('vid', () => gatherVideos(graph, focus.id))}
            onSurprise={surprise} onInvestigate={runInvestigation} />
        </>
      )}
    </div>
  );
}

function MapNode({ c, isFocus, compact, kids, onClick }: { c: Cluster; isFocus: boolean; compact?: boolean; kids: Cluster[]; onClick: () => void }) {
  const hex = KIND_HEX[c.kind];
  const Icon = KIND_ICON[c.kind];
  const thumb = firstImage(c);
  const arts = c.artifacts.length;
  const vids = videosOf(c).length;
  if (compact) {
    return (
      <button onClick={onClick} title={c.summary || c.title} className="flex w-full items-center gap-1.5 rounded-full border bg-forge-panel/85 px-3 py-1.5 text-left backdrop-blur transition-all hover:scale-105" style={{ borderColor: `${hex}55` }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hex, boxShadow: `0 0 8px ${hex}` }} />
        <span className="truncate text-[11px] font-medium text-forge-ink">{c.title}</span>
      </button>
    );
  }
  return (
    <button onClick={onClick} title={c.summary || c.title}
      className="group w-full overflow-hidden rounded-2xl border bg-forge-panel/90 text-left backdrop-blur transition-all hover:scale-[1.04] hover:bg-forge-panel"
      style={{ borderColor: isFocus ? `${hex}cc` : `${hex}40`, boxShadow: isFocus ? `0 0 0 1px ${hex}55, 0 0 50px -14px ${hex}` : `0 6px 22px -10px ${hex}77` }}>
      {thumb && <img src={thumb} alt="" loading="lazy" className={`w-full object-cover ${isFocus ? 'h-24' : 'h-16'} opacity-90 group-hover:opacity-100`} />}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon size={13} style={{ color: hex }} className="shrink-0" />
          <span className={`truncate font-semibold text-forge-ink ${isFocus ? 'text-sm' : 'text-xs'}`} style={{ opacity: 0.65 + 0.35 * c.salience }}>{c.title}</span>
        </div>
        {/* summary only — a node never lists its children's titles (those are their own cards on the
            map; repeating them here was the duplicate-text clutter). */}
        {c.summary && <p className={`mt-1 line-clamp-2 text-forge-dim ${isFocus ? 'text-[11px]' : 'text-[10px]'}`}>{c.summary}</p>}
        {(arts > 0 || kids.length > 0) && (
          <div className="mt-1.5 flex items-center gap-2 text-[9px] text-forge-dim/70">
            {arts > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={9} />{arts}</span>}
            {kids.length > 0 && <span className="inline-flex items-center gap-0.5"><GitBranch size={9} />{kids.length}</span>}
            {vids > 0 && <span className="inline-flex items-center gap-0.5 text-rose-400"><Play size={9} />{vids}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function DetailPanel({ focus, hex, loading, busy, connections, bridge, byId, width, streamText, onOpen, onTravel, onExpand, onVideos, onSurprise, onInvestigate }: {
  focus: Cluster; hex: string; loading: { answer: boolean; media: boolean; video: boolean }; busy: string | null;
  connections: UniverseConnection[]; bridge: Bridge | null; byId: Map<string, Cluster>; width: number; streamText: string;
  onOpen: (v: ViewerItem) => void;
  onTravel: (id: string) => void; onExpand: (m: ExpandMode) => void; onVideos: () => void; onSurprise: () => void; onInvestigate: () => void;
}) {
  const Icon = KIND_ICON[focus.kind];
  const images = imagesOf(focus);
  const videos = videosOf(focus);
  const links = linksOf(focus);
  const understanding = understandingOf(focus);
  return (
    <aside className="relative h-full shrink-0 overflow-y-auto rounded-2xl border border-forge-border bg-forge-panel panel-scroll" style={{ width }}>
      {images[0] ? <img src={images[0].thumb || images[0].url} alt="" className="h-32 w-full object-cover" /> : loading.media ? <div className="h-32 w-full animate-pulse" style={{ background: `linear-gradient(${hex}18,#0c0a14)` }} /> : null}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: hex }} />
          <h2 className="font-display text-base font-semibold text-forge-ink">{focus.title}</h2>
          <span className="ml-auto rounded-full border border-forge-border px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-forge-dim">
            {focus.maturity === 'finished' ? <CheckCircle2 size={8} className="mr-0.5 inline" /> : focus.maturity === 'dormant' ? <Moon size={8} className="mr-0.5 inline" /> : null}{MATURITY_LABEL[focus.maturity]}
          </span>
        </div>
        {focus.summary ? <p className="mt-1.5 text-sm font-medium text-forge-ink/90">{focus.summary}</p> : loading.answer ? <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-forge-raised" /> : null}
        {focus.trajectory && <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-forge-ember"><ArrowRight size={11} /> {focus.trajectory}</p>}

        {/* THE WOW — a surprising connection to your own universe (only Garvis can do this) */}
        {bridge && byId.get(bridge.targetId) && (
          <button onClick={() => onTravel(bridge.targetId)} className="mt-3 block w-full rounded-xl border border-violet-400/50 bg-violet-400/10 p-2.5 text-left transition-all hover:-translate-y-0.5 hover:bg-violet-400/15">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300"><Wand2 size={11} /> surprising link</div>
            <div className="mt-0.5 text-xs font-medium text-forge-ink">{byId.get(bridge.targetId)!.title}</div>
            {bridge.why && <p className="mt-0.5 text-[11px] leading-snug text-forge-dim">{bridge.why}</p>}
          </button>
        )}

        {/* INVESTIGATE — the marquee: turn this into a parallel, multi-angle investigation with a verdict */}
        <button onClick={onInvestigate} disabled={busy === 'investigate'} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-forge-ember/50 bg-ember-gradient py-2 text-sm font-medium text-[#1A0E04] transition-all hover:shadow-liftEmber disabled:opacity-60">
          {busy === 'investigate' ? <><Loader2 size={14} className="animate-spin" /> Investigating…</> : <><Telescope size={14} /> Investigate this</>}
        </button>

        {/* OVERVIEW */}
        <Sec label="Overview" loading={loading.answer && !understanding && !streamText}>
          {streamText ? <p className="whitespace-pre-line text-xs leading-relaxed text-forge-dim">{streamText}<span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-forge-ember align-middle" /></p>
            : understanding?.detail ? <p className="whitespace-pre-line text-xs leading-relaxed text-forge-dim">{understanding.detail}</p>
            : loading.answer ? <div className="space-y-1.5"><div className="h-2.5 animate-pulse rounded bg-forge-raised" /><div className="h-2.5 w-5/6 animate-pulse rounded bg-forge-raised" /><div className="h-2.5 w-2/3 animate-pulse rounded bg-forge-raised" /></div>
            : <p className="text-[11px] text-forge-dim/60">No overview yet.</p>}
        </Sec>

        {/* ARTIFACTS */}
        {(images.length > 0 || videos.length > 0 || links.length > 0 || loading.media) && (
          <Sec label={`Artifacts${focus.artifacts.length ? ` · ${focus.artifacts.length}` : ''}`} loading={(loading.media || loading.video)}>
            {images.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                {images.slice(0, 6).map((a) => <button key={a.id} onClick={() => onOpen({ kind: 'image', url: a.url || a.thumb || '', title: a.title })} title={a.title} className="group relative aspect-square overflow-hidden rounded-md border border-forge-border"><img src={a.thumb || a.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-110" /><span className="absolute bottom-0 right-0 bg-black/60 px-1 text-[7px] uppercase text-white/80"><ImageIcon size={7} className="inline" /></span></button>)}
              </div>
            )}
            {videos.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {videos.slice(0, 3).map((v) => <button key={v.id} onClick={() => onOpen({ kind: 'video', url: v.url || '', title: v.title })} className="flex w-full items-center gap-2 rounded-lg border border-forge-border p-1.5 text-left transition-colors hover:border-forge-ember/50">{v.thumb ? <img src={v.thumb} alt="" loading="lazy" className="h-9 w-16 shrink-0 rounded object-cover" /> : <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded bg-forge-raised"><Play size={14} className="text-forge-dim" /></span>}<span className="line-clamp-2 text-[11px] text-forge-dim">{v.title}</span></button>)}
              </div>
            )}
            {links.length > 0 && (
              <div className="space-y-1">
                {links.slice(0, 4).map((s) => <button key={s.id} onClick={() => onOpen({ kind: 'link', url: s.url || '', title: s.title })} className="flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-[11px] text-forge-dim hover:text-forge-ember"><FileText size={10} className="shrink-0" /><span className="truncate">{s.title}</span></button>)}
              </div>
            )}
          </Sec>
        )}

        {/* ACROSS YOUR UNIVERSE — links to OTHER branches (the moat) */}
        {connections.length > 0 && (
          <Sec label="Across your universe">
            <div className="space-y-1">
              {connections.map((r) => { const c = byId.get(r.id); return c ? <button key={r.id} onClick={() => onTravel(r.id)} className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] text-forge-dim hover:text-forge-ink"><Link2 size={10} className="shrink-0 text-violet-400" /><span className="truncate">{c.title}</span>{r.crossWorld && <span className="ml-auto text-[8px] uppercase text-violet-400/70">cross-world</span>}</button> : null; })}
            </div>
          </Sec>
        )}

        {/* ACTIONS */}
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-forge-border pt-3 text-[11px] text-forge-dim/70">
          <button onClick={() => onExpand('deeper')} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'x:deeper' ? <Loader2 size={11} className="animate-spin" /> : <Layers size={11} />} deeper</button>
          <button onClick={() => onExpand('questions')} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'x:questions' ? <Loader2 size={11} className="animate-spin" /> : <HelpCircle size={11} />} questions</button>
          <button onClick={onSurprise} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'bridge' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} surprising link</button>
          <button onClick={onVideos} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'vid' ? <Loader2 size={11} className="animate-spin" /> : <Clapperboard size={11} />} videos</button>
        </div>
      </div>
    </aside>
  );
}

// The app runs cross-origin-isolated (COEP/COOP for the WebContainer runtime), which blocks plain
// cross-origin iframes ("refused to connect"). The `credentialless` attribute loads the frame in a
// credential-free context so YouTube embeds are allowed inside an isolated page (Chromium 110+).
// We set the attribute BEFORE src so the navigation starts credentialless.
function YouTubeFrame({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.setAttribute('credentialless', '');
    // YouTube needs to see the embedding origin to authorize playback — stripping the referrer
    // triggers "Error 153 / player configuration error". Pass origin explicitly and keep the referrer.
    el.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&origin=${encodeURIComponent(window.location.origin)}`;
  }, [id]);
  return <iframe ref={ref} title={title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
}

// IN-APP VIEWER — watch real videos, view images, and READ links right here in the panel.
// Web pages forbid being iframed (X-Frame-Options/CSP), so links are fetched through a readability
// proxy (r.jina.ai, keyless + CORS-open) and shown as clean article text instead of a dead iframe.
function Viewer({ item, hex, onClose }: { item: ViewerItem; hex: string; onClose: () => void }) {
  const yt = item.kind === 'video' ? youTubeId(item.url) : undefined;
  const [reader, setReader] = useState<{ status: 'load' | 'ok' | 'fail'; text: string }>({ status: 'load', text: '' });
  useEffect(() => {
    if (item.kind !== 'link' || !item.url) return;
    let cancelled = false;
    setReader({ status: 'load', text: '' });
    (async () => {
      try {
        const res = await fetch(`https://r.jina.ai/${item.url}`, { headers: { 'X-Return-Format': 'text', Accept: 'text/plain' } });
        if (!res.ok) throw new Error(String(res.status));
        const t = (await res.text()).trim();
        if (!t) throw new Error('empty');
        if (!cancelled) setReader({ status: 'ok', text: t.slice(0, 24000) });
      } catch { if (!cancelled) setReader({ status: 'fail', text: '' }); }
    })();
    return () => { cancelled = true; };
  }, [item.url, item.kind]);

  const isMedia = item.kind === 'image' || (item.kind === 'video' && !!yt);
  return (
    <div className="absolute inset-0 z-30 flex flex-col rounded-2xl bg-forge-panel">
      <div className="flex items-center gap-2 border-b border-forge-border p-2.5" style={{ background: `linear-gradient(${hex}10, transparent)` }}>
        <button onClick={onClose} className="rounded-lg p-1 text-forge-dim hover:text-forge-ink" title="Back"><ArrowLeft size={15} /></button>
        <span className="flex-1 truncate text-xs font-medium text-forge-ink">{item.title || 'Viewer'}</span>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="rounded-lg p-1 text-forge-dim hover:text-forge-ember" title="Open in new tab"><ExternalLink size={14} /></a>}
      </div>

      {item.kind === 'image' ? (
        <div className="flex flex-1 items-center justify-center overflow-auto bg-black"><img src={item.url} alt={item.title} className="max-h-full max-w-full object-contain" /></div>
      ) : item.kind === 'video' && yt ? (
        <div className="flex flex-1 items-center justify-center bg-black"><YouTubeFrame id={yt} title={item.title} /></div>
      ) : item.kind === 'video' ? (
        // not a single embeddable video (e.g. a YouTube search) — offer it, don't show a refused frame
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Play size={28} className="text-forge-dim/60" />
          <p className="text-xs text-forge-dim">This isn't a single embeddable clip.</p>
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-1.5 text-xs font-medium text-forge-ember hover:bg-forge-ember/20"><ExternalLink size={13} /> Watch on YouTube</a>
        </div>
      ) : reader.status === 'load' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-forge-dim/70"><Loader2 size={18} className="animate-spin" /><span className="text-[11px]">Reading the page…</span></div>
      ) : reader.status === 'ok' ? (
        <div className="flex-1 overflow-y-auto p-4 panel-scroll"><p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-forge-dim">{reader.text}</p></div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <FileText size={26} className="text-forge-dim/60" />
          <p className="text-xs text-forge-dim">Couldn't pull this page in. It may block readers.</p>
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-1.5 text-xs font-medium text-forge-ember hover:bg-forge-ember/20"><ExternalLink size={13} /> Open in new tab</a>
        </div>
      )}
      {!isMedia && reader.status === 'ok' && <div className="border-t border-forge-border px-3 py-1 text-center text-[9px] text-forge-dim/50">reader view · tap <ExternalLink size={8} className="inline" /> for the original</div>}
    </div>
  );
}

function Sec({ label, children, loading }: { label: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-forge-dim">{label} {loading && <Loader2 size={10} className="animate-spin" />}</div>
      {children}
    </div>
  );
}
