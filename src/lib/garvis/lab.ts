// src/lib/garvis/lab.ts
// THE LAB BENCH — pure core (no DOM, no Supabase, no LLM; verified by lab.verify.ts).
//
// The Exploration Lab's rule for simulation, stated once and enforced by construction:
// v1 ships ONLY deterministic models — known equations and arithmetic the user can check. The
// model never invents a number: every output is computed from (a) a stated basis (the formula and
// where it comes from) and (b) parameters the USER set. The honesty layer is structural, not a
// disclaimer: each template carries its basis, its assumptions, and an explicit list of what it
// does NOT model. Sensitivity is a real finite difference on THIS model — never a market forecast.
//
// A saved run is a SIMULATION RECORD (§23 of the Lab charter): template + inputs + basis + outputs,
// serialized into a knowledge artifact (kind 'simulation') on the exact branch that spawned it —
// reproducible, duplicable, one hop from the idea. Same inputs → same record id, so an identical
// re-run dedupes instead of littering.

import type { Artifact } from './clustering';

export type SimModelType = 'equation' | 'deterministic-model';

export interface SimParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
}

export interface SimOutput {
  key: string;
  label: string;
  /** null = honestly not computable at these assumptions (e.g. recoup with negative margin) */
  value: number | null;
  unit?: string;
  note?: string;
}

export interface SimTemplate {
  id: string;
  title: string;
  domain: 'physics' | 'money' | 'growth' | 'probability';
  tagline: string;      // one line of what it models
  modelType: SimModelType;
  basis: string;        // the known formula / model provenance — shown, always
  params: SimParam[];
  assumptions: string[]; // what the model takes as given (the user's dials are listed separately)
  limits: string[];      // what it does NOT model — shown next to every result
  compute: (values: Record<string, number>) => SimOutput[];
}

const round = (v: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** Clamp a value set to a template's declared ranges (missing keys → defaults). Pure. */
export function clampValues(t: SimTemplate, values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of t.params) {
    const raw = values[p.key];
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.def;
    out[p.key] = Math.min(p.max, Math.max(p.min, v));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The v1 templates. Each basis is a KNOWN formula; nothing here estimates a market.
// ---------------------------------------------------------------------------

const timeDilation: SimTemplate = {
  id: 'time-dilation',
  title: 'Time dilation',
  domain: 'physics',
  tagline: 'How much less time passes for a fast traveler than for everyone at home.',
  modelType: 'equation',
  basis: "Special relativity: γ = 1/√(1−v²/c²); elapsed home time = traveler time × γ (Lorentz, 1904; Einstein, 1905).",
  params: [
    { key: 'v', label: 'Speed (fraction of light speed)', min: 0.01, max: 0.999, step: 0.001, def: 0.8 },
    { key: 'years', label: 'Years experienced by the traveler', min: 0.5, max: 50, step: 0.5, def: 5 },
  ],
  assumptions: [
    'Constant velocity the whole way (no acceleration phases modeled)',
    'Flat spacetime — gravitational time dilation not included',
  ],
  limits: [
    'Does not model the turnaround of a real round trip (the full twin paradox needs acceleration)',
    'No gravity: near a massive body the effect compounds differently',
  ],
  compute: (v0) => {
    const { v, years } = v0;
    const gamma = 1 / Math.sqrt(1 - v * v);
    const home = years * gamma;
    return [
      { key: 'gamma', label: 'Time factor (γ)', value: round(gamma, 4), note: 'each traveler-hour is this many home-hours' },
      { key: 'home', label: 'Years passed at home', value: round(home, 2), unit: 'yr' },
      { key: 'skipped', label: 'Extra years the traveler skipped', value: round(home - years, 2), unit: 'yr' },
    ];
  },
};

const compoundGrowth: SimTemplate = {
  id: 'compound-growth',
  title: 'Compound growth',
  domain: 'growth',
  tagline: 'What a starting amount plus steady monthly additions becomes over time.',
  modelType: 'equation',
  basis: 'Compound interest with monthly compounding: FV = P(1+i)ⁿ + M·((1+i)ⁿ−1)/i, i = rate/12, n = 12·years.',
  params: [
    { key: 'principal', label: 'Starting amount', min: 0, max: 1_000_000, step: 500, def: 10_000, unit: '$' },
    { key: 'monthly', label: 'Added each month', min: 0, max: 20_000, step: 50, def: 250, unit: '$' },
    { key: 'rate', label: 'Annual growth rate', min: 0, max: 30, step: 0.5, def: 7, unit: '%' },
    { key: 'years', label: 'Years', min: 1, max: 50, step: 1, def: 10 },
  ],
  assumptions: [
    'The rate holds constant every year (real returns vary — this shows the arithmetic, not the market)',
    'Additions arrive at the end of each month; nothing is ever withdrawn',
  ],
  limits: ['No volatility, taxes, fees, or inflation — subtract those before believing the number'],
  compute: (v0) => {
    const { principal, monthly, rate, years } = v0;
    const i = rate / 100 / 12;
    const n = years * 12;
    const growthFactor = (1 + i) ** n;
    const fv = i > 0 ? principal * growthFactor + monthly * ((growthFactor - 1) / i) : principal + monthly * n;
    const contributed = principal + monthly * n;
    return [
      { key: 'fv', label: 'Future value', value: round(fv, 2), unit: '$' },
      { key: 'contributed', label: 'You put in', value: round(contributed, 2), unit: '$' },
      { key: 'growth', label: 'Growth earned', value: round(fv - contributed, 2), unit: '$' },
    ];
  },
};

const rolloutModel: SimTemplate = {
  id: 'rollout-model',
  title: 'City-by-city rollout',
  domain: 'money',
  tagline: 'Unit economics of launching a sponsored local product across N cities.',
  modelType: 'deterministic-model',
  basis: 'Arithmetic on YOUR assumptions: MRR = cities × sponsors × price; margin = MRR − cities × cost; recoup = launch outlay ÷ margin.',
  params: [
    { key: 'cities', label: 'Cities launched', min: 1, max: 500, step: 1, def: 10 },
    { key: 'sponsors', label: 'Sponsors per city', min: 0, max: 20, step: 0.5, def: 3 },
    { key: 'price', label: 'Sponsor price / month', min: 25, max: 2_000, step: 25, def: 250, unit: '$' },
    { key: 'cost', label: 'Operating cost per city / month', min: 0, max: 1_000, step: 5, def: 80, unit: '$' },
    { key: 'launch', label: 'One-time launch cost per city', min: 0, max: 5_000, step: 50, def: 500, unit: '$' },
  ],
  assumptions: [
    'Every city performs identically at the numbers you set (reality will have a spread)',
    'Sponsors per city and price are YOUR estimates — the model multiplies them, it cannot validate them',
  ],
  limits: [
    'No churn, no ramp-up time, no seasonality, no price pressure as you scale',
    'This is a calculator over your assumptions, not a market forecast',
  ],
  compute: (v0) => {
    const { cities, sponsors, price, cost, launch } = v0;
    const mrr = cities * sponsors * price;
    const monthlyCost = cities * cost;
    const margin = mrr - monthlyCost;
    return [
      { key: 'margin', label: 'Monthly margin', value: round(margin, 2), unit: '$' },
      { key: 'mrr', label: 'Monthly revenue', value: round(mrr, 2), unit: '$' },
      { key: 'cost', label: 'Monthly operating cost', value: round(monthlyCost, 2), unit: '$' },
      { key: 'breakeven', label: 'Sponsors per city to break even', value: price > 0 ? round(cost / price, 2) : null, note: 'operating cost ÷ price' },
      {
        key: 'recoup',
        label: 'Months to recoup launch outlay',
        value: margin > 0 ? round((cities * launch) / margin, 1) : null,
        note: margin > 0 ? `outlay $${round(cities * launch, 0)}` : 'not reachable — margin is zero or negative at these assumptions',
      },
    ];
  },
};

const reachOdds: SimTemplate = {
  id: 'reach-odds',
  title: 'Odds of at least one yes',
  domain: 'probability',
  tagline: 'How response probability compounds across many independent attempts.',
  modelType: 'equation',
  basis: 'Binomial complement: P(≥1 response) = 1 − (1−p)ⁿ; expected responses = n·p.',
  params: [
    { key: 'p', label: 'Response rate per attempt', min: 0.1, max: 50, step: 0.1, def: 5, unit: '%' },
    { key: 'n', label: 'Attempts (contacts, sends, pitches)', min: 1, max: 500, step: 1, def: 20 },
  ],
  assumptions: [
    'Attempts are independent and share one response rate — a real list has segments and fatigue',
    'The response rate is YOUR estimate until your own send data replaces it',
  ],
  limits: ['Says nothing about the QUALITY of a response — only whether any arrives'],
  compute: (v0) => {
    const { p, n } = v0;
    const q = p / 100;
    return [
      { key: 'atLeastOne', label: 'Chance of at least one response', value: round((1 - (1 - q) ** n) * 100, 1), unit: '%' },
      { key: 'expected', label: 'Expected responses', value: round(n * q, 1) },
    ];
  },
};

export const SIM_TEMPLATES: SimTemplate[] = [timeDilation, compoundGrowth, rolloutModel, reachOdds];

export const simTemplateById = (id: string): SimTemplate | undefined => SIM_TEMPLATES.find((t) => t.id === id);

/** Pick the template most likely to fit a branch, from its words. Deterministic keyword scan —
 *  a convenience default, freely overridable in the bench (never a hidden decision). */
export function suggestTemplate(text: string): SimTemplate {
  const s = text.toLowerCase();
  // ('einstein clock speed' fell through to the business bench in the full-product exercise —
  // the physicist's own name and the experiment's instrument belong in the physics matcher.)
  if (/(light ?speed|speed of light|relativit|time dilat|spacetime|black hole|twin paradox|physics|einstein|lorentz|(moving|atomic) clock)/.test(s)) return timeDilation;
  if (/(sponsor|city|cities|rollout|revenue|pricing|price|mrr|unit econ|business model|franchise|market|customer)/.test(s)) return rolloutModel;
  if (/(invest|compound|interest|saving|grow(th)? rate|retire)/.test(s)) return compoundGrowth;
  if (/(odds|probabilit|response rate|conversion|chance|outreach|reply rate|lead)/.test(s)) return reachOdds;
  // no keyword hit: default to the business rollout bench — this is a business OS, and opening a
  // history branch onto special relativity read as a wrong guess, not a neutral default
  return rolloutModel;
}

// ---------------------------------------------------------------------------
// Sensitivity — which dial actually moves the answer. Finite difference on THIS model:
// bump each parameter +10% (clamped to its range), recompute the primary output, rank by |Δ%|.
// ---------------------------------------------------------------------------

export interface SensitivityRow { key: string; label: string; deltaPct: number }

export function sensitivity(t: SimTemplate, values: Record<string, number>, outputKey?: string): SensitivityRow[] {
  const base = clampValues(t, values);
  const pick = (outs: SimOutput[]): number | null => {
    const o = (outputKey ? outs.find((x) => x.key === outputKey) : outs[0]) ?? outs[0];
    return o?.value ?? null;
  };
  const baseline = pick(t.compute(base));
  if (baseline === null || baseline === 0) return []; // no honest percentage exists against a zero/undefined base
  const rows: SensitivityRow[] = [];
  for (const p of t.params) {
    const bumped = clampValues(t, { ...base, [p.key]: base[p.key] * 1.1 });
    if (bumped[p.key] === base[p.key]) continue; // pinned at its bound — a bump would be a lie
    const next = pick(t.compute(bumped));
    if (next === null) continue;
    rows.push({ key: p.key, label: p.label, deltaPct: round(((next - baseline) / Math.abs(baseline)) * 100, 1) });
  }
  return rows.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

// ---------------------------------------------------------------------------
// Simulation records — a run, preserved on the branch that spawned it. Reproducible by design.
// ---------------------------------------------------------------------------

export interface SimRecord {
  v: 1;
  templateId: string;
  modelType: SimModelType;
  basis: string;
  values: Record<string, number>;
  outputs: { key: string; label: string; value: number | null; unit?: string }[];
  assumptions: string[];
}

/** Stable content hash (djb2) so the same inputs produce the same artifact id — identical re-runs
 *  dedupe instead of littering the branch. Different inputs → a new record beside the old one. */
function hashValues(templateId: string, values: Record<string, number>): string {
  const s = `${templateId}|${Object.keys(values).sort().map((k) => `${k}=${values[k]}`).join(',')}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function fmtSimValue(o: { value: number | null; unit?: string }): string {
  if (o.value === null) return '—';
  const n = Math.abs(o.value) >= 1000 ? Math.round(o.value).toLocaleString('en-US') : String(o.value);
  return o.unit === '$' ? `$${n}` : `${n}${o.unit ? ` ${o.unit}` : ''}`;
}

export function simRecordArtifact(t: SimTemplate, rawValues: Record<string, number>): Artifact {
  const values = clampValues(t, rawValues);
  const outputs = t.compute(values);
  const record: SimRecord = {
    v: 1,
    templateId: t.id,
    modelType: t.modelType,
    basis: t.basis,
    values,
    outputs: outputs.map(({ key, label, value, unit }) => ({ key, label, value, ...(unit ? { unit } : {}) })),
    assumptions: t.assumptions,
  };
  const primary = outputs[0];
  return {
    id: `sim-${t.id}-${hashValues(t.id, values)}`,
    kind: 'simulation',
    title: `${t.title} — ${primary.label}: ${fmtSimValue(primary)}`,
    detail: JSON.stringify(record),
    source: 'lab',
  };
}

/** Tolerant parse of a saved record (bad/legacy detail → null, never a throw). */
export function parseSimRecord(detail: string | undefined): SimRecord | null {
  if (!detail) return null;
  try {
    const o = JSON.parse(detail) as SimRecord;
    if (o && o.v === 1 && typeof o.templateId === 'string' && o.values && typeof o.values === 'object' && Array.isArray(o.outputs)) return o;
    return null;
  } catch {
    return null;
  }
}
