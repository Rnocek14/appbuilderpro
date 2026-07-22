// Run: npx tsx src/lib/garvis/sms.verify.ts
import { toE164, smsSegments, renderSms, smsConsentOk, validSmsBody, optOutKeyword } from './sms';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('sms.verify');

// ── E.164 ────────────────────────────────────────────────────────────────
check('10-digit US → +1…', toE164('(916) 555-0142') === '+19165550142');
check('11-digit leading 1 → +1…', toE164('1-916-555-0142') === '+19165550142');
check('already +E.164 preserved', toE164('+447911123456') === '+447911123456');
check('too short → null', toE164('555-0142') === null);
check('empty/garbage → null', toE164('') === null && toE164('abc') === null && toE164(null) === null);
check('9 digits without + → null (not a valid US number)', toE164('916555014') === null);

// ── segments ─────────────────────────────────────────────────────────────
check('short ASCII → 1 segment', smsSegments('Thanks, we got your request!') === 1);
check('161 ASCII chars → 2 segments', smsSegments('a'.repeat(161)) === 2);
check('emoji forces UCS-2 (≤70 = 1)', smsSegments('Thanks 🙏') === 1);
check('71 unicode chars → 2 segments', smsSegments('é'.repeat(71)) === 2);
check('empty → 0', smsSegments('') === 0);

// ── render ───────────────────────────────────────────────────────────────
check('fills first_name + link', renderSms('Hi {first_name}, mind leaving a review? {link}', { first_name: 'Dana', link: 'https://g.co/x' }) === 'Hi Dana, mind leaving a review? https://g.co/x');
check('unknown token stripped, no literal {foo}', renderSms('Hi {first_name}{unknown}', { first_name: 'Sam' }) === 'Hi Sam');
check('collapses runs of spaces', renderSms('a    b', {}) === 'a b');

// ── consent (TCPA) ──────────────────────────────────────────────────────────
check('express written OK for marketing', smsConsentOk('express_written', 'marketing') === true);
check('warm_transactional OK for transactional only', smsConsentOk('warm_transactional', 'transactional') === true && smsConsentOk('warm_transactional', 'marketing') === false);
check('none / absent never OK (fail closed)', smsConsentOk('none', 'transactional') === false && smsConsentOk(null, 'transactional') === false && smsConsentOk(undefined, 'marketing') === false);

// ── body validity ─────────────────────────────────────────────────────────
check('non-empty within 1600 is valid', validSmsBody('hello') === true);
check('empty / over-limit invalid', validSmsBody('') === false && validSmsBody('   ') === false && validSmsBody('x'.repeat(1601)) === false);

// ── opt-out keywords ──────────────────────────────────────────────────────
check('STOP variants detected', optOutKeyword('STOP') === 'stop' && optOutKeyword('unsubscribe please') === 'stop' && optOutKeyword('Cancel') === 'stop');
check('START/YES detected', optOutKeyword('start') === 'start' && optOutKeyword('YES') === 'start');
check('normal reply → null', optOutKeyword('sounds good, thanks') === null && optOutKeyword('') === null);

console.log(`\nsms.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} sms check(s) failed`);
