// The quality bar's contract: 8 is law, "not proven" never passes, and no consumer carries its
// own private copy of the threshold.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY_BAR, holdsBar } from './quality';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

check('the bar is 8 — changing it is a deliberate act that edits this suite too', QUALITY_BAR === 8);
check('scores at the bar hold', holdsBar(8));
check('scores above the bar hold', holdsBar(9) && holdsBar(10));
check('scores below the bar fail', !holdsBar(7) && !holdsBar(0) && !holdsBar(7.9));
check('a missing score is not a pass (null)', !holdsBar(null));
check('a missing score is not a pass (undefined)', !holdsBar(undefined));
check('an unparseable score is not a pass (NaN)', !holdsBar(Number.NaN));
check('infinities are not a pass', !holdsBar(Number.POSITIVE_INFINITY) && !holdsBar(Number.NEGATIVE_INFINITY));

const here = dirname(fileURLToPath(import.meta.url));
const boardCopy = readFileSync(join(here, '../../../supabase/functions/board-copy/index.ts'), 'utf8');
check('board-copy imports the shared bar', boardCopy.includes("from '../_shared/qualityCore.ts'"));
check('board-copy carries no private threshold literal', !/score\s*[<>]=?\s*8\b/.test(boardCopy));
check('board-copy records quality events', boardCopy.includes('copy_quality_events'));

console.log(`\nquality.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} quality check(s) failed`);
