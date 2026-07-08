// src/lib/garvis/systemView.verify.ts
// Run: npx tsx src/lib/garvis/systemView.verify.ts
// Verifies the System-altitude scene compiler: determinism (same rows → same sky), spatial memory
// (adding a cluster NEVER moves an existing planet), glow honesty (glow only from counted rows),
// nebulae as the exact complement of activated archetypes, and world-scoping of comets.

import {
  compileSystemScene, movesForWorld, glowFor, angleOf, ringOf, sizeOf, ringRadius,
  RING_ORDER, COMET_R, NEBULA_R,
  type SceneClusterIn, type SceneIntelIn, type SystemSceneInput,
} from './systemView';
import type { NextMove } from './nextMove';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

const C = (over: Partial<SceneClusterIn> & { id: string; slug: string; archetype: SceneClusterIn['archetype'] }): SceneClusterIn => ({
  parentSlug: null, title: over.slug, status: 'active',
  artifactsTotal: 0, artifacts7d: 0, pendingApprovals: 0,
  ...over,
});

const MOVE = (key: string, route: string, kind: NextMove['kind'] = 'natural_next'): NextMove => ({
  key, kind, title: key, why: 'because rows', action: { label: 'Go', route }, score: 50, bornAt: '2026-07-01T00:00:00Z',
});

const INTEL: SceneIntelIn = {
  momentum: { label: 'steady', evidence: '6 events this week' },
  blockers: [{ text: 'Mailing list is empty', evidence: '0 contacts on record' }],
  risks: [{ text: 'Intel going stale', evidence: 'newest research is 20 days old' }],
  openQuestions: ['Which lake segment responds best?'],
  recommendation: 'Queue the second touch.',
  objective: 'More listings',
  strategy: 'Lakefront seller campaign',
  lastReflectedAt: '2026-07-01T00:00:00Z',
};

const BASE: SystemSceneInput = {
  worldId: 'w1', worldTitle: 'Mom Real Estate',
  clusters: [
    C({ id: 'c-intel', slug: 'market', archetype: 'intel', artifactsTotal: 3, artifacts7d: 1 }),
    C({ id: 'c-mail', slug: 'direct-mail', archetype: 'launch', artifactsTotal: 5, pendingApprovals: 2 }),
    C({ id: 'c-creative', slug: 'creative', parentSlug: 'direct-mail', archetype: 'studio', artifactsTotal: 4, artifacts7d: 2 }),
    C({ id: 'c-aud', slug: 'lists', archetype: 'audience' }),
  ],
  intel: INTEL,
  moves: [
    MOVE('reply:r1', '/garvis/webs/w1'),
    MOVE('reflect:w1', '/garvis/webs/w1', 'reflection_due'),
    MOVE('approvals:pending', '/garvis/approvals', 'approval_waiting'),
    MOVE('reply:r9', '/garvis/webs/OTHER'),
  ],
  asOf: '2026-07-08T12:00:00Z',
};

console.log('systemView.verify');

// 1 — determinism: same input, same sky
{
  const a = compileSystemScene(BASE);
  const b = compileSystemScene(BASE);
  check('same rows in → identical scene out (pure, no clock, no dice)', JSON.stringify(a) === JSON.stringify(b));
}

// 2 — geometry is a function of identity
{
  check('angleOf is stable and in [0,360)', angleOf('c-intel') === angleOf('c-intel') && angleOf('c-intel') >= 0 && angleOf('c-intel') < 360);
  check('every archetype has a distinct ring', new Set(RING_ORDER.map(ringOf)).size === RING_ORDER.length);
  check('ring radii ascend and stay inside the comet band', ringRadius(0) < ringRadius(6) && ringRadius(6) < COMET_R && COMET_R < NEBULA_R);
  check('size is monotonic in artifacts and bounded', sizeOf(0) < sizeOf(5) && sizeOf(5) <= sizeOf(500) && sizeOf(500) <= 18);
}

// 3 — spatial memory: adding a cluster never moves an existing planet
{
  const before = compileSystemScene(BASE);
  const grown = compileSystemScene({
    ...BASE,
    clusters: [...BASE.clusters, C({ id: 'c-new', slug: 'newsletter', archetype: 'loop', artifactsTotal: 1 })],
  });
  const posBefore = new Map(before.planets.map((p) => [p.id, `${p.ring}:${p.angleDeg}:${p.r}`]));
  const stable = grown.planets.filter((p) => posBefore.has(p.id)).every((p) => posBefore.get(p.id) === `${p.ring}:${p.angleDeg}:${p.r}`);
  check('adding a cluster moves NO existing planet (commitments stay put)', stable);
  check('the new planet appears on its archetype ring', grown.planets.some((p) => p.id === 'c-new' && p.ring === ringOf('loop')));
}

// 4 — planets vs moons: chartered children orbit their chartered parent
{
  const s = compileSystemScene(BASE);
  const mail = s.planets.find((p) => p.slug === 'direct-mail');
  check('a chartered child is a moon, not a planet', !!mail && mail.moons.length === 1 && mail.moons[0].slug === 'creative' && !s.planets.some((p) => p.slug === 'creative'));
  check('planet count = top-level chartered areas', s.planets.length === 3);
  const orphan = compileSystemScene({ ...BASE, clusters: [C({ id: 'c-x', slug: 'x', parentSlug: 'not-chartered', archetype: 'intel' })] });
  check('a child of an UNchartered parent stands alone as a planet', orphan.planets.length === 1 && orphan.planets[0].slug === 'x');
}

// 5 — glow honesty: glow exists only where rows exist
{
  check('no activity → glow 0, and the evidence says so', glowFor({ artifacts7d: 0, pendingApprovals: 0 }).glow === 0 && glowFor({ artifacts7d: 0, pendingApprovals: 0 }).evidence === 'no activity this week');
  check('counted artifacts this week → ember glow with the count', glowFor({ artifacts7d: 2, pendingApprovals: 0 }).tone === 'ember' && glowFor({ artifacts7d: 2, pendingApprovals: 0 }).evidence.includes('2 artifacts'));
  check('waiting approvals outrank activity glow (warn tone)', glowFor({ artifacts7d: 9, pendingApprovals: 1 }).tone === 'warn');
  const s = compileSystemScene(BASE);
  const lists = s.planets.find((p) => p.slug === 'lists');
  check('a dormant planet renders unlit', !!lists && lists.glow === 0 && lists.glowTone === 'none');
  check('every planet carries hoverable evidence naming its counts', s.planets.every((p) => p.evidence.includes('artifact')));
}

// 6 — comets: world-scoped, rank-tailed, owner-global moves excluded
{
  const scoped = movesForWorld(BASE.moves, 'w1');
  check('moves are scoped by key or route naming the world', scoped.length === 2 && scoped.every((m) => m.key.includes('w1') || m.action.route.includes('w1')));
  check('the owner-global approvals queue is NOT a comet here', !scoped.some((m) => m.key === 'approvals:pending'));
  const s = compileSystemScene(BASE);
  check('comet tails encode rank (first longest, floor at 0.3)', s.comets.length === 2 && s.comets[0].tailScale === 1 && s.comets[1].tailScale < 1 && s.comets.every((c) => c.tailScale >= 0.3));
  check('comets keep the move key, route, and why (click = act)', s.comets.every((c) => c.route && c.why && c.key));
}

// 7 — nebulae: the exact complement of activated archetypes
{
  const s = compileSystemScene(BASE);
  const activated = new Set(['intel', 'launch', 'studio', 'audience']);
  check('nebulae = archetypes with no chartered area', s.nebulae.length === 3 && s.nebulae.every((n) => !activated.has(n.archetype)));
  check('nebula evidence states the absence as fact', s.nebulae.every((n) => n.evidence.includes('no chartered')));
  const full = compileSystemScene({ ...BASE, clusters: RING_ORDER.map((a, i) => C({ id: `c${i}`, slug: `s${i}`, archetype: a })) });
  check('a fully activated world has zero nebulae', full.nebulae.length === 0);
}

// 8 — the star and orbit health pass through the Living State unchanged
{
  const s = compileSystemScene(BASE);
  check('star momentum is the intel label + its counted evidence', s.star.momentum?.label === 'steady' && s.star.momentum.evidence.includes('6 events'));
  check('corona scale derives from the label', s.star.coronaScale === 0.75);
  check('warnings = blockers + risks verbatim, evidence attached', s.warnings.length === 2 && s.warnings.every((w) => w.evidence.length > 0) && s.warnings[0].kind === 'blocker');
  const noIntel = compileSystemScene({ ...BASE, intel: null });
  check('no intelligence row → unknown momentum, dim corona, no invented health', noIntel.star.momentum === null && noIntel.star.coronaScale === 0.35 && noIntel.warnings.length === 0);
}

// 9 — occupied rings: draw only orbits something actually rides
{
  const s = compileSystemScene(BASE);
  check('occupiedRings lists exactly the rings with planets', JSON.stringify(s.occupiedRings) === JSON.stringify([...new Set(s.planets.map((p) => p.ring))].sort((a, b) => a - b)));
}

console.log(`\nsystemView.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node.
if (failed > 0) throw new Error(`${failed} verification check(s) failed`);
