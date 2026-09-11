// supabase/functions/github-export/index.ts
// The ship_repo EXECUTOR (SW10.1): export a project's source to a real GitHub repo — but only
// through the approval spine. The old door (a raw {files, repo} request body) is CLOSED: this
// function loads EVERYTHING from the approved, payload-hashed row and its captured bundle, so
// what ships is exactly what was reviewed. The GitHub token is resolved server-side at execution
// time (the caller's connected OAuth, else the operator's GITHUB_TOKEN secret) — the request-body
// token passthrough is gone.
//
// Gate order mirrors deploy-site: auth → approval (kind/status/owner) → payload_hash 409 →
// replay short-circuit → bundle load + files_hash 409 → forbidden-path refuse → single-flight
// claim → execute → ledger + result stamp + one-shot bundle delete.
//
// Auth: authenticated FableForge user who owns the approval and its project.
//
// ONE-TIME SETUP:
//   supabase functions deploy github-export --project-ref <ref>
//   supabase secrets set GITHUB_TOKEN=<a GitHub PAT with `repo` scope>   (fallback token)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { freshProviderToken } from '../_shared/oauth.ts';
import { hashPayload, payloadMatches } from '../_shared/payloadHash.ts';

interface RepoFile { path: string; content: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let releaseExecutionClaim: ((extra?: Record<string, unknown>) => Promise<void>) | null = null;
  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // APPROVAL SPINE — shipping source to GitHub is an outward action: it requires an APPROVED
    // ship_repo approval owned by the caller. A raw {files, repo} body without approval_id is the
    // OLD door, and it is closed: nothing else in this request is read.
    const { approval_id } = (await req.json().catch(() => ({}))) as { approval_id?: string };
    if (!approval_id) return json({ error: 'This export must go through Approvals — use Export to GitHub in the project workspace.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result').eq('id', approval_id).single();
    if (!approval || approval.owner_id !== user.id || approval.kind !== 'ship_repo' || approval.status !== 'approved') {
      return json({ error: 'No approved ship_repo approval found for this export.' }, 403);
    }
    if (!(await payloadMatches(approval.payload, approval.payload_hash as string | null))) {
      return json({ error: 'Approval payload changed after review — request the export again.' }, 409);
    }
    const previous = approval.result as { executed?: boolean; url?: string; owner?: string; repo?: string; branch?: string; files?: number } | null;
    if (previous?.executed) {
      // A lost client response may retry the same approval — return the durable result, never a
      // second push.
      return json({ ok: true, replayed: true, url: previous.url, owner: previous.owner, repo: previous.repo, branch: previous.branch, files: previous.files });
    }

    // The approved payload and its owner-scoped bundle are authoritative; the request body is not.
    const payload = (approval.payload ?? {}) as { project_id?: string; repo?: string; bundle_id?: string; files_hash?: string };
    const projectId = payload.project_id;
    const repo = payload.repo;
    const bundleId = payload.bundle_id;
    if (!projectId || !bundleId) return json({ error: 'This approval has no captured source snapshot — export again from the workspace.' }, 400);
    // (?!\.{1,2}$): '.'/'..' survive the charset but URL-normalize into DIFFERENT API routes.
    if (!repo || !/^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/.test(repo)) return json({ error: 'The approved repo name is invalid.' }, 400);

    const { data: project } = await admin.from('projects').select('id, owner_id').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);
    const { data: bundle } = await admin.from('deploy_bundles')
      .select('project_id, owner_id, files').eq('id', bundleId).maybeSingle();
    if (!bundle || bundle.owner_id !== user.id || bundle.project_id !== projectId) {
      return json({ error: 'The approved source snapshot is missing or does not match this project.' }, 409);
    }
    const files = bundle.files as RepoFile[];
    if (!Array.isArray(files) || !files.length) return json({ error: 'No files to export.' }, 400);
    if (files.some((f) => !f || typeof f.path !== 'string' || !f.path.trim() || f.path.includes('..') || typeof f.content !== 'string')) {
      return json({ error: 'The approved snapshot contains an invalid file entry.' }, 400);
    }
    // Secrets never ride to GitHub (scan B14). The client filters these before capture; re-refuse
    // here so a hand-built bundle cannot smuggle them either. The rule matches the platform's own
    // isEnvSecretFile: any .env / .env.* basename EXCEPT the secretless templates (deep review:
    // the old `\.env$` regex waved /.env.local and /.env.production straight through).
    const isSecretPath = (p: string) => {
      if (/(^|\/)\.fableforge\//.test(p)) return true;
      const base = p.split('/').pop() ?? '';
      if (base !== '.env' && !base.startsWith('.env.')) return false;
      return !/^\.env\.(example|sample|template)$/.test(base);
    };
    if (files.some((f) => isSecretPath(f.path))) {
      return json({ error: 'The snapshot contains secret-bearing paths (.env / .env.* / .fableforge) — these never ship to GitHub.' }, 400);
    }
    // TAMPER-EVIDENCE: the payload pinned a hash of the exact files reviewed; the bundle row must
    // still hash to it at execution time.
    if (!payload.files_hash || (await hashPayload(files)) !== payload.files_hash) {
      return json({ error: 'The captured snapshot changed after approval — request the export again.' }, 409);
    }

    // Single-flight claim (the deploy-site pattern): two direct invocations of the same approved
    // id must not race a double push. A one-hour expiry recovers a died-after-claim invocation.
    const priorResult = (previous ?? {}) as Record<string, unknown>;
    const priorClaim = typeof priorResult.ship_claimed_at === 'string' ? priorResult.ship_claimed_at : null;
    const claimAge = priorClaim ? Date.now() - Date.parse(priorClaim) : Number.POSITIVE_INFINITY;
    if (priorClaim && Number.isFinite(claimAge) && claimAge < 60 * 60 * 1000) {
      return json({ error: 'This export is already in flight.' }, 409);
    }
    const claimAt = new Date().toISOString();
    let claimQ = admin.from('approvals')
      .update({ result: { ...priorResult, ship_claimed_at: claimAt } })
      .eq('id', approval_id).eq('status', 'approved');
    claimQ = priorClaim
      ? claimQ.eq('result->>ship_claimed_at', priorClaim)
      : claimQ.is('result->>ship_claimed_at', null);
    const { data: claimed, error: claimError } = await claimQ.select('id');
    if (claimError || !claimed?.length) return json({ error: 'This export is already in flight.' }, 409);
    releaseExecutionClaim = async (extra = {}) => {
      await admin.from('approvals').update({
        result: { ...priorResult, ...extra, ship_claimed_at: null },
      }).eq('id', approval_id).eq('result->>ship_claimed_at', claimAt);
    };

    // LEDGER (service role): every outcome of this connector call lands in execution_runs.
    const ledger = async (status: 'ok' | 'failed', error: string | null, extra: Record<string, unknown> = {}) => {
      await admin.from('execution_runs').insert({
        owner_id: user.id, approval_id, connector: 'github', action: 'ship_repo', status,
        request: { project_id: projectId, repo, files: files.length, ...extra }, error,
      }).then(() => {}, () => {});
    };
    const fail = async (msg: string, status = 502) => {
      await ledger('failed', msg);
      await releaseExecutionClaim?.({ error: msg.slice(0, 500), failed_at: new Date().toISOString() });
      releaseExecutionClaim = null;
      return json({ error: msg }, status);
    };

    // TOKEN — resolved server-side at execution time, never from the request: the caller's
    // connected GitHub OAuth first, else the operator's edge secret.
    const token = (await freshProviderToken(admin, user.id, 'github')) || Deno.env.get('GITHUB_TOKEN');
    if (!token) return await fail('Connect GitHub first (Settings → Connections).', 400);

    const gh = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.github.com${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'FableForge', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
    const ghJson = async (path: string, init?: RequestInit) => { const r = await gh(path, init); const t = await r.text(); return { ok: r.ok, status: r.status, body: t ? JSON.parse(t) : null }; };

    // 1) Who owns the token.
    const me = await ghJson('/user');
    if (!me.ok) return await fail(`GitHub auth failed (${me.status}).`);
    const owner = (me.body as { login: string }).login;

    // 2) Ensure the repo exists (auto_init gives us a base branch + commit to build on).
    let repoInfo = await ghJson(`/repos/${owner}/${repo}`);
    if (repoInfo.status === 404) {
      repoInfo = await ghJson('/user/repos', { method: 'POST', body: JSON.stringify({ name: repo, private: true, auto_init: true, description: 'Exported from FableForge' }) });
      if (!repoInfo.ok) return await fail(`Could not create repo (${repoInfo.status}): ${JSON.stringify(repoInfo.body).slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, 1500)); // give auto_init a moment
    } else if (!repoInfo.ok) {
      return await fail(`Could not read repo (${repoInfo.status}).`);
    }
    const branch = (repoInfo.body as { default_branch?: string }).default_branch ?? 'main';

    // 3) Current ref + base tree.
    const ref = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (!ref.ok) return await fail(`Could not read branch '${branch}' (${ref.status}).`);
    const headSha = (ref.body as { object: { sha: string } }).object.sha;
    const headCommit = await ghJson(`/repos/${owner}/${repo}/git/commits/${headSha}`);
    const baseTree = (headCommit.body as { tree: { sha: string } }).tree.sha;

    // 4) Blobs → tree → commit → move ref.
    const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
    for (const f of files) {
      const b = await ghJson(`/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'utf-8' }) });
      if (!b.ok) return await fail(`Blob failed for ${f.path} (${b.status}).`);
      tree.push({ path: f.path.replace(/^\/+/, ''), mode: '100644', type: 'blob', sha: (b.body as { sha: string }).sha });
    }
    const newTree = await ghJson(`/repos/${owner}/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
    if (!newTree.ok) return await fail(`Tree failed (${newTree.status}).`);
    const commit = await ghJson(`/repos/${owner}/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'Update from FableForge', tree: (newTree.body as { sha: string }).sha, parents: [headSha] }) });
    if (!commit.ok) return await fail(`Commit failed (${commit.status}).`);
    const upd = await ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: (commit.body as { sha: string }).sha }) });
    if (!upd.ok) return await fail(`Ref update failed (${upd.status}).`);

    const url = (repoInfo.body as { html_url: string }).html_url;
    await ledger('ok', null, { url, branch });
    // Durable result — KEEPS the claim key and is GUARDED on it (the deploy-site pattern; deep
    // review: a stamp that dropped ship_claimed_at re-opened the claim for a stalled concurrent
    // invocation to double-push). A failed stamp is a failure: the bundle is NOT consumed, so the
    // durable record can never be lost while retries still work.
    const { error: stampErr } = await admin.from('approvals').update({
      result: { executed: true, url, owner, repo, branch, files: files.length, shipped_at: new Date().toISOString(), ship_claimed_at: claimAt },
    }).eq('id', approval_id).eq('result->>ship_claimed_at', claimAt);
    if (stampErr) return await fail(`The push landed at ${url} but the record could not be stamped (${stampErr.message}) — retry to reconcile.`, 500);
    releaseExecutionClaim = null;
    await admin.from('deploy_bundles').delete().eq('id', bundleId).then(() => {}, () => {});

    return json({ ok: true, url, owner, repo, branch, files: files.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await releaseExecutionClaim?.({ error: msg.slice(0, 500), failed_at: new Date().toISOString() });
    return json({ error: msg }, 500);
  }
});
