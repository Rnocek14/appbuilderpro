// src/lib/garvis/automation/triggers.verify.ts — run: npx tsx src/lib/garvis/automation/triggers.verify.ts
// Proves the two must-be-right properties of the trigger engine: the WINDOW GUARD (turning a trigger on
// never blasts everyone who became due long ago) and ONCE-ONLY (a due date fires at most once), plus the
// honest guards (needs an active trigger, a reachable address for its channel, and a real anchor),
// channel-awareness (email triggers gate on email, sms triggers gate on phone), and determinism.

import { dueFires, isCustomerDue, dueDateFor, fireKey, renderTemplate, parseCustomerCsv, type TriggerDef, type CustomerRec } from './triggers';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } };

const NOW = '2026-07-15T12:00:00Z';
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n: number) => new Date(Date.parse(NOW) - n * DAY).toISOString().slice(0, 10);

// A 6-month (180d) recall on last_visit_at, only fire if it became due within the last 14 days.
const recall: TriggerDef = { id: 't1', anchorField: 'last_visit_at', offsetDays: 180, windowDays: 14, status: 'active' };

const dueToday: CustomerRec = { id: 'c_today', email: 'a@x.com', name: 'Ada Lovelace', anchors: { last_visit_at: daysBefore(180) } };
const dueRecent: CustomerRec = { id: 'c_recent', email: 'b@x.com', name: 'Bo', anchors: { last_visit_at: daysBefore(185) } }; // due 5d ago
const dueStale: CustomerRec = { id: 'c_stale', email: 'c@x.com', name: 'Cy', anchors: { last_visit_at: daysBefore(220) } };  // due 40d ago
const notYet: CustomerRec = { id: 'c_future', email: 'd@x.com', name: 'Di', anchors: { last_visit_at: daysBefore(100) } };   // due in 80d
const noEmail: CustomerRec = { id: 'c_noemail', email: null, name: 'No Mail', anchors: { last_visit_at: daysBefore(180) } };
const noAnchor: CustomerRec = { id: 'c_noanchor', email: 'e@x.com', name: 'Ed', anchors: {} };

const all = [dueToday, dueRecent, dueStale, notYet, noEmail, noAnchor];

// ---- the plan with an empty ledger ----
const plan = dueFires(recall, all, [], NOW);
const ids = new Set(plan.map((f) => f.customerId));
ok('fires the customer due today', ids.has('c_today'));
ok('fires the customer due 5 days ago (inside the 14-day window)', ids.has('c_recent'));
ok('WINDOW GUARD: does NOT fire the customer due 40 days ago', !ids.has('c_stale'));
ok('does NOT fire the customer not due for 80 more days', !ids.has('c_future'));
ok('does NOT fire a customer with no email', !ids.has('c_noemail'));
ok('does NOT fire a customer with no anchor date', !ids.has('c_noanchor'));
ok('exactly two customers fire', plan.length === 2);
ok('firedFor is the anchor+offset due date', plan.find((f) => f.customerId === 'c_today')?.firedFor === dueDateFor(recall, dueToday));

// ---- ONCE-ONLY: with c_today already in the ledger, it does not fire again ----
const already = [fireKey('c_today', dueDateFor(recall, dueToday)!)];
const plan2 = dueFires(recall, all, already, NOW);
ok('ONCE-ONLY: an already-fired (customer, due date) is excluded', !plan2.some((f) => f.customerId === 'c_today'));
ok('ONCE-ONLY: the other due customer still fires', plan2.some((f) => f.customerId === 'c_recent'));

// ---- a paused trigger fires nothing ----
const paused: TriggerDef = { ...recall, status: 'paused' };
ok('paused trigger fires nothing', dueFires(paused, all, [], NOW).length === 0);
ok('paused trigger: isCustomerDue is false even for a due customer', !isCustomerDue(paused, dueToday, new Set(), NOW).due);

// ---- template rendering: safe substitution, missing field → empty, no invented data ----
ok('template: {first_name} substitutes', renderTemplate('Hi {first_name}, time for a check-up.', dueToday) === 'Hi Ada, time for a check-up.');
ok('template: {name} substitutes full name', renderTemplate('Dear {name}', dueToday) === 'Dear Ada Lovelace');
const nameless: CustomerRec = { id: 'c_nameless', email: 'f@x.com', anchors: {} };
ok('template: missing name renders empty, not a placeholder', renderTemplate('Hi {first_name}!', nameless) === 'Hi !');

// ---- CSV import parsing: tolerant, reachable-by-some-channel, only-present-columns ----
const csv = parseCustomerCsv('name,email,last_visit_at\nAda Lovelace,ada@x.com,2026-01-16\nBad Row,not-an-email,2026-01-01\nBo,bo@x.com,');
ok('csv: parses the valid rows, skips the bad email (no phone)', csv.length === 2 && csv[0].email === 'ada@x.com');
ok('csv: maps the present column', csv[0].last_visit_at === '2026-01-16');
ok('csv: an empty cell becomes null, not ""', csv[1].last_visit_at === null);
ok('csv: absent columns are null', csv[0].purchase_at === null && csv[0].phone === null);
ok('csv: header-only or empty input yields nothing', parseCustomerCsv('name,email').length === 0 && parseCustomerCsv('').length === 0);
const csvBadDate = parseCustomerCsv('email,last_visit_at\nx@y.com,not-a-date\nz@y.com,2026-13-45');
ok('csv: invalid date cell → null, row still kept (no batch-killing bad date)', csvBadDate.length === 2 && csvBadDate[0].last_visit_at === null && csvBadDate[1].last_visit_at === null);
// SMS import: a phone column is captured, and a phone-only row (no email) is kept for texting.
const csvPhone = parseCustomerCsv('name,email,phone,last_visit_at\nTex,,555-123-4567,2026-01-10\nMae,mae@x.com,+15551230000,2026-01-11\nGhost,not-an-email,,2026-01-12');
ok('csv: phone column captured', csvPhone.find((r) => r.name === 'Mae')?.phone === '+15551230000');
ok('csv: phone-only row (no valid email) is kept with email=null', csvPhone.some((r) => r.name === 'Tex' && r.email === null && r.phone === '555-123-4567'));
ok('csv: a row with neither a valid email nor a phone is still skipped', !csvPhone.some((r) => r.name === 'Ghost'));

// ---- DueFire shape: channel + destination ----
ok('email fire carries channel=email and to=email', plan.every((f) => f.channel === 'email') && plan.find((f) => f.customerId === 'c_today')?.to === 'a@x.com');

// ---- SMS-channel triggers: gate on PHONE, not email ----
const smsRecall: TriggerDef = { ...recall, channel: 'sms' };
const smsHasPhone: CustomerRec = { id: 'c_sms', email: null, phone: '555-123-4567', name: 'Tex', anchors: { last_visit_at: daysBefore(180) } };
const smsNoPhone: CustomerRec = { id: 'c_nophone', email: 'has@mail.com', phone: null, name: 'No Phone', anchors: { last_visit_at: daysBefore(180) } };
const smsPlan = dueFires(smsRecall, [smsHasPhone, smsNoPhone, dueToday], [], NOW);
const smsIds = new Set(smsPlan.map((f) => f.customerId));
ok('SMS trigger fires a due customer WITH a phone', smsIds.has('c_sms'));
ok('SMS trigger does NOT fire a due customer with no phone', !smsIds.has('c_nophone'));
ok('SMS trigger does NOT fire an email-only customer (dueToday has no phone)', !smsIds.has('c_today'));
ok('SMS fire carries channel=sms and to=phone', smsPlan.find((f) => f.customerId === 'c_sms')?.channel === 'sms' && smsPlan.find((f) => f.customerId === 'c_sms')?.to === '555-123-4567');
ok('SMS trigger: isCustomerDue false for a phone-less due customer', !isCustomerDue(smsRecall, smsNoPhone, new Set(), NOW).due);
// An EMAIL trigger must ignore the phone — a phone-only customer is NOT reachable by email.
ok('email trigger does NOT fire a phone-only customer', !new Set(dueFires(recall, [smsHasPhone], [], NOW).map((f) => f.customerId)).has('c_sms'));

// ---- determinism ----
ok('deterministic: identical plan for identical inputs', JSON.stringify(dueFires(recall, all, [], NOW)) === JSON.stringify(dueFires(recall, all, [], NOW)));

console.log(`${fail === 0 ? '✓' : '✗'} triggers.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
