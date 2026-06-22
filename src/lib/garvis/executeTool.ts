// src/lib/garvis/executeTool.ts
// Real implementations of the Garvis tools against the portfolio tables. This is data-access
// foundation — there is no reasoning here. RLS scopes every read/write to the owner; the
// explicit owner_id on inserts matches the schema's owner-scoped policies.

import { supabase } from '../supabase';
import { isToolAllowed } from './tools';
import type { GarvisMode, GarvisToolCall, GarvisToolContext, GarvisToolResult } from './types';

const ALLOWED_RUN_KINDS = new Set(['research', 'content', 'build', 'analyze', 'recommend']);
const UPDATABLE_APP_FIELDS = new Set(['stage', 'goals', 'monthly_revenue', 'deploy_url', 'tags', 'description']);

export async function executeTool(
  call: GarvisToolCall,
  mode: GarvisMode,
  ctx: GarvisToolContext,
): Promise<GarvisToolResult> {
  // Defense-in-depth: the runtime only offers gated tools, but re-check here too.
  if (!isToolAllowed(call.name, mode)) {
    return { id: call.id, name: call.name, output: { error: `Tool "${call.name}" is not allowed in ${mode} mode.` } };
  }

  try {
    const output = await dispatch(call, ctx);
    return { id: call.id, name: call.name, output };
  } catch (e) {
    return { id: call.id, name: call.name, output: { error: e instanceof Error ? e.message : String(e) } };
  }
}

async function dispatch(call: GarvisToolCall, ctx: GarvisToolContext): Promise<unknown> {
  const input = call.input ?? {};

  switch (call.name) {
    case 'list_apps': {
      let q = supabase
        .from('apps')
        .select('id, name, slug, stage, monthly_revenue, tags, deploy_url, repo_url, updated_at')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (!input.include_archived) q = q.eq('archived', false);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { apps: data ?? [] };
    }

    case 'get_app': {
      let q = supabase.from('apps').select('*').is('deleted_at', null).limit(1);
      if (typeof input.id === 'string') q = q.eq('id', input.id);
      else if (typeof input.slug === 'string') q = q.eq('slug', input.slug);
      else throw new Error('get_app requires id or slug');
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(error.message);
      return { app: data };
    }

    case 'query_metrics': {
      if (typeof input.app_id !== 'string') throw new Error('query_metrics requires app_id');
      const days = typeof input.days === 'number' ? input.days : 30;
      const { data, error } = await supabase
        .from('app_metrics')
        .select('metric_date, source, visitors, signups, active_users, revenue')
        .eq('app_id', input.app_id)
        .order('metric_date', { ascending: false })
        .limit(days);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const sum = (k: 'visitors' | 'signups' | 'active_users' | 'revenue') =>
        rows.reduce((s, r) => s + Number((r as Record<string, number>)[k] ?? 0), 0);
      return { rows, totals: { visitors: sum('visitors'), signups: sum('signups'), revenue: sum('revenue') } };
    }

    case 'recent_runs': {
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 50) : 10;
      let q = supabase
        .from('agent_runs')
        .select('id, app_id, kind, title, status, recommendation, created_at, finished_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { runs: data ?? [] };
    }

    case 'propose_recommendation': {
      // No side effects — the finish step persists the chosen recommendation. This tool just
      // lets the model structure a proposal (and is gated to plan/act so it can't write).
      if (typeof input.title !== 'string' || typeof input.rationale !== 'string') {
        throw new Error('propose_recommendation requires title and rationale');
      }
      return { proposed: { title: input.title, rationale: input.rationale, app_id: input.app_id ?? null } };
    }

    case 'update_app': {
      if (typeof input.id !== 'string' || typeof input.patch !== 'object' || input.patch === null) {
        throw new Error('update_app requires id and patch');
      }
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input.patch as Record<string, unknown>)) {
        if (UPDATABLE_APP_FIELDS.has(k)) patch[k] = v;
      }
      if (Object.keys(patch).length === 0) throw new Error('update_app: no updatable fields in patch');
      const { error } = await supabase.from('apps').update(patch).eq('id', input.id);
      if (error) throw new Error(error.message);
      return { ok: true, updated: Object.keys(patch) };
    }

    case 'enqueue_run': {
      const kind = String(input.kind);
      if (!ALLOWED_RUN_KINDS.has(kind)) throw new Error(`enqueue_run: invalid kind "${kind}"`);
      if (typeof input.title !== 'string') throw new Error('enqueue_run requires title');
      const { data, error } = await supabase
        .from('agent_runs')
        .insert({
          owner_id: ctx.ownerId,
          app_id: (input.app_id as string) ?? null,
          kind,
          title: input.title,
          status: 'queued',
          input: (input.input as string) ?? null,
        })
        .select('id').single();
      if (error) throw new Error(error.message);
      return { ok: true, run_id: data.id };
    }

    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}
