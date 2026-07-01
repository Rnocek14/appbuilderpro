// supabase/functions/deploy-backend/index.ts
// Deploys a project's backend to the user's Supabase via the Management API: sets the integration
// SECRETS (Function Secrets) and deploys each generated EDGE FUNCTION. This is what makes a generated
// "email automation / scraping / payments" app actually RUN instead of just being ready-to-deploy code.
//
// WHY SERVER-SIDE: the browser can't call api.supabase.com (no CORS) and must never hold the Personal
// Access Token. This runs server-side with the same SB_MANAGEMENT_TOKEN edge secret apply-migration uses.
//
// ONE-TIME SETUP (shares the token with apply-migration — set once):
//   supabase functions deploy deploy-backend --project-ref <ref>
//   supabase secrets set SB_MANAGEMENT_TOKEN=sbp_xxxxx --project-ref <ref>
//   (a Supabase Personal Access Token from https://supabase.com/dashboard/account/tokens)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { projectSupabaseToken } from '../_shared/oauth.ts';

interface DeployFn { slug: string; source: string; verifyJwt?: boolean }
interface DeploySecret { name: string; value: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // AUTHZ — this wields the privileged Management token, so it must be an authenticated FableForge
    // user acting on a project they own (confused-deputy guard). Never deploy on behalf of an
    // anonymous or unauthorized caller.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string; projectRef?: string; functions?: DeployFn[]; secrets?: DeploySecret[];
    };
    const { projectId, projectRef, functions, secrets } = body;
    if (!projectId) return json({ error: 'projectId is required.' }, 400);
    if (!projectRef) return json({ error: 'projectRef is required.' }, 400);
    if (!/^[a-z0-9]{16,40}$/i.test(projectRef)) return json({ error: `Invalid project ref "${projectRef}".` }, 400);

    // Verify the caller owns this FableForge project (mirrors generate-app's ownership check).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects').select('id, owner_id, supabase_managed').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

    // Managed (FableForge Cloud) DBs use the platform token; user-owned DBs use the user's OAuth token.
    const token = await projectSupabaseToken(admin, user.id, (project.supabase_managed as boolean) ?? false);
    if (!token) return json({ error: 'Connect Supabase (Settings → Connections), or set the SB_MANAGEMENT_TOKEN edge secret.' }, 400);

    const api = (path: string, init: RequestInit) =>
      fetch(`https://api.supabase.com/v1/projects/${projectRef}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      });

    const results: { step: string; ok: boolean; detail?: string }[] = [];

    // 1) SECRETS — set all at once (reliable; mirrors the apply-migration call shape).
    const secretList = (secrets ?? []).filter((s) => s && s.name && s.value);
    if (secretList.length) {
      const r = await api('/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secretList.map((s) => ({ name: s.name, value: s.value }))),
      });
      const t = await r.text();
      results.push({ step: `secrets (${secretList.map((s) => s.name).join(', ')})`, ok: r.ok, detail: r.ok ? undefined : `${r.status}: ${t.slice(0, 300)}` });
    }

    // 2) FUNCTIONS — bundleless multipart deploy, one per function. Each function is self-contained
    // (single index.ts, inline CORS) so it deploys cleanly without bundling shared files.
    for (const fn of functions ?? []) {
      if (!fn?.slug || !fn?.source) continue;
      try {
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ entrypoint_path: 'index.ts', name: fn.slug, verify_jwt: fn.verifyJwt ?? false })], { type: 'application/json' }));
        form.append('file', new File([fn.source], 'index.ts', { type: 'application/typescript' }));
        const r = await api(`/functions/deploy?slug=${encodeURIComponent(fn.slug)}`, { method: 'POST', body: form });
        const t = await r.text();
        results.push({ step: `function ${fn.slug}`, ok: r.ok, detail: r.ok ? undefined : `${r.status}: ${t.slice(0, 300)}` });
      } catch (e) {
        results.push({ step: `function ${fn.slug}`, ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }

    if (!results.length) return json({ error: 'Nothing to deploy — no functions or secrets provided.' }, 400);
    const allOk = results.every((r) => r.ok);
    return json({ ok: allOk, results }, allOk ? 200 : 207);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
