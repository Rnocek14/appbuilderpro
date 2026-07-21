// src/lib/garvis/ics.verify.ts — the calendar sense's contract (npm run verify:ics).

import { parseIcsEvents, calendarLine } from './ics';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const FEED = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Client call — Jane\\, listing review',
  'DTSTART:20260720T150000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Print shop pickup',
  'DTSTART;VALUE=DATE:20260720',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Way in the future',
  'DTSTART:20270101T090000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:No start — must be ignored',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const WIN_START = '2026-07-20T00:00:00Z';
const WIN_END = '2026-07-21T00:00:00Z';
const events = parseIcsEvents(FEED, WIN_START, WIN_END);

check('only in-window events with real starts survive', events.length === 2);
check('all-day events are recognized as all-day', events.some((e) => e.allDay && e.title === 'Print shop pickup'));
check('timed events keep their UTC instant', events.some((e) => !e.allDay && e.startsAt === '2026-07-20T15:00:00Z'));
check('ICS escapes are unescaped in titles', events.some((e) => e.title.includes('Jane, listing review')));
check('soonest first', events[0].allDay === true);

// Folded lines (RFC 5545 continuation) unfold before parsing.
const folded = 'BEGIN:VEVENT\r\nSUMMARY:A very long ti\r\n tle continued\r\nDTSTART:20260720T100000Z\r\nEND:VEVENT';
check('folded lines unfold', parseIcsEvents(folded, WIN_START, WIN_END)[0]?.title === 'A very long title continued');

// Garbage in → empty out, never a throw.
check('garbage never throws', parseIcsEvents('not an ics at all', WIN_START, WIN_END).length === 0);
check('bad window is empty, not wrong', parseIcsEvents(FEED, 'junk', WIN_END).length === 0);

// The cap holds.
const many = Array.from({ length: 30 }, (_, i) =>
  `BEGIN:VEVENT\nSUMMARY:E${i}\nDTSTART:20260720T0${String(i % 10)}0000Z\nEND:VEVENT`).join('\n');
check('event cap holds', parseIcsEvents(many, WIN_START, WIN_END, 10).length === 10);

// Lines are honest about all-day vs timed.
check('all-day line says so', calendarLine({ title: 'X', startsAt: '2026-07-20T00:00:00Z', allDay: true }, 'America/Chicago') === '📅 All day: X');
check('timed line renders in the owner tz', calendarLine({ title: 'X', startsAt: '2026-07-20T15:00:00Z', allDay: false }, 'America/Chicago').includes('10:00'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} ics check(s) failed`);
