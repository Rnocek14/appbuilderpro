// src/lib/garvis/field.ts
// THE FIELD — pure core (verified by field.verify.ts). One glance answers "how are my
// businesses?": every world is an orb, and the orb's state derives from real rows —
//
//   warn  (needs-you) — pending approvals wait on the operator; nothing outranks a decision.
//   ember (working)   — the machine is actively running an arc/order for this world.
//   green (news)      — something happened recently worth a look (mind events).
//   dim   (quiet)     — honestly nothing: no decisions, no work in flight, no news.
//
// PRECEDENCE IS TOTAL AND EXPLICIT: warn > ember > green > dim. Every input combination maps to
// exactly ONE state (the verify enumerates all of them) — an orb can never be two colors, and
// "quiet" is a real observation, never a fallback for "couldn't load" (the page renders load
// failures as load failures).

export type OrbState = 'warn' | 'ember' | 'green' | 'dim';

export interface OrbInput {
  working: boolean;   // an arc/standing order is actively running for this world
  needsYou: number;   // pending approvals attributed to this world
  news: number;       // mind events for this world in the recent window
}

export function orbState(s: OrbInput): OrbState {
  if (s.needsYou > 0) return 'warn';
  if (s.working) return 'ember';
  if (s.news > 0) return 'green';
  return 'dim';
}

/** The orb's one-line sub. Counts, never adjectives; quiet says quiet. */
export function orbLine(s: OrbInput): string {
  const state = orbState(s);
  if (state === 'warn') return `${s.needsYou} decision${s.needsYou === 1 ? '' : 's'} waiting`;
  if (state === 'ember') return 'working';
  if (state === 'green') return `${s.news} new thing${s.news === 1 ? '' : 's'} since yesterday`;
  return 'quiet';
}

export interface FieldWorld {
  id: string;
  title: string;
  state: OrbState;
  line: string;
  needsYou: number;
}

/** Compose the field from real, already-owner-scoped rows. Deterministic; worlds keep their
 *  given order (the caller orders by recency); a world with no matching rows is honestly dim. */
export function composeField(
  worlds: { id: string; title: string }[],
  workingWorldIds: ReadonlySet<string>,
  approvalsByWorld: ReadonlyMap<string, number>,
  newsByWorld: ReadonlyMap<string, number>,
): FieldWorld[] {
  return worlds.map((w) => {
    const input: OrbInput = {
      working: workingWorldIds.has(w.id),
      needsYou: approvalsByWorld.get(w.id) ?? 0,
      news: newsByWorld.get(w.id) ?? 0,
    };
    return { id: w.id, title: w.title, state: orbState(input), line: orbLine(input), needsYou: input.needsYou };
  });
}

/** The approvals whisper under the orbs — includes decisions NOT attributed to any world, so the
 *  total is the queue's truth, never just the orbs' sum. '' when nothing waits (no empty chrome). */
export function approvalsWhisper(totalPending: number): string {
  if (totalPending <= 0) return '';
  return `${totalPending} decision${totalPending === 1 ? '' : 's'} waiting in the Queue`;
}
