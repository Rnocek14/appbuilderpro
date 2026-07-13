// src/pages/spike/IdeaRoom.tsx
// You don't manage information here — you ENTER an idea and drift. Clicking a current doesn't select
// a node; the world changes: the concept fills the screen alive, its media emerges around it, and
// the next thoughts you'll naturally have ("currents") drift in — already composed, ready, glowing —
// so you never stop to decide where to go. The map (galaxy) is the zoom-out.
//
// Engine (unchanged): on entry, compose answer+images+videos; PREDICTIVELY prefetch the likely next
// currents so arriving is instant; learn which currents YOU drift toward. Needs an API key.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, ArrowRight, Home, Layers, HelpCircle, Shuffle, Wand2, Clapperboard, Play, Loader2,
  Telescope, CircleHelp, FolderKanban, BookOpen, CheckCircle2, Moon, Map as MapIcon, Link2,
  Split, FlaskConical, Scale, Atom, ClipboardCheck, Lightbulb, GitCompare, Microscope, Waypoints,
} from 'lucide-react';
import {
  relatedClusters, addChild, whatIfChild, slugify, EPISTEMICS,
  type ClusterGraph, type Cluster, type ClusterKind, type ClusterMaturity, type Epistemic, type Artifact, type ExpandMode, type Lead, type LeadKind, type RelatedCluster,
} from '../../lib/garvis/clustering';
import { exploreLeads, expandCluster, gatherWikiMedia, gatherVideos, findSimilarClusters, composeProspect, type Prospect } from '../../lib/garvis/clusteringRun';
import { compareNodes, formalizeTheory } from '../../lib/garvis/inquiryRun';
import { THEORY_ARTIFACT_ID, type Comparison } from '../../lib/garvis/inquiry';
import { recordPick, kindBias } from '../../lib/garvis/currents';
import { LabBench } from '../../components/garvis/LabBench';
import { MechanismCanvas } from '../../components/garvis/MechanismCanvas';
import { designVisual, type DesignedVisual } from '../../lib/garvis/visualRun';
import { clampSpecValues, specDefaults, specArtifact } from '../../lib/garvis/visualGrammar';

const PREFETCH_N = 3;

const KIND_HEX: Record<ClusterKind, string> = {
  topic: '#e9a23b', question: '#38bdf8', idea: '#f59e0b', investigation: '#a78bfa', artifact: '#34d399', project: '#fbbf24',
  claim: '#f472b6', theory: '#c084fc', evidence: '#4ade80', scenario: '#fb923c', experiment: '#22d3ee', insight: '#facc15',
};
const KIND_ICON: Record<ClusterKind, typeof Sparkles> = {
  topic: Sparkles, question: CircleHelp, idea: Sparkles, investigation: Telescope, artifact: BookOpen, project: FolderKanban,
  claim: Scale, theory: Atom, evidence: ClipboardCheck, scenario: Split, experiment: FlaskConical, insight: Lightbulb,
};

// THE HONESTY LAYER, rendered: the epistemic label travels with the node — speculation never
// dresses as fact, and the more beautiful the room, the more this chip matters.
const EPISTEMIC_HEX: Record<Epistemic, string> = {
  established: '#4ade80', strong: '#a3e635', plausible: '#38bdf8', disputed: '#facc15',
  speculative: '#fb923c', fiction: '#c084fc', hypothesis: '#FF8A3D',
};
const EPISTEMIC_LABEL: Record<Epistemic, string> = {
  established: 'established', strong: 'strong evidence', plausible: 'plausible', disputed: 'disputed',
  speculative: 'speculative', fiction: 'fiction', hypothesis: 'your hypothesis',
};
const MATURITY_LABEL: Record<ClusterMaturity, string> = {
  spark: 'spark', growing: 'growing', mature: 'mature', building: 'building', finished: 'done', dormant: 'dormant', archived: 'archived',
};
const LEAD_ICON: Record<LeadKind, typeof ArrowRight> = { dig: ArrowRight, question: HelpCircle, tangent: Shuffle };
const LEAD_HEX: Record<LeadKind, string> = { dig: '#e9a23b', question: '#38bdf8', tangent: '#a78bfa' };
const leadToKind = (k: LeadKind): ClusterKind => (k === 'question' ? 'question' : k === 'tangent' ? 'idea' : 'topic');

const imagesOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'image' && (a.thumb || a.url));
const videosOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'video');
// Lab outputs (comparisons, theory scaffolds) are also kind 'research' — they must never hijack
// the branch's main prose, so the fallback excludes source 'lab'.
const understandingOf = (c: Cluster) => c.artifacts.find((a) => a.id === 'understanding') ?? c.artifacts.find((a) => a.kind === 'research' && a.source !== 'lab');
const creationsOf = (c: Cluster) => c.artifacts.filter((a) => a.source === 'generated' || a.source === 'lab' || a.kind === 'diagram' || a.kind === 'post');

function trail(byId: Map<string, Cluster>, id: string): Cluster[] {
  const out: Cluster[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  let guard = 0;
  while (cur && guard++ < 32) { const c = byId.get(cur); if (!c) break; out.unshift(c); cur = c.parentId; }
  return out;
}

interface Props {
  graph: ClusterGraph;
  setGraph: (g: ClusterGraph) => void;
  focusId: string | null;
  setFocusId: (id: string) => void;
  onCost?: (usd: number) => void;
  onOpenMap?: () => void;
}

// a "current" = the next thought, whether it already exists (a child) or is a fresh lead
interface Current { key: string; label: string; kind: LeadKind; childId?: string; summary?: string }

export default function IdeaRoom({ graph, setGraph, focusId, setFocusId, onCost, onOpenMap }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [similar, setSimilar] = useState<RelatedCluster[] | null>(null);
  const [loading, setLoading] = useState({ answer: false, media: false, video: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<string | null>(null); // null = closed; '' = open, typing
  const [showBench, setShowBench] = useState(false);
  const [pickStatus, setPickStatus] = useState(false);
  const [comparePick, setComparePick] = useState(false);
  const [compareQ, setCompareQ] = useState('');
  const [comparison, setComparison] = useState<{ withTitle: string; cmp: Comparison } | null>(null);
  const [comparingWith, setComparingWith] = useState<string | null>(null); // in-flight compare target
  const [showTheory, setShowTheory] = useState(false);
  const [viewArt, setViewArt] = useState<Artifact | null>(null); // made-here chip re-opened
  const [labErr, setLabErr] = useState('');
  // PICTURE IT — the designed mechanism visual for THIS branch (visual grammar). The spec's dials
  // live here (assumptions the user owns); 'starter' means the offline heuristic designed it.
  const [picture, setPicture] = useState<DesignedVisual | null>(null);
  const [pictureVals, setPictureVals] = useState<Record<string, number>>({});
  const [pictureSavedId, setPictureSavedId] = useState<string | null>(null);
  const [, setReadyTick] = useState(0);
  // A designed visual resolving after the user has stepped to another branch must be dropped,
  // not painted onto whatever branch is focused now.
  const focusRef = useRef<string | null>(null);
  // The LIVE graph, read at merge time. The three entry loads (answer, media, video) resolve at
  // different times; each used to setGraph(its-own-snapshot), so the last to land wiped the others —
  // videos (slowest) erased the composed answer, forcing a paid recompose (deep scan P0, theme 4).
  // GalaxyView already solved this with a live-ref merge; IdeaRoom now does the same.
  const liveGraph = useRef(graph);
  const leadsCache = useRef<Record<string, Lead[]>>({});
  const done = useRef<Set<string>>(new Set());
  const prefetch = useRef<Record<string, Prospect | 'loading'>>({});

  const byId = useMemo(() => new Map(graph.clusters.map((c) => [c.id, c])), [graph]);
  const roots = useMemo(() => graph.clusters.filter((c) => !c.parentId), [graph]);
  const focus = (focusId && byId.get(focusId)) || roots[0] || graph.clusters[0] || null;

  focusRef.current = focus?.id ?? null;
  liveGraph.current = graph;

  // Merge a slow load's result for cluster `id` into the LIVE graph instead of replacing it. Always
  // unions new artifacts (never drop what another load already added). Only the ANSWER load
  // (isAnswer) carries an authoritative summary/trajectory; media/video carry the entry-time base,
  // so they must NOT touch those fields or they'd wipe the answer that landed first.
  const mergeInto = (id: string, res: ClusterGraph, isAnswer = false) => {
    const upd = res.clusters.find((c) => c.id === id);
    if (!upd) return;
    const live = liveGraph.current;
    let changed = false;
    const merged = live.clusters.map((c) => {
      if (c.id !== id) return c;
      const have = new Set(c.artifacts.map((a) => a.id));
      const fresh = upd.artifacts.filter((a) => !have.has(a.id));
      const summary = isAnswer && upd.summary ? upd.summary : c.summary;
      const trajectory = isAnswer && upd.trajectory ? upd.trajectory : c.trajectory;
      if (!fresh.length && summary === c.summary && trajectory === c.trajectory) return c;
      changed = true;
      return { ...c, summary, trajectory, artifacts: [...fresh, ...c.artifacts] };
    });
    if (!changed) return;
    const next = { ...live, clusters: merged };
    liveGraph.current = next;
    setGraph(next);
  };

  const ancestors = focus ? trail(byId, focus.id) : [];
  const children = focus ? graph.clusters.filter((c) => c.parentId === focus.id).sort((a, b) => b.salience - a.salience) : [];
  const related = focus ? (similar ?? relatedClusters(graph, focus.id)) : [];

  useEffect(() => {
    if (!focus) return;
    const id = focus.id;
    setLeads(leadsCache.current[id] ?? []); setSimilar(null);
    setWhatIf(null); setShowBench(false); setPickStatus(false); // lab state is per-branch
    setComparePick(false); setCompareQ(''); setComparison(null); setShowTheory(false); setLabErr(''); setViewArt(null);
    setPicture(null); setPictureVals({}); setPictureSavedId(null);
    if (done.current.has(id)) return;
    done.current.add(id);
    let cancelled = false;
    const c = byId.get(id)!;
    const needAnswer = !c.artifacts.some((a) => a.id === 'understanding');
    const needMedia = !c.artifacts.some((a) => a.kind === 'image');
    const needVideo = !c.artifacts.some((a) => a.kind === 'video');
    setLoading({ answer: needAnswer, media: needMedia, video: needVideo });
    // The composed answer failing must SAY so (labErr + a retry path via re-entering); media and
    // videos are enrichment — they fail quiet, but never as unhandled rejections.
    if (needAnswer) exploreLeads(graph, id, ancestors.map((a) => a.title)).then((r) => { if (cancelled) return; leadsCache.current[id] = r.leads; setLeads(r.leads); mergeInto(id, r.graph, true); if (r.costUsd) onCost?.(r.costUsd); }).catch((e) => { if (!cancelled) { done.current.delete(id); setLabErr(e instanceof Error ? e.message : "Couldn't compose this thought — step out and back in to retry."); } }).finally(() => { if (!cancelled) setLoading((l) => ({ ...l, answer: false })); });
    if (needMedia) gatherWikiMedia(graph, id).then((r) => { if (!cancelled && r.found) mergeInto(id, r.graph); }).catch(() => {}).finally(() => { if (!cancelled) setLoading((l) => ({ ...l, media: false })); });
    if (needVideo) gatherVideos(graph, id).then((r) => { if (!cancelled && r.found) mergeInto(id, r.graph); }).catch(() => {}).finally(() => { if (!cancelled) setLoading((l) => ({ ...l, video: false })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id]);

  // predictively compose the likely next currents so arriving is instant; ranked by your tendencies
  useEffect(() => {
    if (!focus || !leads.length) return;
    const trailTitles = [...ancestors.map((a) => a.title), focus.title];
    const bias = kindBias();
    const top = [...leads].sort((a, b) => bias[b.kind] - bias[a.kind]).slice(0, PREFETCH_N);
    let cancelled = false;
    (async () => {
      for (const l of top) {
        const key = slugify(l.label);
        if (prefetch.current[key]) continue;
        prefetch.current[key] = 'loading'; setReadyTick((t) => t + 1);
        try { const p = await composeProspect(l.label, trailTitles); if (cancelled) return; prefetch.current[key] = p; if (p.costUsd) onCost?.(p.costUsd); }
        catch { delete prefetch.current[key]; }
        finally { if (!cancelled) setReadyTick((t) => t + 1); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, leads]);

  if (!focus) return <p className="p-6 text-sm text-forge-dim">Nothing here yet.</p>;

  const hex = KIND_HEX[focus.kind];
  const Icon = KIND_ICON[focus.kind];
  const images = imagesOf(focus);
  const videos = videosOf(focus);
  const understanding = understandingOf(focus);
  const creations = creationsOf(focus);

  const travel = (id: string) => { if (id !== focus.id) { setFocusId(id); window.scrollTo?.({ top: 0, behavior: 'smooth' }); } };
  const goLead = (lead: Lead) => {
    recordPick(lead.kind);
    const { graph: g2, id } = addChild(graph, focus.id, { title: lead.label, kind: leadToKind(lead.kind) });
    if (!id) return;
    const p = prefetch.current[slugify(lead.label)];
    if (p && p !== 'loading') {
      const arts: Artifact[] = [...(p.understanding ? [p.understanding] : []), ...p.images];
      leadsCache.current[id] = p.leads; done.current.add(id);
      setGraph({ ...g2, clusters: g2.clusters.map((c) => (c.id === id ? { ...c, summary: p.summary || c.summary, trajectory: p.trajectory ?? c.trajectory, artifacts: [...arts, ...c.artifacts] } : c)) });
    } else setGraph(g2);
    travel(id);
  };
  // ONE op at a time: every lab/nav op reads `graph` at call time and writes it back on resolve,
  // so two in-flight ops would clobber each other's writes (last-slow-write-wins on a stale base).
  // The single `busy` lock is the guard — and every failure lands in the one labErr surface
  // instead of vanishing into an unhandled rejection.
  const run = async (label: string, fn: () => Promise<{ graph?: ClusterGraph; costUsd?: number } | RelatedCluster[]>) => {
    if (busy) return;
    setBusy(label); setLabErr('');
    try { const res = await fn(); if (Array.isArray(res)) setSimilar(res); else { if (res.graph) setGraph(res.graph); if (res.costUsd) onCost?.(res.costUsd); } }
    catch (e) { setLabErr(e instanceof Error ? e.message : "That didn't go through — try again."); }
    finally { setBusy(null); }
  };
  const expand = (m: ExpandMode) => run(`x:${m}`, () => expandCluster(graph, focus.id, m));

  // WHAT IF? — controlled divergence: a NEW scenario branch beside the original (never a
  // replacement), born speculative. The room then explores it like any other thought.
  const submitWhatIf = () => {
    if (busy) return; // one graph write at a time (see run())
    const twist = (whatIf ?? '').trim();
    setWhatIf(null);
    if (!twist) return;
    const { graph: g2, id } = whatIfChild(graph, focus.id, twist);
    if (!id) return;
    setGraph(g2);
    travel(id);
  };

  // Lab Bench runs land as simulation-record artifacts ON this branch (same id = same inputs —
  // an identical re-run replaces nothing and adds nothing).
  const saveArtifact = (a: Artifact) => setGraph({
    ...graph,
    clusters: graph.clusters.map((c) => c.id === focus.id
      ? (c.artifacts.some((x) => x.id === a.id) ? c : { ...c, artifacts: [...c.artifacts, a] })
      : c),
  });

  const setEpistemic = (e: Epistemic | undefined) => {
    setGraph({ ...graph, clusters: graph.clusters.map((c) => (c.id === focus.id ? { ...c, epistemic: e } : c)) });
    setPickStatus(false);
  };

  // COMPARE — the decision laboratory: two thoughts side by side, and the parts a table can't
  // give (agreements, conflicts, hinges, discriminating evidence). Survivors become an artifact
  // on this branch AND a typed edge on the map. Thin output names its gaps and saves nothing.
  const runCompare = async (bId: string) => {
    if (busy) return;
    setComparePick(false); setBusy('cmp'); setLabErr(''); setComparison(null);
    setComparingWith(byId.get(bId)?.title ?? 'the other'); // feedback lives where the readout will land
    try {
      const r = await compareNodes(graph, focus.id, bId);
      if (r.costUsd) onCost?.(r.costUsd);
      if (r.cmp) { setGraph(r.graph); setComparison({ withTitle: byId.get(bId)?.title ?? 'the other', cmp: r.cmp }); }
      else setLabErr(r.error ?? 'The comparison came back too thin to trust.');
    } catch (e) { setLabErr(e instanceof Error ? e.message : 'Comparison failed.'); }
    finally { setBusy(null); setComparingWith(null); }
  };

  // MAKE IT RIGOROUS — the falsification engine: claim, assumptions, predictions, the case
  // against, and (non-negotiable) what would prove it wrong. Rejected scaffolds save nothing.
  const theoryArt = focus.artifacts.find((a) => a.id === THEORY_ARTIFACT_ID);
  const runTheory = async () => {
    if (theoryArt) { setShowTheory((v) => !v); return; } // already scaffolded — toggle the view
    if (busy) return;
    setBusy('theory'); setLabErr('');
    try {
      const r = await formalizeTheory(graph, focus.id);
      if (r.costUsd) onCost?.(r.costUsd);
      if (r.scaffold) { setGraph(r.graph); setShowTheory(true); }
      else setLabErr(r.error ?? 'The scaffold came back too thin to trust.');
    } catch (e) { setLabErr(e instanceof Error ? e.message : 'Scaffolding failed.'); }
    finally { setBusy(null); }
  };

  // merge existing branches + fresh leads into one set of "currents", ranked by your currents
  const bias = kindBias();
  const seen = new Set<string>();
  const currents: Current[] = [];
  for (const c of children) { const key = slugify(c.title); seen.add(key); currents.push({ key, label: c.title, kind: c.kind === 'question' ? 'question' : 'dig', childId: c.id, summary: c.summary }); }
  for (const l of leads) { const key = slugify(l.label); if (seen.has(key)) continue; seen.add(key); currents.push({ key, label: l.label, kind: l.kind }); }
  currents.sort((a, b) => bias[b.kind] - bias[a.kind]);

  const enterCurrent = (cur: Current) => (cur.childId ? travel(cur.childId) : goLead({ label: cur.label, kind: cur.kind }));

  return (
    <div className="relative">
      <style>{`
        @keyframes ku-kb { from { transform: scale(1.06) translate(0,0) } to { transform: scale(1.16) translate(-2%, -2%) } }
        @keyframes ku-breathe { 0%,100% { opacity:.4; transform:translate(-50%,-50%) scale(1) } 50% { opacity:.7; transform:translate(-50%,-50%) scale(1.1) } }
        @keyframes ku-rise { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @keyframes ku-shim { 0%,100%{opacity:.4} 50%{opacity:.8} }
        .ku-kb { animation: ku-kb 22s ease-in-out infinite alternate; }
        .ku-breathe { animation: ku-breathe 6s ease-in-out infinite; }
        .ku-rise { animation: ku-rise .5s cubic-bezier(.2,.8,.2,1) both; }
        .ku-shim { animation: ku-shim 1.3s ease-in-out infinite; }
      `}</style>

      {/* trail (how you got here) + map */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        <button onClick={() => roots[0] && travel(roots[0].id)} className="rounded p-1 text-forge-dim hover:text-forge-ink" title="Top"><Home size={13} /></button>
        {ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1"><ArrowRight size={11} className="text-forge-dim/40" /><button onClick={() => travel(a.id)} className="text-forge-dim hover:text-forge-ember">{a.title}</button></span>
        ))}
        <span className="flex items-center gap-1"><ArrowRight size={11} className="text-forge-dim/40" /><span className="font-medium text-forge-ink">{focus.title}</span></span>
        {onOpenMap && <button onClick={onOpenMap} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink"><MapIcon size={12} /> Map</button>}
      </div>

      <div key={focus.id}>
        {/* ENTER THE CONCEPT — full-bleed, alive */}
        <div className="relative h-[22rem] overflow-hidden rounded-3xl border" style={{ borderColor: `${hex}40` }}>
          <div className="absolute inset-0">
            {images[0] ? (
              <img src={images[0].thumb || images[0].url} alt="" className="ku-kb h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full" style={{ background: `radial-gradient(700px 360px at 35% 25%, ${hex}40, transparent 70%), linear-gradient(#0c0a14,#08070d)` }} />
            )}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[60%] ku-breathe rounded-full" style={{ background: `radial-gradient(circle, ${hex}22, transparent 60%)` }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(7,6,11,.97), rgba(7,6,11,.25) 55%, rgba(7,6,11,.4))' }} />

          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <div className="mb-2 flex items-center gap-2">
              <Icon size={18} style={{ color: hex }} />
              <span className="rounded-full border border-forge-border bg-forge-bg/50 px-2 py-0.5 text-[9px] uppercase tracking-wide text-forge-dim">
                {focus.maturity === 'finished' ? <CheckCircle2 size={9} className="mr-1 inline" /> : focus.maturity === 'dormant' ? <Moon size={9} className="mr-1 inline" /> : null}
                {MATURITY_LABEL[focus.maturity]}
              </span>
              <button
                onClick={() => setPickStatus((v) => !v)}
                className={`rounded-full border bg-forge-bg/50 px-2 py-0.5 text-[9px] uppercase tracking-wide ${focus.epistemic ? '' : 'border-forge-border text-forge-dim/60 hover:text-forge-dim'}`}
                style={focus.epistemic ? { borderColor: `${EPISTEMIC_HEX[focus.epistemic]}66`, color: EPISTEMIC_HEX[focus.epistemic] } : undefined}
                title="How solid is this? The label travels with the node — speculation never dresses as fact."
              >
                {focus.epistemic ? EPISTEMIC_LABEL[focus.epistemic] : 'how solid?'}
              </button>
              {focus.trajectory && <span className="inline-flex items-center gap-1 text-[11px] text-forge-ember"><ArrowRight size={11} /> {focus.trajectory}</span>}
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-forge-ink sm:text-5xl">{focus.title}</h1>
            {focus.summary ? (
              <p className="ku-rise mt-2 max-w-2xl text-base text-forge-ink/90">{focus.summary}</p>
            ) : loading.answer ? (
              <div className="ku-shim mt-3 h-4 w-80 max-w-full rounded bg-white/10" />
            ) : null}
          </div>
        </div>

        {/* the honesty picker — one tap, seven honest words, never a form */}
        {pickStatus && (
          <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-forge-dim/60">how solid is this?</span>
            {EPISTEMICS.map((e) => (
              <button key={e} onClick={() => setEpistemic(e)}
                className="rounded-full border px-2.5 py-1 text-[10px] transition-colors hover:bg-white/5"
                style={{ borderColor: `${EPISTEMIC_HEX[e]}${focus.epistemic === e ? 'aa' : '40'}`, color: EPISTEMIC_HEX[e] }}>
                {EPISTEMIC_LABEL[e]}
              </button>
            ))}
            {focus.epistemic && (
              <button onClick={() => setEpistemic(undefined)} className="rounded-full border border-forge-border px-2.5 py-1 text-[10px] text-forge-dim hover:text-forge-ink">clear</button>
            )}
          </div>
        )}

        {/* the concept, speaking */}
        <div className="mx-auto mt-5 max-w-3xl">
          {understanding?.detail ? (
            <p className="ku-rise whitespace-pre-line text-[15px] leading-relaxed text-forge-dim">{understanding.detail}</p>
          ) : loading.answer ? (
            <div className="space-y-2"><div className="ku-shim h-4 w-full rounded bg-forge-raised" /><div className="ku-shim h-4 w-5/6 rounded bg-forge-raised" /><div className="ku-shim h-4 w-3/5 rounded bg-forge-raised" /></div>
          ) : null}

          {/* media that EMERGED with the thought — a quiet mosaic, not a sidebar */}
          {(images.length > 1 || videos.length > 0 || loading.media || loading.video) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {images.slice(1, 6).map((a, i) => (
                <a key={a.id} href={a.url || a.thumb} target="_blank" rel="noreferrer" title={a.title} className="ku-rise overflow-hidden rounded-xl border border-forge-border" style={{ animationDelay: `${i * 70}ms`, width: i % 3 === 0 ? 132 : 96, height: 96 }}>
                  <img src={a.thumb || a.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-110" />
                </a>
              ))}
              {videos.slice(0, 2).map((v) => (
                <a key={v.id} href={v.url} target="_blank" rel="noreferrer" title={v.title} className="ku-rise relative h-24 w-40 overflow-hidden rounded-xl border border-forge-border">
                  {v.thumb ? <img src={v.thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-forge-raised"><Play size={18} className="text-forge-dim" /></span>}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25"><Play size={22} className="text-white/90" /></span>
                </a>
              ))}
              {(loading.media || loading.video) && <div className="ku-shim h-24 w-32 rounded-xl bg-forge-raised" />}
            </div>
          )}

          {/* quiet, verb-light actions */}
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-forge-dim/70">
            <button onClick={() => expand('deeper')} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'x:deeper' ? <Loader2 size={11} className="animate-spin" /> : <Layers size={11} />} go deeper</button>
            <button onClick={() => expand('questions')} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'x:questions' ? <Loader2 size={11} className="animate-spin" /> : <HelpCircle size={11} />} more questions</button>
            <button onClick={() => run('sim', () => findSimilarClusters(graph, focus.id))} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'sim' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} surprise me</button>
            <button onClick={() => run('vid', () => gatherVideos(graph, focus.id))} className="inline-flex items-center gap-1 hover:text-forge-ember">{busy === 'vid' ? <Loader2 size={11} className="animate-spin" /> : <Clapperboard size={11} />} more videos</button>
            <span className="mx-1 inline-block h-3 w-px self-center bg-forge-border" aria-hidden />{/* learn ↑ · test ↓ */}
            <button onClick={() => setWhatIf(whatIf === null ? '' : null)} className={`inline-flex items-center gap-1 ${whatIf !== null ? 'text-orange-400' : 'hover:text-orange-400'}`}><Split size={11} /> what if…</button>
            <button onClick={() => setShowBench((v) => !v)} className={`inline-flex items-center gap-1 ${showBench ? 'text-cyan-300' : 'hover:text-cyan-300'}`}><FlaskConical size={11} /> lab bench</button>
            <button
              onClick={() => {
                if (picture) { setPicture(null); return; }
                const focusIdAtCall = focus.id;
                void run('pic', async () => {
                  const r = await designVisual(focus.title, focus.summary);
                  if (focusRef.current !== focusIdAtCall) return {}; // stale — user moved on
                  if ('visual' in r) {
                    setPicture(r.visual);
                    setPictureVals(specDefaults(r.visual.spec));
                    setPictureSavedId(null);
                    return { costUsd: r.visual.costUsd };
                  }
                  if ('refusal' in r) throw new Error(`No honest mechanism for this one: ${r.refusal}`);
                  throw new Error(r.error);
                });
              }}
              className={`inline-flex items-center gap-1 ${picture ? 'text-emerald-300' : 'hover:text-emerald-300'}`}
              title="Design the mechanism visual for this branch — an animated model whose dials are your assumptions"
            >
              {busy === 'pic' ? <Loader2 size={11} className="animate-spin" /> : <Waypoints size={11} />} picture it
            </button>
            <button onClick={() => setComparePick((v) => !v)} className={`inline-flex items-center gap-1 ${comparePick || comparison ? 'text-sky-400' : 'hover:text-sky-400'}`}>{busy === 'cmp' ? <Loader2 size={11} className="animate-spin" /> : <GitCompare size={11} />} compare</button>
            <button onClick={runTheory} className={`inline-flex items-center gap-1 ${theoryArt ? 'text-violet-400' : 'hover:text-violet-400'}`}>{busy === 'theory' ? <Loader2 size={11} className="animate-spin" /> : <Microscope size={11} />} {theoryArt ? 'rigor ✓' : 'make it rigorous'}</button>
          </div>

          {labErr && <p className="mt-3 rounded-lg border border-forge-err/30 bg-forge-err/10 p-2.5 text-xs text-forge-err">{labErr}</p>}

          {/* COMPARE PICKER — choose the other side of the bench */}
          {comparePick && (
            <div className="ku-rise mt-3 rounded-xl border border-forge-border bg-forge-panel/60 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-forge-dim/70">compare “{focus.title}” with…</div>
              <input
                autoFocus value={compareQ} onChange={(e) => setCompareQ(e.target.value)}
                placeholder="find another thought on this map…"
                className="mb-2 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-1.5 text-xs text-forge-ink outline-none focus:border-sky-400/60"
              />
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const relIds = new Set(related.map((r) => r.id));
                  const q = compareQ.trim().toLowerCase();
                  const candidates = graph.clusters
                    .filter((c) => c.id !== focus.id && (!q || c.title.toLowerCase().includes(q)))
                    .sort((a, b) => Number(relIds.has(b.id)) - Number(relIds.has(a.id)));
                  if (!candidates.length) {
                    return <p className="text-[11px] text-forge-dim">{q ? 'Nothing on this map matches that.' : 'Nothing else on this map yet — branch a few thoughts first, then bring one back here.'}</p>;
                  }
                  return candidates.slice(0, 10).map((c) => (
                    <button key={c.id} onClick={() => runCompare(c.id)} title={c.summary || c.title}
                      className="rounded-full border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim transition-colors hover:border-sky-400/50 hover:text-forge-ink">
                      {c.title}
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* WHAT IF? — the central action of the Lab: pick any thought, twist one thing, and a NEW
              scenario branch grows beside the original. The original is never touched. */}
          {whatIf !== null && (
            <form onSubmit={(e) => { e.preventDefault(); submitWhatIf(); }} className="ku-rise mt-3">
              <div className="flex items-center gap-2">
                <Split size={13} className="shrink-0 text-orange-400" />
                <input
                  autoFocus value={whatIf}
                  onChange={(e) => setWhatIf(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setWhatIf(null); }}
                  placeholder="what if… this doubled / the opposite happened / it ran in every lake town"
                  className="flex-1 rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink outline-none focus:border-orange-400/60"
                />
                <button type="submit" className="rounded-lg border border-orange-400/40 px-3 py-2 text-xs text-forge-ink transition-colors hover:bg-orange-400/10">Branch it</button>
              </div>
              <p className="mt-1 pl-6 text-[10px] text-forge-dim/60">grows a new speculative branch beside this one — the original stays exactly as it is</p>
            </form>
          )}

          {/* THE LAB BENCH — manipulate the idea: known equations + your dials, honestly labeled */}
          {showBench && <LabBench cluster={focus} onSave={saveArtifact} />}

          {/* THE DESIGNED MECHANISM — picture-it's output: an archetype animation whose dials are
              the user's assumptions. 'starter' is plainly labeled; save writes a diagram artifact. */}
          {picture && (() => {
            const clampedVals = clampSpecValues(picture.spec, pictureVals);
            return (
              <div className="ku-rise mt-5 rounded-2xl border border-forge-border bg-forge-panel/50 p-4 backdrop-blur">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Waypoints size={15} className="text-emerald-300" />
                  <span className="text-sm font-semibold text-forge-ink">{picture.spec.title}</span>
                  <span className="rounded-full border border-forge-border px-2 py-0.5 text-[9px] uppercase tracking-wide text-forge-dim">{picture.spec.archetype}</span>
                  {picture.source === 'starter' && (
                    <span className="rounded-full border border-forge-warn/40 px-2 py-0.5 text-[9px] uppercase tracking-wide text-forge-warn" title="The designer was unreachable — this is the offline starter mechanism; every dial is yours to set.">
                      starter — dials are assumptions
                    </span>
                  )}
                </div>
                <MechanismCanvas spec={picture.spec} values={clampedVals} />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {picture.spec.params.map((p) => (
                    <div key={p.key}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="text-forge-dim">{p.label}</span>
                        <span className="font-mono text-forge-ink">{clampedVals[p.key]}{p.unit ? ` ${p.unit}` : ''}</span>
                      </div>
                      <input
                        type="range" min={p.min} max={p.max} step={p.step} value={clampedVals[p.key]}
                        onChange={(e) => { setPictureVals((v) => ({ ...v, [p.key]: Number(e.target.value) })); setPictureSavedId(null); }}
                        className="w-full accent-[#34d399]"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-forge-dim/70">{picture.spec.caption}</p>
                <p className="mt-0.5 text-[10px] text-forge-dim/60"><span className="text-forge-dim">Basis:</span> {picture.spec.basis}</p>
                <button
                  onClick={() => { const a = specArtifact(picture.spec, clampedVals); saveArtifact(a); setPictureSavedId(a.id); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 px-3 py-1.5 text-xs text-forge-ink transition-colors hover:bg-emerald-400/10"
                >
                  {pictureSavedId ? <CheckCircle2 size={12} className="text-forge-ok" /> : <BookOpen size={12} />} {pictureSavedId ? 'Saved to this branch' : 'Save this mechanism'}
                </button>
              </div>
            );
          })()}

          {/* comparing… — the feedback renders exactly where the readout will land */}
          {comparingWith && (
            <div className="ku-rise mt-5 flex items-center gap-2 rounded-2xl border border-sky-400/25 bg-forge-panel/50 p-4 text-xs text-forge-dim">
              <Loader2 size={13} className="animate-spin text-sky-400" /> Comparing “{focus.title}” with “{comparingWith}” — claims, conflicts, and what would settle it…
            </div>
          )}

          {/* DECISION LAB READOUT — saved to this branch; the relationship is now a map edge */}
          {comparison && (
            <div className="ku-rise mt-5 rounded-2xl border border-forge-border bg-forge-panel/50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <GitCompare size={14} className="text-sky-400" />
                <span className="text-sm font-semibold text-forge-ink">vs {comparison.withTitle}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${
                  comparison.cmp.verdict === 'contradicts' ? 'border-rose-400/50 text-rose-400'
                    : comparison.cmp.verdict === 'complementary' ? 'border-forge-ok/50 text-forge-ok'
                      : 'border-sky-400/50 text-sky-400'}`}>
                  {comparison.cmp.verdict}
                </span>
                <span className="text-[10px] text-forge-dim/60">saved here · relationship drawn on the map</span>
                <button onClick={() => setComparison(null)} className="ml-auto text-[11px] text-forge-dim hover:text-forge-ink">close</button>
              </div>
              <div className="grid gap-3 text-xs md:grid-cols-2">
                {([['A', focus.title, comparison.cmp.a], ['B', comparison.withTitle, comparison.cmp.b]] as const).map(([tag, title, side]) => (
                  <div key={tag} className="rounded-xl border border-forge-border p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-dim/60">{tag} — {title}</div>
                    <p className="text-forge-ink">{side.claim}</p>
                    {side.assumptions.slice(0, 3).map((s) => <p key={s} className="mt-1 text-forge-dim">assumes: {s}</p>)}
                    {side.problems.slice(0, 2).map((s) => <p key={s} className="mt-1 text-forge-warn/80">problem: {s}</p>)}
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                {comparison.cmp.agree.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-ok/70">where they agree</div>
                    {comparison.cmp.agree.map((s) => <p key={s} className="text-forge-dim">· {s}</p>)}
                  </div>
                )}
                {comparison.cmp.conflict.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-warn/70">where they conflict</div>
                    {comparison.cmp.conflict.map((s) => <p key={s} className="text-forge-dim">· {s}</p>)}
                  </div>
                )}
              </div>
              {comparison.cmp.hinges.length > 0 && (
                <div className="mt-3 text-xs">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-dim/60">what it hinges on</div>
                  {comparison.cmp.hinges.map((s) => <p key={s} className="text-forge-dim">· {s}</p>)}
                </div>
              )}
              <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3 text-xs">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-cyan-300/80">what would settle it</div>
                {comparison.cmp.discriminators.map((s) => <p key={s} className="text-forge-ink/90">· {s}</p>)}
              </div>
              <p className="mt-3 text-xs italic text-forge-dim">{comparison.cmp.readout}</p>
            </div>
          )}

          {/* THE THEORY, SCAFFOLDED — the falsification block is the point, not the fine print */}
          {showTheory && theoryArt?.detail && (
            <div className="ku-rise mt-5 rounded-2xl border border-violet-400/30 bg-forge-panel/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Microscope size={14} className="text-violet-400" />
                <span className="text-sm font-semibold text-forge-ink">{theoryArt.title}</span>
                <button onClick={() => setShowTheory(false)} className="ml-auto text-[11px] text-forge-dim hover:text-forge-ink">close</button>
              </div>
              <p className="mb-3 text-[10px] uppercase tracking-wide text-forge-dim/60">a theory is only as good as what could prove it wrong — its experiments now live as branches below</p>
              <p className="whitespace-pre-line text-xs leading-relaxed text-forge-dim">{theoryArt.detail}</p>
            </div>
          )}
        </div>

        {/* CURRENTS — the next thoughts, drifting in, varied weight, ready ones glowing */}
        <div className="mx-auto mt-8 max-w-4xl">
          <div className="mb-3 text-center text-[11px] uppercase tracking-[0.2em] text-forge-dim/70">where your curiosity is pulling you</div>
          {currents.length === 0 && loading.answer ? (
            <div className="flex flex-wrap justify-center gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="ku-shim h-12 w-48 rounded-2xl bg-forge-raised" />)}</div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {currents.map((cur, i) => {
                const lhex = LEAD_HEX[cur.kind];
                const LIcon = LEAD_ICON[cur.kind];
                const pf = prefetch.current[cur.key];
                const ready = (pf && pf !== 'loading') || !!cur.childId;
                const thumb = pf && pf !== 'loading' ? pf.images[0]?.thumb : undefined;
                const major = i < 2; // give the landscape varied weight: a couple big, the rest light
                return (
                  <button
                    key={cur.key}
                    onClick={() => enterCurrent(cur)}
                    className="ku-rise group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl border bg-forge-panel/60 text-left backdrop-blur transition-all hover:-translate-y-1"
                    style={{
                      animationDelay: `${i * 60}ms`,
                      padding: major ? '12px 16px' : '8px 13px',
                      maxWidth: major ? 360 : 280,
                      borderColor: ready ? `${lhex}66` : `${lhex}26`,
                      boxShadow: ready ? `0 0 26px -10px ${lhex}` : 'none',
                    }}
                    title={cur.summary || cur.label}
                  >
                    {thumb ? <img src={thumb} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-lg object-cover" /> : <LIcon size={major ? 16 : 13} style={{ color: lhex }} className="shrink-0" />}
                    <span className={`${major ? 'text-[15px]' : 'text-[13px]'} text-forge-ink/90 group-hover:text-forge-ink`}>{cur.label}</span>
                    {ready ? <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: lhex }} /> : pf === 'loading' ? <Loader2 size={11} className="animate-spin text-forge-dim/50" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* connections + made-here, soft */}
        {(related.length > 0 || creations.length > 0) && (
          <div className="mx-auto mt-8 max-w-4xl space-y-3 text-center">
            {related.length > 0 && (
              <div>
                <span className="text-[11px] uppercase tracking-wide text-forge-dim/60">{similar ? 'across your worlds' : 'this reminds you of'}</span>
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                  {related.map((r) => { const c = byId.get(r.id); return c ? <button key={r.id} onClick={() => travel(r.id)} className="inline-flex items-center gap-1.5 rounded-full border border-forge-border px-3 py-1.5 text-xs text-forge-dim transition-all hover:-translate-y-0.5 hover:text-forge-ink"><Link2 size={11} className="text-violet-400" /> {c.title}</button> : null; })}
                </div>
              </div>
            )}
            {creations.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {creations.map((a) => (
                  // made here, re-openable here — a saved comparison/scaffold/run is one click from
                  // its full text again, not a hover-tooltip fossil
                  <button
                    key={a.id}
                    onClick={() => a.detail && setViewArt(viewArt?.id === a.id ? null : a)}
                    className={`rounded-lg border px-2 py-1 text-[11px] text-emerald-400 ${a.detail ? 'border-forge-border bg-forge-raised transition-colors hover:border-emerald-400/50' : 'cursor-default border-forge-border bg-forge-raised'}`}
                    title={a.detail ? 'Open the full record' : a.title}
                  >
                    {a.kind}: {a.title.slice(0, 28)}
                  </button>
                ))}
              </div>
            )}
            {viewArt?.detail && (
              <div className="ku-rise mx-auto max-w-3xl rounded-2xl border border-forge-border bg-forge-panel/50 p-4 text-left">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen size={13} className="text-emerald-400" />
                  <span className="text-sm font-medium text-forge-ink">{viewArt.title}</span>
                  <button onClick={() => setViewArt(null)} className="ml-auto text-[11px] text-forge-dim hover:text-forge-ink">close</button>
                </div>
                <p className="whitespace-pre-line text-xs leading-relaxed text-forge-dim">{viewArt.detail}</p>
              </div>
            )}
          </div>
        )}
        <div className="h-10" />
      </div>
    </div>
  );
}
