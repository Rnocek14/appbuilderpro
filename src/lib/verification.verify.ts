// The verification-state contract: one honest ending per build, frozen names, and "clean" is a
// word only the real compiler may award.

import { verificationFromGate, verificationLabel, verificationNote, isCompilerVerified } from './verification';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

// State mapping — every gate outcome has exactly one ending.
check('a clean compiler run is compiled', verificationFromGate({ ran: true, errors: 0, reason: null }).level === 'compiled');
check('errors mean compile_failed with the count carried', (() => {
  const v = verificationFromGate({ ran: true, errors: 3, reason: null });
  return v.level === 'compile_failed' && v.errors === 3;
})());
check('a not-ran gate is static_only with its reason carried', (() => {
  const v = verificationFromGate({ ran: false, errors: 0, reason: 'this tab lacks cross-origin isolation — open the Full-runtime preview to compile-verify' });
  return v.level === 'static_only' && v.reason.includes('cross-origin isolation');
})());
check('a reasonless not-ran still names a reason', (() => {
  const v = verificationFromGate({ ran: false, errors: 0, reason: null });
  return v.level === 'static_only' && v.reason.length > 10;
})());
check('a skipped gate is unverified, never a silent pass', verificationFromGate(null).level === 'unverified');

// The frozen labels — chat, stage notes, and records all render these strings.
check('compiled label is frozen', verificationLabel({ level: 'compiled' }) === 'verified — compiles clean');
check('compile_failed label carries the count', verificationLabel({ level: 'compile_failed', errors: 2 }) === 'compile failed — 2 type error(s)');
check('static_only label is frozen', verificationLabel({ level: 'static_only', reason: 'x' }) === 'static checks only');
check('unverified label is frozen', verificationLabel({ level: 'unverified', reason: 'x' }) === 'unverified');

// The honesty rule: "clean"/"Verified" belong to the compiler alone.
check('only compiled presents as compiler-verified',
  isCompilerVerified({ level: 'compiled' })
  && !isCompilerVerified({ level: 'static_only', reason: 'r' })
  && !isCompilerVerified({ level: 'compile_failed', errors: 1 })
  && !isCompilerVerified({ level: 'unverified', reason: 'r' }));
check('static_only note names the reason and admits the gap', (() => {
  const n = verificationNote({ level: 'static_only', reason: 'the preview is still booting — verification will catch up' });
  return n.startsWith('Static checks only') && n.includes('has not verified');
})());
check('static_only note never says clean', !verificationNote({ level: 'static_only', reason: 'r' }).toLowerCase().includes('clean'));
check('unverified note admits it plainly', verificationNote({ level: 'unverified', reason: 'the compile gate did not run' }).startsWith('Unverified'));
check('compile_failed note names the next step', verificationNote({ level: 'compile_failed', errors: 1 }).includes('Fix with AI'));

console.log(`\nverification.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} verification check(s) failed`);
