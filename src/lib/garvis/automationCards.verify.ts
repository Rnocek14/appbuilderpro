// Run: npx tsx src/lib/garvis/automationCards.verify.ts
import { EXPECTED_JOBS } from './systemControl';
import {
  HEARTBEAT_CARDS, ORDER_CARDS, RUNG_LABEL, CAPABILITY_RUNG, SEND_WITHOUT_APPROVAL_WHITELIST,
  cardForJob, cardForOrderKind, type AutomationCard,
} from './automationCards';
import { CAPABILITIES } from './automation/registry';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('automationCards.verify');

const allCards: AutomationCard[] = [...Object.values(HEARTBEAT_CARDS), ...Object.values(ORDER_CARDS)];
const copyOf = (c: AutomationCard) => [c.name, c.when, c.does, c.replaces, c.human, c.never, ...c.sop, c.killSwitch].join(' ');

// ---- coverage: every automated thing has a card ----
check('every heartbeat job has a card', EXPECTED_JOBS.every((j) => cardForJob(j) !== null));
check('no orphan heartbeat cards (card without a job)', Object.keys(HEARTBEAT_CARDS).every((k) => (EXPECTED_JOBS as readonly string[]).includes(k)));
check('every standing-order kind has a card', (['watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'content_week', 'opportunity_hunt', 'area_study', 'episode_draft'] as const).every((k) => !!cardForOrderKind(k)));
check('every capability has an explicit rung', CAPABILITIES.every((c) => c.id in CAPABILITY_RUNG));

// ---- structure: the researched card shape holds ----
check('every card has all fields non-empty', allCards.every((c) =>
  c.name && c.when && c.does && c.replaces && c.human && c.never && c.killSwitch && c.doneBy && RUNG_LABEL[c.rung]));
check('every SOP is 3-7 verifiable steps (medium transparency — never a raw dump)',
  allCards.every((c) => c.sop.length >= 3 && c.sop.length <= 7 && c.sop.every((s) => s.length > 10)));
check('drafting cards mark the human checkpoint INSIDE the SOP',
  allCards.filter((c) => c.rung === 'drafts').every((c) => /your approval|waits? (for|in)|wait for you|passed your approval/i.test(c.sop.join(' '))));

// ---- honesty gates: the documented overclaim disasters are structurally banned ----
// (the claim scan excludes `when` — a cadence like "Every 5 minutes" is a schedule, not a promise)
const claimCopy = (c: AutomationCard) => [c.does, c.replaces, c.human, c.never, ...c.sop].join(' ');
check('no hours/FTE/time-saved claims anywhere (the 11x lesson)',
  allCards.every((c) => !/\b\d+ ?(hours?|hrs|minutes?)\b|\bFTEs?\b|full.time employee|saves? (you )?\d/i.test(claimCopy(c))));
check('no persona language — mechanism, not employee (the IIHS naming lesson)',
  allCards.every((c) => !/AI (employee|assistant|worker)|your assistant|\bI (will|can|decided)\b/i.test(copyOf(c))));
check('rung labels are the uniform vocabulary, human-verb named',
  RUNG_LABEL.suggests.includes('you decide') && RUNG_LABEL.drafts.includes('you approve') && RUNG_LABEL.runs.includes('never sends'));

// ---- the structural ladder truth: sending requires approval, with the ONE named exception ----
// A "runs on its own" card must name a hard boundary verb in its Never line — the guarantee that
// it cannot put words in front of another person or mutate your work unsupervised.
check('every "runs" card\'s Never line names a hard boundary (send/post/contact/edit/act…)',
  allCards.every((c) => c.rung !== 'runs'
    || /^Never (sends?|posts?|contacts?|messages?|answers?|applies|edits?|publishes?|repairs?|destroys?|acts?|turns?)/i.test(c.never)));
check('send-capable capabilities are rung "drafts" unless whitelisted by name',
  CAPABILITIES.every((c) => CAPABILITY_RUNG[c.id] !== 'runs'
    || SEND_WITHOUT_APPROVAL_WHITELIST.includes(c.id)
    || ['online_booking'].includes(c.id)));
check('the whitelist is exactly the one known instant-send (missed-call text-back)',
  SEND_WITHOUT_APPROVAL_WHITELIST.length === 1 && SEND_WITHOUT_APPROVAL_WHITELIST[0] === 'missed_call_text_back');

// ---- every card states its boundary and its kill switch ----
check('every "never" line starts with Never (the boundary reads as a boundary)',
  allCards.every((c) => c.never.startsWith('Never')));
check('every card names where to turn it off', allCards.every((c) => /Master switch|pause|chip/i.test(c.killSwitch)));
check('deterministic', JSON.stringify(HEARTBEAT_CARDS) === JSON.stringify(HEARTBEAT_CARDS) && cardForJob('nonexistent-job') === null);

console.log(`\nautomationCards.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} automationCards check(s) failed`);
