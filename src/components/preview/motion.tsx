// src/components/preview/motion.tsx
// The award-site motion kit, ported from the app builder's scaffold (scaffold.ts MOTION_TSX) into
// the preview engine — TextReveal headlines, CountUp stats, Aurora fields, Magnetic CTAs, tilt
// cards, editorial image wipes. Self-contained (no scaffold imports, no cn), pv-scoped, and every
// move honors prefers-reduced-motion. Static-export honesty: initial SSR states render the FINAL
// content (text present, images unclipped, stats at value) so the exported .html never ships a
// blank word or a zeroed stat — animation is progressive enhancement layered on by the SPA.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const reduce = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useInView<T extends HTMLElement>(margin = '-10% 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return { ref, inView };
}

/** Hero headline revealing word by word from behind a clip line. SSR renders words in place
 *  (pv-trw class + export override keep the static build readable); the SPA hides them on mount
 *  and reveals on scroll-in — below-the-fold uses never flash. */
export function TextReveal({ text, as = 'h2', className, style, delay = 0 }: {
  text: string; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; style?: CSSProperties; delay?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [armed, setArmed] = useState(false);           // false during SSR + first paint → visible
  useEffect(() => { if (!reduce()) setArmed(true); }, []);
  const hidden = armed && !inView;
  const Tag = as;
  return (
    <Tag className={className} style={style}>
      <span ref={ref} className="inline">
        {text.split(' ').map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <span
              className="pv-trw inline-block will-change-transform transition-transform duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
              style={{ transitionDelay: `${delay + i * 55}ms`, transform: hidden ? 'translateY(110%)' : 'none' }}
            >
              {w}{' '}
            </span>
          </span>
        ))}
      </span>
    </Tag>
  );
}

/** A stat that counts up the first time it scrolls into view. SSR/export shows the REAL value
 *  (never a fake 0); the count-up runs only in the live SPA, starting when seen. */
export function CountUp({ value, decimals = 0, suffix = '', className }: {
  value: number; decimals?: number; suffix?: string; className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [n, setN] = useState(value);                   // final value until the animation arms
  useEffect(() => {
    if (!inView || reduce()) { setN(value); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1300);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);
  return (
    <span ref={ref} className={`tabular-nums ${className ?? ''}`}>
      {n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

/** Drifting blurred color field behind dark/cinematic heroes — the shader look without WebGL.
 *  Hues ride the theme (pass the primary hue ± spread). Pure CSS animation → works in the export. */
export function Aurora({ hues, intensity = 0.32 }: { hues: number[]; intensity?: number }) {
  const still = reduce();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-[5] overflow-hidden">
      {hues.slice(0, 3).map((h, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: '58%', height: '58%',
            left: `${i * 26}%`, top: `${i % 2 === 0 ? -8 : 22}%`,
            background: `radial-gradient(circle, hsl(${h} 85% 60% / ${intensity}), transparent 62%)`,
            filter: 'blur(64px)',
            animation: still ? undefined : `pv-aurora ${17 + i * 6}s ease-in-out infinite alternate`,
            animationDelay: still ? undefined : `${-i * 7}s`,
          }}
        />
      ))}
      <style>{'@keyframes pv-aurora { from { transform: translate3d(-10%, -6%, 0) scale(1); } to { transform: translate3d(12%, 10%, 0) scale(1.22); } }'}</style>
    </div>
  );
}

/** The ONE primary CTA leans toward the cursor and springs back (guide rule: never more than one). */
export function Magnetic({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [d, setD] = useState({ x: 0, y: 0, active: false });
  return (
    <span
      ref={ref}
      className="inline-block will-change-transform"
      onMouseMove={(e) => {
        if (reduce()) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setD({ x: (e.clientX - r.left - r.width / 2) * strength, y: (e.clientY - r.top - r.height / 2) * strength, active: true });
      }}
      onMouseLeave={() => setD({ x: 0, y: 0, active: false })}
      style={{
        transform: `translate3d(${d.x.toFixed(1)}px, ${d.y.toFixed(1)}px, 0)`,
        transition: d.active ? 'transform 100ms linear' : 'transform 450ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {children}
    </span>
  );
}

/** Pointer-tracked 3D tilt with a moving glare — the premium product-card move (modest max). */
export function TiltDiv({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        if (reduce()) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        setT({ rx: (0.5 - py) * max, ry: (px - 0.5) * max, gx: px * 100, gy: py * 100, active: true });
      }}
      onMouseLeave={() => setT((s) => ({ ...s, rx: 0, ry: 0, active: false }))}
      className={`relative will-change-transform ${className ?? ''}`}
      style={{
        transform: `perspective(900px) rotateX(${t.rx.toFixed(2)}deg) rotateY(${t.ry.toFixed(2)}deg)`,
        transition: t.active ? 'transform 80ms linear' : 'transform 500ms cubic-bezier(0.16,1,0.3,1)',
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: t.active ? 1 : 0,
          background: `radial-gradient(420px circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,0.14), transparent 55%)`,
        }}
      />
    </div>
  );
}

/** Editorial image wipe: clips in from below and settles from a slight over-scale. SSR renders
 *  unclipped (pv-irv + export override), the SPA arms the wipe on mount for scroll-in reveals. */
export function ImageReveal({ src, alt = '', className, imgClassName, delay = 0 }: {
  src: string; alt?: string; className?: string; imgClassName?: string; delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!reduce()) setArmed(true); }, []);
  const hidden = armed && !inView;
  return (
    <div
      ref={ref}
      className={`pv-irv overflow-hidden ${className ?? ''}`}
      style={{ clipPath: hidden ? 'inset(100% 0 0 0)' : 'inset(0 0 0 0)', transition: `clip-path 900ms cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}
    >
      <img
        src={src} alt={alt} loading="lazy"
        className={`h-full w-full object-cover will-change-transform ${imgClassName ?? ''}`}
        style={{ transform: hidden ? 'scale(1.08)' : 'scale(1)', transition: `transform 1100ms cubic-bezier(0.16,1,0.3,1) ${delay}ms` }}
      />
    </div>
  );
}

/** Reading-progress bar for cinematic pages — a 2px primary line under the sticky header. */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reduce()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setP(max > 0 ? window.scrollY / max : 0);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px]">
      <div className="h-full origin-left bg-[hsl(var(--p))]" style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}

/** Subtle parallax drift for full-bleed hero media (cinematic tier only). */
export function useParallaxY(enabled: boolean, factor = 0.18): number {
  const [y, setY] = useState(0);
  useEffect(() => {
    if (!enabled || reduce()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setY(Math.min(140, window.scrollY * factor)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [enabled, factor]);
  return y;
}
