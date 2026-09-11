// scripts/reviewGateRun.ts — impure shell around reviewGate.ts. REPORT MODE by default: it
// prints what the gate would do and exits 0 no matter what. Usage:
//   npx tsx scripts/reviewGateRun.ts <path-to-review-comment-or-findings-json>
// The file may be a whole PR comment (the LAST ```json fenced block is taken as the findings)
// or bare JSON. Enforcement (exit 1 on a failing verdict) requires REVIEW_GATE_ENFORCE=1 — and
// that flip is governed by the pre-registered criteria in docs/reviews/ai-review-ledger.md
// (>= 4 weeks of ledger, >= 60% high-severity precision), never by convenience.
import { readFileSync } from 'node:fs';
import { gateVerdict } from './reviewGate';

const path = process.argv[2];
if (!path) {
  console.log('Review gate (advisory): PASS — no input file, nothing to gate.');
  process.exit(0);
}
let text = '';
try {
  text = readFileSync(path, 'utf8');
} catch {
  console.log('Review gate (advisory): PASS — input unreadable, safe-open (a broken reviewer never blocks).');
  process.exit(0);
}
const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
const raw = blocks.length ? blocks[blocks.length - 1]![1]! : text;
const v = gateVerdict(raw);
console.log(`Review gate (advisory): ${v.pass ? 'PASS' : 'WOULD FAIL'} — ${v.reason}`);
for (const f of v.blocking) console.log(`  - ${f.file}: ${f.summary ?? '(no summary)'}`);
if (!v.pass && process.env.REVIEW_GATE_ENFORCE === '1') process.exit(1);
