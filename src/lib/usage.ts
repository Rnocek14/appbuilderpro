// src/lib/usage.ts
// Client-side AI spend tracker.
//
// In DIRECT mode the browser makes the model calls, so it's the only place that knows the
// token counts. We keep a local ledger (localStorage) of every call with an estimated cost,
// so the UI can show: (a) the cost of each assistant message, and (b) running spend per
// provider. This is per-browser and the dollar figures are ESTIMATES from the price table
// below — providers change prices and (when a provider doesn't return usage) we approximate
// token counts from text length. Treat it as a spend gauge, not an invoice.

import type { Provider } from './aiConfig';

// USD per 1,000,000 tokens. ESTIMATES — update as provider pricing changes. Unknown models
// fall back to DEFAULT_PRICE; local models are free.
const PRICING: Record<string, { in: number; out: number }> = {
  // Anthropic
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  // OpenAI
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  o3: { in: 2, out: 8 },
  'o4-mini': { in: 1.1, out: 4.4 },
  // xAI (Grok)
  'grok-4': { in: 3, out: 15 },
  'grok-3': { in: 3, out: 15 },
  'grok-3-mini': { in: 0.3, out: 0.5 },
  'grok-2-latest': { in: 2, out: 10 },
  'grok-2-vision-latest': { in: 2, out: 10 },
  // Google (Gemini)
  'gemini-2.5-pro': { in: 1.25, out: 10 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-1.5-pro': { in: 1.25, out: 5 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
};
const DEFAULT_PRICE = { in: 3, out: 15 };

function priceFor(provider: Provider, model: string): { in: number; out: number } {
  if (provider === 'local') return { in: 0, out: 0 };
  if (PRICING[model]) return PRICING[model];
  // OpenRouter ids look like "anthropic/claude-sonnet-4.5" — try the part after the slash.
  const tail = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : '';
  if (tail && PRICING[tail]) return PRICING[tail];
  return DEFAULT_PRICE;
}

/** Estimated USD cost of a single call. Cache-aware: with prompt caching, the API bills cached
 *  prefix reads at ~0.1× and cache writes at 1.25× the input rate — and `input_tokens` excludes
 *  both, so pricing input alone would misreport once caching is on. */
export function estimateCost(
  provider: Provider, model: string, inputTokens: number, outputTokens: number,
  cache?: { creation?: number; read?: number },
): number {
  const p = priceFor(provider, model);
  const cachedIn = (cache?.creation ?? 0) * 1.25 + (cache?.read ?? 0) * 0.1;
  return ((inputTokens + cachedIn) / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}

export interface UsageRecord {
  ts: number;
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreation?: number;
  cacheRead?: number;
  cost: number;
  /** The ai_messages row this call produced, when it maps to a chat message. */
  messageId?: string;
}

const STORAGE_KEY = 'fableforge.usage.v1';
const CHANGE_EVENT = 'fableforge:usage';
const MAX_RECORDS = 2000;

function readLedger(): UsageRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UsageRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLedger(records: UsageRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    /* storage unavailable — fail silent */
  }
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* no window */ }
}

/** Record a call and return its estimated cost. Skips no-op (0-token) calls. */
export function recordUsage(args: {
  provider: Provider; model: string; inputTokens: number; outputTokens: number;
  cacheCreation?: number; cacheRead?: number; messageId?: string;
}): number {
  const { provider, model, inputTokens, outputTokens, cacheCreation, cacheRead, messageId } = args;
  if (!inputTokens && !outputTokens && !cacheCreation && !cacheRead) return 0;
  const cost = estimateCost(provider, model, inputTokens, outputTokens, { creation: cacheCreation, read: cacheRead });
  const records = readLedger();
  records.push({ ts: Date.now(), provider, model, inputTokens, outputTokens, cacheCreation, cacheRead, cost, messageId });
  writeLedger(records);
  return cost;
}

export interface ProviderSpend { provider: Provider; cost: number; inputTokens: number; outputTokens: number; calls: number }
export interface SpendTotals { total: number; byProvider: ProviderSpend[] }

export function spendTotals(): SpendTotals {
  const records = readLedger();
  const map = new Map<Provider, ProviderSpend>();
  let total = 0;
  for (const r of records) {
    total += r.cost;
    const cur = map.get(r.provider) ?? { provider: r.provider, cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
    cur.cost += r.cost;
    cur.inputTokens += r.inputTokens;
    cur.outputTokens += r.outputTokens;
    cur.calls += 1;
    map.set(r.provider, cur);
  }
  return { total, byProvider: [...map.values()].sort((a, b) => b.cost - a.cost) };
}

export function spendForProvider(provider: Provider): number {
  return readLedger().filter((r) => r.provider === provider).reduce((s, r) => s + r.cost, 0);
}

/** Estimated cost attributed to a specific assistant message (sum of its calls). */
export function costForMessage(messageId: string): number | undefined {
  const matches = readLedger().filter((r) => r.messageId === messageId);
  if (!matches.length) return undefined;
  return matches.reduce((s, r) => s + r.cost, 0);
}

/**
 * Attribute every not-yet-attributed ledger record since `sinceTs` to a message — used by flows
 * that make MANY model calls before the assistant message exists (the agent loop, the chunked
 * generation pipeline). Recording per call keeps totals accurate; tagging afterwards is what makes
 * the per-message cost chip show the turn's REAL total instead of nothing (or a double count).
 * Returns the total cost tagged. (If an unrelated call lands in the window it gets folded in —
 * acceptable for a spend gauge.)
 */
export function tagUsageSince(messageId: string, sinceTs: number): number {
  const records = readLedger();
  let tagged = 0;
  for (const r of records) {
    if (r.ts >= sinceTs && !r.messageId) { r.messageId = messageId; tagged += r.cost; }
  }
  if (tagged > 0) writeLedger(records);
  return tagged;
}

export function clearUsage(): void {
  writeLedger([]);
}

export function subscribeUsage(cb: () => void): () => void {
  const onChange = () => cb();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Compact USD formatting for tiny per-message amounts. */
export function formatUSD(n: number): string {
  if (n <= 0) return '$0';
  if (n < 0.001) return '<$0.001';
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
