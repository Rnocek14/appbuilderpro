// Run: npx tsx src/lib/garvis/reSchedule.verify.ts
import { zoneOffsetMs, instantToLocal, localToInstant, describeSchedule, scheduleCaveat, isPast } from './reSchedule';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('reSchedule.verify');

const CHI = 'America/Chicago';
const HOUR = 3600_000;

// ---- offsets come from the tz database, never from a hardcoded number -------
{
  // BookingSetup.tsx hardcodes 'Central (UTC-5)'. That is CDT, and it is wrong all winter.
  const jan = Date.parse('2026-01-15T12:00:00Z');
  const jul = Date.parse('2026-07-15T12:00:00Z');
  check('Chicago is UTC-6 in January (CST)', zoneOffsetMs(jan, CHI) === -6 * HOUR);
  check('Chicago is UTC-5 in July (CDT)', zoneOffsetMs(jul, CHI) === -5 * HOUR);
  check('the offset actually changes with the season (a hardcoded one cannot)',
    zoneOffsetMs(jan, CHI) !== zoneOffsetMs(jul, CHI));
}

// ---- ordinary round trips --------------------------------------------------
{
  const r = localToInstant('2026-09-20T18:30', CHI);
  check('an ordinary evening resolves', r.ok === true);
  if (r.ok) {
    check('6:30pm Chicago in September is 23:30Z', r.iso === '2026-09-20T23:30:00.000Z');
    check('it round-trips back to the same wall clock', instantToLocal(r.iso, CHI) === '2026-09-20T18:30');
    check('it is neither adjusted nor ambiguous', !r.adjusted && !r.ambiguous);
    check('no caveat is invented for an ordinary time', scheduleCaveat(r) === '');
  }
  const w = localToInstant('2026-01-15T08:00', CHI);
  check('a winter morning uses CST, not a frozen summer offset',
    w.ok === true && w.iso === '2026-01-15T14:00:00.000Z');
}

// ---- spring forward: the wall time does not exist ---------------------------
{
  // 2026-03-08: Chicago clocks jump 02:00 CST -> 03:00 CDT. 02:30 never happens.
  const r = localToInstant('2026-03-08T02:30', CHI);
  check('a non-existent wall time still resolves to a real instant', r.ok === true);
  if (r.ok) {
    check('it is reported as adjusted — never silently moved', r.adjusted === true);
    check('the instant it lands on is the clock time that actually occurs',
      instantToLocal(r.iso, CHI) === '2026-03-08T03:30');
    check('the caveat says the time does not exist and names the real one',
      scheduleCaveat(r).includes('does not exist') && scheduleCaveat(r).includes('03:30'));
    check('the operator-typed local is preserved as intent', r.local === '2026-03-08T02:30');
  }
  const before = localToInstant('2026-03-08T01:30', CHI);
  const after = localToInstant('2026-03-08T03:30', CHI);
  check('times either side of the gap are exactly one hour apart in real time',
    before.ok && after.ok && Date.parse(after.iso) - Date.parse(before.iso) === HOUR);
  check('neither side of the gap is flagged', before.ok && after.ok && !before.adjusted && !after.adjusted);
}

// ---- fall back: the wall time happens twice --------------------------------
{
  // 2026-11-01: Chicago clocks fall 02:00 CDT -> 01:00 CST. 01:30 happens twice.
  const r = localToInstant('2026-11-01T01:30', CHI);
  check('an ambiguous wall time resolves', r.ok === true);
  if (r.ok) {
    check('it is reported as ambiguous', r.ambiguous === true);
    check('the FIRST (daylight) occurrence is chosen, deterministically',
      r.iso === '2026-11-01T06:30:00.000Z');
    check('the caveat says it happens twice', scheduleCaveat(r).includes('happens twice'));
    check('resolving it twice gives the same instant (no drift)',
      localToInstant('2026-11-01T01:30', CHI).ok && (localToInstant('2026-11-01T01:30', CHI) as { iso: string }).iso === r.iso);
  }
  const noon = localToInstant('2026-11-01T12:00', CHI);
  check('an unambiguous time on the same day is not flagged', noon.ok === true && !noon.ambiguous);
}

// ---- refusals --------------------------------------------------------------
{
  check('a malformed local time is refused with a readable reason',
    localToInstant('tonight at 8', CHI).ok === false);
  check('the refusal shows the shape it wants',
    !localToInstant('nope', CHI).ok && (localToInstant('nope', CHI) as { reason: string }).reason.includes('2026-09-20T18:30'));
  check('an unknown time zone is refused, never silently treated as UTC',
    localToInstant('2026-09-20T18:30', 'Mars/Olympus').ok === false);
  check('an empty string is refused', localToInstant('', CHI).ok === false);
}

// ---- describing and comparing ----------------------------------------------
{
  const d = describeSchedule('2026-09-20T23:30:00.000Z', CHI);
  check('the human line names the zone', d.includes('CDT'));
  check('the human line uses the local clock, not UTC', d.includes('6:30'));
  check('a winter instant names CST', describeSchedule('2026-01-15T14:00:00.000Z', CHI).includes('CST'));
  check('an unparseable instant describes as empty, never as "now"', describeSchedule('nope', CHI) === '');
  check('instantToLocal refuses junk without throwing', instantToLocal('nope', CHI) === '');

  check('a past instant is past', isPast('2026-09-20T23:30:00.000Z', '2026-09-21T00:00:00.000Z'));
  check('a future instant is not', !isPast('2026-09-21T00:00:00.000Z', '2026-09-20T23:30:00.000Z'));
  check('the exact moment counts as past (it has arrived)',
    isPast('2026-09-20T23:30:00.000Z', '2026-09-20T23:30:00.000Z'));
}

console.log(`\nreSchedule.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reSchedule check(s) failed`);
