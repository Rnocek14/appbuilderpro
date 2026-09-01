// Run: npx tsx src/lib/garvis/claimScreen.verify.ts
import {
  screenClaim, assessVerdict, assessClock, commonlyMissedClaims, categoryById,
  CLAIM_CATALOG, NOT_ADVICE, NO_COST, type IncidentSignals,
} from './claimScreen';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('claimScreen.verify');

const base: IncidentSignals = {
  category: 'premises_fall', daysSince: 10,
  someoneElseInvolved: true, soughtMedicalCare: true, ongoingHarm: true, againstPublicEntity: false,
};

// --- The verdict never over-promises ---
{
  const r = screenClaim(base);
  check('a well-formed screen returns ok', r.ok);
  if (r.ok) {
    const s = r.screen;
    check('strongest verdict is only "likely" — never asserts a case', s.verdict === 'likely');
    check('no result text ever promises a win or a dollar figure',
      !/\byou (will|have a case)\b/i.test(s.headline) && !/\$\d/.test(JSON.stringify(s)) && !/guarantee/i.test(JSON.stringify(s)));
    check('deterministic', JSON.stringify(screenClaim(base)) === JSON.stringify(r));
  }
}

// --- Disclaimers are ALWAYS present (visible, never omitted) ---
{
  for (const cat of CLAIM_CATALOG) {
    const r = screenClaim({ ...base, category: cat.id });
    if (!r.ok) { check(`every catalog category screens (${cat.id})`, false); continue; }
    const d = r.screen.disclaimers;
    check(`${cat.id}: carries the not-legal-advice line`, d.includes(NOT_ADVICE));
    check(`${cat.id}: carries the no-cost-to-find-out line`, d.includes(NO_COST));
    check(`${cat.id}: ends on exactly one next step (talk to a lawyer, free)`,
      /free/i.test(r.screen.nextStep) && /lawyer/i.test(r.screen.nextStep));
  }
}

// --- The clock: honest urgency, never a fabricated deadline ---
{
  const gov = screenClaim({ ...base, category: 'public_property', againstPublicEntity: true });
  check('a public-entity claim is CRITICAL urgency', gov.ok && gov.screen.clock.urgency === 'critical');
  check('the gov case warns about the short 60-180 day notice window',
    gov.ok && /60.?180/.test(gov.screen.clock.note) && /notify/i.test(gov.screen.clock.note));

  const anyScreen = screenClaim(base);
  check('the clock NEVER states a specific year/deadline count for the person (no fake SOL)',
    anyScreen.ok && !/\b\d+\s*(year|yr)s?\b/i.test(anyScreen.screen.clock.note));
  check('the clock always says a lawyer confirms the exact date free',
    anyScreen.ok && /lawyer confirms/i.test(anyScreen.screen.clock.note) && /free/i.test(anyScreen.screen.clock.note));

  // category with govPossible escalates even without the person flagging it
  const passenger = assessClock({ ...base, category: 'vehicle_passenger', againstPublicEntity: null }, categoryById('vehicle_passenger')!);
  check('a category that could involve a public entity rounds urgency UP on its own', passenger.urgency === 'critical');

  // elapsed time raises urgency on a purely private matter
  const oldDogBite = assessClock({ ...base, category: 'dog_bite', againstPublicEntity: false, daysSince: 400 }, categoryById('dog_bite')!);
  check('a private matter with lots of elapsed time is at least "high" urgency', oldDogBite.urgency === 'high');
}

// --- Verdict logic: leans people through the door, never slams it, never fabricates certainty ---
{
  check('other-party + real harm → likely',
    assessVerdict({ ...base }).verdict === 'likely');
  check('only one positive signal → possible',
    assessVerdict({ ...base, someoneElseInvolved: false, soughtMedicalCare: true, ongoingHarm: false }).verdict === 'possible');
  const nothing = assessVerdict({ ...base, someoneElseInvolved: null, soughtMedicalCare: null, ongoingHarm: null });
  check('no signals → "unclear", and it says so honestly (not "no")',
    nothing.verdict === 'unclear' && nothing.reasons.some((r) => /free consult/i.test(r)));
}

// --- Refusal + zero-input value ---
{
  const bad = screenClaim({ ...base, category: 'not_a_real_category' as unknown as IncidentSignals['category'] });
  check('an unrecognized situation is refused honestly, routed to a lawyer (no throw)',
    bad.ok === false && /free consult/i.test((bad as { reason: string }).reason));

  const missed = commonlyMissedClaims();
  check('the zero-input catalog covers every category', missed.length === CLAIM_CATALOG.length);
  check('every catalog card carries the "you may not have known" insight',
    missed.every((m) => m.missedInsight.length > 0));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
