// src/lib/garvis/payloadHash.verify.ts — proof the approval-hash binding is deterministic and
// order-independent, so the client (enqueue) and the edge executors compute the SAME hash for the
// same payload — a mismatch means real tampering, never a stringify quirk.
// Run: npx tsx src/lib/garvis/payloadHash.verify.ts

import { stableStringify, hashPayload, payloadMatches } from '../../../supabase/functions/_shared/payloadHash';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// --- stable stringify: key order never matters -------------------------------------------------
check('object key order does not change the string',
  stableStringify({ b: 1, a: 2, c: 3 }) === stableStringify({ c: 3, a: 2, b: 1 }));
check('nested objects are sorted too',
  stableStringify({ x: { z: 1, y: 2 } }) === stableStringify({ x: { y: 2, z: 1 } }));
check('arrays keep their order (order is meaningful there)',
  stableStringify([1, 2, 3]) !== stableStringify([3, 2, 1]));
check('null/undefined normalize to null', stableStringify(null) === 'null' && stableStringify(undefined) === 'null');
check('a real send_email payload stringifies stably',
  stableStringify({ message_id: 'm1', batch_id: 'b1' }) === stableStringify({ batch_id: 'b1', message_id: 'm1' }));

// --- hashPayload: deterministic, sensitive to real change --------------------------------------
const a = await hashPayload({ message_id: 'm1', batch_id: 'b1' });
const b = await hashPayload({ batch_id: 'b1', message_id: 'm1' }); // reordered — same payload
check('same payload (any key order) → same hash', a === b);
check('hash is 64 hex chars (SHA-256)', /^[0-9a-f]{64}$/.test(a));
const c = await hashPayload({ message_id: 'm2', batch_id: 'b1' }); // different message
check('a changed field → a different hash', a !== c);
check('empty vs {} hash identically', (await hashPayload(undefined)) === (await hashPayload({})));

// --- payloadMatches: grandfathers a missing hash, catches tampering ----------------------------
check('missing stored hash → matches (grandfathered, never blocks legacy/worker approvals)',
  (await payloadMatches({ message_id: 'm1' }, null)) === true && (await payloadMatches({ message_id: 'm1' }, '')) === true);
check('correct stored hash → matches', (await payloadMatches({ message_id: 'm1', batch_id: 'b1' }, a)) === true);
check('tampered payload vs stored hash → does NOT match',
  (await payloadMatches({ message_id: 'HIJACKED', batch_id: 'b1' }, a)) === false);

console.log(`\npayloadHash.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
