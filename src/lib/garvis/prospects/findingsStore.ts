// src/lib/garvis/prospects/findingsStore.ts
// FINDINGS AS ROWS — the impure half of the deep scan, and the reason it was worth doing.
//
// Before this, everything a scan noticed lived in `prospect_audits.signals`, a JSONB array. That is
// fine for rendering one prospect's card and useless for the only question that compounds:
//
//     "Which finding, named in which pitch, actually produced a reply — and a sale?"
//
// You cannot GROUP BY a JSON blob. So each finding becomes a row (app_0116), and each outreach
// message records WHICH findings it led with (outreach_finding_refs.emphasized). After a few
// hundred prospects that join answers, from real outcomes rather than intuition, what to lead with —
// and after a few thousand it answers it per trade. That is the whole compounding mechanism, and it
// costs one table and one link table.
//
// HOUSE RULES OBSERVED HERE:
//   * BEST-EFFORT. Persistence never breaks the audit UI. Every write is wrapped; a failure is
//     swallowed after being surfaced to the caller as `false`, never thrown at the operator.
//   * DEGRADE HONESTLY. If app_0116 has not been applied yet, the table is missing and every write
//     here no-ops instead of erroring — the same discipline as the `proposals` retry in
//     clientHuntRun.persistAudit. A missing migration must never lose an audit.
//   * SELECT-FIRST / UPSERT ON (audit_id, code). Re-scanning a prospect REFRESHES its findings
//     rather than accumulating duplicates, so a count is always "as of the last scan".
//
// A note on deletion: a re-scan removes findings that no longer reproduce. That is deliberate —
// a finding that is no longer true must not keep appearing in a pitch. The historical record of
// what we *said* survives in outreach_finding_refs, which is what the outcome join reads.

import { supabase } from '../../supabase';
import type { DeepScan } from '../../../../supabase/functions/_shared/scanTypes.ts';
import type { ScanFacts } from '../../../../supabase/functions/_shared/deepScan.ts';
import type { PitchFinding } from './pitchFindings';

/** True when the error is "this table/column doesn't exist yet" — i.e. app_0116 isn't applied. */
function isMissingSchema(message: string | undefined): boolean {
  return !!message && /(relation|table|column).*(does not exist)|schema cache/i.test(message);
}

/**
 * Write one scan's findings for an audit, replacing whatever the previous scan recorded, and update
 * the audit's roll-up columns. Returns false when nothing was written (no scan, missing schema, or
 * a write failure) so the caller can decide whether to mention it — never throws.
 */
export async function persistScan(input: {
  auditId: string;
  ownerId: string;
  worldId?: string | null;
  scan: DeepScan | null;
  facts: ScanFacts | null;
}): Promise<boolean> {
  const { auditId, ownerId, worldId, scan, facts } = input;
  if (!scan) return false;
  try {
    // Replace-then-insert: the set of findings is "what is true as of this scan", not a log.
    const { error: delErr } = await supabase.from('findings').delete().eq('audit_id', auditId);
    if (delErr && isMissingSchema(delErr.message)) return false;

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
      const { error: insErr } = await supabase.from('findings').insert(rows);
      if (insErr) return false;
    }

    // Roll-ups on the audit row so the index/report layer can group without re-reading findings.
    // Retried without the new columns if app_0116 hasn't landed — the audit itself must survive.
    const rollup = {
      scan_version: scan.version,
      a11y_instances: scan.a11yInstances,
      tracker_count: facts ? facts.tracking.trackers.length + facts.tracking.sessionReplay.length : null,
      session_replay: facts ? facts.tracking.sessionReplay.length > 0 : null,
      consent_platform: facts?.tracking.consentPlatform ?? null,
      booking_platform: facts?.booking ?? null,
      deep_scanned_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase.from('prospect_audits').update(rollup).eq('id', auditId);
    if (upErr && !isMissingSchema(upErr.message)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Record which findings an outreach message actually led with. This is the row that makes the
 * outcome join possible — without it we know what we detected but not what we SAID, and the two
 * are different questions.
 */
export async function linkPitchFindings(input: {
  ownerId: string;
  messageId: string;
  auditId: string;
  picks: PitchFinding[];
}): Promise<boolean> {
  const { ownerId, messageId, auditId, picks } = input;
  if (picks.length === 0) return false;
  try {
    // The assertion is recorded by CODE, which is why it survives a re-scan: findings are deleted
    // and rewritten every time we look at a site again, and what we SAID must outlive what is
    // currently true. finding_id is a convenience pointer at the observation as it stood when we
    // spoke; it is released rather than cascaded when that row is replaced, so a failed lookup here
    // costs us the link, never the record.
    const codes = picks.map((p) => p.finding.code);
    const { data } = await supabase.from('findings')
      .select('id, code').eq('audit_id', auditId).in('code', codes);
    const idByCode = new Map(((data ?? []) as { id: string; code: string }[]).map((r) => [r.code, r.id]));

    const rows = picks.map((p) => ({
      owner_id: ownerId,
      message_id: messageId,
      finding_code: p.finding.code,
      finding_id: idByCode.get(p.finding.code) ?? null,
      emphasized: p.role === 'lead',
    }));

    const { error: insErr } = await supabase.from('outreach_finding_refs').insert(rows);
    return !insErr;
  } catch {
    return false;
  }
}

/** One finding code's real-world sales performance, assembled from outcomes rather than intuition. */
export interface FindingPerformance {
  code: string;
  /** How many pitches named this finding at all. */
  pitched: number;
  /** How many of those led with it (emphasized). */
  led: number;
  opened: number;
  clicked: number;
  replied: number;
  /** replied / pitched, or null when the sample is too small to mean anything. */
  replyRate: number | null;
  /** True once `pitched` clears the honesty threshold — the rates are readable. */
  significant: boolean;
}

/**
 * The payoff query: which findings, when named in a pitch, actually produce replies.
 *
 * Outcomes come from `outreach_events` (app_0081), which records delivered/opened/clicked/replied
 * per message — richer than a reply flag, and already written by the Resend webhook, so this needs
 * no new instrumentation on the send path.
 *
 * A DELIBERATE HONESTY GATE: replyRate is null below `minSample`. At three or four pitches a
 * "50% reply rate" is noise, and an operator who acts on it has been misled by their own tool.
 * Early on this returns mostly nulls, and that is the correct answer — top-of-funnel questions need
 * hundreds of sends before they mean anything, and close/churn questions need far more than that.
 *
 * NO JOIN TO `findings`. The code is denormalised onto the ref precisely so this question survives a
 * re-scan — joining back would silently drop every pitch whose finding has since been rewritten or
 * fixed, which is exactly the set of pitches whose outcome we most want to learn from.
 */
export async function findingPerformance(minSample = 25): Promise<FindingPerformance[]> {
  try {
    const { data: refs, error: refErr } = await supabase
      .from('outreach_finding_refs')
      .select('message_id, emphasized, finding_code')
      .limit(5000);
    if (refErr || !refs) return [];

    type Ref = { message_id: string; emphasized: boolean; finding_code: string | null };
    const rows = refs as unknown as Ref[];
    const messageIds = [...new Set(rows.map((r) => r.message_id).filter(Boolean))];
    if (messageIds.length === 0) return [];

    // Which messages saw which outcome. A message can have several events; we want set membership.
    const { data: events } = await supabase
      .from('outreach_events')
      .select('message_id, kind')
      .in('message_id', messageIds.slice(0, 1000));
    const outcome = { opened: new Set<string>(), clicked: new Set<string>(), replied: new Set<string>() };
    for (const e of (events ?? []) as { message_id: string | null; kind: string }[]) {
      if (!e.message_id) continue;
      if (e.kind === 'opened') outcome.opened.add(e.message_id);
      else if (e.kind === 'clicked') outcome.clicked.add(e.message_id);
      else if (e.kind === 'replied') outcome.replied.add(e.message_id);
    }

    const acc = new Map<string, { pitched: number; led: number; opened: number; clicked: number; replied: number }>();
    for (const r of rows) {
      const code = r.finding_code;
      if (!code) continue;
      const cur = acc.get(code) ?? { pitched: 0, led: 0, opened: 0, clicked: 0, replied: 0 };
      cur.pitched++;
      if (r.emphasized) cur.led++;
      if (outcome.opened.has(r.message_id)) cur.opened++;
      if (outcome.clicked.has(r.message_id)) cur.clicked++;
      if (outcome.replied.has(r.message_id)) cur.replied++;
      acc.set(code, cur);
    }

    return [...acc.entries()]
      .map(([code, v]): FindingPerformance => ({
        code, ...v,
        replyRate: v.pitched >= minSample ? v.replied / v.pitched : null,
        significant: v.pitched >= minSample,
      }))
      .sort((a, b) => b.pitched - a.pitched);
  } catch {
    return [];
  }
}
