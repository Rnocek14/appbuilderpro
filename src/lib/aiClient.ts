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
import { GENERATE_SYSTEM, GENERATE_FILES_STREAM, GENERATE_PLAN_SYSTEM, RESEARCH_SYSTEM, PROJECT_MAP_SYSTEM, DOC_ANALYZE_SYSTEM, ROADMAP_SYSTEM, IDEATION_SYSTEM, AUTOPILOT_DECIDE_SYSTEM, EDIT_SYSTEM, EDIT_SYSTEM_STREAM, blueprintPrompt, generationPlanPrompt, researchPrompt, projectMapPrompt, docAnalyzePrompt, roadmapPrompt, ideationPrompt, autopilotDecidePrompt, filesPromptStream, editPrompt } from './prompts';
import { contextPayload } from './contextBudget';
import { SCAFFOLD_FILES, SCAFFOLD_PATHS } from './scaffold';
import type { EditPlan } from '../types';
import { BRAIN_PATH, MAP_PATH, ROADMAP_PATH, brainContext, mapContext, roadmapContext, saveMap, saveRoadmap, saveIdeation, isMetaFile } from './projectBrain';

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
  // 'discuss' = a conversational answer/opinion; no files, no plan.
  // 'ask' = the assistant needs clarification and changed nothing yet.
  // 'plan' = the assistant proposed a plan to approve; no files changed yet.
  // 'edit' = files were modified. Defaults to 'edit' for backward compatibility
  // with edge-function responses that predate the conversational protocol.
  action: 'edit' | 'ask' | 'plan' | 'discuss';
  explanation: string;
  question?: string;
  options?: string[];
  plan?: EditPlan;
  changed: string[];
  deleted: string[];
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export async function startGeneration(projectId: string, prompt: string, planContext?: string): Promise<GenerateResult> {
  if (DIRECT) return directGenerate(projectId, prompt, planContext);
  const { data, error } = await supabase.functions.invoke('generate-app', {
    body: { projectId, prompt, planContext },
  });
  if (error) throw new Error(await readFnError(error));
  if (data?.error) throw new Error(data.error);
  return data as GenerateResult;
}

// Phased "what's next" roadmap from the Brain (intent) + Map (reality) + code. Saved so the
// user can revisit it; regenerate after meaningful changes.
export async function generateRoadmap(projectId: string): Promise<string> {
  if (!DIRECT) throw new Error('Roadmap generation currently requires direct mode (edge mirror coming).');
  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const all = files ?? [];
  const appFiles = all.filter((f) => !isMetaFile(f.path));
  if (!appFiles.length) throw new Error('No app files yet — generate the app first.');
  const brain = all.find((f) => f.path === BRAIN_PATH)?.content ?? '';
  const map = all.find((f) => f.path === MAP_PATH)?.content ?? '';

  const raw = await rawComplete([
    { role: 'system', content: ROADMAP_SYSTEM },
    { role: 'user', content: roadmapPrompt(brain, map, buildCodeDigest(appFiles)) },
  ], 3000);
  const roadmap = raw.text.trim();
  await saveRoadmap(projectId, roadmap);
  return roadmap;
}

// Analyze an uploaded document into concise, build-relevant notes for the Project Brain.
export async function analyzeDocument(filename: string, text: string): Promise<string> {
  if (!DIRECT) throw new Error('Document analysis currently requires direct mode (edge mirror coming).');
  if (!text.trim()) throw new Error('That document appears to be empty.');
  const raw = await rawComplete([
    { role: 'system', content: DOC_ANALYZE_SYSTEM },
    { role: 'user', content: docAnalyzePrompt(filename, text.slice(0, 60_000)) },
  ], 1500);
  return raw.text.trim();
}

export interface NextStep {
  action: 'build' | 'ask' | 'done';
  title: string;
  instruction?: string;
  question?: string;
  options?: string[];
  rationale?: string;
}

// Helper: pull a project's files + meta context for the intelligence functions.
async function loadProjectForAI(projectId: string) {
  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const all = files ?? [];
  return {
    appFiles: all.filter((f) => !isMetaFile(f.path)),
    brain: all.find((f) => f.path === BRAIN_PATH)?.content ?? '',
    map: all.find((f) => f.path === MAP_PATH)?.content ?? '',
    roadmap: all.find((f) => f.path === ROADMAP_PATH)?.content ?? '',
  };
}

// Ideation: where could this app go? Divergent grounded directions, saved for revisiting.
export async function generateIdeation(projectId: string): Promise<string> {
  if (!DIRECT) throw new Error('Ideation currently requires direct mode (edge mirror coming).');
  const { appFiles, brain, map } = await loadProjectForAI(projectId);
  if (!appFiles.length) throw new Error('No app files yet — generate the app first.');
  const raw = await rawComplete([
    { role: 'system', content: IDEATION_SYSTEM },
    { role: 'user', content: ideationPrompt(brain, map, buildCodeDigest(appFiles)) },
  ], 3000);
  const ideas = raw.text.trim();
  await saveIdeation(projectId, ideas);
  return ideas;
}

// Autopilot planner: decide the single most valuable next step (structured).
export async function decideNextStep(projectId: string, doneTitles: string[]): Promise<NextStep> {
  if (!DIRECT) throw new Error('Autopilot currently requires direct mode (edge mirror coming).');
  const { appFiles, brain, map, roadmap } = await loadProjectForAI(projectId);
  const raw = await rawComplete([
    { role: 'system', content: AUTOPILOT_DECIDE_SYSTEM },
    { role: 'user', content: autopilotDecidePrompt(brain, map, roadmap, buildCodeDigest(appFiles), doneTitles) },
  ], 2000);
  const p = await parseJsonWithRepair<NextStep>(raw.text);
  return {
    action: p.action === 'ask' || p.action === 'done' ? p.action : 'build',
    title: p.title ?? 'Next step',
    instruction: p.instruction,
    question: p.question,
    options: p.options ?? [],
    rationale: p.rationale,
  };
}

// Living project map: summarize the app's current source into a concise map (what exists,
// what's stubbed, the gaps), saved to /.fableforge/project-map.md and injected into every mode.
export async function generateProjectMap(projectId: string): Promise<string> {
  if (!DIRECT) throw new Error('Map generation currently requires direct mode (edge mirror coming).');
  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const appFiles = (files ?? []).filter((f) => !isMetaFile(f.path));
  if (!appFiles.length) throw new Error('No app files yet — generate the app first, then map it.');

  const raw = await rawComplete([
    { role: 'system', content: PROJECT_MAP_SYSTEM },
    { role: 'user', content: projectMapPrompt(buildCodeDigest(appFiles)) },
  ], 2000);
  const map = raw.text.trim();
  await saveMap(projectId, map);
  return map;
}

// Web research: answer market/competition/strategy questions with live web search via
// Anthropic's built-in web_search tool (no separate search API needed). Returns a discuss-style
// answer with citations. Anthropic runs the searches server-side, so this works in direct mode.
export async function researchAnswer(
  projectId: string, message: string, onEvent?: (e: EditEvent) => void,
): Promise<EditResult> {
  // Production path: the research edge function holds the key and runs web search server-side.
  if (!DIRECT) {
    onEvent?.({ type: 'start' });
    onEvent?.({ type: 'explanation', text: 'Reading your code, then searching the web…' });
    const { data, error } = await supabase.functions.invoke('research', { body: { projectId, message } });
    onEvent?.({ type: 'done' });
    if (error) throw new Error(await readFnError(error));
    if (data?.error) throw new Error(data.error);
    return { action: 'discuss', explanation: (data as { answer?: string })?.answer ?? '', changed: [], deleted: [] };
  }

  if (PROVIDER !== 'anthropic') throw new Error('Research currently requires the Anthropic provider (set VITE_AI_PROVIDER=anthropic).');
  if (!KEY) throw new Error('Research needs VITE_AI_API_KEY in .env (or deploy the edge functions).');

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;
  await supabase.from('ai_messages').insert({ project_id: projectId, user_id: userId, role: 'user', content: message });

  onEvent?.({ type: 'start' });
  onEvent?.({ type: 'explanation', text: 'Reading your code, then searching the web…' });

  // Deep context: the FULL source so the model can analyze what the app really is, then compare.
  const { data: project } = await supabase.from('projects').select('name, description').eq('id', projectId).single();
  const { data: files } = await supabase.from('project_files').select('path, content').eq('project_id', projectId).is('deleted_at', null);
  const allFiles = files ?? [];
  const brain = allFiles.find((f) => f.path === BRAIN_PATH)?.content ?? '';
  const ctx = [
    project?.name ? `App name: ${project.name}` : '',
    project?.description ? `Description: ${project.description}` : '',
    brain.trim() ? `\nPROJECT BRAIN (vision/goals/decisions):\n${brain.trim()}` : '',
    '',
    'FULL SOURCE CODE:',
    buildCodeDigest(allFiles.filter((f) => !isMetaFile(f.path))),
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: RESEARCH_SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
      messages: [{ role: 'user', content: researchPrompt(message, ctx) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Research failed (anthropic ${res.status}). ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const blocks = (data.content ?? []) as Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string }> }>;
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const sources = new Set<string>();
  for (const b of blocks) for (const c of b.citations ?? []) if (c.url) sources.add(`${c.title ?? c.url} — ${c.url}`);
  const answer = (text || 'I searched but did not find enough to answer confidently.') +
    (sources.size ? `\n\nSources:\n${[...sources].map((s) => `• ${s}`).join('\n')}` : '');

  await supabase.from('ai_messages').insert({ project_id: projectId, user_id: userId, role: 'assistant', content: answer });
  onEvent?.({ type: 'done' });
  return { action: 'discuss', explanation: answer, changed: [], deleted: [] };
}

// Build a full-source digest for deep research. Includes complete file contents, ordered
// app → pages → components → lib, capped so a large project can't blow context/cost.
function buildCodeDigest(files: { path: string; content: string }[]): string {
  const TOTAL_CAP = 140_000; // ~35k tokens
  const PER_FILE_CAP = 14_000;
  const rank = (p: string) =>
    /App\.(t|j)sx?$/.test(p) ? 0 : /\/pages\//.test(p) ? 1 : /\/components\//.test(p) ? 2 : /\/lib\//.test(p) ? 3 : 4;
  const sorted = [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));

  const parts: string[] = [];
  let used = 0;
  let included = 0;
  for (const f of sorted) {
    if (used >= TOTAL_CAP) break;
    let content = f.content ?? '';
    if (content.length > PER_FILE_CAP) content = content.slice(0, PER_FILE_CAP) + '\n…(file truncated)';
    const block = `\n===== ${f.path} =====\n${content}\n`;
    parts.push(block);
    used += block.length;
    included++;
  }
  if (included < sorted.length) parts.push(`\n…(${sorted.length - included} more file(s) omitted for length)`);
  return parts.join('');
}

// Plan-first cold start: propose the app (pages, features, files) for the user to approve
// BEFORE generating any files. A single lightweight model call — generates nothing. The
// approved plan is later passed to startGeneration() as planContext so the build follows it.
export async function draftGenerationPlan(prompt: string): Promise<{ plan: EditPlan }> {
  // Production path: the draft-plan edge function holds the key.
  if (!DIRECT) {
    const { data, error } = await supabase.functions.invoke('draft-plan', { body: { prompt } });
    if (error) throw new Error(await readFnError(error));
    if (data?.error) throw new Error(data.error);
    const p = (data as { plan?: EditPlan })?.plan;
    if (!p) throw new Error('Could not draft a plan.');
    return { plan: p };
  }

  const raw = await rawComplete([
    { role: 'system', content: GENERATE_PLAN_SYSTEM },
    { role: 'user', content: generationPlanPrompt(prompt) },
  ], 4000);
  const p = await parseJsonWithRepair<{
    summary?: string; steps?: string[]; fileHints?: string[]; options?: string[]; openQuestions?: string[];
  }>(raw.text);
  return {
    plan: {
      summary: (p.summary ?? '').trim(),
      steps: p.steps ?? [],
      fileHints: p.fileHints ?? [],
      options: p.options ?? [],
      openQuestions: p.openQuestions ?? [],
    },
  };
}

export async function sendEdit(
  projectId: string, message: string, previewError?: string,
  onEvent?: (e: EditEvent) => void, planFirst?: boolean,
): Promise<EditResult> {
  // Both paths stream so the UI can render the edit landing file-by-file.
  if (DIRECT) return directEditStream(projectId, message, previewError, onEvent, planFirst);
  return edgeEditStream(projectId, message, previewError, onEvent, planFirst);
}

// Calls the streaming chat-edit edge function. supabase-js's functions.invoke buffers the
// whole response, so we fetch the function URL directly and read its SSE body.
async function edgeEditStream(
  projectId: string, message: string, previewError: string | undefined,
  onEvent?: (e: EditEvent) => void, planFirst?: boolean,
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
    body: JSON.stringify({ projectId, message, previewError, planFirst }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `chat-edit failed (${res.status})`);
  }

  interface DoneMsg { action?: string; explanation?: string; question?: string; options?: string[]; plan?: EditPlan; changed?: string[]; deleted?: string[] }
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
  const a = held.final.action;
  const action = a === 'ask' || a === 'plan' || a === 'discuss' ? a : 'edit';
  return {
    action,
    explanation: held.final.explanation ?? '',
    question: held.final.question,
    options: held.final.options ?? [],
    plan: held.final.plan,
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

async function directGenerate(projectId: string, prompt: string, planContext?: string): Promise<GenerateResult> {
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
      // If the user approved a plan up front, fold it into the blueprint request so the
      // generated app follows what they signed off on.
      const bpUserPrompt = planContext
        ? `${prompt}\n\nThe user reviewed and approved this plan — follow it:\n${planContext}`
        : prompt;
      const bpRaw = await rawComplete([
        { role: 'system', content: GENERATE_SYSTEM },
        { role: 'user', content: blueprintPrompt(bpUserPrompt) },
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

  const brainNs = (files ?? []).find((f) => f.path === BRAIN_PATH)?.content ?? '';
  const mapNs = (files ?? []).find((f) => f.path === MAP_PATH)?.content ?? '';
  const roadmapNs = (files ?? []).find((f) => f.path === ROADMAP_PATH)?.content ?? '';
  const appFilesNs = (files ?? []).filter((f) => !isMetaFile(f.path));
  const debugNs = previewError
    ? '\n\nThis is a bug fix. Diagnose the ROOT CAUSE (not just the symptom), state it in one line, then make the smallest change that addresses it.'
    : '';
  const raw = await rawComplete([
    { role: 'system', content: EDIT_SYSTEM },
    { role: 'user', content: brainContext(brainNs) + mapContext(mapNs) + roadmapContext(roadmapNs) + editPrompt(contextPayload(appFilesNs, message, previewError ?? ''), message, previewError, historyText) + debugNs },
  ], 16000);
  const parsed = await parseJsonWithRepair<{
    action?: string; explanation?: string; question?: string; options?: string[];
    summary?: string; steps?: string[]; fileHints?: string[]; openQuestions?: string[];
    changes?: { path: string; content: string }[]; deletions?: string[];
  }>(raw.text);

  // The assistant chose to ask a clarifying question — change nothing, just record it.
  if (parsed.action === 'ask' && parsed.question) {
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: parsed.question,
    });
    return { action: 'ask', explanation: '', question: parsed.question, options: parsed.options ?? [], changed: [], deleted: [] };
  }

  // Conversational answer/opinion — change nothing, record the reply.
  if (parsed.action === 'discuss') {
    const answer = parsed.explanation ?? '';
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: answer,
    });
    return { action: 'discuss', explanation: answer, changed: [], deleted: [] };
  }

  // Plan mode: proposed a plan, no files changed. Record it and hand it to the UI.
  if (parsed.action === 'plan' && (parsed.summary || parsed.steps?.length)) {
    const plan: EditPlan = {
      summary: (parsed.summary ?? '').trim(), steps: parsed.steps ?? [],
      fileHints: parsed.fileHints ?? [], options: parsed.options ?? [], openQuestions: parsed.openQuestions ?? [],
    };
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: renderPlanText(plan),
    });
    return { action: 'plan', explanation: '', plan, changed: [], deleted: [] };
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
  // plan-mode fields
  summary: string;
  steps: string[];
  fileHints: string[];
  openQuestions: string[];
}

/** Project the parsed protocol's plan fields into the public EditPlan shape. */
function toEditPlan(p: { summary: string; steps: string[]; fileHints: string[]; options: string[]; openQuestions: string[] }): EditPlan {
  return {
    summary: p.summary.trim(),
    steps: p.steps,
    fileHints: p.fileHints,
    options: p.options,
    openQuestions: p.openQuestions,
  };
}

/** A readable markdown rendering of a plan, stored in ai_messages so it persists in chat. */
function renderPlanText(plan: EditPlan): string {
  const lines = [`**Plan:** ${plan.summary}`, ''];
  if (plan.steps.length) { lines.push('Steps:'); plan.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`)); lines.push(''); }
  if (plan.fileHints.length) { lines.push('Files:'); plan.fileHints.forEach((f) => lines.push(`• ${f}`)); lines.push(''); }
  if (plan.options.length) { lines.push('Options:'); plan.options.forEach((o) => lines.push(`• ${o}`)); lines.push(''); }
  if (plan.openQuestions.length) { lines.push('Open questions:'); plan.openQuestions.forEach((q) => lines.push(`• ${q}`)); lines.push(''); }
  lines.push('_Approve to build, or reply to change the plan._');
  return lines.join('\n').trim();
}

/** Incrementally parse the §-delimited edit protocol, emitting progress events. */
function makeStreamParser(emit: (e: EditEvent) => void) {
  let buf = '';
  let section: 'explanation' | 'file' | 'question' | 'summary' | null = null;
  let curPath: string | null = null;
  let curContent = '';
  const out: ParsedEdit = {
    action: 'edit', explanation: '', question: '', options: [], changes: [], deletions: [],
    summary: '', steps: [], fileHints: [], openQuestions: [],
  };

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
      else if (rest.startsWith('SUMMARY')) { finishSection(); section = 'summary'; }
      else if (rest.startsWith('STEP')) { finishSection(); const s = rest.slice(4).trim(); if (s) out.steps.push(s); section = null; }
      // FILEHINT must be checked before FILE — both start with "FILE".
      else if (rest.startsWith('FILEHINT')) { finishSection(); const h = rest.slice(8).trim(); if (h) out.fileHints.push(h); section = null; }
      else if (rest.startsWith('FILE')) {
        finishSection(); curPath = rest.slice(4).trim(); section = 'file';
        emit({ type: 'file-start', path: curPath });
      } else if (rest.startsWith('DELETE')) {
        finishSection();
        const p = rest.slice(6).trim();
        if (p) { out.deletions.push(p); emit({ type: 'deletion', path: p }); }
        section = null;
      } else if (rest.startsWith('QUESTION')) { finishSection(); section = 'question'; }
      else if (rest.startsWith('OPENQ')) { finishSection(); const q = rest.slice(5).trim(); if (q) out.openQuestions.push(q); section = null; }
      else if (rest.startsWith('OPTION')) {
        finishSection();
        const o = rest.slice(6).trim();
        if (o) out.options.push(o);
        section = null;
      } else if (rest.startsWith('END')) { finishSection(); section = null; }
    } else if (section === 'explanation') {
      out.explanation += (out.explanation ? '\n' : '') + line;
      emit({ type: 'explanation', text: out.explanation });
    } else if (section === 'summary') {
      out.summary += (out.summary ? '\n' : '') + line;
      emit({ type: 'explanation', text: out.summary });
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
  onEvent?: (e: EditEvent) => void, planFirst?: boolean,
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
  // "Plan first" forces plan mode regardless of routing — directive goes to the
  // model only, not into the stored user message.
  const planDirective = planFirst
    ? '\n\nIMPORTANT: The user asked you to PLAN first. Respond with §ACTION plan only — propose the plan and change NO files yet.'
    : '';
  const debugDirective = previewError
    ? '\n\nThis is a bug fix. Diagnose the ROOT CAUSE (not just the symptom), state it in one line in §EXPLANATION, then make the smallest change that addresses it. Do not rewrite unrelated code.'
    : '';
  const brain = (files ?? []).find((f) => f.path === BRAIN_PATH)?.content ?? '';
  const map = (files ?? []).find((f) => f.path === MAP_PATH)?.content ?? '';
  const roadmap = (files ?? []).find((f) => f.path === ROADMAP_PATH)?.content ?? '';
  const appFiles = (files ?? []).filter((f) => !isMetaFile(f.path));
  await streamComplete([
    { role: 'system', content: EDIT_SYSTEM_STREAM },
    { role: 'user', content: brainContext(brain) + mapContext(map) + roadmapContext(roadmap) + editPrompt(contextPayload(appFiles, message, previewError ?? ''), message, previewError, historyText) + planDirective + debugDirective },
  ], 16000, (delta) => parser.push(delta));
  const result = parser.end();

  if (result.action === 'ask' && result.question) {
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: result.question,
    });
    onEvent?.({ type: 'done' });
    return { action: 'ask', explanation: '', question: result.question, options: result.options, changed: [], deleted: [] };
  }

  // Discuss: a conversational answer/opinion. Change NO files; record the answer as an
  // assistant message (it already streamed into the UI via explanation events).
  if (result.action === 'discuss') {
    const answer = result.explanation || 'Happy to help — what would you like to dig into?';
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: answer,
    });
    onEvent?.({ type: 'done' });
    return { action: 'discuss', explanation: answer, changed: [], deleted: [] };
  }

  // Plan mode: the assistant proposed a plan. Change NO files; record the plan as an
  // assistant message (so it stays in the conversation context) and hand it to the UI
  // for approval. Approval comes back as a normal follow-up edit.
  if (result.action === 'plan' && (result.summary || result.steps.length)) {
    const plan = toEditPlan(result);
    await supabase.from('ai_messages').insert({
      project_id: projectId, user_id: userId, role: 'assistant', content: renderPlanText(plan),
    });
    onEvent?.({ type: 'done' });
    return { action: 'plan', explanation: '', plan, changed: [], deleted: [] };
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
