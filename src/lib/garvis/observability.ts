// src/lib/garvis/observability.ts
// Pure rollup helpers for Mission Control — the "what is Garvis doing, why, what did it find, what did
// it spend" view. NO new table: this is aggregation over data Garvis already records (agent_runs,
// missions, tasks, opportunities, goals). Kept pure so the date-window math + ranking are unit-testable.

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when an ISO timestamp falls within the last `days` (inclusive). */
export function withinDays(iso: string | null | undefined, days: number, nowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= days * DAY_MS && t <= nowMs;
}

/** Sum cost_usd across rows; pass days=null for all-time, or a window in days. */
export function sumCostWithin(rows: { cost_usd?: number | string | null; created_at?: string }[], days: number | null, nowMs: number): number {
  return rows.reduce((s, r) => {
    if (days !== null && !withinDays(r.created_at, days, nowMs)) return s;
    return s + Number(r.cost_usd ?? 0);
  }, 0);
}

/** Count rows whose `field` timestamp is within the window. */
export function countWithin(rows: Record<string, unknown>[], days: number, nowMs: number, field = 'created_at'): number {
  return rows.reduce((n, r) => (withinDays(r[field] as string | undefined, days, nowMs) ? n + 1 : n), 0);
}

/** The highest-confidence item (null confidence treated as lowest). Returns null for an empty list. */
export function topByConfidence<T extends { confidence: number | null }>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, x) => ((x.confidence ?? -1) > (best.confidence ?? -1) ? x : best));
}

export interface FeedItem {
  id: string;
  ts: string;
  kind: 'mission' | 'opportunity' | 'recommend' | 'analyze' | 'content' | 'outcome';
  title: string;
  detail?: string;
  tone: 'ok' | 'ember' | 'warn' | 'dim';
}

/** Merge feed items newest-first and cap the list. */
export function sortFeed(items: FeedItem[], cap = 20): FeedItem[] {
  return [...items].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, cap);
}
