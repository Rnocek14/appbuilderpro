// src/lib/garvis/clients/clientReport.ts
// PURE half of the MONTHLY CLIENT REPORT (app_0118): compile world-scoped source rows into an
// artifact with provenance — bodyMd (client-facing), evidence (claim → {count, source, sample_refs}),
// unknowns (explicitly unavailable metrics). No I/O (clientReport.verify.ts); the impure half is
// clientReportRun.ts, which owns ALL world scoping — this core never filters rows, it only counts
// what it is given (verify pins that a stray extra field like worldId changes nothing).
//
// HONESTY INVARIANTS (by construction, verify-pinned):
//   * a null source NEVER contributes a number to bodyMd — every section renders only inside its
//     `source !== null` branch; a null lands in `unknowns` (and a digit-free "not covered" line);
//   * totals only sum the rows given (reduce over the input array, nothing else);
//   * no uptime percentage from fewer than MIN_WATCH_OBSERVATIONS runs — "insufficient
//     observations" instead (the watch drain stores only the current state, so this is the norm);
//   * recommendations are DERIVED, never invented: each rule fires only off computed evidence,
//     cites its evidence key, and the array is capped at MAX_RECOMMENDATIONS.

export interface WatchRunSrc { at: string; ok: boolean; note: string }
export interface ChangeRequestSrc { status: string; request: string; receivedAt: string; closedAt: string | null }
export interface TriggerFireSrc { at: string; label: string; approvalId: string | null }
export interface BreakerEventSrc { label: string; error: string; at: string; recovered: boolean }
export interface OutreachSrc { sentAt: string | null; opened: boolean; replied: boolean }
export interface UsageSrc { kind: string; costUsd: number; at: string }
export interface LeadSrc { at: string; source: string | null }

/** World-scoped rows the run half gathered. null = source unavailable/unarmed this period —
 *  NOT the same as an empty array (which is an armed source that observed nothing). */
export interface ReportSources {
  watchRuns: WatchRunSrc[] | null;
  changeRequests: ChangeRequestSrc[] | null;
  triggerFires: TriggerFireSrc[] | null;
  breakerEvents: BreakerEventSrc[] | null;
  outreach: OutreachSrc[] | null;
  usage: UsageSrc[] | null;
  leads: LeadSrc[] | null;
}

export interface EvidenceEntry { count: number; source: string; sample_refs: string[] }
export interface ReportUnknown { metric: string; reason: string }
export interface ReportRecommendation { text: string; evidenceKey: string }
export interface ReportPeriod { start: string; end: string }   // inclusive calendar dates, YYYY-MM-DD

export interface CompiledReport {
  bodyMd: string;
  evidence: Record<string, EvidenceEntry>;
  unknowns: ReportUnknown[];
  /** Rendered into bodyMd; kept structured so callers/verify can pin the citing contract. */
  recommendations: ReportRecommendation[];
}

export const MIN_WATCH_OBSERVATIONS = 7;
export const MAX_RECOMMENDATIONS = 3;
const SAMPLE_CAP = 3;          // sample_refs per evidence entry
const LIST_CAP = 5;            // itemized lines per section in bodyMd
const AGING_DAYS = 14;         // an unresolved request older than this → scoping-call recommendation
const REPEAT_INCIDENT_THRESHOLD = 3;   // this many failed checks → hosting-review recommendation

/** Canonical unknowns, one per source — the run half and the verify pin these verbatim. */
export const UNKNOWN_REASONS: Record<keyof ReportSources, ReportUnknown> = {
  watchRuns: { metric: 'uptime', reason: 'site watch not armed this period' },
  changeRequests: { metric: 'change requests', reason: 'change-request ledger unavailable this period' },
  triggerFires: { metric: 'automation runs', reason: 'no client automations armed this period' },
  breakerEvents: { metric: 'automation failures', reason: 'automation breaker telemetry unavailable this period' },
  outreach: { metric: 'outreach activity', reason: 'no world-linked contacts to attribute messages to this period' },
  usage: { metric: 'attributable cost', reason: 'usage ledger unavailable for this world this period' },
  leads: { metric: 'leads', reason: 'site lead capture not connected this period' },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "June 2026" from a YYYY-MM-DD period start (deterministic — no locale calls). */
export function periodLabel(periodStart: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periodStart);
  if (!m) return periodStart;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : periodStart;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The PREVIOUS calendar month for `nowIso` (UTC): {start, end} inclusive dates. */
export function reportPeriod(nowIso: string): ReportPeriod {
  const d = new Date(nowIso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();   // 0-based current month
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);   // day 0 = last of previous
  return { start, end };
}

/** The exact timestamptz gather range for a period: [fromIso, toIso) — stored as ledger_from/to. */
export function ledgerRange(period: ReportPeriod): { fromIso: string; toIso: string } {
  return { fromIso: `${period.start}T00:00:00.000Z`, toIso: `${addDays(period.end, 1)}T00:00:00.000Z` };
}

/** Which pins are due a report for the just-finished month: reporting must be 'monthly' and no
 *  report already covers the previous month's end. Generic so callers' extra fields (id, worldId…)
 *  ride through untouched. */
export function reportDue<T extends { reporting: 'monthly' | null; lastReportPeriodEnd: string | null }>(
  pins: T[], nowIso: string,
): T[] {
  const { end } = reportPeriod(nowIso);
  return pins.filter((p) => p.reporting === 'monthly'
    && (p.lastReportPeriodEnd === null || p.lastReportPeriodEnd < end));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Compile the report. Pure and filter-free: rows arrive already world-scoped by the run half; the
 *  core counts exactly what it is given and reads ONLY the declared fields. */
export function compileClientReport(
  sources: ReportSources,
  period: ReportPeriod,
  opts?: { businessName?: string | null },
): CompiledReport {
  const evidence: Record<string, EvidenceEntry> = {};
  const unknowns: ReportUnknown[] = [];
  const recs: ReportRecommendation[] = [];
  const lines: string[] = [];
  const agingCutoff = addDays(period.end, -AGING_DAYS);

  const name = (opts?.businessName ?? '').trim();
  lines.push(`# Monthly report — ${periodLabel(period.start)}${name ? ` — ${name}` : ''}`);
  lines.push('', `_Covers ${period.start} through ${period.end}. Every figure below comes from this period's own records; anything we could not measure is listed at the end, never estimated._`);

  // ---- Website: uptime + incidents (watchRuns) --------------------------------------------------
  if (sources.watchRuns === null) {
    unknowns.push(UNKNOWN_REASONS.watchRuns);
  } else {
    const runs = sources.watchRuns;
    const incidents = runs.filter((r) => !r.ok);
    evidence.uptime_checks = {
      count: runs.length, source: 'standing_orders.watch_url last_result',
      sample_refs: runs.slice(0, SAMPLE_CAP).map((r) => r.at),
    };
    evidence.watch_incidents = {
      count: incidents.length, source: 'standing_orders.watch_url last_result',
      sample_refs: incidents.slice(0, SAMPLE_CAP).map((r) => `${r.at} · ${r.note.slice(0, 80)}`),
    };
    lines.push('', '## Website');
    if (runs.length >= MIN_WATCH_OBSERVATIONS) {
      const okCount = runs.length - incidents.length;
      const pct = Math.round((okCount / runs.length) * 1000) / 10;
      lines.push(`- Uptime: ${pct}% (${okCount} of ${runs.length} checks passed)`);
    } else {
      // Never a percentage from thin data — say exactly what was observed instead.
      lines.push(`- Site checks: insufficient observations (${runs.length} check${runs.length === 1 ? '' : 's'} recorded) — an uptime figure needs at least ${MIN_WATCH_OBSERVATIONS} checks, so none is reported.`);
    }
    if (incidents.length) {
      lines.push(`- Incidents (${incidents.length}):`);
      for (const inc of incidents.slice(0, LIST_CAP)) lines.push(`  - ${inc.at.slice(0, 10)} — ${inc.note.slice(0, 120)}`);
      if (incidents.length > LIST_CAP) lines.push(`  - …and ${incidents.length - LIST_CAP} more`);
    } else if (runs.length) {
      lines.push('- No incidents observed.');
    }
    if (incidents.length >= REPEAT_INCIDENT_THRESHOLD) {
      recs.push({
        evidenceKey: 'watch_incidents',
        text: `The site failed ${incidents.length} checks this period — repeated incidents suggest a hosting/stability review is worth scheduling.`,
      });
    }
  }

  // ---- Changes (changeRequests) -----------------------------------------------------------------
  if (sources.changeRequests === null) {
    unknowns.push(UNKNOWN_REASONS.changeRequests);
  } else {
    const done = new Set(['deployed', 'verified', 'client_notified', 'closed']);
    const rows = sources.changeRequests;
    const completed = rows.filter((r) => done.has(r.status));
    const unresolved = rows.filter((r) => !done.has(r.status) && r.status !== 'declined');
    evidence.changes_completed = {
      count: completed.length, source: 'change_requests',
      sample_refs: completed.slice(0, SAMPLE_CAP).map((r) => `${(r.closedAt ?? r.receivedAt).slice(0, 10)} · ${r.request.slice(0, 60)}`),
    };
    evidence.changes_unresolved = {
      count: unresolved.length, source: 'change_requests',
      sample_refs: unresolved.slice(0, SAMPLE_CAP).map((r) => `${r.receivedAt.slice(0, 10)} · ${r.request.slice(0, 60)}`),
    };
    lines.push('', '## Changes');
    if (completed.length) {
      lines.push(`- Completed: ${completed.length}`);
      for (const r of completed.slice(0, LIST_CAP)) {
        lines.push(`  - "${r.request.slice(0, 80)}"${r.closedAt ? ` (done ${r.closedAt.slice(0, 10)})` : ''}`);
      }
      if (completed.length > LIST_CAP) lines.push(`  - …and ${completed.length - LIST_CAP} more`);
    } else {
      lines.push('- No change requests were completed this period.');
    }
    lines.push(`- Open at period end: ${unresolved.length}`);
    const aging = unresolved.filter((r) => r.receivedAt.slice(0, 10) <= agingCutoff);
    if (aging.length) {
      recs.push({
        evidenceKey: 'changes_unresolved',
        text: `${aging.length} request${aging.length === 1 ? ' has' : 's have'} been open more than ${AGING_DAYS} days — a short scoping call would unblock ${aging.length === 1 ? 'it' : 'them'}.`,
      });
    }
  }

  // ---- Automations: runs (triggerFires) + failures/recoveries (breakerEvents) -------------------
  const auto: string[] = [];
  if (sources.triggerFires === null) {
    unknowns.push(UNKNOWN_REASONS.triggerFires);
  } else {
    const fires = sources.triggerFires;
    evidence.automation_runs = {
      count: fires.length, source: 'trigger_fires',
      sample_refs: fires.slice(0, SAMPLE_CAP).map((f) => f.approvalId ?? `${f.at.slice(0, 10)} · ${f.label.slice(0, 60)}`),
    };
    auto.push(fires.length ? `- Automation runs queued: ${fires.length}` : '- No automation runs this period.');
  }
  if (sources.breakerEvents === null) {
    unknowns.push(UNKNOWN_REASONS.breakerEvents);
  } else {
    const evs = sources.breakerEvents;
    const recovered = evs.filter((e) => e.recovered);
    const unrecovered = evs.filter((e) => !e.recovered);
    evidence.automation_failures = {
      count: evs.length, source: 'mind_events (auto-breaker)',
      sample_refs: evs.slice(0, SAMPLE_CAP).map((e) => `${e.at.slice(0, 10)} · ${e.label.slice(0, 40)} · ${e.error.slice(0, 60)}`),
    };
    if (evs.length) {
      auto.push(`- Automation failures: ${evs.length} (recovered: ${recovered.length})`);
      for (const e of evs.slice(0, LIST_CAP)) {
        auto.push(`  - ${e.at.slice(0, 10)} — "${e.label.slice(0, 60)}" paused after repeated failures${e.recovered ? '; since restored' : '; still paused'}`);
      }
    } else if (sources.triggerFires !== null) {
      auto.push('- No automation failures recorded.');
    }
    if (unrecovered.length) {
      recs.push({
        evidenceKey: 'automation_failures',
        text: `${unrecovered.length} automation${unrecovered.length === 1 ? ' is' : 's are'} still paused after repeated failures — ${unrecovered.length === 1 ? 'it needs' : 'they need'} repair before next period.`,
      });
    }
  }
  if (auto.length) lines.push('', '## Automations', ...auto);

  // ---- Outreach & publishing (outreach) ---------------------------------------------------------
  if (sources.outreach === null) {
    unknowns.push(UNKNOWN_REASONS.outreach);
  } else {
    const rows = sources.outreach;
    const sent = rows.filter((r) => r.sentAt !== null);
    const opened = rows.filter((r) => r.opened);
    const replied = rows.filter((r) => r.replied);
    evidence.outreach_sent = {
      count: sent.length, source: 'outreach_messages',
      sample_refs: sent.slice(0, SAMPLE_CAP).map((r) => r.sentAt as string),
    };
    evidence.outreach_opened = { count: opened.length, source: 'outreach_messages.opened_at', sample_refs: [] };
    evidence.outreach_replied = { count: replied.length, source: 'outreach_messages.status=replied', sample_refs: [] };
    lines.push('', '## Outreach & publishing');
    if (sent.length) {
      lines.push(`- Messages sent: ${sent.length}`, `- Opened: ${opened.length}`, `- Replies: ${replied.length}`);
    } else {
      lines.push('- No messages were sent this period.');
    }
  }

  // ---- Leads (leads) ----------------------------------------------------------------------------
  if (sources.leads === null) {
    unknowns.push(UNKNOWN_REASONS.leads);
  } else {
    const rows = sources.leads;
    evidence.leads = {
      count: rows.length, source: 'site_events (kind=lead)',
      sample_refs: rows.slice(0, SAMPLE_CAP).map((l) => `${l.at.slice(0, 10)} · ${l.source ?? 'website'}`),
    };
    lines.push('', '## Leads');
    if (rows.length) {
      lines.push(`- New leads: ${rows.length}`);
      const bySource = new Map<string, number>();
      for (const l of rows) {
        const k = l.source ?? 'website';
        bySource.set(k, (bySource.get(k) ?? 0) + 1);
      }
      for (const [k, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
        lines.push(`  - ${k}: ${n}`);
      }
    } else {
      lines.push('- No new leads were recorded this period.');
    }
  }

  // ---- Attributable cost (usage) — the total is the reduce over given rows, nothing else --------
  if (sources.usage === null) {
    unknowns.push(UNKNOWN_REASONS.usage);
  } else {
    const rows = sources.usage;
    const total = round2(rows.reduce((s, u) => s + u.costUsd, 0));
    evidence.attributable_cost = {
      count: rows.length, source: 'usage_events',
      sample_refs: rows.slice(0, SAMPLE_CAP).map((u) => `${u.at.slice(0, 10)} · ${u.kind}`),
    };
    lines.push('', '## Cost', `- Attributable cost: $${total.toFixed(2)} across ${rows.length} metered event${rows.length === 1 ? '' : 's'}.`);
  }

  // ---- Recommendations: derived-only, each citing its evidence key, hard-capped -----------------
  const recommendations = recs.filter((r) => r.evidenceKey in evidence).slice(0, MAX_RECOMMENDATIONS);
  if (recommendations.length) {
    lines.push('', '## Recommendations');
    recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r.text} _(from: ${r.evidenceKey})_`));
  }

  // ---- Explicit unknowns: honesty is the entire point — say what we could NOT measure -----------
  if (unknowns.length) {
    lines.push('', '## Not covered this period');
    for (const u of unknowns) lines.push(`- ${u.metric} — ${u.reason}`);
  }

  return { bodyMd: lines.join('\n'), evidence, unknowns, recommendations };
}
