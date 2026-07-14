// src/components/garvis/canvas/CanvasScene.tsx
// THE MARKETING CANVAS — the atmospheric "home" you drop into: what you're marketing sits in the
// center, everything you can make branches around it on soft threads, the field drifts and glows.
// This is the Explore feeling applied to making marketing. It is PURELY PRESENTATIONAL (data comes
// in as props, clicks go out via onOpen) so it renders in a dev preview route for screenshotting —
// the doing (opening a node) happens in the container's focused sheets, not here.

import { useEffect, useRef } from 'react';

export interface CanvasNode {
  key: string;
  emoji: string;
  label: string;
  sub?: string;
  count?: number;      // a small badge (e.g. 3 postcards made)
  accent?: 'ember' | 'violet';
  dim?: boolean;       // faded until the center is filled in
}
export interface Satellite { nodeKey: string; id: string }

/** Ring layout: node i sits at angle -90 + i·(360/n), a fixed radius from center. */
function ringPos(i: number, n: number): { x: number; y: number } {
  const a = (-90 + i * (360 / Math.max(1, n))) * (Math.PI / 180);
  const rx = 37, ry = 34;             // % radii (slightly squashed so labels don't clip top/bottom)
  return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
}

export function CanvasScene({ center, nodes, sats = [], onOpen, height }: {
  center: { kicker?: string; title: string; sub?: string; filled?: boolean };
  nodes: CanvasNode[];
  sats?: Satellite[];
  onOpen: (key: string) => void;
  height?: string;
}) {
  const starRef = useRef<HTMLCanvasElement>(null);

  // A quiet starfield — drawn once, redrawn on resize. Deterministic-ish; purely decorative.
  useEffect(() => {
    const cv = starRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    // Star colors come from the shared tokens (single source of truth), read once per draw.
    const root = getComputedStyle(document.documentElement);
    const warm = root.getPropertyValue('--gv-star-warm').trim() || '#F5C9A6';
    const cool = root.getPropertyValue('--gv-star-cool').trim() || '#C9B6D8';
    const draw = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w; cv.height = h; ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        ctx.globalAlpha = Math.random() * 0.5 + 0.08;
        ctx.fillStyle = Math.random() > 0.5 ? warm : cool;
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.3 + 0.2, 0, 7); ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  const pos = nodes.map((_, i) => ringPos(i, nodes.length));

  return (
    <div className="mc-root" style={height ? { height } : undefined}>
      <style>{MC_CSS}</style>
      <canvas ref={starRef} className="mc-stars" aria-hidden="true" />

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
        const i = nodes.findIndex((n) => n.key === s.nodeKey);
        if (i < 0) return null;
        const p = pos[i];
        const seed = (s.id.charCodeAt(0) || 7) % 10;
        return <span key={s.id} className="mc-sat" style={{ left: `${p.x + (seed - 5)}%`, top: `${p.y + 7 + (seed % 3)}%` }} />;
      })}

      {/* center */}
      <button className="mc-node mc-center mc-float" style={{ left: '50%', top: '50%' }} onClick={() => onOpen('center')}>
        <span className="mc-orb">
          <span className="mc-cin">
            {center.kicker && <span className="mc-ck">{center.kicker}</span>}
            <span className="mc-ch">{center.title}</span>
            {center.sub && <span className="mc-cs">{center.sub}</span>}
          </span>
        </span>
      </button>

      {/* branch nodes */}
      {nodes.map((n, i) => (
        <button
          key={n.key}
          className={`mc-node mc-float${n.dim ? ' dim' : ''}`}
          style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%`, animationDelay: `${(i % 5) * 0.6}s` }}
          onClick={() => onOpen(n.key)}
        >
          <span className={`mc-orb${n.accent === 'violet' ? ' violet' : ''}`}>
            <span className="mc-em">{n.emoji}</span>
            {typeof n.count === 'number' && n.count > 0 && <span className="mc-count">{n.count}</span>}
          </span>
          <span className="mc-lab">{n.label}</span>
          {n.sub && <span className="mc-sub">{n.sub}</span>}
        </button>
      ))}
    </div>
  );
}

const MC_CSS = `
.mc-root{ position:relative; width:100%; height:min(72vh,640px); border-radius:22px; overflow:hidden;
  background:
    radial-gradient(1000px 640px at 50% 44%, rgba(var(--gv-ember-rgb),.12), transparent 60%),
    radial-gradient(820px 520px at 80% 82%, rgba(var(--gv-violet-rgb),.10), transparent 55%),
    linear-gradient(160deg,var(--gv-night-1),var(--gv-night-2));
  border:1px solid var(--gv-night-line); }
.mc-stars{ position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.55; }
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
.mc-sub{ font-size:11px; color:var(--gv-night-dim); margin-top:-3px; }
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
