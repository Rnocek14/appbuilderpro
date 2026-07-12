// src/lib/garvis/lab.verify.ts
// Standalone verification of the Lab Bench core (run: `npm run verify:lab`).
// Guards the Lab's contracts: equations reproduce KNOWN values (not vibes), the honesty layer is
// structural (basis + assumptions + limits on every template; null over fake numbers), sensitivity
// is a real finite difference, and simulation records round-trip + dedupe by content.

import {
  SIM_TEMPLATES, simTemplateById, suggestTemplate, clampValues, sensitivity,
  simRecordArtifact, parseSimRecord, fmtSimValue,
} from './lab';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number | null, b: number, eps = 0.01) => a !== null && Math.abs(a - b) <= eps;
const out = (id: string, values: Record<string, number>, key: string) => {
  const t = simTemplateById(id)!;
  return t.compute(clampValues(t, values)).find((o) => o.key === key) ?? null;
};

// 1. Every template carries its full honesty layer — structurally, not optionally.
{
  check('4 templates ship', SIM_TEMPLATES.length === 4);
  check('every template states basis + assumptions + limits', SIM_TEMPLATES.every(
    (t) => t.basis.length > 20 && t.assumptions.length >= 1 && t.limits.length >= 1));
  check('every template declares a model type', SIM_TEMPLATES.every(
    (t) => t.modelType === 'equation' || t.modelType === 'deterministic-model'));
  check('every param has a sane range containing its default', SIM_TEMPLATES.every(
    (t) => t.params.every((p) => p.min < p.max && p.def >= p.min && p.def <= p.max)));
}

// 2. Time dilation reproduces special relativity's known values.
{
  check('γ(0.8c) = 1.6667', near(out('time-dilation', { v: 0.8, years: 5 }, 'gamma')!.value, 1.6667, 0.001));
  check('5 traveler-years at 0.8c = 8.33 home-years', near(out('time-dilation', { v: 0.8, years: 5 }, 'home')!.value, 8.33));
  check('γ(0.99c) = 7.089', near(out('time-dilation', { v: 0.99, years: 5 }, 'gamma')!.value, 7.0888, 0.001));
  check('v is clamped below c — no division blow-up', out('time-dilation', { v: 2, years: 5 }, 'gamma')!.value !== null);
}

// 3. Compound growth matches the standard formulas.
{
  check('10k at 12%/12mo for 1y = 11,268.25', near(out('compound-growth', { principal: 10_000, monthly: 0, rate: 12, years: 1 }, 'fv')!.value, 11_268.25));
  check('100/mo at 12% for 1y = 1,268.25 (annuity)', near(out('compound-growth', { principal: 0, monthly: 100, rate: 12, years: 1 }, 'fv')!.value, 1_268.25));
  check('zero rate degrades to plain sums', near(out('compound-growth', { principal: 1_000, monthly: 100, rate: 0, years: 2 }, 'fv')!.value, 3_400));
  check('growth = fv − contributed', (() => {
    const v = { principal: 10_000, monthly: 250, rate: 7, years: 10 };
    const fv = out('compound-growth', v, 'fv')!.value!;
    const c = out('compound-growth', v, 'contributed')!.value!;
    return near(out('compound-growth', v, 'growth')!.value, fv - c, 0.02);
  })());
}

// 4. Rollout model — the user's own worked example, and honest nulls over fake numbers.
{
  const v = { cities: 10, sponsors: 3, price: 250, cost: 80, launch: 1_000 };
  check('10 cities × 3 × $250 = $7,500 MRR', near(out('rollout-model', v, 'mrr')!.value, 7_500));
  check('margin = 7,500 − 800 = 6,700', near(out('rollout-model', v, 'margin')!.value, 6_700));
  check('breakeven = 80/250 = 0.32 sponsors/city', near(out('rollout-model', v, 'breakeven')!.value, 0.32));
  check('recoup = 10,000/6,700 = 1.5 months', near(out('rollout-model', v, 'recoup')!.value, 1.5, 0.05));
  const dead = out('rollout-model', { ...v, sponsors: 0 }, 'recoup')!;
  check('negative margin → recoup is NULL with the reason, never a fake number', dead.value === null && !!dead.note && dead.note.includes('not reachable'));
  check('null renders as an em dash, not 0', fmtSimValue(dead) === '—');
}

// 5. Reach odds — binomial complement.
{
  check('5% × 20 attempts → 64.2% at least one', near(out('reach-odds', { p: 5, n: 20 }, 'atLeastOne')!.value, 64.2, 0.1));
  check('expected = n·p = 1', near(out('reach-odds', { p: 5, n: 20 }, 'expected')!.value, 1));
}

// 6. Sensitivity — a real finite difference, ranked by what actually moves the answer.
{
  const v = { cities: 10, sponsors: 3, price: 250, cost: 80, launch: 1_000 };
  const rows = sensitivity(simTemplateById('rollout-model')!, v, 'margin');
  check('sensitivity returns a row per movable param', rows.length >= 4);
  const price = rows.find((r) => r.key === 'price')!;
  const cost = rows.find((r) => r.key === 'cost')!;
  check('+10% price moves margin +11.2% (7500·0.1/6700)', near(price.deltaPct, 11.2, 0.1));
  check('+10% cost moves margin −1.2%', near(cost.deltaPct, -1.2, 0.1));
  check('ranked by |impact| — price outranks cost', rows.indexOf(price) < rows.indexOf(cost));
  check('launch cost does not move MONTHLY margin', (rows.find((r) => r.key === 'launch')?.deltaPct ?? 0) === 0);
  check('zero baseline → no fake percentages', sensitivity(simTemplateById('rollout-model')!, { ...v, sponsors: 0.5, price: 160, cost: 80 }, 'margin').length === 0);
}

// 7. Records — reproducible, deduped by content, tolerant on the way back in.
{
  const t = simTemplateById('rollout-model')!;
  const a1 = simRecordArtifact(t, { cities: 10, sponsors: 3, price: 250, cost: 80, launch: 1_000 });
  const a2 = simRecordArtifact(t, { cities: 10, sponsors: 3, price: 250, cost: 80, launch: 1_000 });
  const a3 = simRecordArtifact(t, { cities: 100, sponsors: 3, price: 250, cost: 80, launch: 1_000 });
  check('same inputs → same artifact id (dedupe)', a1.id === a2.id);
  check('different inputs → different id (a new record beside the old)', a1.id !== a3.id);
  check('artifact kind is simulation, source lab', a1.kind === 'simulation' && a1.source === 'lab');
  check('title leads with the primary output', a1.title.includes('Monthly margin') && a1.title.includes('6,700'));
  const rec = parseSimRecord(a1.detail);
  check('record round-trips: template, values, basis, outputs', !!rec && rec.templateId === 'rollout-model'
    && rec.values.cities === 10 && rec.basis === t.basis && rec.outputs.some((o) => o.key === 'margin' && o.value === 6_700));
  check('record carries the assumptions (honesty travels with the run)', !!rec && rec.assumptions.length >= 1);
  check('garbage detail parses to null, never throws', parseSimRecord('not json') === null && parseSimRecord(undefined) === null && parseSimRecord('{"v":2}') === null);
}

// 8. Suggestion + clamping — a convenience default, never a hidden decision.
{
  check('physics words → time dilation', suggestTemplate('exploring time near a black hole').id === 'time-dilation');
  check('business words → rollout model', suggestTemplate('hyperlocal news sponsors per city').id === 'rollout-model');
  check('investing words → compound growth', suggestTemplate('compound interest on savings').id === 'compound-growth');
  check('outreach words → reach odds', suggestTemplate('response rate on 50 pitches').id === 'reach-odds');
  check('lead-gen words → reach odds', suggestTemplate('local lead generation').id === 'reach-odds');
  check('no match → the business rollout bench (a business OS defaults to business math)', suggestTemplate('the roman empire').id === 'rollout-model');
  const t = simTemplateById('time-dilation')!;
  check('clampValues pins out-of-range + fills defaults', clampValues(t, { v: 5 }).v === 0.999 && clampValues(t, {}).years === 5);
}

console.log(`\nlab.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} lab check(s) failed`);
