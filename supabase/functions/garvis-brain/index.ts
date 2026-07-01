// supabase/functions/garvis-brain/index.ts
// The Garvis reasoning seam — the "brain" the runtime was built around (the GarvisModelClient
// that src/lib/garvis/runtime.ts calls every step). It carries NO state and NO DB access: the
// runtime owns the loop, the gate, checkpoints, and the budget cap; this function only DECIDES
// the next move given the current mode, task, history, and the (already mode-gated) tool list.
//
// Provider-agnostic by construction: it reasons via _shared/ai.ts `complete()`, so swapping the
// engine underneath (anthropic | openai | openrouter | local, via AI_PROVIDER / AI_MODEL) needs
// zero changes here. That is the "Garvis survives while models get replaced" promise, honored.
//
// Output contract: a single JSON object matching GarvisDecision —
//   { "kind": "tools",          "calls": [{ "name": "...", "input": { ... } }] }
//   { "kind": "finish",         "output": "...", "recommendation": "..." }
//   { "kind": "await_approval", "question": "...", "options": ["..."] }
// The runtime assigns tool-call ids and records cost; we just return the shape + costUsd.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, corsHeaders, parseJson, getProviderConfig, type AIMessage } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';

type Mode = 'observe' | 'plan' | 'act';

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface BrainRequest {
  mode: Mode;
  task: { title: string; input: string | null };
  history: { role: 'user' | 'assistant' | 'tool'; content: string }[];
  tools: ToolSpec[];
  context: { ownerId: string; appId: string | null };
}

type RawDecision =
  | { kind: 'tools'; calls: { name: string; input?: Record<string, unknown> }[] }
  | { kind: 'finish'; output: string; recommendation?: string }
  | { kind: 'await_approval'; question: string; options?: string[] };

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

function buildUserMessage(req: BrainRequest): string {
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

/** Coerce the model's JSON into a validated decision, gated to the tools we actually offered. */
function normalize(raw: RawDecision, allowed: Set<string>): RawDecision {
  if (raw?.kind === 'tools') {
    const calls = (raw.calls ?? []).filter((c) => c && allowed.has(c.name));
    if (!calls.length) {
      return { kind: 'finish', output: 'No valid tool call was produced for this mode.', };
    }
    return { kind: 'tools', calls: calls.map((c) => ({ name: c.name, input: c.input ?? {} })) };
  }
  if (raw?.kind === 'await_approval') {
    return { kind: 'await_approval', question: String(raw.question ?? 'Decision needed.'), options: raw.options };
  }
  // default to finish
  return {
    kind: 'finish',
    output: String((raw as { output?: string })?.output ?? 'Done.'),
    recommendation: (raw as { recommendation?: string })?.recommendation,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Authenticate the caller (the runtime forwards the user's bearer token).
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  // CREDIT GATE — each Garvis reasoning step is metered (a run makes several; each is checked).
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    await checkCredits(admin, user.id, 'garvis');
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402);
    throw e;
  }

  let body: BrainRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body?.mode || !body?.task?.title || !Array.isArray(body.tools)) {
    return json({ error: 'mode, task.title, and tools are required' }, 400);
  }

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUserMessage(body) },
  ];

  let result;
  try {
    result = await complete(messages, { maxTokens: 1500 });
  } catch (e) {
    return json({ error: `model error: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  // Charge the real cost of this reasoning step (both the parse-fail and normal paths below return it).
  const cfg = getProviderConfig();
  await spendCredits(admin, user.id, {
    costUsd: result.costUsd, kind: 'garvis', provider: cfg.provider, model: cfg.model,
    inputTokens: result.inputTokens, outputTokens: result.outputTokens,
  });

  let raw: RawDecision;
  try {
    raw = parseJson<RawDecision>(result.text);
  } catch {
    // The model didn't return parseable JSON — fail soft into a finish so the run doesn't hang.
    return json({
      kind: 'finish',
      output: result.text.slice(0, 2000) || 'The model returned no parseable decision.',
      costUsd: result.costUsd,
    });
  }

  const allowed = new Set(body.tools.map((t) => t.name));
  const decision = normalize(raw, allowed);
  return json({ ...decision, costUsd: result.costUsd });
});
