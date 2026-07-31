// supabase/functions/_shared/persistFindings.ts
// Server-side twin of findingsStore.persistScan — same rules, admin client, Deno-safe.
//
// Why a twin instead of a shared function: the browser store runs as the signed-in user through RLS
// and must degrade to a silent no-op when migrations lag the client; this runs as the service role
// inside edge functions (standing-worker's area studies), where a missing table is a deploy-order
// bug that should be VISIBLE in the run's error line, not swallowed. Same invariants, different
// failure posture — which is exactly why they are two small functions and not one clever one.
//
// The invariants, restated because both twins must keep them or the data lies:
//   * REPLACE-THEN-INSERT per audit. Findings are "what is true as of the last scan", not a log —
//     the unique (audit_id, code) makes duplicates impossible, this makes stale rows impossible.
//   * Roll-ups are DERIVED and rewritten with the findings, never the source of truth.
//   * What we SAID lives elsewhere (outreach_finding_refs, keyed by code) and is never touched here.

import type { DeepScan } from './scanTypes.ts';
import type { ScanFacts } from './deepScan.ts';

// deno-lint-ignore no-explicit-any
export async function persistFindingsAdmin(admin: any, input: {
  auditId: string;
  ownerId: string;
  worldId?: string | null;
  scan: DeepScan;
  facts: ScanFacts | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { auditId, ownerId, worldId, scan, facts } = input;

  const { error: delErr } = await admin.from('findings').delete().eq('audit_id', auditId);
  if (delErr) return { ok: false, error: `findings delete: ${delErr.message}` };

  if (scan.findings.length > 0) {
    const rows = scan.findings.map((f) => ({
      owner_id: ownerId,
      audit_id: auditId,
      world_id: worldId ?? null,
      code: f.code,
      category: f.category,
      severity: f.severity,
      confidence: f.confidence,
      title: f.title,
      detail: f.detail,
      count: typeof f.count === 'number' ? f.count : null,
      evidence: f.evidence ?? null,
      wcag: f.wcag ?? null,
      scan_version: scan.version,
    }));
    const { error: insErr } = await admin.from('findings').insert(rows);
    if (insErr) return { ok: false, error: `findings insert: ${insErr.message}` };
  }

  const { error: upErr } = await admin.from('prospect_audits').update({
    scan_version: scan.version,
    a11y_instances: scan.a11yInstances,
    tracker_count: facts ? facts.tracking.trackers.length + facts.tracking.sessionReplay.length : null,
    session_replay: facts ? facts.tracking.sessionReplay.length > 0 : null,
    consent_platform: facts?.tracking.consentPlatform ?? null,
    booking_platform: facts?.booking ?? null,
    deep_scanned_at: new Date().toISOString(),
  }).eq('id', auditId);
  if (upErr) return { ok: false, error: `rollup update: ${upErr.message}` };

  return { ok: true };
}
