// src/lib/garvis/prospects/reviewSend.ts
// The REVIEW-BEFORE-SEND path for a cold pitch. buildDemoForReview builds the demo and queues the pitch
// as a PENDING approval without sending; loadPendingPitch pulls the exact email (subject + rendered HTML,
// which already contains the before/after) so the operator can read it; sendPitch fires it through the
// same approve+execute path the Queue uses; discardPitch drops it. Owner-scoped; the send safety gates
// still run inside send-email.

import { supabase } from '../../supabase';
import { approveAndExecute, rejectApproval, type Approval } from '../execution';

export interface PendingPitch {
  approval: Approval;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;   // the real HTML email (screenshot hero + before/after) — null ⇒ text-only pitch
  toEmail: string | null;
  screenshotUrl: string | null;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Build the demo for a prospect and queue the pitch as PENDING (no send). Returns the outcome so the
 *  caller can open the review panel, or surface "no public email found". */
export async function buildDemoForReview(leadId: string): Promise<{ ok: boolean; built: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('standing-worker', { body: { pitch_lead_id: leadId, review: true } });
  const d = data as { ok?: boolean; built?: boolean; error?: string } | null;
  if (error) return { ok: false, built: false, error: error.message };
  return { ok: !!d?.ok, built: !!d?.built, error: d?.error };
}

/** Load the pending pitch (email + its approval) for a demo, so the operator reads it before sending.
 *  Matches the approval to the message by payload.message_id CLIENT-SIDE (robust — no JSONB filter). */
export async function loadPendingPitch(previewSiteId: string | null): Promise<PendingPitch | null> {
  if (!previewSiteId) return null;
  const u = await uid(); if (!u) return null;

  const { data: msg } = await supabase.from('outreach_messages')
    .select('id, subject, body_text, body_html, to_address')
    .eq('owner_id', u).eq('preview_site_id', previewSiteId).eq('status', 'draft')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!msg) return null;
  const m = msg as { id: string; subject: string | null; body_text: string | null; body_html: string | null; to_address: string | null };

  const { data: aps } = await supabase.from('approvals')
    .select('id, kind, title, preview, payload, requested_by, status, result, world_id, created_at, decided_at')
    .eq('owner_id', u).eq('kind', 'send_email').eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(50);
  const ap = ((aps ?? []) as Approval[]).find((a) => (a.payload as { message_id?: string })?.message_id === m.id);
  if (!ap) return null;

  const { data: site } = await supabase.from('preview_sites').select('screenshot_url').eq('id', previewSiteId).maybeSingle();
  return {
    approval: ap,
    subject: m.subject ?? '',
    bodyText: m.body_text ?? '',
    bodyHtml: m.body_html,
    toEmail: m.to_address,
    screenshotUrl: (site as { screenshot_url?: string | null } | null)?.screenshot_url ?? null,
  };
}

/** Send a reviewed pitch — the same approve+execute path the Queue uses, so every send gate still runs. */
export async function sendPitch(approval: Approval): Promise<{ ok: boolean; error?: string }> {
  const r = await approveAndExecute(approval);
  return { ok: r.ok, error: r.error };
}

/** Drop a queued pitch the operator decided not to send. */
export async function discardPitch(approvalId: string): Promise<void> {
  await rejectApproval(approvalId);
}
