// src/lib/garvis/outreach.ts
// Client seam that JOINS the two halves of the outreach loop: the preview engine (generates a website
// + pitch) and the send path (send-email, gated by an approval). "Queue send" on a preview turns the
// generated pitch into a real outreach_message + campaign + approval — replacing the old
// copy-to-clipboard dead end (docs/garvis-system-architecture.md §6 Workflow B, §10).

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';

export interface QueuePitchInput {
  previewSiteId: string;
  businessProfileId: string | null;
  businessName: string;
  industry: string;
  pitch: string;
  previewUrl: string;
  toEmail: string;
}

/** Look up the contact email stored on a business profile's JSON (from the scraper handoff). */
export async function lookupProfileEmail(businessProfileId: string | null): Promise<string | null> {
  if (!businessProfileId) return null;
  const { data } = await supabase.from('business_profiles').select('profile').eq('id', businessProfileId).maybeSingle();
  const profile = (data?.profile ?? {}) as { email?: string; contact_email?: string };
  return (profile.email ?? profile.contact_email ?? null)?.toLowerCase().trim() || null;
}

/**
 * Create contact → campaign → message → approval for a generated preview. Nothing sends here — the
 * approval lands in the queue; approving it runs send-email with all safety gates. Returns the
 * approval id.
 */
export async function queuePitch(input: QueuePitchInput): Promise<{ approvalId: string; messageId: string }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const to = input.toEmail.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Enter a valid recipient email.');

  // Atomic upsert on (owner_id, email) — race-free thanks to uq_contacts_owner_email (app_0025).
  const { data: c, error: cErr } = await supabase.from('contacts').upsert({
    owner_id: uid, business_profile_id: input.businessProfileId, email: to,
    email_status: 'unknown', is_primary: true,
  }, { onConflict: 'owner_id,email' }).select('id').single();
  if (cErr || !c) throw new Error(cErr?.message ?? 'Could not save the contact.');
  const contactId = (c as { id: string }).id;

  const { data: camp, error: campErr } = await supabase.from('outreach_campaigns').insert({
    owner_id: uid, business_profile_id: input.businessProfileId, contact_id: contactId,
    preview_site_id: input.previewSiteId, kind: 'cold_site_pitch', state: 'pending_approval',
  }).select('id').single();
  if (campErr) throw new Error(campErr.message);
  const campaignId = (camp as { id: string }).id;

  const subject = `A new website for ${input.businessName}`;
  const body = `${input.pitch.trim()}\n\nTake a look: ${input.previewUrl}`;

  const { data: msg, error: msgErr } = await supabase.from('outreach_messages').insert({
    owner_id: uid, campaign_id: campaignId, contact_id: contactId, preview_site_id: input.previewSiteId,
    sequence_step: 0, subject, body_text: body, to_address: to, status: 'draft',
  }).select('id').single();
  if (msgErr) throw new Error(msgErr.message);
  const messageId = (msg as { id: string }).id;

  const approvalId = await enqueueApproval({
    kind: 'send_email',
    title: `Pitch "${input.businessName}" → ${to}`,
    preview: `${subject}\n\n${body}`,
    payload: { message_id: messageId, campaign_id: campaignId },
  });

  return { approvalId, messageId };
}
