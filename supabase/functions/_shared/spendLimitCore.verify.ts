// supabase/functions/_shared/spendLimitCore.verify.ts — what the spending limit says
// (npm run verify:spendlimit).

import {
  parseGuard, limitReached, limitMessage, classifyFailure, isLimitFailure,
  spendTone, fractionUsed, spendLine, type GuardState, type LimitKind,
} from './spendLimitCore.ts';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const fresh: GuardState = { kill: false, dailyCap: 5, monthlyCap: 50, spentToday: 0, spentMonth: 0 };
const mid: GuardState = { ...fresh, spentToday: 2.1, spentMonth: 12 };
const nearly: GuardState = { ...fresh, spentToday: 4.2, spentMonth: 12 };
const dayDone: GuardState = { ...fresh, spentToday: 5, spentMonth: 12 };
const monthDone: GuardState = { ...fresh, spentToday: 1, spentMonth: 50 };
const off: GuardState = { ...fresh, kill: true };

// ── parsing the RPC's jsonb ────────────────────────────────────────────────
check('parses the RPC shape', (() => {
  const g = parseGuard({ kill: false, daily_cap: 5, monthly_cap: 50, spent_today: 1.25, spent_month: 9 });
  return g?.dailyCap === 5 && g?.spentToday === 1.25 && g?.spentMonth === 9;
})());
check('numeric columns arriving as strings still parse', (() => {
  const g = parseGuard({ kill: false, daily_cap: '5', monthly_cap: '50', spent_today: '1.25', spent_month: '9' });
  return g?.dailyCap === 5 && g?.spentToday === 1.25;
})());
check('a non-object is no guard at all', parseGuard(null) === null && parseGuard('x') === null);
// An unreadable guard must never read as "unlimited" — the fail-safe direction is spent=0, cap=0,
// which reports no cap rather than inventing headroom nobody granted.
check('missing fields read as zero, never as unlimited', (() => {
  const g = parseGuard({});
  return g?.dailyCap === 0 && g?.spentToday === 0 && g?.kill === false;
})());
check('a garbage number reads as zero, not NaN', parseGuard({ spent_today: 'abc' })?.spentToday === 0);

// ── which wall ─────────────────────────────────────────────────────────────
check('nothing spent, nothing in the way', limitReached(fresh) === 'none');
check('under the limit is not a wall', limitReached(mid) === 'none');
check('spending exactly the daily limit stops it', limitReached(dayDone) === 'daily_cap');
check('over the daily limit stops it', limitReached({ ...fresh, spentToday: 7 }) === 'daily_cap');
check('the monthly limit stops it too', limitReached(monthDone) === 'monthly_cap');
// The switch beats the caps: sending someone to raise a cap they have not reached is the wrong
// control, and they would raise it and still be blocked.
check('the switch outranks the caps', limitReached({ ...dayDone, kill: true }) === 'kill_switch');
check('the day outranks the month when both are hit', limitReached({ ...fresh, spentToday: 5, spentMonth: 50 }) === 'daily_cap');
check('a zero cap means no cap, not an instant wall', limitReached({ ...fresh, dailyCap: 0, monthlyCap: 0, spentToday: 99 }) === 'none');

// ── the sentences ──────────────────────────────────────────────────────────
const KINDS: LimitKind[] = ['kill_switch', 'daily_cap', 'monthly_cap', 'out_of_credits'];

// THE CORE INVARIANT. Every sentence this module writes must be readable back to the reason behind
// it — otherwise a screen shows the right words beside the wrong control. Round-tripping it here is
// what stops the patterns in classifyFailure drifting away from the sentences in limitMessage.
check('every message classifies back to its own kind',
  KINDS.every((k) => classifyFailure(limitMessage(k, dayDone)) === k));
check('every message classifies back with no state to quote',
  KINDS.every((k) => classifyFailure(limitMessage(k)) === k));

// The defect this whole module is about: a self-imposed cap being reported as a billing problem.
// "Upgrade" and "refill" are the remedies for running out of credits and for NOTHING else.
check('a daily cap never tells you to upgrade or wait for a refill',
  !/upgrade|refill/i.test(limitMessage('daily_cap', dayDone)));
check('a monthly cap never tells you to upgrade or wait for a refill',
  !/upgrade|refill/i.test(limitMessage('monthly_cap', monthDone)));
check('a daily cap says when it resets and where to change it',
  /midnight/i.test(limitMessage('daily_cap', dayDone)) && /settings/i.test(limitMessage('daily_cap', dayDone)));
check('a monthly cap says when it resets', /1st/.test(limitMessage('monthly_cap', monthDone)));
check('the switch message names the switch, not a cap',
  /switch/i.test(limitMessage('kill_switch')) && !/limit reached/i.test(limitMessage('kill_switch')));
check('running out of credits IS the case where upgrading helps', /upgrade/i.test(limitMessage('out_of_credits')));

// Every one of them has to say so, because "it stopped" and "it broke" look identical otherwise —
// which is the complaint that produced this module.
check('every limit message says nothing is broken',
  KINDS.every((k) => /nothing is broken/i.test(limitMessage(k, dayDone))));
check('no message is a bare status token', KINDS.every((k) => limitMessage(k, dayDone).split(/\s+/).length >= 10));
check('no wall means no message', limitMessage('none') === '');

// ── reading someone else's failure ─────────────────────────────────────────
check('a real failure is not mistaken for a limit', classifyFailure('The search engine is not answering.') === 'none');
check('an empty failure is not a limit', classifyFailure('') === 'none' && classifyFailure(null) === 'none');
check('isLimitFailure agrees with classifyFailure', isLimitFailure(limitMessage('daily_cap', dayDone)) && !isLimitFailure('boom'));
// The wordings already written into the record by the previous version have to keep classifying,
// or a standing order paused last week explains itself as a crash today.
check('the older hand-written cap wording still classifies',
  classifyFailure('Daily spend cap reached ($10.00 of $10.00) — raise it in Settings → Spending guard.') === 'daily_cap');
check('the older monthly wording still classifies',
  classifyFailure('Monthly spend cap reached ($100.00 of $100.00) — raise it in Settings.') === 'monthly_cap');
check('the older kill-switch wording still classifies',
  classifyFailure('The AI kill switch is ON — nothing spends until you flip it off.') === 'kill_switch');
check('the older out-of-credits wording still classifies',
  classifyFailure("You're out of credits. Upgrade your plan or wait for your monthly refill.") === 'out_of_credits');

// ── the line you read before pressing anything ─────────────────────────────
check('a fresh day is calm', spendTone(fresh) === 'ok' && spendTone(mid) === 'ok');
check('four fifths of the day is a warning', spendTone(nearly) === 'close');
check('a reached limit is stopped, not merely close', spendTone(dayDone) === 'stopped' && spendTone(off) === 'stopped');
check('nearly all of the month also warns', spendTone({ ...fresh, spentMonth: 45 }) === 'close');

check('the bar is a real fraction', Math.abs(fractionUsed(mid) - 0.42) < 1e-9);
check('the bar never exceeds full', fractionUsed({ ...fresh, spentToday: 99 }) === 1);
check('the bar never goes negative', fractionUsed({ ...fresh, spentToday: -3 }) === 0);
check('no cap means an empty bar, not a full one', fractionUsed({ ...fresh, dailyCap: 0 }) === 0);

// A total with nothing to measure it against does not tell you whether to worry, so the line always
// carries both numbers.
check('the everyday line quotes spend AND allowance for both windows', (() => {
  const s = spendLine(mid);
  return s.includes('$2.10') && s.includes('$5.00') && s.includes('$12.00') && s.includes('$50.00');
})());
check('a used-up day says so and says when it resets',
  /used up/i.test(spendLine(dayDone)) && /midnight/i.test(spendLine(dayDone)));
check('a used-up month says when it resets', /1st/.test(spendLine(monthDone)));
check('the switch being off is stated plainly', /switched off/i.test(spendLine(off)));
check('every line is a sentence someone can act on', [fresh, mid, dayDone, monthDone, off].every((g) => spendLine(g).split(/\s+/).length >= 6));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} spend-limit check(s) failed`);
