// supabase/functions/garvis-worker/index.ts
// The UNATTENDED Garvis runner — the server-side counterpart of src/lib/garvis/runtime.ts, so
// queued agent_runs execute with every laptop closed. A pg_cron tick (or a POST from anywhere
// with the worker secret, or any signed-in user "nudging") claims runnable runs across all
// owners and steps them exactly like the client chassis: mode-gated tools re-applied every
// step, checkpoints persisted every step, per-owner credit metering on every reasoning call,
// and a hard budget cap.
//
// Parity note: SYSTEM prompt, decision contract, and normalize() are kept aligned with
// garvis-brain/index.ts and src/lib/garvis/directBrain.ts (the established byte-alignment
// convention). The tool DEFINITIONS are imported from the client's single source of truth
// (src/lib/garvis/tools.ts — pure module); only the EXECUTOR is reimplemented here because the
// client one leans on RLS while the service role must scope every query to the run's owner.
//
// Deploy: npx supabase functions deploy garvis-worker
// Secrets: supabase secrets set WORKER_SECRET=<random>   (used by the cron tick / self-chain)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { complete, corsHeaders, parseJson, modelForPlan, type AIMessage, type AIProvider } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';
import { notifyText } from '../_shared/notify.ts';
import { cronAuthorized } from '../_shared/cronGate.ts';
import { stampHeartbeat } from '../_shared/heartbeat.ts';
import { toolsFor } from '../../../src/lib/garvis/tools.ts';

type Mode = 'observe' | 'plan' | 'act';
interface Msg { role: 'user' | 'assistant' | 'tool'; content: string }
interface RunRow {
  id: string; owner_id: string; app_id: string | null; kind: string; title: string; input: string | null;
  status: string; phase: Mode | null; checkpoint: { step: number; history: Msg[] } | null;
  spent_usd: number | null; budget_usd: number | null; retry_count: number | null;
}
type Decision =
  | { kind: 'tools'; calls: { name: string; input?: Record<string, unknown> }[] }
  | { kind: 'finish'; output: string; recommendation?: string }
  | { kind: 'await_approval'; question: string; options?: string[] };

const MAX_STEPS = 12;
const RUNS_PER_INVOCATION = 2; // stay well inside the edge wall clock; self-chain for the rest

// ---- decision seam (parity: garvis-brain/index.ts) ----

const SYSTEM = `You are Garvis — the reasoning core of a personal AI operating system that manages a
solo founder's portfolio of products (apps), their metrics, and the work done on them. You are not a
chatbot; you are one decision step inside an execution loop. The loop owns control flow, safety, and
budget. Your only job is to choose the single best next move and return it as JSON.

MODES (the loop fixes the mode for this run — you cannot change it):
- observe: read-only. Inspect the portfolio and metrics. You may NOT propose or mutate anything.
- plan:    read-only + you may propose ONE recommendation. Gather what you need, then finish.
- act:     read/write. You may also mutate the portfolio or enqueue follow-up runs.

THE GATE IS ABSOLUTE: you may ONLY call tools present in the AVAILABLE TOOLS list below. Tools for a
higher mode are deliberately withheld — never reference or attempt them. If the data you'd need to
act responsibly isn't available, say so in your finish output rather than guessing.

HOW TO WORK:
1. Read the task and the history (your prior tool calls and their results are included).
2. If you still need data, return {"kind":"tools", ...} with one or a few read calls. Don't re-fetch
   data already present in the history.
3. Once you have enough to answer the task, return {"kind":"finish", ...}. In plan mode, put the
   actionable recommendation in "recommendation" and your grounded reasoning in "output".
4. If you genuinely cannot proceed without a human decision, return {"kind":"await_approval", ...}.

CALIBRATION (this matters — the founder relies on it):
- Ground every claim about an app in data you actually fetched. Never invent apps, revenue, or
  metrics. If the portfolio is empty or thin, say exactly that — an honest "you have no metrics yet,
  here's how to start" beats a confident fabrication.
- Separate FACT (what the data shows) from JUDGMENT (what you'd do about it) and note confidence.
- Be specific and decisive. One clear recommended next action, with the reason, beats a survey.

OUTPUT: respond with EXACTLY ONE JSON object and nothing else (no prose, no markdown fences):
  {"kind":"tools","calls":[{"name":"<tool>","input":{ ... }}]}
  {"kind":"finish","output":"<reasoning grounded in the data>","recommendation":"<one next action, or omit in observe mode>"}
  {"kind":"await_approval","question":"<what you need decided>","options":["..."]}`;

function buildUserMessage(run: RunRow, mode: Mode, history: Msg[], tools: { name: string; description: string; inputSchema: Record<string, unknown> }[]): string {
  const toolLines = tools.map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.inputSchema)}`).join('\n');
  const transcript = history.length
    ? history.map((m) => (m.role === 'tool' ? `TOOL RESULT: ${m.content}` : `${m.role.toUpperCase()}: ${m.content}`)).join('\n')
    : '(no steps taken yet — this is your first decision)';
  return [
    `MODE: ${mode}`,
    `TASK: ${run.title}`,
    run.input ? `TASK DETAIL: ${run.input}` : '',
    run.app_id ? `SCOPED TO APP: ${run.app_id}` : 'SCOPE: entire portfolio',
    '',
    'AVAILABLE TOOLS (you may call ONLY these):',
    toolLines || '(none)',
    '',
    'HISTORY SO FAR:',
    transcript,
    '',
    'Return your single JSON decision now.',
  ].filter(Boolean).join('\n');
}

function normalize(raw: Decision, allowed: Set<string>): Decision {
  if (raw?.kind === 'tools') {
    const calls = (raw.calls ?? []).filter((c) => c && allowed.has(c.name));
    if (!calls.length) return { kind: 'finish', output: 'No valid tool call was produced for this mode.' };
    return { kind: 'tools', calls: calls.map((c) => ({ name: c.name, input: c.input ?? {} })) };
  }
  if (raw?.kind === 'await_approval') {
    return { kind: 'await_approval', question: String(raw.question ?? 'Decision needed.'), options: raw.options };
  }
  return { kind: 'finish', output: String((raw as { output?: string })?.output ?? 'Done.'), recommendation: (raw as { recommendation?: string })?.recommendation };
}

// ---- server tool executor (owner-scoped port of src/lib/garvis/executeTool.ts) ----

const ALLOWED_RUN_KINDS = new Set(['research', 'content', 'build', 'analyze', 'recommend']);
const UPDATABLE_APP_FIELDS = new Set(['stage', 'goals', 'monthly_revenue', 'deploy_url', 'tags', 'description']);
const KNOWLEDGE_KINDS = new Set(['decision', 'outcome', 'lesson']);
const GOAL_STATUSES = new Set(['proposed', 'active', 'achieved', 'paused', 'abandoned']);

interface Ctx { db: SupabaseClient; ownerId: string; appId: string | null; runId: string; provider: AIProvider; model: string }

async function proposeKnowledge(kind: 'decision' | 'outcome', input: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
  if (typeof input.title !== 'string' || typeof input.body !== 'string') throw new Error(`${kind} proposal requires title and body`);
  const confidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : null;
  const { data, error } = await ctx.db.from('garvis_knowledge').insert({
    owner_id: ctx.ownerId,
    app_id: (typeof input.app_id === 'string' ? input.app_id : null) ?? ctx.appId,
    run_id: ctx.runId,
    kind, title: input.title, body: input.body,
    source: typeof input.source === 'string' ? input.source : 'run',
    confidence,
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string') : [],
    status: 'proposed',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { proposed_id: data.id, status: 'proposed', note: 'Awaiting your approval — not in memory until approved.' };
}

/** GitHub public-state read (server port of src/lib/garvis/github.ts fetchRepoState basics). */
async function repoState(repoUrl: string): Promise<unknown> {
  const m = /github\.com\/([^/]+)\/([^/#?]+)/.exec(repoUrl);
  if (!m) throw new Error('Not a GitHub repo URL');
  const gh = (path: string) => fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FableForge-Garvis' } });
  const repoRes = await gh(`/repos/${m[1]}/${m[2].replace(/\.git$/, '')}`);
  if (!repoRes.ok) throw new Error(`GitHub returned ${repoRes.status}`);
  const r = await repoRes.json();
  const commitsRes = await gh(`/repos/${m[1]}/${m[2].replace(/\.git$/, '')}/commits?per_page=5`);
  const commits = commitsRes.ok ? (await commitsRes.json() as { commit?: { message?: string } }[]).map((c) => c.commit?.message?.split('\n')[0] ?? '') : [];
  return {
    description: r.description, pushed_at: r.pushed_at, language: r.language,
    open_issues: r.open_issues_count, archived: r.archived, fork: r.fork,
    homepage: r.homepage, recent_commits: commits,
  };
}

async function dispatch(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
  const { db, ownerId } = ctx;
  switch (name) {
    case 'list_apps': {
      let q = db.from('apps').select('id, name, slug, stage, monthly_revenue, tags, deploy_url, repo_url, updated_at')
        .eq('owner_id', ownerId).is('deleted_at', null).order('updated_at', { ascending: false });
      if (!input.include_archived) q = q.eq('archived', false);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { apps: data ?? [] };
    }
    case 'get_app': {
      let q = db.from('apps').select('*').eq('owner_id', ownerId).is('deleted_at', null).limit(1);
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
      const { data, error } = await db.from('app_metrics')
        .select('metric_date, source, visitors, signups, active_users, revenue')
        .eq('owner_id', ownerId).eq('app_id', input.app_id)
        .order('metric_date', { ascending: false }).limit(days);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const sum = (k: string) => rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[k] ?? 0), 0);
      return { rows, totals: { visitors: sum('visitors'), signups: sum('signups'), revenue: sum('revenue') } };
    }
    case 'recent_runs': {
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 50) : 10;
      let q = db.from('agent_runs').select('id, app_id, kind, title, status, recommendation, created_at, finished_at')
        .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(limit);
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { runs: data ?? [] };
    }
    case 'get_repo_state': {
      let repoUrl = typeof input.repo_url === 'string' ? input.repo_url : '';
      if (!repoUrl && typeof input.app_id === 'string') {
        const { data } = await db.from('apps').select('repo_url').eq('owner_id', ownerId).eq('id', input.app_id).maybeSingle();
        repoUrl = (data?.repo_url as string) ?? '';
      }
      if (!repoUrl) throw new Error('get_repo_state needs app_id (with a repo_url) or repo_url');
      return { repo: await repoState(repoUrl) };
    }
    case 'get_app_profile': {
      if (typeof input.app_id !== 'string') throw new Error('get_app_profile requires app_id');
      const { data, error } = await db.from('garvis_app_profiles')
        .select('purpose, audience, business_model, current_state, blocker, next_milestone, stage_assessment, confidence, source, generated_at')
        .eq('owner_id', ownerId).eq('app_id', input.app_id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { profile: data } : { profile: null, note: 'No profile generated for this app yet.' };
    }
    case 'recall_knowledge': {
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 50) : 20;
      let q = db.from('garvis_knowledge').select('id, app_id, kind, title, body, source, confidence, tags, created_at')
        .eq('owner_id', ownerId).eq('status', 'approved').order('created_at', { ascending: false }).limit(limit);
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      if (Array.isArray(input.kinds)) {
        const kinds = input.kinds.filter((k): k is string => typeof k === 'string' && KNOWLEDGE_KINDS.has(k));
        if (kinds.length) q = q.in('kind', kinds);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { knowledge: data ?? [] };
    }
    case 'log_decision': return proposeKnowledge('decision', input, ctx);
    case 'record_outcome': return proposeKnowledge('outcome', input, ctx);
    case 'generate_short_script': {
      if (typeof input.topic !== 'string' || !input.topic.trim()) throw new Error('generate_short_script requires a topic');
      // Parity with garvis-short-script: draft via complete(), stamp script-only honesty here.
      const s = (k: string) => (typeof input[k] === 'string' ? String(input[k]) : '');
      const res = await complete([
        { role: 'system', content: 'You are a senior short-form video scriptwriter. Produce a SCRIPT ONLY. Output EXACTLY ONE JSON object: {"hook":str,"script":str,"caption":str,"cta":str,"visual_beats":[str],"confidence":num}. Ground in provided material; never imply a rendered video.' },
        { role: 'user', content: `TOPIC: ${s('topic')}\nAUDIENCE: ${s('audience')}\nGOAL: ${s('goal')}\nPLATFORM: ${s('platform') || 'short-form'}\nSOURCE: ${s('source_material')}` },
      ] as AIMessage[], { maxTokens: 1200, provider: ctx.provider, model: ctx.model });
      const parsed: Record<string, unknown> = parseJson<Record<string, unknown>>(res.text) ?? { script: res.text };
      return { short: { ...parsed, fidelity: 'script_only', required_approval: true } };
    }
    case 'list_goals': {
      const status = typeof input.status === 'string' && GOAL_STATUSES.has(input.status) ? input.status : 'active';
      let q = db.from('garvis_goals').select('id, app_id, title, description, priority, success_metric, target_date, status')
        .eq('owner_id', ownerId).eq('status', status).order('priority', { ascending: true });
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { goals: data ?? [] };
    }
    case 'list_capabilities': {
      let q = db.from('garvis_capabilities').select('id, app_id, name, description, safety_level, approval_required, maturity')
        .eq('owner_id', ownerId).eq('status', 'approved').order('name', { ascending: true });
      if (typeof input.app_id === 'string') q = q.eq('app_id', input.app_id);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { capabilities: data ?? [] };
    }
    case 'propose_goal': {
      if (typeof input.title !== 'string') throw new Error('propose_goal requires title');
      const { data, error } = await db.from('garvis_goals').insert({
        owner_id: ownerId,
        app_id: (typeof input.app_id === 'string' ? input.app_id : null) ?? ctx.appId,
        title: input.title,
        description: typeof input.description === 'string' ? input.description : null,
        priority: typeof input.priority === 'number' ? input.priority : 3,
        success_metric: typeof input.success_metric === 'string' ? input.success_metric : null,
        target_date: typeof input.target_date === 'string' ? input.target_date : null,
        status: 'proposed',
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { proposed_id: data.id, status: 'proposed', note: 'Awaiting your approval.' };
    }
    case 'register_capability': {
      if (typeof input.name !== 'string' || typeof input.description !== 'string') throw new Error('register_capability requires name and description');
      const { data, error } = await db.from('garvis_capabilities').insert({
        owner_id: ownerId,
        app_id: (typeof input.app_id === 'string' ? input.app_id : null) ?? ctx.appId,
        name: input.name, description: input.description,
        input_spec: typeof input.input_spec === 'string' ? input.input_spec : null,
        output_spec: typeof input.output_spec === 'string' ? input.output_spec : null,
        safety_level: 'read_only', approval_required: true, maturity: 'stub', status: 'proposed',
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { proposed_id: data.id, status: 'proposed', note: 'Awaiting your approval.' };
    }
    case 'propose_recommendation': {
      if (typeof input.title !== 'string' || typeof input.rationale !== 'string') throw new Error('propose_recommendation requires title and rationale');
      return { proposed: { title: input.title, rationale: input.rationale, app_id: input.app_id ?? null } };
    }
    case 'update_app': {
      if (typeof input.id !== 'string' || typeof input.patch !== 'object' || input.patch === null) throw new Error('update_app requires id and patch');
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input.patch as Record<string, unknown>)) if (UPDATABLE_APP_FIELDS.has(k)) patch[k] = v;
      if (!Object.keys(patch).length) throw new Error('update_app: no updatable fields in patch');
      const { error } = await db.from('apps').update(patch).eq('owner_id', ownerId).eq('id', input.id);
      if (error) throw new Error(error.message);
      return { ok: true, updated: Object.keys(patch) };
    }
    case 'enqueue_run': {
      const kind = String(input.kind);
      if (!ALLOWED_RUN_KINDS.has(kind)) throw new Error(`enqueue_run: invalid kind "${kind}"`);
      if (typeof input.title !== 'string') throw new Error('enqueue_run requires title');
      const { data, error } = await db.from('agent_runs').insert({
        owner_id: ownerId,
        app_id: (input.app_id as string) ?? null,
        kind, title: input.title, status: 'queued',
        input: (input.input as string) ?? null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { ok: true, run_id: data.id };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- the run loop (parity: src/lib/garvis/runtime.ts) ----

const MAX_RETRIES = 3;
// A transient AI/network blip must not kill a checkpointed run (the job-worker lesson, app_0058 →
// app_0086). These substrings mark errors worth retrying; anything else (a 4xx other than 429,
// validation, a real logic failure) fails terminally.
const isTransient = (m: string) => /\b(429|50[0-9]|52[0-9]|timeout|timed ?out|overloaded|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|fetch failed|temporarily|rate.?limit(ed)?|service unavailable)\b/i.test(m);

/** Terminal-or-retry seam for a run that threw. TRANSIENT (network, 429, 5xx) and under the cap →
 *  requeue with exponential backoff (5m→10m→20m, capped 1h — sized for the cron tick); the claim
 *  functions skip the run until next_attempt_at passes (app_0086), and the checkpoint means the
 *  re-claim resumes the same step instead of restarting. Anything else fails honestly, with the
 *  same terminal record + mind_event as before. */
async function failOrRetry(db: SupabaseClient, run: RunRow, msg: string): Promise<void> {
  const attempts = (run.retry_count ?? 0) + 1;
  if (isTransient(msg) && attempts <= MAX_RETRIES) {
    await db.from('agent_runs').update({
      status: 'queued', retry_count: attempts,
      next_attempt_at: new Date(Date.now() + Math.min(3_600_000, 5 * 60_000 * 2 ** (attempts - 1))).toISOString(),
      error: `transient error — retry ${attempts}/${MAX_RETRIES} after backoff: ${msg.slice(0, 400)}`,
      lease_until: null,
    }).eq('id', run.id);
    return;
  }
  await db.from('agent_runs').update({
    status: 'failed', retry_count: attempts, error: msg.slice(0, 500),
    finished_at: new Date().toISOString(), lease_until: null,
  }).eq('id', run.id);
  await db.from('mind_events').insert({
    owner_id: run.owner_id, app_id: run.app_id, source: 'agent_run', event_type: 'agent_run_failed',
    subject: `Run failed: ${run.title} — ${msg.slice(0, 140)}`.replace(/\s+/g, ' ').trim().slice(0, 280),
    payload: { run_id: run.id, mode: run.phase ?? 'observe', worker: true },
  }).then(() => {}, () => {});
}

async function executeRun(db: SupabaseClient, run: RunRow): Promise<void> {
  const mode: Mode = run.phase ?? 'observe';
  const history: Msg[] = run.checkpoint?.history ? [...run.checkpoint.history] : [];
  let step = run.checkpoint?.step ?? 0;
  let spent = Number(run.spent_usd ?? 0);
  const persist = (patch: Record<string, unknown>) => db.from('agent_runs').update(patch).eq('id', run.id);
  const finishEvent = (event_type: string, subject: string) =>
    db.from('mind_events').insert({
      owner_id: run.owner_id, app_id: run.app_id, source: 'agent_run', event_type,
      subject: subject.replace(/\s+/g, ' ').trim().slice(0, 280), payload: { run_id: run.id, mode, worker: true },
    }).then(() => {}, () => {});

  const m = modelForPlan(await getUserPlan(db, run.owner_id));
  const tools = toolsFor(mode);
  const allowed = new Set(tools.map((t) => t.name));
  const ctx: Ctx = { db, ownerId: run.owner_id, appId: run.app_id, runId: run.id, provider: m.provider, model: m.model };

  for (; step < MAX_STEPS; step++) {
    // Per-step credit gate — same metering the interactive garvis-brain applies.
    try { await checkCredits(db, run.owner_id, 'garvis'); } catch (e) {
      const msg = e instanceof InsufficientCreditsError ? e.message : String(e);
      await persist({ status: 'paused', error: msg.slice(0, 500), lease_until: null });
      return;
    }

    let decision: Decision;
    let stepCost = 0;
    try {
      const res = await complete([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserMessage(run, mode, history, tools) },
      ] as AIMessage[], { maxTokens: 1500, provider: m.provider, model: m.model });
      stepCost = res.costUsd;
      await spendCredits(db, run.owner_id, {
        costUsd: res.costUsd, kind: 'garvis', provider: m.provider, model: m.model,
        inputTokens: res.inputTokens, outputTokens: res.outputTokens,
      });
      // parseJson returns null on garbage (never throws) — fail soft into a finish either way.
      const rawDecision = parseJson<Decision>(res.text);
      try { decision = rawDecision ? normalize(rawDecision, allowed) : { kind: 'finish', output: res.text.slice(0, 2000) || 'The model returned no parseable decision.' }; }
      catch { decision = { kind: 'finish', output: res.text.slice(0, 2000) || 'The model returned no parseable decision.' }; }
    } catch (e) {
      // Retry-or-fail seam: a transient 5xx/429/network error backs the run off instead of killing
      // it; the checkpoint persisted after the last completed step, so the re-claim resumes here.
      await failOrRetry(db, run, e instanceof Error ? e.message : String(e));
      return;
    }
    spent += stepCost;

    if (decision.kind === 'await_approval') {
      await persist({ status: 'waiting_approval', spent_usd: spent, output: decision.question, checkpoint: { step, history }, lease_until: null });
      const { data: owner } = await db.from('profiles').select('webhook_url').eq('id', run.owner_id).single();
      await notifyText((owner as { webhook_url?: string } | null)?.webhook_url,
        `❓ Garvis needs a decision — ${run.title}\n${decision.question}`);
      return;
    }
    if (decision.kind === 'finish') {
      await persist({
        status: 'succeeded', output: decision.output, recommendation: decision.recommendation ?? null,
        spent_usd: spent, cost_usd: spent, finished_at: new Date().toISOString(), checkpoint: { step, history }, lease_until: null,
      });
      await finishEvent('agent_run_finished', `Run finished: ${run.title}${decision.recommendation ? ` — rec: ${decision.recommendation.slice(0, 120)}` : ''}`);
      return;
    }

    for (const call of decision.calls) {
      let output: unknown;
      try { output = await dispatch(call.name, call.input ?? {}, ctx); }
      catch (e) { output = { error: e instanceof Error ? e.message : String(e) }; }
      history.push({ role: 'assistant', content: `call ${call.name}(${JSON.stringify(call.input ?? {})})` });
      history.push({ role: 'tool', content: JSON.stringify(output).slice(0, 4000) });
    }

    await persist({
      spent_usd: spent,
      checkpoint: { step: step + 1, history },
      lease_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      retry_count: 0, next_attempt_at: null,   // real progress resets the transient-retry budget
    });
    run.retry_count = 0;   // keep the in-memory row honest for a later step's failOrRetry

    if (spent >= Number(run.budget_usd ?? 0.5)) {
      await persist({ status: 'paused', error: `Budget cap of $${Number(run.budget_usd ?? 0.5).toFixed(2)} reached.`, lease_until: null });
      return;
    }
  }
  await db.from('agent_runs').update({ status: 'paused', error: `Step cap of ${MAX_STEPS} reached.`, lease_until: null }).eq('id', run.id);
}

// ---- entry: cron tick / secret POST / signed-in nudge ----

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const bySecret = cronAuthorized(req);
  if (!bySecret) {
    // Any signed-in user may nudge the worker (it only ever runs owner-scoped work).
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Stamp liveness only for real clock ticks — a user nudge proves nothing about the cron.
  if (bySecret) await stampHeartbeat(db, 'garvis-worker-tick');
  let processed = 0;
  for (; processed < RUNS_PER_INVOCATION; processed++) {
    const { data, error } = await db.rpc('claim_next_agent_run_service');
    if (error) return json({ error: error.message, processed }, 500);
    const run = ((data as RunRow[] | null) ?? [])[0];
    if (!run) break;
    try { await executeRun(db, run); }
    catch (e) {
      // Anything escaping executeRun goes through the same retry-or-fail gate as an in-step error.
      await failOrRetry(db, run, e instanceof Error ? e.message : String(e));
    }
  }

  // Queue still non-empty? Chain another invocation (fire-and-forget) instead of blowing the clock.
  const chainSecret = Deno.env.get('WORKER_SECRET');
  if (processed === RUNS_PER_INVOCATION && bySecret && chainSecret) {
    const { count } = await db.from('agent_runs').select('id', { count: 'exact', head: true })
      .in('status', ['queued'])
      // Runs parked in transient backoff aren't claimable yet — don't chain an invocation for them.
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
      .limit(1);
    if ((count ?? 0) > 0) {
      void fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/garvis-worker`, {
        method: 'POST', headers: { 'x-worker-secret': chainSecret, 'content-type': 'application/json' }, body: '{}',
      }).catch(() => {});
    }
  }

  return json({ ok: true, processed });
});
