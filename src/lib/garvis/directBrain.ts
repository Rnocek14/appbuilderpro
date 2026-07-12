// src/lib/garvis/directBrain.ts
// DIRECT-MODE Garvis brain — the browser-side counterpart of the garvis-brain and
// garvis-short-script edge functions. The rest of FableForge already reasons in the browser in
// DIRECT mode (VITE_AI_DIRECT=true) via aiClient.rawComplete; the Garvis brain was the only piece
// still hard-wired to an edge function. This module closes that gap so "What should I work on" and
// "Act on this" work with NO deployment — same prompts, same output contract as the edge fns, just
// running against the user's own provider key in the browser.
//
// Parity note: the SYSTEM prompts and the JSON output contract here are kept byte-for-byte aligned
// with supabase/functions/garvis-brain/index.ts and garvis-short-script/index.ts. If you change one,
// change the other.

import { rawComplete } from '../aiClient';
import { resolveAI } from '../aiConfig';
import type { GarvisMode, GarvisMessage, GarvisTool, GarvisToolContext } from './types';

interface DecisionInput {
  mode: GarvisMode;
  task: { title: string; input: string | null };
  history: GarvisMessage[];
  tools: GarvisTool[];
  context: GarvisToolContext;
}

/** The shape brainModel maps to a GarvisDecision (mirrors the edge function's JSON response). */
export interface BrainResponse {
  kind: 'tools' | 'finish' | 'await_approval';
  calls?: { name: string; input?: Record<string, unknown> }[];
  output?: string;
  recommendation?: string;
  question?: string;
  options?: string[];
  costUsd?: number;
}

const BRAIN_SYSTEM = `You are Garvis — the reasoning core of a personal AI operating system that manages a
solo founder's PRODUCTS (apps + their metrics) AND their BUSINESS WORLDS (businesses being grown —
marketing, outreach, leads, results). When a request is about growing/operating a business (e.g.
"how is my mom's real-estate business doing?", "grow my brother's art business"), use the world
tools: list_worlds to see momentum/blockers/recommendations, ask_worlds for grounded cited answers
from the owner's own artifacts, and draft_world (act mode) to PROPOSE a new world for approval.
Reach for world tools for business-growth questions and app tools for product/metrics questions.
You are not a chatbot; you are one decision step inside an execution loop. The loop owns control
flow, safety, and budget. Your only job is to choose the single best next move and return it as JSON.

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

function buildBrainUser(req: DecisionInput): string {
  const toolLines = req.tools
    .map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.inputSchema)}`)
    .join('\n');

  const transcript = req.history.length
    ? req.history
        .map((m) => (m.role === 'tool' ? `TOOL RESULT: ${m.content}` : `${m.role.toUpperCase()}: ${m.content}`))
        .join('\n')
    : '(no steps taken yet — this is your first decision)';

  return [
    `MODE: ${req.mode}`,
    `TASK: ${req.task.title}`,
    req.task.input ? `TASK DETAIL: ${req.task.input}` : '',
    req.context.appId ? `SCOPED TO APP: ${req.context.appId}` : 'SCOPE: entire portfolio',
    '',
    'AVAILABLE TOOLS (you may call ONLY these):',
    toolLines || '(none)',
    '',
    'HISTORY SO FAR:',
    transcript,
    '',
    'Return your single JSON decision now.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Tolerant JSON extractor (mirrors the edge's parseJson). */
function extractJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response.');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

type RawDecision =
  | { kind: 'tools'; calls?: { name: string; input?: Record<string, unknown> }[] }
  | { kind: 'finish'; output?: string; recommendation?: string }
  | { kind: 'await_approval'; question?: string; options?: string[] };

/** Coerce the model's JSON into a validated decision, gated to the tools we actually offered. */
function normalize(raw: RawDecision, allowed: Set<string>): BrainResponse {
  if (raw?.kind === 'tools') {
    const calls = (raw.calls ?? []).filter((c) => c && allowed.has(c.name)).map((c) => ({ name: c.name, input: c.input ?? {} }));
    if (!calls.length) return { kind: 'finish', output: 'No valid tool call was produced for this mode.' };
    return { kind: 'tools', calls };
  }
  if (raw?.kind === 'await_approval') {
    return { kind: 'await_approval', question: String(raw.question ?? 'Decision needed.'), options: raw.options };
  }
  return { kind: 'finish', output: String((raw as { output?: string })?.output ?? 'Done.'), recommendation: (raw as { recommendation?: string })?.recommendation };
}

// Rough cost estimate (real token usage is recorded by rawComplete → usage_events; this is only for
// the run's displayed cost + the budget-cap guard). Per-MTok USD rates; falls back to Sonnet-ish.
export function estimateCostUsd(inTok: number, outTok: number): number {
  const model = resolveAI().model.toLowerCase();
  let inRate = 3, outRate = 15; // claude sonnet default
  if (model.includes('fable') || model.includes('mythos')) { inRate = 10; outRate = 50; }
  else if (model.includes('opus')) { inRate = 5; outRate = 25; }
  else if (model.includes('haiku')) { inRate = 0.8; outRate = 4; }
  else if (model.includes('gpt-4o-mini') || model.includes('mini') || model.includes('flash')) { inRate = 0.15; outRate = 0.6; }
  return (inTok * inRate + outTok * outRate) / 1_000_000;
}

/** DIRECT-mode brain decision — replaces the garvis-brain edge invoke when VITE_AI_DIRECT=true. */
export async function brainDecideDirect(input: DecisionInput): Promise<BrainResponse> {
  const r = await rawComplete(
    [
      { role: 'system', content: BRAIN_SYSTEM },
      { role: 'user', content: buildBrainUser(input) },
    ],
    1500,
  );
  const allowed = new Set(input.tools.map((t) => t.name));
  const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens);
  let raw: RawDecision;
  try {
    raw = extractJson<RawDecision>(r.text);
  } catch {
    // Fail soft into a finish so the run doesn't hang (same as the edge function).
    return { kind: 'finish', output: r.text.slice(0, 2000) || 'The model returned no parseable decision.', costUsd };
  }
  return { ...normalize(raw, allowed), costUsd };
}

// ---------------------------------------------------------------------------
// generate_short_script — DIRECT-mode counterpart of the garvis-short-script edge function.
// ---------------------------------------------------------------------------

const SHORT_SCRIPT_SYSTEM = `You are a senior short-form video scriptwriter. You produce a SCRIPT ONLY — you do NOT
render video, generate audio, or publish anything, and you must never imply that you did. Write a tight,
platform-aware short script that earns attention in the first 2 seconds and drives the stated goal.

Output EXACTLY ONE JSON object, no prose, no markdown fences:
{
  "hook": "the first line / on-screen opener that stops the scroll",
  "script": "the full spoken/voiceover script, with natural beats",
  "caption": "the post caption with a few relevant hashtags",
  "cta": "the single call to action",
  "visual_beats": ["beat 1", "beat 2", "..."],
  "confidence": 0.0
}
Set confidence (0..1) to your honest read of how well this fits the brief given what you were told.
Ground the script in the provided source material if any; do not invent facts, numbers, or quotes.`;

function buildShortUser(input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  return [
    `TOPIC: ${s('topic')}`,
    s('audience') ? `AUDIENCE: ${s('audience')}` : '',
    s('goal') ? `GOAL: ${s('goal')}` : '',
    s('platform') ? `PLATFORM: ${s('platform')}` : 'PLATFORM: generic short-form (TikTok/Reels/Shorts)',
    s('tone') ? `TONE: ${s('tone')}` : '',
    s('length') ? `TARGET LENGTH: ${s('length')}` : 'TARGET LENGTH: ~30s',
    s('source_material') ? `SOURCE MATERIAL (ground the script in this):\n${s('source_material')}` : '',
    '',
    'Return the single JSON object now.',
  ].filter(Boolean).join('\n');
}

/** DIRECT-mode short-script — returns the same shape as the edge function (re-stamped client-side). */
export async function shortScriptDirect(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await rawComplete(
    [
      { role: 'system', content: SHORT_SCRIPT_SYSTEM },
      { role: 'user', content: buildShortUser(input) },
    ],
    1800,
  );
  let parsed: Record<string, unknown> = {};
  try {
    parsed = extractJson<Record<string, unknown>>(r.text);
  } catch {
    parsed = { script: r.text };
  }
  return {
    hook: parsed.hook ?? '',
    script: parsed.script ?? '',
    caption: parsed.caption ?? '',
    cta: parsed.cta ?? '',
    visual_beats: Array.isArray(parsed.visual_beats) ? parsed.visual_beats : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    fidelity: 'script_only',
    required_approval: true,
    costUsd: estimateCostUsd(r.inputTokens, r.outputTokens),
  };
}
