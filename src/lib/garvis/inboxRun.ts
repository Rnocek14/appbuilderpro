// src/lib/garvis/inboxRun.ts
// The OPS INBOX — the one place to read what came IN (email replies + website leads) and answer
// it, across all worlds. Reading is direct row reads; answering routes through the SAME approval
// spine + send-email executor as everything else (a reply is a real outreach_message the owner
// approves), so nothing goes out unreviewed and suppression stays sacred.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';

export interface InboxReply {
  kind: 'reply'; id: string; from: string; subject: string; body: string;
  classification: string; campaignId: string | null; at: string;
}
export interface InboxLead {
  kind: 'lead'; id: string; name: string | null; email: string; message: string | null;
  source: string; worldId: string; status: string; contactId: string | null; at: string;
}
export type InboxItem = InboxReply | InboxLead;

/** Everything that came in, newest first — replies and leads merged into one cross-world stream.
 *  Handled replies (app_0050 handled_at) leave the lane: done = gone, like any inbox. The replies
 *  select is '*' + a client-side filter so a server that pre-dates the column still loads. */
export async function loadInbox(limit = 40): Promise<InboxItem[]> {
  const [repliesQ, leadsQ] = await Promise.all([
    supabase.from('replies')
      .select('*')
      .order('received_at', { ascending: false }).limit(limit),
    supabase.from('leads')
      .select('id, name, email, message, source, world_id, status, contact_id, created_at')
      .neq('status', 'spam').order('created_at', { ascending: false }).limit(limit),
  ]);
  const replies: InboxItem[] = ((repliesQ.data ?? []) as Record<string, unknown>[])
    .filter((r) => !r.handled_at)
    .map((r) => ({
      kind: 'reply', id: r.id as string, from: (r.from_address as string) ?? '',
      subject: (r.subject as string) ?? '', body: (r.body_text as string) ?? '',
      classification: (r.classification as string) ?? 'neutral',
      campaignId: (r.campaign_id as string | null) ?? null, at: r.received_at as string,
    }));
  const leads: InboxItem[] = ((leadsQ.data ?? []) as Record<string, unknown>[]).map((l) => ({
    kind: 'lead', id: l.id as string, name: (l.name as string | null) ?? null,
    email: (l.email as string) ?? '', message: (l.message as string | null) ?? null,
    source: (l.source as string) ?? 'website', worldId: (l.world_id as string) ?? '',
    status: (l.status as string) ?? 'new', contactId: (l.contact_id as string | null) ?? null,
    at: l.created_at as string,
  }));
  return [...replies, ...leads].sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Compose a reply to a reply/lead. Creates a real outreach_message and enqueues a send_email
 *  approval — the SAME gate + executor as every other send, so the message never goes out
 *  unreviewed. Contact is select-first-insert (never resets a suppressed status). Returns the
 *  approval id. */
export async function composeReply(input: {
  to: string; toName?: string | null; subject: string; body: string; worldId?: string | null;
}): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const to = input.to.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Enter a valid recipient email.');
  const subject = input.subject.trim() || '(no subject)';
  const body = input.body.trim();
  if (body.length < 2) throw new Error('Write a message before sending.');

  // Contact: select-first, insert-if-missing — never an overwriting upsert (suppression is sacred).
  let contactId: string;
  const { data: existing } = await supabase.from('contacts')
    .select('id, email_status').eq('owner_id', uid).eq('email', to).maybeSingle();
  if (existing) {
    const st = (existing as { email_status: string }).email_status;
    if (['unsubscribed', 'bounced', 'complained', 'invalid'].includes(st)) {
      throw new Error(`This contact is marked ${st} — Garvis won't send to them.`);
    }
    contactId = (existing as { id: string }).id;
  } else {
    const { data: c, error: cErr } = await supabase.from('contacts')
      .insert({ owner_id: uid, email: to, full_name: input.toName ?? null, email_status: 'unknown', is_primary: false })
      .select('id').single();
    if (cErr || !c) throw new Error(`Could not save the contact: ${cErr?.message ?? 'unknown error'}`);
    contactId = (c as { id: string }).id;
  }

  // A standalone reply campaign so the send has a home (state marks it a one-off, cron won't touch).
  const { data: camp, error: campErr } = await supabase.from('outreach_campaigns').insert({
    owner_id: uid, world_id: input.worldId ?? null, contact_id: contactId,
    kind: 'reply', state: 'pending_approval', sequence_stopped: true,
  }).select('id').single();
  if (campErr || !camp) throw new Error(`Could not start the reply: ${campErr?.message ?? 'unknown error'}`);
  const campaignId = (camp as { id: string }).id;

  const { data: msg, error: mErr } = await supabase.from('outreach_messages').insert({
    owner_id: uid, campaign_id: campaignId, contact_id: contactId,
    sequence_step: 0, subject, body_text: body, to_address: to, status: 'draft',
  }).select('id').single();
  if (mErr || !msg) throw new Error(`Could not draft the reply: ${mErr?.message ?? 'unknown error'}`);
  const messageId = (msg as { id: string }).id;

  return enqueueApproval({
    kind: 'send_email',
    title: `Reply → ${to}`,
    preview: `${subject}\n\n${body}`,
    payload: { message_id: messageId, campaign_id: campaignId },
    requestedBy: 'user',
  });
}

/** Mark a website lead as answered (its own lifecycle, unchanged by the reply path). */
export async function markLeadAnswered(id: string): Promise<void> {
  const { error } = await supabase.from('leads').update({ status: 'contacted' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Mark a reply handled (answered elsewhere, or simply dealt with) — it leaves the Messages lane
 *  and stops counting on the Inbox badge. Never deletes; the row stays on the record. */
export async function markReplyHandled(id: string): Promise<void> {
  const { error } = await supabase.from('replies').update({ handled_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Undo for "done" — the reply returns to the lane. */
export async function unmarkReplyHandled(id: string): Promise<void> {
  const { error } = await supabase.from('replies').update({ handled_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Undo for a lead marked answered — it returns to the new-lead lane (and the waking move). */
export async function reopenLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').update({ status: 'new' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Grounding for the reply drafter — what the record already knows about this correspondent:
 *  their pipeline stage (so the draft matches the relationship) and the most recent email the
 *  owner actually APPROVED and sent (tone example — your voice, not a model's guess). Fail-soft:
 *  any miss returns nulls and the drafter grounds in the thread alone, as before. */
export async function draftContext(email: string): Promise<{ stage: string | null; name: string | null; toneExample: string | null }> {
  const out: { stage: string | null; name: string | null; toneExample: string | null } = { stage: null, name: null, toneExample: null };
  try {
    const { data: c } = await supabase.from('contacts')
      .select('full_name, stage').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (c) { out.stage = (c as { stage?: string | null }).stage ?? null; out.name = (c as { full_name?: string | null }).full_name ?? null; }
  } catch { /* grounding is optional */ }
  try {
    const { data: m } = await supabase.from('outreach_messages')
      .select('body_text').eq('status', 'sent').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const body = (m as { body_text?: string | null } | null)?.body_text ?? null;
    if (body && body.length > 40) out.toneExample = body.slice(0, 600);
  } catch { /* grounding is optional */ }
  return out;
}
