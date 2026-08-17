// supabase/functions/job-worker/index.ts
// Autopilot worker. Each invocation claims one job and executes ONE phase step
// (decompose → per-milestone build/validate/fix → report), checkpointing to the
// jobs row after every step so runs survive crashes and function time limits.
// While work remains it self-chains (re-invokes itself); a cron tick or the app
// pinging this endpoint keeps the queue draining.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, parseJson, corsHeaders, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';
import { contextPayload } from '../_shared/context.ts';
import { notify } from '../_shared/notify.ts';
import { pagesFromAppTsx } from '../_shared/generateDriver.ts';
import { GENERATE_FILES_STREAM, filesPromptChunk } from '../_shared/prompts.ts';
import { parseProtocol } from '../_shared/streamparse.ts';
import { SCAFFOLD_PATHS } from '../_shared/scaffold.ts';
import { validateProject, looksTruncated, issuesToFixRequest } from '../_shared/qa.ts';

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
  budget_usd: number; spent_usd: number; max_fix_attempts: number; retry_count: number;
  kind?: string; payload?: Record<string, unknown> | null;
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
  // Deduct the user's credits + log usage in one call (replaces the manual usage_events insert).
  await spendCredits(admin, job.owner_id, {
    costUsd, kind: `job.${kind}`, inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, projectId: job.project_id,
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

// ---------------------------------------------------------------------------
// GENERATION RESUME (SW10.5): a second job kind riding the SAME worker spine (claim/lease/
// backoff/credit gate) and the SAME shared driver rules the browser uses. STATELESS by design:
// every step re-derives the missing-page list from the saved App.tsx (pagesFromAppTsx — the ONE
// manifest rule), generates a bounded slice, and self-chains until nothing is missing; then one
// static-QA heal pass, then an HONEST finish — the server cannot run the compiler, so the
// generation record says 'static checks only' and the deep gate upgrades the badge when the
// operator next opens the project (that client mitigation stays).

const RESUME_PAGES_PER_STEP = 2;

/** Same write rules as a fresh build: never the scaffold/UI kit, and — resume being a RECOVERY —
 *  never overwrite a file that already survived; only the target page and genuinely-new
 *  companions land. */
function resumeWritable(path: string, content: string, target: string, existing: Map<string, string>): boolean {
  const reserved = new Set([...SCAFFOLD_PATHS, '/src/lib/supabaseClient.ts', '/supabase/migrations/0001_init.sql', '/.env.example']);
  if (!path || !content.trim() || reserved.has(path) || path.startsWith('/src/components/ui/')) return false;
  if (path !== target && existing.get(path)?.trim()) return false;
  return true;
}

async function resumeStep(job: Job): Promise<boolean> {
  const payload = (job.payload ?? {}) as { generation_id?: string };

  // CREDIT GATE — the resume self-chains like any job; pause instead of burning unpaid spend.
  try {
    await checkCredits(admin, job.owner_id, 'agent');
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      await admin.from('jobs').update({ status: 'paused', pause_reason: "You're out of credits — top up to resume this build.", lease_until: null }).eq('id', job.id);
      return false;
    }
    throw e;
  }
  if (overBudget(job)) {
    await admin.from('jobs').update({ status: 'paused', pause_reason: `Budget cap of $${Number(job.budget_usd).toFixed(2)} reached.`, lease_until: null }).eq('id', job.id);
    return false;
  }
  const m = modelForPlan(await getUserPlan(admin, job.owner_id));

  const { data: fileRows } = await admin.from('project_files')
    .select('path, content').eq('project_id', job.project_id).is('deleted_at', null).limit(1200);
  const files = new Map(((fileRows ?? []) as { path: string; content: string }[]).map((f) => [f.path, f.content]));
  const appTsx = files.get('/src/App.tsx') ?? '';
  if (!appTsx.trim()) {
    // Not transient and not recoverable — without a shell there is no manifest to resume from.
    throw new Error('resume: the build died before the app shell existed — start it again from the same prompt (no App.tsx to derive pages from)');
  }

  // Continue the EXISTING generation record when the enqueuer named one (the stalled build the
  // watchdog saw); otherwise open a fresh record so the workspace shows the resume's stages.
  let genId = payload.generation_id ?? null;
  if (!genId) {
    const { data: gen } = await admin.from('project_generations')
      .insert({ project_id: job.project_id, user_id: job.owner_id, prompt: 'Server resume', kind: 'create', status: 'running' })
      .select('id').single();
    genId = (gen as { id: string } | null)?.id ?? null;
    if (genId) await admin.from('jobs').update({ payload: { ...payload, generation_id: genId } }).eq('id', job.id);
  }
  const mark = async (stage: string, status: 'running' | 'done', note?: string) => {
    if (!genId) return;
    const { data: g } = await admin.from('project_generations').select('stages').eq('id', genId).maybeSingle();
    const stages = ((g?.stages ?? []) as { stage: string; status: string; started_at: string; finished_at?: string; note?: string }[]);
    const now = new Date().toISOString();
    const found = stages.find((s) => s.stage === stage);
    if (found) { found.status = status; if (status === 'done') found.finished_at = now; if (note) found.note = note; }
    else stages.push({ stage, status, started_at: now, ...(note ? { note } : {}) });
    await admin.from('project_generations').update({ stages, current_stage: stage, status: 'running' }).eq('id', genId);
  };

  // THE ONE MANIFEST RULE — re-derived fresh every step, never checkpointed.
  const missing = pagesFromAppTsx(appTsx).filter((p) => !files.get(p)?.trim());

  if (missing.length) {
    await mark('file_tree', 'running', `server resume — ${missing.length} page(s) missing`);
    const bpJson = await (async () => {
      const { data: bpRow } = await admin.from('app_blueprints')
        .select('*').eq('project_id', job.project_id).order('version', { ascending: false }).limit(1).maybeSingle();
      if (bpRow) {
        const { id: _i, project_id: _p, created_at: _c, version: _v, ...saved } = bpRow as Record<string, unknown>;
        return JSON.stringify(saved);
      }
      const { data: proj } = await admin.from('projects').select('name, description').eq('id', job.project_id).maybeSingle();
      return JSON.stringify({
        app_name: (proj as { name?: string } | null)?.name ?? 'The app',
        description: 'Resume of an interrupted build — the existing files are the authoritative contracts.',
      });
    })();
    const contracts = [...files.entries()]
      .filter(([p]) => p.startsWith('/src/'))
      .map(([p, c]) => `--- ${p} ---\n${c}`)
      .join('\n\n').slice(0, 60000);

    for (const pagePath of missing.slice(0, RESUME_PAGES_PER_STEP)) {
      const res = await complete([
        { role: 'system', content: GENERATE_FILES_STREAM },
        { role: 'user', content: filesPromptChunk(bpJson, pagePath, contracts, false, false) },
      ], { maxTokens: 9000, provider: m.provider, model: m.model });
      await spend(job, res.costUsd, res, 'resume_page');
      let changes = parseProtocol(res.text).changes;
      if (res.stopReason === 'max_tokens' && changes.length && looksTruncated(changes[changes.length - 1].content)) {
        changes = changes.slice(0, -1);
      }
      if (!changes.some((c) => c.path === pagePath && c.content.trim())) {
        throw new Error(`resume: page ${pagePath} was not emitted — network or model trouble (retryable)`);
      }
      for (const ch of changes) {
        if (!resumeWritable(ch.path, ch.content, pagePath, files)) continue;
        await admin.from('project_files').upsert(
          { project_id: job.project_id, path: ch.path, content: ch.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
        files.set(ch.path, ch.content);
      }
      await mark('file_tree', 'running', pagePath.split('/').pop());
    }
    return true; // self-chain re-derives what is still missing
  }

  // Nothing missing — one static-QA heal pass (phase 'resume' → 'resume_finish'), then finish.
  if (job.phase === 'resume') {
    const allFiles = [...files.entries()].map(([path, content]) => ({ path, content }));
    const errors = validateProject(allFiles).filter((i) => i.severity === 'error');
    await mark('validate', 'running', errors.length ? `${errors.length} static issue(s) — healing` : 'static checks');
    if (errors.length) {
      const res = await complete([
        { role: 'system', content: FIX_SYSTEM },
        { role: 'user', content: `${issuesToFixRequest(errors)}\n\nFiles:\n${contextPayload(allFiles, errors.map((e) => e.message).join(' '))}` },
      ], { maxTokens: 16000, provider: m.provider, model: m.model });
      await spend(job, res.costUsd, res, 'resume_heal');
      const patch = parseJson<{ changes: { path: string; content: string }[] }>(res.text);
      for (const ch of patch?.changes ?? []) {
        // The heal may touch any non-reserved file it named — but still never the scaffold/kit.
        if (!resumeWritable(ch.path, ch.content, ch.path, new Map())) continue;
        await admin.from('project_files').upsert(
          { project_id: job.project_id, path: ch.path, content: ch.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
    }
    await admin.from('jobs').update({ phase: 'resume_finish' }).eq('id', job.id);
    return true;
  }

  // Finish — HONESTLY: the compiler cannot run here, so the record says static-only and the
  // workspace's deep gate upgrades (or convicts) the badge on next open.
  const allFiles = [...files.entries()].map(([path, content]) => ({ path, content }));
  const remaining = validateProject(allFiles).filter((i) => i.severity === 'error').length;
  await mark('validate', 'done', remaining
    ? `static checks only (server) — ${remaining} issue(s) remain; open the project to run the compiler`
    : 'static checks only (server) — open the project to run the compiler');
  if (genId) {
    await admin.from('project_generations').update({ status: 'succeeded', finished_at: new Date().toISOString() }).eq('id', genId);
  }
  await admin.from('projects').update({ status: 'ready' }).eq('id', job.project_id);
  await admin.from('jobs').update({ status: 'completed', completed_at: new Date().toISOString(), lease_until: null }).eq('id', job.id);
  const recovered = pagesFromAppTsx(appTsx).length;
  await admin.from('ai_messages').insert({
    project_id: job.project_id, role: 'assistant',
    content: `Resumed this build server-side — all ${recovered} routed page(s) now exist. ` +
      `Verification so far is static checks only (the server cannot run the compiler); opening the preview runs the full gate and updates the badge.` +
      (remaining ? ` ${remaining} static issue(s) remain — use "Fix with AI" if something looks off.` : ''),
  }).then(() => {}, () => {});
  // THE BUILD ANNOUNCES ITSELF at COMPLETION (never at enqueue — no fake progress): the operator's
  // waking moment says the resume happened and what state it left things in.
  await admin.from('mind_events').insert({
    owner_id: job.owner_id, event_type: 'note', source: 'builder',
    subject: `Resumed your build — ${recovered} routed page(s) exist; verification pending your next open`,
    payload: { project_id: job.project_id, job_id: job.id, static_issues: remaining },
  }).then(() => {}, () => {});
  return false;
}

/** Executes exactly one phase step. Returns true if the job still has work. */
async function step(job: Job): Promise<boolean> {
  if (job.kind === 'generation_resume') return await resumeStep(job);
  const ctx = await loadProjectContext(job);
  const { data: profile } = await admin.from('profiles').select('webhook_url').eq('id', job.owner_id).single();
  const webhook = profile?.webhook_url;

  if (overBudget(job)) {
    await pause(job, `Budget cap of $${Number(job.budget_usd).toFixed(2)} reached.`, ctx.projectName, webhook);
    return false;
  }

  // CREDIT GATE — an autonomous job self-chains; if the owner runs out of credits, pause instead of
  // burning more of our API spend than they've paid for. Checked before every phase step.
  try {
    await checkCredits(admin, job.owner_id, 'agent');
  } catch (e) {
    if (e instanceof InsufficientCreditsError) { await pause(job, "You're out of credits — top up or wait for your monthly refill to resume.", ctx.projectName, webhook); return false; }
    throw e;
  }
  const m = modelForPlan(await getUserPlan(admin, job.owner_id)); // free → cheap model

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
    ], { maxTokens: 4000, provider: m.provider, model: m.model });
    await spend(job, res.costUsd, res, 'decompose');
    const plan = parseJson<{ milestones: { title: string; description: string }[]; questions?: never[] }>(res.text);
    // parseJson returns null on garbage — throw so the retry/backoff seam handles it as a step
    // failure instead of null flowing into the milestone writes.
    if (!plan) throw new Error('decompose: the model returned unparseable JSON');

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
    ], { maxTokens: 2000, provider: m.provider, model: m.model });
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
    ], { maxTokens: 16000, provider: m.provider, model: m.model });
    await spend(job, res.costUsd, res, 'build');
    const out = parseJson<{
      changes: { path: string; content: string }[]; deletions?: string[]; summary?: string;
      conventions?: string | null; decisions?: { decision: string; reason: string }[];
    }>(res.text);
    if (!out) throw new Error('build: the model returned unparseable JSON');

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
    ], { maxTokens: 2000, provider: m.provider, model: m.model });
    await spend(job, res.costUsd, res, 'validate');
    const verdict = parseJson<{ ok: boolean; problems?: string[] }>(res.text);
    if (!verdict) throw new Error('validate: the model returned unparseable JSON');

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
    ], { maxTokens: 16000, provider: m.provider, model: m.model });
    await spend(job, fix.costUsd, fix, 'fix');
    const patch = parseJson<{ changes: { path: string; content: string }[]; deletions?: string[] }>(fix.text);
    if (!patch) throw new Error('fix: the model returned unparseable JSON');
    await applyChanges(job, patch.changes ?? [], patch.deletions ?? []);
    await admin.from('jobs').update({ phase: 'validate', fix_attempts: job.fix_attempts + 1 }).eq('id', job.id);
    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // AUTH GATE (mirrors garvis-worker): the self-chain's service-key bearer, a worker secret for
  // cron, or any signed-in user's nudge. The claimed work is always owner-scoped, but an ungated
  // endpoint let anyone holding the public anon key drain the queue and burn job-owners' credits.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const workerSecret = Deno.env.get('WORKER_SECRET');
  const trusted = bearer === SERVICE_KEY || (!!workerSecret && req.headers.get('x-worker-secret') === workerSecret);
  if (!trusted) {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const body = await req.json().catch(() => ({}));
  const chain: number = body.chain ?? 0;

  const { data: claimed } = await admin.rpc('claim_next_job');
  const job = (claimed as Job[] | null)?.[0];
  if (!job) {
    return new Response(JSON.stringify({ idle: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const MAX_RETRIES = 4;
  // A transient AI/network blip should not kill a whole build (deep scan). These substrings mark
  // errors worth retrying; anything else (a real logic/validation failure) fails terminally.
  const isTransient = (m: string) => /\b(429|50[0-9]|52[0-9]|timeout|timed ?out|overloaded|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|fetch failed|temporarily|rate.?limit(ed)?|service unavailable)\b/i.test(m);

  let more = false;
  try {
    more = await step(job);
    if (more) {
      // Progress was made — free the lease for the next step and reset the transient-retry counter.
      await admin.from('jobs').update({ lease_until: null, retry_count: 0 }).eq('id', job.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempts = (job.retry_count ?? 0) + 1;
    if (isTransient(msg) && attempts <= MAX_RETRIES) {
      // Requeue with an exponential backoff lease (3s→6s→12s→24s, capped 5m). claim_next_job only
      // re-picks a job once lease_until has passed, so the future lease IS the backoff; the job is
      // checkpointed, so the re-claim resumes the same step rather than restarting the build.
      const backoffMs = Math.min(300_000, 3000 * 2 ** (attempts - 1));
      await admin.from('jobs').update({
        status: 'queued', retry_count: attempts,
        lease_until: new Date(Date.now() + backoffMs).toISOString(),
        pause_reason: `transient error — retry ${attempts}/${MAX_RETRIES} after backoff: ${msg.slice(0, 260)}`,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      // Do NOT self-chain; the cron/app tick re-claims once the lease expires.
      return new Response(JSON.stringify({ jobId: job.id, retrying: attempts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Terminal: a non-transient error, or retries exhausted.
    await admin.from('jobs').update({ status: 'failed', retry_count: attempts, pause_reason: msg.slice(0, 500), lease_until: null }).eq('id', job.id);
    // A failed RESUME reaches the waking moment honestly — what was tried, and why it failed
    // (written at completion of the attempt, never at enqueue — no fake progress).
    if (job.kind === 'generation_resume') {
      await admin.from('mind_events').insert({
        owner_id: job.owner_id, event_type: 'note', source: 'builder',
        subject: `Tried to resume your build; it failed: ${msg.slice(0, 140)}`,
        payload: { project_id: job.project_id, job_id: job.id },
      }).then(() => {}, () => {});
    }
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
