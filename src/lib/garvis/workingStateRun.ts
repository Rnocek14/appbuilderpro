// src/lib/garvis/workingStateRun.ts
// THE WORKING SET (app_0052) — the durable "what I'm holding right now" row that replaces the
// localStorage buses the design review flagged. Contract: the database row is the truth; local
// storage stays a same-device cache so nothing regresses while the row is unreachable (signed
// out, migration not yet applied, offline). Every write is fire-and-forget-safe: callers that
// don't await still leave the local cache correct.

import { supabase } from '../supabase';

export interface WorkingStateRow {
  canvas: unknown | null;
  build_brief: Record<string, unknown> | null;
  dismissals: Record<string, string>;
  last_seen_at: string | null;
}

let cache: WorkingStateRow | null = null;

async function uid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

/** Fetch the row (null when signed out / table missing / no row yet). Caches for the session so
 *  merge-writes don't need a read round-trip; loadRankedMoves refreshes it on every wake. */
export async function loadWorkingState(): Promise<WorkingStateRow | null> {
  try {
    const { data, error } = await supabase.from('working_state')
      .select('canvas, build_brief, dismissals, last_seen_at').maybeSingle();
    if (error || !data) return cache; // table missing / no row → whatever we knew
    cache = {
      canvas: (data as { canvas?: unknown }).canvas ?? null,
      build_brief: ((data as { build_brief?: Record<string, unknown> | null }).build_brief) ?? null,
      dismissals: ((data as { dismissals?: Record<string, string> | null }).dismissals) ?? {},
      last_seen_at: ((data as { last_seen_at?: string | null }).last_seen_at) ?? null,
    };
    return cache;
  } catch { return cache; }
}

/** The last row this session saw — synchronous, for callers that already triggered a load. */
export function knownWorkingState(): WorkingStateRow | null { return cache; }

/** Upsert a partial patch onto the owner's row. Silent no-op when signed out or the table is
 *  missing — the caller's localStorage cache already carries the same-device experience. */
export async function patchWorkingState(patch: Partial<{
  canvas: unknown | null;
  build_brief: Record<string, unknown> | null;
  dismissals: Record<string, string>;
  last_seen_at: string | null;
}>): Promise<void> {
  const owner = await uid();
  if (!owner) return;
  try {
    const row: Record<string, unknown> = { owner_id: owner, updated_at: new Date().toISOString(), ...patch };
    const { error } = await supabase.from('working_state').upsert(row, { onConflict: 'owner_id' });
    if (!error) {
      cache = {
        canvas: 'canvas' in patch ? (patch.canvas ?? null) : cache?.canvas ?? null,
        build_brief: 'build_brief' in patch ? (patch.build_brief ?? null) : cache?.build_brief ?? null,
        dismissals: patch.dismissals ?? cache?.dismissals ?? {},
        last_seen_at: 'last_seen_at' in patch ? (patch.last_seen_at ?? null) : cache?.last_seen_at ?? null,
      };
    }
  } catch { /* the local cache carries this device; the row catches up next write */ }
}

/** Merge one dismissal into the row (read-merge-write so two devices never clobber each other's
 *  dismissals wholesale — last write per KEY wins, not last write per row). */
export async function mergeDismissal(key: string, atIso: string): Promise<void> {
  const current = (await loadWorkingState())?.dismissals ?? {};
  await patchWorkingState({ dismissals: { ...current, [key]: atIso } });
}
