// src/components/garvis/SimVisual.tsx
// THE VISUAL SIMULATION LAYER — every lab-bench model gets a bespoke mechanism you can watch and
// play with, drawn on canvas from the SAME clamped values and computed outputs the readout shows.
// No-Theater rule, applied to animation: motion never claims anything the math didn't compute —
// the ship photon's diagonal IS γ, the near clock's hand turns exactly 1/factor as fast, the
// growth curve is the formula evaluated month by month. Decoration (starfields, glow) claims
// nothing and is labeled by omission. Static single frame under prefers-reduced-motion.

import { useEffect, useRef } from 'react';
import type { SimTemplate, SimOutput } from '../../lib/garvis/lab';

const H = 250;
const INK = '#e8eaf0', DIM = '#8b90a0', FAINT = '#5c6170', EMBER = '#FF8A3D', OK = '#4ADE80', ERR = '#f87171', CYAN = '#67e8f9', RAISED = '#1a1e28', BORDER = '#262b36';

const hash32 = (s: string): number => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
const rnd = (i: number, salt: string) => (hash32(`${salt}-${i}`) % 10000) / 10000;
const money = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;
const out = (outputs: SimOutput[], key: string): number | null => outputs.find((o) => o.key === key)?.value ?? null;

function clock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, color: string) {
  ctx.strokeStyle = BORDER; ctx.fillStyle = RAISED; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle - Math.PI / 2) * r * 0.72, y + Math.sin(angle - Math.PI / 2) * r * 0.72); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = DIM, size = 10, align: CanvasTextAlign = 'left') {
  ctx.fillStyle = color; ctx.font = `${size}px ui-monospace, monospace`; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.textAlign = 'left';
}

// ---- time dilation: two light clocks, one on a moving ship -------------------------------------
function drawTimeDilation(ctx: CanvasRenderingContext2D, w: number, t: number, values: Record<string, number>, outputs: SimOutput[]) {
  const v = values.v ?? 0.8;
  const gamma = out(outputs, 'gamma') ?? 1 / Math.sqrt(1 - v * v);
  const midX = w / 2;
  const yTop = 52, yBot = H - 78, span = yBot - yTop;
  const P = 2.4; // seconds per home round trip — display cadence only; the RATIO is the physics

  // starfield drifting past the ship half (decoration: fixed seed, claims nothing)
  for (let i = 0; i < 34; i++) {
    const sx = midX + ((rnd(i, 'sx') * (w - midX) + t * (30 + 140 * v)) % (w - midX));
    ctx.fillStyle = `rgba(139,144,160,${0.12 + rnd(i, 'so') * 0.25})`;
    ctx.fillRect(w + midX - sx, yTop - 26 + rnd(i, 'sy') * (span + 40), 1.6, 1.6);
  }

  const tri = (phase: number) => { const f = phase % 2; return f < 1 ? f : 2 - f; }; // 0..1..0 bounce

  // HOME clock — photon straight up and down
  const hx = midX * 0.5;
  ctx.strokeStyle = BORDER; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx - 34, yTop); ctx.lineTo(hx + 34, yTop); ctx.moveTo(hx - 34, yBot); ctx.lineTo(hx + 34, yBot); ctx.stroke();
  const hy = yTop + tri(t / (P / 2)) * span;
  ctx.fillStyle = EMBER; ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,138,61,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hx, yTop); ctx.lineTo(hx, yBot); ctx.stroke();

  // SHIP clock — the car translates; the photon's path is the DIAGONAL, longer by exactly γ
  const shipSpan = w - midX - 90;
  const carX = midX + 30 + ((t * (26 + 120 * v)) % shipSpan);
  ctx.strokeStyle = BORDER; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(carX - 34, yTop); ctx.lineTo(carX + 34, yTop); ctx.moveTo(carX - 34, yBot); ctx.lineTo(carX + 34, yBot); ctx.stroke();
  ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.strokeRect(carX - 40, yTop - 12, 80, span + 24); // the ship hull
  const sy = yTop + tri(t / ((P * gamma) / 2)) * span;
  // trail: the last half-bounce of diagonal path, sampled — this line IS the longer path
  ctx.strokeStyle = 'rgba(103,232,249,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let k = 0; k <= 14; k++) {
    const tk = t - (k / 14) * (P * gamma / 2);
    const xk = midX + 30 + ((tk * (26 + 120 * v)) % shipSpan + shipSpan) % shipSpan;
    const yk = yTop + tri(Math.max(0, tk) / ((P * gamma) / 2)) * span;
    if (k === 0) ctx.moveTo(xk, yk); else if (Math.abs(xk - carX) < shipSpan * 0.8) ctx.lineTo(xk, yk);
  }
  ctx.stroke();
  ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(carX, sy, 4.5, 0, Math.PI * 2); ctx.fill();

  // divider + counters — the ship's counter falls behind at exactly 1/γ
  ctx.strokeStyle = BORDER; ctx.beginPath(); ctx.moveTo(midX, 16); ctx.lineTo(midX, H - 44); ctx.stroke();
  const homeTicks = Math.floor(t / P), shipTicks = Math.floor(t / (P * gamma));
  label(ctx, 'HOME CLOCK', hx, 30, DIM, 10, 'center');
  label(ctx, `ticks: ${homeTicks}`, hx, H - 52, INK, 12, 'center');
  label(ctx, `SHIP AT ${(v).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}c`, midX + (w - midX) / 2, 30, DIM, 10, 'center');
  label(ctx, `ticks: ${shipTicks}   (×1/γ = ×${(1 / gamma).toFixed(3)})`, midX + (w - midX) / 2, H - 52, CYAN, 12, 'center');
  label(ctx, `γ = ${gamma.toFixed(4)} — the diagonal the ship photon traces is exactly γ× the straight bounce`, 12, H - 14, FAINT, 10);
}

// ---- gravity well: a clock hovering near the horizon vs one far away ---------------------------
function drawGravityWell(ctx: CanvasRenderingContext2D, w: number, t: number, values: Record<string, number>, outputs: SimOutput[]) {
  const r = Math.max(1.02, values.r ?? 2);
  const factor = out(outputs, 'factor') ?? 1 / Math.sqrt(1 - 1 / r);
  const cx = 86, cy = H * 0.52, rs = 20;

  // glow + photon ring + the hole (glow is decoration; the RADII are to scale in rs units)
  const grad = ctx.createRadialGradient(cx, cy, rs, cx, cy, rs * 3.4);
  grad.addColorStop(0, 'rgba(255,138,61,0.5)'); grad.addColorStop(0.4, 'rgba(255,138,61,0.12)'); grad.addColorStop(1, 'rgba(255,138,61,0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, rs * 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,180,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, rs * 1.5, 0, Math.PI * 2); ctx.stroke(); // photon sphere, 1.5 rs
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, rs, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,138,61,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, rs + 0.8, 0, Math.PI * 2); ctx.stroke();
  label(ctx, 'event horizon (rs)', cx, cy + rs * 3.4 + 14, FAINT, 9, 'center');

  // the hovering clock at r (to scale: px = rs · r, capped with an honest break mark)
  const rawPx = rs * r;
  const maxPx = w - cx - 150;
  const px = Math.min(rawPx, maxPx);
  ctx.setLineDash([3, 4]); ctx.strokeStyle = FAINT;
  ctx.beginPath(); ctx.moveTo(cx + rs, cy); ctx.lineTo(cx + px - 20, cy); ctx.stroke(); ctx.setLineDash([]);
  if (rawPx > maxPx) label(ctx, '≈', cx + px / 2, cy - 6, DIM, 12, 'center');
  const omega = (Math.PI * 2) / 2.6; // far clock: 1 rev / 2.6s — cadence; the RATIO is the physics
  clock(ctx, cx + px, cy, 17, (t * omega) / factor, EMBER);
  label(ctx, `hovering at r = ${r.toFixed(2)} rs`, cx + px, cy + 34, INK, 10, 'center');
  label(ctx, `hand turns 1/${factor.toFixed(3)}× as fast`, cx + px, cy + 47, EMBER, 9, 'center');

  // the far clock
  const fx = w - 74, fy = 56;
  clock(ctx, fx, fy, 17, t * omega, OK);
  label(ctx, 'FAR AWAY', fx, fy + 34, DIM, 9, 'center');

  const nearTicks = Math.floor((t / 2.6) / factor), farTicks = Math.floor(t / 2.6);
  label(ctx, `far hours: ${farTicks}   near hours: ${nearTicks}`, w - 12, H - 30, INK, 11, 'right');
  label(ctx, `every near-hour costs ${factor.toFixed(4)} far-hours — both hands turn from the same computed factor`, 12, H - 14, FAINT, 10);
}

// ---- compound growth: the formula, evaluated month by month ------------------------------------
function drawCompound(ctx: CanvasRenderingContext2D, w: number, t: number, values: Record<string, number>, outputs: SimOutput[]) {
  const { principal = 0, monthly = 0, rate = 0, years = 1 } = values;
  const i = rate / 100 / 12, n = Math.max(1, Math.round(years * 12));
  const bal = (m: number) => i > 0 ? principal * (1 + i) ** m + monthly * (((1 + i) ** m - 1) / i) : principal + monthly * m;
  const fv = out(outputs, 'fv') ?? bal(n);
  const L = 56, R = 16, T = 22, B = 34, plotW = w - L - R, plotH = H - T - B;
  const yMax = Math.max(fv, 1) * 1.06;
  const X = (m: number) => L + (m / n) * plotW;
  const Y = (val: number) => T + plotH - (val / yMax) * plotH;

  ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const gy = T + (g / 3) * plotH;
    ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(w - R, gy); ctx.stroke();
    label(ctx, money(yMax * (1 - g / 3)), L - 6, gy + 3, FAINT, 9, 'right');
  }

  const k = Math.max(2, Math.round(n * Math.min(1, (t % 7.5) / 5.5))); // sweep, then hold
  ctx.beginPath(); ctx.moveTo(X(0), Y(bal(0)));
  for (let m = 1; m <= k; m++) ctx.lineTo(X(m), Y(bal(m)));
  ctx.lineTo(X(k), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
  ctx.fillStyle = 'rgba(255,138,61,0.18)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(X(0), Y(bal(0)));
  for (let m = 1; m <= k; m++) ctx.lineTo(X(m), Y(bal(m)));
  ctx.strokeStyle = EMBER; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(0), Y(principal));
  for (let m = 1; m <= k; m++) ctx.lineTo(X(m), Y(principal + monthly * m));
  ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);

  const endY = Y(bal(k));
  ctx.fillStyle = EMBER; ctx.beginPath(); ctx.arc(X(k), endY, 3.5, 0, Math.PI * 2); ctx.fill();
  label(ctx, `${money(bal(k))} at year ${(k / 12).toFixed(1)}`, Math.min(X(k) + 8, w - 110), endY - 8, INK, 11);
  label(ctx, 'balance (the formula, month by month)', L, H - 18, EMBER, 10);
  label(ctx, '– – what you put in', L + 240, H - 18, DIM, 10);
}

// ---- rollout: the city grid + break-even + payback ---------------------------------------------
function drawRollout(ctx: CanvasRenderingContext2D, w: number, t: number, values: Record<string, number>, outputs: SimOutput[]) {
  const { cities = 1, sponsors = 0, price = 0, cost = 0 } = values;
  const perCity = sponsors * price - cost;
  const breakeven = out(outputs, 'breakeven');
  const recoup = out(outputs, 'recoup');
  const shown = Math.min(Math.round(cities), 48), cols = 12, size = 20, gap = 6;
  const gx = 16, gy = 40;

  label(ctx, `THE MAP — ${Math.round(cities)} cities at YOUR numbers`, gx, 24, DIM, 10);
  for (let c = 0; c < shown; c++) {
    const x = gx + (c % cols) * (size + gap), y = gy + Math.floor(c / cols) * (size + gap);
    const pulse = 0.75 + 0.25 * Math.sin(t * 2 + rnd(c, 'ph') * Math.PI * 2);
    ctx.fillStyle = perCity > 0 ? `rgba(74,222,128,${0.28 * pulse + 0.14})` : perCity < 0 ? `rgba(248,113,113,${0.3 * pulse + 0.14})` : 'rgba(139,144,160,0.2)';
    ctx.strokeStyle = perCity > 0 ? 'rgba(74,222,128,0.45)' : perCity < 0 ? 'rgba(248,113,113,0.5)' : BORDER;
    ctx.beginPath(); ctx.roundRect(x, y, size, size, 4); ctx.fill(); ctx.stroke();
  }
  if (cities > shown) label(ctx, `+ ${Math.round(cities) - shown} more`, gx, gy + 4 * (size + gap) + 14, FAINT, 10);
  label(ctx, `${perCity >= 0 ? '+' : ''}${money(perCity)} margin / city / month`, gx, H - 18, perCity > 0 ? OK : ERR, 11);

  // break-even gauge + payback bar
  const bx = w - 268, bw = 240;
  label(ctx, 'SPONSORS vs BREAK-EVEN', bx, 40, DIM, 9);
  const scale = Math.max(sponsors, (breakeven ?? 0) * 1.4, 1);
  ctx.fillStyle = RAISED; ctx.beginPath(); ctx.roundRect(bx, 48, bw, 10, 5); ctx.fill();
  ctx.fillStyle = perCity >= 0 ? OK : ERR; ctx.beginPath(); ctx.roundRect(bx, 48, Math.min(1, sponsors / scale) * bw, 10, 5); ctx.fill();
  if (breakeven != null) {
    const mx = bx + Math.min(1, breakeven / scale) * bw;
    ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, 44); ctx.lineTo(mx, 62); ctx.stroke();
    label(ctx, `break-even ${breakeven}/city`, bx, 76, '#FACC15', 9);
  }
  label(ctx, `you set ${sponsors}/city`, bx + bw, 76, INK, 9, 'right');

  label(ctx, 'MONTHS TO RECOUP LAUNCH', bx, 110, DIM, 9);
  ctx.fillStyle = RAISED; ctx.beginPath(); ctx.roundRect(bx, 118, bw, 10, 5); ctx.fill();
  if (recoup != null) {
    const capped = Math.min(recoup, 24);
    const sweep = Math.min(1, (t % 4) / 2.6);
    ctx.fillStyle = EMBER; ctx.beginPath(); ctx.roundRect(bx, 118, (capped / 24) * bw * sweep, 10, 5); ctx.fill();
    label(ctx, `${recoup} mo${recoup > 24 ? ' (bar capped at 24)' : ''}`, bx, 146, EMBER, 10);
  } else {
    label(ctx, 'not reachable — margin ≤ 0 at these dials', bx, 146, ERR, 10);
  }
  label(ctx, 'scale: 24 mo', bx + bw, 146, FAINT, 9, 'right');
}

// ---- reach odds: the compounding curve + the attempt field -------------------------------------
function drawReachOdds(ctx: CanvasRenderingContext2D, w: number, t: number, values: Record<string, number>, outputs: SimOutput[]) {
  const { p = 5, n = 20 } = values;
  const q = p / 100;
  const atLeastOne = out(outputs, 'atLeastOne') ?? (1 - (1 - q) ** n) * 100;
  const expected = out(outputs, 'expected') ?? n * q;
  const L = 48, R = 16, T = 20, B = 92, plotW = w - L - R, plotH = H - T - B;
  const X = (k: number) => L + (k / n) * plotW;
  const Y = (prob: number) => T + plotH - prob * plotH;

  ctx.strokeStyle = BORDER;
  for (const g of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(L, Y(g)); ctx.lineTo(w - R, Y(g)); ctx.stroke(); label(ctx, `${g * 100}%`, L - 5, Y(g) + 3, FAINT, 9, 'right'); }
  ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  for (let k = 1; k <= n; k++) ctx.lineTo(X(k), Y(1 - (1 - q) ** k));
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(X(n), Y(atLeastOne / 100), 4, 0, Math.PI * 2); ctx.fill();
  label(ctx, `${atLeastOne}% by attempt ${n}`, Math.max(L, X(n) - 130), Y(atLeastOne / 100) - 10, INK, 11);
  label(ctx, '1 − (1−p)ᵏ as attempts compound', L, T - 6, FAINT, 9);

  // the attempt field — expected responses light up (an ILLUSTRATION of the expectation, labeled)
  const dots = Math.min(Math.round(n), 60), dcols = 30, ds = 9, dgap = 5;
  const fy = H - B + 26;
  const lit = Math.round(Math.min(1, (t % 4) / 2.4) * Math.min(dots, Math.round(expected * (dots / n))));
  for (let d = 0; d < dots; d++) {
    const x = L + (d % dcols) * (ds + dgap), y = fy + Math.floor(d / dcols) * (ds + dgap);
    ctx.fillStyle = d < lit ? OK : RAISED; ctx.strokeStyle = d < lit ? OK : BORDER;
    ctx.beginPath(); ctx.arc(x, y, ds / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  label(ctx, `${dots < n ? `${dots} of ${n} attempts drawn — ` : ''}expected responses: ${expected}`, L, H - 12, DIM, 10);
}

const RENDERERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, t: number, v: Record<string, number>, o: SimOutput[]) => void> = {
  'time-dilation': drawTimeDilation,
  'gravity-well': drawGravityWell,
  'compound-growth': drawCompound,
  'rollout-model': drawRollout,
  'reach-odds': drawReachOdds,
};

const CAPTIONS: Record<string, string> = {
  'time-dilation': 'The light clocks are the argument: the ship photon must trace the longer diagonal, so its ticks fall behind at exactly 1/γ — the same γ in the readout.',
  'gravity-well': 'Both hands turn from the same computed factor — the hovering clock simply turns 1/factor as fast. Radii drawn to scale in horizon units.',
  'compound-growth': 'The curve is the formula evaluated month by month; its endpoint equals the Future value readout. The dashed line is what you put in.',
  'rollout-model': 'Every tile is one city at your dials — green when sponsors × price clears the operating cost. The yellow tick is the break-even the readout computed.',
  'reach-odds': 'The curve is 1−(1−p)ᵏ; the dot lands on your n. The lit dots below illustrate the expected count — an average, not a promise.',
};

export function SimVisual({ template, values, outputs }: { template: SimTemplate; values: Record<string, number>; outputs: SimOutput[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const render = RENDERERS[template.id];
    if (!canvas || !render) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = window.devicePixelRatio || 1;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const w = canvas.clientWidth || 600;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, H);
      // reduced motion: one representative mid-cycle frame, no loop
      render(ctx, w, reduced ? 3.7 : (now - start) / 1000, values, outputs);
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [template.id, values, outputs]);

  if (!RENDERERS[template.id]) return null;
  return (
    <div className="mt-4">
      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-forge-dim/70">watch the mechanism</div>
      <canvas ref={ref} className="w-full rounded-xl border border-forge-border bg-[#0a0c11]" style={{ height: H }} />
      <p className="mt-1.5 text-[10px] text-forge-dim/70">{CAPTIONS[template.id]}</p>
    </div>
  );
}
