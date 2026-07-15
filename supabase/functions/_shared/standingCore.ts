// supabase/functions/_shared/standingCore.ts
// STANDING ORDERS — pure core. ONE implementation (the adsWatchCore pattern): verified by
// src/lib/garvis/standing.verify.ts, executed in the standing-worker edge function, and re-exported
// to the client through src/lib/garvis/standing.ts. No imports, no Supabase, no DOM, no clock.
//
// The missing capability the classification stress test ranked #1: nothing in Garvis had a sense of
// time. A standing order is a small, honest promise — "check this page and tell me when it changes",
// "produce this digest every week" — that a worker executes on a schedule. This module owns the
// SCHEDULING MATH (deterministic next-run, no Date.now() — the caller supplies now), the WATCH
// DECISION (did the page really change?), and the HONESTY RULES for what a run may claim:
//
//   - A failed fetch is reported as UNREACHABLE — never as "no change". Claiming a check that didn't
//     happen is the watcher equivalent of an invented number.
//   - "Changed" requires a real content difference after normalization (markup noise, whitespace,
//     and volatile counters don't count) — and the record carries an excerpt of what changed.
//   - Anything a standing order PRODUCES lands as a draft/record for the human — orders never send,
//     post, or spend on their own. The clock schedules work; the human still owns the trigger out.

// 'client_hunt' is a DAILY AUTOMATIC prospecting order (see src/lib/garvis/clientHuntSchedule.ts):
// every day it sweeps a fresh slice of the country for a niche, builds demos, and queues pitches for
// the owner's approval. Its config is the HuntConfig (niche/scope/citiesPerDay/demoQuota) + a rolling
// cursor; the worker's client_hunt branch owns it. Like every order, it only READS + queues — the
// clock schedules the work; the human still owns the trigger out.
export type OrderKind = 'watch_url' | 'cadence_digest' | 'client_hunt';
export type Cadence = 'hourly' | 'daily' | 'weekly';
export type WatchStatus = 'changed' | 'unchanged' | 'unreachable';

export interface StandingOrder {
  id: string;
  kind: OrderKind;
  label: string;                 // the promise in the owner's words ("watch Acme's pricing page")
  cadence: Cadence;
  // watch_url uses {url}; cadence_digest uses {note}; client_hunt stores its HuntConfig + cursor here.
  config: { url?: string; note?: string; [k: string]: unknown };
  status: 'active' | 'paused';
  nextRunAt: string;             // ISO
  lastRunAt: string | null;      // ISO
  lastResult: WatchResult | null;
}

export interface WatchResult {
  status: WatchStatus;
  line: string;                  // the honest one-line record of what this run actually did
  hash: string | null;           // content hash after a successful fetch (null when unreachable)
  excerpt: string | null;        // what changed, when it changed
  checkedAt: string;             // ISO — supplied by the caller, never invented here
}

// ---------------------------------------------------------------------------
// Scheduling math — deterministic; the caller supplies `now`
// ---------------------------------------------------------------------------

const STEP_MS: Record<Cadence, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** The next run strictly after `nowIso`, stepping from `anchorIso` (creation or last scheduled time)
 *  so a delayed worker doesn't drift the schedule: a daily order anchored at 09:00 stays at 09:00
 *  even if one run fired late. Pure — same inputs, same output. */
export function nextRunAfter(cadence: Cadence, anchorIso: string, nowIso: string): string {
  const anchor = Date.parse(anchorIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(anchor) || !Number.isFinite(now)) throw new Error('nextRunAfter: bad timestamp');
  const step = STEP_MS[cadence];
  if (now < anchor) return new Date(anchor).toISOString();
  const stepsPast = Math.floor((now - anchor) / step) + 1;
  return new Date(anchor + stepsPast * step).toISOString();
}

/** Is this order due? Pure comparison — the worker's only scheduling question. */
export function isDue(order: Pick<StandingOrder, 'status' | 'nextRunAt'>, nowIso: string): boolean {
  return order.status === 'active' && Date.parse(order.nextRunAt) <= Date.parse(nowIso);
}

// ---------------------------------------------------------------------------
// Watch normalization + hashing — what counts as "the content"
// ---------------------------------------------------------------------------

/** Strip a fetched page down to the content a human would consider "the page": drop scripts/styles/
 *  tags, collapse whitespace. Volatile attributes (nonces, cache-busters) live in markup, so they
 *  vanish here — a page hasn't "changed" because its build hash rotated. */
export function normalizeContent(raw: string): string {
  return (raw ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** djb2 over the normalized content — the cheap, deterministic identity of "what the page said". */
export function contentHash(normalized: string): string {
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The first region where two normalized texts diverge, trimmed of their common prefix/suffix —
 *  a human-readable "what changed" excerpt, not a full diff. */
export function changeExcerpt(prev: string, next: string, max = 220): string {
  let start = 0;
  const minLen = Math.min(prev.length, next.length);
  while (start < minLen && prev[start] === next[start]) start++;
  let endPrev = prev.length, endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) { endPrev--; endNext--; }
  // A REPLACEMENT expands to word boundaries so "$49 → $59" reads as the whole token, not "4 → 5".
  // (Pure additions/removals keep the tight boundary — expanding would misreport them as edits.)
  if (endPrev > start && endNext > start) {
    while (start > 0 && !/\s/.test(prev[start - 1])) start--;
    while (endPrev < prev.length && !/\s/.test(prev[endPrev])) endPrev++;
    while (endNext < next.length && !/\s/.test(next[endNext])) endNext++;
  }
  const removed = prev.slice(start, endPrev).trim();
  const added = next.slice(start, endNext).trim();
  const clip = (s: string) => (s.length > max ? `${s.slice(0, max)}…` : s);
  if (added && removed) return `now: “${clip(added)}” (was: “${clip(removed)}”)`;
  if (added) return `added: “${clip(added)}”`;
  if (removed) return `removed: “${clip(removed)}”`;
  return 'content changed';
}

// ---------------------------------------------------------------------------
// The watch decision — the honesty gate for a run
// ---------------------------------------------------------------------------

/**
 * Decide what one watch run may claim. The rules that matter:
 *  - fetch failed → UNREACHABLE, hash stays null, and the line says the check did NOT happen.
 *  - first successful check → 'unchanged' baseline (there is nothing to compare against; claiming
 *    "changed" on first sight would be theater).
 *  - hash differs → CHANGED with a real excerpt of what moved.
 */
export function decideWatch(input: {
  label: string;
  prevHash: string | null;
  prevText: string | null;
  fetched: { ok: boolean; text?: string; error?: string };
  nowIso: string;
}): WatchResult {
  const { label, prevHash, prevText, fetched, nowIso } = input;
  if (!fetched.ok) {
    return {
      status: 'unreachable', hash: prevHash, excerpt: null, checkedAt: nowIso,
      line: `Couldn’t reach ${label} — ${fetched.error?.slice(0, 120) || 'fetch failed'}. Nothing was checked; will retry on schedule.`,
    };
  }
  const normalized = normalizeContent(fetched.text ?? '');
  const hash = contentHash(normalized);
  if (prevHash === null) {
    return {
      status: 'unchanged', hash, excerpt: null, checkedAt: nowIso,
      line: `First check of ${label} — baseline recorded (${normalized.length.toLocaleString('en-US')} chars). Changes report from the next run.`,
    };
  }
  if (hash === prevHash) {
    return { status: 'unchanged', hash, excerpt: null, checkedAt: nowIso, line: `Checked ${label} — no change.` };
  }
  const excerpt = changeExcerpt(prevText ?? '', normalized);
  return { status: 'changed', hash, excerpt, checkedAt: nowIso, line: `${label} CHANGED — ${excerpt}` };
}

/** A detected change becomes a small record on the world's shelf — deterministic id per order+hash so
 *  re-processing the same change never duplicates. Source 'garvis': earned, never a seed. */
export function watchArtifact(orderId: string, label: string, result: WatchResult): { id: string; kind: 'doc'; title: string; detail: string; source: 'garvis' } | null {
  if (result.status !== 'changed') return null;
  const key = `${orderId}:${result.hash}`;
  let h = 5381;
  for (const ch of key) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return {
    id: `watch-${(h >>> 0).toString(36)}`,
    kind: 'doc',
    title: `Change detected: ${label}`.slice(0, 80),
    detail: `${result.line}\n\nDetected at ${result.checkedAt}.`,
    source: 'garvis',
  };
}

/** The honest last-run line for the UI: exactly what happened, never a synthesized "all good". */
export function orderStatusLine(order: Pick<StandingOrder, 'status' | 'lastRunAt' | 'lastResult' | 'nextRunAt'>): string {
  if (order.status === 'paused') return 'Paused — not checking.';
  if (!order.lastRunAt || !order.lastResult) return `Hasn’t run yet — first run scheduled for ${order.nextRunAt}.`;
  return order.lastResult.line;
}
