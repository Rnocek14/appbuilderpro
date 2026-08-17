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

export interface RepoFile { path: string; content: string }

/** Ship source to GitHub THROUGH the spine (SW10.1): capture the snapshot + create the approval,
 *  then execute it (the operator clicking Export is their approval — the publishThroughSpine
 *  pattern). github-export re-verifies everything server-side and resolves the token there. */
export async function shipRepoThroughSpine(input: {
  projectId: string; repo: string; files: RepoFile[];
}): Promise<{ url: string | null }> {
  const approvalId = await requestRepoShip(input);
  const { data } = await supabase.from('approvals').select(APPROVAL_COLS).eq('id', approvalId).single();
  const res = await approveAndExecute(data as unknown as Approval);
  if (!res.ok) throw new Error(res.error ?? 'Export failed.');
  return { url: (res.result as { url?: string } | undefined)?.url ?? null };
}

/** Capture a source snapshot + enqueue a ship_repo approval bound to its hash. Returns the
 *  approval id. The payload pins {project_id, repo, files_hash}; the executor re-derives the
 *  hash from the captured bundle and refuses on any drift (tamper → 409). */
export async function requestRepoShip(input: {
  projectId: string; repo: string; files: RepoFile[];
}): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.files.length) throw new Error('No files to export.');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.repo)) throw new Error('That repo name is invalid.');
  // Secrets never ride to GitHub — refuse at capture, not just server-side.
  if (input.files.some((f) => /(^|\/)\.env$|(^|\/)\.fableforge\//.test(f.path))) {
    throw new Error('The snapshot contains secret-bearing paths (.env / .fableforge) — these never ship to GitHub.');
  }
  const filesHash = await hashPayload(input.files);

  const { data: bundle, error: bErr } = await supabase.from('deploy_bundles').insert({
    owner_id: uid, project_id: input.projectId, site_id: null,
    files: input.files, file_count: input.files.length,
  }).select('id').single();
  if (bErr || !bundle) throw new Error(`Could not stage the export: ${bErr?.message ?? 'unknown error'}`);

  const bundleId = (bundle as { id: string }).id;
  try {
    return await enqueueApproval({
      kind: 'ship_repo',
      title: `Ship code to GitHub (${input.repo})`,
      preview: `Push ${input.files.length} source file${input.files.length === 1 ? '' : 's'} to the private repo "${input.repo}" on your connected GitHub account. The token stays server-side.`,
      payload: { project_id: input.projectId, repo: input.repo, bundle_id: bundleId, files_hash: filesHash },
      requestedBy: 'user',
    });
  } catch (e) {
    // The bundle only exists to serve its approval — do not strand snapshots on enqueue failure.
    await supabase.from('deploy_bundles').delete().eq('id', bundleId);
    throw e;
  }
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
