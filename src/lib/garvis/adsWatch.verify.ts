// src/lib/garvis/adsWatch.verify.ts — run: npx tsx src/lib/garvis/adsWatch.verify.ts
// Verifies the ad watchdog's honesty contract: no verdict on thin data, "today" never judged,
// a missing report is never treated as zero, every finding carries real arithmetic, determinism.
// The implementation under test is THE deployed one (supabase/functions/_shared/adsWatchCore.ts)
// — one implementation, verified here, executed in the ads-watch edge function.

import { detectAdAnomalies, type AdDayRow } from '../../../supabase/functions/_shared/adsWatchCore';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

const TODAY = '2026-07-11'; // yesterday = 07-10; baseline = 07-03 … 07-09
const day = (d: string, over: Partial<AdDayRow> = {}): AdDayRow => ({
  provider: 'meta_ads', campaign_name: 'Lakefront Sellers', date: d,
  spend_usd: 12, impressions: 1000, clicks: 20, ...over,
});
const BASE_WEEK = ['2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09'];

// ---- spend spike ----
{
  const rows = [...BASE_WEEK.map((d) => day(d)), day('2026-07-10', { spend_usd: 84 })];
  const out = detectAdAnomalies(rows, TODAY);
  const spike = out.find((a) => a.kind === 'spend_spike');
  check('spend spike detected at 7×', !!spike && spike.severity === 'alert');
  check('spike evidence carries both numbers', !!spike && /\$84\.00/.test(spike.evidence) && /\$12\.00\/day/.test(spike.evidence));
  check('spike key is stable (dedupe-able)', spike?.key === 'meta_ads:Lakefront Sellers:spend_spike:2026-07-10');
}
{
  // Below the $10 delta floor: 3× on tiny spend stays silent.
  const rows = [...BASE_WEEK.map((d) => day(d, { spend_usd: 1 })), day('2026-07-10', { spend_usd: 3 })];
  check('tiny-money spike stays silent (delta floor)', detectAdAnomalies(rows, TODAY).every((a) => a.kind !== 'spend_spike'));
}

// ---- spend stopped ----
{
  const rows = [...BASE_WEEK.map((d) => day(d)), day('2026-07-10', { spend_usd: 0, impressions: 0, clicks: 0 })];
  const out = detectAdAnomalies(rows, TODAY);
  check('spend stopped detected ($12/day → $0 with a real $0 row)', out.some((a) => a.kind === 'spend_stopped' && a.severity === 'alert'));
}
{
  // NO row for yesterday = late data, not zero — must stay silent.
  const rows = BASE_WEEK.map((d) => day(d));
  check('missing yesterday report ≠ zero (no stopped verdict)', detectAdAnomalies(rows, TODAY).every((a) => a.kind !== 'spend_stopped'));
}
{
  // Barely-spending campaign going quiet is not an alert.
  const rows = [...BASE_WEEK.map((d) => day(d, { spend_usd: 2 })), day('2026-07-10', { spend_usd: 0 })];
  check('low-spend campaign stopping stays silent', detectAdAnomalies(rows, TODAY).every((a) => a.kind !== 'spend_stopped'));
}

// ---- MIN-SAMPLE gating ----
{
  const rows = [day('2026-07-08'), day('2026-07-09'), day('2026-07-10', { spend_usd: 500 })];
  check('under 4 baseline days → NO verdict at all (even a 40× spike)', detectAdAnomalies(rows, TODAY).length === 0);
}

// ---- today never judged ----
{
  const rows = [...BASE_WEEK.map((d) => day(d)), day('2026-07-11', { spend_usd: 999 })];
  check('today (partial data) is never judged', detectAdAnomalies(rows, TODAY).length === 0);
}

// ---- CTR collapse ----
{
  const rows = [
    ...BASE_WEEK.map((d) => day(d, { impressions: 1000, clicks: 20 })),   // baseline CTR 2%
    day('2026-07-10', { impressions: 1000, clicks: 3 }),                  // 0.3% < 40% of 2%
  ];
  const out = detectAdAnomalies(rows, TODAY);
  const c = out.find((a) => a.kind === 'ctr_collapse');
  check('CTR collapse detected (2% → 0.3%)', !!c && c.severity === 'watch');
  check('CTR evidence carries impressions + clicks', !!c && /3 clicks on 1000 impressions/.test(c.evidence));
}
{
  const rows = [
    ...BASE_WEEK.map((d) => day(d, { impressions: 100, clicks: 2 })),     // thin traffic
    day('2026-07-10', { impressions: 100, clicks: 0 }),
  ];
  check('thin-traffic CTR swing stays silent', detectAdAnomalies(rows, TODAY).every((a) => a.kind !== 'ctr_collapse'));
}

// ---- CPC spike ----
{
  const rows = [
    ...BASE_WEEK.map((d) => day(d, { spend_usd: 20, clicks: 20 })),       // $1/click baseline
    day('2026-07-10', { spend_usd: 60, clicks: 20 }),                     // $3/click
  ];
  const out = detectAdAnomalies(rows, TODAY);
  check('CPC spike detected ($1 → $3)', out.some((a) => a.kind === 'cpc_spike' && a.severity === 'watch'));
}

// ---- ordering + determinism ----
{
  const rows = [
    ...BASE_WEEK.map((d) => day(d, { campaign_name: 'A', spend_usd: 20, clicks: 20 })),
    day('2026-07-10', { campaign_name: 'A', spend_usd: 60, clicks: 20 }),               // watch (cpc)
    ...BASE_WEEK.map((d) => day(d, { campaign_name: 'B' })),
    day('2026-07-10', { campaign_name: 'B', spend_usd: 84 }),                            // alert (spike)
  ];
  const out = detectAdAnomalies(rows, TODAY);
  check('alerts sort before watches', out[0]?.severity === 'alert');
  check('deterministic: same inputs → same output', JSON.stringify(detectAdAnomalies(rows, TODAY)) === JSON.stringify(out));
}

if (failures) { throw new Error(`${failures} adsWatch verify check(s) FAILED`); }
console.log('\nAll adsWatch checks passed.');
