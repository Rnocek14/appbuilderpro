// src/lib/garvis/systemView.ts
// P2 — THE SYSTEM ALTITUDE, pure core (no Supabase, no DOM; verified by systemView.verify.ts).
//
// The orbital view over ONE world. It became worth building only after Sprint M: before World
// Intelligence the star would have been decoration; now every element is a rendered row:
//
//   star        = the world + its Living State (momentum label derived from counted signals)
//   planets     = chartered clusters — the production areas (knowledge_clusters.charter != null)
//   moons       = chartered child areas, attached to their parent planet
//   planet glow = counted 7-day activity / waiting approvals — never a mood
//   comets      = Next Moves scoped to this world (same engine as the waking moment, no fork)
//   nebulae     = archetypes with NO chartered area yet — capability as visible potential
//   warnings    = the Living State's blockers + risks, evidence attached (orbit health)
//
// No-Theater geometry rules:
//   * A planet's position is a FUNCTION OF ITS IDENTITY: ring = archetype (semantically fixed),
//     angle = hash(cluster id). Adding or removing OTHER clusters never moves a planet —
//     "commitments stay put; spatial memory is sacred" is enforced by construction and by verify.
//   * Nothing in here reads the clock or rolls dice; the caller passes asOf. Same rows in,
//     same sky out — that determinism is what makes the view trustworthy.

import type { Archetype, CharterStatus } from './workweb';
import { ARCHETYPES } from './workweb';
import type { NextMove } from './nextMove';
import type { EvidencedItem, MomentumLabel } from './worldIntel';

// ---------------------------------------------------------------------------
// Deterministic geometry helpers
// ---------------------------------------------------------------------------

/** FNV-1a over the string — stable across sessions, no Math.random anywhere in this module. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Angle in [0, 360) from identity alone — a planet keeps its bearing forever. */
export function angleOf(id: string): number {
  return hash32(id) % 360;
}

/** Ring order is SEMANTIC and fixed: knowing → who → making → acting → following → learning → holding.
 *  A cluster's archetype never changes, so its orbit never changes. */
export const RING_ORDER: Archetype[] = ['intel', 'audience', 'studio', 'launch', 'loop', 'ledger', 'vault'];

export function ringOf(archetype: Archetype): number {
  return RING_ORDER.indexOf(archetype);
}

/** Normalized radius (0..1 of the viewport half-size) for a ring index. */
export function ringRadius(ring: number): number {
  return 0.3 + ring * 0.082; // 7 rings: 0.30 … 0.79 — comets at 0.88, nebulae at 0.97
}

export const COMET_R = 0.88;
export const NEBULA_R = 0.97;

/** Planet size (viewBox px at 600) from TOTAL artifacts — log-scaled, bounded, monotonic. */
export function sizeOf(artifactsTotal: number): number {
  return 7 + Math.min(11, Math.round(3.2 * Math.log(1 + Math.max(0, artifactsTotal))));
}

// ---------------------------------------------------------------------------
// Inputs — minimal projections; the impure layer (systemViewRun) adapts rows
// ---------------------------------------------------------------------------

export interface SceneClusterIn {
  id: string;
  slug: string;
  parentSlug: string | null;
  title: string;
  archetype: Archetype;
  status: CharterStatus;
  artifactsTotal: number;
  artifacts7d: number;       // counted from artifact created_at — the ONLY source of glow
  pendingApprovals: number;
}

export interface SceneIntelIn {
  momentum: { label: MomentumLabel; evidence: string } | null;
  blockers: EvidencedItem[];
  risks: EvidencedItem[];
  openQuestions: string[];
  recommendation: string | null;
  objective: string | null;
  strategy: string | null;
  lastReflectedAt: string | null;
}

export interface SystemSceneInput {
  worldId: string;
  worldTitle: string;
  clusters: SceneClusterIn[];
  intel: SceneIntelIn | null;   // null = no intelligence row yet (world never opened) — say so
  moves: NextMove[];            // pass ALL moves; movesForWorld() scopes them here
  asOf: string;                 // ISO — the caller owns the clock
}

// ---------------------------------------------------------------------------
// Outputs — everything the SVG draws, every element carrying its evidence
// ---------------------------------------------------------------------------

export type GlowTone = 'ember' | 'warn' | 'none';

export interface Moon {
  id: string; slug: string; title: string;
  angleDeg: number;            // around the parent planet — hash of the moon's own id
  glow: number; glowTone: GlowTone;
  status: CharterStatus;
  evidence: string;
}

export interface Planet {
  id: string; slug: string; title: string;
  archetype: Archetype;
  ring: number; angleDeg: number; r: number;
  size: number;
  glow: number;                // 0..1, discrete honest tiers — see glowFor()
  glowTone: GlowTone;
  status: CharterStatus;
  artifactsTotal: number;
  evidence: string;            // the hover line: exactly which counts produced this rendering
  moons: Moon[];
}

export interface Comet {
  key: string; kind: NextMove['kind'];
  title: string; why: string; route: string; actionLabel: string;
  angleDeg: number; r: number;
  tailScale: number;           // rank-derived: the top move has the longest tail
}

export interface Nebula {
  archetype: Archetype; label: string; tagline: string;
  angleDeg: number; r: number;
  evidence: string;            // "no chartered X area yet" — potential, stated as fact
}

export interface OrbitWarning { kind: 'blocker' | 'risk'; text: string; evidence: string }

export interface Star {
  title: string;
  momentum: { label: MomentumLabel; evidence: string } | null; // null = never observed, render as unknown
  coronaScale: number;         // derived from the label (which is derived from counts)
  objective: string | null;
  strategy: string | null;
}

export interface SystemScene {
  worldId: string;
  star: Star;
  planets: Planet[];
  comets: Comet[];
  nebulae: Nebula[];
  warnings: OrbitWarning[];
  openQuestions: string[];
  recommendation: string | null;
  occupiedRings: number[];     // which orbit circles to draw (only where something orbits)
  asOf: string;
}

// ---------------------------------------------------------------------------
// The honest glow: counted activity or waiting approvals — nothing else
// ---------------------------------------------------------------------------

export function glowFor(c: Pick<SceneClusterIn, 'artifacts7d' | 'pendingApprovals'>): { glow: number; tone: GlowTone; evidence: string } {
  if (c.pendingApprovals > 0) {
    return {
      glow: 1, tone: 'warn',
      evidence: `${c.pendingApprovals} action${c.pendingApprovals === 1 ? '' : 's'} waiting for approval`,
    };
  }
  if (c.artifacts7d > 0) {
    return {
      glow: Math.min(1, 0.45 + 0.15 * c.artifacts7d), tone: 'ember',
      evidence: `${c.artifacts7d} artifact${c.artifacts7d === 1 ? '' : 's'} this week`,
    };
  }
  return { glow: 0, tone: 'none', evidence: 'no activity this week' };
}

const CORONA: Record<MomentumLabel, number> = { surging: 1, steady: 0.75, slowing: 0.5, dormant: 0.35 };

// ---------------------------------------------------------------------------
// Move scoping — one Next Move engine, two altitudes
// ---------------------------------------------------------------------------

/** A move belongs to this system when its identity or destination names the world. Structural:
 *  the route literally targets this world's pages, or the key was minted with this world's id.
 *  Owner-global moves (the approvals queue) stay at Universe altitude — they are not comets here. */
export function movesForWorld(moves: NextMove[], worldId: string): NextMove[] {
  return moves.filter((m) => m.key.includes(worldId) || m.action.route.includes(worldId));
}

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------

export function compileSystemScene(input: SystemSceneInput): SystemScene {
  const chartered = input.clusters;
  const bySlug = new Set(chartered.map((c) => c.slug));

  // A child whose parent is itself a chartered area becomes a MOON of that parent; a child whose
  // parent is not chartered stands alone as a planet (its parent is a thought, not an area).
  const planetsIn = chartered.filter((c) => !c.parentSlug || !bySlug.has(c.parentSlug));
  const moonsIn = chartered.filter((c) => c.parentSlug && bySlug.has(c.parentSlug));

  const moonsByParent = new Map<string, Moon[]>();
  for (const m of moonsIn) {
    const g = glowFor(m);
    const moon: Moon = {
      id: m.id, slug: m.slug, title: m.title,
      angleDeg: angleOf(m.id), glow: g.glow, glowTone: g.tone,
      status: m.status, evidence: g.evidence,
    };
    const list = moonsByParent.get(m.parentSlug!) ?? [];
    list.push(moon);
    moonsByParent.set(m.parentSlug!, list);
  }
  for (const list of moonsByParent.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const planets: Planet[] = planetsIn
    .map((c) => {
      const g = glowFor(c);
      const ring = ringOf(c.archetype);
      return {
        id: c.id, slug: c.slug, title: c.title, archetype: c.archetype,
        ring, angleDeg: angleOf(c.id), r: ringRadius(ring),
        size: sizeOf(c.artifactsTotal),
        glow: g.glow, glowTone: g.tone, status: c.status,
        artifactsTotal: c.artifactsTotal,
        evidence: `${c.artifactsTotal} artifact${c.artifactsTotal === 1 ? '' : 's'} total · ${g.evidence}`,
        moons: moonsByParent.get(c.slug) ?? [],
      };
    })
    .sort((a, b) => a.ring - b.ring || a.id.localeCompare(b.id));

  // Comets: this world's next moves, in rank order (the caller passes them ranked). Tail length
  // encodes RANK — a deterministic derivation of the deterministic score, nothing invented.
  const scoped = movesForWorld(input.moves, input.worldId);
  const comets: Comet[] = scoped.slice(0, 5).map((m, i) => ({
    key: m.key, kind: m.kind, title: m.title, why: m.why,
    route: m.action.route, actionLabel: m.action.label,
    angleDeg: angleOf(m.key), r: COMET_R,
    tailScale: Math.max(0.3, 1 - i * 0.175),
  }));

  // Nebulae: capability as potential. An archetype nobody has chartered in this world is a place
  // the web could grow — its position is a FIXED slot (potential may drift later; v1 holds still).
  const activated = new Set(chartered.map((c) => c.archetype));
  const nebulae: Nebula[] = RING_ORDER
    .filter((a) => !activated.has(a))
    .map((a) => ({
      archetype: a, label: ARCHETYPES[a].label, tagline: ARCHETYPES[a].tagline,
      angleDeg: (RING_ORDER.indexOf(a) * (360 / RING_ORDER.length) + 18) % 360,
      r: NEBULA_R,
      evidence: `no chartered ${ARCHETYPES[a].label.toLowerCase()} area in this world yet`,
    }));

  // Orbit health: the Living State's blockers and risks pass through UNCHANGED — they were built
  // evidence-first by compileLivingState/parseReflection; re-deriving them here would fork truth.
  const warnings: OrbitWarning[] = [
    ...(input.intel?.blockers ?? []).map((b) => ({ kind: 'blocker' as const, text: b.text, evidence: b.evidence })),
    ...(input.intel?.risks ?? []).map((r) => ({ kind: 'risk' as const, text: r.text, evidence: r.evidence })),
  ];

  const star: Star = {
    title: input.worldTitle,
    momentum: input.intel?.momentum ?? null,
    coronaScale: input.intel?.momentum ? CORONA[input.intel.momentum.label] : 0.35,
    objective: input.intel?.objective ?? null,
    strategy: input.intel?.strategy ?? null,
  };

  return {
    worldId: input.worldId,
    star,
    planets,
    comets,
    nebulae,
    warnings,
    openQuestions: input.intel?.openQuestions ?? [],
    recommendation: input.intel?.recommendation ?? null,
    occupiedRings: [...new Set(planets.map((p) => p.ring))].sort((a, b) => a - b),
    asOf: input.asOf,
  };
}
