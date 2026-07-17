// Verify the pure half of the monthly automation report. Run: npx tsx src/lib/garvis/automation/report.verify.ts
import { automationMonthLine, monthStartIso } from './reportCore';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => { console.log(ok ? '  ok ' : '  FAIL', '-', name); ok ? pass++ : fail++; };

check('quiet month is honest, not padded',
  automationMonthLine({ fires: 0, queued: 0, approved: 0, sent: 0, opened: 0 }).includes('Quiet month'));
check('active month counts every stage',
  automationMonthLine({ fires: 12, queued: 10, approved: 9, sent: 8, opened: 3 })
    === 'This month: 12 automations fired · 9/10 approved · 8 sent · 3 opened. Every send was approved by you.');
check('singular fire reads naturally',
  automationMonthLine({ fires: 1, queued: 1, approved: 0, sent: 0, opened: 0 }).includes('1 automation fired'));
check('zero opens omits the open clause',
  !automationMonthLine({ fires: 2, queued: 2, approved: 2, sent: 2, opened: 0 }).includes('opened'));
check('month start is the 1st, UTC',
  monthStartIso('2026-07-16T21:00:00Z') === '2026-07-01T00:00:00.000Z');
check('month start handles January',
  monthStartIso('2026-01-31T23:59:59Z') === '2026-01-01T00:00:00.000Z');

console.log(`report.verify: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
