// src/components/garvis/canvas/CanvasScene.tsx
// THE FACET CANVAS — the atmospheric "home" you drop into: what's in focus sits in the center,
// everything that branches off it rings around on soft threads, the field drifts and glows. This is
// the Explore feeling as a reusable canvas. PURELY PRESENTATIONAL (data in as props, clicks out via
// onOpen) so it renders in a dev preview for screenshotting.
//
// It comes in two pieces so the branch-in-place spine (BranchCanvas) can stack levels inside ONE
// persistent StarfieldStage:
//   • CanvasSceneLayer — the threads + center + ring, stage-less, with optional animation phase.
//   • CanvasScene       — the thin shim: a StarfieldStage wrapping one idle layer (what every
//                         existing caller — ProfileHome, MarketingCanvas, previews — uses verbatim).

import { type CSSProperties } from 'react';
import { StarfieldStage } from './StarfieldStage';

export interface CanvasNode {
  key: string;
  emoji: string;
  label: string;
  sub?: string;
  count?: number;      // a small badge (e.g. 3 postcards made)
  accent?: 'ember' | 'violet';
  dim?: boolean;       // faded until it has anything in it
}
export interface Satellite { nodeKey: string; id: string }
export interface CanvasCenter { kicker?: string; title: string; sub?: string; filled?: boolean }

/** Ring layout: node i sits at angle -90 + i·(360/n), a fixed radius from center. The ONE geometry
 *  source — the ring, the branch ghost's origin, the fan-out vectors, and branch-out all read it. */
export function ringPos(i: number, n: number): { x: number; y: number } {
  const a = (-90 + i * (360 / Math.max(1, n))) * (Math.PI / 180);
  const rx = 37, ry = 34;             // % radii (slightly squashed so labels don't clip top/bottom)
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

/** Unit vector pointing from center out through node i — used by the fan-out keyframe (--ox/--oy). */
function ringVec(i: number, n: number): { ox: number; oy: number } {
  const a = (-90 + i * (360 / Math.max(1, n))) * (Math.PI / 180);
  return { ox: Math.cos(a), oy: Math.sin(a) };
}

/** The stage-less body: threads, satellites, center, ring. `phase` drives the branch transition
 *  ('idle' = the resting float; 'in' = fanning in on a fresh branch; 'out' = receding). */
export function CanvasSceneLayer({ center, nodes, sats = [], onOpen, phase = 'idle', hideCenter = false }: {
  center: CanvasCenter;
  nodes: CanvasNode[];
  sats?: Satellite[];
  onOpen: (key: string) => void;
  phase?: 'idle' | 'in' | 'out';
  hideCenter?: boolean;
}) {
  const n = nodes.length;
  const pos = nodes.map((_, i) => ringPos(i, n));
  const idle = phase === 'idle';
  const floatCls = idle ? ' mc-float' : '';

  return (
    <div className={`mc-layer mc-${phase}`}>
      {/* connector threads (behind nodes) */}
      <svg className="mc-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="mc-lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gv-ember)' }} /><stop offset="1" style={{ stopColor: 'var(--gv-violet)' }} />
          </linearGradient>
        </defs>
        {pos.map((p, i) => (
          <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} className={nodes[i].dim ? 'mc-line dim' : 'mc-line'} />
        ))}
      </svg>

      {/* rendition satellites — a little glow that branched off a node */}
      {sats.map((s) => {
        const i = nodes.findIndex((nn) => nn.key === s.nodeKey);
        if (i < 0) return null;
        const p = pos[i];
        const seed = (s.id.charCodeAt(0) || 7) % 10;
        return <span key={s.id} className="mc-sat" style={{ left: `${p.x + (seed - 5)}%`, top: `${p.y + 7 + (seed % 3)}%` }} />;
      })}

      {/* center */}
      {!hideCenter && (
        <button className={`mc-node mc-center${floatCls}`} style={{ left: '50%', top: '50%' }} onClick={() => onOpen('center')}>
          <span className="mc-orb">
            <span className="mc-cin">
              {center.kicker && <span className="mc-ck">{center.kicker}</span>}
              <span className="mc-ch">{center.title}</span>
              {center.sub && <span className="mc-cs">{center.sub}</span>}
            </span>
          </span>
        </button>
      )}

      {/* branch nodes */}
      {nodes.map((nd, i) => {
        const { ox, oy } = ringVec(i, n);
        const style = {
          left: `${pos[i].x}%`, top: `${pos[i].y}%`,
          animationDelay: idle ? `${(i % 5) * 0.6}s` : phase === 'in' ? `${i * 30}ms` : '0ms',
          '--ox': ox.toFixed(3), '--oy': oy.toFixed(3),
        } as CSSProperties;
        return (
          <button
            key={nd.key}
            className={`mc-node${floatCls}${nd.dim ? ' dim' : ''}`}
            style={style}
            onClick={() => onOpen(nd.key)}
          >
            <span className={`mc-orb${nd.accent === 'violet' ? ' violet' : ''}`}>
              <span className="mc-em">{nd.emoji}</span>
              {typeof nd.count === 'number' && nd.count > 0 && <span className="mc-count">{nd.count}</span>}
            </span>
            <span className="mc-lab">{nd.label}</span>
            {nd.sub && <span className="mc-sub">{nd.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function CanvasScene({ center, nodes, sats = [], onOpen, height }: {
  center: CanvasCenter;
  nodes: CanvasNode[];
  sats?: Satellite[];
  onOpen: (key: string) => void;
  height?: string;
}) {
  return (
    <StarfieldStage height={height} density={70}>
      <style>{MC_CSS}</style>
      <CanvasSceneLayer center={center} nodes={nodes} sats={sats} onOpen={onOpen} />
    </StarfieldStage>
  );
}

export const MC_CSS = `
.mc-layer{ position:absolute; inset:0; }
.mc-links{ position:absolute; inset:0; width:100%; height:100%; }
.mc-line{ stroke:url(#mc-lg); stroke-width:1.6; opacity:.45; stroke-dasharray:2 6; stroke-linecap:round;
  vector-effect:non-scaling-stroke; animation:mc-flow 24s linear infinite; }
.mc-line.dim{ opacity:.14; }
@keyframes mc-flow{ to{ stroke-dashoffset:-120; } }

.mc-node{ position:absolute; transform:translate(-50%,-50%); cursor:pointer; background:none; border:none; padding:0;
  display:flex; flex-direction:column; align-items:center; gap:7px; width:128px; z-index:2; color:var(--gv-night-ink); font:inherit;
  transition:transform .25s cubic-bezier(.2,.7,.2,1); }
.mc-node:hover{ transform:translate(-50%,-50%) scale(1.06); }
.mc-node:focus-visible{ outline:none; }
.mc-node:focus-visible .mc-orb{ box-shadow:0 0 0 2px var(--gv-ember), 0 0 34px -4px rgba(var(--gv-ember-rgb),.6); }
.mc-node.dim{ opacity:.5; }
.mc-orb{ width:84px; height:84px; border-radius:22px; background:var(--gv-night-orb); border:1px solid var(--gv-night-line2);
  display:grid; place-items:center; position:relative; box-shadow:0 10px 30px -12px rgba(0,0,0,.6); transition:.25s ease; }
.mc-node:hover .mc-orb{ border-color:var(--gv-ember); box-shadow:0 0 0 1px var(--gv-ember), 0 0 34px -4px rgba(var(--gv-ember-rgb),.55); }
.mc-orb.violet{ border-color:var(--gv-violet-line); }
.mc-node:hover .mc-orb.violet{ border-color:var(--gv-violet); box-shadow:0 0 0 1px var(--gv-violet), 0 0 34px -4px rgba(var(--gv-violet-rgb),.5); }
.mc-em{ font-size:29px; line-height:1; }
.mc-lab{ font-size:13px; font-weight:600; }
.mc-sub{ font-size:11px; color:var(--gv-night-dim); margin-top:-3px; text-align:center; max-width:128px; }
.mc-count{ position:absolute; top:-6px; right:-6px; min-width:20px; height:20px; padding:0 5px; border-radius:999px;
  background:linear-gradient(150deg,var(--gv-ember),var(--gv-ember-heat)); color:var(--gv-night-1); font-size:11px; font-weight:700; display:grid; place-items:center; box-shadow:0 2px 8px rgba(0,0,0,.4); }

.mc-center{ z-index:3; width:196px; }
.mc-center .mc-orb{ width:158px; height:158px; border-radius:36px;
  background:radial-gradient(120px 120px at 40% 30%, rgba(var(--gv-ember-rgb),.28), transparent 70%), var(--gv-night-orb);
  border-color:var(--gv-night-warm); box-shadow:0 0 0 1px rgba(var(--gv-ember-rgb),.35), 0 0 60px -6px rgba(var(--gv-ember-rgb),.55); }
.mc-center:hover .mc-orb{ box-shadow:0 0 0 1px rgba(var(--gv-ember-rgb),.6), 0 0 70px -6px rgba(var(--gv-ember-rgb),.7); }
.mc-cin{ text-align:center; padding:0 14px; display:flex; flex-direction:column; gap:4px; }
.mc-ck{ font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--gv-ember); font-weight:700; }
.mc-ch{ font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; font-size:19px; line-height:1.08; text-wrap:balance; }
.mc-cs{ font-size:11px; color:var(--gv-night-dim); font-variant-numeric:tabular-nums; }

.mc-float{ animation:mc-bob 7.5s ease-in-out infinite; }
@keyframes mc-bob{ 0%,100%{ translate:0 0 } 50%{ translate:0 -6px } }

.mc-sat{ position:absolute; width:13px; height:13px; border-radius:50%; transform:translate(-50%,-50%); z-index:1;
  background:radial-gradient(circle at 40% 35%, var(--gv-ember-heat), var(--gv-ember)); box-shadow:0 0 12px -1px rgba(var(--gv-ember-rgb),.6); animation:mc-pop .4s ease; }
@keyframes mc-pop{ from{ scale:0; opacity:0 } to{ scale:1; opacity:1 } }

@media (max-width:640px){
  .mc-node{ width:92px; } .mc-orb{ width:62px; height:62px; border-radius:18px; } .mc-em{ font-size:23px; }
  .mc-center{ width:150px; } .mc-center .mc-orb{ width:120px; height:120px; border-radius:28px; } .mc-ch{ font-size:15px; }
}
@media (prefers-reduced-motion:reduce){ .mc-float,.mc-line,.mc-sat{ animation:none !important; } }
`;
