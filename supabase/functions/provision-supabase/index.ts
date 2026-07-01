// supabase/functions/provision-supabase/index.ts
// One-click "Set up database": using the user's CONNECTED Supabase OAuth token, create a Supabase
// project in their org (or reuse the one already linked to this app), fetch its URL + anon key, write
// the app's /.env, and apply the generated migration. This is the Lovable-style per-app provisioning.
//
// Idempotent + resumable: project creation takes a minute, so we poll up to ~50s; if it isn't healthy
// yet we return { status: 'provisioning' } and the client calls again (we reuse the linked ref).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { freshProviderToken } from '../_shared/oauth.ts';

const randomPassword = () => {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[^A-Za-z0-9]/g, '').slice(0, 24) + 'aA1!';
};

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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { projectId, region } = (await req.json().catch(() => ({}))) as { projectId?: string; region?: string };
    if (!projectId) return json({ error: 'projectId is required.' }, 400);

    const { data: project } = await admin.from('projects').select('id, owner_id, name, supabase_project_ref, supabase_managed').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

    let ref = project.supabase_project_ref as string | null;
    let managed = (project.supabase_managed as boolean) ?? false;

    // TIER SELECTION for a NEW database: if the user connected their own Supabase, use their org
    // (they own it). Otherwise, if FableForge Cloud is configured, provision under OUR org (managed —
    // no user Supabase account needed). Existing databases keep whatever mode they were created with.
    const userToken = await freshProviderToken(admin, user.id, 'supabase');
    const platformToken = Deno.env.get('FF_PLATFORM_MANAGEMENT_TOKEN');
    const platformOrg = Deno.env.get('FF_PLATFORM_ORG_ID');
    if (!ref) {
      if (userToken) managed = false;
      else if (platformToken && platformOrg) managed = true;
      else return json({ error: 'Connect Supabase (Settings → Connections), or enable FableForge Cloud by setting FF_PLATFORM_MANAGEMENT_TOKEN + FF_PLATFORM_ORG_ID.' }, 400);

      // PLAN LIMITS — managed DBs cost us money, so cap how many a user gets by plan. (BYO is uncapped —
      // it's on the user's own Supabase.) Free users hitting the cap upgrade or connect their own.
      if (managed) {
        const { data: prof } = await admin.from('profiles').select('plan').eq('id', user.id).single();
        const isPro = (prof?.plan ?? 'free') === 'pro';
        const cap = isPro ? Number(Deno.env.get('FF_PRO_MANAGED_LIMIT') ?? 50) : Number(Deno.env.get('FF_FREE_MANAGED_LIMIT') ?? 2);
        const { count } = await admin.from('projects').select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id).eq('supabase_managed', true).not('supabase_project_ref', 'is', null);
        if ((count ?? 0) >= cap) {
          return json({ error: `You've reached your plan's cloud-database limit (${cap}). Upgrade to Pro, or connect your own Supabase (Settings → Connections) to keep creating apps.` }, 402);
        }
      }
    }

    const token = managed ? platformToken : (userToken || Deno.env.get('SB_MANAGEMENT_TOKEN'));
    if (!token) return json({ error: 'No Supabase token available for this project.' }, 400);
    const api = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.supabase.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

    // Reuse the project already linked to this app, else create one in the chosen org.
    if (!ref) {
      let orgId = platformOrg;
      if (!managed) {
        const orgsRes = await api('/organizations');
        if (!orgsRes.ok) return json({ error: `Could not read your Supabase orgs (${orgsRes.status}).` }, 502);
        const orgs = await orgsRes.json() as { id: string }[];
        if (!orgs.length) return json({ error: 'No Supabase organization found on your account.' }, 400);
        orgId = orgs[0].id;
      }
      const name = `ff-${(project.name ?? 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${projectId.slice(0, 6)}`;
      const create = await api('/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Managed apps use the smallest instance so idle databases cost ~nothing (scale-to-zero on the
        // Supabase for Platforms tier). BYO respects the user's own org defaults.
        body: JSON.stringify({ organization_id: orgId, name, region: region ?? 'us-east-1', db_pass: randomPassword(), ...(managed ? { desired_instance_size: 'nano' } : {}) }),
      });
      const ct = await create.text();
      if (!create.ok) return json({ error: `Create project failed (${create.status}): ${ct.slice(0, 300)}` }, 502);
      ref = (JSON.parse(ct) as { id: string }).id;
      await admin.from('projects').update({ supabase_project_ref: ref, supabase_managed: managed }).eq('id', projectId);
    }

    // Poll until healthy (bounded — resume on a later call if it's still coming up).
    let healthy = false;
    for (let i = 0; i < 16; i++) {
      const s = await api(`/projects/${ref}`);
      if (s.ok) { const st = (await s.json() as { status?: string }).status; if (st === 'ACTIVE_HEALTHY') { healthy = true; break; } }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!healthy) return json({ ok: false, status: 'provisioning', ref, message: 'Database is still spinning up — try again in a moment.' });

    // Fetch the anon key + write /.env.
    const keysRes = await api(`/projects/${ref}/api-keys`);
    if (!keysRes.ok) return json({ error: `Could not read project API keys (${keysRes.status}).`, ref }, 502);
    const keys = await keysRes.json() as { name?: string; api_key?: string }[];
    const anon = keys.find((k) => k.name === 'anon')?.api_key ?? keys[0]?.api_key;
    if (!anon) return json({ error: 'Could not find the anon API key.', ref }, 502);
    const url = `https://${ref}.supabase.co`;
    await admin.from('project_files').upsert(
      { project_id: projectId, path: '/.env', content: `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anon}\n`, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );

    // Apply the generated migration, if any.
    const { data: mig } = await admin.from('project_files').select('content').eq('project_id', projectId).eq('path', '/supabase/migrations/0001_init.sql').maybeSingle();
    let migrated = false;
    if (mig?.content) {
      const q = await api(`/projects/${ref}/database/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: mig.content }) });
      migrated = q.ok;
    }

    return json({ ok: true, status: 'ready', ref, url, migrated, managed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
