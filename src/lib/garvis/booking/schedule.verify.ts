// Run: npx tsx src/lib/garvis/booking/schedule.verify.ts
import { parseHHMM, openMinutesForDow, availableSlots, validateBooking, type HoursRule } from './schedule';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('schedule.verify');

const MON = Date.UTC(2024, 0, 1, 0, 0, 0);   // 2024-01-01 is a Monday, 00:00:00 UTC
const H = (n: number) => n * 3_600_000;
const M = (n: number) => n * 60_000;
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);   // UTC HH:MM (offset 0 in tests)

// --- parseHHMM ------------------------------------------------------------------------------
check('parseHHMM parses a normal time', parseHHMM('09:30') === 570);
check('parseHHMM parses midnight + noon', parseHHMM('00:00') === 0 && parseHHMM('12:00') === 720);
check('parseHHMM rejects garbage / out of range', parseHHMM('9:5') === null && parseHHMM('24:00') === null && parseHHMM('10:61') === null);

// --- openMinutesForDow ----------------------------------------------------------------------
{
  const hours: HoursRule[] = [
    { dow: 1, start: '13:00', end: '17:00' }, { dow: 1, start: '09:00', end: '12:00' },
    { dow: 2, start: '09:00', end: '09:00' },   // zero-length → dropped
    { dow: 3, start: 'bad', end: '17:00' },     // malformed → dropped
  ];
  const mon = openMinutesForDow(hours, 1);
  check('returns both Monday ranges, sorted by start', mon.length === 2 && mon[0][0] === 540 && mon[1][0] === 780);
  check('drops a zero-length range', openMinutesForDow(hours, 2).length === 0);
  check('drops a malformed range', openMinutesForDow(hours, 3).length === 0);
  check('a day with no rule is closed', openMinutesForDow(hours, 6).length === 0);
}

// --- availableSlots: the happy path ----------------------------------------------------------
const base = {
  fromMs: MON, nowMs: MON, offsetMin: 0, slotMin: 30, serviceMin: 60, bufferMin: 0,
  minNoticeMin: 0, maxAdvanceDays: 7, busy: [] as { start: number; end: number }[],
  hours: [{ dow: 1, start: '09:00', end: '12:00' }] as HoursRule[],
};
{
  const s = availableSlots(base);
  // 60-min service on 30-min grid inside 9–12 → starts at 9:00, 9:30, 10:00, 10:30, 11:00 (11:30+60>12).
  check('generates the right slot count', s.length === 5);
  check('first slot is 09:00, last is 11:00', hhmm(s[0]) === '09:00' && hhmm(s[4]) === '11:00');
  check('slots are sorted ascending', s.every((v, i) => i === 0 || v > s[i - 1]));
}

// --- a booked slot removes exactly the overlapping candidates (buffer 0) ----------------------
{
  const busy = [{ start: MON + H(10), end: MON + H(11) }];   // 10:00–11:00 taken
  const s = availableSlots({ ...base, busy }).map(hhmm);
  check('an existing 10–11 appt frees only 09:00 and 11:00', s.join(',') === '09:00,11:00');
}

// --- buffer keeps time clear on both sides ---------------------------------------------------
{
  const busy = [{ start: MON + H(10), end: MON + H(11) }];
  const s = availableSlots({ ...base, bufferMin: 30, busy }).map(hhmm);
  // 9:00 [9,10] needs 30m clear of 10:00 → 10:00 < 11:00+? no: clash if 9:00<11:30 && 10:00<10:00+30 → true → removed.
  check('a 30-min buffer also blocks the adjacent 09:00 slot', !s.includes('09:00') && !s.includes('11:00'));
}

// --- min notice pushes the earliest slot forward ---------------------------------------------
{
  const s = availableSlots({ ...base, nowMs: MON + H(8), minNoticeMin: 120 }).map(hhmm);
  check('120-min notice from 08:00 starts availability at 10:00', s[0] === '10:00');
}

// --- max advance bounds the horizon ----------------------------------------------------------
{
  // Only Mondays are open; with a 1-day horizon from Monday, the next Monday is out of range → no slots.
  const s = availableSlots({ ...base, maxAdvanceDays: 1, nowMs: MON + H(13) });   // after today's window
  check('nothing bookable when the only open day is beyond the horizon', s.length === 0);
}

// --- utc offset shifts wall-clock to real UTC instants ---------------------------------------
{
  // offset -60 → local is UTC-1, so a 09:00 LOCAL slot is 10:00 UTC.
  const s = availableSlots({ ...base, offsetMin: -60 });
  check('a 09:00 local slot resolves to 10:00 UTC under offset -60', hhmm(s[0]) === '10:00');
}

// --- validateBooking: the specific reasons ---------------------------------------------------
{
  const ok = validateBooking(MON + H(9), base);
  check('a valid in-hours start is accepted', ok.ok === true);
  const soon = validateBooking(MON + H(9), { ...base, nowMs: MON + H(9) + M(1), minNoticeMin: 60 });
  check('a start inside the notice window → too_soon', soon.ok === false && soon.reason === 'too_soon');
  const far = validateBooking(MON + H(9) + 30 * 86_400_000, base);
  check('a start past the horizon → too_far', far.ok === false && far.reason === 'too_far');
  const closed = validateBooking(Date.UTC(2024, 0, 7, 9, 0, 0), base);   // Sunday, no hours
  check('a start on a closed day → closed', closed.ok === false && closed.reason === 'closed');
  const taken = validateBooking(MON + H(9), { ...base, busy: [{ start: MON + H(9), end: MON + H(10) }] });
  check('a start that overlaps an appt → taken', taken.ok === false && taken.reason === 'taken');
  const misaligned = validateBooking(MON + H(11) + M(30), base);   // 11:30 + 60 = 12:30 > 12:00 close
  check('a start whose service runs past close → closed', misaligned.ok === false && misaligned.reason === 'closed');
}

console.log(`\nschedule.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} schedule check(s) failed`);
