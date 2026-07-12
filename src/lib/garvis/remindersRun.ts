// src/lib/garvis/remindersRun.ts
// The human's own reminders — the one operator affordance that had no home. Distinct from
// garvis_tasks (agent work) and next-moves (Garvis's inference): these are the user's words,
// surfaced at the top of the cockpit when due (collectReminders) and cleared when done.

import { supabase } from '../supabase';

export interface ReminderRow {
  id: string; title: string; detail: string | null; world_id: string | null;
  due_at: string | null; done: boolean; created_at: string;
}

export async function listReminders(includeDone = false): Promise<ReminderRow[]> {
  let q = supabase.from('reminders')
    .select('id, title, detail, world_id, due_at, done, created_at')
    .order('due_at', { ascending: true, nullsFirst: false }).limit(100);
  if (!includeDone) q = q.eq('done', false);
  const { data } = await q;
  return (data ?? []) as ReminderRow[];
}

export async function addReminder(input: { title: string; detail?: string; dueAt?: string | null; worldId?: string | null }): Promise<ReminderRow> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const title = input.title.trim();
  if (!title) throw new Error('A reminder needs a title.');
  const { data, error } = await supabase.from('reminders').insert({
    owner_id: uid, title, detail: input.detail?.trim() || null,
    due_at: input.dueAt || null, world_id: input.worldId || null,
  }).select('id, title, detail, world_id, due_at, done, created_at').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the reminder.');
  return data as ReminderRow;
}

export async function completeReminder(id: string): Promise<void> {
  const { error } = await supabase.from('reminders').update({ done: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
