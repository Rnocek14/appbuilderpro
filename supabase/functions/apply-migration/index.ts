// supabase/functions/apply-migration/index.ts
// Applies a generated SQL migration to a user's Supabase project via the Management API.
//
// WHY THIS EXISTS: the browser cannot call api.supabase.com directly — the Management API
// returns no Access-Control-Allow-Origin, so CORS blocks it. This function runs the call
// server-side, where there is no CORS, using a Personal Access Token kept as an edge secret
// (never in the browser). This is how one-click "populate my database" works.
//
// ONE-TIME SETUP (the secret name must NOT start with SUPABASE_ — that prefix is reserved):
//   supabase functions deploy apply-migration --project-ref <ref>
//   supabase secrets set SB_MANAGEMENT_TOKEN=sbp_xxxxx --project-ref <ref>
//   (a Supabase Personal Access Token from https://supabase.com/dashboard/account/tokens
//    — note: full account scope)

import { corsHeaders } from '../_shared/ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const token = Deno.env.get('SB_MANAGEMENT_TOKEN');
    if (!token) {
      return json({ error: 'SB_MANAGEMENT_TOKEN secret is not set. Run: supabase secrets set SB_MANAGEMENT_TOKEN=<your Supabase personal access token>' }, 400);
    }

    const { projectRef, sql } = await req.json().catch(() => ({} as { projectRef?: string; sql?: string }));
    if (!projectRef || !sql) return json({ error: 'projectRef and sql are required.' }, 400);
    if (!/^[a-z0-9]{16,40}$/i.test(projectRef)) return json({ error: `Invalid project ref "${projectRef}".` }, 400);

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();
    if (!res.ok) {
      return json({ error: `Supabase Management API ${res.status}: ${text.slice(0, 600)}` }, res.status === 401 ? 401 : 502);
    }
    let result: unknown = null;
    try { result = text ? JSON.parse(text) : null; } catch { result = text; }
    return json({ ok: true, result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
