// src/lib/garvis/visualGrammar.ts
// THE VISUAL GRAMMAR OF UNDERSTANDING — pure core. The lab's five templates proved the thesis:
// you understand a thing when you can WATCH ITS MECHANISM RUN and twist its dials. This module
// generalizes that to any question by naming the small set of mechanism ARCHETYPES most
// quantifiable ideas reduce to, and defining the VisualSpec contract a designer (the model, or
// the offline starter heuristic) must satisfy before anything is drawn:
//
//   race        two quantities advancing at different rates — ratios, dilation, compounding vs flat
//   accumulate  a quantity building step by step — growth, savings, debts, skills
//   decay       a quantity shrinking by a constant fraction — half-lives, churn, forgetting
//   field       many independent tries, each succeeding with probability p — outreach, mutations
//   grid        N replicated units, each profitable or not — rollouts, cohorts, franchises
//   threshold   a value approaching a hard limit — break-evens, horizons, tipping points
//   flow        a stock with inflow and outflow — bathtubs, runway, populations, queues
//
// HONESTY CONTRACT (gated, rejected BY NAME — same posture as producers/inquiry):
//   · params are USER-ADJUSTABLE ASSUMPTIONS, never asserted facts; the caption must say so
//   · basis names where the mechanism FORM comes from (≥ 20 chars — "vibes" doesn't parse)
//   · every required slot of the archetype resolves to a param or a finite number
//   · an idea that doesn't reduce to a mechanism returns {archetype:'none', reason} — the UI
//     shows the reason; it never decorates prose with a fake animation.

export type Archetype = 'race' | 'accumulate' | 'decay' | 'field' | 'grid' | 'threshold' | 'flow';
export const ARCHETYPES: Archetype[] = ['race', 'accumulate', 'decay', 'field', 'grid', 'threshold', 'flow'];

export interface SpecParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
}

export interface VisualSpec {
  archetype: Archetype;
  title: string;              // what the mechanism shows, in the idea's own words
  caption: string;            // one honest line; must acknowledge the dials are assumptions
  basis: string;              // where this mechanism form comes from (model/identity/definition)
  params: SpecParam[];        // 1..5 dials — assumptions the user owns
  slots: Record<string, string | number>; // archetype slot → param key | finite constant
  labels?: Record<string, string>;        // archetype-specific naming (e.g. race lanes)
}

export const REQUIRED_SLOTS: Record<Archetype, string[]> = {
  race: ['rateA', 'rateB'],
  accumulate: ['start', 'rate', 'add', 'steps'],
  decay: ['start', 'keep', 'steps'],
  field: ['p', 'n'],
  grid: ['units', 'perUnit'],
  threshold: ['value', 'limit'],
  flow: ['inflow', 'outflow', 'capacity'],
};

/** Resolve a slot against the current dial values. Returns null for anything unresolvable —
 *  renderers must treat null as "refuse to draw", never as zero. */
export function slotValue(spec: VisualSpec, slot: string, values: Record<string, number>): number | null {
  const bind = spec.slots[slot];
  if (typeof bind === 'number') return Number.isFinite(bind) ? bind : null;
  if (typeof bind === 'string') {
    const v = values[bind];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return null;
}

export function specDefaults(spec: VisualSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.key, p.def]));
}

export function clampSpecValues(spec: VisualSpec, values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of spec.params) {
    const v = values[p.key];
    out[p.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The gates — a spec either satisfies the honesty contract or is rejected by name.
// ---------------------------------------------------------------------------

export interface ParsedSpec { spec: VisualSpec | null; missing: string[]; none?: { reason: string } }

export function parseVisualSpec(raw: string): ParsedSpec {
  let o: Record<string, unknown>;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return { spec: null, missing: ['everything — no JSON came back'] };
    o = JSON.parse(clean.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return { spec: null, missing: ['everything — unparseable output'] };
  }

  // The honest refusal path: the designer says the idea doesn't reduce to a mechanism.
  if (o.archetype === 'none') {
    const reason = typeof o.reason === 'string' && o.reason.trim().length >= 10
      ? o.reason.trim()
      : 'this idea does not reduce to one of the known mechanism forms';
    return { spec: null, missing: [], none: { reason } };
  }

  const missing: string[] = [];
  const archetype = ARCHETYPES.includes(o.archetype as Archetype) ? o.archetype as Archetype : null;
  if (!archetype) missing.push(`a known archetype (got "${String(o.archetype)}")`);

  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (title.length < 6) missing.push('a title in the idea\'s own words');
  const caption = typeof o.caption === 'string' ? o.caption.trim() : '';
  if (caption.length < 20) missing.push('an honest caption');
  if (caption && !/assum|estimate|your (numbers|dials|inputs)|starting point|illustrat/i.test(caption)) {
    missing.push('the caption must say the dials are assumptions, not facts');
  }
  const basis = typeof o.basis === 'string' ? o.basis.trim() : '';
  if (basis.length < 20) missing.push('a basis — where this mechanism form comes from');

  const rawParams = Array.isArray(o.params) ? o.params as Record<string, unknown>[] : [];
  const params: SpecParam[] = [];
  for (const p of rawParams.slice(0, 5)) {
    const key = typeof p?.key === 'string' ? p.key.trim() : '';
    const label = typeof p?.label === 'string' ? p.label.trim() : '';
    const min = Number(p?.min), max = Number(p?.max), step = Number(p?.step), def = Number(p?.def);
    if (!key || !label || ![min, max, step, def].every(Number.isFinite)) continue;
    if (!(min < max) || !(step > 0) || def < min || def > max) continue;
    params.push({ key, label, min, max, step, def, ...(typeof p?.unit === 'string' ? { unit: p.unit } : {}) });
  }
  if (params.length < 1) missing.push('at least one sane, user-adjustable dial (min < max, default in range)');

  const slots = (o.slots && typeof o.slots === 'object' ? o.slots : {}) as Record<string, string | number>;
  if (archetype) {
    const keys = new Set(params.map((p) => p.key));
    for (const s of REQUIRED_SLOTS[archetype]) {
      const bind = slots[s];
      const ok = (typeof bind === 'number' && Number.isFinite(bind))
        || (typeof bind === 'string' && keys.has(bind));
      if (!ok) missing.push(`slot "${s}" bound to a dial or a finite number`);
    }
  }

  if (missing.length) return { spec: null, missing };
  const labels = (o.labels && typeof o.labels === 'object' ? o.labels : undefined) as Record<string, string> | undefined;
  return { spec: { archetype: archetype!, title, caption, basis, params, slots, labels }, missing: [] };
}

// ---------------------------------------------------------------------------
// Saved mechanisms — a reproducible record on the branch, like a sim run.
// ---------------------------------------------------------------------------

const djb2 = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/** A saved mechanism as a branch artifact: readable up top, the spec JSON below so a future
 *  loader can rehydrate the exact dials. Content-hashed id → identical saves dedupe. */
export function specArtifact(spec: VisualSpec, values: Record<string, number>): {
  id: string; kind: 'diagram'; title: string; detail: string; source: 'lab';
} {
  const clamped = clampSpecValues(spec, values);
  const dialLine = spec.params.map((p) => `${p.label}: ${clamped[p.key]}${p.unit ?? ''}`).join(' · ');
  return {
    id: `viz-${spec.archetype}-${djb2(JSON.stringify({ t: spec.title, v: clamped }))}`,
    kind: 'diagram',
    title: `Mechanism — ${spec.title}`,
    detail: `${spec.caption}\nBasis: ${spec.basis}\nDials: ${dialLine}\n\n[mechanism] ${JSON.stringify({ v: 1, spec, values: clamped })}`,
    source: 'lab',
  };
}

// ---------------------------------------------------------------------------
// The designer prompt — the model designs the mechanism; the gates keep it honest.
// ---------------------------------------------------------------------------

export const PICTURE_SYSTEM = [
  'You design a MECHANISM VISUAL for one idea — the moving picture that makes it understood, not decorated.',
  'Pick the ONE archetype whose dynamics ARE the idea\'s dynamics:',
  '  race        — two quantities advance at different rates (ratios, dilation, A-vs-B compounding)',
  '  accumulate  — a quantity builds step by step (growth, savings, adoption)',
  '  decay       — a quantity shrinks by a constant fraction each step (half-life, churn, forgetting)',
  '  field       — many independent tries each succeed with probability p (outreach, trials)',
  '  grid        — N replicated units, each profitable or not (rollouts, cohorts)',
  '  threshold   — a value approaches a hard limit (break-even, capacity, horizon)',
  '  flow        — a stock with inflow and outflow (runway, population, queue)',
  'Return STRICT JSON only:',
  '{"archetype":"...","title":"...","caption":"...","basis":"...","params":[{"key":"...","label":"...","min":0,"max":10,"step":0.1,"def":1,"unit":"..."}],"slots":{"<required slot>":"<param key or number>"},"labels":{"a":"...","b":"..."}}',
  'Required slots per archetype: race rateA,rateB · accumulate start,rate,add,steps · decay start,keep,steps · field p,n · grid units,perUnit · threshold value,limit · flow inflow,outflow,capacity.',
  'RULES (violations are rejected):',
  '- params are the user\'s ASSUMPTIONS: pick round, plausible defaults and say in the caption that they are assumptions to adjust — NEVER present them as measured facts.',
  '- basis names where the mechanism FORM comes from (a definition, identity, or standard model) — not where the numbers come from; the numbers are the user\'s.',
  '- 1 to 5 params. rate/keep/p style fractions use their natural units (e.g. keep 0..1, p in %).',
  '- If the idea is qualitative, contested, or does not reduce to one of these forms, return {"archetype":"none","reason":"one honest sentence"} — a fake mechanism is worse than none.',
].join('\n');

export function picturePrompt(title: string, summary: string): string {
  return `THE IDEA:\n${title}\n${summary ? `\n${summary.slice(0, 600)}\n` : ''}\nDesign its mechanism visual now. STRICT JSON only.`;
}

// ---------------------------------------------------------------------------
// The starter heuristic — offline/AI-down path. Recognizes obvious mechanism words and offers a
// STARTER spec whose dials are plainly labeled assumptions. Returns null when nothing matches:
// no match → no visual → the honest message, never a decorative guess.
// ---------------------------------------------------------------------------

export function localSpecFor(text: string): VisualSpec | null {
  const s = text.toLowerCase();
  const cap = (what: string) =>
    `Starter mechanism for ${what} — every dial is an assumption to set, not a measured fact.`;

  if (/(half-?life|decay|churn|forget|fade|attrition|erode)/.test(s)) {
    return {
      archetype: 'decay', title: 'How fast it fades',
      caption: cap('a decaying quantity'),
      basis: 'Exponential decay: each step keeps a constant fraction of what remains (the half-life form).',
      params: [
        { key: 'keep', label: 'Fraction kept each step', min: 0.05, max: 0.99, step: 0.01, def: 0.7 },
        { key: 'steps', label: 'Steps to watch', min: 4, max: 60, step: 1, def: 20 },
      ],
      slots: { start: 100, keep: 'keep', steps: 'steps' },
    };
  }
  if (/(compound|grow(th|s|ing)?|adopt|accumulat|snowball|save|savings)/.test(s)) {
    return {
      archetype: 'accumulate', title: 'How it compounds',
      caption: cap('a compounding quantity'),
      basis: 'Geometric accumulation: value ← value × (1 + rate) + additions, applied step by step.',
      params: [
        { key: 'rate', label: 'Growth per step', min: 0, max: 0.5, step: 0.01, def: 0.05 },
        { key: 'add', label: 'Added each step', min: 0, max: 100, step: 1, def: 10 },
        { key: 'steps', label: 'Steps to watch', min: 4, max: 120, step: 1, def: 36 },
      ],
      slots: { start: 0, rate: 'rate', add: 'add', steps: 'steps' },
    };
  }
  if (/(odds|probabilit|chance|response rate|conversion|hit rate|success rate)/.test(s)) {
    return {
      archetype: 'field', title: 'Odds across many tries',
      caption: cap('independent attempts'),
      basis: 'Binomial complement: P(≥1 success) = 1 − (1−p)ⁿ over independent attempts.',
      params: [
        { key: 'p', label: 'Success rate per try', min: 0.1, max: 60, step: 0.1, def: 5, unit: '%' },
        { key: 'n', label: 'Tries', min: 1, max: 400, step: 1, def: 30 },
      ],
      slots: { p: 'p', n: 'n' },
    };
  }
  if (/(vs\.?|versus|faster than|slower than|compared to|twice as|race)/.test(s)) {
    return {
      archetype: 'race', title: 'Two rates, side by side',
      caption: cap('two competing rates'),
      basis: 'A ratio made visible: two tracks advancing at the rates you set — the gap IS the ratio.',
      params: [
        { key: 'rateA', label: 'Rate A', min: 0.1, max: 10, step: 0.1, def: 1 },
        { key: 'rateB', label: 'Rate B', min: 0.1, max: 10, step: 0.1, def: 2 },
      ],
      slots: { rateA: 'rateA', rateB: 'rateB' },
      labels: { a: 'A', b: 'B' },
    };
  }
  if (/(runway|burn ?rate|inflow|outflow|fill|drain|queue|backlog|reservoir|stock and flow)/.test(s)) {
    return {
      archetype: 'flow', title: 'What fills vs what drains',
      caption: cap('a stock with inflow and outflow'),
      basis: 'Stock-and-flow: level ← level + inflow − outflow each step, bounded by capacity.',
      params: [
        { key: 'inflow', label: 'In per step', min: 0, max: 50, step: 1, def: 8 },
        { key: 'outflow', label: 'Out per step', min: 0, max: 50, step: 1, def: 12 },
      ],
      slots: { inflow: 'inflow', outflow: 'outflow', capacity: 100 },
    };
  }
  if (/(break-?even|tipping point|capacity|limit|threshold|critical mass|saturat)/.test(s)) {
    return {
      archetype: 'threshold', title: 'How close to the line',
      caption: cap('a value against a hard limit'),
      basis: 'A threshold made visible: the value you set against the limit you set — distance is the story.',
      params: [
        { key: 'value', label: 'Where it is now', min: 0, max: 100, step: 1, def: 62 },
        { key: 'limit', label: 'The line', min: 1, max: 100, step: 1, def: 80 },
      ],
      slots: { value: 'value', limit: 'limit' },
    };
  }
  return null;
}
