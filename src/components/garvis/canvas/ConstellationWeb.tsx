// src/components/garvis/canvas/ConstellationWeb.tsx
// THE REUSABLE WEB — the Explore galaxy generalized so any collection becomes an explorable web:
// contacts, rated prospect sites, listings, worlds. Peers cluster into constellations by a category
// (a glowing hub each), each orb's SIZE encodes a real metric, and tapping an orb opens it. Purely
// presentational (data + onOpen come in as props, layout is deterministic via layoutWeb) so it drops
// onto a page or a dev-preview route unchanged. Shares the marketing-canvas aesthetic → one language.

import { useEffect, useMemo, useRef } from 'react';
import { layoutWeb, type WebNode, type WebGroupDef } from '../../../lib/garvis/webLayout';

export function ConstellationWeb({ nodes, groups, onOpen, title, height, emptyLabel }: {
  nodes: WebNode[];
  groups: WebGroupDef[];
  onOpen: (id: string) => void;
  title?: string;
  height?: string;
  emptyLabel?: string;
}) {
  const starRef = useRef<HTMLCanvasElement>(null);
  const layout = useMemo(() => layoutWeb(nodes, groups, { rMin: 15, rMax: 40, nodeGap: 4.5, hubRadius: 25 }), [nodes, groups]);
  const hubByKey = useMemo(() => new Map(layout.hubs.map((h) => [h.key, h])), [layout]);

  useEffect(() => {
    const cv = starRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const draw = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w; cv.height = h; ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        ctx.globalAlpha = Math.random() * 0.5 + 0.06;
        ctx.fillStyle = Math.random() > 0.5 ? '#F5C9A6' : '#C9B6D8';
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.3 + 0.2, 0, 7); ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cw-root" style={height ? { height } : undefined}>
      <style>{CW_CSS}</style>
      <canvas ref={starRef} className="cw-stars" aria-hidden="true" />

      {/* legend */}
      {!layout.empty && (
        <div className="cw-legend">
          {layout.hubs.map((h) => (
            <span key={h.key} className="cw-leg"><span className="cw-dot" style={{ background: h.color }} />{h.label} <b>{h.count}</b></span>
          ))}
        </div>
      )}
      {title && <div className="cw-title">{title}</div>}

      {layout.empty ? (
        <div className="cw-empty">{emptyLabel ?? 'Nothing here yet.'}</div>
      ) : (
        <>
          {/* connector threads: each orb → its constellation hub */}
          <svg className="cw-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {layout.nodes.map((n) => {
              const hub = hubByKey.get(n.group); if (!hub) return null;
              return <line key={n.id} x1={n.x} y1={n.y} x2={hub.x} y2={hub.y} stroke={n.color} className="cw-line" />;
            })}
          </svg>

          {/* constellation hubs */}
          {layout.hubs.map((h) => (
            <div key={h.key} className="cw-hub" style={{ left: `${h.x}%`, top: `${h.y}%` }}>
              <span className="cw-hubdot" style={{ background: h.color, boxShadow: `0 0 24px -2px ${h.color}` }} />
            </div>
          ))}

          {/* the orbs */}
          {layout.nodes.map((n) => (
            <button
              key={n.id}
              className="cw-node"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
              onClick={() => onOpen(n.id)}
              title={`${n.label}${n.sub ? ` — ${n.sub}` : ''}`}
            >
              <span className="cw-orb" style={{
                width: n.r, height: n.r,
                borderColor: n.color,
                background: `radial-gradient(circle at 38% 32%, color-mix(in srgb, ${n.color} 42%, transparent), color-mix(in srgb, ${n.color} 12%, transparent))`,
                boxShadow: `0 0 0 1px color-mix(in srgb, ${n.color} 40%, transparent), 0 6px 20px -8px color-mix(in srgb, ${n.color} 55%, transparent)`,
              }}>
                {typeof n.badge !== 'undefined' && n.badge !== '' && <span className="cw-badge">{n.badge}</span>}
              </span>
              <span className={`cw-lab${n.primary ? ' show' : ''}`}>{n.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const CW_CSS = `
.cw-root{ position:relative; width:100%; height:min(72vh,620px); border-radius:22px; overflow:hidden;
  background:
    radial-gradient(1000px 640px at 50% 46%, rgba(245,129,62,.10), transparent 60%),
    radial-gradient(820px 520px at 82% 84%, rgba(199,123,224,.10), transparent 55%),
    linear-gradient(160deg,#141019,#1A1421);
  border:1px solid #2a2233; }
.cw-stars{ position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.5; }
.cw-links{ position:absolute; inset:0; width:100%; height:100%; }
.cw-line{ stroke-width:1; opacity:.22; vector-effect:non-scaling-stroke; }

.cw-legend{ position:absolute; top:12px; left:14px; z-index:4; display:flex; flex-wrap:wrap; gap:12px; }
.cw-leg{ font:600 11.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#C6BAD0; display:inline-flex; align-items:center; gap:6px; }
.cw-leg b{ color:#F1E9DD; font-variant-numeric:tabular-nums; }
.cw-dot{ width:9px; height:9px; border-radius:50%; }
.cw-title{ position:absolute; top:12px; right:16px; z-index:4; font:600 12px/1 -apple-system,sans-serif; color:#A99BB0; }
.cw-empty{ position:absolute; inset:0; display:grid; place-items:center; color:#A99BB0; font:400 14px/1.5 -apple-system,sans-serif; text-align:center; padding:0 20px; }

.cw-hub{ position:absolute; transform:translate(-50%,-50%); z-index:1; }
.cw-hubdot{ display:block; width:10px; height:10px; border-radius:50%; opacity:.7; }

.cw-node{ position:absolute; transform:translate(-50%,-50%); z-index:2; cursor:pointer; background:none; border:none; padding:0;
  display:flex; flex-direction:column; align-items:center; gap:5px; color:#F1E9DD; font:inherit;
  transition:transform .2s cubic-bezier(.2,.7,.2,1); }
.cw-node:hover{ transform:translate(-50%,-50%) scale(1.14); z-index:5; }
.cw-node:focus-visible{ outline:none; }
.cw-orb{ position:relative; border-radius:50%; border:1.5px solid; display:grid; place-items:center; transition:.2s ease; }
.cw-node:focus-visible .cw-orb{ box-shadow:0 0 0 2px #F5813E !important; }
.cw-badge{ position:absolute; top:-6px; right:-6px; min-width:17px; height:17px; padding:0 4px; border-radius:999px;
  background:#221B2B; border:1px solid #3A2E47; color:#F1E9DD; font:700 10px/17px -apple-system,sans-serif; text-align:center; }
.cw-lab{ font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; max-width:120px; text-align:center;
  opacity:0; transition:opacity .15s ease; text-shadow:0 1px 6px rgba(0,0,0,.7); pointer-events:none;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cw-lab.show{ opacity:.85; }
.cw-node:hover .cw-lab{ opacity:1; }

@media (max-width:600px){ .cw-root{ height:64vh; } }
`;
