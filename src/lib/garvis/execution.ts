// src/lib/garvis/execution.ts
// Client seam for the EXECUTION SPINE (app_0022): the ONE approval queue + the ONE execution ledger.
// Anything outward-facing (send_email | publish_post | deploy_site | deploy_backend | spend |
// apply_migration | crm_action) is enqueued as an `approvals` row and executes only after the owner
// approves. Every connector call is written to `execution_runs`. This is the enforcement point for
// the vision's "approval required before sending/posting/deploying/charging + external actions logged".

import { supabase } from '../supabase';

export type ApprovalKind =
  | 'send_email' | 'publish_post' | 'deploy_site' | 'deploy_backend'
  | 'spend' | 'apply_migration' | 'crm_action' | 'send_batch';
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
  // CAS: claim the approval only while it is still pending. A bare .eq('id') let a stale tab
  // overwrite an already-rejected/expired row and execute it (deep scan P1). If no row is claimed,
  // the decision was already made elsewhere — refuse rather than double-act.
  const { data: claimed, error: claimErr } = await supabase.from('approvals')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decided_via: 'ui' })
    .eq('id', a.id).eq('status', 'pending')
    .select('id').maybeSingle();
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) return { ok: false, error: 'This was already decided elsewhere — refresh the queue.' };

  if (a.kind === 'send_email') {
    const { data, error } = await supabase.functions.invoke('send-email', { body: { approval_id: a.id } });
    if (error) { await revertToPending(a.id); return { ok: false, error: error.message }; }
    const res = data as { ok?: boolean; error?: string };
    // send-email releases its per-approval claim on a soft failure, so a failed send is retryable —
    // return the row to pending instead of stranding it "approved" in History (deep scan P1).
    if (!res?.ok) await revertToPending(a.id);
    return { ok: !!res?.ok, error: res?.error, result: res };
  }

  if (a.kind === 'send_batch') {
    // The CLOCK is the executor: the standing worker re-verifies this approval server-side on
    // every tick and drains the batch through THE ONE SEND PATH — suppression, contact status,
    // kill switch, and the daily cap re-check per recipient at send time. Approving here only
    // records the human decision; nothing sends in this call.
    return { ok: true, result: { approved: true, executed: false, drains: true } };
  }

  // deploy_site: a REAL executor. The build ran client-side; its bundle was captured into
  // deploy_bundles at authorization time (requestSiteDeploy). Load it, deploy via deploy-site,
  // capture the live URL, record it everywhere, and delete the one-shot bundle.
  if (a.kind === 'deploy_site') return await executeSiteDeploy(a);

  // deploy_backend: a REAL executor. Functions + secrets were captured into the approval payload
  // at authorization time (requestBackendDeploy); deploy-backend re-verifies the approval
  // server-side and writes the execution_runs row itself.
  if (a.kind === 'deploy_backend') return await executeBackendDeploy(a);

  // Remaining kinds (publish_post/spend/…): the DECISION is recorded; execution happens
  // where the capability lives (these need a client-built bundle we don't capture yet). Ledger
  // the approved-but-not-executed state honestly — visible, never silent.
  const { data: sess } = await supabase.auth.getUser();
  if (sess.user?.id) {
    const { error } = await supabase.from('execution_runs').insert({
      owner_id: sess.user.id, approval_id: a.id, connector: 'garvis', action: a.kind,
      status: 'skipped', request: { approval_id: a.id },
      error: 'decision recorded — no server executor for this kind yet; execute from where the capability lives',
    });
    if (error) console.warn('decision-ledger insert failed (apply app_0031):', error.message);
  }
  // executed: false — the UI must say "approved", never "executed", for kinds with no executor.
  return { ok: true, result: { approved: true, executed: false } };
}

/** The deploy_site executor. Honest at every branch: a bundle-less approval (e.g. one Garvis
 *  proposed without a build) is recorded as skipped with an actionable reason, never a fake deploy;
 *  a real bundle deploys for real and the live URL flows to the deployments record, the ledger, a
 *  mind_event, and the world's website artifact. */
async function executeSiteDeploy(a: Approval): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const bundleId = a.payload?.bundle_id as string | undefined;
  const projectId = a.payload?.project_id as string | undefined;

  // Skipped decisions are the ONLY thing the client writes to the ledger (app_0031 narrow policy:
  // connector 'garvis' + status 'skipped'). Real ok/failed rows are written SERVER-SIDE by
  // deploy-site — the audit found client 'netlify' rows were silently RLS-rejected, leaving real
  // deploys unlogged.
  const ledger = (error: string, request: Record<string, unknown>) =>
    supabase.from('execution_runs').insert({ owner_id: uid, approval_id: a.id, connector: 'garvis', action: 'deploy_site', status: 'skipped', request, error }).then(() => {}, () => {});

  if (!bundleId || !projectId) {
    await ledger('No build captured for this deploy — open the project workspace and Publish (the build runs in your browser).', { approval_id: a.id });
    return { ok: true, result: { approved: true, executed: false, needsWorkspace: true, projectId } };
  }

  const { data: bundle } = await supabase.from('deploy_bundles')
    .select('files, site_id').eq('id', bundleId).eq('owner_id', uid).maybeSingle();
  if (!bundle) {
    await ledger('The captured build for this deploy is gone (already deployed or expired) — Publish again from the workspace.', { approval_id: a.id, bundle_id: bundleId });
    return { ok: true, result: { approved: true, executed: false } };
  }

  const files = (bundle as { files: unknown }).files;
  const siteId = (bundle as { site_id: string | null }).site_id ?? undefined;
  const { data, error } = await supabase.functions.invoke('deploy-site', {
    body: { approval_id: a.id, projectId, siteId, files, netlifyToken: (a.payload?.netlify_token as string | undefined) },
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok?: boolean; error?: string; siteId?: string; url?: string; state?: string };
  if (res?.error) return { ok: false, error: res.error };

  const url = res?.url ?? null;
  const live = res?.state === 'ready' && !!url;
  // Record the deploy honestly (live only when the host confirmed ready), stamp the approval
  // result, and update the world's website artifact URL. The ok/failed ledger row was written
  // server-side by deploy-site.
  await supabase.from('deployments').insert({
    project_id: projectId, user_id: uid, target: 'netlify',
    status: live ? 'live' : 'building', url, logs: 'Deployed via the approval spine.',
  }).then(() => {}, () => {});
  await supabase.from('approvals').update({ result: { executed: true, url, site_id: res?.siteId ?? siteId ?? null } }).eq('id', a.id);
  if (url) {
    await supabase.from('knowledge_artifacts').update({ url, detail: `Live at ${url}. Re-publish from the project workspace anytime; deploys route through Approvals.` })
      .eq('kind', 'link').eq('slug', 'website-app').eq('owner_id', uid)
      .in('cluster_id', (await clusterIdsForProjectWorld(projectId)) ?? [])
      .then(() => {}, () => {});
  }
  await supabase.from('mind_events').insert({
    owner_id: uid, event_type: 'note', source: 'execution',
    subject: live ? `Published the site — live at ${url}` : 'Published the site — the host is finishing the deploy',
    payload: { project_id: projectId, url },
  }).then(() => {}, () => {});
  // One-shot: the captured build is consumed.
  await supabase.from('deploy_bundles').delete().eq('id', bundleId).then(() => {}, () => {});

  return { ok: !!(res?.ok ?? url), result: { approved: true, executed: true, url, site_id: res?.siteId ?? siteId ?? null } };
}

/** The deploy_backend executor. The functions + secrets were captured into the approval payload at
 *  authorization time; deploy-backend re-verifies the approval and ownership server-side and writes
 *  the execution_runs row itself. Honest at every branch — a payload-less approval is recorded as
 *  skipped with an actionable reason, never a fake deploy. */
async function executeBackendDeploy(a: Approval): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const projectId = a.payload?.project_id as string | undefined;
  const projectRef = a.payload?.project_ref as string | undefined;
  const functions = a.payload?.functions as unknown[] | undefined;
  const secrets = a.payload?.secrets as unknown[] | undefined;

  if (!projectId || !projectRef || (!functions?.length && !secrets?.length)) {
    await supabase.from('execution_runs').insert({
      owner_id: uid, approval_id: a.id, connector: 'garvis', action: 'deploy_backend', status: 'skipped',
      request: { approval_id: a.id },
      error: 'No backend bundle captured for this deploy — open the project workspace and use Deploy backend.',
    }).then(() => {}, () => {});
    return { ok: true, result: { approved: true, executed: false, needsWorkspace: true, projectId } };
  }

  // deploy-backend derives the project ref and reads functions/secrets from the APPROVED payload
  // server-side (deep scan P0) — we send only the identifiers; projectRef/functions/secrets above
  // are used only for the local "nothing captured" guard.
  const { data, error } = await supabase.functions.invoke('deploy-backend', {
    body: { approval_id: a.id, projectId },
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok?: boolean; error?: string; results?: { step: string; ok: boolean; detail?: string }[] };
  if (res?.error) return { ok: false, error: res.error };

  const failed = (res?.results ?? []).filter((r) => !r.ok);
  // Mark executed ONLY on a fully-clean deploy — the server deliberately leaves a partial (207)
  // unconsumed so it stays retryable; stamping executed:true here would defeat that and trip the
  // server's 409 replay guard on retry (deep scan verification).
  await supabase.from('approvals').update({
    result: { executed: !!res?.ok, ok: !!res?.ok, steps: (res?.results ?? []).length, failed: failed.map((f) => f.step) },
  }).eq('id', a.id);
  await supabase.from('mind_events').insert({
    owner_id: uid, event_type: 'note', source: 'execution',
    subject: res?.ok ? 'Deployed the backend (functions + secrets are live)' : `Backend deploy finished with ${failed.length} failed step(s)`,
    payload: { project_id: projectId, failed: failed.map((f) => f.step) },
  }).then(() => {}, () => {});

  return res?.ok
    ? { ok: true, result: { approved: true, executed: true, results: res?.results } }
    : { ok: false, error: `Backend deploy: ${failed.map((f) => `${f.step} — ${f.detail ?? 'failed'}`).join('; ').slice(0, 400)}`, result: { approved: true, executed: true, results: res?.results } };
}

/** The cluster ids of the world a project is bound to (for updating its website-app artifact). */
async function clusterIdsForProjectWorld(projectId: string): Promise<string[] | null> {
  const { data: proj } = await supabase.from('projects').select('world_id').eq('id', projectId).maybeSingle();
  const worldId = (proj as { world_id: string | null } | null)?.world_id;
  if (!worldId) return null;
  const { data: clusters } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId);
  return (clusters ?? []).map((c) => (c as { id: string }).id);
}

/** Return an approval to the pending lane (used when execution soft-fails, so it can be retried). */
async function revertToPending(id: string): Promise<void> {
  await supabase.from('approvals').update({ status: 'pending', decided_at: null }).eq('id', id).then(() => {}, () => {});
}

export async function rejectApproval(id: string): Promise<void> {
  // CAS on pending (deep scan P1: a bare .eq('id') let a stale tab flip an already-decided row and
  // falsify the record). Only a still-pending approval can be rejected.
  const { data: rejected, error } = await supabase.from('approvals')
    .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_via: 'ui' })
    .eq('id', id).eq('status', 'pending')
    .select('id, kind, payload').maybeSingle();
  if (error) throw new Error(error.message);
  if (!rejected) throw new Error('This was already decided elsewhere — refresh the queue.');

  // If this was the INITIAL invoice send, the invoice was optimistically stamped 'sent' at queue
  // time. Rejecting it means it never went out — return it to draft so it doesn't linger as "sent"
  // forever and the chaser stops treating it as delivered (deep scan theme 3). Crucially, only the
  // initial send reverts: chase reminders (payload.chase_stage set) exist ONLY for an
  // already-sent, still-owed invoice, so rejecting a reminder must never demote that invoice.
  const inv = (rejected as { kind: string; payload: Record<string, unknown> | null });
  const isInitialInvoiceSend = inv.kind === 'send_email' && inv.payload?.invoice_id != null && inv.payload?.chase_stage == null;
  const invoiceId = isInitialInvoiceSend ? (inv.payload?.invoice_id as string) : undefined;
  if (invoiceId) {
    await supabase.from('invoices').update({ status: 'draft', sent_at: null, updated_at: new Date().toISOString() })
      .eq('id', invoiceId).eq('status', 'sent').then(() => {}, () => {});
  }
}

/** Undo a REJECTION — the row returns to pending. Only rejected rows reopen (an approved row has
 *  already executed; there is no honest undo for a consequence, so none is offered). */
export async function reopenApproval(id: string): Promise<void> {
  const { error } = await supabase.from('approvals')
    .update({ status: 'pending', decided_at: null })
    .eq('id', id).eq('status', 'rejected');
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
