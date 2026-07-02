// src/lib/garvis/loops.verify.ts
// Unit checks for the PURE open-loop ledger — the itch mechanics (add/dedupe/close/epiphany) that
// implement the rabbit-hole doctrine's information-gap + belief-resolution + epiphany laws.
// Run: npm run verify:loops

import { addLoopPure, closeLoopsPure, epiphanyCount, type OpenLoop } from './loops';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const L = (id: string, text: string): OpenLoop => ({ id, text, fromClusterId: 'c', createdAt: '' });

console.log('loops.verify');

// --- add + dedupe ---
{
  let loops: OpenLoop[] = [];
  loops = addLoopPure(loops, L('1', 'How do bees vote on a new home?'));
  check('adds a loop', loops.length === 1);
  loops = addLoopPure(loops, L('2', 'How do bees vote on a new home?'));
  check('exact duplicate is not stacked', loops.length === 1);
  loops = addLoopPure(loops, L('3', 'How does one queen control 50,000 bees?'));
  check('a genuinely different gap is added', loops.length === 2);
  loops = addLoopPure(loops, L('4', '   '));
  check('empty loop is ignored', loops.length === 2);
  check('newest loop is first', loops[0].id === '3');
}

// --- cap ---
{
  const topics = ['black holes', 'roman aqueducts', 'bee democracy', 'quantum tunneling', 'coral bleaching',
    'monetary history', 'dream mechanics', 'octopus cognition', 'lightning formation', 'antibiotic resistance',
    'volcanic glass', 'birdsong dialects', 'tidal locking', 'fungal networks', 'gerrymandering math',
    'perfume chemistry', 'glacier calving', 'origami engineering', 'sourdough biology', 'radio astronomy'];
  let loops: OpenLoop[] = [];
  for (const t of topics) loops = addLoopPure(loops, L(t, `the deep puzzle of ${t}`));
  check('ledger caps at 12 (itch, not backlog)', loops.length === 12);
}

// --- close (belief resolution) ---
{
  const loops = [L('1', 'How do bees vote on a new home?'), L('2', 'Is a hive more like a brain or a city?')];
  const { kept, closed } = closeLoopsPure(loops, 'How do bees vote?');
  check('chasing a matching question closes its loop', closed.length === 1 && closed[0].id === '1');
  check('unrelated loop stays open', kept.length === 1 && kept[0].id === '2');
  const none = closeLoopsPure(loops, 'Completely unrelated topic like tax law');
  check('an unrelated dive closes nothing', none.closed.length === 0 && none.kept.length === 2);
}

// --- epiphany count (the strongest lure) ---
{
  const loops = [
    L('1', 'How do bees coordinate without a leader?'),
    L('2', 'How do ant colonies coordinate without a leader?'),
    L('3', 'What is the history of money?'),
  ];
  check('a current touching 2 loops → epiphany (≥2)', epiphanyCount('coordinate without a leader', loops) >= 2);
  check('a current touching 1 loop is not an epiphany', epiphanyCount('the history of money', loops) === 1);
  check('a current touching nothing → 0', epiphanyCount('bioluminescence in the deep sea', loops) === 0);
}

console.log(`\nloops.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} loops check(s) failed`);
