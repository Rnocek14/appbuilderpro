// src/lib/garvis/fleetView.ts
// FLEET VIEW — pure core (website-client vertical slice, operator control plane v0). This is NOT a
// grid of client cards: it is EXCEPTION-BASED VISIBILITY. Healthy recurring operations contribute
// ZERO rows to the operator's attention; everything that IS surfaced carries row-derived evidence
// and a one-sentence summary with the real numbers (No-Theater: every count comes from real rows
// the hook gathered — nothing here invents, estimates, or rounds up).
//
// Pure: no I/O, no Date.now() (the caller supplies nowIso), no Supabase, no DOM. The impure half
// is src/hooks/useFleetView.ts; the proof fixture is fleetView.verify.ts.
//
// Severity model:
//   'act'   — the operator must do something (a breaker tripped, a client site is serving errors,
//             a request or report is past its line, an outbound action runs without consent).
//   'watch' — real, but the system is still handling it (retrying) or it's an anomaly to review.
// Ordering is deterministic: 'act' first, then by age (oldest first), then name/kind tiebreaks.

import { isOpen, agingDays, type ChangeRequestStatus } from './clients/changeRequests';

// ---------------------------------------------------------------------------
// Input snapshots (typed world-scoped rows the hook gathers)
// ---------------------------------------------------------------------------

export interface FleetClient {
  worldId: string | null;                 // the client's world (app_0116); null pre-linkage
  name: string;                           // client_subscriptions.business_name
  pinStatus: 'active' | 'paused' | 'terminated' | null;  // package_pins.status; null = no pin
  packageKey: string | null;
  packageVersion: number | null;
  desiredEstablishes: {                   // service_packages.definition.establishes (app_0115)
    watch_site: boolean;
    propose_automations: string[];
    reporting: 'monthly' | null;
  };
  hasWatch: boolean;                      // an ACTIVE watch_url standing order in this client's world
  consentedActions: string[];             // package_consents.action rows (app_0119)
  /** Recorded "no"s, from package_pins.overrides.declined_actions (the on-disk convention in
   *  packageLifecycleRun.detectDrift). Optional because older pins carry no overrides. */
  declinedActions?: string[];
}

export interface FleetTrigger {
  worldId: string | null;                 // via client_subscription_id → client_subscriptions.world_id
  label: string;
  status: 'active' | 'paused';
  consecutiveFailures: number;            // breaker fields (app_0113)
  lastError: string | null;
  lastErrorAt: string | null;
  /** automation_triggers.capability_id — needed so consent_missing can check the ACTION against
   *  package_consents rows (a trigger snapshot without its action can't answer the question). */
  action?: string | null;
  /** trigger_fires rows in the last 30d. A fire row only exists for a SUCCESSFUL enqueue (failures
   *  record last_error instead), so this IS the clean-run count the hidden line reports. */
  fires30d?: number;
}

/** Mirror of the shape the watch drain actually writes to standing_orders.last_result
 *  (supabase/functions/_shared/standingCore.ts decideWatch → standing-worker persists it verbatim).
 *  There is no separate 'down' status in the drain: a server that ANSWERED with an error is written
 *  as status 'unreachable' with "HTTP <code>" inside the line; a network/DNS/timeout failure is the
 *  same status with the raw error text. The parse below keeps that distinction honest. */
export interface FleetWatchResult {
  status: 'changed' | 'unchanged' | 'unreachable';
  line: string;
  hash?: string | null;
  excerpt?: string | null;
  checkedAt?: string;
}

export interface FleetWatch {
  worldId: string | null;
  label: string;
  status: 'active' | 'paused';
  lastResult: FleetWatchResult | null;
  lastRunAt: string | null;
}

export interface FleetChangeRequest {
  worldId: string;                        // NOT NULL by construction (app_0117)
  status: ChangeRequestStatus | string;   // tolerate unknown strings from the wire; isOpen() decides
  priority: 'low' | 'normal' | 'high' | 'urgent';
  receivedAt: string;
}

export interface FleetReport {
  worldId: string;
  periodEnd: string;                      // date (yyyy-mm-dd)
  deliveryState: 'not_sent' | 'queued' | 'sent';
  approvalState: 'draft' | 'approved';
  /** client_reports.generated_at — when the report started "sitting". Optional (older rows);
   *  falls back to periodEnd so blocked-age is never invented, only under-counted. */
  generatedAt?: string | null;
}

export interface FleetUsage { worldId: string; costUsd30d: number }

export interface FleetSnapshots {
  clients: FleetClient[];
  triggers: FleetTrigger[];
  watches: FleetWatch[];
  changeRequests: FleetChangeRequest[];
  reports: FleetReport[];
  usageByWorld: FleetUsage[];
  nowIso: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type FleetSeverity = 'act' | 'watch';
export type FleetExceptionKind =
  | 'breaker_paused' | 'automation_failing' | 'site_down' | 'watch_unreachable'
  | 'cr_aging' | 'report_due' | 'report_blocked' | 'cost_outlier' | 'drift' | 'consent_missing';

export interface FleetException {
  worldId: string | null;
  clientName: string;
  kind: FleetExceptionKind;
  severity: FleetSeverity;
  summary: string;                        // one honest sentence with the real numbers
  evidence: string[];                     // row-derived facts, never prose invention
}

export interface FleetViewResult {
  exceptions: FleetException[];
  /** What stayed quiet, as counts only — healthy operations occupy this one line and nothing else. */
  hidden: { label: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Thresholds (named so the summaries can state the rule they applied)
// ---------------------------------------------------------------------------

export const BREAKER_THRESHOLD = 5;        // app_0113: the worker pauses at 5 consecutive failures
export const CR_WATCH_DAYS = 5;            // an open CR older than this is aging
export const CR_ACT_DAYS = 10;             // older than this (or urgent) demands action
export const REPORT_BLOCKED_DAYS = 3;      // an undelivered report sitting longer than this is stuck
export const REPORT_ACT_AFTER_DAY = 7;     // a missing monthly report escalates after the 7th
export const COST_OUTLIER_RATIO = 3;       // cost > 3× the median of nonzero client costs…
export const COST_OUTLIER_FLOOR_USD = 5;   // …AND > $5 absolute — trivial sums are never flagged

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const parseMs = (iso: string | null | undefined): number | null => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : null;
};

const usd = (n: number) => `$${n.toFixed(2)}`;

/** The server-answered-with-an-error tell inside an unreachable line: the drain writes the fetch
 *  error verbatim, and a non-ok RESPONSE is exactly `HTTP ${res.status}` (standing-worker runWatch).
 *  Present → the site is DOWN (the server spoke, and what it said was an error). Absent → the check
 *  itself failed (DNS/timeout/network) → UNREACHABLE, state unconfirmed. Unreachable ≠ down. */
const HTTP_ERROR_RE = /HTTP (\d{3})/;

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The last COMPLETE calendar month before nowIso, in UTC. */
function lastCompleteMonth(nowIso: string): { year: number; month0: number; label: string } {
  const d = new Date(nowIso);
  let year = d.getUTCFullYear();
  let month0 = d.getUTCMonth() - 1;
  if (month0 < 0) { month0 = 11; year -= 1; }
  const label = new Date(Date.UTC(year, month0, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { year, month0, label };
}

function isInMonth(dateIso: string, year: number, month0: number): boolean {
  const t = parseMs(dateIso);
  if (t === null) return false;
  const d = new Date(t);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month0;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

interface Aged { ex: FleetException; ageMs: number }

const SEVERITY_RANK: Record<FleetSeverity, number> = { act: 0, watch: 1 };

export function buildFleetView(snap: FleetSnapshots): FleetViewResult {
  const now = parseMs(snap.nowIso) ?? 0;
  const ageOf = (iso: string | null | undefined): number => {
    const t = parseMs(iso);
    return t === null ? 0 : Math.max(0, now - t);
  };
  const daysOf = (iso: string | null | undefined): number => Math.floor(ageOf(iso) / 86_400_000);

  const clientByWorld = new Map<string, FleetClient>();
  for (const c of snap.clients) if (c.worldId) clientByWorld.set(c.worldId, c);
  const nameFor = (worldId: string | null): string =>
    (worldId && clientByWorld.get(worldId)?.name) || 'Unassigned';

  const out: Aged[] = [];
  const push = (ex: FleetException, ageMs: number) => out.push({ ex, ageMs });

  // ---- triggers: breaker_paused / automation_failing / consent_missing ----------------------
  for (const t of snap.triggers) {
    const fails = t.consecutiveFailures;
    if (t.status === 'paused' && fails >= BREAKER_THRESHOLD) {
      // The circuit breaker tripped (app_0113): the worker flips status→paused at 5. An
      // operator-paused trigger (paused with a sub-threshold streak) is a deliberate act and
      // contributes nothing — deliberate quiet is healthy, not an exception.
      push({
        worldId: t.worldId, clientName: nameFor(t.worldId), kind: 'breaker_paused', severity: 'act',
        summary: `Automation "${t.label}" is breaker-paused after ${fails} consecutive failures — last error: ${t.lastError ?? 'not recorded'}.`,
        evidence: [
          `automation_triggers.status = 'paused'`,
          `automation_triggers.consecutive_failures = ${fails} (breaker threshold ${BREAKER_THRESHOLD})`,
          ...(t.lastError ? [`last_error: "${t.lastError}"${t.lastErrorAt ? ` at ${t.lastErrorAt}` : ''}`] : []),
        ],
      }, ageOf(t.lastErrorAt));
    } else if (t.status === 'active' && fails >= 1) {
      // Failing but the worker is still releasing-and-retrying. 1–4 is 'watch' with the retrying
      // state NAMED; a streak at/over the threshold while somehow still active means the breaker
      // hasn't caught up — that is 'act', not a comfortable retry.
      const overThreshold = fails >= BREAKER_THRESHOLD;
      push({
        worldId: t.worldId, clientName: nameFor(t.worldId), kind: 'automation_failing',
        severity: overThreshold ? 'act' : 'watch',
        summary: `Automation "${t.label}" has failed ${fails} consecutive fire${fails === 1 ? '' : 's'} and is retrying on schedule (breaker pauses at ${BREAKER_THRESHOLD}).`,
        evidence: [
          `automation_triggers.status = 'active' (still retrying)`,
          `automation_triggers.consecutive_failures = ${fails}`,
          ...(t.lastError ? [`last_error: "${t.lastError}"${t.lastErrorAt ? ` at ${t.lastErrorAt}` : ''}`] : []),
        ],
      }, ageOf(t.lastErrorAt));
    }

    // consent_missing: an ACTIVE trigger's outbound action with no package_consents row
    // (app_0119: outbound actions require RECORDED consent before they arm). Only checkable for
    // triggers attributable to a pinned client — consents are per client subscription.
    if (t.status === 'active' && t.action && t.worldId) {
      const client = clientByWorld.get(t.worldId);
      if (client && client.pinStatus !== null && !client.consentedActions.includes(t.action)) {
        push({
          worldId: t.worldId, clientName: client.name, kind: 'consent_missing', severity: 'act',
          summary: `Active automation "${t.label}" runs action '${t.action}' with no recorded consent for ${client.name}.`,
          evidence: [
            `automation_triggers.status = 'active', capability_id = '${t.action}'`,
            `package_consents: no row for (client, '${t.action}') — consented actions on file: ${client.consentedActions.length ? client.consentedActions.map((a) => `'${a}'`).join(', ') : 'none'}`,
          ],
        }, 0);
      }
    }
  }

  // ---- watches: site_down vs watch_unreachable (the drain's actual last_result shape) --------
  for (const w of snap.watches) {
    if (w.status !== 'active' || !w.lastResult) continue;
    if (w.lastResult.status !== 'unreachable') continue;
    // Fleet scope: only watches in a CLIENT's world surface here. World-null watches are
    // pre-client/platform scope by the scope contract (scopeContract.ts) — not a client exception.
    if (!w.worldId || !clientByWorld.has(w.worldId)) continue;
    const client = clientByWorld.get(w.worldId)!;
    const checkedAt = w.lastResult.checkedAt ?? w.lastRunAt;
    const httpMatch = HTTP_ERROR_RE.exec(w.lastResult.line);
    if (httpMatch) {
      // The server RESPONDED with an error status — the site is down (serving errors), not merely
      // unconfirmed. The client's customers are seeing this.
      push({
        worldId: w.worldId, clientName: client.name, kind: 'site_down', severity: 'act',
        summary: `${client.name}'s site returned HTTP ${httpMatch[1]} on the last check — the server answered with an error, the site is down.`,
        evidence: [
          `standing_orders.last_result.status = 'unreachable'`,
          `last_result.line: "${w.lastResult.line}"`,
          ...(checkedAt ? [`checked at ${checkedAt}`] : []),
        ],
      }, ageOf(checkedAt));
    } else {
      // The CHECK failed (DNS/timeout/network) — the watcher couldn't reach the site, which is not
      // proof the site is down. State unconfirmed; the drain retries on schedule.
      push({
        worldId: w.worldId, clientName: client.name, kind: 'watch_unreachable', severity: 'watch',
        summary: `The watch could not reach "${w.label}" on its last check — site state unconfirmed (unreachable is not down); it retries on schedule.`,
        evidence: [
          `standing_orders.last_result.status = 'unreachable' (no HTTP status — the fetch itself failed)`,
          `last_result.line: "${w.lastResult.line}"`,
          ...(checkedAt ? [`checked at ${checkedAt}`] : []),
        ],
      }, ageOf(checkedAt));
    }
  }

  // ---- change requests: cr_aging ------------------------------------------------------------
  for (const cr of snap.changeRequests) {
    if (!isOpen(cr.status as ChangeRequestStatus)) continue;
    const days = agingDays(cr.receivedAt, snap.nowIso);
    if (days <= CR_WATCH_DAYS) continue;
    const act = days > CR_ACT_DAYS || cr.priority === 'urgent';
    push({
      worldId: cr.worldId, clientName: nameFor(cr.worldId), kind: 'cr_aging', severity: act ? 'act' : 'watch',
      summary: `A ${cr.priority}-priority change request has been open ${days} days (status '${cr.status}', received ${cr.receivedAt.slice(0, 10)}).`,
      evidence: [
        `change_requests.status = '${cr.status}' (open), priority = '${cr.priority}'`,
        `received_at = ${cr.receivedAt} → ${days} days before ${snap.nowIso}`,
      ],
    }, ageOf(cr.receivedAt));
  }

  // ---- reports: report_due / report_blocked -------------------------------------------------
  const lastMonth = lastCompleteMonth(snap.nowIso);
  const dayOfMonth = new Date(snap.nowIso).getUTCDate();
  for (const c of snap.clients) {
    if (!c.worldId || c.pinStatus !== 'active') continue;
    if (c.desiredEstablishes.reporting !== 'monthly') continue;
    const hasLastMonthReport = snap.reports.some(
      (r) => r.worldId === c.worldId && isInMonth(r.periodEnd, lastMonth.year, lastMonth.month0),
    );
    if (!hasLastMonthReport) {
      // Any report row for the month (even a stuck draft) means "due" is answered — the stuck
      // draft is report_blocked's problem, and double-counting one gap as two exceptions is noise.
      push({
        worldId: c.worldId, clientName: c.name, kind: 'report_due',
        severity: dayOfMonth > REPORT_ACT_AFTER_DAY ? 'act' : 'watch',
        summary: `No ${lastMonth.label} report exists for ${c.name} (reporting pin: monthly; today is the ${dayOfMonth}${dayOfMonth > REPORT_ACT_AFTER_DAY ? `, past the ${REPORT_ACT_AFTER_DAY}th` : ''}).`,
        evidence: [
          `package_pins → ${c.packageKey ?? 'package'} v${c.packageVersion ?? '?'} establishes reporting: 'monthly'`,
          `client_reports: 0 rows with period_end in ${lastMonth.label} for this world`,
        ],
      }, ageOf(new Date(Date.UTC(lastMonth.year, lastMonth.month0 + 1, 1)).toISOString()));
    }
  }
  for (const r of snap.reports) {
    if (r.deliveryState !== 'not_sent') continue;
    const sittingSince = r.generatedAt ?? r.periodEnd;
    const days = daysOf(sittingSince);
    if (days <= REPORT_BLOCKED_DAYS) continue;
    const stateWord = r.approvalState === 'approved' ? 'approved but unsent' : 'in draft, unapproved';
    push({
      worldId: r.worldId, clientName: nameFor(r.worldId), kind: 'report_blocked', severity: 'act',
      summary: `The report for period ending ${r.periodEnd} has sat ${stateWord} and undelivered for ${days} days.`,
      evidence: [
        `client_reports.delivery_state = 'not_sent', approval_state = '${r.approvalState}'`,
        `${r.generatedAt ? `generated_at = ${r.generatedAt}` : `period_end = ${r.periodEnd} (no generated_at on row)`} → ${days} days before ${snap.nowIso}`,
      ],
    }, ageOf(sittingSince));
  }

  // ---- usage: cost_outlier ------------------------------------------------------------------
  // Median over NONZERO client-world costs only; a client is flagged when it exceeds BOTH the
  // relative bar (3× median) and the absolute floor ($5) — trivial sums never flag, no matter the
  // ratio (3× of nothing is still nothing).
  const clientCosts = snap.usageByWorld.filter((u) => u.costUsd30d > 0 && clientByWorld.has(u.worldId));
  const med = median(clientCosts.map((u) => u.costUsd30d).sort((a, b) => a - b));
  if (med > 0) {
    for (const u of clientCosts) {
      if (u.costUsd30d <= COST_OUTLIER_FLOOR_USD) continue;
      if (u.costUsd30d <= COST_OUTLIER_RATIO * med) continue;
      const client = clientByWorld.get(u.worldId)!;
      const ratio = (u.costUsd30d / med).toFixed(1);
      push({
        worldId: u.worldId, clientName: client.name, kind: 'cost_outlier', severity: 'watch',
        summary: `${client.name}'s 30-day cost ${usd(u.costUsd30d)} is ${ratio}× the fleet median of ${usd(med)} (flag bar: >${COST_OUTLIER_RATIO}× and >${usd(COST_OUTLIER_FLOOR_USD)}).`,
        evidence: [
          `usage_events (world-scoped, last 30d): ${usd(u.costUsd30d)} for this client's world`,
          `median of ${clientCosts.length} nonzero client costs: ${usd(med)}`,
        ],
      }, 0);
    }
  }

  // ---- drift: the pin promises something the world doesn't have -----------------------------
  for (const c of snap.clients) {
    if (!c.worldId || c.pinStatus !== 'active') continue;
    const declined = c.declinedActions ?? [];
    if (c.desiredEstablishes.watch_site && !c.hasWatch) {
      push({
        worldId: c.worldId, clientName: c.name, kind: 'drift', severity: 'watch',
        summary: `${c.packageKey ?? 'The package'} v${c.packageVersion ?? '?'} establishes a site watch for ${c.name}, but no active watch exists in their world.`,
        evidence: [
          `service_packages.definition.establishes.watch_site = true`,
          `standing_orders: 0 active watch_url rows in this client's world`,
        ],
      }, 0);
    }
    for (const action of c.desiredEstablishes.propose_automations) {
      if (c.consentedActions.includes(action) || declined.includes(action)) continue;
      // An armed trigger for this action means the proposal is no longer "sitting" — if it armed
      // WITHOUT consent, consent_missing (above) already surfaced the worse problem.
      const armed = snap.triggers.some((t) => t.worldId === c.worldId && t.action === action && t.status === 'active');
      if (armed) continue;
      push({
        worldId: c.worldId, clientName: c.name, kind: 'drift', severity: 'watch',
        summary: `Proposed automation '${action}' for ${c.name} is neither consented nor declined — the ask is still sitting.`,
        evidence: [
          `service_packages.definition.establishes.propose_automations includes '${action}'`,
          `package_consents: no row for '${action}'; pin overrides record no decline`,
        ],
      }, 0);
    }
  }

  // ---- deterministic ordering: act first, then oldest first, then stable tiebreaks ----------
  out.sort((a, b) =>
    (SEVERITY_RANK[a.ex.severity] - SEVERITY_RANK[b.ex.severity])
    || (b.ageMs - a.ageMs)
    || a.ex.clientName.localeCompare(b.ex.clientName)
    || a.ex.kind.localeCompare(b.ex.kind)
    || a.ex.summary.localeCompare(b.ex.summary));
  const exceptions = out.map((e) => e.ex);

  // ---- the hidden line: what stayed quiet, as counts from real rows -------------------------
  const surfacedWorlds = new Set(exceptions.map((e) => e.worldId).filter((w): w is string => w !== null));
  const healthyClients = snap.clients.filter((c) => !(c.worldId && surfacedWorlds.has(c.worldId))).length;
  const cleanFires = snap.triggers
    .filter((t) => t.status === 'active' && t.consecutiveFailures === 0)
    .reduce((s, t) => s + (t.fires30d ?? 0), 0);
  const watchesOk = snap.watches.filter((w) =>
    w.status === 'active' && w.worldId && clientByWorld.has(w.worldId)
    && w.lastResult !== null && w.lastResult.status !== 'unreachable').length;
  const reportsDelivered = snap.reports.filter((r) => r.deliveryState === 'sent').length;
  const crsOnPace = snap.changeRequests.filter((cr) =>
    isOpen(cr.status as ChangeRequestStatus) && agingDays(cr.receivedAt, snap.nowIso) <= CR_WATCH_DAYS).length;

  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const hidden = [
    { label: plural(healthyClients, 'client healthy', 'clients healthy'), count: healthyClients },
    { label: plural(cleanFires, 'automation run clean (30d)', 'automation runs clean (30d)'), count: cleanFires },
    { label: plural(watchesOk, 'site watch ok', 'site watches ok'), count: watchesOk },
    { label: plural(reportsDelivered, 'report delivered', 'reports delivered'), count: reportsDelivered },
    { label: plural(crsOnPace, 'change request on pace', 'change requests on pace'), count: crsOnPace },
  ].filter((h) => h.count > 0);

  return { exceptions, hidden };
}
