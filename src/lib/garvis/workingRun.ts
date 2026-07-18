// src/lib/garvis/workingRun.ts
// Loaders for the "Working for you" page — ONE read-only view of everything the clock is doing.
// The audit: background work was scattered across five rooms (standing orders in Businesses,
// batches inside Contacts, the hunt in Win clients, build jobs on the demoted Autopilot page,
// discovery invisible entirely). Review fix: every loader now distinguishes THREE states — rows,
// table-missing (migration not applied on this install), and load-FAILED — because "couldn't
// load" rendered as "nothing running" is exactly the reassuring lie this page exists to kill.
// Nothing here mutates — actions stay on their owning pages.

import { supabase } from '../supabase';

const MISSING_RE = /does not exist|relation|schema cache/i;

export type Loaded<T> = { rows: T[] } | { missing: true } | { failed: true };
export type Fetched<T> = { ok: T } | { missing: true } | { failed: true };

async function failSoft<T>(fn: () => Promise<T[]>): Promise<Loaded<T>> {
  try { return { rows: await fn() }; }
  catch (e) {
    return MISSING_RE.test(e instanceof Error ? e.message : String(e)) ? { missing: true } : { failed: true };
  }
}
async function fetchSoft<T>(fn: () => Promise<T>): Promise<Fetched<T>> {
  try { return { ok: await fn() }; }
  catch (e) {
    return MISSING_RE.test(e instanceof Error ? e.message : String(e)) ? { missing: true } : { failed: true };
  }
}

export interface BuildJobLite {
  id: string; title: string | null; status: string; phase: string | null; pause_reason: string | null; created_at: string;
}
export function loadBuildJobs(): Promise<Loaded<BuildJobLite>> {
  return failSoft(async () => {
    // The jobs table's name column is `title` (schema_v2_autopilot) — selecting a nonexistent
    // `name` column made this whole section error into its empty state (review catch).
    const { data, error } = await supabase.from('jobs')
      .select('id, title, status, phase, pause_reason, created_at')
      .in('status', ['queued', 'running', 'waiting_approval', 'paused'])
      .order('created_at', { ascending: false }).limit(10);
    if (error) throw new Error(error.message);
    return (data ?? []) as BuildJobLite[];
  });
}

export interface DiscoveryQueryLite {
  id: string; query_text: string; last_run_at: string | null; last_inserted: number;
  total_inserted: number; exhausted: boolean;
}
export function loadDiscoveryQueries(): Promise<Loaded<DiscoveryQueryLite>> {
  return failSoft(async () => {
    const { data, error } = await supabase.from('discovery_queries')
      .select('id, query_text, last_run_at, last_inserted, total_inserted, exhausted')
      .order('last_run_at', { ascending: false, nullsFirst: false }).limit(8);
    if (error) throw new Error(error.message);
    return (data ?? []) as DiscoveryQueryLite[];
  });
}

export interface DiscoveredCounts { new: number; built: number; skipped: number }
export function loadDiscoveredCounts(): Promise<Fetched<DiscoveredCounts>> {
  return fetchSoft(async () => {
    const count = async (status: string) => {
      const { count: c, error } = await supabase.from('discovered_businesses')
        .select('id', { count: 'exact', head: true }).eq('status', status);
      if (error) throw new Error(error.message);
      return c ?? 0;
    };
    const [n, b, s] = await Promise.all([count('new'), count('built'), count('skipped')]);
    return { new: n, built: b, skipped: s };
  });
}

export interface AutomationSummary { active: number; paused: number }
export function loadAutomationSummary(): Promise<Fetched<AutomationSummary>> {
  return fetchSoft(async () => {
    const count = async (status: string) => {
      const { count: c, error } = await supabase.from('automation_triggers')
        .select('id', { count: 'exact', head: true }).eq('status', status);
      if (error) throw new Error(error.message);
      return c ?? 0;
    };
    const [active, paused] = await Promise.all([count('active'), count('paused')]);
    return { active, paused };
  });
}

export interface ReelCounts { total: number; active: number }
export function loadReelCounts(): Promise<Fetched<ReelCounts>> {
  return fetchSoft(async () => {
    const { count: total, error: e1 } = await supabase.from('reel_jobs')
      .select('id', { count: 'exact', head: true });
    if (e1) throw new Error(e1.message);
    const { count: active, error: e2 } = await supabase.from('reel_jobs')
      .select('id', { count: 'exact', head: true }).in('status', ['generating', 'assembling']);
    if (e2) throw new Error(e2.message);
    return { total: total ?? 0, active: active ?? 0 };
  });
}
