// src/lib/garvis/executeTool.ts
// Real implementations of the Garvis tools against the portfolio tables. This is data-access
// foundation — there is no reasoning here. RLS scopes every read/write to the owner; the
// explicit owner_id on inserts matches the schema's owner-scoped policies.

import { supabase } from '../supabase';
import { DIRECT } from '../aiConfig';
import { isToolAllowed } from './tools';
import { fetchRepoState } from './github';
import { shortScriptDirect } from './directBrain';
import { normalizeShortScript } from './knowledge';
import type { GarvisMode, GarvisToolCall, GarvisToolContext, GarvisToolResult } from './types';

const ALLOWED_RUN_KINDS = new Set(['research', 'content', 'build', 'analyze', 'recommend']);
const UPDATABLE_APP_FIELDS = new Set(['stage', 'goals', 'monthly_revenue', 'deploy_url', 'tags', 'description']);
const KNOWLEDGE_KINDS = new Set(['decision', 'outcome', 'lesson']);
const GOAL_STATUSES = new Set(['proposed', 'active', 'achieved', 'paused', 'abandoned']);
const CAP_SAFETY = new Set(['read_only', 'writes_data', 'external_action']);
const CAP_MATURITY = new Set(['stub', 'draft', 'working', 'production']);

/** Shared writer for log_decision / record_outcome — both propose a sourced assertion (status='proposed'). */
async function proposeKnowledge(
  kind: 'decision' | 'outcome',
  input: Record<string, unknown>,
  ctx: GarvisToolContext,
): Promise<unknown> {
  if (typeof input.title !== 'string' || typeof input.body !== 'string') {
    throw new Error(`${kind === 'decision' ? 'log_decision' : 'record_outcome'} requires title and body`);
  }
  const confidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : null;
  const tags = Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string') : [];
  const { data, error } = await supabase
    .from('garvis_knowledge')
    .insert({
      owner_id: ctx.ownerId,
      app_id: (typeof input.app_id === 'string' ? input.app_id : null) ?? ctx.appId,
      run_id: ctx.runId ?? null,
      kind,
      title: input.title,
      body: input.body,
      source: typeof input.source === 'string' ? input.source : 'run',
      confidence,
      tags,
      status: 'proposed',
    })
    .select('id').single();
  if (error) throw new Error(error.message);
  return { proposed_id: data.id, status: 'proposed', note: 'Awaiting your approval — not in memory until approved.' };
}

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

    case 'get_repo_state': {
      // Resolve the repo URL: prefer the app's stored repo_url (look it up by app_id), else accept
      // an explicit repo_url. Then read live, read-only state straight from GitHub.
      let repoUrl = typeof input.repo_url === 'string' ? input.repo_url : '';
      if (!repoUrl && typeof input.app_id === 'string') {
        const { data, error } = await supabase
          .from('apps').select('repo_url').eq('id', input.app_id).maybeSingle();
        if (error) throw new Error(error.message);
        repoUrl = (data?.repo_url as string) ?? '';
      }
      if (!repoUrl) throw new Error('get_repo_state needs app_id (with a repo_url) or repo_url');
      const state = await fetchRepoState(repoUrl);
      return { repo: state };
    }

    case 'get_app_profile': {
      if (typeof input.app_id !== 'string') throw new Error('get_app_profile requires app_id');
      const { data, error } = await supabase
        .from('garvis_app_profiles')
        .select('purpose, audience, business_model, current_state, blocker, next_milestone, stage_assessment, confidence, source, generated_at')
        .eq('app_id', input.app_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { profile: null, note: 'No profile generated for this app yet.' };
      return { profile: data };
    }

    case 'recall_knowledge': {
      // The approval gate on READS: only 'approved' knowledge is ever returned to the brain.
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 50) : 20;
      let q = supabase
        .from('garvis_knowledge')
        .select('id, app_id, kind, title, body, source, confidence, tags, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      if (Array.isArray(input.kinds)) {
        const kinds = input.kinds.filter((k): k is string => typeof k === 'string' && KNOWLEDGE_KINDS.has(k));
        if (kinds.length) q = q.in('kind', kinds);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { knowledge: data ?? [] };
    }

    case 'log_decision':
      return proposeKnowledge('decision', input, ctx);

    case 'record_outcome':
      return proposeKnowledge('outcome', input, ctx);

    case 'generate_short_script': {
      if (typeof input.topic !== 'string' || !input.topic.trim()) {
        throw new Error('generate_short_script requires a topic');
      }
      let scriptData: unknown;
      if (DIRECT) {
        // DIRECT mode: draft in the browser with the user's own key — no edge function required.
        scriptData = await shortScriptDirect(input);
      } else {
        const { data, error } = await supabase.functions.invoke('garvis-short-script', { body: input });
        if (error) throw new Error(`garvis-short-script invoke failed: ${error.message}`);
        scriptData = data;
      }
      // Stub-honesty enforced client-side too: fidelity/required_approval are forced regardless of output.
      return { short: normalizeShortScript(scriptData) };
    }

    case 'list_goals': {
      const status = typeof input.status === 'string' && GOAL_STATUSES.has(input.status) ? input.status : 'active';
      let q = supabase
        .from('garvis_goals')
        .select('id, app_id, title, description, priority, success_metric, target_date, status')
        .eq('status', status)
        .order('priority', { ascending: true });
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { goals: data ?? [] };
    }

    case 'list_capabilities': {
      let q = supabase
        .from('garvis_capabilities')
        .select('id, app_id, name, description, safety_level, approval_required, maturity')
        .eq('status', 'approved')
        .order('name', { ascending: true });
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { capabilities: data ?? [] };
    }

    case 'propose_goal': {
      if (typeof input.title !== 'string') throw new Error('propose_goal requires title');
      const { data, error } = await supabase
        .from('garvis_goals')
        .insert({
          owner_id: ctx.ownerId,
          app_id: (typeof input.app_id === 'string' ? input.app_id : null) ?? ctx.appId,
          title: input.title,
          description: typeof input.description === 'string' ? input.description : null,
          priority: typeof input.priority === 'number' ? input.priority : 3,
          success_metric: typeof input.success_metric === 'string' ? input.success_metric : null,
          target_date: typeof input.target_date === 'string' ? input.target_date : null,
          status: 'proposed',
        })
        .select('id').single();
      if (error) throw new Error(error.message);
      return { proposed_id: data.id, status: 'proposed', note: 'Awaiting your approval — not active until approved.' };
    }

    case 'register_capability': {
      if (typeof input.name !== 'string' || typeof input.description !== 'string') {
        throw new Error('register_capability requires name and description');
      }
      const safety = typeof input.safety_level === 'string' && CAP_SAFETY.has(input.safety_level) ? input.safety_level : 'read_only';
      const maturity = typeof input.maturity === 'string' && CAP_MATURITY.has(input.maturity) ? input.maturity : 'stub';
      const { data, error } = await supabase
        .from('garvis_capabilities')
        .insert({
          owner_id: ctx.ownerId,
          app_id: (typeof input.app_id === 'string' ? input.app_id : null) ?? ctx.appId,
          name: input.name,
          description: input.description,
          input_spec: typeof input.input_spec === 'string' ? input.input_spec : null,
          output_spec: typeof input.output_spec === 'string' ? input.output_spec : null,
          safety_level: safety,
          approval_required: typeof input.approval_required === 'boolean' ? input.approval_required : true,
          maturity,
          status: 'proposed',
        })
        .select('id').single();
      if (error) throw new Error(error.message);
      return { proposed_id: data.id, status: 'proposed', note: 'Awaiting your approval — not in the registry until approved.' };
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
