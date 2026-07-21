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
import { hashPayload, payloadMatches } from '../_shared/payloadHash.ts';

interface SiteFile { path: string; b64: string; sha1: string }

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

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

    const { approval_id } = (await req.json().catch(() => ({}))) as { approval_id?: string };

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // APPROVAL SPINE — a deploy is an outward action: it requires an APPROVED approval row owned
    // by the caller (same discipline as send-email). This closes the audit's "executes without
    // approval" hole: the client route always goes approval → executor → here.
    if (!approval_id) return json({ error: 'This deploy must go through Approvals — publish from the project workspace.' }, 400);
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status, payload, payload_hash, result').eq('id', approval_id).single();
    if (!approval || approval.owner_id !== user.id || approval.kind !== 'deploy_site' || approval.status !== 'approved') {
      return json({ error: 'No approved deploy_site approval found for this deploy.' }, 403);
    }
    if (!(await payloadMatches(approval.payload, approval.payload_hash as string | null))) {
      return json({ error: 'Approval payload changed after review — create a new deploy approval.' }, 409);
    }
    const previous = approval.result as { executed?: boolean; live?: boolean; state?: string; url?: string; site_id?: string } | null;
    if (previous?.executed) {
      // A lost client response may retry the same approval. Return the durable result instead of
      // creating a second host deploy.
      return json({ ok: true, replayed: true, siteId: previous.site_id, url: previous.url, state: previous.state ?? (previous.live ? 'ready' : 'building') });
    }

    // The approval payload and the referenced, owner-scoped bundle are authoritative. Request-body
    // files/project ids are deliberately ignored so approved intent cannot be swapped at execution.
    const payload = (approval.payload ?? {}) as {
      project_id?: string; bundle_id?: string; bundle_hash?: string;
      site_id?: string | null; netlify_token?: string;
    };
    const projectId = payload.project_id;
    const bundleId = payload.bundle_id;
    if (!projectId || !bundleId) return json({ error: 'This approval has no captured site bundle — publish again from the workspace.' }, 400);
    const { data: project } = await admin.from('projects').select('id, owner_id, netlify_site_id').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);
    const { data: bundle } = await admin.from('deploy_bundles')
      .select('project_id, owner_id, site_id, files').eq('id', bundleId).maybeSingle();
    if (!bundle || bundle.owner_id !== user.id || bundle.project_id !== projectId) {
      return json({ error: 'The approved site bundle is missing or does not match this project.' }, 409);
    }
    if ('site_id' in payload && (bundle.site_id ?? null) !== (payload.site_id ?? null)) {
      return json({ error: 'The staged hosting target changed after approval — publish again.' }, 409);
    }
    const files = bundle.files as SiteFile[];
    if (!Array.isArray(files) || !files.length) return json({ error: 'No built files to deploy — build the app first.' }, 400);
    if (files.some((f) => !f || typeof f.path !== 'string' || !f.path.startsWith('/') || f.path.includes('..')
      || typeof f.b64 !== 'string' || typeof f.sha1 !== 'string' || !/^[0-9a-f]{40}$/i.test(f.sha1))) {
      return json({ error: 'The approved site bundle contains an invalid file entry.' }, 400);
    }
    if (payload.bundle_hash && (await hashPayload(files)) !== payload.bundle_hash) {
      return json({ error: 'The staged site bundle changed after approval — publish again.' }, 409);
    }
    const siteId = (payload.site_id ?? bundle.site_id as string | null) ?? undefined;
    const netlifyToken = payload.netlify_token;
    // Prefer the user's own connected token (self-serve); fall back to an operator-set edge secret.
    const usingOwnToken = !!(netlifyToken && netlifyToken.trim());
    const token = (netlifyToken && netlifyToken.trim()) || Deno.env.get('NETLIFY_AUTH_TOKEN');
    if (!token) return json({ error: 'Connect hosting first — paste a Netlify personal access token in the Publish dialog.' }, 400);

    // Atomic single-flight claim. Approval status prevents unapproved work; this JSON claim prevents
    // two direct invocations of the SAME approved id from overlapping. A one-hour expiry recovers
    // an invocation that died after claiming from blocking the approval forever.
    const priorResult = (previous ?? {}) as Record<string, unknown>;
    const priorClaim = typeof priorResult.deploy_claimed_at === 'string' ? priorResult.deploy_claimed_at : null;
    const claimAge = priorClaim ? Date.now() - Date.parse(priorClaim) : Number.POSITIVE_INFINITY;
    if (priorClaim && Number.isFinite(claimAge) && claimAge < 60 * 60 * 1000) {
      return json({ error: 'This deploy is already in flight.' }, 409);
    }
    const claimAt = new Date().toISOString();
    let claimQ = admin.from('approvals')
      .update({ result: { ...priorResult, deploy_claimed_at: claimAt } })
      .eq('id', approval_id).eq('status', 'approved');
    claimQ = priorClaim
      ? claimQ.eq('result->>deploy_claimed_at', priorClaim)
      : claimQ.is('result->>deploy_claimed_at', null);
    const { data: claimed, error: claimError } = await claimQ.select('id');
    if (claimError || !claimed?.length) return json({ error: 'This deploy is already in flight.' }, 409);
    releaseExecutionClaim = async (extra = {}) => {
      await admin.from('approvals').update({
        result: { ...priorResult, ...extra, deploy_claimed_at: null },
      }).eq('id', approval_id).eq('result->>deploy_claimed_at', claimAt);
    };

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
      await releaseExecutionClaim?.({ error: msg.slice(0, 500), failed_at: new Date().toISOString() });
      releaseExecutionClaim = null;
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
    await admin.from('approvals').update({
      result: { executed: true, live: state === 'ready', state, url, site_id: site, deploy_claimed_at: claimAt },
    }).eq('id', approval_id).eq('result->>deploy_claimed_at', claimAt);
    releaseExecutionClaim = null;
    await ledger('ok', null, { url, site_id: site, state });

    return json({ ok: true, siteId: site, url, state, uploaded: toUpload.length });
  } catch (e) {
    await releaseExecutionClaim?.({ error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500) }).catch(() => {});
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
