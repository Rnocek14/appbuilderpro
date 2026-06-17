// supabase/functions/chat-edit/index.ts
// Conversational editing: "add a dashboard", "fix the error", "make it mobile friendly".
// Streams the model response back to the client (SSE) so the UI can render the work as it
// lands, then applies the file changes server-side and records an explanation in ai_messages.

import { contextPayload } from '../_shared/context.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { completeStream, corsHeaders, getProviderConfig } from '../_shared/ai.ts';

const SYSTEM = `You are FableForge's editing assistant for a small React app that runs in a
lightweight browser sandbox. You collaborate like a thoughtful pair programmer — you make
confident changes when intent is clear, and ask first when it genuinely is not.

RUNTIME CONSTRAINTS (the app stops rendering if you break these):
- Plain JavaScript + JSX only. No TypeScript.
- The ONLY package you may import is "react". Do NOT import any other npm package — no
  recharts or chart libraries, no icon packs, no router. Build charts, icons, and
  everything else from plain React, inline SVG, and CSS.
- Entry is /App.js (default-exported component). Components live in /components/*.js.
- Styles go in /styles.css, imported from /App.js. Persist data with localStorage.
- Mark external-service touchpoints with a // INTEGRATION: <what to wire> comment.

DECIDE: EDIT when intent is reasonably clear (prefer this; under minor ambiguity pick the
most likely interpretation, build it, and state your assumption). ASK only when the request
truly forks into materially different builds, is destructive/irreversible, or refers to
something you cannot see — then ask ONE focused question with 2-4 concrete options and change
no files. Never ask something the conversation already answers. When editing, modify ONLY the
files that must change, never rewrite untouched files, and preserve existing behavior.

OUTPUT FORMAT — use these line markers (each on its own line, beginning with §). No JSON, no fences.

To EDIT:
§ACTION edit
§EXPLANATION
<1-3 sentences on what you changed and why; note any assumption>
§FILE /components/X.js
<the complete file content, verbatim>
§DELETE /path/to/remove.js
§END

To ASK:
§ACTION ask
§QUESTION
<one specific question>
§OPTION <short option>
§OPTION <short option>
§END

Format rules: each § marker on its own line; a §FILE block's content is everything up to the
next § marker, written raw (no fences, no escaping, no line numbers); never start a line with
§ inside file content; emit a §FILE block only for files you create or change.`;

interface ParsedEdit {
  action: string;
  explanation: string;
  question: string;
  options: string[];
  changes: { path: string; content: string }[];
  deletions: string[];
}

/** Parse the full §-delimited protocol text into a structured edit. */
function parseProtocol(text: string): ParsedEdit {
  const out: ParsedEdit = { action: 'edit', explanation: '', question: '', options: [], changes: [], deletions: [] };
  let section: 'explanation' | 'file' | 'question' | null = null;
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
      else if (rest.startsWith('FILE')) { finish(); curPath = rest.slice(4).trim(); section = 'file'; }
      else if (rest.startsWith('DELETE')) { finish(); const p = rest.slice(6).trim(); if (p) out.deletions.push(p); section = null; }
      else if (rest.startsWith('QUESTION')) { finish(); section = 'question'; }
      else if (rest.startsWith('OPTION')) { finish(); const o = rest.slice(6).trim(); if (o) out.options.push(o); section = null; }
      else if (rest.startsWith('END')) { finish(); section = null; }
    } else if (section === 'explanation') out.explanation += (out.explanation ? '\n' : '') + line;
    else if (section === 'file') curContent += line + '\n';
    else if (section === 'question') out.question += (out.question ? '\n' : '') + line;
  }
  finish();
  return out;
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

  const { projectId, message, previewError } = await req.json();
  if (!projectId || !message) return json({ error: 'projectId and message are required' }, 400);

  const { data: project } = await admin.from('projects').select('id, owner_id').eq('id', projectId).single();
  if (!project || project.owner_id !== user.id) return json({ error: 'Project not found' }, 404);

  const { data: profile } = await admin.from('profiles').select('monthly_generation_limit').eq('id', user.id).single();
  const { data: used } = await admin.rpc('generations_this_month', { uid: user.id });
  if ((used ?? 0) >= (profile?.monthly_generation_limit ?? 10)) {
    return json({ error: 'Monthly limit reached. Upgrade to Pro for more edits.' }, 429);
  }

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
            `Change request: ${message}` },
        ], { maxTokens: 16000 }, (delta) => send({ t: delta }));

        const parsed = parseProtocol(result.text);
        const cfg = getProviderConfig();
        const usage = {
          input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: result.costUsd,
        };

        if (parsed.action === 'ask' && parsed.question) {
          await admin.from('ai_messages').insert({
            project_id: projectId, user_id: user.id, generation_id: gen?.id,
            role: 'assistant', content: parsed.question, files_changed: [],
          });
          await admin.from('project_generations').update({
            status: 'succeeded', summary: parsed.question, ...usage, finished_at: new Date().toISOString(),
          }).eq('id', gen!.id);
          await admin.from('usage_events').insert({
            user_id: user.id, project_id: projectId, event_type: 'edit', provider: cfg.provider, model: cfg.model, ...usage,
          });
          send({ done: true, action: 'ask', question: parsed.question, options: parsed.options, changed: [], deleted: [] });
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
        await admin.from('usage_events').insert({
          user_id: user.id, project_id: projectId, event_type: 'edit', provider: cfg.provider, model: cfg.model, ...usage,
        });

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
