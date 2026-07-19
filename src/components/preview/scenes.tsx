// src/components/preview/scenes.tsx
// TRADE SCENES — the "genuinely cool" layer: hand-choreographed, scroll-scrubbed SVG vignettes,
// one per trade. The Apple move (a pinned stage scrubbed by scroll) built on the same discipline
// as everything else in the preview engine: the AI supplies ONLY the punchline copy; the visual
// is fixed per SceneKind (previewSpec.sceneKindFor), so every frame ships at design quality.
//
// Choreography contract (progress p: 0 → 1 through a 220vh scroll):
//   pipe        water fills the pipe → a joint springs a leak (drip + spray + puddle) → the
//               repair clamp snaps on, the leak stops → punchline + CTA
//   circuit     current races along the wire → the bulb glows on → punchline + CTA
//   rain        rain falls on the bare gable → shingle rows slide on → rain deflects → punchline
//   thermostat  the needle sweeps out of the red zone, the readout counts down to comfort
//   gauge       every dash ticks green, the check draws in → road-ready
//
// Transform/opacity only; reduced-motion and the static export get the FINAL state (p = 1).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const reduce = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Progress of p through the [a, b] window — the per-beat scrub helper. */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Pinned scrub stage: a tall wrapper with a sticky full-height stage; children receive p 0→1.
 *  SSR/export render p=1 (the finished frame) with the pin COLLAPSED (pv-scn-pin — the export
 *  CSS flattens it so a frozen frame never gets 1-2 screens of dead scroll runway).
 *  Reduced-motion renders the finished frame at natural height, no pin, no scrubbing.
 *  The first client frame measures scroll position synchronously (useLayoutEffect) — the old
 *  post-paint arming painted the FINISHED state for a beat, then visibly snapped to p=0. */
export function ScrollScene({ children, heightVh = 220 }: { children: (p: number) => ReactNode; heightVh?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [p, setP] = useState(1);            // final frame for SSR/export — the pitch ships whole
  const [reduced, setReduced] = useState(false);
  const measure = () => {
    const el = ref.current;
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    return total > 0 ? clamp01(-r.top / total) : 1;
  };
  // Synchronous first measurement — no flash-of-final-state on load.
  useLayoutEffect(() => {
    if (reduce()) { setReduced(true); return; }
    setP(measure());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (reduce()) return;
    let raf = 0;
    const tick = () => {
      setP(measure());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (reduced) {
    // Finished frame, natural height — the choreography's end state IS the designed layout.
    return <div className="relative flex min-h-screen items-center justify-center overflow-hidden">{children(1)}</div>;
  }
  return (
    <div ref={ref} style={{ height: `${heightVh}vh` }} className="pv-scn-pin relative">
      <div className="pv-scn-stage sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {children(p)}
      </div>
    </div>
  );
}

/** Copy block shared by every scene — punchline reveals late in the scrub, CTA lands last. */
function SceneCopy({ headline, sub, cta, p, at = 0.62 }: { headline: string; sub?: string; cta?: string; p: number; at?: number }) {
  const show = seg(p, at, at + 0.12);
  const ctaShow = seg(p, at + 0.14, at + 0.24);
  return (
    <div className="mt-8 text-center">
      <h2 className="pv-display text-3xl font-semibold tracking-tight text-[hsl(var(--ink))] sm:text-5xl"
        style={{ opacity: show, transform: `translateY(${(1 - show) * 22}px)` }}>
        {headline}
      </h2>
      {sub && (
        <p className="mx-auto mt-3 max-w-xl text-[hsl(var(--mut))]"
          style={{ opacity: ctaShow, transform: `translateY(${(1 - ctaShow) * 16}px)` }}>
          {sub}
        </p>
      )}
      {cta && (
        <div style={{ opacity: ctaShow, transform: `translateY(${(1 - ctaShow) * 16}px)` }} className="mt-6">
          <button type="button"
            onClick={() => (document.getElementById('quote') ?? document.getElementById('ctaBanner'))?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2 rounded-[var(--r)] bg-[hsl(var(--p))] px-7 py-3.5 text-sm font-bold text-[hsl(var(--pi))] shadow-lg transition-transform hover:-translate-y-0.5">
            {cta}
          </button>
        </div>
      )}
    </div>
  );
}

const WATER = 'hsl(205 85% 55%)';

// --- pipe: fill → leak at the joint → clamp fixes it -------------------------------------------
function PipeScene({ p }: { p: number }) {
  const fill = seg(p, 0.04, 0.42);                 // water travels the pipe
  const leak = seg(p, 0.42, 0.6);                  // the joint lets go
  const fix = seg(p, 0.66, 0.8);                   // clamp snaps on
  const leaking = leak > 0 && fix < 1;
  const LEN = 720;                                  // straight run x=40..760
  return (
    <svg viewBox="0 0 800 340" className="mx-auto w-full max-w-3xl" aria-hidden>
      {/* pipe body + joint flanges */}
      <line x1="40" y1="120" x2="760" y2="120" stroke="hsl(var(--ink) / 0.22)" strokeWidth="38" strokeLinecap="round" />
      <line x1="40" y1="120" x2="760" y2="120" stroke="hsl(var(--ink) / 0.10)" strokeWidth="30" strokeLinecap="round" />
      <rect x="384" y="96" width="10" height="48" rx="3" fill="hsl(var(--ink) / 0.45)" />
      <rect x="406" y="96" width="10" height="48" rx="3" fill="hsl(var(--ink) / 0.45)" />
      {/* water — dashoffset scrubbed left → right */}
      <line x1="40" y1="120" x2="760" y2="120" stroke={WATER} strokeWidth="20" strokeLinecap="round"
        strokeDasharray={LEN} strokeDashoffset={LEN * (1 - fill)} style={{ opacity: fill > 0 ? 1 : 0 }} />
      {/* the leak: spray arcs + falling drops + growing puddle (dries up once clamped) */}
      <g style={{ opacity: leaking ? Math.min(1, leak * 2) * (1 - fix) : 0 }}>
        <path d="M396 142 q -14 26 -30 38" stroke={WATER} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M400 144 q 2 30 -2 46" stroke={WATER} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M404 142 q 16 24 28 34" stroke={WATER} strokeWidth="4" fill="none" strokeLinecap="round" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={382 + i * 18} cy={160 + ((leak * 3 + i * 0.33) % 1) * 90} r="5" fill={WATER} />
        ))}
      </g>
      <ellipse cx="400" cy="272" rx={90 * Math.min(leak, 1) * (1 - fix)} ry={10 * Math.min(leak, 1) * (1 - fix)} fill={`${WATER.slice(0, -1)} / 0.35)`} />
      {/* the fix: repair clamp drops onto the joint, bolts visible */}
      <g style={{ transform: `translateY(${(1 - fix) * -110}px)`, opacity: fix > 0 ? 1 : 0 }}>
        <rect x="376" y="90" width="48" height="60" rx="8" fill="hsl(var(--p))" />
        <circle cx="388" cy="100" r="3.5" fill="hsl(var(--pi))" />
        <circle cx="412" cy="100" r="3.5" fill="hsl(var(--pi))" />
        <circle cx="388" cy="140" r="3.5" fill="hsl(var(--pi))" />
        <circle cx="412" cy="140" r="3.5" fill="hsl(var(--pi))" />
      </g>
      {/* status caption rides the beats */}
      <text x="400" y="316" textAnchor="middle" className="pv-display" fontSize="17" fontWeight="600" fill="hsl(var(--mut))">
        {fix >= 1 ? 'Fixed. Dry. Done.' : leaking ? 'There it goes…' : fill >= 1 ? 'Holding steady…' : 'Water on.'}
      </text>
    </svg>
  );
}

// --- circuit: current races the wire, the bulb glows on ----------------------------------------
function CircuitScene({ p }: { p: number }) {
  const run = seg(p, 0.05, 0.55);
  const glow = seg(p, 0.55, 0.72);
  const LEN = 900;
  return (
    <svg viewBox="0 0 800 340" className="mx-auto w-full max-w-3xl" aria-hidden>
      <path id="wire" d="M40 260 h180 v-120 h220 v90 h160" fill="none" stroke="hsl(var(--ink) / 0.25)" strokeWidth="8" strokeLinecap="round" />
      <path d="M40 260 h180 v-120 h220 v90 h160" fill="none" stroke="hsl(var(--p))" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={LEN} strokeDashoffset={LEN * (1 - run)} />
      {/* bulb */}
      <circle cx="660" cy="200" r="46" fill={`hsl(48 96% 60% / ${0.15 + glow * 0.85})`} stroke="hsl(var(--ink) / 0.4)" strokeWidth="5" />
      <rect x="644" y="244" width="32" height="20" rx="4" fill="hsl(var(--ink) / 0.45)" />
      {[...Array(6)].map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <line key={i} x1={660 + Math.cos(a) * 58} y1={200 + Math.sin(a) * 58}
          x2={660 + Math.cos(a) * (58 + 18 * glow)} y2={200 + Math.sin(a) * (58 + 18 * glow)}
          stroke="hsl(48 96% 55%)" strokeWidth="5" strokeLinecap="round" style={{ opacity: glow }} />;
      })}
      <text x="400" y="316" textAnchor="middle" fontSize="17" fontWeight="600" fill="hsl(var(--mut))">
        {glow >= 1 ? 'Lights on.' : run >= 1 ? 'Almost there…' : 'Tracing the fault…'}
      </text>
    </svg>
  );
}

// --- rain: weather falls, shingles slide on, drops deflect -------------------------------------
function RainScene({ p }: { p: number }) {
  const rows = 3;
  const deflect = seg(p, 0.62, 0.78);
  return (
    <svg viewBox="0 0 800 340" className="mx-auto w-full max-w-3xl" aria-hidden>
      {/* rain — constant fall, deflection arcs appear once the roof is on */}
      {[...Array(9)].map((_, i) => (
        <line key={i} x1={120 + i * 70} y1={20 + ((p * 4 + i * 0.21) % 1) * 80} x2={112 + i * 70} y2={52 + ((p * 4 + i * 0.21) % 1) * 80}
          stroke={WATER} strokeWidth="4" strokeLinecap="round" style={{ opacity: 0.7 }} />
      ))}
      {/* gable + walls */}
      <path d="M180 200 L400 90 L620 200" fill="none" stroke="hsl(var(--ink) / 0.45)" strokeWidth="10" strokeLinejoin="round" />
      <rect x="220" y="200" width="360" height="90" fill="hsl(var(--ink) / 0.10)" />
      {/* shingle rows slide up the roof one by one */}
      {[...Array(rows)].map((_, i) => {
        const t = seg(p, 0.12 + i * 0.15, 0.27 + i * 0.15);
        const y = 200 - i * 36;
        return (
          <path key={i} d={`M${186 + i * 72} ${y} L400 ${96 + (200 - y)} L${614 - i * 72} ${y}`} fill="none"
            stroke="hsl(var(--p))" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: t, transform: `translateY(${(1 - t) * 26}px)` }} />
        );
      })}
      {/* deflection: drops glance off the ridge */}
      <g style={{ opacity: deflect }}>
        <path d="M380 84 q -30 -18 -54 -10" stroke={WATER} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M420 84 q 30 -18 54 -10" stroke={WATER} strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
      <text x="400" y="322" textAnchor="middle" fontSize="17" fontWeight="600" fill="hsl(var(--mut))">
        {deflect >= 1 ? 'Sheds every drop.' : p > 0.3 ? 'Shingle by shingle…' : 'The forecast never waits.'}
      </text>
    </svg>
  );
}

// --- thermostat: the needle sweeps out of the red, the readout settles at comfort --------------
function ThermostatScene({ p }: { p: number }) {
  const t = seg(p, 0.08, 0.68);
  const deg = -78 + t * 118;                       // red zone → comfort
  const temp = Math.round(84 - t * 12);
  return (
    <svg viewBox="0 0 800 340" className="mx-auto w-full max-w-3xl" aria-hidden>
      <path d="M240 240 A170 170 0 0 1 560 240" fill="none" stroke="hsl(var(--ink) / 0.15)" strokeWidth="26" strokeLinecap="round" />
      <path d="M240 240 A170 170 0 0 1 330 106" fill="none" stroke="hsl(8 78% 55% / 0.8)" strokeWidth="26" strokeLinecap="round" />
      <path d="M470 106 A170 170 0 0 1 560 240" fill="none" stroke={WATER} strokeWidth="26" strokeLinecap="round" />
      <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: '400px 240px' }}>
        <line x1="400" y1="240" x2="400" y2="112" stroke="hsl(var(--p))" strokeWidth="10" strokeLinecap="round" />
      </g>
      <circle cx="400" cy="240" r="16" fill="hsl(var(--p))" />
      <text x="400" y="300" textAnchor="middle" fontSize="44" fontWeight="700" fill="hsl(var(--ink))" className="tabular-nums">{temp}°</text>
      <text x="400" y="326" textAnchor="middle" fontSize="16" fontWeight="600" fill="hsl(var(--mut))">
        {t >= 1 ? 'And it holds.' : 'Dialing it in…'}
      </text>
    </svg>
  );
}

// --- gauge: dashes tick green, the check draws — road-ready ------------------------------------
function GaugeScene({ p }: { p: number }) {
  const DASHES = 9;
  const check = seg(p, 0.66, 0.82);
  return (
    <svg viewBox="0 0 800 340" className="mx-auto w-full max-w-3xl" aria-hidden>
      {[...Array(DASHES)].map((_, i) => {
        const a = Math.PI * (1 - i / (DASHES - 1));
        const on = seg(p, 0.06 + i * 0.06, 0.12 + i * 0.06);
        const x = 400 + Math.cos(a) * 180, y = 250 - Math.sin(a) * 150;
        return (
          <line key={i} x1={x} y1={y} x2={400 + Math.cos(a) * 140} y2={250 - Math.sin(a) * 116}
            stroke={on > 0.5 ? 'hsl(145 60% 42%)' : 'hsl(var(--ink) / 0.2)'} strokeWidth="12" strokeLinecap="round" />
        );
      })}
      <path d="M356 246 l 30 30 l 60 -62" fill="none" stroke="hsl(145 60% 42%)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="140" strokeDashoffset={140 * (1 - check)} />
      <text x="400" y="322" textAnchor="middle" fontSize="17" fontWeight="600" fill="hsl(var(--mut))">
        {check >= 1 ? 'Green across the board.' : 'Running the checks…'}
      </text>
    </svg>
  );
}

const SCENES: Record<string, (props: { p: number }) => ReactNode> = {
  pipe: (props) => <PipeScene {...props} />,
  circuit: (props) => <CircuitScene {...props} />,
  rain: (props) => <RainScene {...props} />,
  thermostat: (props) => <ThermostatScene {...props} />,
  gauge: (props) => <GaugeScene {...props} />,
};

/** THE QUANT CHAPTER — floating glass stat cards settling out of 3D space over a brand-hue
 *  stage (the award-site "glass panels over rich color" move, in pure CSS perspective — no
 *  WebGL, works in the export, cheap on phones). Every number is an OBSERVED fact injected by
 *  normalizeSpec (rating, review count, services, since-year) — theater for the truth, never
 *  invented proof. */
function GlassScene({ p, stats, headline, sub, cta, hue }: {
  p: number; stats: { value: string; label: string }[];
  headline: string; sub?: string; cta?: string; hue: number;
}) {
  // Asymmetric settle positions (percent offsets from center) for up to 4 cards.
  const SLOTS = [
    { x: -26, y: -18, r: -5 }, { x: 24, y: -26, r: 6 },
    { x: -20, y: 16, r: 4 }, { x: 26, y: 12, r: -6 },
  ];
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ perspective: '1200px' }}>
      {/* the stage: deep brand-hue field, drifting slightly as the chapter plays */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(120% 90% at ${18 + p * 10}% 8%, hsl(${hue} 82% ${36 - p * 7}%), hsl(${hue} 85% 10%) 72%), hsl(${hue} 85% 10%)`,
      }} />
      <div className="absolute inset-0" style={{
        background: `radial-gradient(58% 48% at ${78 - p * 12}% ${86 - p * 20}%, hsl(${(hue + 34) % 360} 80% 50% / 0.5), transparent 70%)`,
      }} />
      {/* corner vignette keeps the glass edges reading crisp against the color field */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(140% 110% at 50% 50%, transparent 55%, rgb(0 0 0 / 0.45))' }} />
      {stats.slice(0, 4).map((s, i) => {
        const t = ease(seg(p, 0.04 + i * 0.11, 0.34 + i * 0.11));
        const slot = SLOTS[i];
        return (
          <div key={i} className="absolute left-1/2 top-1/2 rounded-2xl border border-white/20 bg-white/10 px-7 py-5 text-center shadow-2xl backdrop-blur-xl"
            style={{
              transform: `translate(-50%, -50%) translate3d(${slot.x * (0.4 + t * 0.6)}vw, ${slot.y * t + (1 - t) * 46}vh, ${(1 - t) * -420}px) rotateX(${(1 - t) * 38}deg) rotateZ(${slot.r * t}deg)`,
              opacity: Math.min(1, t * 1.6),
            }}>
            <div className="pv-display text-4xl font-bold text-white sm:text-5xl">{s.value}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-white/65">{s.label}</div>
          </div>
        );
      })}
      {/* punchline + CTA land once the cards have settled */}
      <div className="absolute inset-x-0 bottom-[12%] px-6 text-center"
        style={{ opacity: seg(p, 0.62, 0.78), transform: `translateY(${(1 - seg(p, 0.62, 0.78)) * 24}px)` }}>
        <h2 className="pv-display mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl" style={{ textWrap: 'balance' }}>{headline}</h2>
        {sub && <p className="mx-auto mt-3 max-w-xl text-white/75">{sub}</p>}
        {cta && (
          <button type="button"
            onClick={() => (document.getElementById('quote') ?? document.getElementById('ctaBanner'))?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-6 rounded-[var(--r)] bg-white px-7 py-3.5 text-sm font-bold text-[hsl(var(--ink))] shadow-xl transition-transform hover:-translate-y-0.5">
            {cta}
          </button>
        )}
      </div>
    </div>
  );
}

/** Tiny deterministic PRNG — the same business renders the same ribbon field every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** THE RIBBON CHAPTER — drifting brand-hue paper strips floating in depth behind a
 *  poster-scale claim (the award-site "shredded paper over a dark stage" move, canvas 2D —
 *  no WebGL, nothing to break). Strip positions are a pure function of (seed, p): scrubbing
 *  is exact, resume is exact, and the export/reduced-motion frame is simply p=1 over the
 *  gradient stage (the canvas is progressive enhancement — SSR ships the composed type). */
function RibbonScene({ p, headline, sub, cta, hue, seed }: {
  p: number; headline: string; sub?: string; cta?: string; hue: number; seed: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const rand = mulberry32(seed);
    const N = 36;
    for (let i = 0; i < N; i++) {
      const depth = 0.3 + rand() * 0.7;                // far strips: smaller, dimmer, slower
      const x0 = rand() * 1.2 - 0.1;
      const y0 = rand() * 1.6;
      const len = (110 + rand() * 260) * depth;
      const thick = (16 + rand() * 26) * depth;
      const ang0 = rand() * Math.PI * 2;
      const spin = (rand() - 0.5) * 2.2;
      const drift = (0.55 + rand() * 0.75) * depth;    // scroll-scrubbed float
      const hueJ = hue + (rand() - 0.5) * 26;
      const bow = (rand() - 0.5) * thick * 3.2;        // the curl that reads as paper, not a bar
      const y = ((y0 - p * drift) % 1.6 + 1.6) % 1.6 - 0.3;
      const x = x0 + Math.sin(p * 4 + i) * 0.02 * depth;
      ctx.save();
      ctx.translate(x * w, y * h);
      ctx.rotate(ang0 + p * spin);
      // far strips soften into atmosphere; near strips stay crisp
      ctx.filter = depth < 0.48 ? 'blur(3px)' : depth < 0.7 ? 'blur(1px)' : 'none';
      const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
      grad.addColorStop(0, `hsl(${hueJ} 74% ${54 + depth * 16}% / ${0.35 + depth * 0.5})`);
      grad.addColorStop(0.55, `hsl(${hueJ + 8} 68% ${44 + depth * 18}% / ${0.3 + depth * 0.5})`);
      grad.addColorStop(1, `hsl(${hueJ + 16} 58% ${36 + depth * 16}% / ${0.25 + depth * 0.42})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-len / 2, -thick / 2);
      ctx.quadraticCurveTo(0, -thick / 2 + bow, len / 2, -thick / 2);
      ctx.lineTo(len / 2, thick / 2);
      ctx.quadraticCurveTo(0, thick / 2 + bow, -len / 2, thick / 2);
      ctx.closePath();
      ctx.fill();
      // a sheen line along one edge sells the fold
      ctx.strokeStyle = `hsl(${hueJ} 80% 78% / ${0.16 + depth * 0.2})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-len / 2, -thick / 2);
      ctx.quadraticCurveTo(0, -thick / 2 + bow, len / 2, -thick / 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.filter = 'none';
  }, [p, hue, seed]);
  const arrive = seg(p, 0.18, 0.42);
  const ctaShow = seg(p, 0.52, 0.7);
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* stage: near-black with a breath of the brand hue — canvas strips float over it */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(110% 90% at 50% ${20 + p * 18}%, hsl(${hue} 45% 13%), hsl(${hue} 55% 6%) 75%)`,
      }} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(130% 100% at 50% 50%, transparent 52%, rgb(0 0 0 / 0.5))' }} />
      {/* the claim, poster scale — the type IS the show */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <h2 className="pv-display max-w-4xl font-bold tracking-tight text-white"
          style={{ fontSize: 'clamp(2.6rem, 6.5vw, 5.8rem)', lineHeight: 1.04, textWrap: 'balance',
            opacity: arrive, transform: `translateY(${(1 - arrive) * 30}px) scale(${0.95 + arrive * 0.05})` }}>
          {headline}
        </h2>
        {sub && (
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70"
            style={{ opacity: ctaShow, transform: `translateY(${(1 - ctaShow) * 18}px)` }}>
            {sub}
          </p>
        )}
        {cta && (
          <div style={{ opacity: ctaShow, transform: `translateY(${(1 - ctaShow) * 18}px)` }}>
            <button type="button"
              onClick={() => (document.getElementById('quote') ?? document.getElementById('ctaBanner'))?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-7 rounded-[var(--r)] bg-white px-7 py-3.5 text-sm font-bold text-[hsl(var(--ink))] shadow-xl transition-transform hover:-translate-y-0.5">
              {cta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The 'scene' section — normalizeSpec guarantees `scene` is a valid kind for this trade. */
export function SceneSection(p: { headline?: string; sub?: string; cta?: string; scene?: string; motion?: string;
  stats?: { value: string; label: string }[]; themePrimary?: string; siteName?: string }) {
  const hue = parseInt((p.themePrimary ?? '220 50% 40%').split(/\s+/)[0], 10) || 220;
  // The ribbon chapter: drifting paper strips behind the poster claim, seeded by the business.
  if (p.scene === 'ribbon') {
    let seed = 7;
    for (const ch of p.siteName ?? p.headline ?? 'ribbon') seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const ribbon = (prog: number) => (
      <RibbonScene p={prog} headline={p.headline ?? ''} sub={p.sub} cta={p.cta} hue={hue} seed={seed} />
    );
    return (
      <section id="scene" className="pv-grain-host relative isolate">
        {p.motion === 'calm'
          ? <div className="relative h-[80vh]">{ribbon(1)}</div>
          : <ScrollScene heightVh={190}>{ribbon}</ScrollScene>}
      </section>
    );
  }
  // The quant chapter is its own full-bleed stage (the SVG vignettes are centered illustrations).
  if (p.scene === 'glass') {
    if (!p.stats?.length) return null;
    const glass = (prog: number) => (
      <GlassScene p={prog} stats={p.stats!} headline={p.headline ?? ''} sub={p.sub} cta={p.cta} hue={hue} />
    );
    return (
      <section id="scene" className="pv-grain-host relative isolate">
        {p.motion === 'calm'
          ? <div className="relative h-[80vh]">{glass(1)}</div>
          : <ScrollScene heightVh={190}>{glass}</ScrollScene>}
      </section>
    );
  }
  const draw = p.scene ? SCENES[p.scene] : null;
  if (!draw) return null;
  // Calm tier / reduced motion: ScrollScene stays at the finished frame — an illustration, not a ride.
  const still = p.motion === 'calm';
  return (
    <section id="scene" className="bg-[hsl(var(--card))]">
      {still
        ? <div className="flex flex-col items-center px-5 py-20">{draw({ p: 1 })}<SceneCopy headline={p.headline ?? ''} sub={p.sub} cta={p.cta} p={1} /></div>
        : (
          <ScrollScene>
            {(prog) => (
              <div className="flex w-full flex-col items-center px-5">
                {draw({ p: prog })}
                <SceneCopy headline={p.headline ?? ''} sub={p.sub} cta={p.cta} p={prog} />
              </div>
            )}
          </ScrollScene>
        )}
    </section>
  );
}
