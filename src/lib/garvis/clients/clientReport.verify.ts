// clientReport.verify.ts — the report's HONESTY is the feature, so this pins it hard:
// a null source contributes nothing numeric and appears verbatim in unknowns; too few
// observations refuse to state a percentage; recommendations must cite the evidence that
// triggered them; totals sum exactly the rows given; and the core reads ONLY its declared
// fields (so a stray world tag on an input row can never change the output — the RUN half
// owns scoping, and the core cannot silently "fix" a scoping mistake).
import {
  compileClientReport, reportPeriod, reportDue, ledgerRange,
  MIN_WATCH_OBSERVATIONS, MAX_RECOMMENDATIONS,
  type ReportSources, type ReportPeriod,
} from './clientReport';

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

const PERIOD: ReportPeriod = { start: '2026-06-01', end: '2026-06-30' };
const day = (d: number, ok = true, note = 'no change') =>
  ({ at: `2026-06-${String(d).padStart(2, '0')}T06:00:00.000Z`, ok, note });

const EMPTY: ReportSources = {
  watchRuns: null, changeRequests: null, triggerFires: null,
  breakerEvents: null, outreach: null, usage: null, leads: null,
};

// ---------------------------------------------------------------------------
// 1. A REAL MONTH: an incident that resolved + a completed change + automations
// ---------------------------------------------------------------------------
const full: ReportSources = {
  watchRuns: [
    ...Array.from({ length: 12 }, (_, i) => day(i + 1)),
    day(13, false, 'HTTP 503 from https://janesbakery.example.com'),   // the incident
    ...Array.from({ length: 12 }, (_, i) => day(i + 14)),
  ],
  changeRequests: [
    { status: 'closed', request: 'Update the hours on the contact page', receivedAt: '2026-06-05T10:00:00.000Z', closedAt: '2026-06-06T12:00:00.000Z' },
    { status: 'scoped', request: 'Add a gift-card page', receivedAt: '2026-06-25T10:00:00.000Z', closedAt: null },
  ],
  triggerFires: [
    { at: '2026-06-04T09:00:00.000Z', label: 'Lead follow-up', approvalId: 'ap-1' },
    { at: '2026-06-18T09:00:00.000Z', label: 'Lead follow-up', approvalId: 'ap-2' },
  ],
  breakerEvents: [
    { label: 'Lead follow-up', error: 'provider timeout', at: '2026-06-18T09:05:00.000Z', recovered: true },
  ],
  outreach: [
    { sentAt: '2026-06-07T09:00:00.000Z', opened: true, replied: true },
    { sentAt: '2026-06-14T09:00:00.000Z', opened: true, replied: false },
    { sentAt: null, opened: false, replied: false },   // never sent — must not count as sent
  ],
  usage: [
    { kind: 'garvis', costUsd: 0.42, at: '2026-06-10T09:00:00.000Z' },
    { kind: 'classify', costUsd: 0.08, at: '2026-06-11T09:00:00.000Z' },
  ],
  leads: [{ at: '2026-06-09T12:00:00.000Z', source: 'site form' }],
};

const r = compileClientReport(full, PERIOD, { businessName: "Jane's Bakery" });

check('the report names the period and the client', r.bodyMd.includes('June') && r.bodyMd.includes("Jane's Bakery"));
check('the resolved incident appears in the body', /503|incident/i.test(r.bodyMd));
check('the completed change appears in the body', /hours on the contact page/i.test(r.bodyMd));
// The client-facing body states the open COUNT (concise by design); the operator's evidence view
// carries the rows. What must never happen is an unresolved request going unmentioned.
check('the unresolved request is counted, not hidden', /open at period end: 1/i.test(r.bodyMd));
check('automation runs are reported', /2/.test(r.bodyMd) && /automation/i.test(r.bodyMd));
check('the failure-and-recovery is reported honestly', /recover/i.test(r.bodyMd));
check('cost totals exactly the rows given ($0.50)', /0\.50|0\.5\b/.test(r.bodyMd));
check('only SENT outreach counts (2, not 3)',
  (r.evidence['outreach_sent']?.count ?? -1) === 2);
check('every evidence entry names its source and count',
  Object.values(r.evidence).every((e) => e.source.trim().length > 0 && typeof e.count === 'number'));
check('a full month of observations DOES state uptime', /%/.test(r.bodyMd));
check('nothing is unknown when every source is present', r.unknowns.length === 0);

// ---------------------------------------------------------------------------
// 2. NULL SOURCES: listed as unavailable, contributing NOTHING numeric
// ---------------------------------------------------------------------------
const blind = compileClientReport(EMPTY, PERIOD, { businessName: 'Quiet Co' });
check('every null source becomes an explicit unknown', blind.unknowns.length === 7);
check('each unknown names the metric AND the reason',
  blind.unknowns.every((u) => u.metric.trim().length > 0 && u.reason.trim().length > 10));
check('a blind report states no uptime percentage', !/%/.test(blind.bodyMd));
check('a blind report invents no counts', !/\b[1-9]\d*\s+(automations?|changes?|leads?|emails?)\b/i.test(blind.bodyMd));
check('a blind report has no evidence entries to point at', Object.keys(blind.evidence).length === 0);
check('a blind report makes no recommendations', blind.recommendations.length === 0);

// An EMPTY ARRAY is not the same as a NULL source: "we watched and nothing happened" is a fact.
const measuredZero = compileClientReport({ ...EMPTY, changeRequests: [], triggerFires: [] }, PERIOD);
check('an empty array is measured (not unknown)', measuredZero.unknowns.length === 5);
check('a measured zero can be stated honestly', /\b0\b|none|no /i.test(measuredZero.bodyMd));

// ---------------------------------------------------------------------------
// 3. INSUFFICIENT OBSERVATIONS: refuse the percentage, say why
// ---------------------------------------------------------------------------
const thin = compileClientReport(
  { ...EMPTY, watchRuns: Array.from({ length: MIN_WATCH_OBSERVATIONS - 1 }, (_, i) => day(i + 1)) },
  PERIOD,
);
check(`fewer than ${MIN_WATCH_OBSERVATIONS} observations state insufficiency, not a percentage`,
  /insufficient/i.test(thin.bodyMd) && !/%/.test(thin.bodyMd));

// ---------------------------------------------------------------------------
// 4. RECOMMENDATIONS: capped, and each cites the evidence that triggered it
// ---------------------------------------------------------------------------
check(`recommendations never exceed ${MAX_RECOMMENDATIONS}`, r.recommendations.length <= MAX_RECOMMENDATIONS);
check('every recommendation cites an evidence key that exists',
  r.recommendations.every((rec) => rec.evidenceKey.trim().length > 0 && rec.evidenceKey in r.evidence));

// ---------------------------------------------------------------------------
// 5. THE CORE READS ONLY ITS DECLARED FIELDS (scoping is the run half's job)
// ---------------------------------------------------------------------------
const tagged = JSON.parse(JSON.stringify(full)) as ReportSources;
for (const row of (tagged.usage ?? [])) (row as unknown as Record<string, unknown>).worldId = 'w-someone-else';
for (const row of (tagged.changeRequests ?? [])) (row as unknown as Record<string, unknown>).worldId = 'w-someone-else';
const tainted = compileClientReport(tagged, PERIOD, { businessName: "Jane's Bakery" });
check('extra fields on input rows cannot change the output (the core cannot mask a scoping bug)',
  tainted.bodyMd === r.bodyMd && JSON.stringify(tainted.evidence) === JSON.stringify(r.evidence));

// ---------------------------------------------------------------------------
// 6. PERIOD + DUE HELPERS
// ---------------------------------------------------------------------------
const p = reportPeriod('2026-07-20T09:00:00.000Z');
check('reportPeriod returns the PREVIOUS complete calendar month', p.start === '2026-06-01' && p.end === '2026-06-30');
check('reportPeriod handles the January boundary',
  (() => { const j = reportPeriod('2026-01-09T00:00:00.000Z'); return j.start === '2025-12-01' && j.end === '2025-12-31'; })());
check('ledgerRange covers the whole period', (() => {
  const { fromIso, toIso } = ledgerRange(p);
  return fromIso.startsWith('2026-06-01') && toIso > '2026-06-30';
})());
check('reportDue selects only monthly pins missing the last period',
  reportDue([
    { reporting: 'monthly', lastReportPeriodEnd: null },
    { reporting: 'monthly', lastReportPeriodEnd: '2026-06-30' },
    { reporting: null, lastReportPeriodEnd: null },
  ], '2026-07-20T09:00:00.000Z').length === 1);

console.log(`\nclientReport.verify: ${25 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} client-report check(s) failed`);
