// src/pages/ProfileHome.tsx
// THE FRONT DOOR + THE WHOLE SPINE. You start on your profile canvas and branch DOWN it — you →
// a business → one of its areas → a made thing — the "move over and branch" gesture at every level,
// with the URL as the source of truth so Back walks you up and any level deep-links. Every level's
// nodes come from the real loaders (loadUniverseScene → businesses, loadSystemScene → a business's
// areas, listClusterArtifacts → an area's work); this page invents no state. It shares the
// businesses scene with the 3D "cinematic" galaxy — one truth, drawn two ways.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Telescope } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BranchCanvas, type LevelSpec, type BranchNode } from '../components/garvis/canvas/BranchCanvas';
import { ArtifactSheet } from '../components/garvis/canvas/ArtifactSheet';
import { CanvasChat } from '../components/garvis/canvas/CanvasChat';
import { StudioDock } from '../components/garvis/canvas/StudioDock';
import { loadUniverseScene } from '../lib/garvis/universeViewRun';
import { loadSystemScene } from '../lib/garvis/systemViewRun';
import type { SystemScene } from '../lib/garvis/systemView';
import { listClusterArtifacts, type StudioArtifact } from '../lib/garvis/artifacts';
import { SEED_SOURCE, loadWeb } from '../lib/garvis/workwebRun';
import { loadStudioContext, runStudioTurn } from '../lib/garvis/studioChat';
import { askGarvis } from '../lib/garvis/ask';

// Authored, deterministic presentation (emoji is NOT a data field anywhere) — driven by real fields
// (archetype / kind) with a plain fallback, never framed as state.
const AREA_EMOJI: Record<string, string> = { intel: '🧠', audience: '👥', studio: '🎨', launch: '🚀', loop: '🔁', ledger: '📊', vault: '🗄️' };
const WORK_EMOJI: Record<string, string> = { image: '🖼️', video: '🎬', diagram: '📐', research: '🔎', doc: '📄', link: '🔗', post: '📣', data: '📊', simulation: '🧪' };

function madeCount(massEvidence: string): number | undefined {
  const m = massEvidence.match(/(\d+)\s+artifacts?/);
  return m ? Number(m[1]) : undefined;
}

export default function ProfileHome() {
  const navigate = useNavigate();
  const { businessId, areaSlug } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();

  const path = areaSlug ? [businessId!, areaSlug] : businessId ? [businessId!] : [];
  const first = (profile?.full_name || profile?.email || 'You').split(/\s+/)[0];

  const [reloadKey, setReloadKey] = useState(0);
  const [sheet, setSheet] = useState<StudioArtifact | null>(null);
  const sceneCache = useRef(new Map<string, SystemScene | null>());
  const artifactsById = useRef(new Map<string, StudioArtifact>());

  // A work-item sheet is off-URL local state — close it whenever the canvas level changes (e.g. the
  // browser Back button), so the sheet never floats over a different level than it was opened from.
  useEffect(() => { setSheet(null); }, [businessId, areaSlug]);

  // At an area, resolve its cluster so the studio dock can summon the real studios seeded with it.
  const [areaCtx, setAreaCtx] = useState<{ clusterId: string; title: string } | null>(null);
  useEffect(() => {
    if (!businessId || !areaSlug) { setAreaCtx(null); return; }
    let live = true;
    void getScene(businessId).then((scene) => {
      if (!live) return;
      const planet = scene?.planets.find((p) => p.slug === areaSlug) ?? null;
      setAreaCtx(planet ? { clusterId: planet.id, title: planet.title } : null);
    }).catch(() => { if (live) setAreaCtx(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, areaSlug, reloadKey]);

  const bumpReload = useCallback(() => {
    sceneCache.current.clear();
    artifactsById.current.clear();
    setReloadKey((k) => k + 1);
  }, []);

  const errorLevel = useCallback((key: string, crumb: string): LevelSpec => ({
    key, crumb, transient: true,   // never cached — the "Try again" reload re-attempts the load
    center: { kicker: 'Offline', title: 'Couldn’t load' },
    nodes: [],
    empty: { emoji: '⚠️', title: 'Couldn’t load', body: 'Something went wrong reaching your data. Check your connection and try again.', ctaLabel: 'Try again', onCta: bumpReload },
  }), [bumpReload]);

  const getScene = useCallback(async (bId: string): Promise<SystemScene | null> => {
    if (sceneCache.current.has(bId)) return sceneCache.current.get(bId)!;
    const scene = await loadSystemScene(bId);   // may throw (caught by caller) — only cache on success
    sceneCache.current.set(bId, scene);
    return scene;
  }, []);

  const resolveLevel = useCallback(async (p: string[]): Promise<LevelSpec> => {
    try {
      // ── Level 0: You — your businesses orbit you ──────────────────────────────
      if (p.length === 0) {
        const scene = await loadUniverseScene();
        const biz: BranchNode[] = scene.bodies.map((b) => {
          const count = madeCount(b.massEvidence);
          return { key: b.id, emoji: '🏢', label: b.title, sub: b.momentum?.label ?? b.massEvidence, count: count && count > 0 ? count : undefined, dim: count === 0, accent: 'ember' };
        });
        const ambient: BranchNode[] = [
          { key: 'today', emoji: '🌅', label: 'Today', sub: 'what needs you', accent: 'violet', leaf: true },
          { key: 'queue', emoji: '✅', label: 'Queue', sub: 'approve & reply', accent: 'violet', leaf: true },
          { key: 'money', emoji: '💵', label: 'Money', sub: 'invoices', accent: 'violet', leaf: true },
          { key: 'new', emoji: '＋', label: 'New business', sub: 'start one', dim: true, leaf: true },
        ];
        return {
          key: '', crumb: 'You',
          center: { kicker: 'Your command', title: first, sub: scene.bodies.length === 1 ? '1 business' : `${scene.bodies.length} businesses` },
          nodes: biz.length ? [...biz, ...ambient] : [],
          empty: biz.length ? undefined : { emoji: '🏢', title: 'No businesses yet', body: 'This is your command center. Start your first business and it’ll appear here, orbiting you — tap in to run its marketing, website, and outreach.', ctaLabel: 'Start your first business', onCta: () => navigate('/garvis/webs') },
        };
      }

      // ── Level 1: a business — its production areas orbit it ────────────────────
      if (p.length === 1) {
        const bId = p[0];
        const scene = await getScene(bId);
        if (!scene) {
          return { key: bId, crumb: 'Business', center: { kicker: 'Business', title: 'This business', sub: 'nothing set up yet' }, nodes: [], empty: { emoji: '🗂', title: 'Nothing set up yet', body: 'This business doesn’t have any production areas yet.', ctaLabel: 'Open the full studio', onCta: () => navigate(`/garvis/webs/${bId}`) } };
        }
        const areas: BranchNode[] = scene.planets.map((pl) => ({
          key: pl.slug, emoji: AREA_EMOJI[pl.archetype] ?? '📦', label: pl.title, sub: pl.evidence, count: pl.artifactsTotal > 0 ? pl.artifactsTotal : undefined, dim: pl.artifactsTotal === 0, accent: 'ember',
        }));
        return {
          key: bId, crumb: scene.star.title,
          center: { kicker: scene.star.momentum?.label ?? 'Business', title: scene.star.title, sub: `${scene.planets.length} area${scene.planets.length === 1 ? '' : 's'}` },
          nodes: areas,
          empty: areas.length ? undefined : { emoji: '🗂', title: 'No areas yet', body: 'Nothing is set up in this business yet — open the full studio to get it going.', ctaLabel: 'Open the full studio', onCta: () => navigate(`/garvis/webs/${bId}`) },
        };
      }

      // ── Level 2: an area — its real work orbits it (each a leaf → paper sheet) ──
      const bId = p[0], slug = p[1];
      const scene = await getScene(bId);
      const planet = scene?.planets.find((pl) => pl.slug === slug) ?? null;
      if (!planet) {
        return { key: `${bId}/${slug}`, crumb: 'Area', center: { kicker: 'Area', title: 'This area', sub: '' }, nodes: [], empty: { emoji: '🗂', title: 'Area not found', body: 'This area isn’t part of this business.', ctaLabel: 'Back to the business', onCta: () => navigate(`/garvis/home/${encodeURIComponent(bId)}`, { replace: true }) } };
      }
      const work = (await listClusterArtifacts(planet.id)).filter((a) => a.source !== SEED_SOURCE);
      work.forEach((a) => artifactsById.current.set(a.id, a));
      const nodes: BranchNode[] = work.map((a) => ({
        key: a.id, emoji: WORK_EMOJI[a.kind] ?? '📄', label: a.title, sub: a.revision > 1 ? `v${a.revision} · ${a.kind}` : a.kind, accent: 'ember', leaf: true,
      }));
      return {
        key: `${bId}/${slug}`, crumb: planet.title,
        center: { kicker: planet.status, title: planet.title, sub: planet.evidence },
        nodes,
        empty: nodes.length ? undefined : { emoji: AREA_EMOJI[planet.archetype] ?? '📦', title: 'Nothing made here yet', body: `No work in ${planet.title} yet. Open the studio to make the first piece.`, ctaLabel: 'Open the full studio', onCta: () => navigate(`/garvis/webs/${bId}`) },
      };
    } catch {
      return errorLevel(p.join('/'), p.length ? 'Business' : 'You');
    }
  }, [first, navigate, getScene, errorLevel]);

  const onPathChange = useCallback((next: string[]) => {
    const url = '/garvis/home' + next.map((s) => '/' + encodeURIComponent(s)).join('');
    // Descend & up-navigation both PUSH — so browser Back always walks to the previous location and
    // the URL never lies. (navigate(-1) can't prove the entry behind is the parent — it may be a
    // replaced entry or nothing, escaping the app — so we never use it.) Lateral moves replace.
    if (next.length === path.length) navigate(url, { replace: true });
    else navigate(url);
  }, [path.length, navigate]);

  const onLeaf = useCallback((p: string[], key: string) => {
    if (p.length === 0) {
      if (key === 'today') navigate('/garvis/command');
      else if (key === 'queue') navigate('/garvis/queue');
      else if (key === 'money') navigate('/garvis/money');
      else if (key === 'new') navigate('/garvis/webs');
      return;
    }
    if (p.length === 2) {
      const a = artifactsById.current.get(key);
      if (a) setSheet(a);
    }
  }, [navigate]);

  // Run a real studio turn against one area's cluster — the proven decide-only path (cluster-chat →
  // create_artifact / revise_artifact / propose_approval). A turn that makes something flips
  // res.changed, and bumpReload re-reads the level so the new artifact blooms in as a node. Nothing
  // is fabricated (the model gets the area's real context) and nothing outward-facing is executed —
  // only proposed into the approval queue.
  const runAreaTurn = useCallback(async (worldId: string, clusterId: string, message: string): Promise<{ reply: string; note?: string }> => {
    const web = await loadWeb(worldId);
    const cluster = web?.clusters.find((c) => c.id === clusterId) ?? null;
    if (!web || !cluster || !cluster.charter) {
      const a = await askGarvis(message, { worldId });   // no chartered workspace here — answer, don't fake making
      return { reply: a.answer };
    }
    const scene = await getScene(worldId);
    const ctx = await loadStudioContext({ worldId, webTitle: web.title, objective: scene?.star.objective ?? null, cluster: { title: cluster.title, summary: cluster.summary, charter: cluster.charter }, clusterId, tools: cluster.tools });
    const res = await runStudioTurn(clusterId, ctx, message);
    if (res.changed) bumpReload();
    const note = res.decision.kind === 'propose_approval' ? 'Queued for approval — nothing sent.'
      : res.changed ? 'Made it — it’s on your canvas.' : undefined;
    return { reply: res.reply, note };
  }, [getScene, bumpReload]);

  // The docked canvas chat. At an area (level 2) it's make-capable; at You / a business it answers
  // from the record (making needs a chosen area, so we never fake it — you branch in, then make).
  const onGarvisSend = useCallback(async (text: string): Promise<{ reply: string; note?: string }> => {
    if (path.length === 2) {
      const scene = await getScene(path[0]);
      const planet = scene?.planets.find((p) => p.slug === path[1]) ?? null;
      if (planet) return runAreaTurn(path[0], planet.id, text);
    }
    const worldId = path.length === 1 ? path[0] : undefined;
    const a = await askGarvis(text, worldId ? { worldId } : undefined);
    return { reply: a.answer };
  }, [path, getScene, runAreaTurn]);

  // "Do it differently" on a made thing: a turn seeded with the artifact that branches a fresh take.
  const onArtifactAsk = useCallback((artifact: StudioArtifact, text: string): Promise<{ reply: string; note?: string }> => {
    const instruction = `About the ${artifact.kind} titled "${artifact.title}": ${text}. If I'm asking for a different version or a variation, CREATE A NEW artifact (a fresh take) rather than overwriting this one.`;
    return runAreaTurn(businessId ?? '', artifact.cluster_id, instruction);
  }, [businessId, runAreaTurn]);

  const chatHint = path.length === 2 ? 'Ask about this area, or tell Garvis to make something…'
    : path.length === 1 ? 'Ask Garvis about this business…'
    : 'Ask Garvis about your businesses…';

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <BranchCanvas
          key={reloadKey}
          path={path}
          resolveLevel={resolveLevel}
          onPathChange={onPathChange}
          onLeaf={onLeaf}
          trailing={<button className="bc-cine" onClick={() => navigate('/garvis/universe')}><Telescope size={14} /> Cinematic view</button>}
        />
        {areaCtx && businessId && (
          <StudioDock worldId={businessId} clusterId={areaCtx.clusterId} title={areaCtx.title} onToast={toast} onClosed={bumpReload} />
        )}
        <CanvasChat onSend={onGarvisSend} hint={chatHint} />
      </div>
      {sheet && <ArtifactSheet artifact={sheet} onClose={() => setSheet(null)} onAsk={(text) => onArtifactAsk(sheet, text)} />}
    </AppShell>
  );
}
