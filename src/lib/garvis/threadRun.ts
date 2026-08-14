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

/** Fired after a turn is written, so a surface mounted alongside can re-read the record. */
export const THREAD_EVENT = 'ff:thread';
/**
 * Fired the INSTANT a turn is said, carrying the turn itself. A surface that renders the
 * conversation on behalf of another (the command page showing what was typed into the corner)
 * must not wait for a database round-trip to show it — a line the operator just watched being
 * sent should not blink out of existence while a row is written.
 */
export const THREAD_TURN_EVENT = 'ff:thread-turn';

export interface SaidTurn { role: 'user' | 'garvis'; text: string }

/** Tell any surface showing this conversation that a line was just said. */
export function broadcastTurn(role: 'user' | 'garvis', text: string): void {
  const body = text.trim();
  if (!body) return;
  try { window.dispatchEvent(new CustomEvent<SaidTurn>(THREAD_TURN_EVENT, { detail: { role, text: body } })); }
  catch { /* non-browser */ }
}

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
 * Write one turn. Never throws: a surface has already shown the line, so a failed insert costs
 * the record, not the conversation. Signed-out callers write nothing (RLS owns the row) rather
 * than throwing at a UI that has no way to act on it.
 *
 * Returns whether the row actually LANDED. A caller that isn't rendering its own copy of the
 * conversation (the dock on a page that shows the transcript itself) needs to know, because for
 * that caller the record is the only place the line would appear.
 */
export async function appendThread(
  role: 'user' | 'garvis',
  text: string,
  missionId?: string | null,
): Promise<boolean> {
  const body = text.trim();
  if (!body) return false;
  let landed = false;
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (uid) {
      const { error } = await supabase.from('command_messages').insert({
        owner_id: uid, role, text: body, mission_id: missionId ?? null,
      });
      landed = !error;
    }
  } catch { /* landed stays false */ }
  finally {
    try { window.dispatchEvent(new Event(THREAD_EVENT)); } catch { /* non-browser */ }
  }
  return landed;
}
