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
} from 'lucide-react';
import {
  relatedClusters, addChild, slugify,
  type ClusterGraph, type Cluster, type ClusterKind, type ClusterMaturity, type Artifact, type ExpandMode, type Lead, type LeadKind, type RelatedCluster,
} from '../../lib/garvis/clustering';
import { exploreLeads, expandCluster, gatherWikiMedia, gatherVideos, findSimilarClusters, composeProspect, type Prospect } from '../../lib/garvis/clusteringRun';
import { recordPick, kindBias } from '../../lib/garvis/currents';

const PREFETCH_N = 3;

const KIND_HEX: Record<ClusterKind, string> = {
  topic: '#e9a23b', question: '#38bdf8', idea: '#f59e0b', investigation: '#a78bfa', artifact: '#34d399', project: '#fbbf24',
};
const KIND_ICON: Record<ClusterKind, typeof Sparkles> = {
  topic: Sparkles, question: CircleHelp, idea: Sparkles, investigation: Telescope, artifact: BookOpen, project: FolderKanban,
};
const MATURITY_LABEL: Record<ClusterMaturity, string> = {
  spark: 'spark', growing: 'growing', mature: 'mature', building: 'building', finished: 'done', dormant: 'dormant', archived: 'archived',
};
const LEAD_ICON: Record<LeadKind, typeof ArrowRight> = { dig: ArrowRight, question: HelpCircle, tangent: Shuffle };
const LEAD_HEX: Record<LeadKind, string> = { dig: '#e9a23b', question: '#38bdf8', tangent: '#a78bfa' };
const leadToKind = (k: LeadKind): ClusterKind => (k === 'question' ? 'question' : k === 'tangent' ? 'idea' : 'topic');

const imagesOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'image' && (a.thumb || a.url));
const videosOf = (c: Cluster) => c.artifacts.filter((a) => a.kind === 'video');
const understandingOf = (c: Cluster) => c.artifacts.find((a) => a.id === 'understanding') ?? c.artifacts.find((a) => a.kind === 'research');
const creationsOf = (c: Cluster) => c.artifacts.filter((a) => a.source === 'generated' || a.kind === 'diagram' || a.kind === 'post');

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
  const [, setReadyTick] = useState(0);
  const leadsCache = useRef<Record<string, Lead[]>>({});
  const done = useRef<Set<string>>(new Set());
  const prefetch = useRef<Record<string, Prospect | 'loading'>>({});

  const byId = useMemo(() => new Map(graph.clusters.map((c) => [c.id, c])), [graph]);
  const roots = useMemo(() => graph.clusters.filter((c) => !c.parentId), [graph]);
  const focus = (focusId && byId.get(focusId)) || roots[0] || graph.clusters[0] || null;

  const ancestors = focus ? trail(byId, focus.id) : [];
  const children = focus ? graph.clusters.filter((c) => c.parentId === focus.id).sort((a, b) => b.salience - a.salience) : [];
  const related = focus ? (similar ?? relatedClusters(graph, focus.id)) : [];

  useEffect(() => {
    if (!focus) return;
    const id = focus.id;
    setLeads(leadsCache.current[id] ?? []); setSimilar(null);
    if (done.current.has(id)) return;
    done.current.add(id);
    let cancelled = false;
    const c = byId.get(id)!;
    const needAnswer = !c.artifacts.some((a) => a.id === 'understanding');
    const needMedia = !c.artifacts.some((a) => a.kind === 'image');
    const needVideo = !c.artifacts.some((a) => a.kind === 'video');
    setLoading({ answer: needAnswer, media: needMedia, video: needVideo });
    if (needAnswer) exploreLeads(graph, id, ancestors.map((a) => a.title)).then((r) => { if (cancelled) return; leadsCache.current[id] = r.leads; setLeads(r.leads); setGraph(r.graph); if (r.costUsd) onCost?.(r.costUsd); }).finally(() => { if (!cancelled) setLoading((l) => ({ ...l, answer: false })); });
    if (needMedia) gatherWikiMedia(graph, id).then((r) => { if (!cancelled && r.found) setGraph(r.graph); }).finally(() => { if (!cancelled) setLoading((l) => ({ ...l, media: false })); });
    if (needVideo) gatherVideos(graph, id).then((r) => { if (!cancelled && r.found) setGraph(r.graph); }).finally(() => { if (!cancelled) setLoading((l) => ({ ...l, video: false })); });
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
  const run = async (label: string, fn: () => Promise<{ graph?: ClusterGraph; costUsd?: number } | RelatedCluster[]>) => {
    setBusy(label);
    try { const res = await fn(); if (Array.isArray(res)) setSimilar(res); else { if (res.graph) setGraph(res.graph); if (res.costUsd) onCost?.(res.costUsd); } }
    finally { setBusy(null); }
  };
  const expand = (m: ExpandMode) => run(`x:${m}`, () => expandCluster(graph, focus.id, m));

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
          </div>
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
                <span className="text-[11px] uppercase tracking-wide text-forge-dim/60">{similar ? 'across your universe' : 'this reminds you of'}</span>
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                  {related.map((r) => { const c = byId.get(r.id); return c ? <button key={r.id} onClick={() => travel(r.id)} className="inline-flex items-center gap-1.5 rounded-full border border-forge-border px-3 py-1.5 text-xs text-forge-dim transition-all hover:-translate-y-0.5 hover:text-forge-ink"><Link2 size={11} className="text-violet-400" /> {c.title}</button> : null; })}
                </div>
              </div>
            )}
            {creations.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {creations.map((a) => <span key={a.id} className="rounded-lg border border-forge-border bg-forge-raised px-2 py-1 text-[11px] text-emerald-400" title={a.detail}>{a.kind}: {a.title.slice(0, 28)}</span>)}
              </div>
            )}
          </div>
        )}
        <div className="h-10" />
      </div>
    </div>
  );
}
