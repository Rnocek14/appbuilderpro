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
let cacheUid: string | null = null;   // the cache belongs to ONE account (review fix: an SPA
                                      // sign-out/sign-in must never leak the prior user's desk)
let lastLoadOk = false;               // distinguishes "no row yet" from "couldn't reach the row"

async function uid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

/** Fetch the row (null when signed out / table missing / no row yet). Caches for the session so
 *  merge-writes don't need a read round-trip; loadRankedMoves refreshes it on every wake. */
export async function loadWorkingState(): Promise<WorkingStateRow | null> {
  const owner = await uid();
  if (owner !== cacheUid) { cache = null; cacheUid = owner; } // account switched → forget the desk
  if (!owner) { lastLoadOk = false; return null; }
  try {
    const { data, error } = await supabase.from('working_state')
      .select('canvas, build_brief, dismissals, last_seen_at').maybeSingle();
    if (error) { lastLoadOk = false; return cache; } // table missing / offline → whatever this account knew
    lastLoadOk = true;
    if (!data) { cache = null; return null; }        // reached the DB, no row — an honest empty desk
    cache = {
      canvas: (data as { canvas?: unknown }).canvas ?? null,
      build_brief: ((data as { build_brief?: Record<string, unknown> | null }).build_brief) ?? null,
      dismissals: ((data as { dismissals?: Record<string, string> | null }).dismissals) ?? {},
      last_seen_at: ((data as { last_seen_at?: string | null }).last_seen_at) ?? null,
    };
    return cache;
  } catch { lastLoadOk = false; return cache; }
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
 *  dismissals wholesale — last write per KEY wins, not last write per row). When the pre-read
 *  FAILED (not "no row" — actually unreachable), skip the server write entirely rather than
 *  rebuild the column from nothing and wipe other devices' dismissals; localStorage still hides
 *  the move on this device, and the next successful dismissal carries a fresh merge. */
export async function mergeDismissal(key: string, atIso: string): Promise<void> {
  const row = await loadWorkingState();
  if (!lastLoadOk && !row) return;
  const current = row?.dismissals ?? {};
  await patchWorkingState({ dismissals: { ...current, [key]: atIso } });
}

/** Clear the row's canvas ONLY if it still holds the canvas this tab is closing — closing a
 *  stale desk in one tab must not destroy a newer desk another tab just staged (review fix). */
export async function clearCanvasIfMatches(closing: unknown): Promise<void> {
  const row = await loadWorkingState();
  if (!lastLoadOk) return;                    // can't compare — leave the row alone
  const held = row?.canvas ?? null;
  if (held === null) return;                  // already clear
  try {
    if (JSON.stringify(held) === JSON.stringify(closing)) await patchWorkingState({ canvas: null });
  } catch { /* incomparable → leave it */ }
}
