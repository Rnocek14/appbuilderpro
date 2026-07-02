// supabase/functions/project-logs/index.ts
// In-app edge-function logs for a user's app (the Lovable Cloud "Logs" parity feature).
// Proxies the Management API analytics endpoint (the same one Studio uses) with server-side SQL
// templates — the client picks a KIND, never sends SQL. Windows are capped at 24h (the API's
// hard limit; larger ranges fail silently). Timestamps come back in unix MICROseconds.
// Deploy: npx supabase functions deploy project-logs

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { projectSupabaseToken } from '../_shared/oauth.ts';

type Kind = 'invocations' | 'console' | 'errors';

// BigQuery-flavored SQL (Logflare backend). Nested metadata MUST go through unnest cross joins —
// dot-path filters silently match nothing. Keep all templates here; the backend dialect is
// migrating (ClickHouse) and this is the one place to update.
function sqlFor(kind: Kind, functionId?: string): string {
  const fnFilter = functionId ? `where m.function_id = '${functionId.replace(/[^a-zA-Z0-9-]/g, '')}'` : '';
  if (kind === 'invocations') {
    return `select id, function_edge_logs.timestamp, event_message, response.status_code, request.method, request.url, m.function_id, m.execution_time_ms
from function_edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as response
  cross join unnest(m.request) as request
${fnFilter}
order by timestamp desc limit 100`;
  }
  if (kind === 'console') {
    return `select id, function_logs.timestamp, event_message, m.level, m.event_type, m.function_id, m.execution_id
from function_logs cross join unnest(metadata) as m
${fnFilter}
order by timestamp desc limit 100`;
  }
  // errors: console errors/warnings + uncaught exceptions
  return `select id, function_logs.timestamp, event_message, m.level, m.event_type, m.function_id, m.execution_id
from function_logs cross join unnest(metadata) as m
where (m.level in ('error','warning') or m.event_type = 'UncaughtException')${functionId ? ` and m.function_id = '${functionId.replace(/[^a-zA-Z0-9-]/g, '')}'` : ''}
order by timestamp desc limit 100`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Auth + ownership (same confused-deputy guard as db-console/deploy-backend).
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string; kind?: Kind; functionSlug?: string; sinceIso?: string;
    };
    const { projectId } = body;
    const kind: Kind = body.kind === 'console' || body.kind === 'errors' ? body.kind : 'invocations';
    if (!projectId) return json({ error: 'projectId is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects')
      .select('id, owner_id, supabase_managed, supabase_project_ref').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);
    const projectRef = (project.supabase_project_ref as string | null) ?? '';
    if (!/^[a-z0-9]{16,40}$/i.test(projectRef)) return json({ error: 'This app has no database yet — set one up first.' }, 400);

    const token = await projectSupabaseToken(admin, user.id, (project.supabase_managed as boolean) ?? false);
    if (!token) return json({ error: 'Connect Supabase (Settings → Connections) to view logs.' }, 400);

    const api = (path: string) =>
      fetch(`https://api.supabase.com/v1/projects/${projectRef}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

    // Resolve slug → function_id (the logs tables key on the uuid, not the slug).
    let functionId: string | undefined;
    if (body.functionSlug) {
      const fr = await api('/functions');
      if (fr.ok) {
        const fns = (await fr.json()) as { id?: string; slug?: string }[];
        functionId = fns.find((f) => f.slug === body.functionSlug)?.id;
        if (!functionId) return json({ rows: [], functions: fns.map((f) => f.slug) });
      }
    }

    // Window: caller's since (clamped to 24h) → now.
    const now = Date.now();
    const since = body.sinceIso ? Date.parse(body.sinceIso) : now - 60 * 60 * 1000;
    const start = new Date(Math.max(Number.isFinite(since) ? since : now - 3600_000, now - 24 * 3600_000)).toISOString();
    const end = new Date(now).toISOString();

    const sql = sqlFor(kind, functionId);
    const r = await api(`/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}&iso_timestamp_start=${encodeURIComponent(start)}&iso_timestamp_end=${encodeURIComponent(end)}`);
    const text = await r.text();
    if (!r.ok) return json({ error: `Logs query failed (${r.status}): ${text.slice(0, 300)}` }, 200);
    let rows: Record<string, unknown>[] = [];
    try { rows = ((JSON.parse(text) as { result?: Record<string, unknown>[] }).result) ?? []; } catch { /* empty */ }
    // Normalize microsecond timestamps to ISO for the client.
    for (const row of rows) {
      const t = Number(row.timestamp);
      if (Number.isFinite(t) && t > 1e15) row.timestamp = new Date(t / 1000).toISOString();
    }
    return json({ rows, kind });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
