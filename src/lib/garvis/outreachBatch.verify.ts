// src/lib/garvis/outreachBatch.verify.ts — proof the batch core keeps its promises.
// Run: npx tsx src/lib/garvis/outreachBatch.verify.ts

import {
  composeBatchRecipients, mergeTemplate, unknownTokens, batchProgress, pickNextPending,
  staleSendingIndices,
  type BatchRecipient,
} from '../../../supabase/functions/_shared/batchCore';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// --- compose: honest reachable count -----------------------------------------
const contacts = [
  { id: '1', email: 'a@x.com', full_name: 'Ann Ames', email_status: 'active' },
  { id: '2', email: 'b@x.com', full_name: 'Bo', email_status: 'unsubscribed' },
  { id: '3', email: 'not-an-email', full_name: 'Cy', email_status: 'active' },
  { id: '4', email: null, full_name: 'Di', email_status: 'active' },
  { id: '5', email: 'A@X.com', full_name: 'Ann dupe', email_status: 'active' },
  { id: '6', email: 'e@x.com', full_name: '', email_status: 'bounced' },
  { id: '7', email: 'f@x.com', full_name: 'Fay', email_status: null },
];
const { recipients, excluded } = composeBatchRecipients(contacts);
check('only genuinely sendable contacts survive', recipients.length === 2
  && recipients[0].email === 'a@x.com' && recipients[1].email === 'f@x.com');
check('unsubscribed excluded BY NAME', excluded.some((e) => e.email === 'b@x.com' && e.reason === 'email_status unsubscribed'));
check('bounced excluded by name', excluded.some((e) => e.email === 'e@x.com' && e.reason === 'email_status bounced'));
check('invalid + blank emails excluded', excluded.some((e) => e.reason === 'no valid email' && e.email === 'not-an-email')
  && excluded.some((e) => e.email === '(blank)'));
check('case-insensitive dedupe, first wins', excluded.some((e) => e.email === 'a@x.com' && e.reason === 'duplicate address'));
check('nothing lost: recipients + excluded = input', recipients.length + excluded.length === contacts.length);
check('all start pending', recipients.every((r) => r.state === 'pending'));

// --- merge: only supported tokens, never a guessed name -----------------------
check('{{name}} and {{first_name}} merge', mergeTemplate('Hi {{first_name}} — {{name}}!', 'Ann Ames') === 'Hi Ann — Ann Ames!');
check('missing name → "there", never invented', mergeTemplate('Hi {{first_name}}', '') === 'Hi there');
check('unknown tokens are named for refusal', JSON.stringify(unknownTokens('Hi {{name}}, your {{ city }} home {{price}}')) === '["city","price"]');
check('a clean template has no unknown tokens', unknownTokens('Hi {{name}}').length === 0);
check('token with spaces inside braces still matches', mergeTemplate('{{ name }}', 'Bo') === 'Bo');
// Regression (double-check): a name with $ replacement patterns must not corrupt the body.
check('$-pattern name does not corrupt the merge', mergeTemplate('Hi {{name}}, tail', "$'") === "Hi $', tail"
  && mergeTemplate('Hi {{name}}', '$&') === 'Hi $&');
// Regression (double-check): malformed tokens are refused too, not silently sent literally.
check('malformed {{first-name}} is flagged unknown', unknownTokens('Hi {{first-name}}').includes('first-name'));
check('empty {{}} is flagged', unknownTokens('x {{}} y').includes('(empty)'));

// --- progress + drain picking ---------------------------------------------------
const recips: BatchRecipient[] = [
  { contactId: '1', email: 'a@x.com', name: 'A', state: 'sent' },
  { contactId: '2', email: 'b@x.com', name: 'B', state: 'pending' },
  { contactId: '3', email: 'c@x.com', name: 'C', state: 'skipped', reason: 'suppressed' },
  { contactId: '4', email: 'd@x.com', name: 'D', state: 'pending' },
  { contactId: '5', email: 'e@x.com', name: 'E', state: 'pending' },
];
const prog = batchProgress(recips);
check('progress counts are exact', prog.sent === 1 && prog.skipped === 1 && prog.pending === 3);
check('drain picks the next pending in order, capped', JSON.stringify(pickNextPending(recips, 2)) === '[1,3]');
check('drain of a finished batch picks nothing', pickNextPending(recips.map((r) => ({ ...r, state: 'sent' as const })), 5).length === 0);
check('deterministic', JSON.stringify(composeBatchRecipients(contacts)) === JSON.stringify(composeBatchRecipients(contacts)));

// --- idempotency: a claimed ('sending') recipient is never re-sent, stale claims are swept ----------
const claimed: BatchRecipient[] = [
  { contactId: '1', email: 'a@x.com', name: 'A', state: 'sent' },
  { contactId: '2', email: 'b@x.com', name: 'B', state: 'sending', claimedAt: new Date(1000).toISOString() },
  { contactId: '3', email: 'c@x.com', name: 'C', state: 'pending' },
];
check('a claimed (sending) recipient is NOT re-picked — never double-sent', JSON.stringify(pickNextPending(claimed, 5)) === '[2]');
const cp = batchProgress(claimed);
check('progress counts sending distinctly', cp.sending === 1 && cp.sent === 1 && cp.pending === 1 && cp.skipped === 0);
check('a stale claim (crash) is swept, a fresh claim is left alone', JSON.stringify(staleSendingIndices(claimed, 200_000, 60_000)) === '[1]'
  && staleSendingIndices([{ contactId: '9', email: 'z@x.com', name: 'Z', state: 'sending', claimedAt: new Date(190_000).toISOString() }], 200_000, 60_000).length === 0);
check('a sending recipient with no claimedAt is treated as stale (recoverable)', JSON.stringify(staleSendingIndices([{ contactId: '9', email: 'z@x.com', name: 'Z', state: 'sending' }], 200_000, 60_000)) === '[0]');

console.log(`\noutreachBatch.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
