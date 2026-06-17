// supabase/functions/job-worker/index.ts
// Autopilot worker. Each invocation claims one job and executes ONE phase step
// (decompose → per-milestone build/validate/fix → report), checkpointing to the
// jobs row after every step so runs survive crashes and function time limits.
// While work remains it self-chains (re-invokes itself); a cron tick or the app
// pinging this endpoint keeps the queue draining.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, parseJson, corsHeaders } from '../_shared/ai.ts';
import { contextPayload } from '../_shared/context.ts';
import { notify } from '../_shared/notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_CHAIN = 25; // safety cap on self-invocations per kick

const DECOMPOSE_SYSTEM = `You are FableForge's planning engine. You receive a product brief for a
small React app (plain JS, /App.js entry, /styles.css — or an imported Vite project whose
conventions you must follow). Decompose the brief into 2-6 concrete build milestones, each
shippable and verifiable on its own. If a genuinely product-shaping decision is ambiguous
(e.g. auth model, payment approach), add a question instead of guessing — but only when the
answer would change what you build. Respond ONLY with JSON:
{"milestones": [{"title": "...", "description": "what exactly to build"}],
 "questions": [{"question": "...", "context": "why it matters", "options": ["A", "B"], "blocking": true|false}]}`;

const BUILD_SYSTEM = `You are FableForge's build engine working unattended on one milestone of a
larger brief. Modify ONLY files needed for this milestone; preserve everything else. Follow the
project conventions exactly. If something is ambiguous, make the reasonable choice and record it
as a decision — do NOT stall. Respond ONLY with JSON:
{"changes": [{"path": "/...", "content": "FULL file content"}], "deletions": ["/..."],
 "summary": "1-2 sentences on what was built",
 "conventions": "updated conventions text if anything new was established, else null",
 "decisions": [{"decision": "...", "reason": "..."}]}`;

const VALIDATE_SYSTEM = `You are FableForge's validation gate. Review the files for: syntax errors,
broken imports/references, undefined components, missing loading/empty/error states on data-driven
views, hardcoded styles that fight the app's design system, and obviously non-responsive layout.
Respond ONLY with JSON: {"ok": true|false, "problems": ["specific, fixable problem", ...]}`;

const FIX_SYSTEM = `You are FableForge's repair engine. Fix EXACTLY the listed problems with minimal
targeted changes. Respond ONLY with JSON:
{"changes": [{"path": "/...", "content": "FULL file content"}], "deletions": ["/..."]}`;

const REPORT_SYSTEM = `Write the overnight build report a developer reads with coffee. Respond ONLY
with JSON: {"summary": "2-3 sentence overview", "built": ["..."], "concerns": ["..."], "skipped": ["..."]}`;

type Job = {
  id: string; owner_id: string; project_id: string; title: string; brief: string;
  status: string; phase: string; milestone_index: number; fix_attempts: number;
  budget_usd: number; spent_usd: number; max_fix_attempts: number;
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function loadProjectContext(job: Job) {
  const [{ data: files }, { data: memory }, { data: answered }, { data: project }] = await Promise.all([
    admin.from('project_files').select('path, content').eq('project_id', job.project_id).is('deleted_at', null),
    admin.from('project_memory').select('*').eq('project_id', job.project_id).maybeSingle(),
    admin.from('agent_questions').select('question, answer').eq('job_id', job.id).eq('status', 'answered'),
    admin.from('projects').select('name').eq('id', job.project_id).single(),
  ]);
  return { files: files ?? [], memory, answered: answered ?? [], projectName: project?.name ?? 'project' };
}

function memoryBlock(memory: { conventions?: string; decisions?: unknown[] } | null): string {
  if (!memory) return 'No project memory yet.';
  return `Conventions:\n${memory.conventions || '(none)'}\nDecisions so far:\n${JSON.stringify(memory.decisions ?? [])}`;
}

async function spend(job: Job, costUsd: number, tokens: { inputTokens: number; outputTokens: number }, kind: string) {
  job.spent_usd = Number(job.spent_usd) + costUsd;
  await admin.from('jobs').update({ spent_usd: job.spent_usd, updated_at: new Date().toISOString() }).eq('id', job.id);
  await admin.from('usage_events').insert({
    user_id: job.owner_id, project_id: job.project_id, event_type: `job.${kind}`,
    input_tokens: tokens.inputTokens, output_tokens: tokens.outputTokens, cost_usd: costUsd,
  });
}

async function pause(job: Job, reason: string, projectName: string, webhook?: string | null) {
  await admin.from('jobs').update({ status: 'paused', pause_reason: reason, lease_until: null }).eq('id', job.id);
  await notify(webhook, {
    event: 'job.paused', jobTitle: job.title, projectName, detail: reason, spentUsd: job.spent_usd,
  });
}

function overBudget(job: Job): boolean {
  return Number(job.spent_usd) >= Number(job.budget_usd);
}

async function applyChanges(job: Job, changes: { path: string; content: string }[], deletions: string[]) {
  for (const c of changes) {
    await admin.from('project_files').upsert(
      { project_id: job.project_id, path: c.path, content: c.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of deletions) {
    await admin.from('project_files').update({ deleted_at: new Date().toISOString() })
      .eq('project_id', job.project_id).eq('path', path);
  }
}

async function insertQuestions(
  job: Job,
  questions: { question: string; context?: string; options?: string[]; blocking?: boolean }[],
): Promise<boolean> {
  let hasBlocking = false;
  for (const q of questions) {
    await admin.from('agent_questions').insert({
      job_id: job.id, project_id: job.project_id, owner_id: job.owner_id,
      question: q.question, context: q.context ?? null, options: q.options ?? [], blocking: q.blocking !== false,
    });
    if (q.blocking !== false) hasBlocking = true;
  }
  return hasBlocking;
}

/** Executes exactly one phase step. Returns true if the job still has work. */
async function step(job: Job): Promise<boolean> {
  const ctx = await loadProjectContext(job);
  const { data: profile } = await admin.from('profiles').select('webhook_url').eq('id', job.owner_id).single();
  const webhook = profile?.webhook_url;

  if (overBudget(job)) {
    await pause(job, `Budget cap of $${Number(job.budget_usd).toFixed(2)} reached.`, ctx.projectName, webhook);
    return false;
  }

  const answeredBlock = ctx.answered.length
    ? `Answered questions (treat as requirements):\n${ctx.answered.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n')}\n`
    : '';

  // ---------- decompose ----------
  if (job.phase === 'decompose') {
    const res = await complete([
      { role: 'system', content: DECOMPOSE_SYSTEM },
      { role: 'user', content:
        `Brief: ${job.brief}\n\nProject memory:\n${memoryBlock(ctx.memory)}\n\n${answeredBlock}` +
        `Existing files (tree only):\n${ctx.files.map((f) => f.path).join('\n') || '(empty project)'}` },
    ], { maxTokens: 4000 });
    await spend(job, res.costUsd, res, 'decompose');
    const plan = parseJson<{ milestones: { title: string; description: string }[]; questions?: never[] }>(res.text);

    const milestones = (plan.milestones ?? []).slice(0, 8);
    for (let i = 0; i < milestones.length; i++) {
      await admin.from('job_milestones').insert({
        job_id: job.id, position: i, title: milestones[i].title, description: milestones[i].description,
      });
    }
    const hasBlocking = await insertQuestions(job, (plan.questions ?? []) as never[]);
    if (hasBlocking) {
      await admin.from('jobs').update({ status: 'waiting_approval', phase: 'build', milestone_index: 0, lease_until: null }).eq('id', job.id);
      await notify(webhook, {
        event: 'job.waiting_approval', jobTitle: job.title, projectName: ctx.projectName,
        detail: 'The agent has questions before building. Answer them in the FableForge inbox.', spentUsd: job.spent_usd,
      });
      return false;
    }
    await admin.from('jobs').update({ phase: 'build', milestone_index: 0 }).eq('id', job.id);
    return true;
  }

  const { data: milestones } = await admin.from('job_milestones')
    .select('*').eq('job_id', job.id).order('position');
  const current = (milestones ?? [])[job.milestone_index];

  // ---------- report (all milestones done) ----------
  if (!current || job.phase === 'report') {
    const res = await complete([
      { role: 'system', content: REPORT_SYSTEM },
      { role: 'user', content:
        `Brief: ${job.brief}\nMilestone outcomes:\n` +
        JSON.stringify((milestones ?? []).map((m) => ({ title: m.title, status: m.status, summary: m.summary, warning: m.warning }))) },
    ], { maxTokens: 2000 });
    await spend(job, res.costUsd, res, 'report');
    const report = parseJson<Record<string, unknown>>(res.text);
    await admin.from('jobs').update({
      status: 'completed', report, completed_at: new Date().toISOString(), lease_until: null,
    }).eq('id', job.id);
    await admin.from('projects').update({ status: 'ready' }).eq('id', job.project_id);
    await admin.from('ai_messages').insert({
      project_id: job.project_id, role: 'assistant',
      content: `Autopilot finished "${job.title}". ${String((report as { summary?: string }).summary ?? '')}`,
    });
    await notify(webhook, {
      event: 'job.completed', jobTitle: job.title, projectName: ctx.projectName,
      detail: String((report as { summary?: string }).summary ?? 'Done.'), spentUsd: job.spent_usd,
    });
    return false;
  }

  // ---------- build current milestone ----------
  if (job.phase === 'build') {
    await admin.from('job_milestones').update({ status: 'building' }).eq('id', current.id);
    const res = await complete([
      { role: 'system', content: BUILD_SYSTEM },
      { role: 'user', content:
        `Overall brief: ${job.brief}\n\nThis milestone: ${current.title} — ${current.description}\n\n` +
        `${answeredBlock}Project memory:\n${memoryBlock(ctx.memory)}\n\n` +
        `Current files:\n${contextPayload(ctx.files, `${current.title} ${current.description}`)}` },
    ], { maxTokens: 16000 });
    await spend(job, res.costUsd, res, 'build');
    const out = parseJson<{
      changes: { path: string; content: string }[]; deletions?: string[]; summary?: string;
      conventions?: string | null; decisions?: { decision: string; reason: string }[];
    }>(res.text);

    await applyChanges(job, out.changes ?? [], out.deletions ?? []);
    await admin.from('job_milestones').update({ summary: out.summary ?? null }).eq('id', current.id);

    // persist memory updates so hour-six output matches hour-one conventions
    const decisions = [
      ...(((ctx.memory?.decisions as unknown[]) ?? [])),
      ...((out.decisions ?? []).map((d) => ({ ...d, at: new Date().toISOString() }))),
    ];
    await admin.from('project_memory').upsert({
      project_id: job.project_id,
      conventions: out.conventions ?? ctx.memory?.conventions ?? '',
      decisions, updated_at: new Date().toISOString(),
    });

    await admin.from('jobs').update({ phase: 'validate', fix_attempts: 0 }).eq('id', job.id);
    return true;
  }

  // ---------- validate / fix loop ----------
  if (job.phase === 'validate' || job.phase === 'fix') {
    const freshFiles = (await admin.from('project_files').select('path, content')
      .eq('project_id', job.project_id).is('deleted_at', null)).data ?? [];
    const res = await complete([
      { role: 'system', content: VALIDATE_SYSTEM },
      { role: 'user', content: `Milestone just built: ${current.title}\nFiles:\n${contextPayload(freshFiles, current.title)}` },
    ], { maxTokens: 2000 });
    await spend(job, res.costUsd, res, 'validate');
    const verdict = parseJson<{ ok: boolean; problems?: string[] }>(res.text);

    if (verdict.ok) {
      await admin.from('job_milestones').update({ status: 'done' }).eq('id', current.id);
      await admin.from('jobs').update({ phase: 'build', milestone_index: job.milestone_index + 1 }).eq('id', job.id);
      return true;
    }

    if (job.fix_attempts >= job.max_fix_attempts) {
      // Don't burn budget arguing with ourselves — flag it and move on.
      await admin.from('job_milestones').update({
        status: 'done_with_warnings', warning: (verdict.problems ?? []).join('; ').slice(0, 500),
      }).eq('id', current.id);
      await admin.from('jobs').update({ phase: 'build', milestone_index: job.milestone_index + 1 }).eq('id', job.id);
      return true;
    }

    const fix = await complete([
      { role: 'system', content: FIX_SYSTEM },
      { role: 'user', content:
        `Problems:\n${(verdict.problems ?? []).join('\n')}\n\nFiles:\n${contextPayload(freshFiles, (verdict.problems ?? []).join(' '))}` },
    ], { maxTokens: 16000 });
    await spend(job, fix.costUsd, fix, 'fix');
    const patch = parseJson<{ changes: { path: string; content: string }[]; deletions?: string[] }>(fix.text);
    await applyChanges(job, patch.changes ?? [], patch.deletions ?? []);
    await admin.from('jobs').update({ phase: 'validate', fix_attempts: job.fix_attempts + 1 }).eq('id', job.id);
    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const chain: number = body.chain ?? 0;

  const { data: claimed } = await admin.rpc('claim_next_job');
  const job = (claimed as Job[] | null)?.[0];
  if (!job) {
    return new Response(JSON.stringify({ idle: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let more = false;
  try {
    more = await step(job);
    if (more) {
      await admin.from('jobs').update({ lease_until: null }).eq('id', job.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from('jobs').update({ status: 'failed', pause_reason: msg.slice(0, 500), lease_until: null }).eq('id', job.id);
    await admin.from('error_logs').insert({
      project_id: job.project_id, user_id: job.owner_id, source: 'job-worker', message: msg.slice(0, 1000),
    });
    const { data: p } = await admin.from('profiles').select('webhook_url').eq('id', job.owner_id).single();
    const { data: proj } = await admin.from('projects').select('name').eq('id', job.project_id).single();
    await notify(p?.webhook_url, {
      event: 'job.failed', jobTitle: job.title, projectName: proj?.name ?? 'project',
      detail: msg.slice(0, 300), spentUsd: job.spent_usd,
    });
  }

  // Self-chain while work remains (cron/app ticks restart chains that hit the cap).
  if (more && chain < MAX_CHAIN) {
    const next = fetch(`${SUPABASE_URL}/functions/v1/job-worker`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: chain + 1 }),
    }).catch(() => {});
    // @ts-ignore EdgeRuntime is provided by Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(next);
    else await next;
  }

  return new Response(JSON.stringify({ jobId: job.id, more }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
