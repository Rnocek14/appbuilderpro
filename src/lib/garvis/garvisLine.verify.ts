// The binding contract: a phone is only trusted after its texted code round-trips, guesses
// lock, starts rate-limit, and the stored hash is useless without the server-side pepper.

import {
  CODE_TTL_MINUTES, MAX_CODE_ATTEMPTS, MAX_STARTS_PER_HOUR,
  bindingState, codeFormatOk, codeExpiryFrom, hashCode, maskPhone, nextStartCounters, startAllowed,
} from './garvisLine';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const NOW = '2026-08-15T12:00:00.000Z';
const row = (over: Record<string, unknown> = {}) => ({
  phone_e164: '+15555550100', verify_code_hash: 'h', code_expires_at: '2026-08-15T12:05:00.000Z',
  code_attempts: 0, last_start_at: null, starts_in_hour: 0, verified_at: null, proactive_enabled: false,
  ...over,
});

// --- the state machine, every transition ---
check('no row is unbound', bindingState(null, NOW) === 'unbound');
check('a live code is pending', bindingState(row(), NOW) === 'pending_code');
check('an expired code says so', bindingState(row({ code_expires_at: '2026-08-15T11:59:00.000Z' }), NOW) === 'code_expired');
check('a garbage expiry is expired, never trusted', bindingState(row({ code_expires_at: 'garbage' }), NOW) === 'code_expired');
check('max attempts locks', bindingState(row({ code_attempts: MAX_CODE_ATTEMPTS }), NOW) === 'locked');
check('verified beats everything (a lapsed later code never regresses it)',
  bindingState(row({ verified_at: '2026-08-01T00:00:00.000Z', code_expires_at: '2020-01-01T00:00:00.000Z', code_attempts: 99 }), NOW) === 'verified');
check('a row with no code and no verification is unbound', bindingState(row({ verify_code_hash: null }), NOW) === 'unbound');

// --- code format ---
check('exactly six digits pass', codeFormatOk('123456') && codeFormatOk(' 987654 '));
check('anything else fails', !codeFormatOk('12345') && !codeFormatOk('1234567') && !codeFormatOk('12a456') && !codeFormatOk('') && !codeFormatOk(null));

// --- the peppered hash ---
const [h1, h2, h3, h4] = await Promise.all([
  hashCode('123456', 'owner-a', 'pepper-x'),
  hashCode('123456', 'owner-a', 'pepper-x'),
  hashCode('123456', 'owner-a', 'pepper-y'),
  hashCode('123456', 'owner-b', 'pepper-x'),
]);
check('hashing is deterministic', h1 === h2 && /^[0-9a-f]{64}$/.test(h1));
check('the pepper changes the hash (no offline brute-force without it)', h1 !== h3);
check('the owner salts the hash (no cross-owner rainbow)', h1 !== h4);

// --- start rate limiting ---
check('a first start is allowed', startAllowed(null, 0, NOW));
check('starts inside the window count down', startAllowed('2026-08-15T11:30:00.000Z', MAX_STARTS_PER_HOUR - 1, NOW));
check('the window cap holds', !startAllowed('2026-08-15T11:30:00.000Z', MAX_STARTS_PER_HOUR, NOW));
check('an hour resets the window', startAllowed('2026-08-15T10:59:00.000Z', 99, NOW));
check('counters reset on a fresh window', nextStartCounters('2026-08-15T10:00:00.000Z', 3, NOW).starts_in_hour === 1);
check('counters increment inside the window', nextStartCounters('2026-08-15T11:30:00.000Z', 1, NOW).starts_in_hour === 2);

// --- expiry + masking ---
check('codes live exactly the stated TTL', codeExpiryFrom(NOW) === new Date(Date.parse(NOW) + CODE_TTL_MINUTES * 60_000).toISOString());
check('the mask keeps only the tail', maskPhone('+15555550100') === '…0100');

console.log(`\ngarvisLine.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} garvis line check(s) failed`);
