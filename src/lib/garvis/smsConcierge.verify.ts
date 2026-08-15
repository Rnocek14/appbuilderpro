// The texting contract, pinned: a text can READ and nothing else — every non-reply Command
// kind degrades to a sentence, the webhook quarantines before the brain and stamps provenance,
// STOP beats everything, and the reply rate throttles Garvis, never the operator.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from './commander';
import {
  MAX_REPLIES_PER_HOUR, OUT_OF_CREDITS_REPLY, SMS_REPLY_CAP,
  nextReplyCounters, replyAllowed, smsAnswerFor,
} from './smsConcierge';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

// --- the read-only gate, total over every kind ---
const WORKY: Command[] = [
  { kind: 'mission', preface: 'p', objective: 'grow the pottery studio', subject: 's', app: null },
  { kind: 'act', preface: 'p', instruction: 'draft an invoice for Jane' },
  { kind: 'build', preface: 'p', prompt: 'a booking app' },
  { kind: 'open', preface: 'p', surface: 'mailer', world: null },
  { kind: 'explore', preface: 'p', query: 'competitor pricing' },
];
check('a reply answers directly', smsAnswerFor({ kind: 'reply', text: 'Revenue is $4,200 this month.' }).includes('$4,200'));
check('every work-shaped kind degrades to a sentence + open-the-app',
  WORKY.every((c) => smsAnswerFor(c).includes('open the app')),
  WORKY.map((c) => c.kind).join(','));
check('degraded answers still NAME the work (the operator learns what a tap would do)',
  smsAnswerFor(WORKY[0]).includes('pottery') && smsAnswerFor(WORKY[1]).includes('invoice'));
check('nothing in the gate can execute — it returns text and only text',
  WORKY.every((c) => typeof smsAnswerFor(c) === 'string'));
check('answers respect the SMS cap', smsAnswerFor({ kind: 'reply', text: 'x'.repeat(5_000) }).length <= SMS_REPLY_CAP);
check('an empty reply still says something honest', smsAnswerFor({ kind: 'reply', text: '  ' }).length > 0);

// --- reply throttling (Garvis throttles itself, never the human) ---
const NOW = '2026-08-15T12:00:00.000Z';
check('a first reply is allowed', replyAllowed(null, 0, NOW));
check('the hourly cap holds', !replyAllowed('2026-08-15T11:30:00.000Z', MAX_REPLIES_PER_HOUR, NOW));
check('an hour resets the window', replyAllowed('2026-08-15T10:59:00.000Z', 99, NOW));
check('counters reset and increment correctly',
  nextReplyCounters('2026-08-15T10:00:00.000Z', 9, NOW).replies_in_hour === 1
  && nextReplyCounters('2026-08-15T11:50:00.000Z', 1, NOW).replies_in_hour === 2);

// --- the credit floor is fixed wording, zero model ---
check('the out-of-credits floor names the fix', OUT_OF_CREDITS_REPLY.includes('Subscription'));

// --- the webhook's ordering and seams (textual, workerParity-style) ---
const here = dirname(fileURLToPath(import.meta.url));
const inbound = readFileSync(join(here, '../../../supabase/functions/sms-inbound/index.ts'), 'utf8');
check('STOP handling precedes any brain call (short-circuit order)',
  inbound.indexOf("keyword === 'stop'") < inbound.indexOf('smsAnswerFor(parseCommand('));
check('only a VERIFIED line reaches the brain', inbound.includes('line?.verified_at'));
check('the texted body is quarantined before the commander reads it',
  inbound.indexOf('quarantineExternal(body') < inbound.indexOf('buildCommanderUser(`'));
check('both turns land channel-stamped in the one record', (inbound.match(/channel: 'sms'/g) ?? []).length >= 1
  && inbound.includes("await say('user'") && inbound.includes("await say('garvis'"));
check('the brain call is metered like every judgment path',
  inbound.includes("checkCredits(admin, owner, 'garvis')") && inbound.includes('spendCredits(admin, owner'));
check('the rate cap ends in silence, never a loop', inbound.includes('return twiml();   // cap hit'));
check('the answer flows through the read-only gate', inbound.includes('smsAnswerFor(parseCommand('));
check('no approval machinery is reachable from a text',
  !inbound.includes('enqueueApproval') && !inbound.includes('approveAndExecute') && !inbound.includes("from('approvals')"));

console.log(`\nsmsConcierge.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} sms concierge check(s) failed`);
