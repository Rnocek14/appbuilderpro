// src/lib/garvis/prospects/cohortStore.ts
// THE IMPURE HALF OF THE COUNTY INDEX — create a cohort, freeze what was true when we measured, and
// load it back for cohortStats().
//
// The one rule this file exists to enforce: A STUDY REMEMBERS WHAT IT SAW, NOT WHAT IS TRUE NOW.
//
// prospect_audits holds a business's CURRENT reading and is overwritten by the next scan — that is
// correct for a prospect card and fatal for a study. If the aggregate re-read the audits every time
// it was asked, then a site going down in November would silently change a percentage published in
// September, and every number in the press release would drift after the fact. So membership freezes
// `reachable`, `scan_version` and `trade` at measurement time, and cohortStats reads THOSE.
//
// The findings are still read live from `findings`, and that is a deliberate asymmetry worth stating:
// the frozen fields are the ones that define the SAMPLE (who was in it, whether they counted), and
// those must never move. The findings define the RESULT, and a study that has not been published yet
// should reflect the latest re-scan. Once you publish, you snapshot — which is what the `complete`
// status and `completed_at` are for, and why cohortStats refuses a cohort whose members span scan
// versions.
//
// Best-effort and fail-soft throughout, same as findingsStore: a cohort is an analytical layer on
// top of a funnel that must keep working without it. Nothing here may break an audit or a send.

import { supabase } from '../../supabase';
import { cohortStats, type CohortMember, type CohortStats } from './cohortStats';

/** True when the error is "this table doesn't exist yet" — app_0117 not applied. */
function isMissingSchema(message: string | undefined): boolean {
  return !!message && /(relation|table|column).*(does not exist)|schema cache/i.test(message);
}

export interface Cohort {
  id: string;
  name: string;
  area: string;
  frame: string;
  trade: string | null;
  frameNoun: string;
  scanVersion: string | null;
  status: 'open' | 'scanning' | 'complete' | 'abandoned';
  startedAt: string;
  completedAt: string | null;
}

/**
 * Open a new study.
 *
 * `frame` must be written BEFORE the results are known — it is the sentence that says what we set
 * out to measure ("every roofer Google Places returned for Walworth County that had a website").
 * A frame written afterwards is not a frame, it is a selection, and the difference is the whole
 * credibility of the number. Nothing in code can enforce that ordering; naming it here is the
 * closest thing to a guard, and it is why the field is required rather than optional.
 */
export async function createCohort(input: {
  ownerId: string;
  name: string;
  area: string;
  frame: string;
  trade?: string | null;
  frameNoun?: string;
  worldId?: string | null;
}): Promise<Cohort | null> {
  try {
    const { data, error } = await supabase.from('scan_cohorts').insert({
      owner_id: input.ownerId,
      world_id: input.worldId ?? null,
      name: input.name.trim(),
      area: input.area.trim(),
      frame: input.frame.trim(),
      trade: input.trade ?? null,
      frame_noun: (input.frameNoun ?? 'business').trim(),
      status: 'open',
    }).select('*').single();
    if (error || !data) return null;
    return rowToCohort(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

function rowToCohort(r: Record<string, unknown>): Cohort {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    area: String(r.area ?? ''),
    frame: String(r.frame ?? ''),
    trade: (r.trade as string | null) ?? null,
    frameNoun: String(r.frame_noun ?? 'business'),
    scanVersion: (r.scan_version as string | null) ?? null,
    status: (r.status as Cohort['status']) ?? 'open',
    startedAt: String(r.started_at ?? ''),
    completedAt: (r.completed_at as string | null) ?? null,
  };
}

/**
 * Record that a business was measured as part of this study, freezing the sample-defining facts.
 *
 * Idempotent by (cohort_id, audit_id): re-running a sweep tops the cohort up rather than duplicating
 * members, so an interrupted run can simply be resumed. Returns how many rows were newly added.
 */
export async function addCohortMembers(input: {
  ownerId: string;
  cohortId: string;
  members: { auditId: string; reachable: boolean; scanVersion: string | null; trade: string | null }[];
}): Promise<number> {
  const { ownerId, cohortId, members } = input;
  if (members.length === 0) return 0;
  try {
    const { data, error } = await supabase.from('cohort_members').upsert(
      members.map((m) => ({
        owner_id: ownerId,
        cohort_id: cohortId,
        audit_id: m.auditId,
        reachable: m.reachable,
        scan_version: m.scanVersion,
        trade: m.trade,
      })),
      { onConflict: 'cohort_id,audit_id', ignoreDuplicates: true },
    ).select('id');
    if (error) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/** Close the study. After this the numbers are the ones you publish and cite. */
export async function completeCohort(cohortId: string, scanVersion: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('scan_cohorts')
      .update({ status: 'complete', scan_version: scanVersion, completed_at: new Date().toISOString() })
      .eq('id', cohortId);
    return !error;
  } catch {
    return false;
  }
}

/** Read one study back. */
export async function getCohort(cohortId: string): Promise<Cohort | null> {
  try {
    const { data, error } = await supabase.from('scan_cohorts').select('*').eq('id', cohortId).maybeSingle();
    if (error || !data) return null;
    return rowToCohort(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Every study, newest first. */
export async function listCohorts(limit = 50): Promise<Cohort[]> {
  try {
    const { data, error } = await supabase.from('scan_cohorts')
      .select('*').order('started_at', { ascending: false }).limit(limit);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToCohort);
  } catch {
    return [];
  }
}

/**
 * Load a cohort's members with their findings, ready for cohortStats().
 *
 * Two queries rather than a nested embed: the embed would resolve through two FK hops and a silent
 * embed failure reads as "no data" instead of an error — and here "no data" would render as a study
 * with a zero in it, which is exactly the kind of quiet wrongness this whole layer is built to avoid.
 */
export async function loadCohortMembers(cohortId: string): Promise<CohortMember[]> {
  try {
    const { data: rows, error } = await supabase.from('cohort_members')
      .select('audit_id, reachable, scan_version, trade')
      .eq('cohort_id', cohortId)
      .limit(10_000);
    if (error) {
      if (isMissingSchema(error.message)) return [];
      return [];
    }
    const members = (rows ?? []) as { audit_id: string; reachable: boolean; scan_version: string | null; trade: string | null }[];
    if (members.length === 0) return [];

    // Findings are read LIVE (see the file header): the frozen fields define the sample, the findings
    // define the result. Only reachable members can have findings worth reading.
    const auditIds = members.filter((m) => m.reachable).map((m) => m.audit_id);
    const byAudit = new Map<string, CohortMember['findings']>();
    // Chunked: `in` with ten thousand uuids is a URL nobody's proxy will forward.
    for (let i = 0; i < auditIds.length; i += 200) {
      const chunk = auditIds.slice(i, i + 200);
      const { data: fs } = await supabase.from('findings')
        .select('audit_id, code, confidence, category, title').in('audit_id', chunk);
      for (const f of (fs ?? []) as { audit_id: string; code: string; confidence: string; category: string; title: string }[]) {
        const list = byAudit.get(f.audit_id) ?? [];
        list.push({
          code: f.code,
          confidence: f.confidence as CohortMember['findings'][number]['confidence'],
          category: f.category as CohortMember['findings'][number]['category'],
          title: f.title,
        });
        byAudit.set(f.audit_id, list);
      }
    }

    return members.map((m): CohortMember => ({
      auditId: m.audit_id,
      trade: m.trade,
      reachable: m.reachable,
      scanVersion: m.scan_version,
      findings: byAudit.get(m.audit_id) ?? [],
    }));
  } catch {
    return [];
  }
}

/** The study, aggregated. Returns null when the cohort has no members yet. */
export async function loadCohortStats(cohortId: string): Promise<CohortStats | null> {
  const members = await loadCohortMembers(cohortId);
  if (members.length === 0) return null;
  return cohortStats(members);
}
