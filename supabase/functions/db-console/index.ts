// supabase/functions/db-console/index.ts
// In-app database viewer (Lovable-Cloud-style): runs SQL against the app's PROVISIONED Supabase project
// through the Management API, using the user's own Supabase OAuth token. Owner-guarded; only ever
// touches the caller's own database.
//   action 'tables' → list public base tables
//   action 'rows'   → paged select of one table
//   action 'query'  → run arbitrary SQL (the user's own DB / SQL editor)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { projectSupabaseToken } from '../_shared/oauth.ts';

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
    const { projectId, action, table, limit, offset, sql, pk, pkValue, set, values, name, secretValue, bucket } = (await req.json().catch(() => ({}))) as {
      projectId?: string; action?: string; table?: string; limit?: number; offset?: number; sql?: string;
      pk?: string; pkValue?: unknown; set?: Record<string, unknown>; values?: Record<string, unknown>;
      name?: string; secretValue?: string; bucket?: string;
    };
    if (!projectId) return json({ error: 'projectId is required.' }, 400);

    const { data: project } = await admin.from('projects').select('id, owner_id, supabase_project_ref, supabase_managed').eq('id', projectId).single();
    if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);
    const ref = project.supabase_project_ref as string | null;
    if (!ref) return json({ error: 'This app has no database yet — run "Set up database" first.' }, 400);

    const token = await projectSupabaseToken(admin, user.id, (project.supabase_managed as boolean) ?? false);
    if (!token) return json({ error: 'No Supabase token available for this database.' }, 400);

    const runSql = async (query: string): Promise<{ ok: boolean; rows?: unknown[]; error?: string }> => {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const t = await r.text();
      if (!r.ok) return { ok: false, error: `${r.status}: ${t.slice(0, 400)}` };
      try { const j = JSON.parse(t); return { ok: true, rows: Array.isArray(j) ? j : [] }; }
      catch { return { ok: true, rows: [] }; }
    };
    // Generic Management API call (secrets / functions / backups tabs).
    const api = async (path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: unknown }> => {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
      const t = await r.text();
      let body: unknown = null;
      try { body = t ? JSON.parse(t) : null; } catch { body = t; }
      return { ok: r.ok, status: r.status, body };
    };
    // safe SQL identifier + value escaping (used by editing + storage queries)
    const ident = (n: string): string => { if (!/^[A-Za-z0-9_]+$/.test(n)) throw new Error(`Invalid name "${n}"`); return `"${n}"`; };
    const lit = (v: unknown): string => {
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `'${s.replace(/'/g, "''")}'`;
    };

    // ---- Secrets (function secrets) ----
    if (action === 'secrets_list') {
      const a = await api('/secrets');
      if (!a.ok) return json({ error: `Secrets ${a.status}` }, 502);
      return json({ secrets: (Array.isArray(a.body) ? a.body : []).map((s) => ({ name: (s as { name: string }).name })) });
    }
    if (action === 'secret_set') {
      if (!name || !secretValue) return json({ error: 'name and secretValue are required.' }, 400);
      const a = await api('/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ name, value: secretValue }]) });
      return a.ok ? json({ ok: true }) : json({ error: `Set secret ${a.status}` }, 502);
    }
    if (action === 'secret_delete') {
      if (!name) return json({ error: 'name is required.' }, 400);
      const a = await api('/secrets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([name]) });
      return a.ok ? json({ ok: true }) : json({ error: `Delete secret ${a.status}` }, 502);
    }

    // ---- Auth users ----
    if (action === 'auth_users') {
      const r = await runSql(`select id, email, created_at, last_sign_in_at, raw_user_meta_data->>'full_name' as full_name from auth.users order by created_at desc limit 200`);
      return r.ok ? json({ rows: r.rows ?? [] }) : json({ error: r.error }, 502);
    }

    // ---- Storage ----
    if (action === 'storage_buckets') {
      const r = await runSql(`select id, name, public, created_at from storage.buckets order by created_at`);
      return r.ok ? json({ rows: r.rows ?? [] }) : json({ error: r.error }, 502);
    }
    if (action === 'storage_objects') {
      if (!bucket) return json({ error: 'bucket is required.' }, 400);
      const r = await runSql(`select name, created_at, (metadata->>'size')::bigint as size, metadata->>'mimetype' as mimetype from storage.objects where bucket_id=${lit(bucket)} order by created_at desc limit 200`);
      return r.ok ? json({ rows: r.rows ?? [] }) : json({ error: r.error }, 502);
    }

    // ---- Edge Functions ----
    if (action === 'functions_list') {
      const a = await api('/functions');
      if (!a.ok) return json({ error: `Functions ${a.status}` }, 502);
      const fns = (Array.isArray(a.body) ? a.body : []).map((f) => {
        const x = f as { slug: string; name: string; status: string; version: number; updated_at: number };
        return { slug: x.slug, name: x.name, status: x.status, version: x.version, updated_at: x.updated_at };
      });
      return json({ functions: fns });
    }

    // ---- Backups ----
    if (action === 'backups_list') {
      const a = await api('/database/backups');
      if (!a.ok) return json({ error: `Backups ${a.status}` }, 502);
      return json({ backups: a.body });
    }

    if (action === 'tables') {
      const r = await runSql(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);
      if (!r.ok) return json({ error: r.error }, 502);
      return json({ tables: (r.rows ?? []).map((x) => (x as { table_name: string }).table_name) });
    }

    if (action === 'rows') {
      if (!table || !/^[A-Za-z0-9_]+$/.test(table)) return json({ error: 'Invalid table name.' }, 400);
      const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const off = Math.max(Number(offset) || 0, 0);
      const r = await runSql(`select * from public."${table}" limit ${lim} offset ${off}`);
      if (!r.ok) return json({ error: r.error }, 502);
      const rows = r.rows ?? [];
      const columns = rows.length ? Object.keys(rows[0] as object) : [];
      return json({ rows, columns, limit: lim, offset: off });
    }

    if (action === 'query') {
      if (!sql || !sql.trim()) return json({ error: 'A SQL statement is required.' }, 400);
      const r = await runSql(sql);
      if (!r.ok) return json({ error: r.error }, 502);
      const rows = r.rows ?? [];
      return json({ rows, columns: rows.length ? Object.keys(rows[0] as object) : [] });
    }

    // ---- row editing (CC1) ----
    try {
      if (action === 'update') {
        if (!table || !pk || !set || !Object.keys(set).length) return json({ error: 'table, pk, and set are required.' }, 400);
        const sets = Object.entries(set).map(([c, v]) => `${ident(c)}=${lit(v)}`).join(', ');
        const r = await runSql(`update public.${ident(table)} set ${sets} where ${ident(pk)}=${lit(pkValue)}`);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, 502);
      }
      if (action === 'insert') {
        if (!table || !values || !Object.keys(values).length) return json({ error: 'table and values are required.' }, 400);
        const cols = Object.keys(values).map(ident).join(', ');
        const vals = Object.values(values).map(lit).join(', ');
        const r = await runSql(`insert into public.${ident(table)} (${cols}) values (${vals})`);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, 502);
      }
      if (action === 'delete') {
        if (!table || !pk) return json({ error: 'table and pk are required.' }, 400);
        const r = await runSql(`delete from public.${ident(table)} where ${ident(pk)}=${lit(pkValue)}`);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, 502);
      }
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Bad request.' }, 400);
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
