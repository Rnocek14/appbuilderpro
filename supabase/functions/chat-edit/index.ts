// supabase/functions/chat-edit/index.ts
// Conversational editing: "add a dashboard", "fix the error", "make it mobile friendly".
// Streams the model response back to the client (SSE) so the UI can render the work as it
// lands, then applies the file changes server-side and records an explanation in ai_messages.

import { contextPayload } from '../_shared/context.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { completeStream, corsHeaders, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';
// Canonical edit prompt — the SAME modern Vite + TS + design-token + integrations knowledge the client
// uses (was a divergent Sandpack/plain-JS prompt here). Single source: _shared/prompts.ts.
import { EDIT_SYSTEM_STREAM as SYSTEM } from '../_shared/prompts.ts';

interface ParsedEdit {
  action: string;
  explanation: string;
  question: string;
  options: string[];
  changes: { path: string; content: string }[];
  deletions: string[];
  // plan-mode fields
  summary: string;
  steps: string[];
  fileHints: string[];
  openQuestions: string[];
}

/** Parse the full §-delimited protocol text into a structured edit/plan/discuss. */
function parseProtocol(text: string): ParsedEdit {
  const out: ParsedEdit = {
    action: 'edit', explanation: '', question: '', options: [], changes: [], deletions: [],
    summary: '', steps: [], fileHints: [], openQuestions: [],
  };
  let section: 'explanation' | 'file' | 'question' | 'summary' | null = null;
  let curPath: string | null = null;
  let curContent = '';
  const finish = () => {
    if (section === 'file' && curPath !== null) out.changes.push({ path: curPath, content: curContent.replace(/\n$/, '') });
    curPath = null; curContent = '';
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('§')) {
      const rest = line.slice(1);
      if (rest.startsWith('ACTION')) { finish(); out.action = rest.slice(6).trim() || 'edit'; section = null; }
      else if (rest.startsWith('EXPLANATION')) { finish(); section = 'explanation'; }
      else if (rest.startsWith('SUMMARY')) { finish(); section = 'summary'; }
      else if (rest.startsWith('STEP')) { finish(); const s = rest.slice(4).trim(); if (s) out.steps.push(s); section = null; }
      // FILEHINT must be checked before FILE — both start with "FILE".
      else if (rest.startsWith('FILEHINT')) { finish(); const h = rest.slice(8).trim(); if (h) out.fileHints.push(h); section = null; }
      else if (rest.startsWith('FILE')) { finish(); curPath = rest.slice(4).trim(); section = 'file'; }
      else if (rest.startsWith('DELETE')) { finish(); const p = rest.slice(6).trim(); if (p) out.deletions.push(p); section = null; }
      else if (rest.startsWith('QUESTION')) { finish(); section = 'question'; }
      else if (rest.startsWith('OPENQ')) { finish(); const q = rest.slice(5).trim(); if (q) out.openQuestions.push(q); section = null; }
      else if (rest.startsWith('OPTION')) { finish(); const o = rest.slice(6).trim(); if (o) out.options.push(o); section = null; }
      else if (rest.startsWith('END')) { finish(); section = null; }
    } else if (section === 'explanation') out.explanation += (out.explanation ? '\n' : '') + line;
    else if (section === 'summary') out.summary += (out.summary ? '\n' : '') + line;
    else if (section === 'file') curContent += line + '\n';
    else if (section === 'question') out.question += (out.question ? '\n' : '') + line;
  }
  finish();
  return out;
}

/** Readable markdown for a plan, stored as an assistant message so it persists in chat. */
function renderPlanText(p: ParsedEdit): string {
  const lines = [`**Plan:** ${p.summary}`, ''];
  if (p.steps.length) { lines.push('Steps:'); p.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`)); lines.push(''); }
  if (p.fileHints.length) { lines.push('Files:'); p.fileHints.forEach((f) => lines.push(`• ${f}`)); lines.push(''); }
  if (p.options.length) { lines.push('Options:'); p.options.forEach((o) => lines.push(`• ${o}`)); lines.push(''); }
  if (p.openQuestions.length) { lines.push('Open questions:'); p.openQuestions.forEach((q) => lines.push(`• ${q}`)); lines.push(''); }
  lines.push('_Approve to build, or reply to change the plan._');
  return lines.join('\n').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { projectId, message, previewError, planFirst } = await req.json();
  if (!projectId || !message) return json({ error: 'projectId and message are required' }, 400);

  const { data: project } = await admin.from('projects').select('id, owner_id').eq('id', projectId).single();
  if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

  // CREDIT GATE — meter every edit against the unified balance (replaces the old edit-count limit).
  try {
    await checkCredits(admin, user.id, 'edit');
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402);
    throw e;
  }
  const m = modelForPlan(await getUserPlan(admin, user.id)); // free → cheap model

  const { data: files } = await admin
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const { data: history } = await admin
    .from('ai_messages').select('role, content')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(8);

  await admin.from('ai_messages').insert({ project_id: projectId, user_id: user.id, role: 'user', content: message });

  const { data: gen } = await admin.from('project_generations')
    .insert({ project_id: projectId, user_id: user.id, prompt: message, kind: previewError ? 'fix' : 'edit', status: 'running' })
    .select().single();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const result = await completeStream([
          { role: 'system', content: SYSTEM },
          { role: 'user', content:
            `Current files:\n${contextPayload(files ?? [], message, previewError ?? '')}\n\n` +
            `Recent conversation (newest first):\n${JSON.stringify(history ?? [])}\n\n` +
            (previewError ? `Current preview error to fix:\n${previewError}\n\n` : '') +
            `Change request: ${message}` +
            (planFirst ? '\n\nIMPORTANT: The user asked you to PLAN first. Respond with §ACTION plan only — propose the plan and change NO files yet.' : '') },
        ], { maxTokens: 16000, provider: m.provider, model: m.model }, (delta) => send({ t: delta }));

        const parsed = parseProtocol(result.text);
        const usage = {
          input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: result.costUsd,
        };
        // Charge once for this edit (whichever branch runs below); spendCredits also logs usage_events.
        await spendCredits(admin, user.id, {
          costUsd: result.costUsd, kind: 'edit', provider: m.provider, model: m.model,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens, projectId,
        });

        if (parsed.action === 'ask' && parsed.question) {
          await admin.from('ai_messages').insert({
            project_id: projectId, user_id: user.id, generation_id: gen?.id,
            role: 'assistant', content: parsed.question, files_changed: [],
          });
          await admin.from('project_generations').update({
            status: 'succeeded', summary: parsed.question, ...usage, finished_at: new Date().toISOString(),
          }).eq('id', gen!.id);
          send({ done: true, action: 'ask', question: parsed.question, options: parsed.options, changed: [], deleted: [] });
          return;
        }

        // Discuss: a conversational answer/opinion — change no files, record the reply.
        if (parsed.action === 'discuss') {
          const answer = parsed.explanation || 'Happy to help — what would you like to dig into?';
          await admin.from('ai_messages').insert({
            project_id: projectId, user_id: user.id, generation_id: gen?.id,
            role: 'assistant', content: answer, files_changed: [],
          });
          await admin.from('project_generations').update({
            status: 'succeeded', summary: answer.slice(0, 200), ...usage, finished_at: new Date().toISOString(),
          }).eq('id', gen!.id);
          send({ done: true, action: 'discuss', explanation: answer, changed: [], deleted: [] });
          return;
        }

        // Plan: proposed a plan to approve — change no files, record it, hand it to the UI.
        if (parsed.action === 'plan' && (parsed.summary || parsed.steps.length)) {
          const plan = {
            summary: parsed.summary.trim(), steps: parsed.steps,
            fileHints: parsed.fileHints, options: parsed.options, openQuestions: parsed.openQuestions,
          };
          await admin.from('ai_messages').insert({
            project_id: projectId, user_id: user.id, generation_id: gen?.id,
            role: 'assistant', content: renderPlanText(parsed), files_changed: [],
          });
          await admin.from('project_generations').update({
            status: 'succeeded', summary: parsed.summary.slice(0, 200), ...usage, finished_at: new Date().toISOString(),
          }).eq('id', gen!.id);
          send({ done: true, action: 'plan', plan, explanation: '', changed: [], deleted: [] });
          return;
        }

        for (const c of parsed.changes) {
          await admin.from('project_files').upsert(
            { project_id: projectId, path: c.path, content: c.content, updated_by_ai: true },
            { onConflict: 'project_id,path' },
          );
        }
        for (const path of parsed.deletions) {
          await admin.from('project_files')
            .update({ deleted_at: new Date().toISOString() })
            .eq('project_id', projectId).eq('path', path);
        }

        const changedPaths = parsed.changes.map((c) => c.path);
        const explanation = parsed.explanation || 'Done.';
        await admin.from('ai_messages').insert({
          project_id: projectId, user_id: user.id, generation_id: gen?.id,
          role: 'assistant', content: explanation, files_changed: changedPaths,
        });
        await admin.from('project_generations').update({
          status: 'succeeded', summary: explanation, ...usage, finished_at: new Date().toISOString(),
        }).eq('id', gen!.id);

        send({ done: true, action: 'edit', explanation, changed: changedPaths, deleted: parsed.deletions });
      } catch (err) {
        await admin.from('project_generations').update({
          status: 'failed', error: String(err), finished_at: new Date().toISOString(),
        }).eq('id', gen!.id);
        await admin.from('error_logs').insert({
          user_id: user.id, project_id: projectId, generation_id: gen?.id, source: 'pipeline', message: String(err),
        });
        send({ error: 'Edit failed. Try rephrasing or a smaller change.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
