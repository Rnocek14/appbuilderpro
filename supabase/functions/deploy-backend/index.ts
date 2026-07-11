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
      projectId?: string; projectRef?: string; functions?: DeployFn[]; secrets?: DeploySecret[]; approval_id?: string;
    };
    const { projectId, projectRef, functions, secrets, approval_id } = body;
    if (!projectId) return json({ error: 'projectId is required.' }, 400);
    if (!projectRef) return json({ error: 'projectRef is required.' }, 400);
    if (!/^[a-z0-9]{16,40}$/i.test(projectRef)) return json({ error: `Invalid project ref "${projectRef}".` }, 400);

    // Verify the caller owns this FableForge project (mirrors generate-app's ownership check).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects').select('id, owner_id, supabase_managed').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

    // APPROVAL SPINE — this is the most privileged external action in the system (it pushes code +
    // secrets with the Management token), so it requires an APPROVED approval row owned by the
    // caller, and every outcome lands in execution_runs (same discipline as send-email/deploy-site).
    if (!approval_id) return json({ error: 'This deploy must go through Approvals — deploy from the project workspace.' }, 400);
    const { data: approval } = await admin.from('approvals')
      .select('id, owner_id, kind, status').eq('id', approval_id).single();
    if (!approval || approval.owner_id !== user.id || approval.kind !== 'deploy_backend' || approval.status !== 'approved') {
      return json({ error: 'No approved deploy_backend approval found for this deploy.' }, 403);
    }
    const ledger = async (status: 'ok' | 'failed', error: string | null, extra: Record<string, unknown> = {}) => {
      await admin.from('execution_runs').insert({
        owner_id: user.id, approval_id, connector: 'supabase', action: 'deploy_backend', status,
        request: { project_id: projectId, project_ref: projectRef, functions: (functions ?? []).map((f) => f.slug), ...extra }, error,
      }).then(() => {}, () => {});
    };

    // Managed (FableForge Cloud) DBs use the platform token; user-owned DBs use the user's OAuth token.
    const token = await projectSupabaseToken(admin, user.id, (project.supabase_managed as boolean) ?? false);
    if (!token) return json({ error: 'Connect Supabase (Settings → Connections), or set the SB_MANAGEMENT_TOKEN edge secret.' }, 400);

    const api = (path: string, init: RequestInit) =>
      fetch(`https://api.supabase.com/v1/projects/${projectRef}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      });

    const results: { step: string; ok: boolean; detail?: string }[] = [];

    // 0) FABLEFORGE AI — every deployed app gets managed AI with no keys: ensure the per-app
    // gateway key exists and push it (+ the gateway URL) into the app's Function Secrets. The
    // ai-gateway function meters each call against the owner's credit balance.
    const gatewaySecrets: DeploySecret[] = [];
    try {
      const { data: proj } = await admin.from('projects').select('ai_gateway_key').eq('id', projectId).single();
      let gatewayKey = ((proj as { ai_gateway_key?: string | null } | null)?.ai_gateway_key) ?? '';
      if (!gatewayKey) {
        gatewayKey = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const { error: keyErr } = await admin.from('projects').update({ ai_gateway_key: gatewayKey }).eq('id', projectId);
        if (keyErr) gatewayKey = ''; // column missing (migration not applied yet) — skip quietly
      }
      if (gatewayKey) {
        gatewaySecrets.push(
          { name: 'FABLEFORGE_AI_KEY', value: gatewayKey },
          { name: 'FABLEFORGE_AI_URL', value: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-gateway` },
        );
      }
    } catch { /* best-effort — apps can still deploy without managed AI */ }

    // 1) SECRETS — set all at once (reliable; mirrors the apply-migration call shape).
    const secretList = [...gatewaySecrets, ...(secrets ?? []).filter((s) => s && s.name && s.value)];
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

    // 3) AUTOMATION TICK — when the project ships an automation-runner, wire the every-minute
    // pg_cron tick that drives it. Idempotent: cron.schedule upserts by job name, and the vault
    // secrets (runner URL + bearer) are upserted, so re-deploys are safe. The tick authenticates
    // to the runner with the target project's service-role key, held in Vault (cron SQL cannot
    // read Function Secrets); the runner rejects any other caller.
    const runnerDeployed = results.some((r) => r.step === 'function automation-runner' && r.ok);
    if (runnerDeployed) {
      try {
        let serviceKey = '';
        const kr = await api('/api-keys?reveal=true', { method: 'GET' });
        if (kr.ok) {
          const keys = (await kr.json()) as { name?: string; api_key?: string }[];
          serviceKey = keys.find((k) => k.name === 'service_role')?.api_key ?? '';
        }
        if (!serviceKey) throw new Error('could not read the service_role key to authorize the cron tick');
        const esc = (s: string) => s.replace(/'/g, "''");
        const runnerUrl = `https://${projectRef}.supabase.co/functions/v1/automation-runner`;
        const sql = `
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'ff_automation_url';
  if sid is null then perform vault.create_secret('${esc(runnerUrl)}', 'ff_automation_url');
  else perform vault.update_secret(sid, '${esc(runnerUrl)}'); end if;
  select id into sid from vault.secrets where name = 'ff_automation_bearer';
  if sid is null then perform vault.create_secret('${esc(serviceKey)}', 'ff_automation_bearer');
  else perform vault.update_secret(sid, '${esc(serviceKey)}'); end if;
end $$;
select cron.schedule(
  'fableforge-automation-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ff_automation_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ff_automation_bearer')
    ),
    body := jsonb_build_object('tick', now()),
    timeout_milliseconds := 8000
  );
  $cron$
);`;
        const r = await api('/database/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sql }),
        });
        const t = await r.text();
        results.push({ step: 'automation tick (pg_cron, every minute)', ok: r.ok, detail: r.ok ? undefined : `${r.status}: ${t.slice(0, 300)}` });
      } catch (e) {
        results.push({ step: 'automation tick (pg_cron, every minute)', ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }

    if (!results.length) { await ledger('failed', 'Nothing to deploy — no functions or secrets provided.'); return json({ error: 'Nothing to deploy — no functions or secrets provided.' }, 400); }
    const allOk = results.every((r) => r.ok);
    const failedSteps = results.filter((r) => !r.ok).map((r) => `${r.step}: ${r.detail ?? 'failed'}`);
    await ledger(allOk ? 'ok' : 'failed', allOk ? null : failedSteps.join(' | ').slice(0, 800), { steps: results.length });
    return json({ ok: allOk, results }, allOk ? 200 : 207);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
