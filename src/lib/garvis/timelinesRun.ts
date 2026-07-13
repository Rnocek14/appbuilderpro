// src/lib/garvis/timelinesRun.ts
// Impure half of transaction timelines: instantiate a template into real rows, load with steps,
// toggle/close/delete — and optionally turn every dated step into a REMINDER, which the standing
// worker fires at its due time (app_0062). A deadline that rings beats a row that waits.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import { addReminder } from './remindersRun';
import { instantiateTimeline, type TimelineKind } from './timelines';

export interface StepRow {
  id: string; title: string; due_date: string | null; offset_days: number;
  position: number; done: boolean; done_at: string | null;
}
export interface TimelineRow {
  id: string; title: string; kind: TimelineKind; anchor_date: string;
  status: 'active' | 'closed'; created_at: string; steps: StepRow[];
}

/** Create a timeline + its steps; optionally mint a firing reminder per dated step (due 9am-ish
 *  US-morning, 14:00 UTC — the reminder says which timeline it belongs to). */
export async function createTimeline(input: {
  worldId: string; title: string; kind: TimelineKind; anchorDate: string; addReminders: boolean;
}): Promise<{ timelineId: string; steps: number; reminders: number }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const title = input.title.trim();
  if (!title) throw new Error('Name the transaction (e.g. "10 Shore Dr — buyers").');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate)) throw new Error('Pick the anchor date.');

  const plan = instantiateTimeline(input.kind, input.anchorDate);
  const { data: tl, error } = await supabase.from('transaction_timelines').insert({
    owner_id: uid, world_id: input.worldId, title, kind: input.kind, anchor_date: input.anchorDate,
  }).select('id').single();
  if (error || !tl) throw new Error(`Could not create the timeline: ${error?.message ?? 'unknown'}`);

  const { error: stepErr } = await supabase.from('timeline_steps').insert(plan.map((s) => ({
    owner_id: uid, timeline_id: tl.id, title: s.title, due_date: s.dueDate,
    offset_days: s.offsetDays, position: s.position,
  })));
  if (stepErr) throw new Error(`Timeline created but steps failed: ${stepErr.message}`);

  let reminders = 0;
  if (input.addReminders) {
    for (const s of plan) {
      try {
        await addReminder({
          title: `${title}: ${s.title}`,
          dueAt: `${s.dueDate}T14:00:00Z`,
          worldId: input.worldId,
          detail: `Timeline step (${input.kind}) — anchor ${input.anchorDate}, offset ${s.offsetDays >= 0 ? '+' : ''}${s.offsetDays}d.`,
        });
        reminders++;
      } catch { /* a failed reminder shouldn't lose the timeline; count stays honest */ }
    }
  }

  await recordMindEvent(uid, {
    event_type: 'note', source: 'workweb',
    subject: `Timeline started: "${title}" (${plan.length} steps${reminders ? `, ${reminders} reminders armed` : ''})`,
    payload: { world_id: input.worldId, timeline_id: tl.id, kind: input.kind, steps: plan.length, reminders },
  });
  return { timelineId: tl.id as string, steps: plan.length, reminders };
}

export async function listTimelines(worldId: string): Promise<TimelineRow[]> {
  const { data, error } = await supabase.from('transaction_timelines')
    .select('id, title, kind, anchor_date, status, created_at, timeline_steps(id, title, due_date, offset_days, position, done, done_at)')
    .eq('world_id', worldId).order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as (Omit<TimelineRow, 'steps'> & { timeline_steps: StepRow[] })[]).map((t) => ({
    ...t,
    steps: [...(t.timeline_steps ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export async function setStepDone(stepId: string, done: boolean): Promise<void> {
  const { data, error } = await supabase.from('timeline_steps')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', stepId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Step not found.');
}

export async function setTimelineStatus(id: string, status: 'active' | 'closed'): Promise<void> {
  const { data, error } = await supabase.from('transaction_timelines').update({ status }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Timeline not found.');
}

export async function deleteTimeline(id: string): Promise<void> {
  const { error } = await supabase.from('transaction_timelines').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
