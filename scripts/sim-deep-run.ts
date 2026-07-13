// scripts/sim-deep-run.ts — exercise every deterministic engine with REAL inputs and print the
// analyzed results: all four Lab Bench simulations (Einstein's time dilation across seven speeds,
// compound growth, rollout arithmetic, reach odds), sensitivity analyses, the sim-record artifact
// round-trip, the decision-lab gates on an Einstein comparison + theory scaffold, the build-brief
// compiler over the seeded relativity world, and the next-move ranking. Pure functions only —
// what the browser would compute, verified outside it. Run: npx tsx scripts/sim-deep-run.ts

import { SIM_TEMPLATES, simTemplateById, clampValues, sensitivity, simRecordArtifact, parseSimRecord, fmtSimValue, suggestTemplate } from '../src/lib/garvis/lab';
import { parseComparison, parseTheoryScaffold, VERDICT_EDGE } from '../src/lib/garvis/inquiry';
import { compileBuildBrief } from '../src/lib/garvis/buildBrief';
import { normalizeGraph, whatIfTitle, whatIfChild } from '../src/lib/garvis/clustering';
import { rankMoves, collectReplies, collectApprovals, collectLeads } from '../src/lib/garvis/nextMove';
import { invoiceTotal, chaseStage } from '../src/lib/garvis/money';

const hr = (t: string) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);
const row = (label: string, outs: { label: string; value: number | null; unit?: string }[]) =>
  console.log(`  ${label.padEnd(26)} ${outs.map((o) => `${o.label}: ${fmtSimValue(o)}`).join('  ·  ')}`);

// ---------------------------------------------------------------------------
hr('SIM 1 — EINSTEIN: time dilation γ = 1/√(1−v²/c²)  (physics · equation)');
const td = simTemplateById('time-dilation')!;
console.log(`  basis: ${td.basis}`);
console.log(`  assumptions: ${td.assumptions.join(' | ')}`);
console.log(`  limits: ${td.limits.join(' | ')}`);
console.log('');
for (const frac of [0.1, 0.5, 0.9, 0.98, 0.99, 0.999]) {
  const vals = clampValues(td, { ...Object.fromEntries(td.params.map((p) => [p.key, p.default])), [td.params[0].key]: frac });
  row(`v = ${frac}c`, td.compute(vals));
}
console.log('\n  Cross-checks against the record:');
console.log('  · muon at 0.98c → γ should be ≈ 5.03 (the "muons reach the ground" evidence)');
console.log('  · twin at 0.99c → γ should be ≈ 7.09 (the seeded what-if scenario)');
const sens = sensitivity(td, clampValues(td, { [td.params[0].key]: 0.9 }));
console.log(`  sensitivity at v=0.9c (+10% per dial): ${sens.map((s) => `${s.label} → ${s.deltaPct > 0 ? '+' : ''}${s.deltaPct}%`).join(' · ') || '(single-dial equation)'}`);

// ---------------------------------------------------------------------------
hr('SIM 2 — compound growth (money · equation)');
const cg = simTemplateById('compound-growth') ?? SIM_TEMPLATES[1];
console.log(`  basis: ${cg.basis}`);
const cgDefaults = Object.fromEntries(cg.params.map((p) => [p.key, p.default]));
for (const scenario of [cgDefaults, { ...cgDefaults, [cg.params[0].key]: cg.params[0].default * 2 }]) {
  row(`${cg.params.map((p) => `${p.key}=${scenario[p.key]}`).join(' ')}`.slice(0, 26), cg.compute(clampValues(cg, scenario)));
}
console.log(`  sensitivity: ${sensitivity(cg, clampValues(cg, cgDefaults)).map((s) => `${s.label} → ${s.deltaPct > 0 ? '+' : ''}${s.deltaPct}%`).join(' · ')}`);

// ---------------------------------------------------------------------------
hr('SIM 3 + 4 — rollout model & reach odds (defaults + sensitivity)');
for (const t of SIM_TEMPLATES.filter((x) => !['time-dilation', cg.id].includes(x.id))) {
  const d = clampValues(t, Object.fromEntries(t.params.map((p) => [p.key, p.default])));
  console.log(`  [${t.domain}] ${t.title} — ${t.tagline}`);
  row('    defaults', t.compute(d));
  console.log(`    sensitivity: ${sensitivity(t, d).slice(0, 3).map((s) => `${s.label} → ${s.deltaPct > 0 ? '+' : ''}${s.deltaPct}%`).join(' · ')}`);
}

// ---------------------------------------------------------------------------
hr('SIM RECORD — artifact round-trip + content-hash dedupe');
const art1 = simRecordArtifact(td, { [td.params[0].key]: 0.99 });
const art2 = simRecordArtifact(td, { [td.params[0].key]: 0.99 });
const art3 = simRecordArtifact(td, { [td.params[0].key]: 0.5 });
console.log(`  same inputs → same id: ${art1.id === art2.id} (${art1.id})`);
console.log(`  different inputs → different id: ${art1.id !== art3.id} (${art3.id})`);
const parsed = parseSimRecord(art1.detail);
console.log(`  parse-back: template=${parsed?.templateId} outputs=${parsed?.outputs.length} basis preserved=${!!parsed?.basis}`);
console.log(`  suggestTemplate('how fast do leads reach a customer') → ${suggestTemplate('how fast do leads reach a customer').id}`);
console.log(`  suggestTemplate('einstein clock speed') → ${suggestTemplate('einstein clock speed').id}`);

// ---------------------------------------------------------------------------
hr('DECISION LAB — comparison gates on Einstein vs Newton');
const goodComparison = JSON.stringify({
  a: { claim: 'Special relativity: moving clocks tick slower by the Lorentz factor; simultaneity is frame-dependent.',
       assumptions: ['Light speed is invariant in all inertial frames', 'Inertial frames are equivalent'] },
  b: { claim: 'Newtonian mechanics: time is absolute and flows identically for every observer everywhere.',
       assumptions: ['Time is universal and observer-independent', 'Velocities add linearly'] },
  agree: ['Both predict identical clock behavior at everyday speeds (v << c)', 'Both are deterministic frameworks with exact predictions'],
  conflict: ['At 0.98c relativity predicts γ≈5 dilation; Newton predicts none', 'Relativity makes simultaneity frame-dependent; Newton makes it absolute'],
  hinges: ['Whether measured clock rates depend on relative velocity'],
  discriminators: ['Fly atomic clocks around the world and compare with a ground clock (Hafele–Keating)', 'Measure muon flux at altitude vs sea level'],
  verdict: 'contradicts',
  readout: 'The frameworks agree at low speed and split decisively near c. Every clock experiment performed — muons, flown cesium clocks, GPS satellite rates — lands on the relativistic prediction, contradicting absolute time.',
});
const cmp = parseComparison(goodComparison);
console.log(`  full comparison → ok: ${cmp.missing.length === 0} (missing: ${cmp.missing.join(', ') || 'none'})`);
console.log(`  verdict edge mapping: contradicts → ${VERDICT_EDGE['contradicts']}, complementary → ${VERDICT_EDGE['complementary']}`);
const thin = parseComparison(JSON.stringify({ a: { claim: 'x' }, b: { claim: 'y' }, verdict: 'contradicts', readout: 'too thin' }));
console.log(`  thin comparison rejected BY NAME → missing: [${thin.missing.join(', ')}]`);

hr('DECISION LAB — theory scaffold (falsifiers NON-NEGOTIABLE)');
const goodTheory = JSON.stringify({
  claim: 'Time intervals between events depend on the observer\'s velocity relative to the events.',
  assumptions: ['Invariant light speed', 'No preferred inertial frame'],
  predictions: ['Airborne atomic clocks disagree with ground clocks by the computed ns', 'Muon flux at sea level exceeds the non-relativistic expectation ~5×'],
  falsifiers: ['A clock experiment at high v showing NO rate difference within instrument precision', 'Muon sea-level flux matching the non-dilated decay curve'],
  contradicting: ['None currently on record — every performed test matches the dilated prediction'],
});
const th = parseTheoryScaffold(goodTheory);
console.log(`  full scaffold → ok: ${th.missing.length === 0} (missing: ${th.missing.join(', ') || 'none'})`);
const noFalsifiers = parseTheoryScaffold(JSON.stringify({ claim: 'Time is relative to the observer velocity always', assumptions: ['a'], predictions: ['p'], falsifiers: [], contradicting: [] }));
console.log(`  scaffold WITHOUT falsifiers rejected → missing: [${noFalsifiers.missing.join(', ')}]`);

// ---------------------------------------------------------------------------
hr('WHAT-IF ENGINE — scenario children from twists');
console.log(`  whatIfTitle('what if the ship accelerates the whole way?') → "${whatIfTitle('what if the ship accelerates the whole way?')}"`);
console.log(`  whatIfTitle('GPS satellites orbited 10x lower!!') → "${whatIfTitle('GPS satellites orbited 10x lower!!')}"`);
// (graph-first signature — built after the seed graph below, so declare lazily here)
import seedRaw from '../scripts/einstein-seed-data';
const seedGraph = normalizeGraph(seedRaw as never);
const wi = whatIfChild(seedGraph, 'time-dilation', 'what if the traveler never decelerates?');
const wiNode = wi.graph.clusters.find((c) => c.id === wi.id);
console.log(`  whatIfChild → id=${wi.id} kind=${wiNode?.kind} epistemic=${wiNode?.epistemic} parent=${wiNode?.parentId} title="${wiNode?.title}"`);

// ---------------------------------------------------------------------------
hr('CREATE A WEB FROM THE DIVE — compileBuildBrief over the seeded Einstein graph');
import seed from '../scripts/einstein-seed-data';
const graph = normalizeGraph(seed as never);
const brief = compileBuildBrief(graph, 'time-dilation', { openQuestions: ['How would an interactive γ calculator teach this best?'] });
if (brief) {
  console.log(`  prompt (${brief.prompt.length} chars): ${brief.prompt.slice(0, 160).replace(/\n/g, ' ')}…`);
  console.log(`  brief (${brief.brief.length} chars) — sections detected: ${(brief.brief.match(/^[A-Z][A-Z &]+:?$/gm) ?? []).length}, mentions muon evidence: ${brief.brief.includes('Muons') || brief.brief.includes('muon')}`);
} else {
  console.log('  compileBuildBrief returned null — INVESTIGATE');
}

// ---------------------------------------------------------------------------
hr('NEXT-MOVE RANKING — synthetic morning over the engines');
const now = new Date();
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
const moves = rankMoves([
  ...collectReplies([{ id: 'r1', from_address: 'client@lake.com', subject: 'Re: listing', classification: 'positive', received_at: iso(2), world_id: null, has_next_touch: false }]),
  ...collectApprovals([{ id: 'a1', kind: 'send_email', title: 'Reply → client@lake.com', created_at: iso(1) }]),
  ...collectLeads([{ id: 'l1', world_id: 'w1', name: 'Sam', email: 'sam@x.com', message: 'Interested in the lakefront photos', source: 'website', created_at: iso(0.5) }]),
], now, {});
console.log(`  ${moves.length} moves ranked:`);
for (const m of moves) console.log(`    ${String(m.kind).padEnd(16)} score=${String(Math.round(m.score))} — ${m.title.slice(0, 60)} (why: ${m.why.slice(0, 50)}…)`);

// ---------------------------------------------------------------------------
hr('MONEY ARITHMETIC — totals + chase ladder');
console.log(`  invoiceTotal(3×$150 + 1×$99.50) = $${invoiceTotal([{ description: 'photo', qty: 3, unit_usd: 150 }, { description: 'edit', qty: 1, unit_usd: 99.5 }])}`);
const mkInv = (daysPastDue: number) => ({ status: 'sent', due_date: new Date(now.getTime() - daysPastDue * 86400_000).toISOString().slice(0, 10), last_chase_stage: 0 }) as never;
for (const d of [-5, 1, 8, 20]) console.log(`  due ${d >= 0 ? d + 'd ago' : -d + 'd out'} → chase stage ${chaseStage(mkInv(d), now)}`);

console.log('\nDONE — every deterministic engine exercised.');
