// supabase/functions/github-export/index.ts
// Export a project's source to a real GitHub repo (create-or-update) via the Git Data API. Commits a
// full snapshot of the files. The GitHub token stays server-side (GITHUB_TOKEN edge secret).
//
// Auth: authenticated FableForge user who owns the projectId (mirrors deploy-backend/deploy-site).
//
// ONE-TIME SETUP:
//   supabase functions deploy github-export --project-ref <ref>
//   supabase secrets set GITHUB_TOKEN=<a GitHub PAT with `repo` scope>

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { freshProviderToken } from '../_shared/oauth.ts';

interface ExportFile { path: string; content: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { projectId, repo, files, githubToken } = (await req.json().catch(() => ({}))) as {
      projectId?: string; repo?: string; files?: ExportFile[]; githubToken?: string;
    };
    if (!projectId) return json({ error: 'projectId is required.' }, 400);
    if (!repo || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return json({ error: 'A valid repo name is required.' }, 400);
    if (!files?.length) return json({ error: 'No files to export.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects').select('id, owner_id').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

    // Token priority: the user's connected GitHub (OAuth) → a token in the request → operator secret.
    const token = (await freshProviderToken(admin, user.id, 'github')) || (githubToken && githubToken.trim()) || Deno.env.get('GITHUB_TOKEN');
    if (!token) return json({ error: 'Connect GitHub first (Settings → Connections).' }, 400);

    const gh = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.github.com${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'FableForge', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
    const ghJson = async (path: string, init?: RequestInit) => { const r = await gh(path, init); const t = await r.text(); return { ok: r.ok, status: r.status, body: t ? JSON.parse(t) : null }; };

    // 1) Who owns the token.
    const me = await ghJson('/user');
    if (!me.ok) return json({ error: `GitHub auth failed (${me.status}).` }, 502);
    const owner = (me.body as { login: string }).login;

    // 2) Ensure the repo exists (auto_init gives us a base branch + commit to build on).
    let repoInfo = await ghJson(`/repos/${owner}/${repo}`);
    if (repoInfo.status === 404) {
      repoInfo = await ghJson('/user/repos', { method: 'POST', body: JSON.stringify({ name: repo, private: true, auto_init: true, description: 'Exported from FableForge' }) });
      if (!repoInfo.ok) return json({ error: `Could not create repo (${repoInfo.status}): ${JSON.stringify(repoInfo.body).slice(0, 200)}` }, 502);
      await new Promise((r) => setTimeout(r, 1500)); // give auto_init a moment
    } else if (!repoInfo.ok) {
      return json({ error: `Could not read repo (${repoInfo.status}).` }, 502);
    }
    const branch = (repoInfo.body as { default_branch?: string }).default_branch ?? 'main';

    // 3) Current ref + base tree.
    const ref = await ghJson(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (!ref.ok) return json({ error: `Could not read branch '${branch}' (${ref.status}).` }, 502);
    const headSha = (ref.body as { object: { sha: string } }).object.sha;
    const headCommit = await ghJson(`/repos/${owner}/${repo}/git/commits/${headSha}`);
    const baseTree = (headCommit.body as { tree: { sha: string } }).tree.sha;

    // 4) Blobs → tree → commit → move ref.
    const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
    for (const f of files) {
      const b = await ghJson(`/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'utf-8' }) });
      if (!b.ok) return json({ error: `Blob failed for ${f.path} (${b.status}).` }, 502);
      tree.push({ path: f.path.replace(/^\/+/, ''), mode: '100644', type: 'blob', sha: (b.body as { sha: string }).sha });
    }
    const newTree = await ghJson(`/repos/${owner}/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
    if (!newTree.ok) return json({ error: `Tree failed (${newTree.status}).` }, 502);
    const commit = await ghJson(`/repos/${owner}/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'Update from FableForge', tree: (newTree.body as { sha: string }).sha, parents: [headSha] }) });
    if (!commit.ok) return json({ error: `Commit failed (${commit.status}).` }, 502);
    const upd = await ghJson(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: (commit.body as { sha: string }).sha }) });
    if (!upd.ok) return json({ error: `Ref update failed (${upd.status}).` }, 502);

    return json({ ok: true, url: (repoInfo.body as { html_url: string }).html_url, owner, repo, branch, files: files.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
