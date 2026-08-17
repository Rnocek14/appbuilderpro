// Run: npx tsx src/lib/garvis/emailFlows.verify.ts
// Email flows' contract (SW10.7): segments derive from REAL events (no events, no members), a
// later drip step fires ONLY on the real absence of a reply with its clock anchored to the
// previous step's actual drain, and the clock stages every cohort as ONE send_batch approval.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeSegment, nextDripStep, validateFlow, MAX_DRIP_STEPS, MIN_DRIP_STEPS,
  type EventRow, type DripStep, type SentStep,
} from './emailFlows';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const NOW = '2026-08-17T12:00:00Z';
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
const ev = (contact: string, kind: string, d: number): EventRow => ({ contact_id: contact, kind, created_at: daysAgo(d) });

// ---- behavioral segments: real rows in, membership out ----
{
  const rows = [
    ev('a', 'opened', 2), ev('a', 'opened', 5),                    // opened twice, never replied
    ev('b', 'opened', 3), ev('b', 'replied', 1),                   // opened AND replied
    ev('c', 'delivered', 4),                                       // delivered, never opened
    ev('d', 'clicked', 6), ev('d', 'opened', 6),                   // clicked
    ev('e', 'opened', 40),                                         // outside the window
  ];
  const openedNoReply = computeSegment(rows, { kind: 'opened_no_reply', sinceDays: 14 }, NOW);
  check('opened_no_reply: openers who never replied, with evidence counts',
    openedNoReply.contactIds.join() === 'a,d' && openedNoReply.evidence.a === 2);
  check('a real reply excludes the contact', !openedNoReply.contactIds.includes('b'));
  check('events outside the window never qualify', !openedNoReply.contactIds.includes('e'));
  check('no_open: delivered but silent', computeSegment(rows, { kind: 'no_open', sinceDays: 14 }, NOW).contactIds.join() === 'c');
  check('clicked: real clicks only', computeSegment(rows, { kind: 'clicked', sinceDays: 14 }, NOW).contactIds.join() === 'd');
  check('no events, no members (the honest empty segment)',
    computeSegment([], { kind: 'opened_no_reply', sinceDays: 14 }, NOW).contactIds.length === 0);
  check('a null contact_id never fabricates a member',
    computeSegment([{ contact_id: null, kind: 'opened', created_at: daysAgo(1) }], { kind: 'opened_no_reply', sinceDays: 14 }, NOW).contactIds.length === 0);
}

// ---- the drip gate: step 2 fires ONLY on real non-reply, clocked from the real drain ----
const steps: DripStep[] = [
  { subject: 'S1', body: 'B1', delayDays: 0 },
  { subject: 'S2', body: 'B2', delayDays: 3 },
];
const sentStep = (i: number, drainedDaysAgo: number | null): SentStep => ({
  stepIndex: i, batch_id: `b${i}`, staged_at: daysAgo(5),
  drained_at: drainedDaysAgo === null ? null : daysAgo(drainedDaysAgo),
});
{
  check('step 1 is due at enrollment (delay 0)',
    nextDripStep(steps, [], null, daysAgo(1), NOW)?.stepIndex === 0);
  check('A REPLY ENDS THE DRIP — no step ever fires again',
    nextDripStep(steps, [sentStep(0, 4)], daysAgo(2), daysAgo(10), NOW) === null);
  check('step 2 fires on real non-reply once the delay has run from the REAL drain',
    nextDripStep(steps, [sentStep(0, 4)], null, daysAgo(10), NOW)?.stepIndex === 1);
  check('the delay runs from the drain, not the staging',
    nextDripStep(steps, [sentStep(0, 1)], null, daysAgo(10), NOW) === null);
  check('a staged-but-never-approved step HOLDS everything behind it (approval gates compose)',
    nextDripStep(steps, [sentStep(0, null)], null, daysAgo(10), NOW) === null);
  check('a finished drip asks for nothing',
    nextDripStep(steps, [sentStep(0, 8), sentStep(1, 4)], null, daysAgo(20), NOW) === null);
}

// ---- flow validation ----
{
  const ok = { name: 'Warm', rule: { kind: 'opened_no_reply' as const, sinceDays: 14 }, steps };
  let threw = false; try { validateFlow(ok); } catch { threw = true; }
  check('a well-formed flow validates', !threw);
  const bad = (over: Record<string, unknown>, want: string) => {
    try { validateFlow({ ...ok, ...over } as never); return false; } catch (e) { return e instanceof Error && e.message.includes(want); }
  };
  check('drips are 2-3 steps, enforced', bad({ steps: [steps[0]] }, `${MIN_DRIP_STEPS}-${MAX_DRIP_STEPS} steps`));
  check('an unknown rule is refused, never guessed', bad({ rule: { kind: 'vibes', sinceDays: 7 } }, 'segment rule'));
  check('empty step copy is refused', bad({ steps: [steps[0], { ...steps[1], body: ' ' }] }, 'needs a body'));
}

// ---- wiring pins ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const worker = readFileSync(join(root, 'supabase/functions/standing-worker/index.ts'), 'utf8');
const sweep = worker.slice(worker.indexOf('EMAIL FLOW SWEEP'), worker.indexOf('ARC ADVANCE'));
const run = readFileSync(join(here, 'emailFlowsRun.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0157_email_flows.sql'), 'utf8');
{
  check('the sweep exists on the standing tick and reads REAL events', sweep.includes("from('outreach_events')"));
  check('the sweep decides through the PURE gate, not a private copy',
    sweep.includes('computeSegment(evRows') && sweep.includes('nextDripStep(steps, sent, replied'));
  check('every due cohort becomes ONE batch + ONE send_batch approval',
    sweep.includes("kind: 'send_batch'") && sweep.includes('payload_hash: await hashPayload(apPayload)'));
  check('the drain re-check line is on the card', sweep.includes('drains this under your daily cap after you approve'));
  check('a fresh REAL reply ends the drip before any staging',
    sweep.includes("eq('kind', 'replied')") && sweep.includes('the drip ends on a REAL reply'));
  check('drained_at backfills from the batch actually finishing',
    sweep.includes("b.status === 'done'") && sweep.includes('drainedBy'));
  check('literal merge tokens never send', sweep.includes('unknownTokens('));
  check('the sweep is bounded per tick', sweep.includes('.limit(3)') && sweep.includes('.limit(500)'));
  check('enrollment is once, ever — the unique index makes re-qualifying a no-op',
    migration.includes('unique (flow_id, contact_id)') && sweep.includes("onConflict: 'flow_id,contact_id', ignoreDuplicates: true"));
  check('flows are born paused', migration.includes("default 'paused'") && run.includes("status: 'paused'"));
  check('the client preview runs the SAME computation the worker enrolls with',
    run.includes('computeSegment(data ?? [], rule'));
}

console.log(`\nemailFlows.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} email flow check(s) failed`);
