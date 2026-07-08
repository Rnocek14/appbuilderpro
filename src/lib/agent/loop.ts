// src/lib/agent/loop.ts
// The client-side agentic loop: call the model with tools → execute the tool calls it makes → feed the
// results back → repeat, until it stops calling tools (task done) or a bound is hit. Tool EXECUTION is
// always client-side (read_file/write_file/run_typecheck need the browser's project files + WebContainer);
// the MODEL CALL goes either directly to Anthropic (DIRECT mode, user's key) or through the agent-turn
// edge proxy (production/edge mode, so the key stays server-side). Anthropic runs web_search itself and
// folds its results into the same response, so the agent gets research + local tools in one loop.

import { supabase, supabaseUrl, supabaseAnonKey } from '../supabase';
import { resolveAI } from '../aiConfig';
import { AGENT_TOOLS, executeAgentTool, type AgentToolContext } from './tools';

/** One block of Anthropic message content (text / tool_use / server tool blocks). */
interface Block { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }
interface ModelResponse { content: Block[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }; error?: unknown }

export interface AgentEvent {
  /** The model's latest visible reasoning/summary text (replace-in-place, like a stream). */
  text?: string;
  /** A short "doing X" activity label (Reading db.ts, Type-checking, Searching the web…). */
  activity?: string;
}

export interface AgentRunResult {
  text: string;
  changed: string[];
  deleted: string[];
  usage: { inputTokens: number; outputTokens: number; cacheCreation: number; cacheRead: number };
  steps: number;
  /** True if the last run_typecheck came back clean; null if the agent never ran it. */
  verified: boolean | null;
}

const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 6 };

/** Is the agentic path usable right now? (Anthropic model, and a key in direct mode.) */
export function agentAvailable(): boolean {
  const ai = resolveAI();
  if (ai.provider !== 'anthropic') return false;   // tool-use loop is Anthropic-only for now
  if (ai.direct) return !!ai.key;                    // direct mode needs the browser key
  return true;                                       // edge mode: the agent-turn proxy holds the key
}

/** Make one model call with tools — direct to Anthropic or via the edge proxy. */
async function callModel(
  system: string, messages: { role: string; content: unknown }[], tools: unknown[], maxTokens: number,
  signal?: AbortSignal,
): Promise<ModelResponse> {
  const ai = resolveAI();
  if (ai.direct && ai.provider === 'anthropic' && ai.key) {
    // Fable/Mythos: opt into server-side fallbacks (safety-classifier declines re-served by Opus 4.8).
    const fableFallback = /^claude-(fable|mythos)/.test(ai.model);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(fableFallback ? { 'anthropic-beta': 'server-side-fallback-2026-06-01' } : {}),
      },
      // PROMPT CACHING — the agent loop is the token hog: every step re-sends the whole growing
      // conversation. Caching the system block + the conversation prefix (top-level auto-cache
      // marks the last block) turns each step's re-read into ~0.1× input price. This was the
      // single biggest cause of expensive builds on premium models.
      body: JSON.stringify({
        model: ai.model, max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools, messages,
        cache_control: { type: 'ephemeral' },
        ...(fableFallback ? { fallbacks: [{ model: 'claude-opus-4-8' }] } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    return (await res.json()) as ModelResponse;
  }
  // Edge proxy — keeps the key server-side, mirrors the model call including tools + web_search.
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/agent-turn`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
    },
    body: JSON.stringify({ system, messages, tools, maxTokens }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string })?.error ?? `agent-turn failed (${res.status})`);
  }
  return (await res.json()) as ModelResponse;
}

/**
 * Run the agent to completion. `userContent` is the first user turn (string, or Anthropic content
 * blocks when an image is attached). The loop appends each assistant turn + the tool_results and
 * re-calls until the model stops requesting tools or a bound (steps/tokens) is reached.
 */
export async function runAgent(opts: {
  system: string;
  userContent: string | unknown[];
  ctx: AgentToolContext;
  maxSteps?: number;
  maxTokens?: number;
  webSearch?: boolean;
  signal?: AbortSignal;
  onEvent?: (e: AgentEvent) => void;
}): Promise<AgentRunResult> {
  const maxSteps = opts.maxSteps ?? 16;
  const maxTokens = opts.maxTokens ?? 12000;
  const tools: unknown[] = [...AGENT_TOOLS];
  if (opts.webSearch !== false) tools.push(WEB_SEARCH_TOOL);

  const messages: { role: string; content: unknown }[] = [{ role: 'user', content: opts.userContent }];
  const usage = { inputTokens: 0, outputTokens: 0, cacheCreation: 0, cacheRead: 0 };
  let finalText = '';
  let verified: boolean | null = null;
  let steps = 0;

  for (; steps < maxSteps; steps++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const resp = await callModel(opts.system, messages, tools, maxTokens, opts.signal);
    usage.inputTokens += resp.usage?.input_tokens ?? 0;
    usage.outputTokens += resp.usage?.output_tokens ?? 0;
    usage.cacheCreation += resp.usage?.cache_creation_input_tokens ?? 0;
    usage.cacheRead += resp.usage?.cache_read_input_tokens ?? 0;

    const blocks = Array.isArray(resp.content) ? resp.content : [];
    const textPieces = blocks.filter((b) => b.type === 'text' && b.text).map((b) => b.text as string);
    if (textPieces.length) { finalText = textPieces.join('\n'); opts.onEvent?.({ text: finalText }); }

    // Append the assistant turn verbatim so tool_use blocks stay correlated with our tool_results.
    messages.push({ role: 'assistant', content: blocks });

    const toolUses = blocks.filter((b) => b.type === 'tool_use');

    // TRUNCATION GUARD: a turn cut at the token limit mid-tool-call carries INCOMPLETE input —
    // executing it writes half a file (unclosed JSX, unbalanced braces). Never execute; tell the
    // model and let it redo the action in smaller pieces.
    if (resp.stop_reason === 'max_tokens' && toolUses.length) {
      messages.push({
        role: 'user',
        content: toolUses.map((tu) => ({
          type: 'tool_result', tool_use_id: tu.id, is_error: true,
          content: 'Your message hit the output-token limit — this tool call arrived TRUNCATED and was NOT executed. Re-issue it in smaller pieces: ONE file per message, and split very large files into smaller components first.',
        })),
      });
      continue;
    }
    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) break; // task complete

    const results: unknown[] = [];
    for (const tu of toolUses) {
      let output: string;
      try {
        output = await executeAgentTool(tu.name ?? '', tu.input ?? {}, opts.ctx);
      } catch (e) {
        output = `Error running ${tu.name}: ${e instanceof Error ? e.message : String(e)}`;
      }
      if (tu.name === 'run_typecheck') verified = /(^|\s)(clean|no (type )?errors|0 error)/i.test(output);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: output });
    }
    messages.push({ role: 'user', content: results });
  }

  return {
    text: finalText,
    changed: [...opts.ctx.changed],
    deleted: [...opts.ctx.deleted],
    usage,
    steps,
    verified,
  };
}
