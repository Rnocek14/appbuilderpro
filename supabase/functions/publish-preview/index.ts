// supabase/functions/publish-preview/index.ts
// GO LIVE — publish a preview_sites demo as a real hosted static site on Netlify. The operator's
// browser renders the finished index.html (exportStatic.buildStaticSiteHtml — the CSS is DOM-inlined
// there, so rendering stays client-side) and hands us the ONE file; we upload it to Netlify exactly
// like deploy-site uploads a built bundle, bind the site to the preview, and record the live URL.
//
// Two callers, one path:
//   1) the OPERATOR (browser JWT) — sends the freshly-rendered `html`; we host it AND stash it in
//      project-assets so a later sale can re-publish with no browser.
//   2) the STRIPE webhook (x-worker-secret) — sends no html; we re-publish the STASHED html. If none
//      is stashed yet, we say so (422) and the webhook falls back to nudging the operator to Go Live.
// Only the operator ever supplies HTML — never a prospect (that would be a defacement vector).
//
// Deploy: npx supabase functions deploy publish-preview
// Secrets: NETLIFY_AUTH_TOKEN (the operator's Netlify personal access token), WORKER_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { netlifySiteName, publishStatusAfter, publishedHtmlPath, normalizeCustomDomain } from '../../../src/lib/preview/publishCore.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
};

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { previewSiteId, html, customDomain } = (await req.json().catch(() => ({}))) as
      { previewSiteId?: string; html?: string; customDomain?: string };
    if (!previewSiteId) return json({ error: 'previewSiteId is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // AUTH — operator JWT (must own the preview) OR the trusted worker secret (webhook re-publish).
    const workerSecret = Deno.env.get('WORKER_SECRET');
    const byWorker = !!workerSecret && req.headers.get('x-worker-secret') === workerSecret;

    const { data: site } = await admin.from('preview_sites')
      .select('id, user_id, slug, business_name, status, netlify_site_id').eq('id', previewSiteId).single();
    if (!site) return json({ error: 'Preview not found.' }, 404);
    const ownerId = (site as { user_id: string }).user_id;

    if (!byWorker) {
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      if (user.id !== ownerId) return json({ error: 'Preview not found.' }, 404);
    }

    const token = Deno.env.get('NETLIFY_AUTH_TOKEN');
    if (!token) return json({ error: 'Hosting is not connected — set NETLIFY_AUTH_TOKEN (a Netlify personal access token).' }, 400);

    const htmlPath = publishedHtmlPath(ownerId, previewSiteId);

    // Resolve the HTML: the operator sends it (and we stash it); the worker re-publishes the stash.
    let bytes: Uint8Array;
    if (typeof html === 'string' && html.trim().length > 200) {
      bytes = new TextEncoder().encode(html);
      // Only the operator path reaches here with html; stash it (upsert) for later webhook re-publish.
      await admin.storage.from('project-assets').upload(htmlPath, bytes, { contentType: 'text/html; charset=utf-8', upsert: true });
    } else {
      const dl = await admin.storage.from('project-assets').download(htmlPath);
      if (dl.error || !dl.data) return json({ error: 'No rendered site is stored yet — the operator needs to Go Live once.' }, 422);
      bytes = new Uint8Array(await dl.data.arrayBuffer());
    }

    const api = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.netlify.com/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

    // 1) Resolve the target site: the authoritative binding is preview_sites.netlify_site_id; else
    // create one named after the slug (readable + nonce-unique). A name clash falls back to a
    // Netlify-assigned name so a publish never hard-fails on naming.
    let siteId = (site as { netlify_site_id?: string | null }).netlify_site_id ?? undefined;
    if (!siteId) {
      const name = netlifySiteName((site as { slug: string }).slug);
      let r = await api('/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!r.ok) r = await api('/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const t = await r.text();
      if (!r.ok) return json({ error: `Netlify create-site ${r.status}: ${t.slice(0, 300)}` }, 502);
      siteId = (JSON.parse(t) as { id: string }).id;
    }

    // 2) Create a deploy declaring the single file's sha1; 3) upload it if Netlify still needs it.
    const sha1 = await sha1Hex(bytes);
    const dr = await api(`/sites/${siteId}/deploys`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: { '/index.html': sha1 } }),
    });
    const dt = await dr.text();
    if (!dr.ok) return json({ error: `Netlify create-deploy ${dr.status}: ${dt.slice(0, 300)}` }, 502);
    const deploy = JSON.parse(dt) as { id: string; required?: string[]; ssl_url?: string; url?: string };
    if ((deploy.required ?? []).includes(sha1)) {
      const u = await api(`/deploys/${deploy.id}/files/index.html`, {
        method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
      });
      if (!u.ok) return json({ error: `Netlify upload ${u.status}: ${(await u.text()).slice(0, 200)}` }, 502);
    }

    // 4) Poll until live — HONEST state: 'building' if it isn't ready when the window closes. The
    // WEBHOOK path (byWorker) must NOT poll: a paid sale re-publishes an EXISTING site (its ssl_url is
    // already known), and awaiting a 60s poll would blow past Stripe's ~20s webhook timeout and make
    // deliveries look flaky. It returns immediately as 'building'; Netlify finishes in seconds.
    const pollTries = byWorker ? 0 : 30;
    let url = deploy.ssl_url ?? deploy.url ?? '';
    let state: 'ready' | 'building' = 'building';
    for (let i = 0; i < pollTries; i++) {
      const sr = await api(`/deploys/${deploy.id}`);
      if (sr.ok) {
        const s = JSON.parse(await sr.text()) as { state?: string; ssl_url?: string };
        url = s.ssl_url ?? url;
        if (s.state === 'ready') { state = 'ready'; break; }
        if (s.state === 'error') return json({ error: 'Netlify reported a deploy error.' }, 502);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Optional custom domain (operator only). We tell Netlify; the client still points DNS at us.
    const domain = byWorker ? null : normalizeCustomDomain(customDomain);
    if (domain) {
      await api(`/sites/${siteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_domain: domain }) }).catch(() => {});
    }

    // Persist the binding + live state. A SOLD site's status is never downgraded by a republish.
    const patch: Record<string, unknown> = {
      netlify_site_id: siteId, live_url: url, published_at: new Date().toISOString(),
      status: publishStatusAfter((site as { status?: string }).status), updated_at: new Date().toISOString(),
    };
    if (domain) patch.custom_domain = domain;
    await admin.from('preview_sites').update(patch).eq('id', previewSiteId);

    await admin.from('execution_runs').insert({
      owner_id: ownerId, connector: 'netlify', action: 'publish_preview', status: 'ok',
      request: { preview_site_id: previewSiteId, site_id: siteId, bytes: bytes.byteLength }, response: { url, state },
    }).then(() => {}, () => {});

    return json({ ok: true, siteId, url, state, customDomain: domain });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
