// The unattended-spend contract: every edge function that calls a model both GATES the call
// (checkCredits — the app_0127 kill switch and real-dollar daily/monthly caps) and RECORDS it
// (spendCredits — the caps are computed from recorded spend, so an unrecorded call is invisible
// to them). This is the precondition the best-in-class plan pins before any creative action is
// ported into overnight loops (SW1.5 → SW6): a looping arc that burns budget while the operator
// sleeps is the named failure mode, and this suite makes the guard drift-proof.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const fnRoot = join(here, '../../../supabase/functions');

const MODEL_CALL = /await\s+(complete|completeVision|rawComplete)\(/g;

// Functions allowed to call a model with NO credit plumbing. Empty today — adding a name here
// requires a written reason, because it exempts real spend from the kill switch.
const EXEMPT: Record<string, string> = {};

const offendersGate: string[] = [];
const offendersRecord: string[] = [];
for (const entry of readdirSync(fnRoot)) {
  const file = join(fnRoot, entry, 'index.ts');
  if (!existsSync(file)) continue;
  const src = readFileSync(file, 'utf8');
  const calls = [...src.matchAll(MODEL_CALL)].length;
  if (!calls || entry in EXEMPT) continue;
  if (!src.includes('checkCredits')) offendersGate.push(entry);
  if (!src.includes('spendCredits')) offendersRecord.push(entry);
}
check('every model-calling function gates with checkCredits', offendersGate.length === 0, offendersGate.join(', '));
check('every model-calling function records with spendCredits', offendersRecord.length === 0, offendersRecord.join(', '));

// The cap machinery itself: SpendCapError must remain a subclass of InsufficientCreditsError,
// so every existing out-of-credits catch (pause, park, 402) also handles a tripped cap.
const credits = readFileSync(join(fnRoot, '_shared/credits.ts'), 'utf8');
check('SpendCapError subclasses InsufficientCreditsError',
  /class\s+SpendCapError\s+extends\s+InsufficientCreditsError/.test(credits));

// The unattended agent loop: the per-step gate must PARK the run (persist 'paused'), never
// route an out-of-credits step into the transient-retry seam where it would loop on spend.
const agentWorker = readFileSync(join(fnRoot, 'garvis-worker/index.ts'), 'utf8');
const stepGate = agentWorker.match(/await checkCredits\(db, run\.owner_id, 'garvis'\); \} catch \(e\) \{[\s\S]{0,400}?\}/);
check('agent loop gates every step', !!stepGate);
check("out-of-credits parks the run as 'paused', not a retry",
  !!stepGate && stepGate[0].includes("status: 'paused'") && !stepGate[0].includes('failOrRetry'));
// Tool-side model calls must record their own spend — the reasoning call's ledger row does not
// cover them, and unrecorded spend is invisible to the caps.
const shortScript = agentWorker.match(/case 'generate_short_script': \{[\s\S]*?\n    \}/);
check('generate_short_script records its own spend',
  !!shortScript && shortScript[0].includes('await spendCredits('));

// The standing worker's model clusters: each named gate must exist. These are the strings the
// clusters gate on today; a port that adds a new cluster extends this list in the same PR.
const standing = readFileSync(join(fnRoot, 'standing-worker/index.ts'), 'utf8');
for (const gate of [
  "checkCredits(admin, order.owner_id, 'discover')",
  "checkCredits(admin, order.owner_id, 'board_copy')",
  "checkCredits(admin, order.owner_id, 'short_script')",
  "checkCredits(admin, order.owner_id, 'image')",
  // SW6 arc-action gates (ownerId scope): the ported creative actions each gate before spending.
  "checkCredits(admin, ownerId, 'short_script')",
  "checkCredits(admin, ownerId, 'research')",
  "checkCredits(admin, ownerId, 'plan')",
]) {
  check(`standing-worker gate present: ${gate.match(/'([a-z_]+)'/)![1]}`, standing.includes(gate));
}
// A failed order skips to its next scheduled slot — it must never sit in a hot retry loop
// that would re-spend on the same tick.
check('standing-worker failures defer to the schedule, never hot-retry',
  standing.includes('Will retry on schedule.'));

console.log(`\ncreditGuard.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} credit guard check(s) failed`);
