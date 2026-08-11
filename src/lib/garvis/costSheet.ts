// src/lib/garvis/costSheet.ts
// REAL-DOLLAR unit economics — pure core (verified by costSheet.verify.ts). Costs belong on
// DECISIONS, not dashboards: this computes a merch run's honest numbers from figures the
// operator (or research) supplies — never invented prices. Same inputs, same sheet. The verdict
// lines speak operator ("you'd clear $9.10 a hat at $28") so a produce-or-don't decision reads
// in one glance, Queue-card style.

export interface CostInputs {
  /** What one blank costs from the vendor (USD). */
  blankUnitUsd: number;
  /** Decoration per unit — embroidery/print (USD). */
  decorationUnitUsd: number;
  /** Inbound shipping/setup for the WHOLE run (USD) — spread across units. */
  runFixedUsd: number;
  /** Units in the run (the vendor's minimum or the chosen quantity). */
  units: number;
  /** Candidate retail price points to evaluate (USD). */
  pricePointsUsd: number[];
}

export interface PricePointVerdict {
  priceUsd: number;
  marginUsd: number;      // per unit, after landed cost
  marginPct: number;      // 0-100, of the price
  breakEvenUnits: number; // units to sell to cover the run's total outlay
}

export interface CostSheet {
  landedUnitUsd: number;  // blank + decoration + spread fixed
  runTotalUsd: number;    // full cash outlay for the run
  points: PricePointVerdict[];
  /** One-line operator reads, best price first — the decision in plain words. */
  reads: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function costSheet(inp: CostInputs): CostSheet {
  const units = Math.max(1, Math.floor(inp.units));
  const blank = Math.max(0, inp.blankUnitUsd);
  const deco = Math.max(0, inp.decorationUnitUsd);
  const fixed = Math.max(0, inp.runFixedUsd);
  const landed = r2(blank + deco + fixed / units);
  const runTotal = r2((blank + deco) * units + fixed);

  const points: PricePointVerdict[] = [...new Set(inp.pricePointsUsd.filter((p) => p > 0).map(r2))]
    .sort((a, b) => a - b)
    .map((price) => {
      const margin = r2(price - landed);
      return {
        priceUsd: price,
        marginUsd: margin,
        marginPct: Math.round((margin / price) * 100),
        breakEvenUnits: margin > 0 ? Math.ceil(runTotal / price) : Infinity,
      };
    });

  const reads = points.map((p) =>
    p.marginUsd <= 0
      ? `$${p.priceUsd} LOSES $${Math.abs(p.marginUsd).toFixed(2)} a unit — landed cost is $${landed.toFixed(2)}`
      : `$${p.priceUsd}: you clear $${p.marginUsd.toFixed(2)} a unit (${p.marginPct}%) — ${p.breakEvenUnits} of ${units} sold pays the whole run back`);

  return { landedUnitUsd: landed, runTotalUsd: runTotal, points, reads };
}
