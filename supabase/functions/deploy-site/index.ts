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

    const { projectId, siteId, files, netlifyToken } = (await req.json().catch(() => ({}))) as {
      projectId?: string; siteId?: string; files?: SiteFile[]; netlifyToken?: string;
    };
    // Prefer the user's own connected token (self-serve); fall back to an operator-set edge secret.
    const token = (netlifyToken && netlifyToken.trim()) || Deno.env.get('NETLIFY_AUTH_TOKEN');
    if (!token) return json({ error: 'Connect hosting first — paste a Netlify personal access token in the Publish dialog.' }, 400);
    if (!projectId) return json({ error: 'projectId is required.' }, 400);
    if (!files?.length) return json({ error: 'No built files to deploy — build the app first.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects').select('id, owner_id').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

    const api = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.netlify.com/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

    // 1) Ensure a site exists.
    let site = siteId;
    if (!site) {
      const r = await api('/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const t = await r.text();
      if (!r.ok) return json({ error: `Netlify create-site ${r.status}: ${t.slice(0, 300)}` }, 502);
      site = (JSON.parse(t) as { id: string }).id;
    }

    // 2) Create a deploy declaring the file digest; Netlify replies with the sha1s it still needs.
    const digest: Record<string, string> = {};
    for (const f of files) digest[f.path] = f.sha1;
    const dr = await api(`/sites/${site}/deploys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: digest }) });
    const dt = await dr.text();
    if (!dr.ok) return json({ error: `Netlify create-deploy ${dr.status}: ${dt.slice(0, 300)}`, siteId: site }, 502);
    const deploy = JSON.parse(dt) as { id: string; required?: string[]; ssl_url?: string };

    // 3) Upload each required file (by sha1) as raw bytes.
    const required = new Set(deploy.required ?? []);
    const toUpload = files.filter((f) => required.has(f.sha1));
    for (const f of toUpload) {
      const u = await api(`/deploys/${deploy.id}/files${f.path}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: b64ToBytes(f.b64),
      });
      if (!u.ok) return json({ error: `Netlify upload ${f.path} ${u.status}: ${(await u.text()).slice(0, 200)}`, siteId: site }, 502);
    }

    // 4) Poll until the deploy is live.
    let url = deploy.ssl_url ?? '';
    for (let i = 0; i < 30; i++) {
      const sr = await api(`/deploys/${deploy.id}`);
      if (sr.ok) {
        const s = JSON.parse(await sr.text()) as { state?: string; ssl_url?: string };
        url = s.ssl_url ?? url;
        if (s.state === 'ready') break;
        if (s.state === 'error') return json({ error: 'Netlify reported a deploy error.', siteId: site }, 502);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return json({ ok: true, siteId: site, url, uploaded: toUpload.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
