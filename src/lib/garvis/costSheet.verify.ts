// Run: npx tsx src/lib/garvis/costSheet.verify.ts
import { costSheet } from './costSheet';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// The Como hat run: $6.50 blank + $3.20 embroidery, $180 setup+shipping, 48 units.
const HATS = costSheet({ blankUnitUsd: 6.5, decorationUnitUsd: 3.2, runFixedUsd: 180, units: 48, pricePointsUsd: [28, 32, 12] });
{
  check('landed cost spreads the fixed run cost across units (6.50+3.20+180/48 = 13.45)', HATS.landedUnitUsd === 13.45);
  check('the run total is the real cash outlay (9.70*48+180 = 645.60)', HATS.runTotalUsd === 645.6);
  const p28 = HATS.points.find((p) => p.priceUsd === 28)!;
  check('$28 margin is honest (28-13.45 = 14.55/unit, 52%)', p28.marginUsd === 14.55 && p28.marginPct === 52);
  check('break-even counts whole units (645.60/28 → 24 hats)', p28.breakEvenUnits === 24);
  check('a losing price point SAYS it loses, never hides it',
    HATS.reads.some((r) => r.includes('$12 LOSES $1.45 a unit')));
  check('the read speaks operator ("you clear $14.55 a unit")',
    HATS.reads.some((r) => r.includes('you clear $14.55 a unit') && r.includes('24 of 48 sold pays the whole run back')));
}
{
  const z = costSheet({ blankUnitUsd: 10, decorationUnitUsd: 0, runFixedUsd: 0, units: 0, pricePointsUsd: [20] });
  check('zero/negative units clamp to 1 — never NaN or Infinity landed', z.landedUnitUsd === 10 && z.runTotalUsd === 10);
  const dup = costSheet({ blankUnitUsd: 5, decorationUnitUsd: 1, runFixedUsd: 0, units: 10, pricePointsUsd: [20, 20, -5] });
  check('duplicate and non-positive price points are dropped', dup.points.length === 1);
  check('deterministic', JSON.stringify(HATS) === JSON.stringify(costSheet({ blankUnitUsd: 6.5, decorationUnitUsd: 3.2, runFixedUsd: 180, units: 48, pricePointsUsd: [28, 32, 12] })));
  const loser = costSheet({ blankUnitUsd: 30, decorationUnitUsd: 5, runFixedUsd: 100, units: 10, pricePointsUsd: [20] });
  check('an underwater run has Infinity break-even, stated as a loss', loser.points[0].breakEvenUnits === Infinity && loser.reads[0].includes('LOSES'));
}

console.log(`\ncostSheet.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} costSheet check(s) failed`);
