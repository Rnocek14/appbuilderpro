// src/lib/garvis/deployRun.ts
// The deploy request seam — turns a client-built site bundle into an approval-gated, executable
// deploy. The build runs in the browser (WebContainer); this captures the built files into
// deploy_bundles and enqueues a deploy_site approval that references them. approveAndExecute
// (execution.ts) then loads the bundle and calls the deploy-site edge function — so the deploy is
// real, server-executed on approval, and recorded in the one execution ledger. Nothing ships
// without sign-off, and the bytes are the real build (no server build needed).

import { supabase } from '../supabase';
import { enqueueApproval, approveAndExecute, type Approval } from './execution';
import { hashPayload } from './payloadHash';

export interface SiteFile { path: string; b64: string; sha1: string }

const APPROVAL_COLS = 'id, kind, title, preview, payload, requested_by, status, result, created_at, decided_at';

/** Publish now, THROUGH the spine: capture the bundle + create the approval, then execute it
 *  immediately (the operator clicking Publish is their approval). The deploy is real (executor
 *  calls deploy-site) and fully recorded — the same path a queued approval takes, minus the wait.
 *  Returns the live URL (or null while the host finishes). */
export async function publishThroughSpine(input: {
  projectId: string; files: SiteFile[]; siteId?: string | null; netlifyToken?: string | null;
}): Promise<{ url: string | null; siteId: string | null }> {
  const approvalId = await requestSiteDeploy(input);
  const { data } = await supabase.from('approvals').select(APPROVAL_COLS).eq('id', approvalId).single();
  const approval = data as unknown as Approval;
  const res = await approveAndExecute(approval);
  if (!res.ok) throw new Error(res.error ?? 'Deploy failed.');
  const r = res.result as { url?: string | null; site_id?: string | null } | undefined;
  return { url: r?.url ?? null, siteId: r?.site_id ?? null };
}

/** Publish the BACKEND through the spine: capture functions + secrets into the approval payload,
 *  approve, and execute (deploy-backend re-verifies the approval server-side and writes the
 *  ledger row). The operator clicking Deploy is their approval — same pattern as publishThroughSpine. */
export async function deployBackendThroughSpine(input: {
  projectId: string; projectRef: string;
  functions: { slug: string; source: string; verifyJwt?: boolean }[];
  secrets: { name: string; value: string }[];
}): Promise<{ ok: boolean; results?: { step: string; ok: boolean; detail?: string }[]; error?: string }> {
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user?.id) throw new Error('Not signed in.');
  if (!input.functions.length && !input.secrets.length) throw new Error('Nothing to deploy — no functions or secrets.');

  const approvalId = await enqueueApproval({
    kind: 'deploy_backend',
    title: `Deploy backend (${input.functions.length} function${input.functions.length === 1 ? '' : 's'}, ${input.secrets.length} secret${input.secrets.length === 1 ? '' : 's'})`,
    preview: `Deploy ${input.functions.map((f) => f.slug).join(', ') || 'secrets only'} to the project's Supabase. Runs server-side with the Management token.`,
    payload: {
      project_id: input.projectId, project_ref: input.projectRef,
      functions: input.functions, secrets: input.secrets,
    },
    requestedBy: 'user',
  });
  const { data } = await supabase.from('approvals').select(APPROVAL_COLS).eq('id', approvalId).single();
  const res = await approveAndExecute(data as unknown as Approval);
  const r = res.result as { results?: { step: string; ok: boolean; detail?: string }[] } | undefined;
  return { ok: res.ok, results: r?.results, error: res.error };
}

/** Capture a built bundle + enqueue a deploy_site approval for it. Returns the approval id. The
 *  optional netlifyToken is passed through the approval payload (self-serve hosting) — it's the
 *  user's own token, kept only in their owner-scoped approval row, never shipped to others. */
export async function requestSiteDeploy(input: {
  projectId: string; files: SiteFile[]; siteId?: string | null; netlifyToken?: string | null; label?: string;
}): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.files.length) throw new Error('No built files to deploy.');
  const bundleHash = await hashPayload(input.files);

  const { data: bundle, error: bErr } = await supabase.from('deploy_bundles').insert({
    owner_id: uid, project_id: input.projectId, site_id: input.siteId ?? null,
    files: input.files, file_count: input.files.length,
  }).select('id').single();
  if (bErr || !bundle) throw new Error(`Could not stage the deploy: ${bErr?.message ?? 'unknown error'}`);

  const bundleId = (bundle as { id: string }).id;
  try {
    return await enqueueApproval({
      kind: 'deploy_site',
      title: input.label ?? `Publish site (${input.files.length} files)`,
      preview: `Deploy ${input.files.length} built files to hosting for this project. A live https URL is returned on success.`,
      payload: {
        bundle_id: bundleId,
        bundle_hash: bundleHash,
        project_id: input.projectId,
        site_id: input.siteId ?? null,
        ...(input.netlifyToken ? { netlify_token: input.netlifyToken } : {}),
      },
      requestedBy: 'user',
    });
  } catch (e) {
    // The bundle only exists to serve its approval. Do not strand large base64 blobs when the
    // approval insert fails.
    await supabase.from('deploy_bundles').delete().eq('id', bundleId);
    throw e;
  }
}
