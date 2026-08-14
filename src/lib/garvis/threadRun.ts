// src/lib/garvis/threadRun.ts
// ONE CONVERSATION — impure half (pure core + contract: thread.ts).
//
// Both of Garvis's mouths now read and write the SAME rows (command_messages, app_0048). The
// command page already owned that record; the corner concierge used to forget every line the
// moment the next one arrived. Same table, same window, one transcript.
//
// Everything here is fail-soft. A lost row must never break a conversation — the surface keeps
// what it is holding locally and the operator never sees plumbing.

import { supabase } from '../supabase';
import { THREAD_WINDOW, type ThreadTurn } from './thread';

/** Fired after a turn is written, so a surface mounted alongside can pick it up immediately. */
export const THREAD_EVENT = 'ff:thread';

interface Row { id: string; role: 'user' | 'garvis'; text: string; mission_id: string | null; created_at: string }

/** The recent transcript, oldest first. An unreachable record reads as an empty conversation. */
export async function loadThread(limit = THREAD_WINDOW): Promise<ThreadTurn[]> {
  try {
    const { data } = await supabase.from('command_messages')
      .select('id, role, text, mission_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Row[])
      .reverse()
      .map((r) => ({ id: r.id, role: r.role, text: r.text, at: r.created_at }));
  } catch { return []; }
}

/**
 * Write one turn. Fire-and-forget by design: the surface has already shown the line, so a failed
 * insert costs the record, never the conversation. Signed-out callers write nothing (RLS owns
 * the row) rather than throwing at a UI that has no way to act on it.
 */
export async function appendThread(
  role: 'user' | 'garvis',
  text: string,
  missionId?: string | null,
): Promise<void> {
  const body = text.trim();
  if (!body) return;
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    await supabase.from('command_messages').insert({
      owner_id: uid, role, text: body, mission_id: missionId ?? null,
    });
  } catch { /* the line was already said; the record can miss it */ }
  finally {
    try { window.dispatchEvent(new Event(THREAD_EVENT)); } catch { /* non-browser */ }
  }
}
