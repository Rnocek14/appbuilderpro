// src/lib/garvis/clusterState.ts
// Merge-safe access to knowledge_clusters.working_state — the per-business scratch space. Until now the
// column was read+written inline in a couple of places, and every write REPLACED the whole object, so
// adding anything new risked wiping the saved campaign. This is the one helper that reads → merges →
// writes, plus a typed slot for creative BOARDS (working_state.boards[key]) so postcards/social/branding
// each persist their spread without clobbering each other or the campaign. Owner-scoped by the existing
// knowledge_clusters RLS.

import { supabase } from '../supabase';
import type { Board } from './creativeBoard';

export type WorkingState = Record<string, unknown>;

export async function loadClusterWorkingState(clusterId: string): Promise<WorkingState> {
  const { data, error } = await supabase.from('knowledge_clusters').select('working_state').eq('id', clusterId).maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.working_state as WorkingState | null) ?? {});
}

/** Shallow-merge `patch` into the current working_state and write it back. Read→merge→write so a write
 *  never drops keys it didn't touch (e.g. saving a board leaves `.campaign` intact). */
export async function patchClusterWorkingState(clusterId: string, patch: WorkingState): Promise<void> {
  const current = await loadClusterWorkingState(clusterId);
  const next = { ...current, ...patch };
  const { error } = await supabase.from('knowledge_clusters').update({ working_state: next }).eq('id', clusterId);
  if (error) throw new Error(error.message);
}

// ---- creative boards live under working_state.boards[key] -----------------------------------

export async function loadBoard<C>(clusterId: string, key: string): Promise<Board<C> | null> {
  const ws = await loadClusterWorkingState(clusterId);
  const boards = (ws.boards as Record<string, Board<C>> | undefined) ?? {};
  return boards[key] ?? null;
}

/** Persist one board, merging into the boards map so other channels' boards + the campaign survive. */
export async function saveBoard<C>(clusterId: string, key: string, board: Board<C>): Promise<void> {
  const ws = await loadClusterWorkingState(clusterId);
  const boards = { ...((ws.boards as Record<string, unknown>) ?? {}), [key]: board };
  await patchClusterWorkingState(clusterId, { boards });
}
