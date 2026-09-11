// src/lib/garvis/huntTick.verify.ts — the hunt's clock math must be exact: it decides real spend.
import {
  dayStateFor, planTick, advanceDay, nextHuntRunIso, dayJustFinished, huntDayLine, huntProgressLine,
  DEMOS_PER_TICK, SEARCHES_PER_TICK, EMAIL_CHECKS_PER_TICK,
} from './huntTick';

let pass = 0, fail = 0;
function check(name: string, ok: boolean) {
  if (ok) pass++; else { fail++; console.error(`✗ ${name}`); }
}

const now = '2026-09-11T14:05:00.000Z';
const cfg = { searchesPerDay: 10, demoQuota: 3 };

// --- day state ---------------------------------------------------------------------------
const fresh = dayStateFor(undefined, now);
check('fresh state is keyed to today', fresh.day === '2026-09-11');
check('fresh state starts at zero', fresh.searches === 0 && fresh.demos === 0 && fresh.queued === 0 && !fresh.poolEmpty);
check('a stale (yesterday) state resets', dayStateFor({ day: '2026-09-10', demos: 3, searches: 10 }, now).demos === 0);
check('today\'s state is kept', dayStateFor({ day: '2026-09-11', demos: 2, searches: 7, poolEmpty: true }, now).demos === 2);
check('garbage counters read as zero', dayStateFor({ day: '2026-09-11', demos: 'x', searches: -4 }, now).searches === 0);
check('non-object raw is a fresh day', dayStateFor('nope', now).day === '2026-09-11');
// The budget period is the caller's key: a daily order anchored at 20:00 keeps ONE quota across UTC midnight.
const boundary = '2026-09-12T20:00:00.000Z';
check('a period key keeps state across midnight', dayStateFor({ day: boundary, demos: 2, searches: 5 }, '2026-09-12T00:30:00.000Z', boundary).demos === 2);
check('a different period key resets', dayStateFor({ day: boundary, demos: 2 }, '2026-09-12T20:30:00.000Z', '2026-09-13T20:00:00.000Z').demos === 0);
check('fresh state carries the period key', dayStateFor(undefined, now, boundary).day === boundary);
// The "churn" bound: searches spent, demos short, pool not empty → keeps waking (bounded by the pool + checks/tick).
check('searches spent + demos short + pool not empty → still a demo tick', planTick(cfg, { ...fresh, searches: 10, demos: 1 }).demos === 1);

// --- planTick ----------------------------------------------------------------------------
const p0 = planTick(cfg, fresh);
check('first tick spends a slice of searches', p0.searches === Math.min(SEARCHES_PER_TICK, cfg.searchesPerDay));
check('first tick builds exactly one demo', p0.demos === DEMOS_PER_TICK && DEMOS_PER_TICK === 1);
check('a demo tick gets email pre-checks', p0.checks === EMAIL_CHECKS_PER_TICK);
check('first tick is not the day\'s end', !p0.dayDone);

const spent = { ...fresh, searches: 10, demos: 3 };
const pDone = planTick(cfg, spent);
check('quota met → nothing to spend', pDone.searches === 0 && pDone.demos === 0 && pDone.checks === 0);
check('quota met → dayDone', pDone.dayDone);

const searchesLeftOnly = { ...fresh, searches: 8, demos: 3 };
const pS = planTick(cfg, searchesLeftOnly);
check('searches remain after demos are done → keep discovering', pS.searches === 2 && pS.demos === 0 && !pS.dayDone);

const emptyPoolNoSearches = { ...fresh, searches: 10, demos: 1, poolEmpty: true };
check('empty pool + no searches left → day done even with demo quota left', planTick(cfg, emptyPoolNoSearches).dayDone);
const emptyPoolSearchesLeft = { ...fresh, searches: 2, demos: 1, poolEmpty: true };
check('empty pool but searches left → demo slot stays open (discovery may refill)', planTick(cfg, emptyPoolSearchesLeft).demos === 1);

// --- advanceDay --------------------------------------------------------------------------
const a1 = advanceDay(fresh, { searches: 4, demos: 1, checks: 3, discovered: 9, queued: 1, noEmail: 2 });
check('actuals accumulate', a1.searches === 4 && a1.demos === 1 && a1.checks === 3 && a1.discovered === 9 && a1.queued === 1 && a1.noEmail === 2);
const a2 = advanceDay(a1, { poolEmpty: true });
check('poolEmpty carries when set', a2.poolEmpty);
const a3 = advanceDay(a2, { discovered: 5 });
check('new discoveries clear poolEmpty', !a3.poolEmpty && a3.discovered === 14);
check('advanceDay never goes negative', advanceDay(a1, { demos: -5 }).demos === 1);
check('advanceDay is pure (input untouched)', fresh.demos === 0 && a1.demos === 1);

// --- nextHuntRunIso ----------------------------------------------------------------------
const cadenceNext = '2026-09-12T14:00:00.000Z';
check('budget left → due again now (next tick picks it up)', nextHuntRunIso(cfg, a1, now, cadenceNext) === now);
check('budget spent → sleeps to the cadence boundary', nextHuntRunIso(cfg, spent, now, cadenceNext) === cadenceNext);

// --- dayJustFinished ---------------------------------------------------------------------
check('the tick that spends the last slice closes the day', dayJustFinished(cfg, { ...fresh, searches: 10, demos: 2 }, spent));
check('a mid-day tick does not close the day', !dayJustFinished(cfg, fresh, a1));
check('an already-closed day does not re-close', !dayJustFinished(cfg, spent, spent));

// --- lines -------------------------------------------------------------------------------
const line = huntDayLine('Daily hunt', { ...a1, discovered: 9, demos: 3, queued: 2 }, cfg);
check('day line names found/built/queued honestly', /found 9 new businesses/.test(line) && /built 3 of 3 demos/.test(line) && /2 pitches are waiting for your approval/.test(line));
check('day line never claims a send', /Nothing sent on its own\./.test(line) && !/\bsent \d/.test(line));
check('day line reports the no-email set-asides', /2 set aside with no public email/.test(line));
const emptyLine = huntDayLine('Daily hunt', { ...fresh, poolEmpty: true }, cfg);
check('empty pool is said plainly', /no buildable prospects were left/.test(emptyLine));
check('progress line reads as x/y', huntProgressLine({ ...a1, demos: 2 }, cfg) === 'today: 2/3 demos · 4/10 searches · 1 pitch queued');
check('progress line without state is zeroed', huntProgressLine(null, cfg) === 'today: 0/3 demos · 0/10 searches');
check('progress line clamps overspend to the quota', huntProgressLine({ ...a1, demos: 9, searches: 99, queued: 0 }, cfg) === 'today: 3/3 demos · 10/10 searches');

console.log(`huntTick.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
