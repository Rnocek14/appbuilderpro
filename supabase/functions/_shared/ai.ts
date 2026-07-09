// supabase/functions/_shared/ai.ts
// Provider-agnostic chat completion for Deno edge functions.
// Supports: anthropic | openai | openrouter | local (any OpenAI-compatible endpoint)

export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'local';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// $ per 1M tokens — adjust in one place
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

export function estimateCost(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model] ?? { in: 3, out: 15 };
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}

export function getProviderConfig() {
  const provider = (Deno.env.get('AI_PROVIDER') ?? 'anthropic') as AIProvider;
  const model = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-4-6';
  return { provider, model };
}

// Free tier runs the cheapest capable model (~4× cheaper), so the free credit grant stretches and
// free-user exposure stays low; paid tiers get the operator's configured model. This is what makes
// the free tier both generous-feeling and cheap. Override the free model via AI_FREE_MODEL.
export function modelForPlan(plan: string | null | undefined): { provider: AIProvider; model: string } {
  const cfg = getProviderConfig();
  if (plan === 'pro' || plan === 'starter') return cfg;
  const cheapest: Record<AIProvider, string> = {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    openrouter: 'anthropic/claude-3.5-haiku',
    local: cfg.model,
  };
  return { provider: cfg.provider, model: Deno.env.get('AI_FREE_MODEL') ?? cheapest[cfg.provider] ?? cfg.model };
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      // don't retry auth/validation failures
      if (msg.includes('401') || msg.includes('400')) throw err;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw lastErr;
}

export async function complete(
  messages: AIMessage[],
  opts: { provider?: AIProvider; model?: string; maxTokens?: number } = {},
): Promise<AIResult> {
  const cfg = getProviderConfig();
  const provider = opts.provider ?? cfg.provider;
  const model = opts.model ?? cfg.model;
  const maxTokens = opts.maxTokens ?? 8192;

  return withRetry(async () => {
    if (provider === 'anthropic') {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const rest = messages.filter((m) => m.role !== 'system');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: rest }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = (data.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('\n');
      const inTok = data.usage?.input_tokens ?? 0;
      const outTok = data.usage?.output_tokens ?? 0;
      return { text, inputTokens: inTok, outputTokens: outTok, costUsd: estimateCost(model, inTok, outTok) };
    }

    // OpenAI-compatible providers
    const base =
      provider === 'openai' ? 'https://api.openai.com/v1'
      : provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
      : (Deno.env.get('LOCAL_AI_BASE_URL') ?? 'http://localhost:11434/v1');
    const key =
      provider === 'openai' ? Deno.env.get('OPENAI_API_KEY')
      : provider === 'openrouter' ? Deno.env.get('OPENROUTER_API_KEY')
      : 'local';

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });
    if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const inTok = data.usage?.prompt_tokens ?? 0;
    const outTok = data.usage?.completion_tokens ?? 0;
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: estimateCost(model, inTok, outTok),
    };
  });
}

export interface VisionImage { mediaType: string; base64: string }

/**
 * Vision completion: one user turn of text + images (base64). The single seam every edge
 * function inherits for seeing pixels — Anthropic content blocks or OpenAI-compatible
 * image_url data URIs. Same retry/pricing discipline as complete().
 */
export async function completeVision(
  system: string,
  userText: string,
  images: VisionImage[],
  opts: { provider?: AIProvider; model?: string; maxTokens?: number } = {},
): Promise<AIResult> {
  const cfg = getProviderConfig();
  const provider = opts.provider ?? cfg.provider;
  const model = opts.model ?? cfg.model;
  const maxTokens = opts.maxTokens ?? 1024;

  return withRetry(async () => {
    if (provider === 'anthropic') {
      const content = [
        ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.base64 } })),
        { type: 'text', text: userText },
      ];
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = (data.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('\n');
      const inTok = data.usage?.input_tokens ?? 0;
      const outTok = data.usage?.output_tokens ?? 0;
      return { text, inputTokens: inTok, outputTokens: outTok, costUsd: estimateCost(model, inTok, outTok) };
    }

    // OpenAI-compatible providers (openai / openrouter / local)
    const base =
      provider === 'openai' ? 'https://api.openai.com/v1'
      : provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
      : (Deno.env.get('LOCAL_AI_BASE_URL') ?? 'http://localhost:11434/v1');
    const key =
      provider === 'openai' ? Deno.env.get('OPENAI_API_KEY')
      : provider === 'openrouter' ? Deno.env.get('OPENROUTER_API_KEY')
      : 'local';
    const content = [
      { type: 'text', text: userText },
      ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mediaType};base64,${im.base64}` } })),
    ];
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    });
    if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const inTok = data.usage?.prompt_tokens ?? 0;
    const outTok = data.usage?.completion_tokens ?? 0;
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: estimateCost(model, inTok, outTok),
    };
  });
}

/**
 * Streaming completion. Forwards each text delta to onDelta as it arrives and
 * returns the full text + token usage once the stream ends. Single attempt — the
 * caller surfaces failures over the SSE channel rather than silently retrying.
 */
export async function completeStream(
  messages: AIMessage[],
  opts: { provider?: AIProvider; model?: string; maxTokens?: number },
  onDelta: (text: string) => void,
): Promise<AIResult> {
  const cfg = getProviderConfig();
  const provider = opts.provider ?? cfg.provider;
  const model = opts.model ?? cfg.model;
  const maxTokens = opts.maxTokens ?? 8192;

  const readSSE = async (body: ReadableStream<Uint8Array>, onData: (data: string) => void) => {
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
  };

  let full = '';
  let inTok = 0;
  let outTok = 0;

  if (provider === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: rest, stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`anthropic ${res.status}: ${await res.text().catch(() => '')}`);
    await readSSE(res.body, (data) => {
      if (data === '[DONE]') return;
      let evt: { type?: string; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number }; delta?: { type?: string; text?: string } };
      try { evt = JSON.parse(data); } catch { return; }
      if (evt.type === 'message_start') inTok = evt.message?.usage?.input_tokens ?? 0;
      else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
        full += evt.delta.text; onDelta(evt.delta.text);
      } else if (evt.type === 'message_delta') outTok = evt.usage?.output_tokens ?? outTok;
    });
    return { text: full, inputTokens: inTok, outputTokens: outTok, costUsd: estimateCost(model, inTok, outTok) };
  }

  // OpenAI-compatible providers
  const base =
    provider === 'openai' ? 'https://api.openai.com/v1'
    : provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
    : (Deno.env.get('LOCAL_AI_BASE_URL') ?? 'http://localhost:11434/v1');
  const key =
    provider === 'openai' ? Deno.env.get('OPENAI_API_KEY')
    : provider === 'openrouter' ? Deno.env.get('OPENROUTER_API_KEY')
    : 'local';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages, stream: true, stream_options: { include_usage: true } }),
  });
  if (!res.ok || !res.body) throw new Error(`${provider} ${res.status}: ${await res.text().catch(() => '')}`);
  await readSSE(res.body, (data) => {
    if (data === '[DONE]') return;
    let evt: { choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    try { evt = JSON.parse(data); } catch { return; }
    const delta = evt.choices?.[0]?.delta?.content;
    if (delta) { full += delta; onDelta(delta); }
    if (evt.usage) { inTok = evt.usage.prompt_tokens ?? inTok; outTok = evt.usage.completion_tokens ?? outTok; }
  });
  return { text: full, inputTokens: inTok, outputTokens: outTok, costUsd: estimateCost(model, inTok, outTok) };
}

export interface AIResearchResult extends AIResult {
  sources: string[];
}

/**
 * Anthropic-only: a completion with the built-in web_search tool enabled. Anthropic runs the
 * searches server-side and returns synthesized text + citations. Used by the research function.
 */
export async function completeWithWebSearch(
  messages: AIMessage[],
  opts: { model?: string; maxTokens?: number; maxUses?: number } = {},
): Promise<AIResearchResult> {
  const model = opts.model ?? getProviderConfig().model;
  const maxTokens = opts.maxTokens ?? 8000;
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const rest = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: rest,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxUses ?? 10 }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const blocks = (data.content ?? []) as Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string }> }>;
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const sources = new Set<string>();
  for (const b of blocks) for (const c of b.citations ?? []) if (c.url) sources.add(`${c.title ?? c.url} — ${c.url}`);
  const inTok = data.usage?.input_tokens ?? 0;
  const outTok = data.usage?.output_tokens ?? 0;
  return { text, sources: [...sources], inputTokens: inTok, outputTokens: outTok, costUsd: estimateCost(model, inTok, outTok) };
}

/** Strip markdown fences and parse JSON safely. */
export function parseJson<T>(raw: string): T {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
