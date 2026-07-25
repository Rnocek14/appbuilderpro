// src/lib/garvis/clients/changeRequestsRun.ts
// IMPURE half of the change-request noun (app_0117): create, transition, link, attribute, list.
// The pure core (changeRequests.ts) owns the lifecycle; this file only moves rows through it.
// Fail-soft ONLY on the ledger write (minutes/cost attribution) — the work that incurred a cost
// must never fail because its ledger entry didn't land. Everything else throws honestly: a change
// request that silently failed to record is exactly the audit finding this slice exists to fix.

import { supabase } from '../../supabase';
import {
  appendHistory, canTransition, type ChangeRequestStatus, type HistoryEntry,
} from './changeRequests';

export type ChangeRequestSource = 'operator' | 'client_email' | 'portal';
export type ChangeRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ChangeRequestRow {
  id: string;
  world_id: string;
  client_subscription_id: string | null;
  source: ChangeRequestSource;
  requester: string | null;
  request: string;
  affected_url: string | null;
  priority: ChangeRequestPriority;
  status: ChangeRequestStatus;
  needs_approval: boolean;
  received_at: string;
  closed_at: string | null;
  minutes_spent: number;
  cost_usd: number;
  history: HistoryEntry[];
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const u = data.user?.id;
  if (!u) throw new Error('Not signed in.');
  return u;
}

/** Record a new request as 'received' with its history seeded. worldId is REQUIRED and enforced
 *  here, not just by the NOT NULL column: change requests are world-scoped BY CONSTRUCTION (scope
 *  contract) — a request always belongs to a client, and throwing early gives the caller a bug
 *  report instead of a constraint violation from three layers down. */
export async function createChangeRequest(input: {
  worldId: string;
  clientSubscriptionId?: string | null;
  source: ChangeRequestSource;
  requester?: string | null;
  request: string;
  affectedUrl?: string | null;
  priority?: ChangeRequestPriority;
}): Promise<{ id: string }> {
  if (!input.worldId) {
    throw new Error('createChangeRequest: worldId is required — change requests are world-scoped by construction (scopeContract.ts).');
  }
  const u = await uid();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase.from('change_requests').insert({
    owner_id: u,
    world_id: input.worldId,
    client_subscription_id: input.clientSubscriptionId ?? null,
    source: input.source,
    requester: input.requester ?? null,
    request: input.request,
    affected_url: input.affectedUrl ?? null,
    priority: input.priority ?? 'normal',
    status: 'received',
    // Seed the trail at birth (from:null — there was no prior state) so even a request that never
    // moves again carries WHEN and HOW it arrived.
    history: appendHistory([], null, 'received', `intake via ${input.source}`, nowIso),
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

/** Move a request one legal step. The pure core is the single authority on legality — an illegal
 *  jump throws loudly, because a soft skip would leave the row lying about its state. Stamps
 *  closed_at on BOTH terminals: a decline ends the clock the same as a close, so aging and
 *  time-to-resolution stay honest either way. */
export async function transitionChangeRequest(
  id: string, to: ChangeRequestStatus, note?: string | null,
): Promise<{ from: ChangeRequestStatus; to: ChangeRequestStatus }> {
  const u = await uid();
  const { data: rowData, error: loadErr } = await supabase.from('change_requests')
    .select('status, needs_approval, history')
    .eq('owner_id', u).eq('id', id).maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  const row = rowData as { status: ChangeRequestStatus; needs_approval: boolean; history: HistoryEntry[] } | null;
  if (!row) throw new Error(`Change request ${id} not found.`);
  const from = row.status;
  if (!canTransition(from, to, row.needs_approval)) {
    throw new Error(`Illegal transition ${from} → ${to}${row.needs_approval ? ' (this request needs explicit approval)' : ''}.`);
  }
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: to,
    history: appendHistory(Array.isArray(row.history) ? row.history : [], from, to, note ?? null, nowIso),
  };
  if (to === 'closed' || to === 'declined') patch.closed_at = nowIso;
  const { error: upErr } = await supabase.from('change_requests').update(patch).eq('owner_id', u).eq('id', id);
  if (upErr) throw new Error(upErr.message);
  return { from, to };
}

/** Attach the downstream objects a request caused, only the ones provided — links accrete as the
 *  work progresses (mission when spun up, approval when gated, deploy run when shipped, rollback
 *  ref for act-with-undo, notify message when the client hears back). This is what lets one row
 *  answer "what did this request actually cause?" at offboarding time. */
export async function linkChangeRequest(id: string, links: {
  missionId?: string;
  approvalId?: string;
  deployExecutionId?: string;
  rollbackRef?: string;
  notifyMessageId?: string;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (links.missionId !== undefined) patch.mission_id = links.missionId;
  if (links.approvalId !== undefined) patch.approval_id = links.approvalId;
  if (links.deployExecutionId !== undefined) patch.deploy_execution_id = links.deployExecutionId;
  if (links.rollbackRef !== undefined) patch.rollback_ref = links.rollbackRef;
  if (links.notifyMessageId !== undefined) patch.notify_message_id = links.notifyMessageId;
  if (!Object.keys(patch).length) return;   // nothing to link is not an error
  const u = await uid();
  const { error } = await supabase.from('change_requests').update(patch).eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Increment the time/cost this request has consumed. FAIL-SOFT by design: this is the ledger
 *  write — the deploy or mission that incurred the cost must never fail because its accounting
 *  didn't land (a missed increment is an attribution gap, re-attributable later; the client's
 *  change is not re-doable). Read-modify-write, not atomic: a single-operator tool where two
 *  simultaneous attributions to one request don't happen in practice — worth noting, not fixing. */
export async function attributeToRequest(id: string, delta: { minutes?: number; costUsd?: number }): Promise<void> {
  const minutes = Math.max(0, Math.round(delta.minutes ?? 0));
  const costUsd = Math.max(0, delta.costUsd ?? 0);
  if (!minutes && !costUsd) return;
  try {
    const { data: sess } = await supabase.auth.getUser();
    const u = sess.user?.id;
    if (!u) return;
    const { data } = await supabase.from('change_requests')
      .select('minutes_spent, cost_usd').eq('owner_id', u).eq('id', id).maybeSingle();
    const row = data as { minutes_spent: number; cost_usd: number } | null;
    if (!row) return;
    await supabase.from('change_requests').update({
      minutes_spent: (row.minutes_spent ?? 0) + minutes,
      // numeric(10,4) in the schema — round to it so float dust never rejects the write.
      cost_usd: Number(((Number(row.cost_usd) || 0) + costUsd).toFixed(4)),
    }).eq('owner_id', u).eq('id', id);
  } catch { /* fail-soft: the ledger can catch up; the work cannot be un-incurred */ }
}

/** The triage queue: open requests (mirrors isOpen — not closed/declined), oldest first so what
 *  has waited longest surfaces on top. Optionally scoped to one client's world. Fail-soft to []:
 *  a queue that errors before the migration lands should read as empty, not broken. */
export async function listOpenRequests(worldId?: string): Promise<ChangeRequestRow[]> {
  const { data: sess } = await supabase.auth.getUser();
  const u = sess.user?.id;
  if (!u) return [];
  let q = supabase.from('change_requests')
    .select('id, world_id, client_subscription_id, source, requester, request, affected_url, priority, status, needs_approval, received_at, closed_at, minutes_spent, cost_usd, history')
    .eq('owner_id', u)
    .not('status', 'in', '(closed,declined)')
    .order('received_at', { ascending: true });
  if (worldId) q = q.eq('world_id', worldId);
  const { data } = await q;
  return (data ?? []) as ChangeRequestRow[];
}
