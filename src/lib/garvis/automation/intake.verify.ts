// Run: npx tsx src/lib/garvis/automation/intake.verify.ts
import { deriveOperatorSignals, intakeAutomations } from './intake';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('intake.verify');

const ids = (desc: string) => deriveOperatorSignals(desc).map((s) => s.id);

// --- grounded signal detection from the operator's own words -----------------------------------
{
  check('phone-only booking is recognised', ids('Customers call the shop to book — it is all phone tag.').includes('manual_process:phone_only_booking'));
  check('manual enquiry intake is recognised', ids('I personally answer every enquiry that comes in.').includes('manual_process:manual_intake'));
  check('manual invoicing is recognised', ids('At month end I chase unpaid invoices by hand.').includes('manual_process:manual_invoicing'));
  check('no reactivation is recognised', ids('I never follow up with past customers once a job is done.').includes('manual_process:no_reactivation'));
  check('no review ask is recognised', ids('Honestly I forget to ask for reviews most of the time.').includes('manual_process:no_review_ask'));
  check('recurring/recall reminders recognised', ids('We should remind patients when they are due for their 6-month recall.').includes('manual_process:no_recurring_maintenance'));
}

// --- honesty: only a LITERAL statement fires; absence-signals are negation-gated ----------------
{
  check('a business that DOES ask for reviews is not flagged', !ids('I always ask for a review after every single job.').includes('manual_process:no_review_ask'));
  check('generic praise text grounds nothing', deriveOperatorSignals('We sell handmade candles and our customers love us.').length === 0);
  check('empty / whitespace grounds nothing', deriveOperatorSignals('').length === 0 && deriveOperatorSignals('   ').length === 0 && deriveOperatorSignals(null).length === 0);
  check('each signal fires at most once', (() => { const s = deriveOperatorSignals('I book by phone. Everything is booked over the phone. Phone tag all day.'); return s.filter((x) => x.id === 'manual_process:phone_only_booking').length === 1; })());
}

// --- evidence quotes the prospect's own words (the honesty anchor) ------------------------------
{
  const sig = deriveOperatorSignals('I chase unpaid invoices by hand every Friday.').find((s) => s.id === 'manual_process:manual_invoicing');
  check('evidence quotes their words back ("You said…")', !!sig && /^You said: “/.test(sig!.evidence) && /invoice/i.test(sig!.evidence));
}

// --- proposals: ONLY deliverable automations, grounded, gap for the rest -----------------------
{
  // Phone-only booking + null vertical → lead_followup (GA, any). online_booking is 'not_built' and must
  // NEVER be proposed. missed_call_text_back is now beta (deliverable) but vertical-gated
  // (home_services/health/services), so a NULL vertical still won't propose it — verified positively below.
  const r = intakeAutomations('Customers just call us to book, all by phone.', null);
  check('a grounded description matches at least one automation', r.matched && r.proposals.length >= 1);
  check('lead_followup (a GA capability) is proposed', r.proposals.some((p) => p.capabilityId === 'lead_followup'));
  check('a not_built automation (online_booking) is never proposed', !r.proposals.some((p) => p.capabilityId === 'online_booking'));
  check('vertical-gated missed_call_text_back is not proposed for a null vertical', !r.proposals.some((p) => p.capabilityId === 'missed_call_text_back'));
  check('but missed_call_text_back (beta) IS proposed for a home-services phone-only operator', intakeAutomations('Customers just call us to book, all by phone.', 'home_services').proposals.some((p) => p.capabilityId === 'missed_call_text_back'));
  check('every proposal is deliverable (ga/beta only)', r.proposals.every((p) => p.status === 'ga' || p.status === 'beta'));

  // Invoice chasing is vertical-gated (not 'any') — matches for home_services, not for a null vertical.
  check('invoice_chase proposed for a home-services operator', intakeAutomations('I invoice by hand and chase late payments myself.', 'home_services').proposals.some((p) => p.capabilityId === 'invoice_chase'));

  // Health recall → hygiene_recall (beta, health-only).
  check('health recall → the health recall automation', intakeAutomations('We keep forgetting to remind patients about their 6-month recall visit.', 'health').proposals.some((p) => p.capabilityId === 'hygiene_recall'));
  // Home-services seasonal → seasonal_maintenance (beta, home_services-only).
  check('home-services seasonal reminders → seasonal maintenance', intakeAutomations('I should send seasonal tune-up reminders but never get to it.', 'home_services').proposals.some((p) => p.capabilityId === 'seasonal_maintenance'));
}

// --- the GAP path: a real need with nothing deliverable behind it (for THIS vertical) ----------
{
  // Recurring-maintenance need in a vertical with no matching deliverable capability → a gap for the
  // operator (a bespoke lead), never a false promise to the prospect.
  const r = intakeAutomations('We should remind clients when their annual review is due.', 'services');
  check('an unmatched-but-real need becomes a gap, not a proposal',
    r.signals.some((s) => s.id === 'manual_process:no_recurring_maintenance')
    && !r.proposals.some((p) => p.capabilityId === 'seasonal_maintenance' || p.capabilityId === 'hygiene_recall')
    && r.gaps.some((g) => g.signalId === 'manual_process:no_recurring_maintenance'));
}

// --- nothing groundable still returns a clean, honest result -----------------------------------
{
  const r = intakeAutomations('We are a friendly local bakery with the best sourdough in town.', 'food');
  check('no grounded signal → matched:false, no proposals, no gaps', !r.matched && r.proposals.length === 0 && r.gaps.length === 0);
}

console.log(`\nintake.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} intake check(s) failed`);
