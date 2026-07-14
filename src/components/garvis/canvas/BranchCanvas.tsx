// src/components/garvis/canvas/BranchCanvas.tsx
// THE EXPANDING CANVAS SPINE. One persistent night stage; you branch DOWN it — tap a node and the
// view "moves over and branches" (the tapped orb glides to the center, the old ring fans out and
// dims, the new ring blooms and fans in), the same gesture at every depth. The URL is the single
// source of truth for where you are (controlled `path`), so the browser Back button always walks you
// up one branch and any level deep-links. The stage itself never remounts — only the layer inside it
// swaps — so the starfield never re-scatters between levels.
//
// Presentational + honest: every level's nodes come from the parent's resolveLevel (real loaders);
// this component invents nothing, it just animates between whatever real levels it's handed.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StarfieldStage } from './StarfieldStage';
import { CanvasSceneLayer, MC_CSS, ringPos, type CanvasNode, type CanvasCenter, type Satellite } from './CanvasScene';

export interface BranchNode extends CanvasNode {
  leaf?: boolean;   // tapping calls onLeaf (open a sheet / navigate away) instead of branching deeper
}
export interface LevelEmpty { emoji: string; title: string; body: string; ctaLabel?: string; onCta?: () => void }
export interface LevelSpec {
  key: string;          // stable per level (= path.join('/')); keys the bloom so it replays per branch
  crumb: string;        // the breadcrumb label for this level
  center: CanvasCenter;
  nodes: BranchNode[];
  sats?: Satellite[];
  empty?: LevelEmpty;   // shown (instead of the ring) when nodes is empty
}
export type ResolveLevel = (path: string[]) => LevelSpec | Promise<LevelSpec>;

interface Ghost {
  emoji: string;
  accent?: 'ember' | 'violet';
  from: { x: number; y: number; s: number };
  to: { x: number; y: number; s: number };
  at: 'from' | 'to';
  fade: boolean;
}

export function BranchCanvas({ path, resolveLevel, onPathChange, onLeaf, height, trailing }: {
  path: string[];
  resolveLevel: ResolveLevel;
  onPathChange: (next: string[]) => void;
  onLeaf: (path: string[], key: string) => void;
  height?: string;
  trailing?: ReactNode;   // the right side of the breadcrumb bar (e.g. a "Cinematic view" chip)
}) {
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [chain, setChain] = useState<LevelSpec[] | null>(null);   // resolved levels [root … current]
  const [outLevel, setOutLevel] = useState<LevelSpec | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [anim, setAnim] = useState(false);

  const chainRef = useRef<LevelSpec[] | null>(null);
  const prevPathRef = useRef<string[]>(path);
  const reqRef = useRef(0);
  const cacheRef = useRef(new Map<string, LevelSpec>());
  const timersRef = useRef<number[]>([]);

  const resolveCached = useCallback(async (p: string[]): Promise<LevelSpec> => {
    const k = p.join('/');
    const hit = cacheRef.current.get(k);
    if (hit) return hit;
    const spec = await resolveLevel(p);
    cacheRef.current.set(k, spec);
    return spec;
  }, [resolveLevel]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  useEffect(() => {
    let cancelled = false;
    const token = ++reqRef.current;
    const prev = prevPathRef.current;
    clearTimers();

    (async () => {
      // Resolve the whole ancestor chain (root … current): current level's data + every crumb label.
      const prefixes: string[][] = [];
      for (let i = 0; i <= path.length; i++) prefixes.push(path.slice(0, i));
      let levels: LevelSpec[];
      try { levels = await Promise.all(prefixes.map(resolveCached)); }
      catch { return; } // a resolve threw — leave the last good chain up rather than blanking
      if (cancelled || token !== reqRef.current) return;

      const target = levels[levels.length - 1];
      const prevChain = chainRef.current;
      const dir = path.length > prev.length ? 'in' : path.length < prev.length ? 'out' : 'same';

      // No animation: first paint, lateral move, or reduced-motion — just show the destination.
      if (reduced || dir === 'same' || !prevChain) {
        chainRef.current = levels; setChain(levels);
        setOutLevel(null); setGhost(null); setAnim(false);
        prevPathRef.current = path;
        return;
      }

      // Build the ghost: the pivot orb glides between its ring slot and the center.
      const oldCur = prevChain[prevChain.length - 1];
      let g: Ghost | null = null;
      const RING = 84, CENTER = 158;
      if (dir === 'in') {
        const idx = oldCur.nodes.findIndex((n) => n.key === path[path.length - 1]);
        if (idx >= 0) {
          const p0 = ringPos(idx, oldCur.nodes.length); const nd = oldCur.nodes[idx];
          g = { emoji: nd.emoji, accent: nd.accent, from: { x: p0.x, y: p0.y, s: RING }, to: { x: 50, y: 50, s: CENTER }, at: 'from', fade: false };
        }
      } else { // out
        const idx = target.nodes.findIndex((n) => n.key === prev[prev.length - 1]);
        if (idx >= 0) {
          const p0 = ringPos(idx, target.nodes.length); const nd = target.nodes[idx];
          g = { emoji: nd.emoji, accent: nd.accent, from: { x: 50, y: 50, s: CENTER }, to: { x: p0.x, y: p0.y, s: RING }, at: 'from', fade: false };
        }
      }

      chainRef.current = levels; setChain(levels);   // current = destination, rendered with the bloom
      setOutLevel(oldCur);                            // old level fans out on top-of-mind
      setGhost(g); setAnim(true);
      prevPathRef.current = path;

      // Kick the ghost from its origin to its target on the next frame (so the transition runs).
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!cancelled && token === reqRef.current) setGhost((cur) => cur ? { ...cur, at: 'to' } : null);
      }));
      // Fade the ghost as it lands, then clear the transition state.
      timersRef.current.push(window.setTimeout(() => {
        if (!cancelled && token === reqRef.current) setGhost((cur) => cur ? { ...cur, fade: true } : null);
      }, 380));
      timersRef.current.push(window.setTimeout(() => {
        if (cancelled || token !== reqRef.current) return;
        setOutLevel(null); setGhost(null); setAnim(false);
      }, 480));
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.join('/'), resolveCached, reduced]);

  useEffect(() => () => clearTimers(), []);

  const cur = chain ? chain[chain.length - 1] : null;

  const handleOpen = (key: string) => {
    if (key === 'center' || !cur) return;
    const node = cur.nodes.find((n) => n.key === key);
    if (!node) return;
    if (node.leaf) return onLeaf(path, key);
    onPathChange([...path, key]);
  };

  // Breadcrumb: one crumb per ancestor level; the last is "here".
  const crumbs = chain
    ? chain.map((lv, i) => ({ label: lv.crumb, to: path.slice(0, i), here: i === chain.length - 1 }))
    : [{ label: 'Home', to: [] as string[], here: true }];

  return (
    <div className="bc-wrap">
      <style>{MC_CSS + BRANCH_CSS}</style>

      <div className="bc-bar">
        <nav className="bc-crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {i > 0 && <span className="bc-sep" aria-hidden="true">›</span>}
              {c.here
                ? <span className="bc-crumb here" aria-current="page">{c.label}</span>
                : <button className="bc-crumb" onClick={() => onPathChange(c.to)}>{c.label}</button>}
            </span>
          ))}
        </nav>
        {trailing}
      </div>

      <StarfieldStage height={height}>
        {!cur ? (
          <div className="bc-empty"><span className="bc-empty-orb" style={{ boxShadow: 'none', background: 'transparent' }}>·</span></div>
        ) : (
          <>
            {outLevel && (
              <CanvasSceneLayer key={outLevel.key + '::out'} center={outLevel.center} nodes={outLevel.nodes} sats={outLevel.sats} onOpen={() => {}} phase="out" />
            )}

            {cur.empty && cur.nodes.length === 0 ? (
              <div className="bc-empty">
                <div className="bc-empty-orb">{cur.empty.emoji}</div>
                <h2>{cur.empty.title}</h2>
                <p>{cur.empty.body}</p>
                {cur.empty.ctaLabel && <button className="bc-empty-cta" onClick={cur.empty.onCta}>{cur.empty.ctaLabel}</button>}
              </div>
            ) : (
              <CanvasSceneLayer key={cur.key} center={cur.center} nodes={cur.nodes} sats={cur.sats} onOpen={handleOpen} phase={anim ? 'in' : 'idle'} />
            )}

            {ghost && (() => {
              const gp = ghost.at === 'from' ? ghost.from : ghost.to;
              return (
                <div className={`mc-ghost${ghost.fade ? ' fade' : ''}`} style={{ left: `${gp.x}%`, top: `${gp.y}%`, width: gp.s, height: gp.s }} aria-hidden="true">
                  <span className={`mc-orb${ghost.accent === 'violet' ? ' violet' : ''}`}><span className="mc-em">{ghost.emoji}</span></span>
                </div>
              );
            })()}
          </>
        )}
      </StarfieldStage>
    </div>
  );
}

const BRANCH_CSS = `
.bc-wrap{ position:relative; }
.bc-bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; padding:0 2px; }
.bc-crumbs{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.bc-crumb{ color:var(--gv-night-dim); background:none; border:none; cursor:pointer; padding:0; font:inherit; transition:color .15s ease; }
.bc-crumb:hover{ color:var(--gv-night-ink); }
.bc-crumb.here{ color:var(--gv-night-ink); cursor:default; }
.bc-sep{ color:var(--gv-night-dim); opacity:.5; }
.bc-cine{ display:inline-flex; align-items:center; gap:6px; font:600 12px/1 -apple-system,sans-serif; cursor:pointer; white-space:nowrap;
  color:var(--gv-night-dim); background:none; border:1px solid var(--gv-night-line); border-radius:999px; padding:7px 12px; transition:.18s ease; }
.bc-cine:hover{ color:var(--gv-night-ink); border-color:var(--gv-violet); }

.bc-empty{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:10px; padding:24px; }
.bc-empty-orb{ width:76px; height:76px; border-radius:24px; display:grid; place-items:center; font-size:34px;
  background:var(--gv-night-orb); border:1px solid var(--gv-night-warm); box-shadow:0 0 40px -8px rgba(var(--gv-ember-rgb),.4); margin-bottom:6px; }
.bc-empty h2{ font-family:"Iowan Old Style",Palatino,Georgia,serif; font-size:22px; color:var(--gv-night-ink); margin:0; }
.bc-empty p{ max-width:440px; color:var(--gv-night-dim); font-size:14px; line-height:1.6; margin:0; }
.bc-empty-cta{ margin-top:10px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; font:600 14px/1 -apple-system,sans-serif;
  color:#fff; border:none; border-radius:12px; padding:12px 18px; background:var(--gv-ember-grad); box-shadow:0 10px 30px -10px rgba(var(--gv-ember-rgb),.5); transition:.18s ease; }
.bc-empty-cta:hover{ filter:brightness(1.05); transform:translateY(-1px); }

/* the branch transition */
.mc-layer.mc-in{ animation:mc-warpin .5s cubic-bezier(.22,1,.36,1) both; }
@keyframes mc-warpin{ from{ opacity:0; scale:.94; filter:blur(8px) } to{ opacity:1; scale:1; filter:blur(0) } }
.mc-out{ pointer-events:none; }
.mc-out .mc-node{ animation:mc-fanout .24s ease forwards; }
@keyframes mc-fanout{ to{ opacity:0; scale:.6; translate:calc(var(--ox,0)*46px) calc(var(--oy,0)*46px) } }
.mc-out .mc-links{ animation:mc-linksout .2s ease forwards; }
@keyframes mc-linksout{ to{ opacity:0 } }
.mc-in .mc-node{ animation:mc-fanin .34s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mc-fanin{ from{ opacity:0; scale:.5 } to{ opacity:1; scale:1 } }
.mc-ghost{ position:absolute; z-index:5; transform:translate(-50%,-50%); pointer-events:none;
  transition:left .4s cubic-bezier(.22,1,.36,1), top .4s cubic-bezier(.22,1,.36,1), width .4s cubic-bezier(.22,1,.36,1), height .4s cubic-bezier(.22,1,.36,1), opacity .18s ease; }
.mc-ghost .mc-orb{ width:100%; height:100%; }
.mc-ghost.fade{ opacity:0; }

@media (prefers-reduced-motion:reduce){
  .mc-layer.mc-in,.mc-out .mc-node,.mc-in .mc-node,.mc-out .mc-links{ animation:none !important; }
  .mc-ghost{ transition:none !important; display:none; }
}
`;
