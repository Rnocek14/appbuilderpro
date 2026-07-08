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
import { GENERATE_SYSTEM, GENERATE_FILES_STREAM, GENERATE_PLAN_SYSTEM, RESEARCH_SYSTEM, PROJECT_MAP_SYSTEM, DOC_ANALYZE_SYSTEM, ROADMAP_SYSTEM, IDEATION_SYSTEM, AUTOPILOT_DECIDE_SYSTEM, EDIT_SYSTEM, EDIT_SYSTEM_STREAM, SCHEMA_SYSTEM, blueprintPrompt, generationPlanPrompt, researchPrompt, projectMapPrompt, docAnalyzePrompt, roadmapPrompt, ideationPrompt, autopilotDecidePrompt, filesPromptStream, editPrompt, schemaPrompt, schemaFromCodePrompt } from './prompts';
import { contextPayload, applyEditGuardrail } from './contextBudget';
import { buildPendingFiles, type PendingEdit } from './pendingEdit';
import { SCAFFOLD_FILES, SCAFFOLD_PATHS, THEME_FOUNDATION, UI_INDEX_THEMETOGGLE_EXPORT } from './scaffold';
import { buildIndexCss, buildIndexCssForDesign, parseDesignSpec, getPreset } from './themePresets';
import { tokenizeColors } from './tokenize';
import type { EditPlan } from '../types';
import { ASSETS_PATH, BRAIN_PATH, MAP_PATH, ROADMAP_PATH, brainContext, mapContext, roadmapContext, saveMap, saveRoadmap, saveIdeation, isMetaFile } from './projectBrain';
import { runQA, issuesToFixRequest, type QAIssue } from './projectQA';
import { PREFS_PATH, prefsContext } from './preferences';
import { MAIN_THREAD_ID, threadOf } from './threads';
import { previewContext } from './previewRuntime';
import { resolveAI, providerInfo, DIRECT, type Provider } from './aiConfig';
import { PREFERENCE_DISTILL_SYSTEM, DIRECTIONS_SYSTEM, directionPickPrompt, singleDirectionPrompt, filesPromptChunk } from './prompts';
import { parseProtocol } from '../../supabase/functions/_shared/streamparse';
import { recordUsage } from './usage';
import { agenticEdit, agenticVerifyAndFix, generationCompileGate } from './agent/edit';
import { agentAvailable } from './agent/loop';

interface Usage { inputTokens: number; outputTokens: number }
interface AIMessageRow { role: string; content: string; thread_id?: string | null }

export type { Provider };

// ----------------------------------------------------------------
// Provider HTTP helpers — friendly, actionable errors. A raw `fetch()` that can't reach the
// host rejects with the opaque "Failed to fetch"; we translate that (and HTTP errors) into a
// message that tells the user what to actually do (check key / provider / network).
// ----------------------------------------------------------------

/** fetch() that turns a network-level rejection into an actionable message naming the provider. */
async function providerFetch(url: string, init: RequestInit, providerLabel: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(
      `Couldn't reach ${providerLabel}. The request failed before any response — usually a network drop, ` +
      `an ad/privacy blocker, or a missing/invalid API key for this provider. ` +
      `Check the model picker (key + provider) and your connection, then try again.`,
    );
  }
}

/** Build a clear error from a non-2xx provider response. */
async function httpError(res: Response, providerLabel: string): Promise<Error> {
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) {
    return new Error(`${providerLabel} rejected the API key (${res.status}). Add or fix the key in the model picker.`);
  }
  if (res.status === 404) {
    return new Error(`${providerLabel} returned 404 — the model id is probably wrong for this provider. Pick a valid model. ${detail}`);
  }
  if (res.status === 429) {
    if (/too large|tokens per min|\bTPM\b|rate limit|context length|maximum context/i.test(detail)) {
      return new Error(
        `${providerLabel}: this request is over your per-minute token limit. Pick a smaller model ` +
        `(e.g. gpt-4o-mini / a -mini or -flash model has a much higher limit), upgrade your plan, or wait a minute. ${detail}`,
      );
    }
    return new Error(`${providerLabel} is rate-limited or out of quota (429). Wait a moment or check your plan. ${detail}`);
  }
  return new Error(`${providerLabel} request failed (${res.status}). ${detail}`);
}

/**
 * Open a connection to a provider with retry on transient failures (network drop, 429, 5xx).
 * Retries only the connect — once a 2xx body is returned the caller streams it, so we never
 * replay a partially-consumed stream. Throws an actionable error after the final attempt.
 */
async function connectProvider(url: string, init: RequestInit, providerLabel: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); // user hit Stop — don't retry
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 800 * 2 ** attempt)); continue; }
      throw new Error(
        `Couldn't reach ${providerLabel}. The request failed before any response — usually a network drop, ` +
        `an ad/privacy blocker, or a missing/invalid API key. Check the model picker and your connection, then retry.`,
      );
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      continue;
    }
    throw await httpError(res, providerLabel);
  }
  throw new Error(`Couldn't reach ${providerLabel}.`);
}

export interface GenerateResult { generationId: string }

// Live progress emitted while an edit streams in, so the UI can show its work.
export type EditEvent =
  | { type: 'start' }
  | { type: 'explanation'; text: string }
  | { type: 'activity'; text: string } // live agent tool feed ("Reading src/App.tsx", "Type-checking")
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
  // 'review' = a proposed change set awaiting the user's diff approval; nothing written yet.
  action: 'edit' | 'ask' | 'plan' | 'discuss' | 'review';
  explanation: string;
  question?: string;
  options?: string[];
  plan?: EditPlan;
  changed: string[];
  deleted: string[];
  /** Edits the safe-edit guardrail refused to write (existing files the model couldn't see). */
  blocked?: string[];
  /** Present when action === 'review': the not-yet-written change set for diff approval. */
  pending?: PendingEdit;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export async function startGeneration(projectId: string, prompt: string, planContext?: string): Promise<GenerateResult> {
  if (DIRECT) return directGenerate(projectId, prompt, planContext);
  // Cloud mode (no browser key): orchestrate CLIENT-side in short relay calls — the edge
  // generate-app worker has a hard wall-clock that kills big builds mid-stream.
  if (!resolveAI().ready) return chunkedCloudGenerate(projectId, prompt, planContext);
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

// Distill a user's note/correction into one durable preference rule (the "learning"). Falls back
// to the cleaned-up raw text if direct mode is off or the model call fails — so a preference is
// never lost just because distillation didn't run.
export async function distillPreference(raw: string, recentContext?: string): Promise<string> {
  const clean = raw.trim();
  if (!clean) return '';
  if (!DIRECT || !resolveAI().ready) return clean;
  try {
    const out = await rawComplete([
      { role: 'system', content: PREFERENCE_DISTILL_SYSTEM },
      { role: 'user', content: `Turn this into one durable preference rule.${recentContext ? `\n\nRecent context:\n${recentContext.slice(0, 1500)}` : ''}\n\nUser note: "${clean}"` },
    ], 200);
    const rule = out.text.trim().replace(/^["']|["']$/g, '').split('\n')[0].trim();
    return rule || clean;
  } catch {
    return clean;
  }
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
  projectId: string, message: string, onEvent?: (e: EditEvent) => void, threadId: string = MAIN_THREAD_ID,
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

  const ai = resolveAI();
  if (ai.provider !== 'anthropic') throw new Error('Research needs the Anthropic provider (web search runs server-side at Anthropic). Switch the model picker to Claude.');
  if (!ai.key) throw new Error('Research needs an Anthropic API key — add one in the model picker.');

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;
  await insertAiMessage({ project_id: projectId, user_id: userId, role: 'user', content: message, thread_id: threadId });

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

  const res = await providerFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ai.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ai.model,
      max_tokens: 8000,
      system: RESEARCH_SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
      messages: [{ role: 'user', content: researchPrompt(message, ctx) }],
    }),
  }, 'Anthropic');
  if (!res.ok) throw await httpError(res, 'Anthropic');

  const data = await res.json();
  const blocks = (data.content ?? []) as Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string }> }>;
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const sources = new Set<string>();
  for (const b of blocks) for (const c of b.citations ?? []) if (c.url) sources.add(`${c.title ?? c.url} — ${c.url}`);
  const answer = (text || 'I searched but did not find enough to answer confidently.') +
    (sources.size ? `\n\nSources:\n${[...sources].map((s) => `• ${s}`).join('\n')}` : '');

  const id = await insertAiMessage({ project_id: projectId, user_id: userId, role: 'assistant', content: answer, thread_id: threadId });
  // Note: web_search billing isn't in token usage, so this undercounts research a little.
  recordUsage({ provider: ai.provider, model: ai.model, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, messageId: id });
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
  onEvent?: (e: EditEvent) => void, planFirst?: boolean, image?: string, threadId: string = MAIN_THREAD_ID,
  reviewMode?: boolean, signal?: AbortSignal,
): Promise<EditResult> {
  // AGENTIC PATH (default when available): the model works with tools — it reads files, researches the
  // web, edits, and verifies with the real compiler, iterating until clean. This is the trust/capability
  // upgrade. Plan-first and review-before-write keep the classic single-shot path (they need the plan /
  // diff-approval protocol the tool loop doesn't produce). Non-Anthropic providers use the classic path.
  if (!planFirst && !reviewMode && agentAvailable()) {
    return agenticEdit(projectId, message, previewError, onEvent, image, threadId, signal);
  }
  // Both classic paths stream so the UI can render the edit landing file-by-file.
  // reviewMode (review-before-write) is direct-mode only for now; the edge path applies as before.
  if (DIRECT) return directEditStream(projectId, message, previewError, onEvent, planFirst, image, threadId, reviewMode, signal);
  return edgeEditStream(projectId, message, previewError, onEvent, planFirst, image, threadId, signal);
}

// Calls the streaming chat-edit edge function. supabase-js's functions.invoke buffers the
// whole response, so we fetch the function URL directly and read its SSE body.
async function edgeEditStream(
  projectId: string, message: string, previewError: string | undefined,
  onEvent?: (e: EditEvent) => void, planFirst?: boolean, image?: string, threadId: string = MAIN_THREAD_ID,
  signal?: AbortSignal,
): Promise<EditResult> {
  const { data: { session } } = await supabase.auth.getSession();
  onEvent?.({ type: 'start' });
  const res = await fetch(`${supabaseUrl}/functions/v1/chat-edit`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
    },
    // `image`/`threadId` are forwarded for when the edge function supports them; harmless if ignored.
    body: JSON.stringify({ projectId, message, previewError, planFirst, image, threadId }),
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

export interface DesignDirection {
  archetype: string; name: string; risk: string; accentHue: number;
  headingFont: string; bodyFont: string; brief: string; preview_html: string;
}

// Normalize preview HTML defensively: strip markdown fences, and wrap bare fragments in a
// real document (a fragment in srcdoc renders, but with browser default margins/fonts).
function cleanPreviewHtml(h: string): string {
  let s = h.trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!/<html[\s>]/i.test(s)) {
    s = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${s}</body></html>`;
  }
  return s;
}

const DIRECTION_FALLBACK_PICKS = [
  { archetype: 'ENTERPRISE CLARITY', risk: 'safe' },
  { archetype: 'MIDNIGHT PRO TOOL', risk: 'opinionated' },
  { archetype: 'EDITORIAL BROADSHEET', risk: 'bold' },
];

/**
 * Pre-build DESIGN DIRECTIONS: 3 committed, maximally-distinct visual identities, FAN-OUT style —
 * one tiny archetype-pick call, then one direction per parallel call. Each call is small (fits the
 * edge relay's time limits, unlike one giant 3-preview response), previews arrive progressively
 * via onDirection, and per-call archetype assignment beats a batched call on diversity.
 */
export async function generateDesignDirections(
  prompt: string, onDirection?: (d: DesignDirection) => void,
): Promise<DesignDirection[]> {
  // Stage 1 — pick the 3 archetypes (fast, tiny; falls back to a spanning default trio).
  let picks = DIRECTION_FALLBACK_PICKS;
  try {
    const raw = await rawComplete([
      { role: 'system', content: DIRECTIONS_SYSTEM },
      { role: 'user', content: directionPickPrompt(prompt) },
    ], 600, { fast: true });
    const parsed = await parseJsonWithRepair<{ picks?: { archetype?: string; risk?: string }[] }>(raw.text);
    const got = (parsed?.picks ?? [])
      .filter((p) => p && typeof p.archetype === 'string' && p.archetype.length > 2)
      .map((p) => ({ archetype: p.archetype as string, risk: (p.risk === 'opinionated' || p.risk === 'bold') ? p.risk : 'safe' }));
    if (got.length >= 3) picks = got.slice(0, 3);
  } catch { /* fall back to the default trio */ }

  // Stage 2 — one direction per call, in parallel; a single bad/slow direction never kills the set.
  const out: DesignDirection[] = [];
  await Promise.all(picks.map(async (p) => {
    try {
      // Fast tier: previews are simple archetype-driven HTML — the cheap model renders them
      // 3-4x sooner, and the ARCHETYPE SPEC (not model taste) carries the design quality.
      const raw = await rawComplete([
        { role: 'system', content: DIRECTIONS_SYSTEM },
        { role: 'user', content: singleDirectionPrompt(prompt, p, picks) },
      ], 3200, { fast: true });
      const parsed = await parseJsonWithRepair<{ direction?: DesignDirection; directions?: DesignDirection[] }>(raw.text);
      // Accept BOTH shapes — the system prompt's batched contract sometimes wins over the
      // per-call "one direction" instruction; discarding those results = blank picker.
      const d = parsed?.direction ?? (Array.isArray(parsed?.directions) ? parsed.directions[0] : undefined);
      if (d && typeof d.preview_html === 'string' && d.preview_html.length > 200 && Number.isFinite(Number(d.accentHue))) {
        const dir: DesignDirection = {
          ...d,
          archetype: d.archetype || p.archetype,
          risk: d.risk || p.risk,
          preview_html: cleanPreviewHtml(d.preview_html),
        };
        out.push(dir);
        onDirection?.(dir);
      }
    } catch { /* one direction failing is fine — the picker works with 2 */ }
  }));
  return out;
}

/** One-shot completion via FableForge Cloud (the agent-turn relay) — used whenever the user has
 * no browser API key, so every AI feature works out of the box on the operator's metered key. */
async function cloudComplete(messages: { role: string; content: string }[], maxTokens: number, fast = false): Promise<RawResult> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  const { data, error } = await supabase.functions.invoke('agent-turn', {
    body: { system, messages: rest, tools: [], maxTokens, fast },
  });
  if (error) throw new Error(`FableForge Cloud AI: ${error.message}`);
  const d = data as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: string;
  } | null;
  if (d?.error) throw new Error(d.error);
  const text = (d?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
  if (!text) throw new Error('FableForge Cloud AI returned no text.');
  const inputTokens = d?.usage?.input_tokens ?? 0;
  const outputTokens = d?.usage?.output_tokens ?? 0;
  recordUsage({ provider: 'anthropic', model: 'cloud', inputTokens, outputTokens });
  return { text, inputTokens, outputTokens };
}

export async function rawComplete(messages: { role: string; content: string }[], maxTokens = 8192, opts: { fast?: boolean } = {}): Promise<RawResult> {
  const ai = resolveAI();
  const label = providerInfo(ai.provider).label;
  if (!ai.ready) {
    // FableForge Cloud fallback: no browser key → relay through the agent-turn edge proxy
    // (operator key held server-side, metered by credits). Users never have to paste a key.
    return cloudComplete(messages, maxTokens, opts.fast ?? false);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (ai.provider === 'anthropic') {
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const rest = messages.filter((m) => m.role !== 'system');
        const res = await providerFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': ai.key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model: ai.model, max_tokens: maxTokens, system, messages: rest }),
        }, label);
        if (!res.ok) throw await httpError(res, label);
        const data = await res.json();
        const inputTokens = data.usage?.input_tokens ?? 0;
        const outputTokens = data.usage?.output_tokens ?? 0;
        recordUsage({ provider: ai.provider, model: ai.model, inputTokens, outputTokens });
        return {
          text: data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n'),
          inputTokens,
          outputTokens,
        };
      }
      // OpenAI-compatible providers (openai, xai/Grok, gemini, openrouter, local).
      const res = await providerFetch(`${ai.openAIBase}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.key || 'local'}` },
        body: JSON.stringify({ model: ai.model, max_tokens: maxTokens, messages }),
      }, label);
      if (!res.ok) throw await httpError(res, label);
      const data = await res.json();
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;
      recordUsage({ provider: ai.provider, model: ai.model, inputTokens, outputTokens });
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens,
        outputTokens,
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

// A typed Supabase client for generated apps — reads env, warns if unset. Static (no model call).
const GENERATED_SUPABASE_CLIENT = `// src/lib/supabaseClient.ts — generated by FableForge.
// Connect this app to your backend: create a project at https://supabase.com, then set
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — running on localStorage until you connect a backend.');
}

// createClient THROWS on an empty URL, which would crash the whole app before a backend is
// connected. Fall back to an inert placeholder so the module loads; data access goes through
// db.ts, which only talks to Supabase when VITE_SUPABASE_URL is actually set — so this is never hit.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key');
export const isSupabaseConnected = Boolean(url && anonKey);
`;

const GENERATED_ENV_EXAMPLE = `# Supabase — create a project at https://supabase.com, open Project Settings > API,
# then paste the values here and rename this file to .env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
`;

function stripFences(s: string): string {
  const m = s.match(/\`\`\`(?:sql)?\s*([\s\S]*?)\`\`\`/i);
  return (m ? m[1] : s).trim();
}

async function writeProjectFile(projectId: string, path: string, content: string): Promise<void> {
  await supabase.from('project_files').upsert(
    { project_id: projectId, path, content, updated_by_ai: true },
    { onConflict: 'project_id,path' },
  );
}

/**
 * Insert an ai_messages row (including thread_id) and return its id. If the thread_id column
 * doesn't exist yet (migration not applied), it transparently retries WITHOUT thread_id, so chat
 * keeps working as a single Main thread until the one-line migration is run.
 */
async function insertAiMessage(row: Record<string, unknown>): Promise<string | undefined> {
  const res = await supabase.from('ai_messages').insert(row).select('id').single();
  if (res.error && /thread_id|column|schema cache|does not exist/i.test(res.error.message ?? '')) {
    const { thread_id: _omit, ...rest } = row; void _omit;
    const retry = await supabase.from('ai_messages').insert(rest).select('id').single();
    return (retry.data as { id?: string } | null)?.id;
  }
  return (res.data as { id?: string } | null)?.id;
}

/**
 * Materialize the blueprint's database_schema/auth_rules into real, deployable backend files:
 * a Supabase migration (tables + RLS + owner policies + auth trigger), a typed client, and a
 * .env.example. Direct mode only for now (edge mirror pending). Returns the table count;
 * a zero-table blueprint writes nothing.
 */
export async function generateBackend(projectId: string, blueprintJson: string): Promise<{ tables: number }> {
  let tables = 0;
  try {
    const bp = JSON.parse(blueprintJson) as { database_schema?: { tables?: unknown[] } };
    tables = bp.database_schema?.tables?.length ?? 0;
  } catch { tables = 0; }
  if (!tables) return { tables: 0 };

  const sqlRaw = await rawComplete([
    { role: 'system', content: SCHEMA_SYSTEM },
    { role: 'user', content: schemaPrompt(blueprintJson) },
  ]);
  const sql = stripFences(sqlRaw.text);
  if (!sql || /^--\s*no tables required/i.test(sql)) return { tables: 0 };

  await writeProjectFile(projectId, '/supabase/migrations/0001_init.sql', sql + '\n');
  await writeProjectFile(projectId, '/src/lib/supabaseClient.ts', GENERATED_SUPABASE_CLIENT);
  await writeProjectFile(projectId, '/.env.example', GENERATED_ENV_EXAMPLE);
  return { tables };
}

/**
 * Generate a backend for an EXISTING project (generated or imported) by inferring the schema
 * from its source code — no blueprint needed. Writes the migration + client + .env.example.
 * Direct mode only (edge mirror pending). Returns the number of tables created.
 */
export async function generateBackendFromProject(projectId: string): Promise<{ tables: number }> {
  if (!DIRECT) throw new Error('Backend generation currently requires direct mode (edge mirror coming).');
  const { data } = await supabase.from('project_files').select('path,content')
    .eq('project_id', projectId).is('deleted_at', null);
  const files = ((data ?? []) as { path: string; content: string }[])
    .filter((f) => !isMetaFile(f.path) && !f.path.startsWith('/supabase/'));
  if (!files.length) throw new Error('No source files to analyze.');

  const sqlRaw = await rawComplete([
    { role: 'system', content: SCHEMA_SYSTEM },
    { role: 'user', content: schemaFromCodePrompt(buildCodeDigest(files)) },
  ]);
  const sql = stripFences(sqlRaw.text);
  if (!sql || /^--\s*no tables required/i.test(sql)) return { tables: 0 };

  await writeProjectFile(projectId, '/supabase/migrations/0001_init.sql', sql + '\n');
  await writeProjectFile(projectId, '/src/lib/supabaseClient.ts', GENERATED_SUPABASE_CLIENT);
  await writeProjectFile(projectId, '/.env.example', GENERATED_ENV_EXAMPLE);
  return { tables: (sql.match(/create table/gi) ?? []).length };
}

/**
 * Convert an existing project to the design-token theme by mechanically tokenizing the color
 * classes in every app source file (deterministic, guaranteed coverage), and ensuring the theme
 * foundation exists. Returns how many files changed. Pair with applyThemePreset to recolor.
 */
export async function convertProjectToTokens(projectId: string): Promise<{ changed: number }> {
  const { data } = await supabase.from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const all = (data ?? []) as { path: string; content: string }[];
  await ensureThemeFoundation(projectId, all);

  const targets = all.filter(
    (f) => /\.(t|j)sx?$/.test(f.path) && f.path.startsWith('/src/') && !isMetaFile(f.path),
  );
  let changed = 0;
  for (const f of targets) {
    const next = tokenizeColors(f.content);
    if (next !== f.content) {
      await writeProjectFile(projectId, f.path, next);
      changed++;
    }
  }
  return { changed };
}

/**
 * Silently make sure a FableForge-kit project has the theme foundation, so theming is automatic
 * (no button needed): write the theme hook / ThemeToggle / barrel export if missing, and upgrade
 * the OLD `--color-*` scaffold stylesheet to the canonical token system when detected. Idempotent
 * and cheap — only writes what's missing/outdated. Skips non-kit (imported/foreign) projects and
 * never overwrites a stylesheet the user has already moved onto tokens or customized.
 */
/**
 * Apply a named color preset to a project: rewrite /src/index.css with the preset's token values
 * (instant, no model call) and make sure the theme hook + toggle exist. Recolors the whole app at
 * once because every surface is token-driven. Returns the preset name.
 */
export async function applyThemePreset(projectId: string, presetId: string): Promise<{ name: string; changed: number }> {
  // Tokenize the app's colors first (idempotent — no-ops once already on tokens), so the preset
  // visibly recolors the WHOLE app, not just elements that already used tokens. Then write the
  // palette. One click = convert + recolor.
  const { changed } = await convertProjectToTokens(projectId);
  await writeProjectFile(projectId, '/src/index.css', buildIndexCss(presetId));
  return { name: getPreset(presetId).name, changed };
}

async function ensureThemeFoundation(projectId: string, files: { path: string; content: string }[]): Promise<void> {
  const has = (p: string) => files.some((f) => f.path === p);
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? '';
  // Only touch apps that use our UI kit — leave imported/foreign projects alone.
  if (!has('/src/components/ui/Button.tsx')) return;
  const want = (p: string) => THEME_FOUNDATION.find((f) => f.path === p)?.content ?? '';

  if (!has('/src/lib/theme.ts')) await writeProjectFile(projectId, '/src/lib/theme.ts', want('/src/lib/theme.ts'));
  if (!has('/src/components/ui/ThemeToggle.tsx')) await writeProjectFile(projectId, '/src/components/ui/ThemeToggle.tsx', want('/src/components/ui/ThemeToggle.tsx'));

  // Upgrade the old scaffold stylesheet (had --color-bg, no shadcn tokens) to the token system.
  const css = get('/src/index.css');
  if (!css || (css.includes('--color-bg') && !css.includes('--background'))) {
    await writeProjectFile(projectId, '/src/index.css', want('/src/index.css'));
  }
  const barrel = get('/src/components/ui/index.ts');
  if (barrel && !barrel.includes('./ThemeToggle')) {
    await writeProjectFile(projectId, '/src/components/ui/index.ts', barrel.trimEnd() + '\n' + UI_INDEX_THEMETOGGLE_EXPORT + '\n');
  }
}

/**
 * Retrofit an existing project onto the shadcn design-token theme system: write the canonical
 * token stylesheet, the theme hook, the <ThemeToggle/>, and the index.html that carries the
 * Tailwind token config + pre-paint script; ensure the ui barrel exports ThemeToggle. This sets
 * up the FOUNDATION deterministically — converting the app's hardcoded colors to tokens is then
 * done by a follow-up AI edit (the model knows the token rules from its system prompt). Returns
 * the conversion instruction the caller should send through sendEdit so dark mode works fully.
 */
export async function setupThemeFoundation(projectId: string): Promise<{ conversionInstruction: string }> {
  for (const f of THEME_FOUNDATION) {
    await writeProjectFile(projectId, f.path, f.content);
  }
  // Make <ThemeToggle/> importable from the ui barrel if one exists and doesn't already export it.
  const { data: barrel } = await supabase.from('project_files').select('content')
    .eq('project_id', projectId).eq('path', '/src/components/ui/index.ts').is('deleted_at', null).maybeSingle();
  if (barrel?.content && !barrel.content.includes('./ThemeToggle')) {
    await writeProjectFile(projectId, '/src/components/ui/index.ts', barrel.content.trimEnd() + '\n' + UI_INDEX_THEMETOGGLE_EXPORT + '\n');
  }
  return {
    conversionInstruction:
      'Convert this app to the shadcn design-token theme that was just set up. Replace EVERY hardcoded ' +
      'color across all pages and components with the semantic tokens: surfaces → bg-background / bg-card / ' +
      'bg-muted, primary text → text-foreground, secondary text → text-muted-foreground, all borders → ' +
      'border-border, the accent → bg-primary/text-primary-foreground, danger → bg-destructive. Remove ' +
      'bg-white, bg-gray-*/slate-*, text-black, text-gray-*/slate-*, and hex colors. Mount a <ThemeToggle/> ' +
      '(import from the ui kit) in the app\'s header/nav. Do NOT change layout, structure, or logic — only colors ' +
      'and the toggle. Apply it everywhere so light and dark are both complete (no white borders, readable text).',
  };
}

// Generation-time self-heal: ask the model to fix the static QA errors and apply the changes,
// reusing the proven edit-apply path (guardrail + upsert). Silent — it writes no chat messages,
// so a clean generation stays clean in the conversation. Best-effort: any failure is swallowed by
// the caller's try/catch around it. This is what makes "generated" mean "verified", not "hoped".
async function qaFixPass(projectId: string, issues: QAIssue[]): Promise<void> {
  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const appFiles = (files ?? []).filter((f) => !isMetaFile(f.path));
  const fixMsg = issuesToFixRequest(issues) +
    '\n\nRespond with §ACTION edit only — fix the root cause of each issue and change nothing else. Do not plan or ask.';
  const parser = makeStreamParser(() => {});
  const ai = resolveAI();
  let fixUsage: Usage = { inputTokens: 0, outputTokens: 0 };
  await streamComplete([
    { role: 'system', content: EDIT_SYSTEM_STREAM },
    { role: 'user', content: editPrompt(contextPayload(appFiles, fixMsg, ''), fixMsg) },
  ], 16000, (d) => parser.push(d), undefined, (u) => { fixUsage = u; });
  recordUsage({ provider: ai.provider, model: ai.model, inputTokens: fixUsage.inputTokens, outputTokens: fixUsage.outputTokens });
  const result = parser.end();
  if (result.action !== 'edit') return;
  const { safeChanges, safeDeletions } = applyEditGuardrail(appFiles, fixMsg, '', result.changes, result.deletions);
  for (const c of safeChanges) {
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: c.path, content: c.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of safeDeletions) {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', path);
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

      // INTEGRATION MANIFEST — read the blueprint's declared server-side integrations and the secret
      // keys they need. This drives edge-function generation and the secret-request popup (Phase 6).
      const integrations = Array.isArray((blueprint as { integrations?: unknown }).integrations)
        ? ((blueprint as { integrations?: unknown[] }).integrations as Record<string, unknown>[])
        : [];
      const requiredSecrets: { env: string; service: string; purpose: string; status: 'missing' }[] = [];
      for (const it of integrations) {
        const service = typeof it.service === 'string' ? it.service : '';
        const purpose = typeof it.purpose === 'string' ? it.purpose : '';
        const secrets = Array.isArray(it.secrets) ? it.secrets : [];
        for (const s of secrets) if (typeof s === 'string' && s.trim()) requiredSecrets.push({ env: s.trim(), service, purpose, status: 'missing' });
      }
      const secretEnvs = [...new Set(requiredSecrets.map((s) => s.env))];
      const manifestSecrets = secretEnvs.map((env) => requiredSecrets.find((s) => s.env === env)!);
      const secretServices = [...new Set(requiredSecrets.map((s) => s.service).filter(Boolean))];
      const hasIntegrations = integrations.length > 0;

      // Backend FIRST, so the file generator can wire the app to it. Additive & resilient:
      // a failure here never fails the whole generation — the app falls back to localStorage.
      await mark('schema', 'running');
      let backendFiles = 0;
      let hasBackend = false;
      let backendNote = 'no backend needed';
      try {
        const { tables } = await generateBackend(projectId, JSON.stringify(blueprint));
        if (tables) { backendFiles = 3; hasBackend = true; backendNote = `${tables} tables + RLS + auth`; }
      } catch (e) {
        backendNote = 'skipped (' + (e instanceof Error ? e.message : 'error') + ')';
      }
      await mark('schema', 'done', backendNote);

      // Integrations invoke edge functions through the Supabase client, so /src/lib/supabaseClient.ts
      // (and .env.example) must exist even when the app has no database tables of its own — otherwise
      // /src/lib/api.ts's import would not resolve.
      if (hasIntegrations && !hasBackend) {
        await writeProjectFile(projectId, '/src/lib/supabaseClient.ts', GENERATED_SUPABASE_CLIENT);
        await writeProjectFile(projectId, '/.env.example', GENERATED_ENV_EXAMPLE);
      }

      await mark('file_tree', 'running');
      // Seed the fixed Vite/TS scaffold first so the project can boot as its source streams in.
      for (const f of SCAFFOLD_FILES) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      // Compile the blueprint's FULL design bundle (mode, fonts, radius, borders, shadows) into
      // /src/index.css — flattening it to hue+font was the "every app looks the same" leak.
      // Falls back to the scaffold default if the blueprint declared no design.
      const designSpec = parseDesignSpec(blueprint.design);
      if (designSpec) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: '/src/index.css', content: buildIndexCssForDesign(designSpec), updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      // Stream the source files (§FILE protocol). hasBackend tells the model to route data through
      // /src/lib/db.ts against Supabase (with a localStorage fallback) instead of plain localStorage.
      const parser = makeStreamParser((e) => {
        if (e.type === 'file-start') void mark('file_tree', 'running', e.path.split('/').pop());
      });
      const genAi = resolveAI();
      let genUsage: Usage = { inputTokens: 0, outputTokens: 0 };
      await streamComplete([
        { role: 'system', content: GENERATE_FILES_STREAM },
        { role: 'user', content: filesPromptStream(JSON.stringify(blueprint), hasBackend, hasIntegrations) },
      ], 32000, (delta) => parser.push(delta), undefined, (u) => { genUsage = u; });
      // Never let a model-emitted file clobber the fixed scaffold or the generated backend files.
      const reserved = new Set([...SCAFFOLD_PATHS, '/src/lib/supabaseClient.ts', '/supabase/migrations/0001_init.sql', '/.env.example']);
      // The UI kit under /src/components/ui/ is authoritative (scaffold-provided). Drop ANY model
      // file there — a model-emitted ui/index.tsx alongside the scaffold's index.ts caused the
      // duplicate-component / visual-drift bug the audit flagged.
      const appFiles = parser.end().changes.filter(
        (f) => f.path && f.content.trim() && !reserved.has(f.path) && !f.path.startsWith('/src/components/ui/'),
      );
      if (!appFiles.length) throw new Error('The model produced no source files.');
      for (const f of appFiles) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      // Write the secret manifest so the studio can prompt the user for the keys (the secret popup)
      // and the deploy step knows what to push to Supabase Function Secrets. Deterministic — derived
      // from the blueprint, not the model's free-text output.
      if (hasIntegrations) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: '/supabase/.fableforge/secrets.json',
            content: JSON.stringify({ secrets: manifestSecrets, integrations }, null, 2) + '\n', updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      const total = SCAFFOLD_FILES.length + appFiles.length + backendFiles;
      await mark('file_tree', 'done', `${total} files`);
      for (const s of ['frontend', 'backend', 'auth_logic', 'styling'] as const) {
        await mark(s, 'done');
      }

      // VERIFY + FIX — the app just streamed in one pass; now make "generated" mean "works". Run the
      // checks and, if anything's wrong, hand off to the AGENTIC repair loop (reads the failing files,
      // researches if unsure, fixes the root cause, re-checks until clean). Falls back to the classic
      // regex-fix passes when the agent isn't available (non-Anthropic provider).
      await mark('validate', 'running');
      let qaErrors = (await runQA(projectId)).filter((i) => i.severity === 'error');
      // UNCONDITIONAL COMPILE GATE — run the real compiler on EVERY generation (booting it
      // headlessly when the preview isn't open), not only when static checks fail. This is what
      // makes "generated" mean "compiles", instead of "hopefully compiles".
      let tsErrors: number | null = null;
      if (!qaErrors.length) {
        try { tsErrors = await generationCompileGate(projectId); } catch { tsErrors = null; }
      }
      await mark('validate', 'done',
        qaErrors.length ? `${qaErrors.length} issue(s) found`
          : tsErrors ? `${tsErrors} type error(s) found`
          : tsErrors === 0 ? 'verified — compiles clean' : 'clean');
      if (qaErrors.length || tsErrors) {
        await mark('fix', 'running');
        try {
          if (agentAvailable()) {
            await agenticVerifyAndFix(projectId, { onActivity: (l) => void mark('fix', 'running', l) });
          } else {
            for (let attempt = 0; attempt < 2 && qaErrors.length; attempt++) {
              try { await qaFixPass(projectId, qaErrors); } catch { break; }
              qaErrors = (await runQA(projectId)).filter((i) => i.severity === 'error');
            }
          }
        } catch { /* best-effort — report whatever remains below */ }
        qaErrors = (await runQA(projectId)).filter((i) => i.severity === 'error');
        if (tsErrors && agentAvailable()) {
          // Recount after the agentic repair (the container is warm, so this is a quick tsc).
          try { tsErrors = await generationCompileGate(projectId); } catch { /* keep the last count */ }
        }
        const remaining = qaErrors.length + (tsErrors ?? 0);
        await mark('fix', 'done', remaining ? `${remaining} unresolved` : 'fixed');
      } else {
        await mark('fix', 'done');
      }
      const unresolved = qaErrors.length + (tsErrors ?? 0);

      await mark('summarize', 'running');
      const summaryId = await insertAiMessage({
        project_id: projectId, user_id: userId, generation_id: genId,
        role: 'assistant',
        content: `Generated ${total} files for ${blueprint.app_name}.` +
          (hasBackend
            ? ` It's full-stack: a Supabase backend (${backendNote}) lives at /supabase/migrations/0001_init.sql and the app talks to it through /src/lib/db.ts. Run that SQL in Supabase, then use "Supabase" in the header to connect — it runs on localStorage until you do.`
            : '') +
          ` Open the preview to try it, then keep iterating in chat.` +
          (secretEnvs.length ? `\n\n🔑 This build wires up ${secretServices.join(', ') || 'external services'} via server-side edge functions (/supabase/functions). It needs ${secretEnvs.length} API key(s) — ${secretEnvs.join(', ')} — added in Secrets to go live; until then those features show a "connect to enable" state.` : '') +
          (unresolved ? `\n\n⚠️ ${unresolved} issue(s) couldn't be auto-resolved — open the preview and use "Fix with AI" if something looks off.` : ''),
        files_changed: appFiles.map((f) => f.path),
        thread_id: MAIN_THREAD_ID,
      });
      // The file-generation stream is the big cost; attribute it to the summary message.
      // (The blueprint rawComplete call already recorded its own usage to the ledger.)
      recordUsage({ provider: genAi.provider, model: genAi.model, inputTokens: genUsage.inputTokens, outputTokens: genUsage.outputTokens, messageId: summaryId });
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

/**
 * CHUNKED CLOUD GENERATION — for users with NO browser API key. The edge generate-app worker has
 * a hard wall-clock (~400s) that kills big builds mid-stream (truncated files, missing pages).
 * Here the CLIENT orchestrates (no time ceiling) and the relay (agent-turn via cloudComplete)
 * only ever runs SHORT calls:
 *   blueprint → schema → SHELL (contracts: types/db/api + App.tsx + layout, one bounded call)
 *   → PAGES in parallel (each call compiles against the verbatim contracts)
 *   → manifest diff (every routed page must exist; one retry per missing) → static QA → summary.
 * Deep compile verify + agentic repair run AFTER via ProjectWorkspace's post-generation effect —
 * not duplicated here.
 */
async function chunkedCloudGenerate(projectId: string, prompt: string, planContext?: string): Promise<GenerateResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;

  const { data: gen } = await supabase
    .from('project_generations')
    .insert({ project_id: projectId, user_id: userId, prompt, kind: 'create', status: 'running' })
    .select().single();
  if (!gen) throw new Error('Could not start generation (could not create the generation record).');
  const genId = gen.id;

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
      const bpUserPrompt = planContext
        ? `${prompt}\n\nThe user reviewed and approved this plan — follow it:\n${planContext}`
        : prompt;
      const bpRaw = await rawComplete([
        { role: 'system', content: GENERATE_SYSTEM },
        { role: 'user', content: blueprintPrompt(bpUserPrompt) },
      ]);
      let usageIn = bpRaw.inputTokens, usageOut = bpRaw.outputTokens;
      const track = (r: RawResult): RawResult => { usageIn += r.inputTokens; usageOut += r.outputTokens; return r; };
      const blueprint = await parseJsonWithRepair<Record<string, unknown>>(bpRaw.text);
      await supabase.from('app_blueprints').insert({ project_id: projectId, ...blueprint });
      await supabase.from('projects').update({
        name: (blueprint.app_name as string) ?? 'Untitled app',
        description: (blueprint.description as string) ?? null,
        status: 'generating',
      }).eq('id', projectId);
      await mark('blueprint', 'done', (blueprint.app_name as string) ?? undefined);

      // INTEGRATION MANIFEST — same derivation as directGenerate (drives the secret popup + deploy).
      const integrations = Array.isArray((blueprint as { integrations?: unknown }).integrations)
        ? ((blueprint as { integrations?: unknown[] }).integrations as Record<string, unknown>[])
        : [];
      const requiredSecrets: { env: string; service: string; purpose: string; status: 'missing' }[] = [];
      for (const it of integrations) {
        const service = typeof it.service === 'string' ? it.service : '';
        const purpose = typeof it.purpose === 'string' ? it.purpose : '';
        const secrets = Array.isArray(it.secrets) ? it.secrets : [];
        for (const s of secrets) if (typeof s === 'string' && s.trim()) requiredSecrets.push({ env: s.trim(), service, purpose, status: 'missing' });
      }
      const secretEnvs = [...new Set(requiredSecrets.map((s) => s.env))];
      const manifestSecrets = secretEnvs.map((env) => requiredSecrets.find((s) => s.env === env)!);
      const secretServices = [...new Set(requiredSecrets.map((s) => s.service).filter(Boolean))];
      const hasIntegrations = integrations.length > 0;

      await mark('schema', 'running');
      let backendFiles = 0;
      let hasBackend = false;
      let backendNote = 'no backend needed';
      try {
        const { tables } = await generateBackend(projectId, JSON.stringify(blueprint));
        if (tables) { backendFiles = 3; hasBackend = true; backendNote = `${tables} tables + RLS + auth`; }
      } catch (e) {
        backendNote = 'skipped (' + (e instanceof Error ? e.message : 'error') + ')';
      }
      await mark('schema', 'done', backendNote);

      if (hasIntegrations && !hasBackend) {
        await writeProjectFile(projectId, '/src/lib/supabaseClient.ts', GENERATED_SUPABASE_CLIENT);
        await writeProjectFile(projectId, '/.env.example', GENERATED_ENV_EXAMPLE);
      }

      await mark('file_tree', 'running');
      for (const f of SCAFFOLD_FILES) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      const designSpec = parseDesignSpec(blueprint.design);
      if (designSpec) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: '/src/index.css', content: buildIndexCssForDesign(designSpec), updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }

      const reserved = new Set([...SCAFFOLD_PATHS, '/src/lib/supabaseClient.ts', '/supabase/migrations/0001_init.sql', '/.env.example']);
      const written = new Map<string, string>();
      const upsertFiles = async (changes: { path: string; content: string }[]) => {
        for (const f of changes) {
          if (!f.path || !f.content.trim() || reserved.has(f.path) || f.path.startsWith('/src/components/ui/')) continue;
          await supabase.from('project_files').upsert(
            { project_id: projectId, path: f.path, content: f.content, updated_by_ai: true },
            { onConflict: 'project_id,path' },
          );
          written.set(f.path, f.content);
        }
      };

      // 1) SHELL — contracts first: one bounded call that always fits the relay. Pages are
      // generated against these exact contracts next, so cross-file drift can't happen.
      await mark('file_tree', 'running', 'contracts + shell');
      const bpJson = JSON.stringify(blueprint);
      const shellRaw = track(await rawComplete([
        { role: 'system', content: GENERATE_FILES_STREAM },
        { role: 'user', content: filesPromptStream(bpJson, hasBackend, hasIntegrations) +
          '\n\nTHIS CALL — CONTRACTS + SHELL ONLY: emit /src/lib types + db.ts' +
          (hasIntegrations ? ' + api.ts' : '') +
          ', /src/App.tsx (ALL routes, pages lazy-loaded), shared layout components (shell/nav/footer)' +
          (hasIntegrations ? ', and the /supabase/functions/* edge functions' : '') +
          '. Do NOT emit /src/pages/* in this call — each page is generated next against these exact contracts, so App.tsx MAY route to pages not yet emitted (this call only). End with §END.' },
      ], 12000));
      await upsertFiles(parseProtocol(shellRaw.text).changes);
      const appTsx = written.get('/src/App.tsx') ?? '';
      if (!appTsx) throw new Error('The model produced no App.tsx in the shell pass.');

      // 2) PAGE LIST — App.tsx's own ./pages imports are the authoritative manifest.
      const pagePaths = new Set<string>();
      const addSpec = (spec: string) => {
        if (!spec.startsWith('./pages/')) return;
        let p = '/src/' + spec.slice(2);
        if (!/\.(t|j)sx?$/.test(p)) p += '.tsx';
        pagePaths.add(p);
      };
      for (const m of appTsx.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) addSpec(m[1]);
      for (const m of appTsx.matchAll(/(?:^|\n)\s*import[^'"\n]*from\s*['"]([^'"]+)['"]/g)) addSpec(m[1]);

      // 3) CONTRACTS CONTEXT — the verbatim shell every page call compiles against (capped).
      const contractsContext = [...written.entries()]
        .filter(([p]) => p.startsWith('/src/'))
        .map(([p, c]) => `--- ${p} ---\n${c}`)
        .join('\n\n').slice(0, 60000);

      // 4) PAGES — parallel, max 4 in flight; each is a short bounded call.
      const pageList = [...pagePaths].filter((p) => !written.has(p));
      await mark('file_tree', 'running', `${pageList.length} pages, 4 in parallel`);
      const genPage = async (pagePath: string): Promise<void> => {
        const r = track(await rawComplete([
          { role: 'system', content: GENERATE_FILES_STREAM },
          { role: 'user', content: filesPromptChunk(bpJson, pagePath, contractsContext, hasBackend, hasIntegrations) },
        ], 6000));
        const parsed = parseProtocol(r.text);
        if (!parsed.changes.some((c) => c.path === pagePath && c.content.trim())) {
          throw new Error(`page ${pagePath} was not emitted`);
        }
        await upsertFiles(parsed.changes);
        await mark('file_tree', 'running', pagePath.split('/').pop());
      };
      for (let i = 0; i < pageList.length; i += 4) {
        await Promise.all(pageList.slice(i, i + 4).map((p) => genPage(p).catch(() => undefined)));
      }
      // 5) MANIFEST DIFF — every routed page must exist; one serial retry per missing page.
      for (const p of pageList.filter((x) => !written.has(x))) {
        await mark('file_tree', 'running', `retrying ${p.split('/').pop()}`);
        await genPage(p).catch(() => undefined);
      }
      const stillMissing = pageList.filter((x) => !written.has(x));
      if (!written.size) throw new Error('The model produced no source files.');

      if (hasIntegrations) {
        await supabase.from('project_files').upsert(
          { project_id: projectId, path: '/supabase/.fableforge/secrets.json',
            content: JSON.stringify({ secrets: manifestSecrets, integrations }, null, 2) + '\n', updated_by_ai: true },
          { onConflict: 'project_id,path' },
        );
      }
      const total = SCAFFOLD_FILES.length + written.size + backendFiles;
      await mark('file_tree', 'done', `${total} files`);
      for (const s of ['frontend', 'backend', 'auth_logic', 'styling'] as const) {
        await mark(s, 'done');
      }

      // VALIDATE — static QA only here; the deep compile + agentic repair run right after this
      // generation finishes, via ProjectWorkspace's post-generation verify effect.
      await mark('validate', 'running');
      const qaErrors = (await runQA(projectId)).filter((i) => i.severity === 'error');
      await mark('validate', 'done', qaErrors.length ? `${qaErrors.length} issue(s) found` : 'clean');
      await mark('fix', 'done', qaErrors.length ? 'handing to the post-build repair' : undefined);
      const unresolved = qaErrors.length;

      await mark('summarize', 'running');
      const genAi = resolveAI();
      const summaryId = await insertAiMessage({
        project_id: projectId, user_id: userId, generation_id: genId,
        role: 'assistant',
        content: `Generated ${total} files for ${blueprint.app_name}.` +
          (hasBackend
            ? ` It's full-stack: a Supabase backend (${backendNote}) lives at /supabase/migrations/0001_init.sql and the app talks to it through /src/lib/db.ts. Run that SQL in Supabase, then use "Supabase" in the header to connect — it runs on localStorage until you do.`
            : '') +
          ` Open the preview to try it, then keep iterating in chat.` +
          (secretEnvs.length ? `\n\n🔑 This build wires up ${secretServices.join(', ') || 'external services'} via server-side edge functions (/supabase/functions). It needs ${secretEnvs.length} API key(s) — ${secretEnvs.join(', ')} — added in Secrets to go live; until then those features show a "connect to enable" state.` : '') +
          (stillMissing.length ? `\n\n⚠️ ${stillMissing.length} page(s) could not be generated (${stillMissing.map((p) => p.split('/').pop()).join(', ')}) — ask me in chat to add them.` : '') +
          (unresolved ? `\n\n⚠️ ${unresolved} issue(s) found — I'm verifying and repairing the build now.` : ''),
        files_changed: [...written.keys()],
        thread_id: MAIN_THREAD_ID,
      });
      recordUsage({ provider: genAi.provider, model: genAi.model, inputTokens: usageIn, outputTokens: usageOut, messageId: summaryId });
      await mark('summarize', 'done');

      await supabase.from('projects').update({ status: 'ready' }).eq('id', projectId);
      await supabase.from('project_generations').update({
        status: 'succeeded', finished_at: new Date().toISOString(),
        input_tokens: usageIn,
        output_tokens: usageOut,
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
  const assetsNs = (files ?? []).find((f) => f.path === ASSETS_PATH)?.content?.trim() ?? '';
  const prefsNs = (files ?? []).find((f) => f.path === PREFS_PATH)?.content ?? '';
  const appFilesNs = (files ?? []).filter((f) => !isMetaFile(f.path));
  const debugNs = previewError
    ? '\n\nThis is a bug fix. Diagnose the ROOT CAUSE (not just the symptom), state it in one line, then make the smallest change that addresses it.'
    : '';
  const raw = await rawComplete([
    { role: 'system', content: EDIT_SYSTEM },
    { role: 'user', content: brainContext(brainNs) + mapContext(mapNs) + roadmapContext(roadmapNs) + (assetsNs ? assetsNs + '\n\n' : '') + prefsContext(prefsNs) + editPrompt(contextPayload(appFilesNs, message, previewError ?? ''), message, previewError, historyText) + previewContext() + debugNs },
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

  // Safe-edit guardrail: drop edits to existing files the model couldn't see (see directEditStream).
  const { safeChanges, safeDeletions, blocked } = applyEditGuardrail(
    appFilesNs, message, previewError ?? '', parsed.changes ?? [], parsed.deletions ?? [],
  );
  for (const c of safeChanges) {
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: c.path, content: c.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of safeDeletions) {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', path);
  }
  const blockedNote = blocked.length
    ? `\n\n⚠️ Skipped ${blocked.length} change(s) to file(s) I couldn't see (${blocked.join(', ')}). Open them so I can edit them safely.`
    : '';
  const explanation = (parsed.explanation ?? 'Done.') + blockedNote;
  await supabase.from('ai_messages').insert({
    project_id: projectId, user_id: userId, role: 'assistant',
    content: explanation, files_changed: safeChanges.map((c) => c.path),
  });

  return {
    action: 'edit',
    explanation,
    changed: safeChanges.map((c) => c.path),
    deleted: safeDeletions,
    blocked,
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

// Convert a `data:image/...;base64,...` URL into an Anthropic image content block.
function imageBlockFromDataUrl(dataUrl: string): { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | null {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

/** Stream a completion, calling onDelta with each text chunk as it arrives. An optional
 * `image` (data URL) is attached to the last user message so vision models can see it. */
export async function streamComplete(
  messages: { role: string; content: string }[], maxTokens: number, onDelta: (t: string) => void,
  image?: string, onUsage?: (u: Usage) => void, signal?: AbortSignal,
): Promise<string> {
  const ai = resolveAI();
  const label = providerInfo(ai.provider).label;
  if (!ai.ready) {
    throw new Error(`No API key set for ${label}. Add one in the model picker (or switch provider).`);
  }
  let full = '';
  // Capture token usage as it streams; fall back to a length-based estimate if the provider
  // doesn't report it (some OpenAI-compatible endpoints omit usage on streamed responses).
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let sawUsage = false;
  const finishUsage = () => {
    // Estimate when the provider reported no usage (or reported zeros), so a cost is always
    // attributed — otherwise the message would show no cost tag at all.
    if (!sawUsage || (!usage.inputTokens && !usage.outputTokens)) {
      const inChars = messages.reduce((n, m) => n + m.content.length, 0);
      usage.inputTokens = Math.round(inChars / 4);
      usage.outputTokens = Math.round(full.length / 4);
    }
    onUsage?.(usage);
  };
  if (ai.provider === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    // Content may be a plain string or, when an image is attached, a content-block array.
    const rest: { role: string; content: unknown }[] = messages.filter((m) => m.role !== 'system');
    const block = image ? imageBlockFromDataUrl(image) : null;
    if (block) {
      for (let i = rest.length - 1; i >= 0; i--) {
        if (rest[i].role === 'user') {
          rest[i] = { role: 'user', content: [{ type: 'text', text: rest[i].content as string }, block] };
          break;
        }
      }
    }
    const res = await connectProvider('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: ai.model, max_tokens: maxTokens, system, messages: rest, stream: true }),
    }, label);
    if (!res.body) throw new Error(`${label} returned an empty response.`);
    await readSSE(res.body, (data) => {
      if (data === '[DONE]') return;
      let evt: { type?: string; delta?: { type?: string; text?: string }; message?: { usage?: { input_tokens?: number; output_tokens?: number } }; usage?: { output_tokens?: number } };
      try { evt = JSON.parse(data); } catch { return; }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
        full += evt.delta.text; onDelta(evt.delta.text);
      } else if (evt.type === 'message_start' && evt.message?.usage) {
        usage.inputTokens = evt.message.usage.input_tokens ?? 0; sawUsage = true;
      } else if (evt.type === 'message_delta' && evt.usage?.output_tokens != null) {
        usage.outputTokens = evt.usage.output_tokens; sawUsage = true; // cumulative
      }
    });
    finishUsage();
    return full;
  }
  // OpenAI-compatible providers (openai, xai/Grok, gemini, openrouter, local). For providers
  // that can't see images this way, the image is simply ignored (text still streams).
  // stream_options.include_usage asks for a final usage chunk (ignored by providers that
  // don't support it — we estimate in that case).
  const res = await connectProvider(`${ai.openAIBase}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.key || 'local'}` },
    body: JSON.stringify({ model: ai.model, max_tokens: maxTokens, messages, stream: true, stream_options: { include_usage: true } }),
  }, label);
  if (!res.body) throw new Error(`${label} returned an empty response.`);
  await readSSE(res.body, (data) => {
    if (data === '[DONE]') return;
    let evt: { choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    try { evt = JSON.parse(data); } catch { return; }
    const delta = evt.choices?.[0]?.delta?.content;
    if (delta) { full += delta; onDelta(delta); }
    if (evt.usage) {
      usage.inputTokens = evt.usage.prompt_tokens ?? 0;
      usage.outputTokens = evt.usage.completion_tokens ?? 0;
      sawUsage = true;
    }
  });
  finishUsage();
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

/**
 * Atomic change-set undo: restore every file a prior edit changed back to its pre-edit content.
 * Uses the project_file_versions snapshots the `snapshot_file_version` trigger already records, so no
 * schema change is needed. Files the edit CREATED (no prior snapshot) are soft-deleted. Note: this
 * cleanly undoes the MOST RECENT edit to each path; if a file was edited again afterward, revert
 * restores that later pre-edit state. Deletions performed by the edit are not reconstructed here.
 */
export async function revertChangeSet(projectId: string, paths: string[]): Promise<{ restored: string[]; removed: string[] }> {
  const restored: string[] = [];
  const removed: string[] = [];
  for (const path of paths) {
    const { data: versions } = await supabase
      .from('project_file_versions')
      .select('content, version')
      .eq('project_id', projectId).eq('path', path)
      .order('version', { ascending: false }).limit(1);
    const prior = versions?.[0] as { content: string } | undefined;
    if (prior) {
      await supabase.from('project_files').upsert(
        { project_id: projectId, path, content: prior.content, updated_by_ai: false },
        { onConflict: 'project_id,path' },
      );
      restored.push(path);
    } else {
      // No prior version → this file was created by the edit. Undo = remove it.
      await supabase.from('project_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('project_id', projectId).eq('path', path);
      removed.push(path);
    }
  }
  return { restored, removed };
}

/**
 * Write a PendingEdit the user approved in the diff modal: the same upsert/delete the normal apply
 * path does, just gated behind review. Inserts the (deferred) assistant message and returns the paths
 * actually changed so the caller can run post-edit checks.
 */
export async function applyPendingEdit(projectId: string, pending: PendingEdit, threadId: string = MAIN_THREAD_ID): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;
  for (const c of pending.changes) {
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: c.path, content: c.after, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of pending.deletions) {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', path);
  }
  const blockedNote = pending.blocked.length
    ? `\n\n⚠️ Skipped ${pending.blocked.length} change(s) to file(s) I couldn't see (${pending.blocked.join(', ')}).`
    : '';
  const changed = pending.changes.map((c) => c.path);
  await insertAiMessage({
    project_id: projectId, user_id: userId, role: 'assistant',
    content: pending.explanation + blockedNote, files_changed: changed, thread_id: threadId,
  });
  return changed;
}

async function directEditStream(
  projectId: string, message: string, previewError: string | undefined,
  onEvent?: (e: EditEvent) => void, planFirst?: boolean, image?: string, threadId: string = MAIN_THREAD_ID,
  reviewMode?: boolean, signal?: AbortSignal,
): Promise<EditResult> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;

  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  // Pull recent turns scoped to THIS thread so the model's context stays focused on this idea.
  // select('*') (not specific columns) so it works whether or not the thread_id column exists.
  const { data: history } = await supabase
    .from('ai_messages').select('*')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(120);
  const historyText = ((history ?? []) as AIMessageRow[])
    .filter((m) => threadOf(m.thread_id) === threadId)
    .slice(0, 8).reverse()
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${(m.content ?? '').slice(0, 600)}`)
    .join('\n');

  await insertAiMessage({ project_id: projectId, user_id: userId, role: 'user', content: message, thread_id: threadId });

  // Keep the theme foundation in place automatically, so the user never has to click "Theme".
  await ensureThemeFoundation(projectId, files ?? []);

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
  const assetsMd = (files ?? []).find((f) => f.path === ASSETS_PATH)?.content?.trim() ?? '';
  const prefs = (files ?? []).find((f) => f.path === PREFS_PATH)?.content ?? '';
  const appFiles = (files ?? []).filter((f) => !isMetaFile(f.path));
  const ai = resolveAI();
  let streamUsage: Usage = { inputTokens: 0, outputTokens: 0 };
  await streamComplete([
    { role: 'system', content: EDIT_SYSTEM_STREAM },
    { role: 'user', content: brainContext(brain) + mapContext(map) + roadmapContext(roadmap) + (assetsMd ? assetsMd + '\n\n' : '') + prefsContext(prefs) + editPrompt(contextPayload(appFiles, message, previewError ?? ''), message, previewError, historyText) + previewContext() + planDirective + debugDirective },
  ], 16000, (delta) => parser.push(delta), image, (u) => { streamUsage = u; }, signal);
  const result = parser.end();
  // Attribute this turn's token cost to the assistant message we're about to insert.
  const logCost = (messageId?: string) =>
    recordUsage({ provider: ai.provider, model: ai.model, inputTokens: streamUsage.inputTokens, outputTokens: streamUsage.outputTokens, messageId });

  if (result.action === 'ask' && result.question) {
    const id = await insertAiMessage({
      project_id: projectId, user_id: userId, role: 'assistant', content: result.question, thread_id: threadId,
    });
    logCost(id);
    onEvent?.({ type: 'done' });
    return { action: 'ask', explanation: '', question: result.question, options: result.options, changed: [], deleted: [] };
  }

  // Discuss: a conversational answer/opinion. Change NO files; record the answer as an
  // assistant message (it already streamed into the UI via explanation events).
  if (result.action === 'discuss') {
    const answer = result.explanation || 'Happy to help — what would you like to dig into?';
    const id = await insertAiMessage({
      project_id: projectId, user_id: userId, role: 'assistant', content: answer, thread_id: threadId,
    });
    logCost(id);
    onEvent?.({ type: 'done' });
    return { action: 'discuss', explanation: answer, changed: [], deleted: [] };
  }

  // Plan mode: the assistant proposed a plan. Change NO files; record the plan as an
  // assistant message (so it stays in the conversation context) and hand it to the UI
  // for approval. Approval comes back as a normal follow-up edit.
  if (result.action === 'plan' && (result.summary || result.steps.length)) {
    const plan = toEditPlan(result);
    const id = await insertAiMessage({
      project_id: projectId, user_id: userId, role: 'assistant', content: renderPlanText(plan), thread_id: threadId,
    });
    logCost(id);
    onEvent?.({ type: 'done' });
    return { action: 'plan', explanation: '', plan, changed: [], deleted: [] };
  }

  // Safe-edit guardrail BEFORE writing: drop edits to existing files the model couldn't see.
  const { safeChanges, safeDeletions, blocked } = applyEditGuardrail(
    appFiles, message, previewError ?? '', result.changes, result.deletions,
  );

  // Review-before-write: when on, do NOT write — return the change set for the user to diff + approve.
  // The assistant message is deferred to applyPendingEdit so a discarded edit leaves no "done" message.
  if (reviewMode && (safeChanges.length || safeDeletions.length)) {
    logCost();
    onEvent?.({ type: 'done' });
    const pending: PendingEdit = {
      changes: buildPendingFiles(appFiles, safeChanges),
      deletions: safeDeletions,
      explanation: result.explanation || 'Proposed changes — review below.',
      blocked,
    };
    return { action: 'review', explanation: pending.explanation, changed: [], deleted: [], blocked, pending };
  }

  // Apply atomically once the stream completes: progressive writes would flash transient
  // "module not found" states in the preview while imported files are still arriving.
  for (const c of safeChanges) {
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: c.path, content: c.content, updated_by_ai: true },
      { onConflict: 'project_id,path' },
    );
  }
  for (const path of safeDeletions) {
    await supabase.from('project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('path', path);
  }
  const blockedNote = blocked.length
    ? `\n\n⚠️ Skipped ${blocked.length} change(s) to file(s) I couldn't see in this large project (${blocked.join(', ')}). Open them or ask about them specifically so I can edit them safely.`
    : '';
  const explanation = (result.explanation || 'Done.') + blockedNote;
  const id = await insertAiMessage({
    project_id: projectId, user_id: userId, role: 'assistant',
    content: explanation, files_changed: safeChanges.map((c) => c.path), thread_id: threadId,
  });
  logCost(id);

  onEvent?.({ type: 'done' });
  return { action: 'edit', explanation, changed: safeChanges.map((c) => c.path), deleted: safeDeletions, blocked };
}
