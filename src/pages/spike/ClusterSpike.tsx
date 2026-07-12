// src/pages/spike/ClusterSpike.tsx
// The Knowledge Universe (spike). The experience: open into "What are you curious about today?",
// fall into a living galaxy of that idea, branch/dive/gather media — and it's STILL THERE when you
// come back. THE RULE: the universe only grows — "New" opens a new world, it never erases one.
// Local-first (multi-world localStorage) with best-effort Supabase sync (app_0013/app_0018), so
// worlds follow you across devices. The old clustering test tools live in a collapsible Dev panel.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GitBranch, RefreshCw, Plus, ChevronRight, Orbit, ListTree, Sparkles, ArrowRight, RotateCcw, FlaskConical, Check, Globe2, Cloud, Loader2,
} from 'lucide-react';
import { Button, Card } from '../../components/ui';
import GalaxyView from './GalaxyView';
import { CLUSTER_SAMPLES } from '../../data/clusterSamples';
import {
  stabilityReport, graphStats, normalizeGraph, slugify,
  type Turn, type ClusterGraph, type Cluster, type StabilityReport,
} from '../../lib/garvis/clustering';
import { clusterConversation, extendClusters } from '../../lib/garvis/clusteringRun';
import {
  loadUniverse, saveUniverse, leaveUniverse, newUniverse, lastSeen, listWorlds, loadWorld, syncUniverse,
  type Universe, type WorldMeta,
} from '../../lib/garvis/universe';
import { migrateLoops } from '../../lib/garvis/loops';

const CURIOSITIES = ['Black holes', 'The Roman Empire', 'How memory works', 'Bioluminescence', 'The history of money', 'Why we dream', 'Lake Geneva real estate', 'How LLMs actually work'];

function parseTranscript(text: string, startIndex = 0): Turn[] {
  const turns: Turn[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(user|assistant|me|garvis)\s*:\s*(.*)$/i.exec(line);
    if (m) turns.push({ i: startIndex + turns.length, role: /^(user|me)$/i.test(m[1]) ? 'user' : 'assistant', text: m[2] });
    else if (turns.length) turns[turns.length - 1].text += ' ' + line;
    else turns.push({ i: startIndex, role: 'user', text: line });
  }
  return turns.map((t, idx) => ({ ...t, i: startIndex + idx }));
}

const KIND_TONE: Record<Cluster['kind'], string> = {
  topic: 'text-forge-ink', question: 'text-sky-400', idea: 'text-forge-ember',
  investigation: 'text-violet-400', artifact: 'text-emerald-400', project: 'text-amber-400',
};

function TreeNode({ node, all, depth }: { node: Cluster; all: Cluster[]; depth: number }) {
  const children = all.filter((c) => c.parentId === node.id);
  return (
    <div style={{ marginLeft: depth ? 16 : 0 }}>
      <div className="flex items-start gap-2 py-1">
        {children.length > 0 ? <ChevronRight size={13} className="mt-1 shrink-0 text-forge-dim" /> : <span className="w-[13px] shrink-0" />}
        <div className="min-w-0">
          <span className={`text-sm font-medium ${KIND_TONE[node.kind]}`} style={{ opacity: 0.45 + 0.55 * node.salience }}>{node.title}</span>
          <span className="ml-2 rounded border border-forge-border px-1 py-0.5 text-[9px] uppercase tracking-wide text-forge-dim">{node.kind}</span>
          <span className="ml-1.5 font-mono text-[10px] text-forge-ember/70">●{node.salience.toFixed(1)}</span>
          {node.summary && <p className="text-xs text-forge-dim">{node.summary}</p>}
        </div>
      </div>
      {children.map((c) => <TreeNode key={c.id} node={c} all={all} depth={depth + 1} />)}
    </div>
  );
}

function StatPill({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-forge-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-forge-dim">{label}</div>
      <div className={`font-mono text-lg ${warn ? 'text-forge-err' : 'text-forge-ink'}`}>{value}</div>
    </div>
  );
}

/** Page by default; `embedded` mounts it as a summoned canvas beside the Command thread (h-full,
 *  no focus theft). `seed` starts a NEW dive immediately — whatever world was current stays saved. */
export default function ClusterSpike({ embedded = false, seed: seedProp }: { embedded?: boolean; seed?: string } = {}) {
  const [graph, setGraph] = useState<ClusterGraph | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [welcome, setWelcome] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cost, setCost] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'universe' | 'tree'>('universe');
  const [showDev, setShowDev] = useState(false);
  const [curiosity, setCuriosity] = useState('');
  // dev-panel state
  const [seed, setSeed] = useState(CLUSTER_SAMPLES[0].seed);
  const [more, setMore] = useState(CLUSTER_SAMPLES[0].more);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [report, setReport] = useState<StabilityReport | null>(null);
  const [reportLabel, setReportLabel] = useState('');
  const [showJson, setShowJson] = useState(false);

  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  const meta = useRef<{ id: string; createdAt: string }>({ id: '', createdAt: '' });
  const stats = graph ? graphStats(graph) : null;

  const refreshWorlds = () => { void listWorlds().then(setWorlds).catch(() => {}); };

  // Mount: a SEED (embedded canvas prop, or ?dive= handed over by Command) starts falling into a
  // NEW world right now — whatever was current stays saved (the universe only grows). ?world= is a
  // deep link into a specific world (the waking moment's warm-trail move lands here). Otherwise,
  // restore — "still here when you come back". Either way, learn what other worlds exist.
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    const params = embedded ? null : new URLSearchParams(window.location.search);
    const s = (seedProp ?? params?.get('dive') ?? '').trim();
    const worldId = params?.get('world')?.trim() ?? '';
    if (s) { setCuriosity(s); void begin(s); }
    else if (worldId) { open(worldId); }
    else {
      const u = loadUniverse();
      if (u) {
        meta.current = { id: u.id, createdAt: u.createdAt };
        setGraph(u.graph); setFocusId(u.focusId); setTitle(u.title);
        setWelcome(`Welcome back — last explored ${lastSeen(u)}`);
        setSaved(true);
      }
    }
    refreshWorlds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-save (debounced): localStorage immediately, then a best-effort cloud push. The first push
  // assigns the world its server uuid — adopt it so every later save updates the same world.
  useEffect(() => {
    if (!graph || !meta.current.id) return;
    setSaved(false);
    const h = window.setTimeout(() => {
      const u: Universe = { id: meta.current.id, title, graph, focusId, createdAt: meta.current.createdAt, updatedAt: '' };
      saveUniverse(u);
      setSaved(true);
      void syncUniverse(u).then((sid) => {
        if (sid) {
          if (sid !== meta.current.id) { migrateLoops(meta.current.id, sid); meta.current.id = sid; }
          setSynced(true);
        }
      }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(h);
  }, [graph, focusId, title]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const install = (t: string, g: ClusterGraph, focus: string | null) => {
    const u = newUniverse(t, g, focus);
    meta.current = { id: u.id, createdAt: u.createdAt };
    setTitle(t); setGraph(g); setFocusId(focus); setView('universe'); setWelcome(null); setReport(null);
  };

  // the curiosity cold-start — drop straight INTO the idea. No pre-built subtopics (those read as a
  // table of contents, not flow); the Idea Room composes the ANSWER + momentum currents on arrival.
  const begin = (topic: string) => run('begin', async () => {
    const t = topic.trim();
    if (!t) return;
    const slug = slugify(t);
    const g = normalizeGraph({ clusters: [{ id: slug, parentId: null, title: t, summary: '', kind: 'topic', salience: 1, maturity: 'spark', turnRefs: [], artifacts: [] }], edges: [] });
    install(t, g, slug);
  });

  // "New" LEAVES the current world (it stays saved, locally and in the cloud) and returns to the
  // cold start, where every world — this one included — is one click away. Nothing is ever erased.
  const startOver = () => {
    leaveUniverse();
    meta.current = { id: '', createdAt: '' };
    setGraph(null); setFocusId(null); setTitle(''); setWelcome(null); setCuriosity(''); setSynced(false);
    refreshWorlds();
  };

  // reopen a world from the cold-start list (local instantly; cloud-only worlds are pulled down)
  const open = (id: string) => {
    setOpening(id); setErr('');
    void loadWorld(id).then((u) => {
      if (!u) { setErr('Could not open that world — it may only exist on another device while offline.'); return; }
      meta.current = { id: u.id, createdAt: u.createdAt };
      setTitle(u.title); setGraph(u.graph); setFocusId(u.focusId); setView('universe');
      setWelcome(`Welcome back — last explored ${lastSeen(u)}`);
      setSaved(true);
    }).finally(() => setOpening(null));
  };

  // ---- dev tools ----
  const build = () => run('build', async () => {
    const tt = parseTranscript(seed);
    const { graph: g, costUsd } = await clusterConversation(tt);
    setTurns(tt); setCost(costUsd); install('Dev: ' + (CLUSTER_SAMPLES.find((s) => s.seed === seed)?.label ?? 'transcript'), g, g.clusters.find((c) => !c.parentId)?.id ?? null);
  });
  const rerun = () => run('rerun', async () => {
    if (!graph) return;
    const { graph: g2, costUsd } = await clusterConversation(turns);
    setReport(stabilityReport(graph, g2)); setReportLabel('re-run (same input)'); setGraph(g2); setCost(costUsd);
  });
  const extend = () => run('extend', async () => {
    if (!graph) return;
    const newTurns = parseTranscript(more, turns.length);
    const { graph: g2, costUsd, report: rep } = await extendClusters(graph, newTurns);
    setTurns([...turns, ...newTurns]); setGraph(g2); setReport(rep); setReportLabel('incremental extend'); setCost(costUsd);
  });

  // ---------- COLD START ----------
  if (!graph) {
    return (
      <div className={`relative flex ${embedded ? 'h-full' : 'h-screen'} w-full flex-col items-center justify-center overflow-hidden px-6`}>
        <style>{`@keyframes ku-cs-glow{0%,100%{box-shadow:0 0 0 1px rgba(233,162,59,.25),0 0 40px -8px rgba(233,162,59,.5)}50%{box-shadow:0 0 0 1px rgba(233,162,59,.4),0 0 70px -6px rgba(233,162,59,.8)}}`}</style>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 600px at 50% 40%, rgba(233,162,59,0.12), transparent 70%), radial-gradient(circle at 50% 50%, #0c0a14, #060509 85%)' }} />
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.5 }} />

        <div className="relative w-full max-w-xl text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-forge-ember"><Sparkles size={18} /><span className="text-xs uppercase tracking-[0.25em] text-forge-dim">Garvis</span></div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-forge-ink sm:text-4xl">What are you curious about today?</h1>
          <p className="mt-2 text-sm text-forge-dim">Name anything. Fall into a living world of it — images, ideas, questions, rabbit holes.</p>

          <form
            onSubmit={(e) => { e.preventDefault(); begin(curiosity); }}
            className="mx-auto mt-6 flex max-w-lg items-center gap-2 rounded-2xl border border-forge-border bg-forge-panel/80 p-2 backdrop-blur"
            style={{ animation: 'ku-cs-glow 5s ease-in-out infinite' }}
          >
            <input
              autoFocus={!embedded} value={curiosity} onChange={(e) => setCuriosity(e.target.value)}
              placeholder="black holes, the Roman Empire, how memory works…"
              className="flex-1 bg-transparent px-3 py-2 text-base text-forge-ink outline-none placeholder:text-forge-dim/60"
            />
            <Button type="submit" loading={busy === 'begin'} disabled={!curiosity.trim()}>Explore <ArrowRight size={15} /></Button>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {CURIOSITIES.map((c) => (
              <button key={c} onClick={() => begin(c)} className="rounded-full border border-forge-border px-3 py-1.5 text-xs text-forge-dim transition-all hover:-translate-y-0.5 hover:border-forge-ember/50 hover:text-forge-ink">{c}</button>
            ))}
          </div>

          {/* YOUR WORLDS — every exploration keeps living; step back into any of them */}
          {worlds.length > 0 && (
            <div className="mt-8">
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-forge-dim/70"><Globe2 size={12} /> return to a world</div>
              <div className="flex flex-wrap justify-center gap-2">
                {worlds.slice(0, 8).map((w) => (
                  <button
                    key={w.id} onClick={() => open(w.id)} disabled={!!opening}
                    className="group flex items-center gap-2 rounded-xl border border-forge-border bg-forge-panel/70 px-3 py-2 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-forge-ember/50 disabled:opacity-60"
                  >
                    {opening === w.id ? <Loader2 size={13} className="shrink-0 animate-spin text-forge-ember" /> : <Sparkles size={13} className="shrink-0 text-forge-ember/80" />}
                    <span className="max-w-[180px] truncate text-xs font-medium text-forge-ink">{w.title}</span>
                    <span className="text-[10px] text-forge-dim">{lastSeen(w)}{typeof w.clusterCount === 'number' ? ` · ${w.clusterCount} ideas` : ''}</span>
                    {w.remote && <Cloud size={11} className="shrink-0 text-sky-400/80" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {busy === 'begin' && <p className="mt-6 text-sm text-forge-ember">Composing your universe…</p>}
          {err && <p className="mt-4 rounded-lg border border-forge-err/30 bg-forge-err/10 p-3 text-sm text-forge-err">{err}</p>}

          <button onClick={() => setShowDev((v) => !v)} className="mt-10 inline-flex items-center gap-1 text-[11px] text-forge-dim/60 hover:text-forge-dim"><FlaskConical size={11} /> dev / clustering tools</button>
          {showDev && (
            <div className="mt-3 rounded-xl border border-forge-border bg-forge-panel/70 p-3 text-left">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CLUSTER_SAMPLES.map((s) => (
                  <button key={s.id} onClick={() => { setSeed(s.seed); setMore(s.more); }} title={s.blurb} className="rounded border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">{s.label}</button>
                ))}
              </div>
              <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={5} className="w-full resize-y rounded-lg border border-forge-border bg-forge-panel p-2 font-mono text-[11px] text-forge-ink outline-none" />
              <Button className="mt-2" size="sm" onClick={build} loading={busy === 'build'}><GitBranch size={13} /> Build map from transcript</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- THE UNIVERSE ----------
  return (
    <div className={`relative flex ${embedded ? 'h-full' : 'h-screen'} w-full flex-col bg-forge-bg`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-forge-border px-4 py-2">
        <Sparkles size={16} className="text-forge-ember" />
        <h1 className="font-display text-base font-semibold text-forge-ink">{title || 'Your universe'}</h1>
        <span className="inline-flex items-center gap-1 text-[11px] text-forge-dim">
          {saved ? <><Check size={11} className="text-emerald-400" /> saved</> : 'saving…'}
          {synced && <Cloud size={11} className="ml-1 text-sky-400/80" aria-label="Synced to cloud" />}
        </span>
        {welcome && <span className="hidden text-[11px] text-forge-ember sm:inline">· {welcome}</span>}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex gap-0.5 rounded-lg border border-forge-border p-0.5">
            <button onClick={() => setView('universe')} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${view === 'universe' ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim'}`}><Orbit size={12} /> Map</button>
            <button onClick={() => setView('tree')} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${view === 'tree' ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim'}`}><ListTree size={12} /> Tree</button>
          </div>
          <button onClick={() => setShowDev((v) => !v)} className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-ink" title="Dev tools"><FlaskConical size={13} /></button>
          <Button size="sm" variant="ghost" onClick={startOver}><RotateCcw size={13} /> New</Button>
        </div>
      </div>

      {err && <p className="border-b border-forge-err/30 bg-forge-err/10 px-4 py-2 text-sm text-forge-err">{err}</p>}

      <div className="relative min-h-0 flex-1">
        {view === 'universe' ? (
          <GalaxyView graph={graph} setGraph={setGraph} focusId={focusId} setFocusId={setFocusId} onCost={setCost} worldKey={meta.current.id || 'local'} />
        ) : (
          <div className="grid h-full gap-4 overflow-auto p-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold">Cluster tree</div>
              {graph.clusters.filter((c) => !c.parentId).map((r) => <TreeNode key={r.id} node={r} all={graph.clusters} depth={0} />)}
            </Card>
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold">Cross-links</div>
              <ul className="space-y-1 text-xs">
                {graph.edges.map((e, i) => <li key={i} className="font-mono text-forge-dim">{e.sourceId} <span className="text-forge-ember">─{e.type}→</span> {e.targetId}</li>)}
              </ul>
              <button onClick={() => setShowJson((v) => !v)} className="mt-3 text-xs text-forge-ember hover:underline">{showJson ? 'Hide' : 'Show'} raw JSON</button>
              {showJson && <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-forge-border bg-forge-bg p-2 text-[10px] text-forge-dim">{JSON.stringify(graph, null, 2)}</pre>}
            </Card>
          </div>
        )}
      </div>

      {showDev && (
        <div className="absolute right-3 top-16 z-40 max-h-[70vh] w-80 overflow-auto rounded-xl border border-forge-border bg-forge-panel/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forge-dim"><FlaskConical size={12} /> Dev — clustering gate</div>
          {stats && (
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <StatPill label="Nodes" value={stats.nodes} warn={stats.nodes > 40 || stats.nodes < 1} />
              <StatPill label="Edges" value={stats.edges} />
              <StatPill label="Roots" value={stats.roots} />
              <StatPill label="Depth" value={stats.maxDepth} />
              <StatPill label="Artifacts" value={stats.artifacts} />
              <StatPill label="Cost" value={`$${cost.toFixed(4)}`} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={extend} loading={busy === 'extend'}><Plus size={13} /> Extend (more turns)</Button>
            <Button size="sm" variant="ghost" onClick={rerun} loading={busy === 'rerun'}><RefreshCw size={13} /> Re-run (stability)</Button>
          </div>
          {report && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span>persisted <strong className="font-mono">{Math.round(report.persistedPct * 100)}%</strong></span>
              <span className={report.reparented.length ? 'text-forge-err' : ''}>reparented <strong className="font-mono">{report.reparented.length}</strong></span>
              <span>added <strong className="font-mono">{report.added.length}</strong></span>
              <span className="text-forge-dim">anchored <strong className="font-mono">{report.renamedAnchored}</strong></span>
              <span className="text-forge-dim/70">({reportLabel})</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
