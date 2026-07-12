// scripts/seed-einstein.ts — build a REAL exploration world (an Einstein rabbit hole) through the
// product's own pure functions, so the seeded localStorage state is exactly what a live session
// would have written. Consumed by the full-product drive; deleted state, never deployed code.
// Run: npx tsx scripts/seed-einstein.ts > /tmp/seed.json

import { normalizeGraph } from '../src/lib/garvis/clustering';

const raw = {
  clusters: [
    { id: 'special-relativity', parentId: null, title: 'Special relativity', kind: 'topic', salience: 1, maturity: 'mature',
      summary: 'Einstein 1905: the laws of physics are the same in every inertial frame, and light\'s speed is invariant. Everything else — time dilation, length contraction, relative simultaneity — falls out of those two postulates.',
      trajectory: 'From postulates to testable consequences — the clock experiments decide.' },
    { id: 'time-dilation', parentId: 'special-relativity', title: 'Moving clocks tick slower', kind: 'claim', epistemic: 'established', salience: 0.95, maturity: 'mature',
      summary: 'A clock moving at speed v runs slow by the Lorentz factor γ = 1/√(1−v²/c²). At everyday speeds the effect is nanoseconds; at 0.9c it is severe.',
      trajectory: 'Quantify γ across speeds on the lab bench — the numbers are the argument.' },
    { id: 'relative-simultaneity', parentId: 'special-relativity', title: 'Simultaneity is relative', kind: 'theory', epistemic: 'established', salience: 0.8, maturity: 'growing',
      summary: 'Two events simultaneous in one frame are not simultaneous in another moving frame. "Now" is frame-dependent — the deepest conceptual break from Newton.',
      trajectory: 'Contrast with Newtonian absolute time; find the discriminating experiment.' },
    { id: 'newtonian-absolute-time', parentId: 'special-relativity', title: 'Newtonian absolute time', kind: 'theory', epistemic: 'contested', salience: 0.6, maturity: 'dormant',
      summary: 'Newton: time flows equably for all observers, everywhere. Contradicted by every relativistic clock experiment, yet it remains the working intuition of daily life.',
      trajectory: 'Kept as the foil — every relativity test is also a test against this.' },
    { id: 'muon-decay', parentId: 'time-dilation', title: 'Muons reach the ground', kind: 'evidence', epistemic: 'established', salience: 0.85, maturity: 'mature',
      summary: 'Cosmic-ray muons live ~2.2μs — too short to cross the atmosphere at 0.98c without dilation. They arrive anyway: their clocks run ~5× slow in our frame. Direct, repeatable evidence.',
      trajectory: 'The cleanest classroom-grade confirmation; γ≈5 at 0.98c.' },
    { id: 'hafele-keating', parentId: 'time-dilation', title: 'Hafele–Keating: clocks on airliners', kind: 'experiment', epistemic: 'established', salience: 0.8, maturity: 'finished',
      summary: '1971: cesium clocks flown around the world east and west disagreed with the ground clock by tens to hundreds of nanoseconds — matching special + general relativistic predictions.',
      trajectory: 'Replicated many times since; GPS is the standing rerun.' },
    { id: 'gps-correction', parentId: 'time-dilation', title: 'Why GPS must correct for relativity', kind: 'question', salience: 0.75, maturity: 'growing',
      summary: 'Satellite clocks gain ~38μs/day (special −7μs, general +45μs). Uncorrected, GPS position error would grow ~10km per day. The correction is engineered into the clock rates.',
      trajectory: 'The everyday proof: relativity ships in your phone.' },
    { id: 'twin-at-99c', parentId: 'time-dilation', title: 'What if a twin travels at 0.99c?', kind: 'scenario', epistemic: 'speculative', salience: 0.7, maturity: 'spark',
      summary: 'At 0.99c, γ ≈ 7.09 — a 10-year round trip on the traveler\'s clock is ~71 Earth years. The asymmetry is real (the traveler accelerates); the "paradox" dissolves.',
      trajectory: 'Run the numbers at 0.5c, 0.9c, 0.99c on the bench.' },
    { id: 'invariant-c', parentId: 'special-relativity', title: 'Light speed is the same for everyone', kind: 'claim', epistemic: 'established', salience: 0.9, maturity: 'mature',
      summary: 'Michelson–Morley found no ether wind; every measurement since gives c regardless of the source\'s or observer\'s motion. The postulate the whole structure stands on.',
      trajectory: 'The axiom — everything in this world is downstream of it.' },
    { id: 'relativity-of-mass-energy', parentId: 'special-relativity', title: 'E = mc²: mass is frozen energy', kind: 'insight', epistemic: 'established', salience: 0.85, maturity: 'mature',
      summary: 'Energy and mass are one ledger. Nuclear binding energies, particle creation, and the sun\'s output all balance on this identity.',
      trajectory: 'Bridge to a future dive: general relativity and gravity as geometry.' },
  ],
  edges: [
    { sourceId: 'invariant-c', targetId: 'time-dilation', type: 'leads_to' },
    { sourceId: 'time-dilation', targetId: 'relative-simultaneity', type: 'relates' },
    { sourceId: 'muon-decay', targetId: 'time-dilation', type: 'supports' },
    { sourceId: 'hafele-keating', targetId: 'time-dilation', type: 'supports' },
    { sourceId: 'relative-simultaneity', targetId: 'newtonian-absolute-time', type: 'contradicts' },
    { sourceId: 'hafele-keating', targetId: 'newtonian-absolute-time', type: 'contradicts' },
    { sourceId: 'time-dilation', targetId: 'twin-at-99c', type: 'leads_to' },
    { sourceId: 'time-dilation', targetId: 'gps-correction', type: 'leads_to' },
    { sourceId: 'invariant-c', targetId: 'relativity-of-mass-energy', type: 'leads_to' },
  ],
};

const graph = normalizeGraph(raw as never);
const now = new Date().toISOString();
const world = {
  id: 'einstein-relativity-dive',
  title: 'Einstein: does moving really slow your clock?',
  graph,
  focusId: 'time-dilation',
  createdAt: now,
  updatedAt: now,
};

console.log(JSON.stringify({
  worlds: { [world.id]: world },
  current: world.id,
  clusterCount: graph.clusters.length,
  edgeCount: graph.edges.length,
}));
