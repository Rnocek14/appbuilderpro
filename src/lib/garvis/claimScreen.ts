// src/lib/garvis/claimScreen.ts
// THE CLAIM SCREEN — pure core (verified by claimScreen.verify.ts). The access-to-justice engine:
// a person describes something that happened to THEM, and this core tells them, honestly, whether
// it's the kind of thing worth a free lawyer consult, what claim type it usually is, and that a
// clock is running. Nothing here reaches out to anyone or ingests anyone else's data — it only ever
// assesses the signals the person themselves gave. The honesty spine, encoded:
//   - NEVER PROMISES AN OUTCOME. The verdict is 'likely' / 'possible' / 'unclear' worth-a-consult —
//     never "you have a case," never a dollar figure. A screen is not an adjudication.
//   - REFUSES TO INVENT A DEADLINE. We do not fabricate a state's exact statute of limitations. We
//     say the clock is running, that it can be far SHORTER than people expect (claims against a city
//     or public hospital can require notice in ~60-180 days), and that a lawyer confirms the exact
//     date free — because a made-up deadline someone then relies on is the opposite of help.
//   - ALWAYS DISCLOSES WHAT IT IS. Every screen carries the "educational, not legal advice" line and
//     the "no fee to find out" line. Visible, never omitted (the verify suite fails if either drops).
//   - ONE NEXT STEP. Every result ends on the single action — talk to a lawyer, free — so the page
//     obeys the simplicity doctrine even in its honest "unclear" case.

export type ClaimCategoryId =
  | 'premises_fall'
  | 'dog_bite'
  | 'defective_product'
  | 'rideshare'
  | 'vehicle_passenger'
  | 'rental_hazard'
  | 'workplace_thirdparty'
  | 'nursing_home'
  | 'foodborne'
  | 'medical_device_drug'
  | 'public_property';

export interface ClaimCategory {
  id: ClaimCategoryId;
  label: string;         // short human label
  claimType: string;     // the legal shorthand a lawyer would use
  examples: string[];    // plain-language "this happened to me" triggers
  missedInsight: string; // the "you may not have known this was a claim" line
  govPossible: boolean;  // could the at-fault party be a public entity? (short-deadline flag)
}

// The catalog IS the zero-input value: the page shows these "did you know this is a claim?" cards
// before the person types anything. Ordered by how often the injured person never realizes it counts.
export const CLAIM_CATALOG: readonly ClaimCategory[] = [
  {
    id: 'premises_fall',
    label: 'A fall on someone else’s property',
    claimType: 'premises liability',
    examples: ['slipped on an unmarked wet floor', 'tripped on a broken stair or torn carpet', 'fell in a dark stairwell or parking lot'],
    missedInsight: 'People blame themselves for being clumsy. If the property was unsafe and unmarked, the owner — not you — may be responsible for the bills.',
    govPossible: true,
  },
  {
    id: 'dog_bite',
    label: 'A dog bite or animal attack',
    claimType: 'animal liability',
    examples: ['a neighbor’s dog bit or knocked me down', 'an off-leash animal caused an injury'],
    missedInsight: 'Many states hold the owner responsible even for a first bite — and it’s usually their homeowner’s insurance that pays, not the neighbor personally.',
    govPossible: false,
  },
  {
    id: 'defective_product',
    label: 'A product that failed and hurt you',
    claimType: 'product liability',
    examples: ['an appliance, tool, or e-bike battery failed', 'a piece of furniture or equipment broke and injured me'],
    missedInsight: 'When a product is defective, the maker or seller can be liable — you don’t have to prove anyone was careless, just that the product was unsafe.',
    govPossible: false,
  },
  {
    id: 'rideshare',
    label: 'A rideshare or delivery crash',
    claimType: 'rideshare / commercial auto',
    examples: ['hurt as an Uber or Lyft passenger', 'hit by a rideshare or delivery driver'],
    missedInsight: 'Rideshare companies carry large insurance policies that cover passengers and people they hit — a source most people never think to claim against.',
    govPossible: false,
  },
  {
    id: 'vehicle_passenger',
    label: 'You were hurt as a passenger',
    claimType: 'auto / bodily injury',
    examples: ['I was a passenger and got injured', 'the crash "wasn’t mine" so I assumed I had no claim'],
    missedInsight: 'A passenger is almost never at fault, which often makes their claim the clearest of anyone in the car — even against a friend or family member’s policy.',
    govPossible: true,
  },
  {
    id: 'rental_hazard',
    label: 'An injury in a rental you live in',
    claimType: 'landlord / premises liability',
    examples: ['hurt by a broken railing, stair, or fixture the landlord never fixed', 'injured by mold, no heat, or a known hazard'],
    missedInsight: 'A landlord who ignored a hazard they knew about can be responsible — renting the place does not make the injury your problem to absorb.',
    govPossible: true,
  },
  {
    id: 'workplace_thirdparty',
    label: 'Hurt at work by someone who isn’t your employer',
    claimType: 'third-party work injury',
    examples: ['injured by another company’s equipment or driver on the job', 'hurt by a subcontractor or a defective machine at work'],
    missedInsight: 'Workers’ comp isn’t the only door. If a third party (not your employer) caused it, you may have a separate claim on top of comp.',
    govPossible: false,
  },
  {
    id: 'nursing_home',
    label: 'A loved one hurt in a care facility',
    claimType: 'elder / nursing-home neglect',
    examples: ['a family member had a preventable fall, bedsore, or injury in a facility', 'signs of neglect or under-staffing'],
    missedInsight: 'Preventable injuries in a care facility are often neglect, not "just aging" — and families rarely know they can hold the facility accountable.',
    govPossible: false,
  },
  {
    id: 'foodborne',
    label: 'Serious illness from a business’s food',
    claimType: 'foodborne illness / negligence',
    examples: ['hospitalized after eating at a restaurant or from a recalled product'],
    missedInsight: 'A documented, serious foodborne illness traced to a business can be a claim — especially where a health department or recall backs it up.',
    govPossible: false,
  },
  {
    id: 'medical_device_drug',
    label: 'Harmed by a device or medication',
    claimType: 'medical device / pharmaceutical',
    examples: ['injured by an implant, device, or drug later recalled or warned about'],
    missedInsight: 'When a device or drug is defective or its risks were hidden, there may be a claim — often part of a larger action people never hear about.',
    govPossible: false,
  },
  {
    id: 'public_property',
    label: 'An injury on government property',
    claimType: 'claim against a public entity',
    examples: ['hurt on a public sidewalk, transit, school, or in a public building', 'injured by a city vehicle or public hospital'],
    missedInsight: 'You can be owed something even by a city or agency — but the deadline to even NOTIFY them is often only a few months, so this one is urgent.',
    govPossible: true,
  },
] as const;

export function categoryById(id: string): ClaimCategory | null {
  return CLAIM_CATALOG.find((c) => c.id === id) ?? null;
}

/** What the person can honestly tell us about their OWN situation. Everything is optional/unknown —
 *  the screen degrades to "worth a free consult to find out," never a fake certainty. */
export interface IncidentSignals {
  category: ClaimCategoryId;
  daysSince: number | null;        // how long ago it happened — drives urgency, never a fake deadline
  someoneElseInvolved: boolean | null; // was another person/business/property owner involved? the crux
  soughtMedicalCare: boolean | null;   // did the injury need medical attention?
  ongoingHarm: boolean | null;         // lasting injury, cost, or missed work?
  againstPublicEntity: boolean | null; // do they think a city/agency/public hospital was involved?
}

export type ConsultVerdict = 'likely' | 'possible' | 'unclear';
export type Urgency = 'critical' | 'high' | 'normal';

export interface TimeClock {
  urgency: Urgency;
  // We deliberately do NOT state a specific number of days/years — see the file header. This is the
  // honest framing every result carries instead.
  note: string;
}

export interface ClaimScreen {
  category: ClaimCategory;
  headline: string;
  verdict: ConsultVerdict;   // worth-a-consult confidence — NEVER "you have a case"
  reasons: string[];         // the plain-language signals that pointed this way
  missedInsight: string;     // the knowledge-they-didn't-have line for this category
  clock: TimeClock;
  nextStep: string;          // the ONE action
  disclaimers: string[];     // always present: not-legal-advice + no-cost-to-find-out
}

export const NOT_ADVICE =
  'This is a plain-language screen to help you decide whether to talk to a lawyer — it is not legal advice and does not create any attorney relationship.';
export const NO_COST =
  'Finding out costs nothing: injury lawyers give free consultations and are paid only if they win, so a call has no downside.';

const bool = (v: boolean | null): boolean => v === true;

/** How urgent is the clock? We never claim to know the exact deadline; we escalate on the two facts
 *  that genuinely shorten it: a possible public-entity defendant (notice windows can be ~60-180 days)
 *  and time already elapsed. When in doubt we round urgency UP — the failure mode we refuse is
 *  telling someone they have more time than they might. */
export function assessClock(s: IncidentSignals, cat: ClaimCategory): TimeClock {
  const govInPlay = bool(s.againstPublicEntity) || cat.govPossible;
  const days = typeof s.daysSince === 'number' && s.daysSince >= 0 ? s.daysSince : null;

  let urgency: Urgency = 'normal';
  if (govInPlay) urgency = 'critical';           // government notice deadlines are the short trap
  else if (days !== null && days >= 180) urgency = 'high';
  else if (days !== null && days >= 30) urgency = 'high';

  const base =
    'There is a legal deadline (a "statute of limitations") to act, and it can be far shorter than people expect — in some cases only a few months. We won’t guess your exact date; a lawyer confirms it for free, fast.';
  const govLine = govInPlay
    ? ' Because a city, agency, or public hospital may be involved, the window to even notify them can be as little as 60–180 days — treat this as time-sensitive.'
    : '';
  return { urgency, note: base + govLine };
}

/** The worth-a-consult verdict. Deterministic, signal-based, and deliberately conservative about the
 *  UPSIDE: the strongest thing it will ever say is 'likely worth a consult'. It leans toward getting
 *  people through the door (unknowns resolve to 'possible', not 'no'), because a free consult is the
 *  thing that actually answers the question — but it never asserts liability. */
export function assessVerdict(s: IncidentSignals): { verdict: ConsultVerdict; reasons: string[] } {
  const reasons: string[] = [];
  const other = bool(s.someoneElseInvolved);
  const care = bool(s.soughtMedicalCare);
  const ongoing = bool(s.ongoingHarm);

  if (other) reasons.push('Someone else — a person, business, or property owner — was involved, which is what turns an accident into a possible claim.');
  if (care) reasons.push('The injury needed medical attention, which documents real harm.');
  if (ongoing) reasons.push('There’s lasting harm or cost — ongoing injury, bills, or missed work.');

  let verdict: ConsultVerdict;
  if (other && (care || ongoing)) verdict = 'likely';
  else if (other || care || ongoing) verdict = 'possible';
  else verdict = 'unclear';

  if (verdict === 'unclear') {
    reasons.push('We don’t have enough detail to tell — which is exactly what a free consult is for.');
  }
  return { verdict, reasons };
}

const HEADLINE: Record<ConsultVerdict, (cat: ClaimCategory) => string> = {
  likely: (c) => `This is often a valid ${c.claimType} claim — it’s worth a free consult.`,
  possible: (c) => `This may be a ${c.claimType} claim. A free consult can tell you for sure.`,
  unclear: (c) => `This could be a ${c.claimType} matter — a quick free consult is the way to know.`,
};

/** Produce the honest screen from a person's own account of what happened. Never throws; an unknown
 *  category is the one hard refusal (we won't screen something we have no basis to speak to). */
export function screenClaim(s: IncidentSignals): { ok: true; screen: ClaimScreen } | { ok: false; reason: string } {
  const cat = categoryById(s.category);
  if (!cat) return { ok: false, reason: 'We don’t recognize that situation yet — the safest step is a free consult with a lawyer.' };

  const { verdict, reasons } = assessVerdict(s);
  const clock = assessClock(s, cat);

  const screen: ClaimScreen = {
    category: cat,
    headline: HEADLINE[verdict](cat),
    verdict,
    reasons,
    missedInsight: cat.missedInsight,
    clock,
    nextStep: 'Talk to an injury lawyer — it’s free to ask, and they only get paid if you do.',
    disclaimers: [NOT_ADVICE, NO_COST],
  };
  return { ok: true, screen };
}

/** The zero-input surface: the "did you know these are claims?" catalog the page shows before the
 *  person types anything. Pure passthrough of the catalog with just the fields the cards need. */
export function commonlyMissedClaims(): Array<Pick<ClaimCategory, 'id' | 'label' | 'missedInsight'>> {
  return CLAIM_CATALOG.map((c) => ({ id: c.id, label: c.label, missedInsight: c.missedInsight }));
}
