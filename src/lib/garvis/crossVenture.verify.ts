// Run: npx tsx src/lib/garvis/crossVenture.verify.ts
// The cross-venture contract (SW10.11): no recommendation below sample on EITHER side, a
// single-world portfolio produces nothing, the seeded two-world case yields EXACTLY ONE move
// carrying BOTH worlds' numbers — and social is now a real ChannelIn in the measured world.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossVentureMove, type VentureIn } from './crossVenture';
import { MIN_SAMPLE, ACT_RESPONSES, type ChannelIn } from './adaptive';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const ch = (name: string, out: number, responses: number, instrumented = true): ChannelIn =>
  ({ name, out, outLabel: 'sends', responses, responseLabel: 'replies', spendUsd: null, instrumented });
const venture = (id: string, title: string, channels: ChannelIn[]): VentureIn =>
  ({ worldId: id, worldTitle: title, channels });

// ---- the seeded two-world acceptance case ----
{
  const move = crossVentureMove([
    venture('a', 'Bakery', [ch('email', 40, 5)]),               // proven: 40 → 5 (12.5%)
    venture('b', 'Realty', [ch('email', 25, 0)]),               // silent at real volume
  ]);
  check('the seeded two-world case yields exactly one move', move !== null);
  check('the move carries BOTH worlds\' numbers',
    !!move && move.evidence.includes('Bakery email: 40 sends → 5 replies (12.5%)')
    && move.evidence.includes('Realty: 25 sends → 0 replies'));
  check('the move is measured by construction and points at the silent world',
    move?.basis === 'measured' && move?.toWorldId === 'b' && move?.fromWorldId === 'a');
}

// ---- sample discipline on BOTH sides (inherited, never re-derived) ----
check('no move when the working side is below MIN_SAMPLE',
  crossVentureMove([
    venture('a', 'A', [ch('email', MIN_SAMPLE - 1, 5)]),
    venture('b', 'B', [ch('email', 25, 0)]),
  ]) === null);
check('no move when the working side has fewer than ACT_RESPONSES (a transfer is an act-grade claim)',
  crossVentureMove([
    venture('a', 'A', [ch('email', 40, ACT_RESPONSES - 1)]),
    venture('b', 'B', [ch('email', 25, 0)]),
  ]) === null);
check('no move when the silent side is below sample (silence below sample is "too early", not evidence)',
  crossVentureMove([
    venture('a', 'A', [ch('email', 40, 5)]),
    venture('b', 'B', [ch('email', MIN_SAMPLE - 1, 0)]),
  ]) === null);
check('an ABSENT channel (never run) is a valid target',
  crossVentureMove([
    venture('a', 'A', [ch('email', 40, 5)]),
    venture('b', 'B', []),
  ])?.evidence.includes('has never run it') === true);
check('an uninstrumented silent channel is NOT evidence of silence',
  crossVentureMove([
    venture('a', 'A', [ch('email', 40, 5)]),
    venture('b', 'B', [ch('email', 25, 0, false)]),
  ]) === null);
check('a working target is never told to run what it already runs',
  crossVentureMove([
    venture('a', 'A', [ch('email', 40, 5)]),
    venture('b', 'B', [ch('email', 30, 4)]),
  ]) === null);

// ---- portfolio shape ----
check('a single-world portfolio produces nothing', crossVentureMove([venture('a', 'A', [ch('email', 40, 5)])]) === null);
check('an empty portfolio produces nothing', crossVentureMove([]) === null);
{
  // Two candidate transfers → exactly ONE move, the strongest rate deterministically.
  const move = crossVentureMove([
    venture('a', 'A', [ch('email', 40, 4), ch('social', 20, 6)]),  // social 30% beats email 10%
    venture('b', 'B', [ch('email', 25, 0), ch('social', 15, 0)]),
  ]);
  check('multiple candidates still yield EXACTLY ONE move — the strongest rate',
    move?.channel === 'social');
  check('determinism: same rows, same answer',
    JSON.stringify(move) === JSON.stringify(crossVentureMove([
      venture('a', 'A', [ch('email', 40, 4), ch('social', 20, 6)]),
      venture('b', 'B', [ch('email', 25, 0), ch('social', 15, 0)]),
    ])));
}

// ---- wiring pins ----
const here = dirname(fileURLToPath(import.meta.url));
const adaptiveRun = readFileSync(join(here, 'adaptiveRun.ts'), 'utf8');
const resultsRun = readFileSync(join(here, 'resultsRun.ts'), 'utf8');
const cvRun = readFileSync(join(here, 'crossVentureRun.ts'), 'utf8');
const nextMove = readFileSync(join(here, 'nextMove.ts'), 'utf8');
const nextMoveRun = readFileSync(join(here, 'nextMoveRun.ts'), 'utf8');
{
  check('social is a real ChannelIn in the measured world',
    adaptiveRun.includes("name: 'social'") && adaptiveRun.includes("outLabel: 'posts'"));
  check('social is instrumented ONLY when metrics really synced',
    adaptiveRun.includes('instrumented: results.social?.synced ?? false'));
  check('social results count posted rows and SYNCED engagement, never a fake zero',
    resultsRun.includes("eq('status', 'posted')") && resultsRun.includes('synced: metricRows.length > 0'));
  check('the transfer engine reads the SAME channel substrate as the adaptive read',
    cvRun.includes('assembleChannels(w.id)') && adaptiveRun.includes('export async function assembleChannels'));
  check('a single-world portfolio short-circuits before any assembly',
    cvRun.includes('worlds.length < 2'));
  check('the move surfaces as the existing measured_recommendation kind, at most one',
    nextMove.includes("kind: 'measured_recommendation' as const") && nextMove.includes('if (!move) return [];'));
  check('the waking moment wires it in, fail-soft',
    nextMoveRun.includes('loadCrossVentureMove()') && nextMoveRun.includes('collectCrossVenture(transferMove'));
}

console.log(`\ncrossVenture.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} cross-venture check(s) failed`);
