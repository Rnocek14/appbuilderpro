// src/components/garvis/MechanismCanvas.tsx
// The GENERIC mechanism renderer — one animated canvas per visual-grammar archetype, driven
// entirely by a gated VisualSpec + the user's dial values (visualGrammar.ts). This is what lets
// ANY question that reduces to a known mechanism get a living picture: the AI (or the offline
// starter heuristic) designs the spec; the gates keep it honest; this draws it. A slot that
// doesn't resolve draws a refusal, never a zero. Static single frame under prefers-reduced-motion.

import { useEffect, useRef } from 'react';
import { slotValue, type VisualSpec } from '../../lib/garvis/visualGrammar';
import { VIZ_H, INK, DIM, FAINT, EMBER, OK, ERR, CYAN, RAISED, BORDER, rnd, label } from './SimVisual';

const H = VIZ_H;
type Ctx = CanvasRenderingContext2D;
type Slots = (name: string) => number | null;

function refused(ctx: Ctx, w: number, why: string) {
  label(ctx, `won't draw: ${why}`, w / 2, H / 2, ERR, 11, 'center');
}

// race — two tracks advancing at their rates; the gap IS the ratio.
function drawRace(ctx: Ctx, w: number, t: number, s: Slots, spec: VisualSpec) {
  const a = s('rateA'), b = s('rateB');
  if (a === null || b === null || (a <= 0 && b <= 0)) return refused(ctx, w, 'both rates must be set');
  const la = spec.labels?.a ?? 'A', lb = spec.labels?.b ?? 'B';
  const L = 90, R = 30, trackW = w - L - R, loop = 9; // seconds for the faster lane to finish
  const fast = Math.max(a, b);
  const prog = (r: number) => Math.min(1, ((t % loop) / loop) * (r / fast));
  const lane = (y: number, r: number, name: string, color: string) => {
    ctx.fillStyle = RAISED; ctx.beginPath(); ctx.roundRect(L, y, trackW, 14, 7); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(L, y, Math.max(6, prog(r) * trackW), 14, 7); ctx.fill();
    label(ctx, name, L - 8, y + 11, INK, 11, 'right');
    label(ctx, `rate ${r}`, L + trackW + 4, y + 11, DIM, 9);
  };
  lane(H * 0.32, a, la, EMBER);
  lane(H * 0.58, b, lb, CYAN);
  const ratio = b !== 0 ? a / b : null;
  label(ctx, ratio !== null ? `${la} runs at ${ratio >= 1 ? ratio.toFixed(2) : (1 / ratio).toFixed(2)}× ${ratio >= 1 ? `${lb}'s` : `${la}'s`} pace — the widening gap is that ratio` : '', L, H - 24, DIM, 10);
}

// accumulate — value ← value·(1+rate) + add, swept step by step.
function drawAccumulate(ctx: Ctx, w: number, t: number, s: Slots) {
  const start = s('start'), rate = s('rate'), add = s('add'), steps = s('steps');
  if ([start, rate, add, steps].some((v) => v === null) || (steps as number) < 2) return refused(ctx, w, 'start, rate, add and steps must be set');
  const n = Math.round(steps as number);
  const series: number[] = [start as number];
  for (let k = 1; k <= n; k++) series.push(series[k - 1] * (1 + (rate as number)) + (add as number));
  const yMax = Math.max(...series, 1) * 1.06;
  const L = 56, R = 16, T = 22, B = 34, pw = w - L - R, ph = H - T - B;
  const X = (k: number) => L + (k / n) * pw, Y = (v: number) => T + ph - (v / yMax) * ph;
  ctx.strokeStyle = BORDER;
  for (let g = 0; g <= 3; g++) { const gy = T + (g / 3) * ph; ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(w - R, gy); ctx.stroke(); label(ctx, (yMax * (1 - g / 3)).toFixed(0), L - 6, gy + 3, FAINT, 9, 'right'); }
  const k = Math.max(1, Math.round(n * Math.min(1, (t % 7) / 5)));
  ctx.beginPath(); ctx.moveTo(X(0), Y(series[0]));
  for (let i = 1; i <= k; i++) ctx.lineTo(X(i), Y(series[i]));
  ctx.strokeStyle = EMBER; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(X(k), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath(); ctx.fillStyle = 'rgba(255,138,61,0.15)'; ctx.fill();
  ctx.fillStyle = EMBER; ctx.beginPath(); ctx.arc(X(k), Y(series[k]), 3.5, 0, Math.PI * 2); ctx.fill();
  label(ctx, `${series[k].toFixed(1)} after step ${k} of ${n}`, Math.min(X(k) + 8, w - 150), Y(series[k]) - 8, INK, 11);
  label(ctx, 'each step: × (1+rate), then + add', L, H - 14, FAINT, 10);
}

// decay — value ← value·keep, with the half-life marked where it crosses 50%.
function drawDecay(ctx: Ctx, w: number, t: number, s: Slots) {
  const start = s('start'), keep = s('keep'), steps = s('steps');
  if ([start, keep, steps].some((v) => v === null) || (keep as number) <= 0 || (keep as number) >= 1) return refused(ctx, w, 'keep must be between 0 and 1');
  const n = Math.max(2, Math.round(steps as number));
  const L = 56, R = 16, T = 22, B = 34, pw = w - L - R, ph = H - T - B;
  const X = (k: number) => L + (k / n) * pw, Y = (v: number) => T + ph - (v / (start as number)) * ph;
  ctx.strokeStyle = BORDER;
  for (const f of [1, 0.5, 0]) { ctx.beginPath(); ctx.moveTo(L, Y((start as number) * f)); ctx.lineTo(w - R, Y((start as number) * f)); ctx.stroke(); label(ctx, `${f * 100}%`, L - 6, Y((start as number) * f) + 3, FAINT, 9, 'right'); }
  const k = Math.max(1, Math.round(n * Math.min(1, (t % 7) / 5)));
  ctx.beginPath(); ctx.moveTo(X(0), Y(start as number));
  for (let i = 1; i <= k; i++) ctx.lineTo(X(i), Y((start as number) * (keep as number) ** i));
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.stroke();
  const half = Math.log(0.5) / Math.log(keep as number); // steps to reach 50%
  if (half <= n) {
    const hx = X(half);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = EMBER; ctx.beginPath(); ctx.moveTo(hx, T); ctx.lineTo(hx, T + ph); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, `half-life ≈ ${half.toFixed(1)} steps`, Math.min(hx + 6, w - 150), T + 14, EMBER, 10);
  }
  label(ctx, `${(((keep as number) ** k) * 100).toFixed(1)}% remains after step ${k}`, L, H - 14, DIM, 10);
}

// field — the compounding-odds curve + the attempt dots.
function drawField(ctx: Ctx, w: number, t: number, s: Slots) {
  const p = s('p'), n0 = s('n');
  if (p === null || n0 === null || n0 < 1) return refused(ctx, w, 'p and n must be set');
  const q = (p as number) / 100, n = Math.round(n0 as number);
  const L = 48, R = 16, T = 20, B = 86, pw = w - L - R, ph = H - T - B;
  const X = (k: number) => L + (k / n) * pw, Y = (prob: number) => T + ph - prob * ph;
  ctx.strokeStyle = BORDER;
  for (const g of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(L, Y(g)); ctx.lineTo(w - R, Y(g)); ctx.stroke(); label(ctx, `${g * 100}%`, L - 5, Y(g) + 3, FAINT, 9, 'right'); }
  ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  for (let k = 1; k <= n; k++) ctx.lineTo(X(k), Y(1 - (1 - q) ** k));
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.stroke();
  const pn = 1 - (1 - q) ** n;
  ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(X(n), Y(pn), 4, 0, Math.PI * 2); ctx.fill();
  label(ctx, `${(pn * 100).toFixed(1)}% chance of ≥1 by try ${n}`, Math.max(L, X(n) - 160), Y(pn) - 10, INK, 11);
  const dots = Math.min(n, 60), cols = 30, ds = 9, gap = 5, fy = H - B + 24;
  const expected = n * q;
  const lit = Math.round(Math.min(1, (t % 4) / 2.4) * Math.min(dots, Math.round(expected * (dots / n))));
  for (let d = 0; d < dots; d++) {
    const x = L + (d % cols) * (ds + gap), y = fy + Math.floor(d / cols) * (ds + gap);
    ctx.fillStyle = d < lit ? OK : RAISED; ctx.strokeStyle = d < lit ? OK : BORDER;
    ctx.beginPath(); ctx.arc(x, y, ds / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  label(ctx, `expected: ${expected.toFixed(1)} (an average, not a promise)`, L, H - 10, DIM, 10);
}

// grid — replicated units, each above or below water.
function drawGrid(ctx: Ctx, w: number, t: number, s: Slots) {
  const units = s('units'), perUnit = s('perUnit');
  if (units === null || perUnit === null || units < 1) return refused(ctx, w, 'units and per-unit value must be set');
  const shown = Math.min(Math.round(units as number), 60), cols = 15, size = 18, gap = 6, gx = 24, gy = 46;
  label(ctx, `${Math.round(units as number)} units at your per-unit assumption`, gx, 26, DIM, 10);
  for (let c = 0; c < shown; c++) {
    const x = gx + (c % cols) * (size + gap), y = gy + Math.floor(c / cols) * (size + gap);
    const pulse = 0.75 + 0.25 * Math.sin(t * 2 + rnd(c, 'g') * Math.PI * 2);
    ctx.fillStyle = (perUnit as number) > 0 ? `rgba(74,222,128,${0.26 * pulse + 0.14})` : (perUnit as number) < 0 ? `rgba(248,113,113,${0.3 * pulse + 0.14})` : 'rgba(139,144,160,0.2)';
    ctx.strokeStyle = (perUnit as number) > 0 ? 'rgba(74,222,128,0.45)' : (perUnit as number) < 0 ? 'rgba(248,113,113,0.5)' : BORDER;
    ctx.beginPath(); ctx.roundRect(x, y, size, size, 4); ctx.fill(); ctx.stroke();
  }
  if ((units as number) > shown) label(ctx, `+ ${Math.round(units as number) - shown} more`, gx, gy + 4 * (size + gap) + 16, FAINT, 10);
  const total = (units as number) * (perUnit as number);
  label(ctx, `${(perUnit as number) >= 0 ? '+' : ''}${(perUnit as number).toFixed(1)} per unit → ${total >= 0 ? '+' : ''}${total.toFixed(0)} total`, gx, H - 14, (perUnit as number) > 0 ? OK : ERR, 11);
}

// threshold — a value against a hard line; proximity is the story.
function drawThreshold(ctx: Ctx, w: number, t: number, s: Slots) {
  const value = s('value'), limit = s('limit');
  if (value === null || limit === null || limit === 0) return refused(ctx, w, 'value and limit must be set');
  const L = 60, R = 40, gw = w - L - R, gy = H * 0.44;
  const scale = Math.max(value as number, limit as number) * 1.15;
  ctx.fillStyle = RAISED; ctx.beginPath(); ctx.roundRect(L, gy, gw, 18, 9); ctx.fill();
  const frac = Math.min(1, (value as number) / scale);
  const near = (value as number) / (limit as number); // 1.0 = at the line
  const pulse = near > 0.85 ? 0.7 + 0.3 * Math.sin(t * 5) : 1;
  ctx.fillStyle = near >= 1 ? ERR : near > 0.85 ? `rgba(250,204,21,${pulse})` : OK;
  ctx.beginPath(); ctx.roundRect(L, gy, Math.max(8, frac * gw), 18, 9); ctx.fill();
  const lx = L + Math.min(1, (limit as number) / scale) * gw;
  ctx.strokeStyle = ERR; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, gy - 12); ctx.lineTo(lx, gy + 30); ctx.stroke();
  label(ctx, 'the line', lx, gy - 18, ERR, 9, 'center');
  label(ctx, `now: ${(value as number).toFixed(1)}`, L, gy + 44, INK, 11);
  label(ctx, near >= 1 ? 'OVER the line' : `${((1 - near) * 100).toFixed(0)}% of headroom left`, L + gw, gy + 44, near >= 1 ? ERR : near > 0.85 ? '#FACC15' : OK, 11, 'right');
}

// flow — the bathtub: level ← level + in − out, bounded by capacity.
function drawFlow(ctx: Ctx, w: number, t: number, s: Slots) {
  const inflow = s('inflow'), outflow = s('outflow'), capacity = s('capacity');
  if ([inflow, outflow, capacity].some((v) => v === null) || (capacity as number) <= 0) return refused(ctx, w, 'inflow, outflow and capacity must be set');
  const net = (inflow as number) - (outflow as number);
  const tx = w * 0.38, ty = 44, tw = 150, th = H - 108;
  // simulate the level over the loop from half-full — the trajectory IS the arithmetic
  const loop = 8, stepsPerSec = 3;
  let level = (capacity as number) / 2;
  const elapsed = (t % loop) * stepsPerSec;
  for (let k = 0; k < elapsed; k++) level = Math.max(0, Math.min(capacity as number, level + net / stepsPerSec));
  ctx.strokeStyle = BORDER; ctx.lineWidth = 2; ctx.strokeRect(tx, ty, tw, th);
  const lh = (level / (capacity as number)) * th;
  ctx.fillStyle = 'rgba(103,232,249,0.35)'; ctx.fillRect(tx + 2, ty + th - lh, tw - 4, lh);
  // inflow drops / outflow drops (speed ∝ the rates — the visible ratio is the real ratio)
  for (let d = 0; d < Math.min(8, Math.ceil(inflow as number)); d++) {
    const dy = ((t * 60 * Math.max(0.2, (inflow as number) / 10) + rnd(d, 'in') * 60) % 60);
    ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(tx + 20 + rnd(d, 'ix') * (tw - 40), ty - 34 + dy, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  for (let d = 0; d < Math.min(8, Math.ceil(outflow as number)); d++) {
    const dy = ((t * 60 * Math.max(0.2, (outflow as number) / 10) + rnd(d, 'out') * 46) % 46);
    ctx.fillStyle = EMBER; ctx.beginPath(); ctx.arc(tx + tw + 22, ty + th - 20 + dy, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  label(ctx, `in: ${inflow}/step`, tx - 10, ty - 16, CYAN, 10, 'right');
  label(ctx, `out: ${outflow}/step`, tx + tw + 34, ty + th + 14, EMBER, 10);
  label(ctx, `level: ${level.toFixed(0)} / ${capacity}`, tx + tw / 2, ty + th + 26, INK, 11, 'center');
  const verdict = net > 0 ? `filling — hits capacity in ~${((capacity as number - level) / net).toFixed(0)} steps` : net < 0 ? `draining — empty in ~${(level / -net).toFixed(0)} steps` : 'balanced — the level holds';
  label(ctx, verdict, tx + tw / 2, H - 12, net > 0 ? CYAN : net < 0 ? ERR : OK, 10, 'center');
}

const RENDER: Record<VisualSpec['archetype'], (ctx: Ctx, w: number, t: number, s: Slots, spec: VisualSpec) => void> = {
  race: drawRace, accumulate: drawAccumulate, decay: drawDecay,
  field: drawField, grid: drawGrid, threshold: drawThreshold, flow: drawFlow,
};

export function MechanismCanvas({ spec, values }: { spec: VisualSpec; values: Record<string, number> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = window.devicePixelRatio || 1;
    let raf = 0;
    const start = performance.now();
    const s: Slots = (name) => slotValue(spec, name, values);
    const frame = (now: number) => {
      const w = canvas.clientWidth || 600;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, H);
      RENDER[spec.archetype](ctx, w, reduced ? 3.4 : (now - start) / 1000, s, spec);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spec, values]);
  return <canvas ref={ref} className="w-full rounded-xl border border-forge-border bg-[#0a0c11]" style={{ height: H }} />;
}
