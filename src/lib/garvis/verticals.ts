// src/lib/garvis/verticals.ts
// THE DOMAIN INTELLIGENCE LAYER — pure (verified by verticals.verify.ts).
// expertise.ts answers "what does a social studio / direct-mail area / intel area know?"
// This file answers the other half: "what does GARVIS know about THIS INDUSTRY?" A real
// estate world must arrive knowing CMA methodology and Fair Housing rules; a finance world
// must arrive knowing the due-diligence ladder and the SEC Marketing Rule; a restaurant
// world must arrive knowing menu engineering and that Google Business Profile IS the
// storefront. Verticals are detected DETERMINISTICALLY from the World DNA (same words in,
// same vertical out — no model call), and every overlay obeys the house honesty rule:
// frameworks and industry structure, never invented figures; where a number belongs the
// text says to fill it from a Market Intelligence scan or the operator's records.
// Compliance content below was verified against current guidance (mid-2026): HUD's
// digital-advertising guidance (targeting ad DISTRIBUTION by protected class is illegal),
// the SEC Marketing Rule testimonial/performance regime (Dec-2025 risk alert), and the
// TCPA baseline after the one-to-one consent rule was vacated (Jan 2025) — marketing
// texts/robocalls still require prior express written consent.

import type { Archetype, Flavor } from './workweb';

export interface SeedArtifact { slug: string; kind: 'doc' | 'research' | 'post'; title: string; detail: string }

export const H = (s: string) => `${s}\n${'—'.repeat(Math.min(s.length, 60))}`;
export const NOTE = '\n\n(Framework — expert structure, not measured data. Where a number belongs, run a Market Intelligence scan or use your records; Garvis never invents figures.)';

// ---------------------------------------------------------------------------
// Vertical detection — deterministic, keyword-scored, verified
// ---------------------------------------------------------------------------

export type Vertical =
  | 'real_estate' | 'finance' | 'creative' | 'food' | 'ecommerce' | 'services'
  | 'health' | 'home_services' | 'education' | 'tech' | 'events' | 'nonprofit'
  | 'retail' | 'generic';

export const VERTICALS: Vertical[] = [
  'real_estate', 'finance', 'creative', 'food', 'ecommerce', 'services',
  'health', 'home_services', 'education', 'tech', 'events', 'nonprofit', 'retail', 'generic',
];

// Order = tie-break priority (first listed wins on equal score). Tokens are matched as
// substrings of the lowercased signal text; multi-word tokens are the disambiguators
// ("online store" scores ecommerce before "store" can score retail).
const SIGNALS: [Vertical, string[]][] = [
  ['real_estate', ['real estate', 'realtor', 'realty', 'broker', 'listing', 'mls', 'property manage', 'properties', 'homes for sale', 'home buyer', 'home seller', 'house flip']],
  ['ecommerce', ['ecommerce', 'e-commerce', 'online store', 'online shop', 'shopify', 'etsy', 'dtc', 'd2c', 'dropship', 'marketplace seller', 'amazon seller']],
  ['finance', ['financial', 'finance', 'invest', 'wealth', 'advisor', 'adviser', 'portfolio', 'trading', 'trader', 'hedge fund', 'equity research', 'stocks', 'etf', 'bookkeeping', 'tax prep', 'accounting', 'cpa', 'credit repair', 'lending', 'mortgage']],
  ['health', ['clinic', 'dental', 'dentist', 'chiroprac', 'physical therapy', 'therapist', 'counseling', 'wellness', 'med spa', 'medspa', 'medical', 'health', 'gym', 'fitness', 'personal train', 'yoga', 'nutrition']],
  ['home_services', ['plumb', 'hvac', 'roofing', 'roofer', 'landscap', 'lawn care', 'remodel', 'renovation', 'general contractor', 'handyman', 'cleaning service', 'house cleaning', 'electrician', 'pest control', 'pressure wash', 'house painting', 'painting company', 'garage door', 'pool service']],
  ['food', ['restaurant', 'cafe', 'coffee', 'bakery', 'catering', 'caterer', 'food truck', 'bar ', 'brewery', 'winery', 'chef', 'menu', 'pizzeria', 'deli', 'ice cream']],
  ['events', ['wedding', 'event plan', 'venue', 'conference', 'festival', 'dj ', 'party rental', 'event space', 'photobooth', 'banquet']],
  ['creative', ['artist', 'art ', 'gallery', 'fine art', 'sculpt', 'illustrat', 'mural', 'photograph', 'painter', 'paintings', 'musician', 'band ', 'design studio', 'tattoo', 'ceramic', 'jewelry maker', 'woodwork']],
  ['education', ['tutor', 'course', 'coaching', 'coach ', 'school', 'academy', 'bootcamp', 'teacher', 'education', 'training program', 'curriculum', 'lessons', 'workshop']],
  ['tech', ['saas', 'software', 'app ', 'startup', 'platform', 'api ', 'developer', 'ai product', 'ai tool', 'automation tool', 'tech company', 'it services', 'web agency', 'web development']],
  ['nonprofit', ['nonprofit', 'non-profit', 'charity', 'charitable', 'donation', 'donor', 'ngo', 'foundation', 'church', 'ministry', 'rescue', 'volunteer']],
  ['services', ['law firm', 'attorney', 'lawyer', 'legal', 'consulting', 'consultant', 'agency', 'insurance', 'staffing', 'recruiting', 'notary', 'architect', 'engineering firm']],
  ['retail', ['boutique', 'retail', 'storefront', 'gift shop', 'clothing store', 'bookstore', 'thrift', 'florist', 'shop ']],
];

/** Deterministic vertical detection: score = keyword hits; ties break by SIGNALS order;
 *  zero hits → 'generic'. Feed it every text fact the world knows about itself
 *  (DNA businessType + value proposition + ideal customers + name/craft/offerings). */
export function detectVertical(text: string): Vertical {
  const t = ` ${(text || '').toLowerCase()} `;
  let best: Vertical = 'generic';
  let bestScore = 0;
  for (const [v, tokens] of SIGNALS) {
    let score = 0;
    for (const tok of tokens) if (t.includes(tok)) score++;
    if (score > bestScore) { best = v; bestScore = score; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The packs — industry knowledge a seasoned operator carries in their head
// ---------------------------------------------------------------------------

interface VerticalPack {
  brief: SeedArtifact;                                   // intel: how this industry actually works
  intel?: SeedArtifact[];                                // domain research frameworks
  audience?: SeedArtifact[];
  loop?: SeedArtifact[];
  ledger?: SeedArtifact[];
  launch?: SeedArtifact[];                               // domain compliance — the expensive mistakes
  studio?: Partial<Record<Flavor, SeedArtifact[]>>;      // domain content angles per studio flavor
}

const REAL_ESTATE: VerticalPack = {
  brief: {
    slug: 're-industry-brief', kind: 'research', title: 'How real estate marketing actually works',
    detail: `${H('The operating truths for {{business_name}}')}
HOW CLIENTS CHOOSE: this is a referral-and-trust industry. Most sellers interview very few
agents; the winner is usually the one they already knew of. Marketing's job is to be KNOWN in
a specific patch before the listing decision, not to win a comparison at the moment of it.
CHANNELS, RANKED BY LEVERAGE: 1) past clients + referrals (protect with systematic touches),
2) a geographic farm you can own, 3) Google Business Profile + reviews, 4) proof content
(just-sold, market updates) on social, 5) direct mail to the farm, 6) open houses as lead
capture. Paid leads are the most expensive and least loyal — last resort, not foundation.
SEASONALITY: listings cluster in spring, slow deep winter (verify against local MLS data —
markets differ). Farm BEFORE the season: sellers shortlist agents weeks ahead.
THE NUMBERS THAT MATTER: appointments set, listings taken, list-to-sale %, days-on-market vs
market average, GCI, cost per appointment by channel. Fill from your MLS and records.
WATCH OUT: Fair Housing violations in ads (see the launch checklist) and buying leads before
mining your own sphere — the database you already have outperforms cold leads.${NOTE}`,
  },
  intel: [
    {
      slug: 're-cma-framework', kind: 'research', title: 'CMA — comparative market analysis method',
      detail: `${H('The method (fill every value from MLS data)')}
1) COMPS: 3-6 SOLD properties, ideally ≤90 days old and ≤1 mile (expand time/rings only when
   inventory forces it — and say so in the CMA). Similar beds/baths/GLA/lot/age/condition.
2) ADJUST from the comp toward the subject: living area, beds/baths, garage, lot, condition,
   remodel recency. Adjustment values come from local paired-sales data, not gut feel.
3) PENDINGS show where the market is GOING; ACTIVES are the competition, not the value.
4) ABSORPTION: solds per month ÷ current actives = months of supply. Rule of thumb (label it
   as one): under ~3 months favors sellers, ~3-6 balanced, over ~6 favors buyers.
5) Never average price-per-sqft across dissimilar homes — it hides more than it shows.
OUTPUT: a suggested range + the story ("priced at X because comps A/B/C, adjusted for …").${NOTE}`,
    },
    {
      slug: 're-farming-framework', kind: 'research', title: 'Geographic farming framework',
      detail: `${H('Pick a farm you can actually own')}
CHOOSE: a neighborhood where (a) annual turnover looks healthy (heuristic: ~6-8%+ — compute
it: sales last 12mo ÷ total homes, from MLS), (b) no single agent already dominates signs and
mail, (c) price band × turnover supports the math (mail cost vs one commission).
OWN IT: monthly presence minimum — alternate market-update mail, just-listed/just-sold cards,
and a genuinely useful neighborhood piece. Same face, same patch, every month; farming pays
in quarters, not weeks. Track: calls/QR scans per drop, appointments, listings from the farm.${NOTE}`,
    },
  ],
  launch: [
    {
      slug: 're-fair-housing-checklist', kind: 'doc', title: 'Fair Housing ad compliance — read before any campaign',
      detail: `${H('The rules that end careers when ignored')}
The Fair Housing Act protects: race, color, religion, national origin, sex, disability,
familial status (plus state/local additions — check yours).
□ DESCRIBE THE PROPERTY, NEVER THE BUYER. "Great for young families" is a violation shape;
  "4BR near parks and schools" is fine.
□ AD TARGETING COUNTS AS ADVERTISING: per HUD's digital-platform guidance it is illegal to
  target or exclude the DISTRIBUTION of housing ads by protected class (age, sex, family
  status, ethnicity…). Target by geography and housing interest only.
□ No steering language ("perfect neighborhood for…"); use the Equal Housing logo/slogan;
  include broker identification per your state license rules.
□ Calling/texting expireds & FSBOs: scrub against the Do-Not-Call registry; marketing texts
  and robocalls require prior express written consent (TCPA). MLS/IDX data has usage rules —
  follow your board's display policy.
When in doubt, have your broker review the piece BEFORE it queues for approval.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 're-kpi-addendum', kind: 'doc', title: 'Real estate KPIs — what to count',
      detail: `${H('Count these, by channel, from your MLS + records')}
Appointments set → listings taken → listings sold (the funnel). List-to-sale ratio vs market.
Your average DOM vs market DOM. GCI per quarter. Cost per appointment: farm mail, open
houses, online leads — computed, compared, and the loser cut. Referral share of business
(the health metric: if it shrinks while volume grows, you're renting growth, not building it).${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 're-followup-truths', kind: 'doc', title: 'Real estate follow-up truths',
      detail: `${H('Where deals actually come from')}
SPEED-TO-LEAD: online inquiries decay in minutes, not days — respond same-hour or lose them
(heuristic; measure your own response-time → appointment correlation).
LONG CYCLES: sellers think 6-24 months ahead. A "not now" is a nurture asset: monthly value
touch (market update, not "just checking in"). Annual home-value review for every past
client — it's the listing-appointment machine and the referral prompt in one.
Anniversary + tax-season touches for past buyers. Every promise gets a dated next step.${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 're-social-angles', kind: 'doc', title: 'Real estate content that works',
      detail: `${H('Formats (rotate; all filled with REAL local data)')}
1) MARKET UPDATE (monthly): 3 numbers from your MLS — median sold, DOM, months of supply —
   each with one line of "what this means if you're buying/selling here". Cite the source.
2) JUST LISTED/SOLD reels: hook with the price or one striking feature in the first 2s,
   3 best rooms, end on "curious what yours would go for?".
3) NEIGHBORHOOD SPOTLIGHT: the coffee shop, the park, the commute — sell the patch you farm.
4) PROCESS MYTHS: "what actually happens at closing", "what staging does and doesn't do".
5) CLIENT STORY (with written permission): the problem, the plan, the result — no addresses
   or terms without consent. Fair Housing rules apply to every caption (see launch checklist).${NOTE}`,
    }],
    ads: [{
      slug: 're-ads-rules', kind: 'doc', title: 'Housing ads — the platform rules that end accounts',
      detail: `${H('Before spending a dollar (verified against current platform policy)')}
HOUSING IS A SPECIAL AD CATEGORY on Meta and restricted on Google: ads about housing sales,
rentals, or financing MUST be declared as such, which REMOVES age/gender/zip-level targeting —
you target broad geography + interests only. Running housing ads undeclared is how accounts get
banned and Fair Housing complaints get filed.
□ Declare the Special Ad Category (Meta) / follow personalized-ads housing policy (Google).
□ Copy describes the PROPERTY/SERVICE, never the buyer ("great for young families" fails both
  the platform and the law). Equal Housing logo in creative where required; broker ID always.
□ Location targeting: radius/region only — never exclusionary patterns.
□ Every final URL carries ?src=meta-ads or ?src=google-ads so leads land attributed in YOUR
  ledger — platform-reported results flatter themselves; your form counts are the truth.${NOTE}`,
    }],
    direct_mail: [{
      slug: 're-mail-angles', kind: 'doc', title: 'Real estate mail that gets kept',
      detail: `${H('The pieces that survive the counter-sort')}
JUST SOLD: "SOLD in {{locale}} — 12 days, over ask" style proof (only real numbers from your
own sales) + "curious what yours would go for?" + QR to a home-value request.
MARKET UPDATE CARD: the 3-number monthly snapshot — positions you as the data source.
EXPIRED/FSBO LETTERS: empathy first (their listing failed / their plan is brave), then a
SPECIFIC plan ("here are 3 things I'd change about how it was marketed") — never disparage
the previous agent. Hand-addressed envelopes get opened.
All pieces: broker ID, Equal Housing logo, one CTA.${NOTE}`,
    }],
  },
};

const FINANCE: VerticalPack = {
  brief: {
    slug: 'fin-industry-brief', kind: 'research', title: 'How finance businesses actually grow',
    detail: `${H('The operating truths for {{business_name}}')}
TRUST IS THE PRODUCT: nobody hires money help from a stranger's ad. Growth = demonstrated
thinking (research, education) + referral loops + centers of influence (CPAs, attorneys,
bankers who already hold client trust and can lend it).
CHANNELS, RANKED: 1) referrals + COI relationships, 2) a consistent research/education
publication (newsletter — the owned asset), 3) LinkedIn long-form + webinars, 4) speaking/
local groups. Cold paid acquisition is expensive and converts slowly here.
CADENCE: markets give you a reason to publish EVERY week — the discipline is consistency
and a repeatable format, not brilliance on demand.
NUMBERS THAT MATTER: subscribers + growth rate, meetings booked, meeting→client rate,
retention, revenue per client. Fill from your records.
WATCH OUT: compliance is not optional decoration — see the launch checklist. One
non-compliant testimonial or performance claim costs more than a year of marketing wins.${NOTE}`,
  },
  intel: [
    {
      slug: 'fin-duediligence-ladder', kind: 'research', title: 'Company due-diligence ladder',
      detail: `${H('Work top to bottom; every claim needs a source')}
1) BUSINESS: what do they sell, to whom, why do customers stay? Unit economics in one line.
2) FILINGS: 10-K (business + risk factors first), latest 10-Q, proxy (incentives!), then
   2-3 earnings call transcripts — management's words vs later results is the honesty test.
3) RATIOS (compute, compare to 3 peers + the firm's own 5-year history — levels lie, trends
   talk): liquidity (current/quick), leverage (debt/equity, interest coverage), profitability
   (gross → operating → net margin, ROIC), efficiency (inventory + receivable turns).
4) MOAT TAXONOMY: network effects, switching costs, scale economics, brand, IP/regulatory.
   Name which one — "great company" is not a moat.
5) RED FLAGS: receivables growing faster than revenue, serial "one-time" charges, auditor
   changes, related-party deals, guidance walked down while insiders sell.
Every number in your memo traces to a filing, dataset, or scan — never memory.${NOTE}`,
    },
    {
      slug: 'fin-thesis-memo', kind: 'research', title: 'Thesis memo structure',
      detail: `${H('One page, this order')}
THESIS (one sentence: what the market misprices and why you see it). VARIANT VIEW (what
consensus believes; why you differ — if you can't state consensus, you don't have a variant
view). CATALYSTS (what makes the gap close, with rough dates). VALUATION (base/bull/bear
with the assumption that drives each — from your model, never invented here). RISKS (top 3,
each with the evidence that would confirm it). KILL CRITERIA (the pre-committed facts that
mean you're wrong — written BEFORE entry, honored after). Review every memo against
outcomes quarterly: the hit rate on kill-criteria honesty is the whole game.${NOTE}`,
    },
    {
      slug: 'fin-macro-dashboard', kind: 'research', title: 'Macro dashboard — what to watch',
      detail: `${H('The recurring reads (pull live values from primary sources)')}
RATES: policy rate path + the 2s/10s curve (inversion history is context, not prophecy).
INFLATION: CPI + core PCE trend, 3-month annualized vs 12-month. LABOR: payrolls trend,
claims, wage growth. CREDIT: high-yield spreads (the market's fear gauge). HOUSING: starts +
mortgage rates. Each read: the number, the trend, ONE line on what it changes for your
audience. Sources: Fed/BLS/BEA releases — link them in every piece; never quote from memory.${NOTE}`,
    },
  ],
  launch: [
    {
      slug: 'fin-compliance-checklist', kind: 'doc', title: 'Finance marketing compliance — read first',
      detail: `${H('The rules (verified against current SEC guidance)')}
□ EVERY public piece: "educational, not investment advice; not an offer or recommendation" —
  and mean it (no individualized recommendations outside an advisory relationship).
□ If you are (or become) a registered investment adviser, the SEC MARKETING RULE governs:
  testimonials/endorsements require CLEAR AND PROMINENT disclosure AT the moment shown —
  is the promoter a client? compensated? conflicts? — plus a written agreement unless the
  promoter is an affiliate or de-minimis (≤$1,000/12mo). Hyperlinked disclosures were
  flagged as insufficient in the SEC's Dec-2025 risk alert.
□ PERFORMANCE: gross must be accompanied by net, with prescribed 1/5/10-year periods;
  no cherry-picked winners; hypothetical/backtested performance needs policies and an
  audience for whom it's relevant. Keep records of every ad.
□ NEVER: guaranteed returns, "get rich", implied certainty about the future.
When unsure, a compliance review costs a day; an enforcement action costs the firm.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'fin-kpi-addendum', kind: 'doc', title: 'Finance business KPIs',
      detail: `${H('Count these from your records')}
AUDIENCE: subscribers, open/reply rates, growth rate. PIPELINE: discovery meetings booked,
meeting→client conversion, time-to-close. BOOK: clients, retention %, revenue per client,
referral share. RESEARCH HONESTY (if publishing): calls made vs kill criteria honored —
track your own hit rate publicly or don't publish calls at all.${NOTE}`,
    },
  ],
  studio: {
    ads: [{
      slug: 'fin-ads-rules', kind: 'doc', title: 'Finance ads — the restricted category rules',
      detail: `${H('Before spending (platforms + regulators both watch this category)')}
□ CREDIT/FINANCIAL PRODUCTS are special/restricted categories: Meta requires declaration
  (removing granular targeting); Google requires verification for many financial verticals and
  bans some outright. Declare honestly — undeclared finance ads get accounts banned.
□ NO promised returns, no "guaranteed", no cherry-picked performance. If you're a registered
  adviser, every ad is an advertisement under the SEC Marketing Rule — testimonial and
  performance rules apply to the AD too, not just the site.
□ Required disclosures belong IN the ad or one click away, not buried.
□ Track with ?src= final URLs; measure cost per qualified conversation, not clicks.${NOTE}`,
    }],
    email: [{
      slug: 'fin-newsletter-format', kind: 'doc', title: 'The finance newsletter format',
      detail: `${H('The repeatable weekly shape')}
ONE THESIS (the week's single idea — not a link dump), ONE CHART described in words with
its primary source linked, ONE ACTION or watch-item for the reader. 400-700 words. Same
day, same time, every week — the compounding asset is the expectation. Archive everything;
your back catalog is the trust proof new subscribers binge. Every issue carries the
educational-not-advice line (see compliance checklist).${NOTE}`,
    }],
  },
};

const CREATIVE: VerticalPack = {
  brief: {
    slug: 'art-industry-brief', kind: 'research', title: 'How creative work actually sells',
    detail: `${H('The operating truths for {{business_name}}')}
PROOF SELLS, EXPLANATION DOESN'T: buyers decide on the work + the story of the person who
made it. The portfolio IS the funnel; every channel exists to put finished work in front of
the right eyes with the maker's story attached.
WHO BUYS: collectors and repeat clients (highest value — nurture them by name), interior
designers/architects (a CHANNEL, not a customer — one relationship = many placements),
commissioners (need process trust: how it works, timeline, price shape), and gift buyers
(seasonal). Price ladder: originals → commissions → editions/prints → small goods; each rung
funds attention for the one above.
CHANNELS: Instagram as the living portfolio, an email list as the OWNED asset (announce new
work + shows to it FIRST — scarcity honesty), local shows/galleries for trust + price
anchoring, designer outreach as the B2B lane.
NUMBERS: inquiries, commission close rate, average piece value, email list growth, show ROI.
WATCH OUT: pricing by hours instead of value + scarcity; letting the algorithm own your
audience instead of the list; taking every commission (misfit commissions cost more than
they pay — say no in the brief stage).${NOTE}`,
  },
  intel: [
    {
      slug: 'art-collector-research', kind: 'research', title: 'Collector & channel research',
      detail: `${H('Find the people who already buy work like yours')}
DESIGNERS/ARCHITECTS: scan local firms' project photos (their sites, press) for art
placements in your style — those firms buy or specify art repeatedly. Build the list here.
GALLERIES/SHOWS: who shows work adjacent to yours; their artist rosters are public — note
price points listed. VENUES: hotels, restaurants, offices that feature local work (walk in,
look, note the style). Fill the actual names via Market Intelligence scans; record every
price point you can see publicly — that's your pricing evidence base.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'art-kpi-addendum', kind: 'doc', title: 'Creative business KPIs',
      detail: `${H('Count these')}
Inquiries by source. Commission close rate + average value. Email list size/growth (the
owned-audience metric). Show/market ROI (sales + commissions traced − fees − time). Repeat
collector share. Time-per-piece vs price (the honest hourly — it decides the price ladder).${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'art-social-angles', kind: 'doc', title: 'Creative content that converts',
      detail: `${H('The formats that sell work (not just get likes)')}
1) REVEAL: finished piece, best light, one line of story. 2) PROCESS: 15-30s of hands
working — the highest-trust format in the medium. 3) IN SITU: the piece living in a real
space (this is what commissioners need to see). 4) COMMISSION EXPLAINER: how it works,
timeline, "pricing from…" (real floor only — never invent). 5) THE STORY: {{principal}} on
why — one chapter at a time. Post the work, tag the placement city, and always route
serious interest to email/inquiry (the list is the asset, the algorithm is a landlord).${NOTE}`,
    }],
  },
};

const FOOD: VerticalPack = {
  brief: {
    slug: 'food-industry-brief', kind: 'research', title: 'How restaurants actually fill seats',
    detail: `${H('The operating truths for {{business_name}}')}
GOOGLE BUSINESS PROFILE IS THE STOREFRONT: most local "where to eat" decisions are made on
Maps — photos, hours, menu link, review score and RESPONSES. Keep it more current than the
website. Local rankings run on relevance + distance + prominence; reviews and fresh photos
are the parts you control.
THE ECONOMICS: margins live and die on food cost % and repeat rate. A regular is worth many
first-timers; delivery platforms buy reach with your margin (their commission eats it) —
use them for discovery, own the reorder (direct line, list, loyalty).
CHANNELS: 1) GBP + reviews, 2) the food itself photographed honestly (UGC + your own), 3)
a list/SMS club for regulars (own the relationship), 4) local partnerships + events, 5)
press for openings/menu changes.
SEASONALITY: holidays, patio season, local events calendar — plan the specials calendar a
month ahead. NUMBERS: covers, average check, food cost %, repeat rate, review velocity.
WATCH OUT: discounting to strangers while regulars pay full price (invert it), and letting
review responses lapse — the response is marketing to every future reader, not the reviewer.${NOTE}`,
  },
  intel: [
    {
      slug: 'food-menu-engineering', kind: 'research', title: 'Menu engineering matrix',
      detail: `${H('Classify every item: popularity × contribution margin')}
Pull sales counts + item margins from your POS, then place each item:
STARS (popular + high margin): feature them — box, photo, top-right placement, server pitch.
PLOWHORSES (popular + low margin): re-engineer cost or nudge price; never lead with them.
PUZZLES (unpopular + high margin): rename, describe better, reposition, have servers offer.
DOGS (unpopular + low margin): cut them — menu length costs kitchen speed and choice stress.
Re-run quarterly and after any supplier price change. Descriptions sell: provenance + prep
("wood-fired", the farm's name) outperforms adjectives ("delicious").${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'food-review-playbook', kind: 'doc', title: 'Reviews & regulars playbook',
      detail: `${H('The loop that compounds')}
REVIEWS: respond to ALL of them — thank the good specifically, and for the bad: acknowledge,
never argue, take it offline, state the fix. You're writing for the thousand future readers.
ASK at the peak moment (great table, happy party) — a card/QR at the check, not a beg.
REGULARS: capture them (loyalty punch, SMS club with a real perk); reorder nudges for
delivery natives; win-back note after a long absence. Track repeat rate monthly.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'food-kpi-addendum', kind: 'doc', title: 'Restaurant KPIs',
      detail: `${H('Count these from POS + platforms')}
Covers by daypart. Average check. Food cost % (and prime cost = food + labor). Repeat rate.
Review velocity + rating trend by platform. Delivery platform share of revenue AND its
effective margin after commission (the honest number). Special/event nights: incremental
covers vs a normal night, not gross.${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'food-social-angles', kind: 'doc', title: 'Food content that fills tables',
      detail: `${H('Shoot the food, not the logo')}
1) THE DISH: close, natural light, steam/pull/pour motion — 10-15s, no narration needed.
2) THE SPECIAL: weekly format, same day each week ("Thursday's special is…") — trains the
   audience to check. 3) THE PEOPLE: chef hands, staff picks, regulars (with permission).
4) THE SOURCE: the farm/market run — provenance is the premium story. 5) UGC: repost every
   decent tag with credit; make the ask visible ("tag us"). Always: location tagged, hours
   current, link to menu — every post is also a Maps signal.${NOTE}`,
    }],
  },
};

const ECOMMERCE: VerticalPack = {
  brief: {
    slug: 'ecom-industry-brief', kind: 'research', title: 'How e-commerce actually compounds',
    detail: `${H('The operating truths for {{business_name}}')}
ONE EQUATION: revenue = sessions × conversion rate × AOV. Every initiative must name which
lever it pulls; "brand awareness" that maps to no lever is a cost, not a strategy.
OWNED BEATS RENTED: email/SMS flows are the highest-ROI system in the stack — build flows
BEFORE scaling paid traffic (paid without flows is filling a leaky bucket).
CONVERSION FUEL: reviews with photos, UGC, a guarantee that removes the risk, product pages
built for objections (see the landing playbook). PAID: a testing ladder, not a faucet —
small creative tests, kill fast, scale the survivor; judge on contribution after ad spend,
not platform-reported ROAS alone.
NUMBERS: CR, AOV, repeat purchase rate, email share of revenue, contribution margin after
ads, CAC vs LTV (compute honestly; platform attribution flatters itself).
WATCH OUT: discount addiction (trains the list to wait), and scaling spend before repeat
rate proves people actually want the product twice.${NOTE}`,
  },
  intel: [
    {
      slug: 'ecom-competitor-teardown', kind: 'research', title: 'Competitor teardown framework',
      detail: `${H('For each of 3-5 competitors (fill via scans)')}
OFFER: hero product, price points, shipping threshold, guarantee, bundle structure.
PAGE: what's above the fold, what proof they lead with, their objection handling.
REVIEWS (theirs): mine 1-3 star reviews for unmet needs — that's your ad copy and product
roadmap, written by their customers. TRAFFIC ANGLES: what keywords/creatives they run
(public ad libraries). Your wedge: the one objection they don't answer that you can.${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'ecom-flow-stack', kind: 'doc', title: 'The email/SMS flow stack',
      detail: `${H('Build in this order (each flow earns before the next)')}
1) WELCOME (3-5 emails): story → best sellers → social proof → first-purchase nudge. The
   highest-converting flow you'll ever build.
2) ABANDONED CART (3): reminder (hours later) → objection/proof (next day) → incentive
   ONLY as the last resort (or you train cart-abandonment-for-coupons).
3) POST-PURCHASE: how to use/care → review + photo ask at the right day → cross-sell.
4) WIN-BACK (after your typical reorder window — compute it from order data).
Cadence heuristics — adjust to YOUR data. Campaigns on top: launches, seasonal, back-in-stock.${NOTE}`,
    },
  ],
  launch: [
    {
      slug: 'ecom-claims-compliance', kind: 'doc', title: 'Claims & reviews compliance',
      detail: `${H('FTC rules that actually get enforced')}
□ ENDORSEMENTS: any material connection (free product, payment, affiliate) must be clearly
  disclosed by the endorser — "#ad" visible, not buried.
□ REVIEWS: never fake, never suppress negatives selectively, never incentivize only
  positive reviews; incentivized reviews must say so.
□ RESULTS CLAIMS: "results" imply TYPICAL results — atypical outcomes need clear context.
□ Email/SMS: honor opt-outs promptly (CAN-SPAM), physical address in every email; marketing
  texts require prior express written consent (TCPA) — checkbox at capture, records kept.
□ Shipping promises you can't keep are FTC territory too (Mail Order Rule). Under-promise.${NOTE}`,
    },
  ],
  studio: {
    landing: [{
      slug: 'ecom-product-page', kind: 'doc', title: 'Product page anatomy',
      detail: `${H('Above the fold')}
Gallery (lifestyle first, then detail shots, a short video if you have one) · title that
names the OUTCOME · price with shipping signal ("free over…") · primary CTA · one-line
trust row (guarantee, shipping time, review stars).
${H('Below the fold, in order')}
Benefits before specs (what it does for them, then the table) · UGC/photo reviews · the
objection FAQ (price, fit, durability, "vs the cheap one") · the guarantee spelled out ·
cross-sell. One page, one product, one primary CTA — everything else is a distraction tax.${NOTE}`,
    }],
  },
};

const SERVICES: VerticalPack = {
  brief: {
    slug: 'svc-industry-brief', kind: 'research', title: 'How professional services actually grow',
    detail: `${H('The operating truths for {{business_name}}')}
EXPERTISE IS INVISIBLE UNTIL DEMONSTRATED: the firm that SHOWS its thinking (case studies,
teardowns, checklists) wins over the one that claims quality. Authority content is the
long game; referrals are the short one — run both.
THE REFERRAL ENGINE: map your centers of influence (the accountants, attorneys, bankers,
agencies serving your same clients) — a COI relationship pays repeatedly. Ask at the peak-
satisfaction moment, make referring easy (one-line intro they can forward).
POSITIONING: a niche is pricing power. "Employment law for restaurants" out-earns "law".
The narrower the promise, the shorter the sales cycle.
FUNNEL: content/referral → consult → proposal → engagement. Most money dies between consult
and signed proposal — see the loop playbook.
NUMBERS: consults booked, consult→engagement rate, average engagement value, referral share,
realization (billed vs worked). WATCH OUT: professional advertising rules (bar/board rules
on testimonials and outcome claims vary by state — check yours before publishing).${NOTE}`,
  },
  intel: [
    {
      slug: 'svc-coi-map', kind: 'research', title: 'Centers-of-influence map',
      detail: `${H('The B2B referral lattice (fill names via scans + your network)')}
List every profession that serves your ideal client BEFORE/BESIDE you (their accountant,
lender, broker, agency…). For each: 3 named firms, what a good referral looks like IN BOTH
DIRECTIONS (you must be able to send business back), one warm path in. Cadence: quarterly
value touch (send them a client, an insight, an intro — not a "checking in"). Track
referrals given vs received per COI — reciprocity is the maintenance metric.${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'svc-consult-followup', kind: 'doc', title: 'Consult → engagement follow-up',
      detail: `${H('Where proposals go to die, and the cadence that saves them')}
SAME DAY: recap email — their problem in THEIR words, the 2-3 options discussed, what
happens next with a date. 48H: the proposal (short: situation, plan, price, start date —
long proposals signal hourly thinking). 5-7D: one gentle nudge with a NEW piece of value
(relevant case, insight), not "did you see my proposal". THEN: a dated decision ask.
No response after that: monthly nurture, stay warm — services buyers move on THEIR trigger.
Cadences are heuristics; measure your own close-vs-touch curve.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'svc-kpi-addendum', kind: 'doc', title: 'Services firm KPIs',
      detail: `${H('Count these')}
Consults booked by source. Consult→engagement %. Average engagement value. Referral share
(and given-vs-received per COI). Realization + utilization if billing time. Content→consult
attribution (ask every consult "how did you find us" and WRITE IT DOWN — the cheapest
attribution system ever built).${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'svc-authority-formats', kind: 'doc', title: 'Authority content formats',
      detail: `${H('Show the thinking (LinkedIn-first for B2B)')}
1) CASE TEARDOWN: anonymized client problem → the 3 decisions that fixed it → the result
   (numbers only with permission). 2) THE CHECKLIST: "what I check first when X happens" —
   generously complete; the reader who can DIY was never a client. 3) CONTRARIAN-WITH-
   EVIDENCE: an industry default you disagree with and the cases that changed your mind.
4) FAQ: one real client question per post, answered fully. 5) THE PROCESS: what working
   with you actually looks like, step by step — it pre-sells the consult.${NOTE}`,
    }],
  },
};

const HEALTH: VerticalPack = {
  brief: {
    slug: 'health-industry-brief', kind: 'research', title: 'How health & wellness practices grow',
    detail: `${H('The operating truths for {{business_name}}')}
TRUST + CONVENIENCE WIN: patients choose on reviews, referrals, insurance fit, and how easy
booking is — online scheduling is a growth feature, not IT.
CHANNELS: 1) Google Business Profile + review velocity (the local decision surface), 2)
physician/practitioner referral relationships, 3) education content (the practitioner who
teaches is the one trusted), 4) local community presence. Paid works for high-intent
searches ("near me") — measure cost per BOOKED patient, not per click.
THE HIDDEN REVENUE: recalls and reactivation — filled schedules come from the existing
patient base before new acquisition. No-shows are a solvable systems problem (reminder
ladder), not weather.
NUMBERS: new patients by source, show rate, reactivation rate, reviews velocity, revenue
per visit. WATCH OUT: HIPAA applies to MARKETING too — see the compliance checklist before
posting anything involving a patient. One violation outweighs years of content.${NOTE}`,
  },
  launch: [
    {
      slug: 'health-marketing-compliance', kind: 'doc', title: 'Health marketing compliance — read first',
      detail: `${H('The lines you cannot cross')}
□ HIPAA: using patient information (including photos, stories, even confirming someone IS
  a patient) in marketing requires prior WRITTEN authorization — testimonials and
  before/after images included. Replying to a public review must never confirm or reveal
  patient status or details.
□ CLAIMS: health claims need substantiation (FTC) — "may help" without evidence is still a
  claim. No outcome guarantees, no "cure" language outside evidence.
□ Scope-of-practice and board advertising rules vary by state and license — check yours
  for testimonial and title rules. Marketing texts/reminders: consent basics still apply
  (TCPA for marketing texts; treatment reminders are treated differently — get consent at
  intake anyway).${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'health-recall-playbook', kind: 'doc', title: 'Recall, reactivation & no-show playbook',
      detail: `${H('The schedule fills from the inside')}
REMINDER LADDER: booking confirmation → reminder days out → same-day reminder (channels per
patient consent). Measure show rate before/after — the ladder pays for itself.
RECALL: every visit ends with the next one proposed and booked. Overdue list worked weekly.
REACTIVATION: patients unseen past their normal interval get a personal "we have openings
this month" note — not a discount blast. WIN-BACK honesty: some left for a reason; a
one-question "anything we could have done better?" recovers relationships and surfaces
operational fixes.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'health-kpi-addendum', kind: 'doc', title: 'Practice KPIs',
      detail: `${H('Count these from your PMS')}
New patients by source (ask at intake, record it). Show rate. Recall compliance %
(patients rebooked before leaving). Reactivation rate. Review velocity + rating trend.
Revenue per visit + schedule utilization. Cost per BOOKED patient by channel.${NOTE}`,
    },
  ],
  studio: {
    ads: [{
      slug: 'health-ads-rules', kind: 'doc', title: 'Health ads — platform + privacy rules',
      detail: `${H('Before spending (the rules platforms actually enforce)')}
□ NO PERSONAL-ATTRIBUTE TARGETING OR COPY: ads may not imply knowledge of a person's health
  ("struggling with back pain?" addressed at the reader fails Meta's personal-attributes policy
  — describe the SERVICE, not the reader's condition).
□ Claims need substantiation (FTC); no outcome guarantees, no before/after in ads without the
  platform's and your board's approval; prescription/regulated services have extra gates.
□ Landing pages: no PHI collected without proper safeguards; your instrumented lead form takes
  name/contact/message only — keep health details OUT of the form.
□ Track with ?src= final URLs; judge on measured leads, never platform-reported "results".${NOTE}`,
    }],
    social: [{
      slug: 'health-content-formats', kind: 'doc', title: 'Health content that builds trust',
      detail: `${H('Educate — never expose')}
1) MYTH VS FACT: one misconception per post, corrected with evidence. 2) WHAT TO EXPECT:
   walk through a first visit — it removes the fear that blocks booking. 3) THE QUESTION
   BOX: answer real (anonymized, generalized) questions. 4) MEET THE TEAM: credentials +
   the human reason they do this. 5) SEASONAL: timely topics (sports season, allergies,
   new-year rehab). NEVER patient stories/images without written authorization on file —
   see the compliance checklist. Every post: "education, not medical advice; see a
   provider" framing.${NOTE}`,
    }],
  },
};

const HOME_SERVICES: VerticalPack = {
  brief: {
    slug: 'home-industry-brief', kind: 'research', title: 'How home services actually win jobs',
    detail: `${H('The operating truths for {{business_name}}')}
URGENCY + TRUST: half the market needs it NOW (search + Maps + reviews decide), half is
planned work (referrals + proof decide). Cover both: own the local search surface AND the
neighborhood reputation.
CHANNELS: 1) Google Business Profile + review velocity (respond to every review), 2)
referrals + yard signs + neighborhood groups, 3) before/after proof content, 4) LSA/paid
search for the urgent lane — measured on cost per BOOKED job.
THE MONEY LEAK: quotes without follow-up. Most contractors quote and pray; the one who
follows up politely wins jobs priced HIGHER than silent competitors — see the loop playbook.
SEASONALITY: every trade has a demand calendar (pre-season tune-ups, post-storm surges,
fall prep) — plan campaigns a season AHEAD, and sell next season's slots in this one.
NUMBERS: leads by source, quote→close %, average ticket, review velocity, callback rate.
WATCH OUT: displaying license/bonding wrong (state rules), and pricing from fear — the
review moat you're building IS the pricing power; use it.${NOTE}`,
  },
  intel: [
    {
      slug: 'home-review-mining', kind: 'research', title: 'Competitor review mining',
      detail: `${H('Their 1-star reviews are your ad copy')}
For the top 5 local competitors (fill via scans): read their negative reviews and tally the
themes — no-shows, surprise pricing, mess left behind, no callbacks. Each recurring theme
becomes: (a) an explicit promise in your marketing ("on time or we call ahead — always"),
(b) an operational checklist item so YOU never earn that review. Also note their strengths —
what you must match before differentiating. Refresh quarterly.${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'home-quote-followup', kind: 'doc', title: 'Quote follow-up ladder',
      detail: `${H('Where the money is (cadence heuristics — tune to your close data)')}
QUOTE DAY: send it same-day with photos from the walkthrough + what's included/excluded.
DAY 1-2: "any questions on the quote?" — short, helpful. DAY 5-7: one piece of value
(financing option, timing note, a relevant past-job photo). DAY 14: the honest close —
"we're scheduling [period]; want your spot?". SEASONAL LIST: every "not now" gets a dated
future touch (their season). JOB DONE: the review ask ON completion day (QR card in hand,
link by text with consent) + a "next service due" date planted in the calendar.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'home-kpi-addendum', kind: 'doc', title: 'Home services KPIs',
      detail: `${H('Count these')}
Leads by source (ask every caller). Quote→close % (the follow-up metric). Average ticket.
Cost per booked job by channel. Review velocity + rating. Callback/warranty rate (the
quality flag). Season capacity sold ahead (the sleep-at-night number).${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'home-proof-formats', kind: 'doc', title: 'Proof content for the trades',
      detail: `${H('Show the work; the work sells')}
1) BEFORE/AFTER: the format the algorithm and the homeowner both love — same angle, good
   light. 2) THE SAVE: "what we found behind the wall" — problem discovered, fixed right.
3) HOW-TO-SPOT: "3 signs your [system] is about to fail" — genuinely useful, positions
   you as the honest expert. 4) CREW INTRO: the person showing up at their door, named.
5) HONEST PRICING: "what a [job] actually costs and why" using YOUR real price ranges only.
Neighborhood-tag everything — the next-door neighbor is the best lead.${NOTE}`,
    }],
  },
};

const EDUCATION: VerticalPack = {
  brief: {
    slug: 'edu-industry-brief', kind: 'research', title: 'How education businesses actually enroll',
    detail: `${H('The operating truths for {{business_name}}')}
OUTCOMES SELL, CURRICULUM DOESN'T: buyers purchase the AFTER state (the job, the grade, the
skill demonstrated). Every piece of marketing leads with the transformation and proves it
with student results (with permission + honest context).
THE FUNNEL: free value (lead magnet/workshop) → email nurture that TEACHES → enrollment
window → cohort/intake. Enrollment windows (open/close honestly) outperform evergreen for
cohort models; evergreen fits self-paced.
CHANNELS: 1) the email list (owned, primary), 2) content that demonstrates teaching quality
(a free lesson converts better than an ad), 3) student word-of-mouth + showcases, 4)
partnerships (schools, employers, communities). NUMBERS: leads, lead→enroll %, completion
rate, refund rate, testimonial pipeline. WATCH OUT: results claims — outcomes you advertise
imply TYPICAL outcomes (FTC); "students have achieved X" needs receipts and context, and
refund terms must be clear before purchase.${NOTE}`,
  },
  loop: [
    {
      slug: 'edu-launch-sequence', kind: 'doc', title: 'Enrollment sequence framework',
      detail: `${H('The open→close arc (email, over ~1-2 weeks)')}
1) THE SHIFT: the story of the problem your teaching solves (no pitch yet). 2) THE PROOF:
a student's honest before→after (permission on file). 3) THE METHOD: what's inside and WHY
it works — teach something real here. 4) OBJECTIONS: time, money, "will it work for me" —
answered straight, including who it's NOT for (the credibility multiplier). 5) THE CLOSE:
real deadline, real reason (cohort starts / doors close), no fake scarcity — fake urgency
burns the list you spent a year building. Post-close: nurture resumes; next window seeded.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'edu-kpi-addendum', kind: 'doc', title: 'Education business KPIs',
      detail: `${H('Count these')}
Leads by magnet/source. Lead→enrollment %. Revenue per enrollment window. COMPLETION RATE
(the integrity metric — completions power testimonials, referrals, and your own conscience).
Refund rate + stated reasons. Testimonial pipeline (permissioned, with context). List growth
vs churn per launch (did the launch build or burn the audience?).${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'edu-teach-formats', kind: 'doc', title: 'Teach-in-public formats',
      detail: `${H('Demonstrate the teaching; the teaching sells the course')}
1) THE MINI-LESSON: one complete, useful lesson in one post — generosity converts.
2) STUDENT SPOTLIGHT: real before→after with permission and honest context (effort, time).
3) MISTAKE AUTOPSY: "the 3 errors every beginner makes" — instantly self-qualifying.
4) LIVE Q&A/office hours clips. 5) THE SYLLABUS TEASE: what week 1 actually looks like.
Every post CTA: the free resource → the list — enrollment is sold by email, not by feed.${NOTE}`,
    }],
  },
};

const TECH: VerticalPack = {
  brief: {
    slug: 'saas-industry-brief', kind: 'research', title: 'How software businesses actually grow',
    detail: `${H('The operating truths for {{business_name}}')}
POSITIONING BEFORE PROMOTION: until you can say "for WHO, we are the only X that Y", every
channel underperforms. Category, alternative, unique capability — one sentence.
PICK YOUR MOTION HONESTLY: product-led (self-serve signup → activation → expansion) needs
a fast time-to-value product; sales-led (demo → pilot → contract) needs content that arms a
champion. Mixing both halfheartedly builds neither.
ACTIVATION BEFORE ACQUISITION: fix the leaky onboarding BEFORE buying traffic — define the
aha-moment (the action correlated with retention), instrument it, walk every new user to it.
CHANNELS: 1) content-led SEO answering the problems your product solves (compounds), 2)
comparison/alternative pages (high intent), 3) integrations + marketplaces, 4) founder-led
posting where your buyers argue. NUMBERS: signups, activation %, week-N retention, churn +
stated reasons, expansion revenue. WATCH OUT: vanity signups (activation is the real top of
funnel) and roadmap-selling (sell what ships).${NOTE}`,
  },
  intel: [
    {
      slug: 'saas-positioning-teardown', kind: 'research', title: 'Competitive positioning teardown',
      detail: `${H('For each of 3-5 competitors (fill via scans)')}
Their one-liner (homepage H1 — what category do they claim?). Pricing page structure (tiers,
what gates the upgrade, free tier shape). Their loudest proof (logos? numbers? G2 grid?).
Review mining (G2/Capterra 1-3 stars): the recurring complaint is your wedge and your
comparison-page headline. Their motion (self-serve vs demo-gated — try to sign up).
OUTPUT: the positioning gap — the buyer + job where you win outright, stated in one line.${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'saas-activation-loop', kind: 'doc', title: 'Onboarding & activation loop',
      detail: `${H('Walk every signup to the aha-moment')}
DEFINE it (the earliest action that predicts retention — from your data, not folklore).
INSTRUMENT it (event on every step of the path). THE SEQUENCE: welcome (one action, not a
feature tour) → day-N nudges keyed to what they HAVEN'T done yet (behavioral, not calendar)
→ human offer at the stall point. EXPANSION: usage-threshold triggers, not quarter-end
begging. CHURN-SAVE: exit question (one click, honest options) — the answers are the
roadmap. Measure: signup→activation %, activation→week-N retention.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'saas-kpi-addendum', kind: 'doc', title: 'SaaS KPIs',
      detail: `${H('Count these (name the definitions, keep them stable)')}
Signups by source. Activation % (your defined aha event). Week-N retention curve. MRR
movement: new / expansion / contraction / churn — separately. Churn REASONS (exit survey
text, tallied). CAC by channel vs payback period. NPS or an honest proxy. Feature adoption
of the thing you shipped last month (or why did you ship it?).${NOTE}`,
    },
  ],
  studio: {
    landing: [{
      slug: 'saas-page-anatomy', kind: 'doc', title: 'SaaS landing page anatomy',
      detail: `${H('Above the fold')}
H1 = the OUTCOME in the buyer's words (not your category jargon) · subhead = how, in one
sentence · a real product shot or 20s loop (not an illustration) · CTA matched to your
motion (self-serve: "start free" straight into value; sales-led: what happens on the call)
· proof row (logos or a number you can defend).
${H('Below')}
Three use-case blocks (persona: before → with-product) · the objection section (security,
migration, pricing transparency) · comparison anchor if you have a famous alternative ·
final CTA. Every claim on the page must survive a skeptical champion forwarding it to
their boss.${NOTE}`,
    }],
  },
};

const EVENTS: VerticalPack = {
  brief: {
    slug: 'event-industry-brief', kind: 'research', title: 'How event businesses actually sell out',
    detail: `${H('The operating truths for {{business_name}}')}
DEADLINES DO THE MARKETING: an event is a launch with a hard date — the arc (announce →
early bird → lineup/agenda reveals → last call) beats steady drip. Plan backwards from the
date with weekly beats.
THE THREE REVENUE LINES: tickets (tiered honestly — early price rewards commitment, not
fake scarcity), sponsors (sold on AUDIENCE access — see the sponsor research), and repeat/
adjacent (next event, recordings, community). CONTENT LIFECYCLE: before (why this matters,
who's coming), during (capture EVERYTHING — it's next year's marketing), after (recaps,
testimonials, save-the-date while the glow lasts).
NUMBERS: registrations by week + channel, show rate, sponsor revenue + renewal rate,
attendee NPS. WATCH OUT: venue/vendor deadlines silently define your marketing calendar —
put THEIR dates in the plan first; and comping tickets loosely trains the market to wait.${NOTE}`,
  },
  intel: [
    {
      slug: 'event-sponsor-research', kind: 'research', title: 'Sponsor prospect research',
      detail: `${H('Who sponsors events like yours (fill via scans)')}
Mine adjacent/competitor events: sponsor logos on their sites, banners in their photos,
thank-you posts — those companies have BUDGET and PRECEDENT. For each: what tier they took,
who signed it (marketing/community lead), what they seemed to want (booth? logo? talk?).
Your deck answers: audience (size, who they are — real numbers only), packages (3 tiers,
each with ONE headline benefit), proof (past sponsor outcomes with permission). Renewal is
the real business: report results to every sponsor AFTER the event, unprompted.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'event-kpi-addendum', kind: 'doc', title: 'Event KPIs',
      detail: `${H('Count these per event')}
Registrations by week (the curve tells you when to push) and by channel. Ticket revenue by
tier. Show rate. Sponsor revenue + renewal rate (the trust metric). Cost per attendee.
NPS/one-question survey at exit. Content captured (sessions recorded, photos usable) —
next year's marketing inventory, counted like money.${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'event-arc-formats', kind: 'doc', title: 'The event content arc',
      detail: `${H('Before / during / after')}
BEFORE: announcement with the ONE reason this event exists · speaker/lineup reveals (one at
a time — each is a post AND their audience) · agenda deep-dives · attendee testimonials
from last time · honest last-call at real deadlines.
DURING: stories/live clips, quotes as cards, the room's energy — capture > polish.
AFTER: recap film, best moments, thank-yous tagging sponsors (part of their package),
save-the-date within the week while attendees still glow. Every phase: registrations link
in bio, tracked per post.${NOTE}`,
    }],
  },
};

const NONPROFIT: VerticalPack = {
  brief: {
    slug: 'np-industry-brief', kind: 'research', title: 'How nonprofits actually fund the mission',
    detail: `${H('The operating truths for {{business_name}}')}
THE DONOR PYRAMID: many small gifts → recurring monthly donors (the retention gold — worth
disproportionately more than one-time) → mid-level → major gifts → legacy. Different
messages per level; the ask ladder moves people UP, not sideways.
STORY BEATS STATISTICS: one named beneficiary's story outperforms aggregate numbers — lead
with the person, support with the data (real program data only).
THE CALENDAR: grants have deadlines (build the 12-month grant calendar first), giving
seasons cluster (year-end especially) — plan appeals backwards from them.
RETENTION IS THE CRISIS: most first-time donors never give again; the thank-you (fast,
specific, human) and the impact report ("your gift did THIS") are retention machinery, not
courtesy. NUMBERS: donor retention %, average gift, monthly-donor count, grant pipeline,
cost to raise a dollar. WATCH OUT: state charitable-solicitation registration (register
where you fundraise), gift acknowledgment/receipt rules, and donor-restricted funds used
as restricted — the trust is the endowment.${NOTE}`,
  },
  intel: [
    {
      slug: 'np-grant-framework', kind: 'research', title: 'Grant research framework',
      detail: `${H('Build the 12-month pipeline (fill via scans + 990 mining)')}
FIT FIRST: funder's stated priorities, geography, grant size range, past grantees (their
990s list every grant made — mine them: who LIKE YOU got funded, for how much). Score each
prospect: mission fit / size fit / relationship path / deadline. CALENDAR: every deadline
+ LOI requirement on one page, worked backwards (drafts due internally weeks early).
RELATIONSHIP: a call or LOI conversation before the cold application, always — funded
proposals are usually pre-sold. Track: submitted → funded rate, and REUSE boilerplate
(need statement, org history, budgets) from a maintained library in the vault.${NOTE}`,
    },
  ],
  loop: [
    {
      slug: 'np-donor-retention', kind: 'doc', title: 'Donor retention playbook',
      detail: `${H('The second gift is the business model')}
THANK FAST: within days, specific ("your $X went to the winter program"), signed by a
human. RECEIPT correctly (IRS acknowledgment rules for gifts). REPORT IMPACT: quarterly
"here's what your giving did" with one story + real numbers — no ask attached (2 of 3
touches give, 1 asks). UPGRADE PATH: second-gift ask sized on the first; monthly-donor
invitation after the second gift; lapsed donors get a "we miss you + here's what happened
since" note, not a guilt trip. Track retention % like revenue — it is.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'np-kpi-addendum', kind: 'doc', title: 'Nonprofit KPIs',
      detail: `${H('Count these')}
Donor retention % (first-time and multi-year separately). Average gift + median (the
median tells the truth). Monthly recurring donors + their churn. Grant pipeline: submitted,
funded, $ weighted. Cost to raise a dollar by channel. Email list growth + engagement.
Program outcomes you can honestly attribute — the numbers the impact reports stand on.${NOTE}`,
    },
  ],
  studio: {
    email: [{
      slug: 'np-appeal-structure', kind: 'doc', title: 'Appeal & impact email structures',
      detail: `${H('The appeal (one story, one ask)')}
Open with ONE person's moment (named with permission, or anonymized honestly) → the turn
(what changed with help) → the need NOW → a specific ask with amounts tied to outcomes
("$X provides…" — real program math only) → one button. P.S. restates the ask.
${H('The impact report (no ask)')}
"Because of you": one story + 3 real numbers + a photo → "watch what's next". Send these
MORE often than appeals — the ratio is the retention lever. Year-end: plan the sequence
early (most giving clusters late — your records will show exactly when).${NOTE}`,
    }],
  },
};

const RETAIL: VerticalPack = {
  brief: {
    slug: 'retail-industry-brief', kind: 'research', title: 'How local retail actually drives traffic',
    detail: `${H('The operating truths for {{business_name}}')}
FOOT TRAFFIC IS MANUFACTURED: location gives you a baseline; events, drops, partnerships,
and a reason-to-return build the rest. The store is also media — windows, merchandising,
and the in-store moment people photograph.
CHANNELS: 1) Google Business Profile (hours/photos current — "open now" searches are
buying searches), 2) Instagram as the new-arrivals feed, 3) the list (email/SMS) for drops
and events — own your regulars, 4) local collabs (neighboring businesses share customers),
5) events (trunk shows, classes, launches) — each one is content + list growth + sales.
THE ECONOMICS: basket size and repeat visits beat raw traffic; sell-through rate by
category tells you what to reorder and what to never rebuy. NUMBERS: transactions, average
basket, repeat rate (loyalty data), sell-through, event lift vs normal days. WATCH OUT:
competing with the internet on price — curation, immediacy, and the human floor experience
are the local moat; discount rhythm trains customers to wait.${NOTE}`,
  },
  loop: [
    {
      slug: 'retail-regulars-loop', kind: 'doc', title: 'Regulars & loyalty loop',
      detail: `${H('Turn walk-ins into regulars')}
CAPTURE at checkout (loyalty signup with a REAL perk, not a form for your benefit).
THE DROP RHYTHM: new arrivals announced to the list FIRST (a real regulars' privilege),
then social. EVENT INVITES: list-only early access — attendance is loyalty compounding.
WIN-BACK: a "we got something in you'd like" personal note beats a coupon (use purchase
history). Staff picks with names build parasocial trust — people shop where they're known.
Track: repeat rate monthly, list growth weekly, redemption honestly.${NOTE}`,
    },
  ],
  ledger: [
    {
      slug: 'retail-kpi-addendum', kind: 'doc', title: 'Retail KPIs',
      detail: `${H('Count these from POS')}
Transactions + average basket by day/daypart. Repeat rate (loyalty-tracked). Sell-through
% by category + season. Inventory turns. Event days vs baseline (incremental, not gross).
List growth + campaign→visit attribution (show-this-email offers make it measurable).
Margin by category — the reorder decisions live here.${NOTE}`,
    },
  ],
  studio: {
    social: [{
      slug: 'retail-drop-formats', kind: 'doc', title: 'Retail content formats',
      detail: `${H('The feed is the storefront window, extended')}
1) THE DROP: new arrivals the day they hit the floor — shot in-store, priced honestly.
2) STYLED/IN-USE: how to wear/use/pair it (the curation you're paid for). 3) STAFF PICK:
named human, one line why. 4) BEHIND THE BUY: why you chose this maker/line — provenance
sells. 5) THE EVENT: before (invite), during (energy), after (what sold out). Location-tag
everything; story-first for time-sensitive (today's hours, just-arrived), feed for the
catalog moments. CTA rotates: come in / join the list / DM to hold.${NOTE}`,
    }],
  },
};

const GENERIC_V: VerticalPack = {
  brief: {
    slug: 'gen-industry-brief', kind: 'research', title: 'Know this industry — the questions that matter',
    detail: `${H('Garvis has not matched this business to a known industry pack')}
That's stated honestly rather than guessed at. The fastest path to industry-grade
intelligence here is answering these — each is a Market Intelligence scan or a note from
your own experience:
□ HOW DO CUSTOMERS ACTUALLY CHOOSE a provider like this? (referral? search? comparison?)
□ WHO ELSE sells to them (top 5), and what do their negative reviews complain about?
□ WHAT'S SEASONAL about demand, and what triggers a purchase?
□ WHICH CHANNELS do buyers actually use to look — and which do competitors ignore?
□ WHAT COMPLIANCE OR PLATFORM RULES constrain marketing in this space?
□ WHAT ARE THE 5 NUMBERS a veteran operator in this industry watches weekly?
Answer these in this area — every answer sharpens the plans in every other area of this
world. Garvis tracks the unanswered ones as open questions.${NOTE}`,
  },
};

const PACKS: Record<Vertical, VerticalPack> = {
  real_estate: REAL_ESTATE,
  finance: FINANCE,
  creative: CREATIVE,
  food: FOOD,
  ecommerce: ECOMMERCE,
  services: SERVICES,
  health: HEALTH,
  home_services: HOME_SERVICES,
  education: EDUCATION,
  tech: TECH,
  events: EVENTS,
  nonprofit: NONPROFIT,
  retail: RETAIL,
  generic: GENERIC_V,
};

/** The domain overlay for one chartered area: industry brief + research frameworks land in
 *  intel; compliance lands in launch; domain KPIs in ledger; follow-up truths in loop;
 *  content angles in the matching studio flavor. Returns [] where the vertical has nothing
 *  to add — the functional base pack (expertise.ts) always stands underneath. */
export function verticalOverlay(vertical: Vertical, archetype: Archetype, flavor: Flavor): SeedArtifact[] {
  const p = PACKS[vertical];
  switch (archetype) {
    case 'intel': return [p.brief, ...(p.intel ?? [])];
    case 'audience': return p.audience ?? [];
    case 'studio': return p.studio?.[flavor] ?? [];
    case 'launch': return p.launch ?? [];
    case 'loop': return p.loop ?? [];
    case 'ledger': return p.ledger ?? [];
    case 'vault': return [];
  }
}
