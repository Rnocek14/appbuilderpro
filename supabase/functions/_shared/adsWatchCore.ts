// supabase/functions/_shared/adsWatchCore.ts
// THE AD WATCHDOG CORE — pure, dependency-free (no Deno APIs, no imports), so the SAME
// implementation runs in the ads-watch edge function AND under the client verify suite
// (src/lib/garvis/adsWatch.verify.ts imports this file directly). One implementation, verified.
//
// Detects overnight ad-account anomalies from the read-only ad_metrics rows, judging YESTERDAY
// against a 7-day baseline (the day before yesterday backward). Honesty rules match adaptive.ts:
//   - MIN-SAMPLE GATED: no verdict without enough baseline days / impressions / clicks — thin
//     data produces NOTHING, never a guess.
//   - "Today" is never judged (partial data would fake anomalies).
//   - Every finding carries its arithmetic in the evidence string — measured, not vibes.
//   - Detection only. Nothing here (or in ads-watch) mutates a campaign; alerts tell the owner
//     what the numbers did and where to look.

export interface AdDayRow {
  provider: string;        // 'meta_ads' | 'google_ads'
  campaign_name: string;
  date: string;            // YYYY-MM-DD
  spend_usd: number;
  impressions: number;
  clicks: number;
}

export interface AdAnomaly {
  key: string;             // stable identity for dedupe: provider:campaign:kind:date
  provider: string;
  campaign: string;
  kind: 'spend_spike' | 'spend_stopped' | 'ctr_collapse' | 'cpc_spike';
  severity: 'alert' | 'watch';   // alert = money is moving wrong NOW; watch = performance drift
  headline: string;        // one line for the push notification
  evidence: string;        // the arithmetic: baseline vs yesterday
}

// Gates — a verdict requires real sample, in the adaptive.ts tradition.
const MIN_BASELINE_DAYS = 4;        // at least 4 of the 7 baseline days must have data
const SPIKE_FACTOR = 2.5;           // yesterday ≥ 2.5× the baseline daily average…
const SPIKE_MIN_DELTA_USD = 10;     // …and at least $10 above it (no $0.40 → $1.20 drama)
const STOPPED_MIN_AVG_USD = 5;      // "stopped" only matters if it was really spending
const CTR_MIN_BASE_IMPR = 2_000;    // CTR judged only on real traffic
const CTR_MIN_DAY_IMPR = 500;
const CTR_MIN_BASE = 0.005;         // baseline CTR ≥ 0.5% (below that, collapse is noise)
const CTR_COLLAPSE_RATIO = 0.4;     // yesterday's CTR < 40% of baseline
const CPC_MIN_BASE_CLICKS = 50;
const CPC_MIN_DAY_CLICKS = 15;
const CPC_SPIKE_FACTOR = 2;
const CPC_MIN_DELTA_USD = 0.5;

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Judge yesterday (relative to `todayIso`, UTC) against the prior 7 days, per campaign. */
export function detectAdAnomalies(rows: AdDayRow[], todayIso: string): AdAnomaly[] {
  const yesterday = addDays(todayIso, -1);
  const baseStart = addDays(todayIso, -8);   // 7 baseline days: today-8 … today-2
  const baseEnd = addDays(todayIso, -2);

  // Group by provider+campaign.
  const groups = new Map<string, AdDayRow[]>();
  for (const r of rows) {
    if (!r.date || r.date > yesterday || r.date < baseStart) continue;
    const k = `${r.provider}::${r.campaign_name}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }

  const out: AdAnomaly[] = [];
  for (const [k, g] of groups) {
    const [provider, campaign] = k.split('::');
    const base = g.filter((r) => r.date >= baseStart && r.date <= baseEnd);
    const yRows = g.filter((r) => r.date === yesterday);
    if (base.length < MIN_BASELINE_DAYS) continue;              // not enough history — no verdict
    const y = yRows.reduce(
      (a, r) => ({ spend: a.spend + r.spend_usd, impr: a.impr + r.impressions, clicks: a.clicks + r.clicks }),
      { spend: 0, impr: 0, clicks: 0 },
    );
    const b = base.reduce(
      (a, r) => ({ spend: a.spend + r.spend_usd, impr: a.impr + r.impressions, clicks: a.clicks + r.clicks }),
      { spend: 0, impr: 0, clicks: 0 },
    );
    const avgSpend = b.spend / base.length;
    const mk = (kind: AdAnomaly['kind'], severity: AdAnomaly['severity'], headline: string, evidence: string) =>
      out.push({ key: `${provider}:${campaign}:${kind}:${yesterday}`, provider, campaign, kind, severity, headline, evidence });

    // 1) Spend spike — money is leaving faster than the trailing week says it should.
    if (y.spend >= avgSpend * SPIKE_FACTOR && y.spend - avgSpend >= SPIKE_MIN_DELTA_USD) {
      mk('spend_spike', 'alert',
        `“${campaign}” spent ${usd(y.spend)} yesterday — ${(y.spend / Math.max(avgSpend, 0.01)).toFixed(1)}× its daily average`,
        `${usd(y.spend)} on ${yesterday} vs ${usd(avgSpend)}/day across the prior ${base.length} recorded days. Check budget/bid changes in Ads Manager.`);
    }

    // 2) Spend stopped — a consistently spending campaign went to zero (paused, disapproved,
    //    or billing failed). Only fires when yesterday HAS a row (a $0 report is a fact; a
    //    missing report is just late data — never treated as zero).
    if (yRows.length > 0 && y.spend === 0 && avgSpend >= STOPPED_MIN_AVG_USD) {
      mk('spend_stopped', 'alert',
        `“${campaign}” spent $0 yesterday after averaging ${usd(avgSpend)}/day`,
        `${usd(avgSpend)}/day across ${base.length} recorded days → $0 on ${yesterday}. Possible causes: paused, disapproved ad, or a billing failure.`);
    }

    // 3) CTR collapse — traffic keeps flowing but clicks fell off a cliff (creative fatigue or
    //    broken tracking). Judged only with real impressions on both sides.
    const baseCtr = b.impr > 0 ? b.clicks / b.impr : 0;
    const yCtr = y.impr > 0 ? y.clicks / y.impr : 0;
    if (b.impr >= CTR_MIN_BASE_IMPR && y.impr >= CTR_MIN_DAY_IMPR && baseCtr >= CTR_MIN_BASE && yCtr < baseCtr * CTR_COLLAPSE_RATIO) {
      mk('ctr_collapse', 'watch',
        `“${campaign}” click-through collapsed to ${pct(yCtr)} (baseline ${pct(baseCtr)})`,
        `${y.clicks} clicks on ${y.impr} impressions yesterday vs ${b.clicks}/${b.impr} across the baseline. Creative fatigue or broken landing/tracking are the usual suspects.`);
    }

    // 4) CPC spike — each click suddenly costs a lot more.
    const baseCpc = b.clicks > 0 ? b.spend / b.clicks : 0;
    const yCpc = y.clicks > 0 ? y.spend / y.clicks : 0;
    if (b.clicks >= CPC_MIN_BASE_CLICKS && y.clicks >= CPC_MIN_DAY_CLICKS && baseCpc > 0
      && yCpc >= baseCpc * CPC_SPIKE_FACTOR && yCpc - baseCpc >= CPC_MIN_DELTA_USD) {
      mk('cpc_spike', 'watch',
        `“${campaign}” cost-per-click jumped to ${usd(yCpc)} (baseline ${usd(baseCpc)})`,
        `${usd(y.spend)} for ${y.clicks} clicks yesterday vs ${usd(baseCpc)}/click across the baseline. Rising auction pressure or a targeting change.`);
    }
  }

  // Alerts first (money now), then watches; stable within severity by campaign name.
  return out.sort((a, z) => (a.severity === z.severity ? a.campaign.localeCompare(z.campaign) : a.severity === 'alert' ? -1 : 1));
}
