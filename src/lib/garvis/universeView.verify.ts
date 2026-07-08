// src/lib/garvis/universeView.verify.ts
// Run: npx tsx src/lib/garvis/universeView.verify.ts
// Verifies the Universe-altitude compiler: determinism, structural bands, identity-stable
// positions, cross-world-only filaments (deduped, strongest kept), comet attachment, and the
// time scrubber's honest window math (recorded events in, glow out — nothing else).

import {
  compileUniverseScene, bandOf, massOf, filamentsFrom, cometsAcross, activityAt, BAND_R,
  type UniverseWorldIn, type InsightWorldsIn, type UniverseEventIn, type UniverseSceneInput,
} from './universeView';
import type { NextMove } from './nextMove';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

const W = (over: Partial<UniverseWorldIn> & { id: string }): UniverseWorldIn => ({
  title: over.id, charteredClusters: 0, clusters: 0, artifacts: 0, momentum: null,
  updated_at: '2026-07-01T00:00:00Z', ...over,
});

const MOVE = (key: string, route: string): NextMove => ({
  key, kind: 'natural_next', title: key, why: 'rows', action: { label: 'Go', route }, score: 50, bornAt: '2026-07-01T00:00:00Z',
});

const INS = (id: string, worlds: string[], score: number): InsightWorldsIn => ({
  insightId: id, title: `insight ${id}`, score, worlds, created_at: '2026-07-01T00:00:00Z',
});

const EV = (worldId: string | null, occurred_at: string): UniverseEventIn => ({ subject: 'did a thing', occurred_at, worldId });

const BASE: UniverseSceneInput = {
  worlds: [
    W({ id: 'w-sys', charteredClusters: 4, clusters: 10, artifacts: 20, momentum: { label: 'steady', evidence: '6 events this week' } }),
    W({ id: 'w-grow', clusters: 3, artifacts: 1 }),
    W({ id: 'w-spark' }),
  ],
  insights: [
    INS('i1', ['w-sys', 'w-grow'], 0.72),
    INS('i2', ['w-sys', 'w-grow'], 0.55),      // same pair, weaker — must lose the dedupe
    INS('i3', ['w-sys'], 0.9),                  // one world — not a cross-world thread
    INS('i4', ['w-sys', 'w-ghost'], 0.8),       // unknown world — must not draw into the void
  ],
  moves: [MOVE('reply:r1', '/garvis/webs/w-sys'), MOVE('approvals:pending', '/garvis/approvals')],
  events: [
    EV('w-sys', '2026-07-07T10:00:00Z'),
    EV('w-sys', '2026-07-03T10:00:00Z'),
    EV('w-grow', '2026-06-20T10:00:00Z'),      // old — outside a 7d window ending 07-08
    EV(null, '2026-07-07T11:00:00Z'),          // untagged — lights nothing
  ],
  asOf: '2026-07-08T12:00:00Z',
};

console.log('universeView.verify');

// 1 — determinism
{
  const a = compileUniverseScene(BASE);
  const b = compileUniverseScene(BASE);
  check('same rows in → identical sky out', JSON.stringify(a) === JSON.stringify(b));
}

// 2 — bands are structural commitment, nothing else
{
  check('chartered areas → system band (inner)', bandOf({ charteredClusters: 1, clusters: 0, artifacts: 0 }) === 0);
  check('thought-mass without charters → growing band', bandOf({ charteredClusters: 0, clusters: 2, artifacts: 0 }) === 1);
  check('an empty world is a spark on the rim', bandOf({ charteredClusters: 0, clusters: 0, artifacts: 0 }) === 2);
  check('band radii ascend outward', BAND_R[0] < BAND_R[1] && BAND_R[1] < BAND_R[2]);
  const s = compileUniverseScene(BASE);
  check('bodies land on their band radius', s.bodies.every((b) => b.r === BAND_R[b.band]));
  check('mass is monotonic and bounded', massOf({ clusters: 0, artifacts: 0 }) < massOf({ clusters: 10, artifacts: 10 }) && massOf({ clusters: 9999, artifacts: 9999 }) <= 18);
  check('mass evidence names the exact counts', s.bodies.find((b) => b.id === 'w-sys')!.massEvidence.includes('4 chartered areas'));
}

// 3 — position is identity; adding a world moves nobody
{
  const before = compileUniverseScene(BASE);
  const grown = compileUniverseScene({ ...BASE, worlds: [...BASE.worlds, W({ id: 'w-new', clusters: 1 })] });
  const pos = new Map(before.bodies.map((b) => [b.id, `${b.band}:${b.angleDeg}`]));
  check('adding a world moves NO existing body', grown.bodies.filter((b) => pos.has(b.id)).every((b) => pos.get(b.id) === `${b.band}:${b.angleDeg}`));
  check('a never-observed world carries no momentum light', before.bodies.find((b) => b.id === 'w-spark')!.momentum === null);
}

// 4 — filaments: cross-world only, deduped, strongest kept, never into the void
{
  const f = filamentsFrom(BASE.insights, new Set(['w-sys', 'w-grow', 'w-spark']));
  check('exactly one filament survives (pair-deduped)', f.length === 1);
  check('the strongest insight wins the pair', f[0].score === 0.72);
  check('single-world insights draw nothing', !f.some((x) => x.a === x.b));
  check('refs to unknown worlds draw nothing', !f.some((x) => x.a === 'w-ghost' || x.b === 'w-ghost'));
  check('filament evidence states the measured score', f[0].evidence.includes('72% cosine'));
}

// 5 — comets: attached to the world they name; global moves stay unattached
{
  const c = cometsAcross(BASE.moves, ['w-sys', 'w-grow', 'w-spark']);
  check('a world-routed move attaches to its world', c.find((x) => x.key === 'reply:r1')?.worldId === 'w-sys');
  check('the owner-global approvals queue attaches to NO world', c.find((x) => x.key === 'approvals:pending')?.worldId === null);
  check('tails encode rank with a floor', c[0].tailScale === 1 && c.every((x) => x.tailScale >= 0.3));
}

// 6 — the scrubber: recorded events in, glow out, window math exact
{
  const now = activityAt(BASE.events, '2026-07-08T12:00:00Z');
  check('glow now = counted events in the trailing 7 days', now.get('w-sys') === 2 && !now.has('w-grow'));
  check('untagged events light nothing (never guessed)', ![...now.keys()].includes(''));
  const past = activityAt(BASE.events, '2026-06-24T00:00:00Z');
  check('scrubbing back relights what was active THEN', past.get('w-grow') === 1 && !past.has('w-sys'));
  const empty = activityAt([], '2026-07-08T12:00:00Z');
  check('no events → a dark sky, not an invented one', empty.size === 0);
}

// 7 — timeline bookkeeping
{
  const s = compileUniverseScene(BASE);
  check('timeline is newest-first with honest bounds', s.timeline.newest === '2026-07-07T11:00:00Z' && s.timeline.oldest === '2026-06-20T10:00:00Z');
  const dark = compileUniverseScene({ ...BASE, events: [] });
  check('an empty record has null bounds, not fake ones', dark.timeline.oldest === null && dark.timeline.newest === null);
}

console.log(`\nuniverseView.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node.
if (failed > 0) throw new Error(`${failed} verification check(s) failed`);
