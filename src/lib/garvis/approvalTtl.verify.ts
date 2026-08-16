// The decision clock's contract: per-kind TTLs, a default for the unlisted, exact stamp math,
// and a countdown that never invents a clock or claims an expiry nothing enforces yet.

import { DEFAULT_TTL_DAYS, TTL_DAYS, ttlDaysFor, expiresAtFor, expiryCountdown, reminderDue } from './approvalTtl';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

check('money intent goes stale fastest', TTL_DAYS['spend'] === 3 && TTL_DAYS['spend'] < DEFAULT_TTL_DAYS);
check('deploys and signatures get the long window', ttlDaysFor('deploy_site') === 14 && ttlDaysFor('send_for_signature') === 14);
check('an unlisted kind falls back to the default', ttlDaysFor('some_future_kind') === DEFAULT_TTL_DAYS);

const now = '2026-08-14T12:00:00.000Z';
check('the stamp is exact TTL days from now', expiresAtFor('send_email', now) === '2026-08-21T12:00:00.000Z');
check('spend stamps three days out', expiresAtFor('spend', now) === '2026-08-17T12:00:00.000Z');
let threw = false;
try { expiresAtFor('send_email', 'not a timestamp'); } catch { threw = true; }
check('a garbage timestamp throws — never a silently unstamped row', threw);

check('no stamp means no invented clock', expiryCountdown(null, now) === null && expiryCountdown(undefined, now) === null);
check('overdue says past-its-window, never "expired" (nothing expires it yet)',
  expiryCountdown('2026-08-14T11:00:00.000Z', now) === 'past its window');
check('under 48h counts hours', expiryCountdown('2026-08-15T12:00:00.000Z', now) === 'decide within 24h');
check('beyond 48h counts days', expiryCountdown('2026-08-21T12:00:00.000Z', now) === 'decide within 7d');
check('garbage rows render no clock', expiryCountdown('garbage', now) === null);

// --- the half-life nudge (SW5.1) ---
check('due exactly at the midpoint, not before', (() => {
  const c = '2026-08-14T12:00:00.000Z', e = '2026-08-14T12:10:00.000Z';
  return !reminderDue(c, e, null, '2026-08-14T12:04:59.000Z') && reminderDue(c, e, null, '2026-08-14T12:05:00.000Z');
})());
check('one nudge ever — a reminded row never nags again', !reminderDue('2026-08-14T12:00:00.000Z', '2026-08-14T12:10:00.000Z', '2026-08-14T12:05:00.000Z', '2026-08-14T12:09:00.000Z'));
check('rows without a window never nag', !reminderDue('2026-08-14T12:00:00.000Z', null, null, now));
check('garbage timestamps never nag', !reminderDue('garbage', '2026-08-14T12:10:00.000Z', null, now));

console.log(`\napprovalTtl.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} approval TTL check(s) failed`);
