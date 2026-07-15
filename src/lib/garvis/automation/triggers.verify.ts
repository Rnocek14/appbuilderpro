// src/lib/garvis/automation/triggers.verify.ts — run: npx tsx src/lib/garvis/automation/triggers.verify.ts
// Proves the two must-be-right properties of the trigger engine: the WINDOW GUARD (turning a trigger on
// never blasts everyone who became due long ago) and ONCE-ONLY (a due date fires at most once), plus the
// honest guards (needs an active trigger, an email, and a real anchor) and determinism.

import { dueFires, isCustomerDue, dueDateFor, fireKey, renderTemplate, type TriggerDef, type CustomerRec } from './triggers';

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

// ---- determinism ----
ok('deterministic: identical plan for identical inputs', JSON.stringify(dueFires(recall, all, [], NOW)) === JSON.stringify(dueFires(recall, all, [], NOW)));

console.log(`${fail === 0 ? '✓' : '✗'} triggers.verify: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
