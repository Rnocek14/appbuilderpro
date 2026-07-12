// supabase/functions/deploy-site/index.ts
// One-click HOSTING: publishes a project's built static site (dist/) to Netlify and returns a live URL.
// The build runs client-side in the WebContainer; this function only uploads, so the Netlify token
// stays server-side (NETLIFY_AUTH_TOKEN edge secret) and never reaches the browser.
//
// Auth: requires an authenticated FableForge user who owns the projectId (mirrors deploy-backend).
//
// ONE-TIME SETUP:
//   supabase functions deploy deploy-site --project-ref <ref>
//   supabase secrets set NETLIFY_AUTH_TOKEN=<a Netlify personal access token>
//   (https://app.netlify.com/user/applications#personal-access-tokens)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';

interface SiteFile { path: string; b64: string; sha1: string }

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

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

    const { projectId, siteId, files, netlifyToken, approval_id } = (await req.json().catch(() => ({}))) as {
      projectId?: string; siteId?: string; files?: SiteFile[]; netlifyToken?: string; approval_id?: string;
    };
    // Prefer the user's own connected token (self-serve); fall back to an operator-set edge secret.
    const usingOwnToken = !!(netlifyToken && netlifyToken.trim());
    const token = (netlifyToken && netlifyToken.trim()) || Deno.env.get('NETLIFY_AUTH_TOKEN');
    if (!token) return json({ error: 'Connect hosting first — paste a Netlify personal access token in the Publish dialog.' }, 400);
    if (!projectId) return json({ error: 'projectId is required.' }, 400);
    if (!files?.length) return json({ error: 'No built files to deploy — build the app first.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects').select('id, owner_id, netlify_site_id').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

    // APPROVAL SPINE — a deploy is an outward action: it requires an APPROVED approval row owned
    // by the caller (same discipline as send-email). This closes the audit's "executes without
    // approval" hole: the client route always goes approval → executor → here.
    if (!approval_id) return json({ error: 'This deploy must go through Approvals — publish from the project workspace.' }, 400);
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status').eq('id', approval_id).single();
    if (!approval || approval.owner_id !== user.id || approval.kind !== 'deploy_site' || approval.status !== 'approved') {
      return json({ error: 'No approved deploy_site approval found for this deploy.' }, 403);
    }

    // LEDGER (service role — the client policy rightly can't write success rows): every outcome of
    // this connector call lands in execution_runs.
    const ledger = async (status: 'ok' | 'failed', error: string | null, extra: Record<string, unknown> = {}) => {
      await admin.from('execution_runs').insert({
        owner_id: user.id, approval_id, connector: 'netlify', action: 'deploy_site', status,
        request: { project_id: projectId, files: files.length, ...extra }, error,
      }).then(() => {}, () => {});
    };
    const fail = async (msg: string, status = 502, extra: Record<string, unknown> = {}) => {
      await ledger('failed', msg);
      return json({ error: msg, ...extra }, status);
    };

    const api = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.netlify.com/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

    // 1) Resolve the target site. The AUTHORITATIVE binding is projects.netlify_site_id (written
    // server-side on first deploy). A client-supplied siteId is honored only with the caller's OWN
    // token (which can only touch their own sites) — never with the shared operator token, where a
    // guessed/foreign site id could overwrite another tenant's site (audit H3).
    const storedSite = (project as { netlify_site_id?: string | null }).netlify_site_id ?? null;
    let site = storedSite ?? undefined;
    if (!site && siteId) {
      if (!usingOwnToken) return await fail('This project has no recorded hosting site — publish once to create one (a passed siteId is only honored with your own Netlify token).', 400);
      site = siteId;
    }
    if (!site) {
      const r = await api('/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const t = await r.text();
      if (!r.ok) return await fail(`Netlify create-site ${r.status}: ${t.slice(0, 300)}`);
      site = (JSON.parse(t) as { id: string }).id;
    }

    // 2) Create a deploy declaring the file digest; Netlify replies with the sha1s it still needs.
    const digest: Record<string, string> = {};
    for (const f of files) digest[f.path] = f.sha1;
    const dr = await api(`/sites/${site}/deploys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: digest }) });
    const dt = await dr.text();
    if (!dr.ok) return await fail(`Netlify create-deploy ${dr.status}: ${dt.slice(0, 300)}`, 502, { siteId: site });
    const deploy = JSON.parse(dt) as { id: string; required?: string[]; ssl_url?: string };

    // 3) Upload each required file (by sha1) as raw bytes.
    const required = new Set(deploy.required ?? []);
    const toUpload = files.filter((f) => required.has(f.sha1));
    for (const f of toUpload) {
      const u = await api(`/deploys/${deploy.id}/files${f.path}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: b64ToBytes(f.b64),
      });
      if (!u.ok) return await fail(`Netlify upload ${f.path} ${u.status}: ${(await u.text()).slice(0, 200)}`, 502, { siteId: site });
    }

    // 4) Poll until the deploy is live. HONEST STATE: if the host is still building when the poll
    // window closes, say 'building' — never report ready before it is (audit: optimistic success).
    let url = deploy.ssl_url ?? '';
    let state: 'ready' | 'building' = 'building';
    for (let i = 0; i < 30; i++) {
      const sr = await api(`/deploys/${deploy.id}`);
      if (sr.ok) {
        const s = JSON.parse(await sr.text()) as { state?: string; ssl_url?: string };
        url = s.ssl_url ?? url;
        if (s.state === 'ready') { state = 'ready'; break; }
        if (s.state === 'error') return await fail('Netlify reported a deploy error.', 502, { siteId: site });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Persist the authoritative site binding server-side (first deploy) + ledger the success.
    if (site !== storedSite) {
      await admin.from('projects').update({ netlify_site_id: site }).eq('id', projectId).then(() => {}, () => {});
    }
    await ledger('ok', null, { url, site_id: site, state });

    return json({ ok: true, siteId: site, url, state, uploaded: toUpload.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
