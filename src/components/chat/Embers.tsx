// src/components/chat/Embers.tsx
// Smoldering embers — the signature build effect. A lightweight canvas particle field: glowing
// motes rise from the bottom of the forging card, wobble, and burn out. Pure compositor-friendly
// canvas (no DOM churn), caps at ~36 particles, pauses when the tab is hidden, and renders
// nothing at all for reduced-motion users.

import { useEffect, useRef } from 'react';

interface Ember {
  x: number; y: number; vx: number; vy: number;
  r: number; life: number; maxLife: number; hue: number;
}

export function Embers({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const embers: Ember[] = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const spawn = () => {
      const w = canvas.width;
      embers.push({
        x: Math.random() * w,
        y: canvas.height + 6 * dpr,
        vx: (Math.random() - 0.5) * 0.22 * dpr,
        vy: -(0.35 + Math.random() * 0.55) * dpr,
        r: (0.8 + Math.random() * 1.7) * dpr,
        life: 0,
        maxLife: 140 + Math.random() * 160,
        hue: 18 + Math.random() * 22, // ember orange → amber
      });
    };

    const tick = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (embers.length < 36 && Math.random() < 0.5) spawn();
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life++;
        e.x += e.vx + Math.sin((e.life + e.maxLife) * 0.045) * 0.18 * dpr; // wobble
        e.y += e.vy;
        const t = e.life / e.maxLife;
        if (t >= 1 || e.y < -8) { embers.splice(i, 1); continue; }
        // burn curve: flare in fast, smolder out slow
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
        glow.addColorStop(0, `hsla(${e.hue} 95% 62% / ${0.5 * alpha})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(e.x - e.r * 4, e.y - e.r * 4, e.r * 8, e.r * 8);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (1 - t * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${e.hue + 8} 100% ${68 - t * 18}% / ${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(tick);
      else cancelAnimationFrame(raf);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
