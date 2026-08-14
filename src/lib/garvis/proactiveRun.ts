// src/lib/garvis/proactiveRun.ts
// GARVIS SPEAKS UNPROMPTED — impure half (pure core + contract: proactive.ts).
//
// Gathers the rows the standing machinery leaves behind and hands them to the core, which
// decides what is worth saying. Fail-soft PER PROBE, and the failure mode matters here more than
// anywhere: a broken query yields NULL, and the core says nothing about that category. It must
// never yield an empty array, because "no approvals are waiting" and "I couldn't read approvals"
// are different claims and only one of them is true.
//
// What was already said is kept locally. Device-local is the honest trade: worst case a second
// device mentions the same thing once, which is far better than a shared cursor that could
// swallow a blocking approval entirely.

import { supabase } from '../supabase';
import { isDue, type ProactiveFacts } from './proactive';

const SPOKEN_KEY = 'ff:garvis-spoken';
const LOOK_KEY = 'ff:garvis-looked';

export function loadSpoken(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SPOKEN_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export function saveSpoken(keys: string[]): void {
  try { localStorage.setItem(SPOKEN_KEY, JSON.stringify(keys)); } catch { /* local-only */ }
}

/** Worth looking for news again? The dock remounts constantly; this keeps the probes rare. */
export function lookDue(now = new Date().toISOString()): boolean {
  try { return isDue(localStorage.getItem(LOOK_KEY), now); } catch { return false; }
}

export function markLooked(now = new Date().toISOString()): void {
  try { localStorage.setItem(LOOK_KEY, now); } catch { /* local-only */ }
}

/** A failed probe is null — the category goes unmentioned rather than being claimed empty. */
async function probe<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>, map: (rows: never[]) => T): Promise<T | null> {
  try {
    const { data, error } = await run();
    if (error) return null;
    return map((data ?? []) as never[]);
  } catch { return null; }
}

interface WatchRow { id: string; label: string; last_result: { status?: string; line?: string; excerpt?: string | null } | null; last_run_at: string | null }

export async function gatherProactive(now = new Date().toISOString()): Promise<ProactiveFacts> {
  const [approvals, waiting, finished, watches, opportunities] = await Promise.all([
    probe(
      () => supabase.from('approvals').select('id, title, created_at').eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(20),
      (rows) => rows as { id: string; title: string; created_at: string }[],
    ),
    probe(
      () => supabase.from('orchestrator_plans').select('id, title, waiting_reason').eq('status', 'waiting')
        .order('last_activity_at', { ascending: false }).limit(10),
      (rows) => (rows as { id: string; title: string; waiting_reason: string | null }[])
        .map((r) => ({ id: r.id, title: r.title, reason: r.waiting_reason })),
    ),
    probe(
      () => supabase.from('orchestrator_plans').select('id, title, last_activity_at').eq('status', 'done')
        .order('last_activity_at', { ascending: false }).limit(10),
      (rows) => (rows as { id: string; title: string; last_activity_at: string }[])
        .map((r) => ({ id: r.id, title: r.title, at: r.last_activity_at })),
    ),
    probe(
      () => supabase.from('standing_orders').select('id, label, last_result, last_run_at').eq('status', 'active').limit(20),
      (rows) => (rows as WatchRow[]).map((r) => ({
        id: r.id,
        label: r.label,
        status: String(r.last_result?.status ?? ''),
        line: String(r.last_result?.line ?? ''),
        excerpt: r.last_result?.excerpt ?? null,
        at: r.last_run_at,
      })),
    ),
    probe(
      () => supabase.from('opportunities').select('id, title, found_at').eq('status', 'new')
        .order('found_at', { ascending: false }).limit(10),
      (rows) => rows as { id: string; title: string; found_at: string }[],
    ),
  ]);
  return { now, approvals, waiting, finished, watches, opportunities };
}
