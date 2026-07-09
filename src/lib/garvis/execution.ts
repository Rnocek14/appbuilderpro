// src/lib/garvis/execution.ts
// Client seam for the EXECUTION SPINE (app_0022): the ONE approval queue + the ONE execution ledger.
// Anything outward-facing (send_email | publish_post | deploy_site | deploy_backend | spend |
// apply_migration | crm_action) is enqueued as an `approvals` row and executes only after the owner
// approves. Every connector call is written to `execution_runs`. This is the enforcement point for
// the vision's "approval required before sending/posting/deploying/charging + external actions logged".

import { supabase } from '../supabase';

export type ApprovalKind =
  | 'send_email' | 'publish_post' | 'deploy_site' | 'deploy_backend'
  | 'spend' | 'apply_migration' | 'crm_action';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  preview: string;
  payload: Record<string, unknown>;
  requested_by: string;
  status: ApprovalStatus;
  result: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
}

export interface ExecutionRun {
  id: string;
  approval_id: string | null;
  connector: string;
  action: string;
  status: 'ok' | 'failed' | 'retrying' | 'skipped';
  attempt: number;
  error: string | null;
  created_at: string;
}

/** Enqueue an approval. Returns the new row's id. The executor for `kind` acts once it's approved. */
export async function enqueueApproval(input: {
  kind: ApprovalKind;
  title: string;
  preview?: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
}): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('approvals').insert({
    owner_id: uid,
    kind: input.kind,
    title: input.title,
    preview: input.preview ?? '',
    payload: input.payload ?? {},
    requested_by: input.requestedBy ?? 'user',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function listApprovals(status: ApprovalStatus | 'all' = 'pending', limit = 50): Promise<Approval[]> {
  let q = supabase
    .from('approvals')
    .select('id, kind, title, preview, payload, requested_by, status, result, created_at, decided_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Approval[];
}

/**
 * Approve an approval and run its side effect. Routing is explicit and small — each kind maps to the
 * edge function that actually performs it. On success/failure the row is updated; the edge function
 * writes the execution_runs ledger entry.
 */
export async function approveAndExecute(a: Approval): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  // Flip to approved first so the record reflects the decision even if execution then fails.
  await supabase.from('approvals').update({ status: 'approved', decided_at: new Date().toISOString(), decided_via: 'ui' }).eq('id', a.id);

  if (a.kind === 'send_email') {
    const { data, error } = await supabase.functions.invoke('send-email', { body: { approval_id: a.id } });
    if (error) return { ok: false, error: error.message };
    const res = data as { ok?: boolean; error?: string };
    return { ok: !!res?.ok, error: res?.error, result: res };
  }

  // Other kinds (publish_post/deploy_*/…): the DECISION is recorded; execution happens where
  // the capability lives (deploys need the built files, which exist only in the project
  // workspace). Ledger the approved-but-not-executed state honestly — visible, never silent.
  const { data: sess } = await supabase.auth.getUser();
  if (sess.user?.id) {
    await supabase.from('execution_runs').insert({
      owner_id: sess.user.id, approval_id: a.id, connector: 'garvis', action: a.kind,
      status: 'skipped', request: { approval_id: a.id },
      error: 'decision recorded — no server executor for this kind yet; execute from where the capability lives',
    });
  }
  return { ok: true, result: { approved: true } };
}

export async function rejectApproval(id: string): Promise<void> {
  const { error } = await supabase.from('approvals').update({ status: 'rejected', decided_at: new Date().toISOString(), decided_via: 'ui' }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listExecutionRuns(limit = 50): Promise<ExecutionRun[]> {
  const { data, error } = await supabase
    .from('execution_runs')
    .select('id, approval_id, connector, action, status, attempt, error, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExecutionRun[];
}
