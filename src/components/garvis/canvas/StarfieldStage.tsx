// src/components/garvis/canvas/StarfieldStage.tsx
// THE STAGE. Both webs — the facet canvas (CanvasScene: a center with orbiting nodes) and the
// population canvas (ConstellationWeb: many nodes clustered into constellations) — used to each
// carry their own copy of the same night backdrop and the same starfield draw loop. This is that
// shared base: the rounded night surface (ember + violet glow over the night gradient, all from
// the W1 tokens) and a quiet, decorative starfield drawn once per resize. The variant renders its
// own layout (links, orbs, legend) as children on top.

import { useEffect, useRef, type ReactNode } from 'react';

export function StarfieldStage({ children, height = 'min(72vh,640px)', density = 80, className }: {
  children: ReactNode;
  height?: string;
  density?: number;   // number of stars — the field is purely decorative
  className?: string;
}) {
  const starRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = starRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    // Star colors from the shared tokens (single source of truth), read once per mount.
    const root = getComputedStyle(document.documentElement);
    const warm = root.getPropertyValue('--gv-star-warm').trim() || '#F5C9A6';
    const cool = root.getPropertyValue('--gv-star-cool').trim() || '#C9B6D8';
    const draw = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w; cv.height = h; ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < density; i++) {
        ctx.globalAlpha = Math.random() * 0.5 + 0.07;
        ctx.fillStyle = Math.random() > 0.5 ? warm : cool;
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.3 + 0.2, 0, 7); ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    return () => ro.disconnect();
  }, [density]);

  return (
    <div className={`sf-stage${className ? ` ${className}` : ''}`} style={{ height }}>
      <style>{SF_CSS}</style>
      <canvas ref={starRef} className="sf-stars" aria-hidden="true" />
      {children}
    </div>
  );
}

const SF_CSS = `
.sf-stage{ position:relative; width:100%; border-radius:22px; overflow:hidden;
  background:
    radial-gradient(1000px 640px at 50% 45%, rgba(var(--gv-ember-rgb),.11), transparent 60%),
    radial-gradient(820px 520px at 81% 83%, rgba(var(--gv-violet-rgb),.10), transparent 55%),
    linear-gradient(160deg,var(--gv-night-1),var(--gv-night-2));
  border:1px solid var(--gv-night-line); }
.sf-stars{ position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.52; }
`;
