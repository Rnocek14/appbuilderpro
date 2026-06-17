// src/lib/aiClient.ts
// Client-side AI service layer.
//
// PRODUCTION MODE (default): all model calls go through Supabase Edge Functions
// (generate-app, chat-edit). Provider keys live in edge function secrets and never
// reach the browser. Usage, cost, and audit records are written server-side.
//
// DIRECT MODE (VITE_AI_DIRECT=true): for local hacking without deploying edge
// functions. The browser calls the provider directly with VITE_AI_API_KEY and
// writes files to Supabase itself. Never ship a production build in this mode.

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import { GENERATE_SYSTEM, GENERATE_FILES_STREAM, EDIT_SYSTEM, EDIT_SYSTEM_STREAM, blueprintPrompt, filesPromptStream, editPrompt } from './prompts';
import { contextPayload } from './contextBudget';
import { SCAFFOLD_FILES, SCAFFOLD_PATHS } from './scaffold';

export type Provider = 'anthropic' | 'openai' | 'openrouter' | 'local';

const DIRECT = import.meta.env.VITE_AI_DIRECT === 'true';
const PROVIDER = (import.meta.env.VITE_AI_PROVIDER ?? 'anthropic') as Provider;
const MODEL = import.meta.env.VITE_AI_MODEL ?? 'claude-sonnet-4-6';
const KEY = import.meta.env.VITE_AI_API_KEY ?? '';
const LOCAL_BASE = import.meta.env.VITE_LOCAL_AI_BASE_URL ?? 'http://localhost:11434/v1';

export interface GenerateResult { generationId: string }

// Live progress emitted while an edit streams in, so the UI can show its work.
export type EditEvent =
  | { type: 'start' }
  | { type: 'explanation'; text: string }
  | { type: 'question'; text: string }
  | { type: 'file-start'; path: string }
  | { type: 'file-done'; path: string }
  | { type: 'deletion'; path: string }
  | { type: 'done' };
export interface EditResult {
  // 'ask' = the assistant needs clarification and changed nothing yet.
  // 'edit' = files were modified. Defaults to 'edit' for backward compatibility
  // with edge-function responses that predate the conversational protocol.
  action: 'edit' | 'ask';
  explanation: string;
  question?: string;
  options?: string[];
  changed: string[];
  deleted: string[];
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export async function startGeneration(projectId: string, prompt: string): Promise<GenerateResult> {
  if (DIRECT) return directGenerate(projectId, prompt);
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { projectId, prompt },
  });
  if (error) throw new Error(await readFnError(error));
  if (data?.error) throw new Error(data.error);
  return data as GenerateResult;
}

export async function sendEdit(
  projectId: string, message: string, previewError?: string,
  onEvent?: (e: EditEvent) => void,
): Promise<EditResult> {
  // Both paths stream so the UI can render the edit landing file-by-file.
  if (DIRECT) return directEditStream(projectId, message, previewError, onEvent);
  return edgeEditStream(projectId, message, previewError, onEvent);
}

// Calls the streaming chat-edit edge function. supabase-js's functions.invoke buffers the
// whole response, so we fetch the function URL directly and read its SSE body.
async function edgeEditStream(
  projectId: string, message: string, previewError: string | undefined,
  onEvent?: (e: EditEvent) => void,
): Promise<EditResult> {
  const { data: { session } } = await supabase.auth.getSession();
  onEvent?.({ type: 'start' });
  const res = await fetch(`${supabaseUrl}/functions/v1/chat-edit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
    },
    body: JSON.stringify({ projectId, message, previewError }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `chat-edit failed (${res.status})`);
  }

  interface DoneMsg { action?: string; explanation?: string; question?: string; options?: string[]; changed?: string[]; deleted?: string[] }
  const parser = makeStreamParser((e) => onEvent?.(e));
  // Holder object so the assignments inside the SSE callback survive TS flow analysis.
  const held: { final: DoneMsg | null; error: string | null } = { final: null, error: null };
  await readSSE(res.body, (data) => {
    let obj: { t?: string; error?: string; done?: boolean } & DoneMsg;
    try { obj = JSON.parse(data); } catch { return; }
    if (typeof obj.t === 'string') parser.push(obj.t);
    else if (obj.error) held.error = obj.error;
    else if (obj.done) held.final = obj;
  });
  parser.end();
  onEvent?.({ type: 'done' });

  if (held.error) throw new Error(held.error);
  if (!held.final) throw new Error('The edit stream ended unexpectedly.');
  return {
    action: held.final.action === 'ask' ? 'ask' : 'edit',
    explanation: held.final.explanation ?? '',
    question: held.final.question,
    options: held.final.options ?? [],
    changed: held.final.changed ?? [],
    deleted: held.final.deleted ?? [],
  };
}

async function readFnError(error: unknown): Promise<string> {
  const e = error as { context?: Response; message?: string };
  try {
    if (e.context) {
      const body = await e.context.json();
      if (body?.error) return body.error;
    }
  } catch { /* fall through */ }
  return e.message ?? 'Request failed';
}

// ----------------------------------------------------------------
// Direct mode (local dev)
// ----------------------------------------------------------------

interface RawResult { text: string; inputTokens: number; outputTokens: number }

async function rawComplete(messages: { role: string; content: string }[], maxTokens = 8192): Promise<RawResult> {
  if (!KEY && PROVIDER !== 'local') {
    throw new Error('Direct mode needs VITE_AI_API_KEY in .env (or deploy the edge functions).');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (PROVIDER === 'anthropic') {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const rest = messages.filter((m) => m.role !== 'system');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: rest }),
        });
        if (!res.ok) throw new Error(`anthropic ${res.status}`);
        const data = await res.json();
        return {
          text: data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n'),
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        };
      }
      const base =
        PROVIDER === 'openai' ? 'https://api.openai.com/v1'
        : PROVIDER === 'openrouter' ? 'https://openrouter.ai/api/v1'
        : LOCAL_BASE;
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY || 'local'}` },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
      });
      if (!res.ok) throw new Error(`${PROVIDER} ${res.status}`);
      const data = await res.json();
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
  throw new Error('unreachable');
}

function parseJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response.');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

// Parse the model's JSON, with one repair round-trip if it came back malformed
// (truncation, stray prose, unescaped characters). Avoids losing the whole turn.
async function parseJsonWithRepair<T>(raw: string): Promise<T> {
  try {
    return parseJson<T>(raw);
  } catch {
    const fixed = await rawComplete([
      { role: 'system', content: 'You repair malformed JSON. Reply with ONLY valid JSON — no prose, no markdown fences.' },
      { role: 'user', content: `This was meant to be a single JSON object but failed to parse. Return the corrected JSON only:\n\n${raw.slice(0, 60_000)}` },
    ], 16000);
    return parseJson<T>(fixed.text);
  }
}

async function directGenerate(projectId: string, prompt: string): Promise<GenerateResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;

  const { data: gen } = await supabase
    .from('project_generations')
    .insert({ project_id: projectId, user_id: userId, prompt, kind: 'create', status: 'running' })
    .select().single();

  if (!gen) throw new Error('Could not start generation (could not create the generation record).');
  const genId = gen.id;

  // Drive the forge-progress bar from the client. Each update is picked up by the
  // workspace via Realtime, so the user sees real movement instead of a frozen 0/11.
  const stages: { stage: string; status: 'running' | 'done'; started_at: string; finished_at?: string; note?: string }[] = [];
  const mark = async (stage: string, status: 'running' | 'done', note?: string) => {
    const now = new Date().toISOString();
    const found = stages.find((s) => s.stage === stage);
    if (found) { found.status = status; if (status === 'done') found.finished_at = now; if (note) found.note = note; }
    else stages.push({ stage, status, started_at: now, ...(note ? { note } : {}) });
    await supabase.from('project_generations').update({ stages, current_stage: stage }).eq('id', genId);
  };

  // run in background so the UI can subscribe immediately
  (async () => {
    try {
      await mark('interpret', 'done');

      await mark('blueprint', 'running');
      const bpRaw = await rawComplete([
        { role: 'system', content: GENERATE_SYSTEM },
        { role: 'user', content: blueprintPrompt(prompt) },
      ]);
      const blueprint = await parseJsonWithRepair<Record<string, unknown>>(bpRaw.text);
      await supabase.from('app_blueprints').insert({ project_id: projectId, ...blueprint });
      await supabase.from('projects').update({
        name: (blueprint.app_name as string) ?? 'Untitled app',
        description: (blueprint.description as string) ?? null,
        status: 'generating',
      }).eq('id', projectId);
      await mark('blueprint', 'done', (blueprint.app_name as string) ?? undefined);

      const tableCount = (blueprint.database_schema as { tables?: unknown[] })?.tables?.length ?? 0;
      await mark('schema', 'done', tableCount ? `${tableCount} tables` : undefined);

      await mark('file_tree', 'running');
      // Seed the fixed Vite/TS scaffold first so the project can boot as its source streams in.
      for (const f of SCAFFOLD_FILES) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      // Stream the source files (§FILE protocol) — no giant JSON blob, live progress.
      const parser = makeStreamParser((e) => {
        if (e.type === 'file-start') void mark('file_tree', 'running', e.path.split('/').pop());
      });
      await streamComplete([
        { role: 'system', content: GENERATE_FILES_STREAM },
        { role: 'user', content: filesPromptStream(JSON.stringify(blueprint)) },
      ], 32000, (delta) => parser.push(delta));
      const scaffoldPaths = new Set(SCAFFOLD_PATHS);
      const appFiles = parser.end().changes.filter((f) => f.path && f.content.trim() && !scaffoldPaths.has(f.path));
      if (!appFiles.length) throw new Error('The model produced no source files.');
      for (const f of appFiles) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      const total = SCAFFOLD_FILES.length + appFiles.length;
      await mark('file_tree', 'done', `${total} files`);
      for (const s of ['frontend', 'backend', 'auth_logic', 'styling', 'validate', 'fix'] as const) {
        await mark(s, 'done');
      }

      await mark('summarize', 'running');
      await supabase.from('ai_messages').insert({
        project_id: projectId, user_id: userId, generation_id: genId,
        role: 'assistant',
        content: `Generated ${total} files for ${blueprint.app_name}. Open the preview to try it, then keep iterating in chat.`,
        files_changed: appFiles.map((f) => f.path),
      });
      await mark('summarize', 'done');

      await supabase.from('projects').update({ status: 'ready' }).eq('id', projectId);
      await supabase.from('project_generations').update({
        status: 'succeeded', finished_at: new Date().toISOString(),
        input_tokens: bpRaw.inputTokens,
        output_tokens: bpRaw.outputTokens,
        summary: `Generated ${total} files`,
      }).eq('id', genId);
    } catch (err) {
      await supabase.from('projects').update({ status: 'error' }).eq('id', projectId);
      await supabase.from('project_generations').update({
        status: 'failed', error: err instanceof Error ? err.message : String(err), finished_at: new Date().toISOString(),
      }).eq('id', genId);
    }
  })();

  return { generationId: genId };
}

async function directEdit(projectId: string, message: string, previewError?: string): Promise<EditResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;

  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);

  // Pull recent turns BEFORE inserting this message so the model has the dialogue
  // context (e.g. a question it just asked) without seeing the new message twice.
  const { data: history } = await supabase
    .from('ai_messages').select('role, content')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(8);
  const historyText = (history ?? []).reverse()
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content.slice(0, 600)}`)
    .join('\n');

  await supabase.from('ai_messages').insert({ project_id: projectId, user_id: userId, role: 'user', content: message });

  const raw = await rawComplete([
    { role: 'system', content: EDIT_SYSTEM },
    { role: 'user', content: editPrompt(contextPayload(files ?? [], message, previewError ?? ''), message, previewError, historyText) },
  ], 16000);
  const parsed = await parseJsonWithRepair<{
    action?: string; explanation?: string; question?: string; options?: string[];
    changes?: { path: string; content: string }[]; deletions?: string[];
  }>(raw.text);

  // The assistant chose to ask a clarifying question — change nothing, just record it.
  if (parsed.action === 'ask' && parsed.question) {
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: parsed.question,
    });
    return { action: 'ask', explanation: '', question: parsed.question, options: parsed.options ?? [], changed: [], deleted: [] };
  }

  for (const c of parsed.changes ?? []) {
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: c.path, content: c.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of parsed.deletions ?? []) {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', path);
  }
  await supabase.from('ai_messages').insert({
    project_id: projectId, user_id: userId, role: 'assistant',
    content: parsed.explanation ?? 'Done.', files_changed: (parsed.changes ?? []).map((c) => c.path),
  });

  return {
    action: 'edit',
    explanation: parsed.explanation ?? 'Done.',
    changed: (parsed.changes ?? []).map((c) => c.path),
    deleted: parsed.deletions ?? [],
  };
}

// ----------------------------------------------------------------
// Streaming edit (direct mode) — renders work as it arrives
// ----------------------------------------------------------------

/** Read an SSE byte stream, invoking onData with the JSON payload of each `data:` line. */
async function readSSE(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) onData(line.slice(5).trim());
    }
  }
}

/** Stream a completion, calling onDelta with each text chunk as it arrives. */
async function streamComplete(
  messages: { role: string; content: string }[], maxTokens: number, onDelta: (t: string) => void,
): Promise<string> {
  if (!KEY && PROVIDER !== 'local') {
    throw new Error('Direct mode needs VITE_AI_API_KEY in .env (or deploy the edge functions).');
  }
  let full = '';
  if (PROVIDER === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: rest, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`anthropic ${res.status}`);
    await readSSE(res.body, (data) => {
      if (data === '[DONE]') return;
      let evt: { type?: string; delta?: { type?: string; text?: string } };
      try { evt = JSON.parse(data); } catch { return; }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
        full += evt.delta.text; onDelta(evt.delta.text);
      }
    });
    return full;
  }
  const base =
    PROVIDER === 'openai' ? 'https://api.openai.com/v1'
    : PROVIDER === 'openrouter' ? 'https://openrouter.ai/api/v1'
    : LOCAL_BASE;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY || 'local'}` },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`${PROVIDER} ${res.status}`);
  await readSSE(res.body, (data) => {
    if (data === '[DONE]') return;
    let evt: { choices?: { delta?: { content?: string } }[] };
    try { evt = JSON.parse(data); } catch { return; }
    const delta = evt.choices?.[0]?.delta?.content;
    if (delta) { full += delta; onDelta(delta); }
  });
  return full;
}

interface ParsedEdit {
  action: string;
  explanation: string;
  question: string;
  options: string[];
  changes: { path: string; content: string }[];
  deletions: string[];
}

/** Incrementally parse the §-delimited edit protocol, emitting progress events. */
function makeStreamParser(emit: (e: EditEvent) => void) {
  let buf = '';
  let section: 'explanation' | 'file' | 'question' | null = null;
  let curPath: string | null = null;
  let curContent = '';
  const out: ParsedEdit = { action: 'edit', explanation: '', question: '', options: [], changes: [], deletions: [] };

  const finishSection = () => {
    if (section === 'file' && curPath !== null) {
      out.changes.push({ path: curPath, content: curContent.replace(/\n$/, '') });
      emit({ type: 'file-done', path: curPath });
    }
    curPath = null; curContent = '';
  };

  const handleLine = (line: string) => {
    if (line.startsWith('§')) {
      const rest = line.slice(1);
      if (rest.startsWith('ACTION')) { finishSection(); out.action = rest.slice(6).trim() || 'edit'; section = null; }
      else if (rest.startsWith('EXPLANATION')) { finishSection(); section = 'explanation'; }
      else if (rest.startsWith('FILE')) {
        finishSection(); curPath = rest.slice(4).trim(); section = 'file';
        emit({ type: 'file-start', path: curPath });
      } else if (rest.startsWith('DELETE')) {
        finishSection();
        const p = rest.slice(6).trim();
        if (p) { out.deletions.push(p); emit({ type: 'deletion', path: p }); }
        section = null;
      } else if (rest.startsWith('QUESTION')) { finishSection(); section = 'question'; }
      else if (rest.startsWith('OPTION')) {
        finishSection();
        const o = rest.slice(6).trim();
        if (o) out.options.push(o);
        section = null;
      } else if (rest.startsWith('END')) { finishSection(); section = null; }
    } else if (section === 'explanation') {
      out.explanation += (out.explanation ? '\n' : '') + line;
      emit({ type: 'explanation', text: out.explanation });
    } else if (section === 'file') {
      curContent += line + '\n';
    } else if (section === 'question') {
      out.question += (out.question ? '\n' : '') + line;
      emit({ type: 'question', text: out.question });
    }
  };

  return {
    push(delta: string) {
      buf += delta;
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        handleLine(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    },
    end(): ParsedEdit {
      if (buf.length) { handleLine(buf); buf = ''; }
      finishSection();
      return out;
    },
  };
}

async function directEditStream(
  projectId: string, message: string, previewError: string | undefined,
  onEvent?: (e: EditEvent) => void,
): Promise<EditResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;

  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const { data: history } = await supabase
    .from('ai_messages').select('role, content')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(8);
  const historyText = (history ?? []).reverse()
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content.slice(0, 600)}`)
    .join('\n');

  await supabase.from('ai_messages').insert({ project_id: projectId, user_id: userId, role: 'user', content: message });

  onEvent?.({ type: 'start' });
  const parser = makeStreamParser((e) => onEvent?.(e));
  await streamComplete([
    { role: 'system', content: EDIT_SYSTEM_STREAM },
    { role: 'user', content: editPrompt(contextPayload(files ?? [], message, previewError ?? ''), message, previewError, historyText) },
  ], 16000, (delta) => parser.push(delta));
  const result = parser.end();

  if (result.action === 'ask' && result.question) {
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: result.question,
    });
    onEvent?.({ type: 'done' });
    return { action: 'ask', explanation: '', question: result.question, options: result.options, changed: [], deleted: [] };
  }

  // Apply atomically once the stream completes: progressive writes would flash transient
  // "module not found" states in the preview while imported files are still arriving.
  for (const c of result.changes) {
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: c.path, content: c.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of result.deletions) {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', path);
  }
  const explanation = result.explanation || 'Done.';
  await supabase.from('ai_messages').insert({
    project_id: projectId, user_id: userId, role: 'assistant',
    content: explanation, files_changed: result.changes.map((c) => c.path),
  });

  onEvent?.({ type: 'done' });
  return { action: 'edit', explanation, changed: result.changes.map((c) => c.path), deleted: result.deletions };
}
