// Run: npx tsx src/lib/garvis/missedCall.verify.ts
import {
  dialWasMissed, escapeXml, buildInboundTwiml, buildHangupTwiml, isE164, textBackTarget,
  renderMissedCallSms, twilioSignatureBaseString, DEFAULT_MISSED_CALL_TEMPLATE, MISSED_DIAL_STATUSES,
} from './missedCall';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('missedCall.verify');

// ── missed-status decision ─────────────────────────────────────────────────
check('no-answer / busy / failed / canceled all count as missed', MISSED_DIAL_STATUSES.every((s) => dialWasMissed(s)));
check('a connected call (completed) is NOT missed', !dialWasMissed('completed'));
check('an answered call is NOT missed', !dialWasMissed('answered'));
check('case + whitespace tolerant', dialWasMissed('  No-Answer ') === true);
check('unknown/blank status is NOT missed (no stray text on a malformed callback)', !dialWasMissed('') && !dialWasMissed(null) && !dialWasMissed('weird'));

// ── E.164 validity ─────────────────────────────────────────────────────────
check('valid E.164 accepted', isE164('+15551234567'));
check('non-E.164 rejected', !isE164('5551234567') && !isE164('+1') && !isE164('') && !isE164(null));

// ── who to text ────────────────────────────────────────────────────────────
check('disabled config → never text', textBackTarget({ enabled: false, twilioNumber: '+15550000000' }, '+15551234567') === null);
check('enabled + valid caller → returns the caller number', textBackTarget({ enabled: true, twilioNumber: '+15550000000' }, '+15551234567') === '+15551234567');
check('non-E.164 caller → null', textBackTarget({ enabled: true, twilioNumber: '+15550000000' }, 'anonymous') === null);
check('loop guard: never text our own Twilio number', textBackTarget({ enabled: true, twilioNumber: '+15550000000' }, '+15550000000') === null);

// ── TwiML ──────────────────────────────────────────────────────────────────
const twiml = buildInboundTwiml({ forwardTo: '+15559998888', ringSeconds: 25, actionUrl: 'https://x.co/voice-inbound?stage=status&a=1' });
check('inbound TwiML dials the forward number', twiml.includes('<Number>+15559998888</Number>'));
check('inbound TwiML carries the ring timeout', twiml.includes('timeout="25"'));
check('inbound TwiML escapes the action URL (& → &amp;)', twiml.includes('stage=status&amp;a=1') && !twiml.includes('stage=status&a=1'));
check('inbound TwiML sets the dial action callback', twiml.includes('action="https://x.co/voice-inbound?stage=status&amp;a=1"'));
check('bad ringSeconds falls back to 20', buildInboundTwiml({ forwardTo: '+15551112222', ringSeconds: 0, actionUrl: 'https://x.co/s' }).includes('timeout="20"'));
check('hangup TwiML is a valid empty response', buildHangupTwiml().includes('<Hangup/>'));
check('escapeXml handles all five metachars', escapeXml(`<a href="x" y='z'>&`) === '&lt;a href=&quot;x&quot; y=&apos;z&apos;&gt;&amp;');

// ── template render ────────────────────────────────────────────────────────
check('template {business} substitutes', renderMissedCallSms('Thanks for calling {business}!', { business: "Joe's Plumbing" }) === "Thanks for calling Joe's Plumbing!");
check('template unknown token stripped (no literal {foo})', !renderMissedCallSms('Hi {foo} there', {}).includes('{foo}'));
check('default template is non-empty and asks them to reply', DEFAULT_MISSED_CALL_TEMPLATE.length > 0 && /reply/i.test(DEFAULT_MISSED_CALL_TEMPLATE));
check('default template leaves no awkward gap with no business name', !/\s{2,}/.test(renderMissedCallSms(DEFAULT_MISSED_CALL_TEMPLATE, {})));

// ── Twilio signature base string ────────────────────────────────────────────
// Twilio's documented example construction: URL + params sorted by key, concatenated key+value.
const base = twilioSignatureBaseString('https://mycompany.com/myapp.php?foo=1', { CallSid: 'CA123', Caller: '+12349013030', Digits: '1234' });
check('signature base starts with the full URL', base.startsWith('https://mycompany.com/myapp.php?foo=1'));
check('signature base appends params sorted by key, key+value', base === 'https://mycompany.com/myapp.php?foo=1CallSidCA123Caller+12349013030Digits1234');
check('signature base is stable regardless of input key order', base === twilioSignatureBaseString('https://mycompany.com/myapp.php?foo=1', { Digits: '1234', Caller: '+12349013030', CallSid: 'CA123' }));
check('signature base with no params is just the URL', twilioSignatureBaseString('https://x.co/a', {}) === 'https://x.co/a');

console.log(`\nmissedCall.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} missedCall check(s) failed`);
