// src/lib/garvis/mlsStats.ts
// MARKET STATS FROM REAL ROWS — pure core (verified by mlsStats.verify.ts). Every number here is
// computed from synced mls_listings rows; the model narrates, never computes (house rule). Honesty:
// too few data points → null with a stated reason, never a thin number dressed as a market stat.
// The impure half is the MarketDataPanel (reads rows client-side under RLS; the sync itself lives
// in the mls-sync edge function where the feed token stays sealed).

export interface MlsRow {
  listing_key: string;
  status: string;          // RESO StandardStatus as the feed said it (Active, Closed, Pending…)
  list_price: number | null;
  close_price: number | null;
  address1: string;
  city: string;
  zip: string;
  property_type: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  list_date: string | null;   // ISO date
  close_date: string | null;  // ISO date
  dom: number | null;
}

export interface MarketStats {
  activeCount: number;
  soldLast12: number;
  medianClose: number | null;      // sold in the window
  medianDom: number | null;
  medianPricePerSqft: number | null;
  monthsOfSupply: number | null;   // active ÷ (sold last 12 ÷ 12)
  notes: string[];                 // every null explains itself here
}

const MIN_SAMPLE = 3;

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const isActive = (s: string) => s.trim().toLowerCase() === 'active';
const isClosed = (s: string) => {
  const v = s.trim().toLowerCase();
  return v === 'closed' || v === 'sold';
};

/** Compute the market picture for rows (pre-filtered by the caller — e.g. one zip), against a
 *  reference date (injected — determinism). */
export function marketStats(rows: MlsRow[], nowIso: string): MarketStats {
  const notes: string[] = [];
  const now = new Date(nowIso).getTime();
  const yearAgo = now - 365 * 86_400_000;

  const active = rows.filter((r) => isActive(r.status));
  const sold12 = rows.filter((r) =>
    isClosed(r.status) && r.close_date && new Date(r.close_date).getTime() >= yearAgo && new Date(r.close_date).getTime() <= now);

  const closes = sold12.map((r) => r.close_price).filter((n): n is number => n != null && n > 0);
  const doms = sold12.map((r) => r.dom).filter((n): n is number => n != null && n >= 0);
  const ppsf = sold12
    .filter((r) => r.close_price != null && r.close_price > 0 && r.sqft != null && r.sqft > 0)
    .map((r) => (r.close_price as number) / (r.sqft as number));

  let medianClose: number | null = null;
  if (closes.length >= MIN_SAMPLE) medianClose = median(closes);
  else notes.push(`median close price needs ≥${MIN_SAMPLE} sales with prices (have ${closes.length})`);

  let medianDom: number | null = null;
  if (doms.length >= MIN_SAMPLE) medianDom = median(doms);
  else notes.push(`median days-on-market needs ≥${MIN_SAMPLE} sales with DOM (have ${doms.length})`);

  let medianPricePerSqft: number | null = null;
  if (ppsf.length >= MIN_SAMPLE) {
    const m = median(ppsf);
    medianPricePerSqft = m == null ? null : Math.round(m * 100) / 100;
  } else notes.push(`price/sqft needs ≥${MIN_SAMPLE} sales with sqft (have ${ppsf.length})`);

  let monthsOfSupply: number | null = null;
  if (sold12.length >= MIN_SAMPLE) monthsOfSupply = Math.round((active.length / (sold12.length / 12)) * 10) / 10;
  else notes.push(`months-of-supply needs ≥${MIN_SAMPLE} sales in the last 12 months (have ${sold12.length})`);

  return { activeCount: active.length, soldLast12: sold12.length, medianClose, medianDom, medianPricePerSqft, monthsOfSupply, notes };
}

/** Sold-last-12-months count for a zip — the farm math's turnover numerator, from real rows. */
export function soldLast12ByZip(rows: MlsRow[], zip: string, nowIso: string): number {
  const z = zip.trim().slice(0, 5);
  if (!z) return 0;
  const now = new Date(nowIso).getTime();
  const yearAgo = now - 365 * 86_400_000;
  return rows.filter((r) => r.zip.startsWith(z) && isClosed(r.status) && r.close_date
    && new Date(r.close_date).getTime() >= yearAgo && new Date(r.close_date).getTime() <= now).length;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** One honest line for the panel. Nulls stay visible as "not enough data", never smoothed over. */
export function statsLine(s: MarketStats): string {
  const bits: string[] = [
    `${s.activeCount} active`,
    `${s.soldLast12} sold in 12 mo`,
    s.medianClose != null ? `median close ${usd(s.medianClose)}` : 'median close: not enough data',
    s.medianDom != null ? `median DOM ${s.medianDom}` : 'DOM: not enough data',
    s.monthsOfSupply != null ? `${s.monthsOfSupply} months of supply` : 'supply: not enough data',
  ];
  return bits.join(' · ');
}
