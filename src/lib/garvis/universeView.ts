// src/lib/garvis/universeView.ts
// P3 — THE UNIVERSE ALTITUDE, pure core (no Supabase, no DOM; verified by universeView.verify.ts).
//
// All worlds in one sky. This is NOT navigation decoration — it is the x-ray of Garvis's living
// memory across every world, and every element is a row:
//
//   bodies    = knowledge_worlds. BAND is structural commitment: worlds with chartered production
//               areas orbit the inner band (systems), worlds with thought-mass the middle
//               (growing), empty worlds the outer rim (sparks). Band changes only when rows do.
//   size      = counted mass (clusters + artifacts, log-scaled)
//   light     = the world's momentum label from world_intelligence — derived from counts,
//               dim when never observed (no row → no light on faith)
//   glow      = recorded world-tagged mind_events inside the visible time window — the ONE thing
//               the scrubber changes, because replaying the record is the only honest time travel
//   filaments = insights whose refs resolve to TWO OR MORE different worlds — real cross-world
//               connections carrying their measured cosine score. Proximity here means NOTHING:
//               position is identity (hash), relatedness is drawn as a line or it isn't claimed.
//   comets    = the same ranked Next Moves as the waking moment, attached to the world their
//               key/route names; owner-global moves stay unattached (listed, not staged in the sky)
//
// Same discipline as the System altitude: no clock, no dice, same rows in → same sky out.

import type { NextMove } from './nextMove';
import type { MomentumLabel } from './worldIntel';
import { hash32, angleOf } from './systemView';

// ---------------------------------------------------------------------------
// Inputs — adapted by universeViewRun.ts
// ---------------------------------------------------------------------------

export interface UniverseWorldIn {
  id: string;
  title: string;
  charteredClusters: number;  // production areas — the structural commitment signal
  clusters: number;           // all clusters (thought mass)
  artifacts: number;          // made things (work mass)
  momentum: { label: MomentumLabel; evidence: string } | null; // from world_intelligence; null = never observed
  updated_at: string;
  /** true = lives only in this browser's local store (an explorer rabbithole never synced) —
   *  drawn honestly as part of the sky, labeled as local. */
  localOnly?: boolean;
}

/** An insight whose refs the impure layer resolved to world ids (via documents/clusters). */
export interface InsightWorldsIn {
  insightId: string;
  title: string;
  score: number;              // cosine — measured, never invented
  worlds: string[];           // DISTINCT world ids the refs resolve to
  created_at: string;
}

export interface UniverseEventIn {
  subject: string;
  occurred_at: string;
  worldId: string | null;     // payload.world_id when stamped; null = untagged (never guessed)
}

export interface UniverseSceneInput {
  worlds: UniverseWorldIn[];
  insights: InsightWorldsIn[];
  moves: NextMove[];
  events: UniverseEventIn[];  // newest first, bounded by the impure layer
  asOf: string;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** 0 = system (inner), 1 = growing (middle), 2 = spark (outer rim). */
export type WorldBand = 0 | 1 | 2;

export const BAND_R: Record<WorldBand, number> = { 0: 0.34, 1: 0.62, 2: 0.86 };
export const BAND_LABEL: Record<WorldBand, string> = { 0: 'system', 1: 'growing', 2: 'spark' };

export interface WorldBody {
  id: string;
  title: string;
  band: WorldBand;
  angleDeg: number;           // identity hash — position is WHO, never HOW RELATED
  r: number;
  size: number;
  isSystem: boolean;
  localOnly: boolean;
  momentum: { label: MomentumLabel; evidence: string } | null;
  massEvidence: string;       // the hover line: the exact counts behind band and size
  updated_at: string;
}

export interface UniverseFilament {
  key: string;                // stable: insightId + pair
  a: string; b: string;       // world ids
  title: string;
  score: number;
  evidence: string;
}

export interface UniverseComet {
  key: string; kind: NextMove['kind'];
  title: string; why: string; route: string; actionLabel: string;
  worldId: string | null;     // null = owner-global (the approvals queue) — listed, not drawn
  angleDeg: number;
  tailScale: number;
}

export interface UniverseScene {
  bodies: WorldBody[];
  filaments: UniverseFilament[];
  comets: UniverseComet[];
  timeline: { events: UniverseEventIn[]; oldest: string | null; newest: string | null };
  asOf: string;
}

// ---------------------------------------------------------------------------
// Structure — band, mass, light
// ---------------------------------------------------------------------------

export function bandOf(w: Pick<UniverseWorldIn, 'charteredClusters' | 'clusters' | 'artifacts'>): WorldBand {
  if (w.charteredClusters > 0) return 0;
  if (w.clusters > 0 || w.artifacts > 0) return 1;
  return 2;
}

export function massOf(w: Pick<UniverseWorldIn, 'clusters' | 'artifacts'>): number {
  return 5 + Math.min(13, Math.round(2.6 * Math.log(1 + Math.max(0, w.clusters + w.artifacts))));
}

function massEvidence(w: UniverseWorldIn): string {
  const parts = [
    `${w.clusters} cluster${w.clusters === 1 ? '' : 's'}`,
    `${w.artifacts} artifact${w.artifacts === 1 ? '' : 's'}`,
  ];
  if (w.charteredClusters > 0) parts.unshift(`${w.charteredClusters} chartered area${w.charteredClusters === 1 ? '' : 's'}`);
  if (w.localOnly) parts.push('local only — open it in Explore to sync');
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Filaments — cross-world only, deduped per pair keeping the strongest
// ---------------------------------------------------------------------------

export function filamentsFrom(insights: InsightWorldsIn[], knownWorldIds: Set<string>): UniverseFilament[] {
  const best = new Map<string, UniverseFilament>();
  for (const ins of insights) {
    const worlds = [...new Set(ins.worlds)].filter((w) => knownWorldIds.has(w));
    if (worlds.length < 2) continue; // an insight inside one world is not a cross-world thread
    for (let i = 0; i < worlds.length; i++) {
      for (let j = i + 1; j < worlds.length; j++) {
        const [a, b] = [worlds[i], worlds[j]].sort();
        const pairKey = `${a}|${b}`;
        const f: UniverseFilament = {
          key: `${ins.insightId}:${pairKey}`, a, b,
          title: ins.title, score: ins.score,
          evidence: `${Math.round(ins.score * 100)}% cosine similarity — measured by the brain, never invented`,
        };
        const prev = best.get(pairKey);
        if (!prev || f.score > prev.score) best.set(pairKey, f);
      }
    }
  }
  return [...best.values()].sort((x, y) => y.score - x.score);
}

// ---------------------------------------------------------------------------
// Comets — the shared Next Move engine, attached to the worlds it names
// ---------------------------------------------------------------------------

export function cometsAcross(moves: NextMove[], worldIds: string[]): UniverseComet[] {
  return moves.slice(0, 8).map((m, i) => ({
    key: m.key, kind: m.kind, title: m.title, why: m.why,
    route: m.action.route, actionLabel: m.action.label,
    worldId: worldIds.find((w) => m.key.includes(w) || m.action.route.includes(w)) ?? null,
    angleDeg: angleOf(m.key),
    tailScale: Math.max(0.3, 1 - i * 0.14),
  }));
}

// ---------------------------------------------------------------------------
// Time — replaying the record is the only honest time travel
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** World-tagged event counts in the window (at − windowDays, at]. This is everything the
 *  scrubber changes: recorded events in, glow out. Untagged events light nothing. */
export function activityAt(events: UniverseEventIn[], atIso: string, windowDays = 7): Map<string, number> {
  const at = new Date(atIso).getTime();
  const from = at - windowDays * DAY;
  const out = new Map<string, number>();
  for (const e of events) {
    if (!e.worldId) continue;
    const t = new Date(e.occurred_at).getTime();
    if (t > from && t <= at) out.set(e.worldId, (out.get(e.worldId) ?? 0) + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------

export function compileUniverseScene(input: UniverseSceneInput): UniverseScene {
  const bodies: WorldBody[] = input.worlds
    .map((w) => {
      const band = bandOf(w);
      return {
        id: w.id, title: w.title, band,
        angleDeg: angleOf(w.id), r: BAND_R[band],
        size: massOf(w),
        isSystem: band === 0,
        localOnly: w.localOnly ?? false,
        momentum: w.momentum,
        massEvidence: massEvidence(w),
        updated_at: w.updated_at,
      };
    })
    .sort((a, b) => a.band - b.band || a.id.localeCompare(b.id));

  const known = new Set(input.worlds.map((w) => w.id));
  const events = [...input.events].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  return {
    bodies,
    filaments: filamentsFrom(input.insights, known),
    comets: cometsAcross(input.moves, [...known]),
    timeline: {
      events,
      oldest: events.length ? events[events.length - 1].occurred_at : null,
      newest: events.length ? events[0].occurred_at : null,
    },
    asOf: input.asOf,
  };
}

// re-exported for the page (deterministic geometry shared with the System altitude)
export { hash32, angleOf };
