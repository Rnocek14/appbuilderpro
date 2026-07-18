// src/lib/garvis/contentWeekRun.ts
// Client half of the content-week producer (app_0088). The ORDER is created here (weekly cadence,
// first run NOW so turning it on produces same-day evidence); the WORKER stages the judged week;
// the owner reviews/edits pieces here (editing re-hashes the pending approval so the drain's
// tamper check keeps holding); graduated autonomy is granted here — and ONLY after the streak
// earned it. Nothing in this file posts or sends.

import { supabase } from '../supabase';
import { hashPayload } from './payloadHash';
import { nextRunAfter, type ContentWeekConfig, type StandingOrder } from './standing';

export type { ContentWeekConfig };

export interface WeekPiece {
  id: string; channel: 'social' | 'email'; platform?: string | null;
  caption?: string; hashtags?: string[]; subject?: string; body?: string; segment?: string | null;
  media_urls?: string[]; scheduled_for: string; quality: { score: number; notes: string };
  state: 'staged' | 'queued' | 'skipped' | 'done'; reason?: string;
  social_post_id?: string; batch_id?: string;
}
export interface ContentWeekRow {
  id: string; order_id: string | null; world_id: string | null; week_start: string;
  pieces: WeekPiece[]; discards: unknown[]; status: 'staged' | 'queued' | 'done' | 'canceled';
  approval_id: string | null; edited: boolean; created_at: string;
}

const WEEK_COLS = 'id, order_id, world_id, week_start, pieces, discards, status, approval_id, edited, created_at';

/** Turn the producer on: a weekly order whose first run is NOW (same-day evidence it works). */
export async function createContentWeekOrder(input: { worldId: string; config: ContentWeekConfig }): Promise<StandingOrder> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const nowIso = new Date().toISOString();
  const label = `Content week: ${input.config.postsPerWeek} post${input.config.postsPerWeek === 1 ? '' : 's'}${input.config.emailSegment ? ' + email' : ''}`;
  const { data, error } = await supabase.from('standing_orders').insert({
    owner_id: uid, world_id: input.worldId, kind: 'content_week', label,
    cadence: 'weekly', config: input.config as unknown as Record<string, unknown>,
    status: 'active', anchor_at: nowIso, next_run_at: nowIso,
  }).select('id, world_id, kind, label, cadence, config, status, anchor_at, next_run_at, last_run_at, last_result').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not start the content week.');
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string, kind: 'content_week', label: r.label as string, cadence: 'weekly',
    config: (r.config as Record<string, unknown>) ?? {}, status: r.status as 'active' | 'paused',
    nextRunAt: r.next_run_at as string, lastRunAt: (r.last_run_at as string | null), lastResult: null,
  };
}

export async function listContentWeeks(worldId: string, limit = 6): Promise<ContentWeekRow[]> {
  const { data, error } = await supabase.from('content_weeks').select(WEEK_COLS)
    .eq('world_id', worldId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentWeekRow[];
}

/** Edit one staged piece before approving. Marks the week edited (which resets the clean streak on
 *  approval — an edited week is not a "clean" one), and while the approval is still PENDING,
 *  re-hashes payload.pieces_hash so the drain's tamper check verifies the EDITED content. An
 *  already-approved week refuses: the decision covered different words. */
export async function editContentWeekPiece(
  weekId: string, pieceId: string, patch: Partial<Pick<WeekPiece, 'caption' | 'hashtags' | 'subject' | 'body'>>,
): Promise<void> {
  const { data: wk, error } = await supabase.from('content_weeks')
    .select('id, pieces, status, approval_id').eq('id', weekId).maybeSingle();
  if (error || !wk) throw new Error(error?.message ?? 'Week not found.');
  if ((wk as { status: string }).status !== 'staged') throw new Error('Only a still-staged week can be edited.');

  const approvalId = (wk as { approval_id: string | null }).approval_id;
  if (approvalId) {
    const { data: ap } = await supabase.from('approvals').select('status, payload').eq('id', approvalId).maybeSingle();
    if (ap && (ap as { status: string }).status !== 'pending') {
      throw new Error('This week was already decided — the decision covered the original words. Reject it first to edit.');
    }
  }

  const pieces = ((wk as { pieces: WeekPiece[] }).pieces ?? []).map((p) =>
    p.id === pieceId && p.state === 'staged' ? { ...p, ...patch } : p,
  );
  const { error: upErr } = await supabase.from('content_weeks')
    .update({ pieces, edited: true }).eq('id', weekId).eq('status', 'staged');
  if (upErr) throw new Error(upErr.message);

  // Re-bind the pending approval to the edited content — the drain verifies pieces_hash, so a
  // stale hash would (correctly) refuse to execute; this keeps decision and content in lockstep.
  if (approvalId) {
    const { data: ap } = await supabase.from('approvals').select('payload, status').eq('id', approvalId).maybeSingle();
    if (ap && (ap as { status: string }).status === 'pending') {
      const payload = { ...((ap as { payload: Record<string, unknown> }).payload ?? {}), pieces_hash: await hashPayload(pieces) };
      const payload_hash = await hashPayload(payload);
      await supabase.from('approvals').update({ payload, payload_hash }).eq('id', approvalId).eq('status', 'pending');
    }
  }
}

/** Cancel a still-staged week — its approval is rejected too, so the record shows the decision. */
export async function cancelContentWeek(weekId: string): Promise<void> {
  const { data, error } = await supabase.from('content_weeks')
    .update({ status: 'canceled', finished_at: new Date().toISOString() })
    .eq('id', weekId).eq('status', 'staged').select('approval_id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Only a still-staged week can be canceled.');
  const approvalId = (data as { approval_id: string | null }).approval_id;
  if (approvalId) {
    await supabase.from('approvals')
      .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_via: 'ui' })
      .eq('id', approvalId).eq('status', 'pending').then(() => {}, () => {});
  }
}

/** Grant or revoke auto-mode. Granting requires the EARNED streak (3 clean weeks) — enforced here
 *  AND surfaced in the UI; revoking is always allowed and instant. */
export async function setContentWeekAutoMode(orderId: string, on: boolean): Promise<void> {
  if (on) {
    const { data } = await supabase.from('standing_orders').select('clean_approvals').eq('id', orderId).maybeSingle();
    const streak = (data as { clean_approvals?: number } | null)?.clean_approvals ?? 0;
    if (streak < 3) throw new Error(`Auto-mode is earned: ${streak}/3 clean weeks approved without edits so far.`);
  }
  const { error } = await supabase.from('standing_orders')
    .update({ auto_mode: on, updated_at: new Date().toISOString() }).eq('id', orderId);
  if (error) throw new Error(error.message);
}

/** The order's streak/auto state for the toggle UI. */
export async function contentWeekOrderState(worldId: string): Promise<{
  orderId: string; status: 'active' | 'paused'; cleanApprovals: number; autoMode: boolean;
} | null> {
  const { data } = await supabase.from('standing_orders')
    .select('id, status, clean_approvals, auto_mode').eq('kind', 'content_week').eq('world_id', worldId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const r = data as { id: string; status: 'active' | 'paused'; clean_approvals: number; auto_mode: boolean };
  return { orderId: r.id, status: r.status, cleanApprovals: r.clean_approvals ?? 0, autoMode: !!r.auto_mode };
}

// Re-exported so the toggle can compute "next Monday" copy without importing standingCore directly.
export { nextRunAfter };
