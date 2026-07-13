// src/lib/garvis/contactsRun.ts
// The contacts CRM: edit fields, a pipeline stage, free-text notes, and a per-contact ACTIVITY
// TIMELINE unioned from the rows the contact already touches (messages sent, replies, leads).
// All owner-scoped. The timeline merge is the only logic worth isolating — kept pure in
// contactsCore.ts and verified.

import { supabase } from '../supabase';
import { mergeTimeline, type TimelineItem } from './contactsCore';

export type ContactStage = 'new' | 'contacted' | 'qualified' | 'customer' | 'lost';

export interface ContactDetail {
  id: string; full_name: string | null; email: string; email_status: string;
  stage: ContactStage; created_at: string;
}
export interface ContactNote { id: string; body: string; created_at: string }

export async function getContact(id: string): Promise<ContactDetail | null> {
  const { data } = await supabase.from('contacts')
    .select('id, full_name, email, email_status, stage, created_at').eq('id', id).maybeSingle();
  return (data as ContactDetail | null) ?? null;
}

export async function updateContact(id: string, patch: { full_name?: string | null; stage?: ContactStage }): Promise<void> {
  const { error } = await supabase.from('contacts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Manually suppress a contact — the "they asked me by phone / in person" opt-out (deep scan P1:
 *  there was no client path to write suppression at all). Writes the sacred per-address suppression
 *  row AND flips the contact so both gates block future sends; fail-closed and idempotent. */
export async function suppressContact(id: string, email: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const addr = email.trim().toLowerCase();
  if (!addr) throw new Error('This contact has no email to suppress.');
  const { error } = await supabase.from('suppression').upsert(
    { owner_id: uid, email: addr, domain: null, reason: 'manual' }, // per-address; never the whole domain
    { onConflict: 'owner_id,email' },
  );
  if (error) throw new Error(`Could not add to the suppression list: ${error.message}`);
  await supabase.from('contacts').update({ email_status: 'unsubscribed' }).eq('id', id).then(() => {}, () => {});
}

/** Undo a manual suppression (the row was added by mistake). Removes the suppression row and clears
 *  the unsubscribed flag. Only lifts a 'manual' suppression — an inbound unsubscribe stays sacred. */
export async function unsuppressContact(id: string, email: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const addr = email.trim().toLowerCase();
  const { error } = await supabase.from('suppression').delete()
    .eq('owner_id', uid).eq('email', addr).eq('reason', 'manual');
  if (error) throw new Error(error.message);
  await supabase.from('contacts').update({ email_status: 'active' }).eq('id', id).then(() => {}, () => {});
}

export async function listNotes(contactId: string): Promise<ContactNote[]> {
  const { data } = await supabase.from('contact_notes')
    .select('id, body, created_at').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(100);
  return (data ?? []) as ContactNote[];
}

export async function addNote(contactId: string, body: string): Promise<ContactNote> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const clean = body.trim();
  if (!clean) throw new Error('Write a note first.');
  const { data, error } = await supabase.from('contact_notes')
    .insert({ owner_id: uid, contact_id: contactId, body: clean })
    .select('id, body, created_at').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the note.');
  return data as ContactNote;
}

/** The activity timeline: everything this contact touched, newest first. Read the raw rows, then
 *  merge deterministically (pure) so the ordering + labeling is verifiable. */
export async function contactTimeline(contactId: string, email: string): Promise<TimelineItem[]> {
  const [msgsQ, repliesQ, leadsQ, notesQ] = await Promise.all([
    supabase.from('outreach_messages').select('subject, status, sent_at, created_at').eq('contact_id', contactId).limit(50),
    email ? supabase.from('replies').select('subject, classification, received_at').eq('from_address', email).limit(50) : Promise.resolve({ data: [] }),
    supabase.from('leads').select('message, source, created_at').eq('contact_id', contactId).limit(50),
    supabase.from('contact_notes').select('body, created_at').eq('contact_id', contactId).limit(50),
  ]);
  return mergeTimeline({
    messages: (msgsQ.data ?? []) as { subject: string | null; status: string; sent_at: string | null; created_at: string }[],
    replies: (repliesQ.data ?? []) as { subject: string | null; classification: string; received_at: string }[],
    leads: (leadsQ.data ?? []) as { message: string | null; source: string; created_at: string }[],
    notes: (notesQ.data ?? []) as { body: string; created_at: string }[],
  });
}
