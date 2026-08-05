// src/lib/garvis/leadEngine/leadEngine.ts
// THE LEAD ENGINE — pure core. No imports, no Supabase, no DOM, no clock (the caller supplies
// now). Verified by leadEngine.verify.ts; executed by the lead-ingest edge function and the
// LeadEnginePanel; the impure I/O lives in leadEngineRun.ts (the standingCore pattern).
//
// The thesis (docs/lead-engine-master-plan.md): commercial purchases are downstream of observable
// public events — a tenant-improvement permit, a liquor license, a new registration. This module
// owns the SCORING (which event matters to which trade, and why — every score carries its
// reasons), the DEDUPE identity of an event, and the DIGEST composition. HONESTY RULES, same as
// every Garvis core:
//   - Verbatim-only: a lead's fields come from the record or they are null — never guessed.
//   - Every score states its reasons; a digest line always carries the source URL.
//   - This module reads and composes only. Anything outbound goes through Approvals.

export type LeadEventType =
  | 'permit_issued' | 'permit_applied' | 'liquor_license' | 'health_permit'
  | 'business_registered' | 'news';

export type LeadStatus = 'new' | 'delivered' | 'contacted' | 'quoted' | 'won' | 'lost' | 'skipped';

/** A party named ON the record. Widened by app_0131: permit feeds publish phones, licence numbers
 *  and role labels inline (Austin's `contractor_phone` is the highest-value field in the audit),
 *  and every one of them is verbatim-or-null. `source_field` keeps the provenance discipline:
 *  which column this party was read out of. */
export interface NamedParty {
  role?: string;
  role_normalized?: PartyRole;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  license_no?: string;
  ordinal?: number;
  source_field?: string;
}

export type PartyRole =
  | 'owner' | 'contractor' | 'applicant' | 'architect' | 'engineer'
  | 'filing_rep' | 'superintendent' | 'other';

/** Role labels are verbatim in the record ('CONTRACTOR-ELECTRICAL', 'OWNER', 'Permittee'); this
 *  maps them onto the ladder the UI and rollups can group by. Unknown → 'other', never guessed
 *  into a specific role. An absent label stays null (the caller keeps `role` verbatim). */
export function normalizeRole(raw: string | null | undefined): PartyRole | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('owner')) return 'owner';
  if (s.includes('contractor')) return 'contractor';
  if (s.includes('applicant')) return 'applicant';
  if (s.includes('architect')) return 'architect';
  if (s.includes('engineer')) return 'engineer';
  if (s.includes('superintendent')) return 'superintendent';
  if (s.includes('filing') || s.includes('representative') || s.includes('agent')) return 'filing_rep';
  if (s.includes('permittee') || s.includes('permit')) return 'contractor';
  return 'other';
}

/** The 4-state lifecycle ladder (app_0131). The raw string is ALWAYS kept alongside — this is a
 *  grouping, not a replacement. §9 of the capture spec: a date-based "is it done" test is wrong
 *  ~15% of the time, so status is modelled as its own field and never inferred from dates. */
export type RecordStatus = 'in_review' | 'active' | 'final' | 'inactive' | 'unknown';

export function normalizeStatus(raw: string | null | undefined): RecordStatus {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (/(final|complete|closed|c of o|certificate of occupancy|co issued)/.test(s)) return 'final';
  if (/(expire|withdraw|cancel|void|revoked|abandon|denied|rejected)/.test(s)) return 'inactive';
  if (/(review|submitted|filed|application|pending|intake|triage|plan check|awaiting)/.test(s)) return 'in_review';
  if (/(issued|active|approved|in progress|permit issued|ready to issue|open)/.test(s)) return 'active';
  return 'unknown';
}

/** Stamped onto every lead. The recency term decays, so a stored score is uninterpretable the
 *  moment the model changes — bump this whenever scoreLead's arithmetic changes.
 *  le-2: the FIT SIGNAL (see below) — trade-specific evidence read from the record's own words. */
export const SCORE_VERSION = 'le-3';

/** The fields scoring needs — a subset of the le_events row (verbatim from the source record). */
export interface LeadEventLike {
  event_type: LeadEventType;
  occurred_at: string | null;      // the record's own date, else null (never guessed)
  address: string | null;
  region: string;
  valuation_usd: number | null;    // verbatim, else null
  title: string;
  description: string | null;
  named_parties: NamedParty[];
  /** The record's OWN public page/API row — null when the dataset publishes no per-record URL.
   *  It is never the dataset endpoint: linking the whole feed as if it were the record is the
   *  bug this replaced (capture spec §6.6). A null link is stated as "no direct link". */
  source_url: string | null;
  /** The record's own classification columns, when the source publishes them. Optional so every
   *  existing caller still type-checks; read by the residential follow-on rule and the fit signal
   *  below, and only ever as the record's own words. `permit_sub_type` is where several portals put
   *  the READABLE label (Austin's `permit_type_desc` = "Mechanical Permit" against a `permit_type`
   *  of "MP"), which is exactly the wording that names a trade. */
  work_class?: string | null;
  permit_type?: string | null;
  permit_sub_type?: string | null;
}

// ---------------------------------------------------------------------------
// Trades — which events feed which trade, and how strongly (0 = not relevant)
// ---------------------------------------------------------------------------

export type TradeKey =
  | 'acoustics' | 'security' | 'janitorial' | 'fire_safety' | 'signage'
  | 'roofing' | 'hvac' | 'electrical' | 'plumbing' | 'flooring'
  | 'pest_control' | 'landscaping'
  // Residential trades — the segment split. Same rails, same events, a different buyer.
  | 'carpentry' | 'remodeling' | 'painting' | 'windows_doors' | 'concrete' | 'handyman';

/** WHICH MARKET A TRADE SELLS INTO. The same public-record stream serves two different buyers:
 *  a commercial fit-out contractor and a residential remodeler read the SAME permit feed and want
 *  opposite halves of it. A market declares its segment once (the standing order's config); a
 *  trade declares whose market it belongs in. 'both' trades — roofing, HVAC, electrical, plumbing,
 *  flooring, landscaping, pest control — are eligible everywhere, because the work is genuinely
 *  the same trade on either side of the line. */
export type MarketSegment = 'commercial' | 'residential';

export interface TradeProfile {
  label: string;
  /** Which market segment(s) this trade is sold into. 'both' = eligible in every market. */
  segment: MarketSegment | 'both';
  /** Base relevance per event type, 0..40. 0 = this event never becomes a lead for this trade. */
  weights: Partial<Record<LeadEventType, number>>;
  /** One honest line of why this trade buys after these events — shown in the UI, never sent. */
  buys: string;
}

export const TRADES: Record<TradeKey, TradeProfile> = {
  acoustics: {
    label: 'Acoustic panels & treatment', segment: 'commercial',
    weights: { permit_issued: 30, permit_applied: 20, liquor_license: 35, health_permit: 30, business_registered: 15, news: 10 },
    buys: 'Fit-outs, restaurants, gyms, and offices treat sound near the end of build-out.',
  },
  security: {
    label: 'Security & access control', segment: 'commercial',
    weights: { permit_issued: 35, permit_applied: 25, liquor_license: 30, health_permit: 25, business_registered: 20, news: 10 },
    buys: 'Every new commercial space needs alarms, cameras, and access control before opening.',
  },
  janitorial: {
    label: 'Commercial cleaning', segment: 'commercial',
    weights: { permit_issued: 25, permit_applied: 10, liquor_license: 30, health_permit: 35, business_registered: 20, news: 10 },
    buys: 'New locations sign recurring cleaning contracts at opening.',
  },
  fire_safety: {
    label: 'Fire & life safety', segment: 'commercial',
    weights: { permit_issued: 35, permit_applied: 25, liquor_license: 25, health_permit: 25, business_registered: 15, news: 5 },
    buys: 'Code-mandated: every new commercial space buys inspection and monitoring, forever.',
  },
  signage: {
    label: 'Signage', segment: 'commercial',
    weights: { permit_issued: 25, permit_applied: 15, liquor_license: 35, health_permit: 30, business_registered: 25, news: 10 },
    buys: 'A new location needs signs before it opens — timing is everything.',
  },
  // ── 'both' trades: the same work on either side of the line. Their labels stay segment-neutral
  //    on purpose — "Commercial roofing" is the wrong word in a residential market's digest.
  roofing: {
    label: 'Roofing', segment: 'both',
    weights: { permit_issued: 30, permit_applied: 20, news: 10 },
    buys: 'New builds and remodels need roofs; storm events (coming stream) make them urgent.',
  },
  hvac: {
    label: 'HVAC', segment: 'both',
    weights: { permit_issued: 35, permit_applied: 25, liquor_license: 25, health_permit: 25, business_registered: 10, news: 5 },
    buys: 'Every fit-out and most remodels touch mechanical — and installs become maintenance contracts.',
  },
  electrical: {
    label: 'Electrical', segment: 'both',
    weights: { permit_issued: 35, permit_applied: 25, liquor_license: 25, health_permit: 20, business_registered: 10, news: 5 },
    buys: 'Fit-outs, equipment, and code work — electrical is on nearly every permit.',
  },
  plumbing: {
    label: 'Plumbing', segment: 'both',
    weights: { permit_issued: 30, permit_applied: 20, liquor_license: 30, health_permit: 30, news: 5 },
    buys: 'Restaurants, health-permitted spaces and every bath remodel are plumbing-heavy builds.',
  },
  flooring: {
    label: 'Flooring', segment: 'both',
    weights: { permit_issued: 25, permit_applied: 15, liquor_license: 25, health_permit: 20, business_registered: 15, news: 5 },
    buys: 'Late-stage work: floors go in as the job closes out.',
  },
  pest_control: {
    label: 'Pest control', segment: 'both',
    weights: { liquor_license: 30, health_permit: 35, business_registered: 20, permit_issued: 10, news: 5 },
    buys: 'Food-service spaces sign recurring pest contracts at opening — health code demands it.',
  },
  landscaping: {
    label: 'Landscaping & snow', segment: 'both',
    weights: { permit_issued: 20, business_registered: 20, liquor_license: 15, health_permit: 10, news: 5 },
    buys: 'New locations sign recurring grounds and snow contracts.',
  },

  // ── RESIDENTIAL TRADES ────────────────────────────────────────────────────
  // A residential market's events are permits, essentially only permits: a homeowner does not pull
  // a liquor licence or a health permit, and does not register a business, so those event types
  // carry NO weight here (omitted, which is 0 — the pairing never becomes a lead row at all).
  // `news` stays small: a storm or a development story is a real signal, just a weak one.
  carpentry: {
    label: 'Carpentry & decks', segment: 'residential',
    weights: { permit_issued: 32, permit_applied: 24, news: 5 },
    buys: 'Decks, framing and additions pull their own permits — and the trim, rot repair and punch work around them is rarely contracted yet.',
  },
  remodeling: {
    label: 'Remodeling & general contracting', segment: 'residential',
    weights: { permit_issued: 34, permit_applied: 28, news: 5 },
    buys: 'A kitchen, bath or addition permit is a homeowner mid-project, with scope still open on both sides of the permitted work.',
  },
  painting: {
    label: 'Painting', segment: 'residential',
    weights: { permit_issued: 26, permit_applied: 16, news: 5 },
    buys: 'Nearly every remodel, addition, window or drywall job ends in paint — and paint is contracted last.',
  },
  windows_doors: {
    label: 'Windows & doors', segment: 'residential',
    weights: { permit_issued: 28, permit_applied: 18, news: 5 },
    buys: 'Additions and remodels change openings; replacement runs on its own cycle and is quoted separately.',
  },
  concrete: {
    label: 'Concrete & flatwork', segment: 'residential',
    weights: { permit_issued: 30, permit_applied: 22, news: 5 },
    buys: 'Driveways, patios and foundations — for this trade the permit usually IS the whole job.',
  },
  handyman: {
    label: 'Handyman & home repair', segment: 'residential',
    weights: { permit_issued: 20, permit_applied: 12, news: 5 },
    buys: 'Small permitted jobs, and the punch list a bigger job leaves behind.',
  },
};

/** Google Places primaryType → the trade that business sells. Used to auto-suggest which sample
 *  pitch a discovered business should get. Unknown types → null (never guessed). */
const PLACE_TYPE_TRADE: Record<string, TradeKey> = {
  roofing_contractor: 'roofing',
  electrician: 'electrical',
  plumber: 'plumbing',
  hvac_contractor: 'hvac',
  pest_control_service: 'pest_control',
  landscaper: 'landscaping',
  security_system_supplier: 'security',
  cleaning_service: 'janitorial',
  janitorial_service: 'janitorial',
  sign_shop: 'signage',
  fire_protection_service: 'fire_safety',
  flooring_contractor: 'flooring',
  flooring_store: 'flooring',
  // Residential-side categories, same discipline: a type not in this table maps to null, so a
  // wrong guess is impossible — it simply produces no suggestion.
  painter: 'painting',
  general_contractor: 'remodeling',
};

export function tradeForPlaceType(primaryType: string | null | undefined): TradeKey | null {
  return primaryType ? PLACE_TYPE_TRADE[primaryType] ?? null : null;
}

export const TRADE_KEYS = Object.keys(TRADES) as TradeKey[];

export function isTradeKey(v: unknown): v is TradeKey {
  return typeof v === 'string' && v in TRADES;
}

/** Is this trade sellable in this market? 'both' trades always are. This is the ONE place the
 *  segment gate is decided — scoring, the config parser and the UI dropdowns all ask here. */
export function tradeMatchesSegment(trade: TradeKey, segment: MarketSegment): boolean {
  const s = TRADES[trade].segment;
  return s === 'both' || s === segment;
}

/** The trades a market of this segment may offer — the UI's dropdown list, in registry order. */
export function tradesForSegment(segment: MarketSegment): TradeKey[] {
  return TRADE_KEYS.filter((t) => tradeMatchesSegment(t, segment));
}

/** A stored/config value → a MarketSegment. Anything that is not literally 'residential' reads as
 *  'commercial', which is what every market created before segments existed is. */
export function parseSegment(v: unknown): MarketSegment {
  return v === 'residential' ? 'residential' : 'commercial';
}

// ---------------------------------------------------------------------------
// Event identity — the dedupe key
// ---------------------------------------------------------------------------

/** Normalize an address (or title, when the record has no address) for identity: lowercase,
 *  collapse whitespace/punctuation. Deterministic — the unique(owner_id, dedupe_key) constraint
 *  does the actual dedupe at insert. */
export function normalizeKeyPart(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 120);
}

/** What identifies an event. `source_record_id` is the permit/licence number — the record's REAL
 *  identity; `jurisdiction` is a stable slug (not the free-text region label), so two markets with
 *  overlapping regions cannot collide. */
export interface EventIdentity {
  event_type: LeadEventType;
  jurisdiction?: string | null;
  source_record_id?: string | null;
  address: string | null;
  title: string;
  occurred_at: string | null;
}

/** THE DEDUPE FIX (capture spec §6.5). Identity is `type :: jurisdiction :: record number` when
 *  the record HAS a number, which is the normal case for permit and licence feeds. The old
 *  address+month key collapsed the normal case — a job's electrical, plumbing and mechanical
 *  sub-permits share one address in one month, differ only by permit number, and are three
 *  separate trade leads. Only when a source publishes no record number do we fall back to the
 *  documented address+month bucket, and the jurisdiction slug still keeps markets apart. */
export function dedupeKey(e: EventIdentity): string {
  const juris = normalizeKeyPart(e.jurisdiction ?? '') || 'unknown';
  const record = normalizeKeyPart(e.source_record_id ?? '');
  if (record) return `${e.event_type}::${juris}::${record}`;
  const place = normalizeKeyPart(e.address || e.title);
  const bucket = (e.occurred_at ?? '').slice(0, 7) || 'undated';
  return `${e.event_type}::${juris}::${place}::${bucket}`;
}

// ---------------------------------------------------------------------------
// Content hashing — "has the portal changed a row we already hold?"
// ---------------------------------------------------------------------------

/** Deterministic JSON: object keys sorted, undefined dropped, non-finite numbers → null. The same
 *  normalized fields always produce the same string, in every runtime, in any key order. */
export function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return 'null';
}

/** A stable 64-bit content fingerprint (two FNV-1a lanes → 16 hex chars). Not cryptographic and
 *  not meant to be: it answers exactly one question — did this record's normalized content change
 *  since we last saw it? Pure, no Web Crypto, so the core stays importable everywhere. */
export function contentHash(fields: unknown): string {
  const s = stableStringify(fields);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Which fields differ between the row we hold and the row the portal just served. Drives
 *  le_event_versions.changed_fields — the transition record that no re-scrape can rebuild.
 *  Compared loosely by string form: a numeric column round-trips from Postgres as a string and
 *  that is not a change. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
  return Object.keys(after)
    .filter((k) => norm(before[k]) !== norm(after[k]))
    .sort();
}

// ---------------------------------------------------------------------------
// Scoring — deterministic, reasons attached, caller supplies now
// ---------------------------------------------------------------------------

export interface LeadScore { score: number; reasons: string[] }

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// THE FOLLOW-ON RULE — the residential insight
// ---------------------------------------------------------------------------
//
// In a COMMERCIAL market, a permit is an opening bell: a fit-out pulls in a dozen trades over the
// months after issuance, and almost none of them are signed on the day the permit is filed. So a
// commercial permit scores every relevant trade the same way — highest for the ones the job needs.
//
// A RESIDENTIAL permit does not work like that. A homeowner does not pull a deck permit and then
// go looking for a deck builder: by the time the permit is issued, the permitted scope is already
// contracted — usually to the contractor who pulled it. Selling *that* trade off *that* permit is
// selling into a job that is already sold. What is NOT sold is everything the permitted work
// creates work for afterwards: the flooring and paint after an addition, the trim and rot repair
// after a reroof, the framing after a foundation pour.
//
// So for residential markets scoreLead:
//   1. reads the trade the permit's OWN words name (title/description/work class/permit type),
//   2. subtracts PERMITTED_TRADE_PENALTY from that trade — the scope is likely already let,
//   3. adds FOLLOW_ON_BONUS to the trades that typically come AFTER that scope,
//   4. says both out loud in the score's reasons, so the operator can disagree with the engine.
//
// Deterministic and pure: ordered keyword patterns, a fixed adjacency table, fixed integers. No
// statistics are claimed — the adjacency table is a stated trade-sequence opinion, readable and
// editable in one place, not a number dressed up as evidence. Commercial markets are untouched.

/** How much a follow-on trade gains, and how much the permitted trade itself loses. */
export const FOLLOW_ON_BONUS = 12;
export const PERMITTED_TRADE_PENALTY = 10;

/** The record's own words → the trade its scope names. ORDERED: the first pattern that matches
 *  wins, so a "kitchen remodel — new flooring" reads as remodeling (the permitted scope) rather
 *  than flooring (one of its follow-ons). Nothing outside the record's text is consulted. */
const PERMITTED_TRADE_PATTERNS: [RegExp, TradeKey][] = [
  [/\b(kitchen|bath(room)?s?|addition|remodel|renovat|alteration|adu|accessory dwelling)\b/, 'remodeling'],
  [/\b(re-?roof|roofing|roof)\b/, 'roofing'],
  [/\b(deck|porch|framing|carpentry|trim)\b/, 'carpentry'],
  [/\b(window|windows|door|doors)\b/, 'windows_doors'],
  [/\b(driveway|patio|foundation|concrete|slab|footing|sidewalk)\b/, 'concrete'],
  [/\b(electric\w*|wiring|panel upgrade)\b/, 'electrical'],
  [/\b(plumb\w*|sewer|repipe|water heater)\b/, 'plumbing'],
  [/\b(hvac|mechanical|furnace|heat pump|air condition\w*|ductwork)\b/, 'hvac'],
  [/\b(paint\w*)\b/, 'painting'],
  [/\b(floor\w*|tile)\b/, 'flooring'],
  [/\b(landscap\w*|irrigation|fence|retaining wall)\b/, 'landscaping'],
];

/** Which trades typically follow a given permitted scope on a residential job. A stated sequence
 *  opinion, not a measurement — every entry is the work that becomes available AFTER the permitted
 *  scope is done, which is the work still open to be sold. */
const FOLLOW_ON_TRADES: Partial<Record<TradeKey, TradeKey[]>> = {
  remodeling: ['flooring', 'painting', 'electrical', 'plumbing', 'windows_doors', 'hvac'],
  carpentry: ['painting', 'flooring', 'roofing'],
  concrete: ['carpentry', 'landscaping'],
  roofing: ['carpentry'],
  windows_doors: ['painting', 'carpentry'],
  electrical: ['painting'],
  plumbing: ['flooring', 'painting'],
};

/** Everything the RECORD ITSELF says, in one lowercased string: its title, its description and its
 *  own classification columns. The only trade-specific evidence a permit row carries, and the only
 *  text any rule in this module is allowed to read. */
export type RecordWordsInput = Pick<LeadEventLike, 'title' | 'description' | 'work_class' | 'permit_type' | 'permit_sub_type'>;

export function recordWords(event: RecordWordsInput): string {
  return [event.title, event.description, event.work_class, event.permit_type, event.permit_sub_type]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// ONE FIRM, ONE KEY
// ---------------------------------------------------------------------------
//
// Permit portals take the contractor's name as free text, so the same company arrives spelled
// several ways and every count over it is wrong. Measured on Austin, trailing 12 months:
//
//     IES Residential, Inc.              1,206      Radiant Plumbing & AC                 673
//     IES Residential Inc                  472      Radiant Plumbing and Air Conditioning 575
//
// Two firms, four rows, and a "most active contractors" list that ranks neither correctly. This
// folds the spellings onto one key so counting is possible. It is a GROUPING key, never a display
// name: the label shown to a human stays whatever the record said, verbatim.

/** Legal-form suffixes, stripped only from the END of a name. `Company` is here because
 *  "Victory Plumbing Company" and "Victory Plumbing" are one firm; it is not stripped mid-name,
 *  so "Company Roofing LLC" keeps its first word. */
const LEGAL_SUFFIXES = [
  'incorporated', 'corporation', 'company', 'limited',
  'inc', 'llc', 'lc', 'ltd', 'corp', 'co', 'lp', 'llp', 'lllp', 'pllc', 'plc', 'pc', 'pa', 'dba',
];

/** A stable grouping key for a company name — or null when the name carries no letters or digits
 *  at all, which is the honest answer for "", "-" and "N/A".
 *
 *  Deliberately conservative. It folds punctuation, legal form, `&`/`and`, and a leading "the";
 *  it does NOT stem words, expand abbreviations or fuzzy-match, because every one of those merges
 *  firms that are genuinely different ("Allied Electric" and "Allied Electrical Services" may or
 *  may not be one company, and a wrong merge is unrecoverable once counted). */
export function companyKey(name: string | null | undefined): string | null {
  let s = (name ?? '').toLowerCase();
  if (!s.trim()) return null;
  if (/^(n\/?a|none|unknown|owner|self|tbd)$/i.test(s.trim())) return null;
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');   // café → cafe
  s = s.replace(/&/g, ' and ');
  // Apostrophes are DELETED, not spaced: contractor names are full of possessives, and
  // "Stan's Heating" splitting into "stan s heating" would never match "Stans Heating".
  // Covers the straight quote and the three curly forms portals actually emit.
  s = s.replace(/['‘’‛`]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();                  // other punctuation is never identity
  s = s.replace(/^the\s+/, '');
  // Strip trailing legal forms repeatedly: "Reed Architects Inc LLC" → "reed architects".
  for (let i = 0; i < 3; i++) {
    const before = s;
    for (const suf of LEGAL_SUFFIXES) {
      s = s.replace(new RegExp(`\\s+${suf}$`), '');
    }
    if (s === before) break;
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s || null;
}

/** Do two company names denote the same firm, as far as we are willing to claim? */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = companyKey(a); const kb = companyKey(b);
  return ka !== null && ka === kb;
}

/** Fold a list of company names onto their keys, keeping the LONGEST spelling seen as the label
 *  (the fullest version a portal published) and the total count. Sorted by count, descending —
 *  this is the contractor map, and it is pure so it can be verified with fixtures. */
export function foldCompanies(
  names: readonly (string | null | undefined)[],
): { key: string; label: string; count: number }[] {
  const acc = new Map<string, { label: string; count: number }>();
  for (const n of names) {
    const k = companyKey(n);
    if (!k) continue;
    const cur = acc.get(k);
    const label = (n ?? '').trim();
    if (!cur) acc.set(k, { label, count: 1 });
    else { cur.count++; if (label.length > cur.label.length) cur.label = label; }
  }
  return [...acc].map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** The trade a permit's own text names, or null when its words name none of ours. Pure and
 *  deterministic; reads title, description and the record's classification columns only. */
export function permittedTrade(event: RecordWordsInput): TradeKey | null {
  const text = recordWords(event);
  if (!text) return null;
  for (const [re, trade] of PERMITTED_TRADE_PATTERNS) if (re.test(text)) return trade;
  return null;
}

// ---------------------------------------------------------------------------
// THE FIT SIGNAL — what makes one permit's twelve leads a RANKING
// ---------------------------------------------------------------------------
//
// Base weight is per EVENT TYPE, and the valuation, recency and named-contact terms are properties
// of the RECORD — identical for every trade scored off it. So one $385k commercial permit produced
// a dozen leads within a few points of each other, with fire safety, HVAC, electrical and security
// tied to the point. A ranking that ranks nothing is the product failing quietly: the operator
// reads the top of the list as "these matter most" and it does not mean that.
//
// The record's own words are the only trade-specific evidence a permit row carries, so they are
// what separates the trades. Three mechanisms, each stated in the lead's reasons with the matched
// word quoted verbatim:
//
//   A. the record NAMES this trade's work  ("re-roof", "sprinkler", "Mechanical Permit") → +FIT_NAMED
//   B. the record names a SPACE this trade sells into ("restaurant", "clinic")           → +FIT_USE
//   C. the record was specific about trades and named none of this one's                 → −FIT_MISS
//
// C only fires when the record was specific about SOMETHING. A permit whose words name no trade and
// no use at all ("COMMERCIAL BUILDING") adjusts nobody: silence is not evidence, and inventing a
// spread out of it would be exactly the fabrication this module exists to refuse.
//
// The tables below are a STATED OPINION about what words implicate which trade — readable and
// editable in one place, the same discipline as FOLLOW_ON_TRADES. No statistic is claimed and none
// is implied: a reason says "the record names roofing work ("re-roof")", never a probability.

export const FIT_NAMED = 16;
export const FIT_USE = 8;
export const FIT_MISS = 8;

/** The record names this trade's OWN work. */
const TRADE_WORK_PATTERNS: Partial<Record<TradeKey, RegExp>> = {
  acoustics: /\b(acoustic\w*|soundproof\w*|sound attenuation|noise)\b/,
  security: /\b(security|burglar|alarm|access control|cctv|camera\w*|low[- ]?voltage)\b/,
  janitorial: /\b(janitorial|custodial|housekeeping)\b/,
  fire_safety: /\b(fire|sprinkler|standpipe|suppression|smoke|extinguisher\w*)\b/,
  signage: /\b(sign|signage|awning|canopy|marquee)\b/,
  roofing: /\b(roof\w*|re-?roof|shingle\w*|membrane|tpo|parapet)\b/,
  hvac: /\b(hvac|mechanical|furnace|boiler|chiller|rooftop unit|rtu|duct\w*|ventilat\w*|exhaust hood|air condition\w*)\b/,
  electrical: /\b(electric\w*|wiring|panel upgrade|service upgrade|lighting|generator|ev charg\w*|solar|photovoltaic)\b/,
  plumbing: /\b(plumb\w*|sewer|water heater|grease trap|grease interceptor|backflow|repipe|restroom|gas line)\b/,
  flooring: /\b(floor\w*|tile|carpet|epoxy|terrazzo)\b/,
  pest_control: /\b(pest|rodent|vermin|fumigat\w*)\b/,
  landscaping: /\b(landscap\w*|irrigation|grading|site work|parking lot|retaining wall|fence)\b/,
  carpentry: /\b(deck|porch|framing|carpentry|trim|cabinet\w*|stair\w*)\b/,
  remodeling: /\b(remodel\w*|renovat\w*|addition|alteration|adu|accessory dwelling|finish[- ]?out|tenant improvement)\b/,
  painting: /\b(paint\w*|coating|drywall|stucco|plaster)\b/,
  windows_doors: /\b(window\w*|door\w*|glazing|storefront|curtain wall)\b/,
  concrete: /\b(concrete|slab|foundation|footing|driveway|patio|sidewalk|flatwork)\b/,
  handyman: /\b(minor repair|handyman|punch list)\b/,
};

/** The record names a SPACE this trade sells into. Weaker than naming the work, and deliberately
 *  absent for the residential trades — "a house" implicates no one trade over another. */
const TRADE_USE_PATTERNS: Partial<Record<TradeKey, RegExp>> = {
  acoustics: /\b(restaurant|bar|brewery|taproom|gym|fitness|studio|theat(er|re)|church|worship|school|classroom|office|conference)\b/,
  security: /\b(retail|store|bank|pharmacy|dispensary|cannabis|warehouse|storage|office|school|clinic|medical)\b/,
  janitorial: /\b(restaurant|cafe|kitchen|food|grocery|clinic|medical|dental|office|retail|school|gym|fitness)\b/,
  fire_safety: /\b(restaurant|kitchen|bar|brewery|assembly|school|hotel|hospital|clinic|warehouse|storage|apartment|multi-?family)\b/,
  signage: /\b(retail|store|restaurant|cafe|shop|salon|clinic|dealership|storefront|tenant)\b/,
  roofing: /\b(warehouse|industrial|shell|new building|new construction)\b/,
  hvac: /\b(restaurant|kitchen|brewery|clinic|medical|dental|laborator\w+|data center|warehouse|office)\b/,
  electrical: /\b(kitchen|brewery|laborator\w+|data center|dealership|industrial|clinic|medical)\b/,
  plumbing: /\b(restaurant|kitchen|cafe|brewery|salon|clinic|medical|dental)\b/,
  flooring: /\b(retail|store|restaurant|office|clinic|school|gym|fitness|salon)\b/,
  pest_control: /\b(restaurant|kitchen|cafe|grocery|food|brewery|bar|hotel|apartment|multi-?family)\b/,
  landscaping: /\b(retail|office|apartment|multi-?family|hotel|campus|parking)\b/,
};

/** Did the record name ANY trade's work, or any use we recognise? Only when it did is a silence
 *  about one particular trade evidence of anything (the FIT_MISS dampener). */
export function recordIsSpecific(words: string): boolean {
  if (!words) return false;
  for (const re of Object.values(TRADE_WORK_PATTERNS)) if (re.test(words)) return true;
  for (const re of Object.values(TRADE_USE_PATTERNS)) if (re.test(words)) return true;
  return false;
}

/** The fit adjustment for one trade against one record's words, with its reason. Null when the
 *  record says nothing that bears on this trade either way. Pure and order-independent. */
export function fitFor(words: string, trade: TradeKey): { delta: number; reason: string } | null {
  if (!words) return null;
  const label = TRADES[trade].label.toLowerCase();
  const named = TRADE_WORK_PATTERNS[trade]?.exec(words)?.[0];
  if (named) return { delta: FIT_NAMED, reason: `+${FIT_NAMED}: the record names ${label} work ("${named}")` };
  const use = TRADE_USE_PATTERNS[trade]?.exec(words)?.[0];
  if (use) return { delta: FIT_USE, reason: `+${FIT_USE}: the record names a space this trade sells into ("${use}")` };
  if (recordIsSpecific(words)) {
    return { delta: -FIT_MISS, reason: `-${FIT_MISS}: the record's words name other trades' work, not ${label}` };
  }
  return null;
}

/** Do jobs of `permitted` scope typically create work for `trade` afterwards? */
export function isFollowOnTrade(permitted: TradeKey, trade: TradeKey): boolean {
  return (FOLLOW_ON_TRADES[permitted] ?? []).includes(trade);
}

// ---------------------------------------------------------------------------
// THE FOLLOW-ON WINDOW — the one signal a competitor cannot scrape
// ---------------------------------------------------------------------------
//
// Every other permit vendor sells a trade job when the TRADE permit appears. The trade permit is
// not the first public evidence that the job exists: the master Building Permit is, and the trade
// sub-permit follows it by a measurable lag. Selling on the master permit is selling the same job
// roughly two weeks earlier than anyone reading the same portal.
//
// MEASURED, NOT ASSUMED (docs/lead-engine-productization.md §1). Austin commercial permits,
// 29,607 rows over 24 months, grouped by permit-number base — "2025-118161 BP" and
// "2025-118161 MP" are one job. Of the 3,245 master Building Permits issued 2025-08 → 2026-06:
//
//     trade         share of BP jobs   median lag   p25    p75    same day
//     Electrical          45%             15 d      4 d    53 d     10%
//     Plumbing            33%             22 d      5 d    60 d      8%
//     Mechanical          30%             19 d      5 d    55 d      9%
//
// 50% of master Building Permits produced at least one trade sub-permit; 43% gave three or more
// days' notice before one was pulled.
//
// HONESTY, and it is the whole product: p25–p75 for electrical is 4–53 days. This is a WARM
// WINDOW, not an appointment, and every line of copy generated from it says so. A lead that
// claims "an electrician will be needed on day 15" is a lie the first customer will catch. A lead
// that says "45% of jobs like this pull an electrical permit, typically within two to eight
// weeks" is true and still worth paying for.
//
// SCOPE: measured on Austin, the only preset publishing a master/child link. Applying these
// numbers to another city is an extrapolation — `FOLLOW_ON_MEASURED_IN` names where they came
// from, and the lead's reasons say it out loud.
export const FOLLOW_ON_MEASURED_IN = 'Austin commercial permits, 3,245 master building permits, 2025-08 → 2026-06';

export interface FollowOnWindow {
  /** Share of master building permits that produced this trade's sub-permit (0..1). */
  rate: number;
  medianDays: number;
  p25Days: number;
  p75Days: number;
}

export const FOLLOW_ON_WINDOWS: Partial<Record<TradeKey, FollowOnWindow>> = {
  electrical: { rate: 0.45, medianDays: 15, p25Days: 4, p75Days: 53 },
  plumbing:   { rate: 0.33, medianDays: 22, p25Days: 5, p75Days: 60 },
  hvac:       { rate: 0.30, medianDays: 19, p25Days: 5, p75Days: 55 },
};

/** Bonus for a trade with a measured window on a master building permit. Smaller than FIT_NAMED
 *  (16) on purpose: a record that NAMES this trade's work is harder evidence than a base rate. */
export const FOLLOW_ON_WINDOW_BONUS = 12;

/** Does this record read as a MASTER building permit — the anchor a trade sub-permit follows —
 *  rather than as a trade permit itself? Reads the record's own classification columns and words.
 *  A record whose words already name a trade is that trade's permit, not the anchor. */
export function isMasterBuildingPermit(event: RecordWordsInput & { event_type?: LeadEventType }): boolean {
  if (event.event_type && event.event_type !== 'permit_issued' && event.event_type !== 'permit_applied') return false;
  const cls = [event.permit_type, event.permit_sub_type, event.work_class, event.title]
    .filter(Boolean).join(' ').toLowerCase();
  if (!cls) return false;
  // 'BP' is Austin's code; the readable forms cover the other portals.
  const looksMaster = /\bbp\b|building permit|new construction|commercial (remodel|build|new)/.test(cls);
  if (!looksMaster) return false;
  // An electrical or plumbing permit is not the anchor even when its description mentions the
  // building — the anchor is the permit the trades hang off.
  return !/\b(ep|pp|mp)\b|electrical permit|plumbing permit|mechanical permit/.test(cls);
}

/** The measured window for a trade, when there is one. */
export function followOnWindow(trade: TradeKey): FollowOnWindow | null {
  return FOLLOW_ON_WINDOWS[trade] ?? null;
}

/** The sentence a lead carries for a measured window. Always states the rate AND the spread —
 *  never a single day, which would claim precision the measurement does not support. */
export function followOnReason(trade: TradeKey, w: FollowOnWindow): string {
  return `+${FOLLOW_ON_WINDOW_BONUS}: this is the building permit, not the ${TRADES[trade].label.toLowerCase()} permit — `
    + `${Math.round(w.rate * 100)}% of jobs like it pull one, typically ${w.p25Days}–${w.p75Days} days later `
    + `(median ${w.medianDays}; measured on ${FOLLOW_ON_MEASURED_IN})`;
}

/** Score an event for a trade. Returns null when the trade has no weight for this event type, or
 *  when the trade does not sell into this market's segment — either way a zero-relevance pairing
 *  never becomes a lead row. Score is 0..100:
 *  base weight (0..40) + valuation band (0..30) + recency (0..20) + named contact (0..10),
 *  plus the residential follow-on adjustment above (±).
 *
 *  `segment` defaults to 'commercial' — the same default parseLeadEngineConfig uses, so every
 *  market that existed before segments scores exactly as it did. */
export function scoreLead(
  event: LeadEventLike, trade: TradeKey, nowIso: string,
  opts?: { segment?: MarketSegment },
): LeadScore | null {
  const segment = opts?.segment ?? 'commercial';
  if (!tradeMatchesSegment(trade, segment)) return null;
  const base = TRADES[trade].weights[event.event_type] ?? 0;
  if (base <= 0) return null;
  const reasons: string[] = [`${event.event_type.replace(/_/g, ' ')} is a ${TRADES[trade].label} trigger (+${base})`];
  let score = base;

  const words = recordWords(event);
  const isPermit = event.event_type === 'permit_issued' || event.event_type === 'permit_applied';
  const permitted = isPermit ? permittedTrade(event) : null;

  // THE FOLLOW-ON RULE (residential permits only — see the block comment above).
  let followOnSpoke = false;
  if (segment === 'residential' && isPermit && permitted) {
    const permittedLabel = TRADES[permitted].label.toLowerCase();
    if (permitted === trade) {
      followOnSpoke = true;
      score -= PERMITTED_TRADE_PENALTY;
      reasons.push(`-${PERMITTED_TRADE_PENALTY}: the permit names ${permittedLabel} itself — that scope is usually contracted before the permit is pulled`);
    } else if (isFollowOnTrade(permitted, trade)) {
      followOnSpoke = true;
      score += FOLLOW_ON_BONUS;
      reasons.push(`+${FOLLOW_ON_BONUS}: permitted work is ${permittedLabel}; ${TRADES[trade].label.toLowerCase()} typically follows`);
    }
  }

  // THE FIT SIGNAL — the trade-specific evidence, and the only term that differs between the
  // trades scored off one record. The two rules are ALTERNATIVES, not additives: when the
  // residential follow-on rule has already spoken about this trade it owns the adjustment, because
  // the two would otherwise contradict each other in the same lead's reasons — "flooring typically
  // follows" next to "the record's words don't name flooring" says nothing an operator can act on.
  // THE COMMERCIAL FOLLOW-ON WINDOW. Fires on the MASTER building permit — the first public
  // evidence a job exists — for the three trades whose lag has actually been measured. Like the
  // residential rule above it OWNS the adjustment when it speaks, so one lead never carries
  // "electrical typically follows" beside "the record's words don't name electrical".
  if (!followOnSpoke && segment === 'commercial' && isPermit && !permitted && isMasterBuildingPermit(event)) {
    const w = followOnWindow(trade);
    if (w) {
      followOnSpoke = true;
      score += FOLLOW_ON_WINDOW_BONUS;
      reasons.push(followOnReason(trade, w));
    }
  }

  if (!followOnSpoke) {
    const fit = fitFor(words, trade);
    if (fit) { score += fit.delta; reasons.push(fit.reason); }
  }

  const v = event.valuation_usd;
  if (v != null && v > 0) {
    const band = v >= 1_000_000 ? 30 : v >= 250_000 ? 24 : v >= 50_000 ? 16 : v >= 10_000 ? 8 : 3;
    score += band;
    reasons.push(`stated value $${Math.round(v).toLocaleString('en-US')} (+${band})`);
  }

  if (event.occurred_at) {
    const age = Date.parse(nowIso) - Date.parse(event.occurred_at);
    if (Number.isFinite(age) && age >= 0) {
      const rec = age <= 7 * DAY_MS ? 20 : age <= 30 * DAY_MS ? 12 : age <= 90 * DAY_MS ? 5 : 0;
      if (rec > 0) reasons.push(`recent — ${Math.max(1, Math.floor(age / DAY_MS))}d old (+${rec})`);
      score += rec;
    }
  }

  const contact = pickContact(event.named_parties);
  if (contact) { score += 10; reasons.push(`record names ${contact.name || contact.company} (+10)`); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** The best contact the record itself names: prefer a party with a person name, else a company.
 *  Null when the record names nobody — the lead ships without a contact, honestly. */
export function pickContact(parties: NamedParty[]): NamedParty | null {
  if (!Array.isArray(parties)) return null;
  const named = parties.filter((p) => (p?.name ?? '').trim() || (p?.company ?? '').trim());
  if (!named.length) return null;
  return named.find((p) => (p.name ?? '').trim()) ?? named[0];
}

/** The party a LEAD should carry. Same discipline as pickContact, but a directly dialable party
 *  wins: a permit that publishes the GC's phone inline is worth more than one that publishes a
 *  name only, and preferring it is what keeps the record-sourced phone (contact_source='record')
 *  ahead of any paid append. Null when the record names nobody. */
export function pickLeadContact(parties: NamedParty[]): NamedParty | null {
  if (!Array.isArray(parties)) return null;
  const named = parties.filter((p) => (p?.name ?? '').trim() || (p?.company ?? '').trim());
  if (!named.length) return null;
  return named.find((p) => (p.phone ?? '').trim() && (p.name ?? '').trim())
    ?? named.find((p) => (p.phone ?? '').trim())
    ?? named.find((p) => (p.name ?? '').trim())
    ?? named[0];
}

/** One why-now sentence composed ONLY from record fields. Missing fields are omitted, never
 *  invented. */
export function whyNow(event: LeadEventLike): string {
  const what = event.title.trim() || event.event_type.replace(/_/g, ' ');
  const where = event.address ? ` at ${event.address}` : '';
  const when = event.occurred_at ? ` on ${event.occurred_at.slice(0, 10)}` : '';
  const value = event.valuation_usd != null && event.valuation_usd > 0
    ? ` — stated value $${Math.round(event.valuation_usd).toLocaleString('en-US')}` : '';
  return `${what}${where}, filed${when}${value}.`;
}

// ---------------------------------------------------------------------------
// The digest — composed from rows, never by a model
// ---------------------------------------------------------------------------

export interface DigestLead {
  trade: TradeKey;
  score: number;
  why_now: string;
  contact_name: string | null;
  contact_company: string | null;
  /** null when the dataset publishes no per-record URL — said plainly, never faked with the
   *  dataset endpoint (capture spec §6.6). */
  source_url: string | null;
  title: string;
}

/** The honest source line: the record's own URL, or a plain statement that this dataset has no
 *  per-record page. Linking the whole feed and calling it "the record" is the thing we fixed. */
export const NO_DIRECT_LINK = 'no direct link — this dataset publishes no per-record page';

/** Ranked digest for one market world. Pure composition: every line comes from the rows the
 *  caller supplies; every entry carries its source URL. Empty in → an honest "quiet week" out. */
export function digestFor(worldLabel: string, leads: DigestLead[], max = 15): { subject: string; body: string; included: number } {
  const ranked = [...leads].sort((a, b) => b.score - a.score).slice(0, max);
  const subject = ranked.length
    ? `${worldLabel}: ${ranked.length} lead${ranked.length === 1 ? '' : 's'} this week`
    : `${worldLabel}: quiet week — no new leads`;
  if (!ranked.length) {
    return { subject, body: `No new qualifying signals this period for ${worldLabel}. Sources were checked on schedule; a quiet week says quiet week.`, included: 0 };
  }
  const lines = ranked.map((l, i) => {
    const who = l.contact_name || l.contact_company;
    return [
      `${i + 1}. [${TRADES[l.trade].label} · score ${l.score}] ${l.title}`,
      `   ${l.why_now}`,
      who ? `   Named on the record: ${who}` : null,
      `   Source: ${l.source_url || NO_DIRECT_LINK}`,
    ].filter(Boolean).join('\n');
  });
  // The trust claim is only made when it is TRUE of every line in this digest.
  const allLinked = ranked.every((l) => !!l.source_url);
  const closer = allLinked
    ? 'Every lead links its public record.'
    : 'Each lead links its public record where the dataset publishes one; the rest name the source and say so.';
  const body = `Top leads for ${worldLabel}, ranked by the engine's stated reasons:\n\n${lines.join('\n\n')}\n\n${closer} Reply with what you quoted or won — outcomes make next week's ranking smarter.`;
  return { subject, body, included: ranked.length };
}

// ---------------------------------------------------------------------------
// The sample pitch — the sales opener, composed from real rows only
// ---------------------------------------------------------------------------

/** The cold email that sells the feed: 2–3 REAL leads for the prospect's trade with public-record
 *  links. No invented stats, no claims — the sample IS the proof. Pure composition; the caller
 *  supplies the leads (top-scored, freshest first). */
export function pitchFor(
  trade: TradeKey, region: string, leads: DigestLead[], fromName: string,
  opts?: { siteUrl?: string | null },
): { subject: string; body: string } | null {
  // A sample pitch's whole job is to be CHECKABLE — its claim is "verify each one yourself". A
  // lead with no public-record link cannot carry that claim, so it is never used as proof.
  const picks = [...leads].filter((l) => !!l.source_url).sort((a, b) => b.score - a.score).slice(0, 3);
  if (picks.length === 0) return null; // no verifiable leads → no pitch. A sample never bluffs.
  const label = TRADES[trade].label.toLowerCase();
  const subject = `${picks.length} ${label} project${picks.length === 1 ? '' : 's'} in ${region} — from this month's public records`;
  const lines = picks.map((l, i) => [
    `${i + 1}. ${l.title}`,
    `   ${l.why_now}`,
    l.contact_name || l.contact_company ? `   Named on the record: ${l.contact_name ?? l.contact_company}` : null,
    `   Public record: ${l.source_url}`,
  ].filter(Boolean).join('\n'));
  const body = [
    `Hi,`,
    ``,
    `I read ${region}'s public records — permits, license filings, registrations — and turn them into ranked leads for ${label}. Here are ${picks.length} live ones from this month:`,
    ``,
    lines.join('\n\n'),
    ``,
    `Every lead links its public record, so you can verify each one yourself. ${TRADES[trade].buys}`,
    ``,
    // THE BUNDLE (only when a real demo site exists for this business — never claimed otherwise):
    // leads open the door, the website raises the ticket, automation keeps the account.
    ...(opts?.siteUrl ? [
      `While I was at it I built you a working website preview — it's live here: ${opts.siteUrl}. It's yours if you want it.`,
      ``,
      `I can also set up the follow-ups and invoice reminders that chase these jobs for you.`,
      ``,
    ] : []),
    `Want the full list for ${region} every week? Reply to this email and I'll set you up.`,
    ``,
    `— ${fromName}`,
  ].join('\n');
  return { subject, body };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Is a customer due their weekly digest? Pure: never-digested → due; else due when ~a week has
 *  passed (6.5 days, so a slightly-early tick doesn't slip the schedule by a full extra week). */
export function digestDue(lastDigestAtIso: string | null, nowIso: string): boolean {
  if (!lastDigestAtIso) return true;
  const last = Date.parse(lastDigestAtIso);
  if (!Number.isFinite(last)) return true;
  return Date.parse(nowIso) - last >= WEEK_MS * 0.93;
}

// ---------------------------------------------------------------------------
// Commission math
// ---------------------------------------------------------------------------

export const DEFAULT_COMMISSION_PCT = 10;

/** Commission on a closed contract, rounded to cents. Pct is clamped to 0..50 — a config typo
 *  can never mint a 500% invoice. */
export function commissionFor(contractValueUsd: number, pct = DEFAULT_COMMISSION_PCT): number {
  const p = Math.max(0, Math.min(50, Number(pct) || 0));
  const v = Math.max(0, Number(contractValueUsd) || 0);
  return Math.round(v * p) / 100;
}

// ---------------------------------------------------------------------------
// Standing-order config
// ---------------------------------------------------------------------------

export interface LeadEngineConfig {
  trades: TradeKey[];              // which trades this market scores for
  commissionPct: number;           // 0..50
  /** Which buyer this market serves. DEFAULTS TO 'commercial' — every standing order written
   *  before segments existed has no segment key, and those markets are commercial ones. */
  segment: MarketSegment;
}

/** Parse an order's config into a safe LeadEngineConfig. Unknown trades are dropped; an empty
 *  list falls back to ALL trades (scoring more is honest; the segment gate in scoreLead and
 *  delivery approval both still apply). */
export function parseLeadEngineConfig(config: unknown): LeadEngineConfig {
  const c = (config ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(c.trades) ? (c.trades as unknown[]).filter(isTradeKey) : [];
  const pct = Number(c.commissionPct);
  return {
    trades: raw.length ? (raw as TradeKey[]) : [...TRADE_KEYS],
    commissionPct: Number.isFinite(pct) ? Math.max(0, Math.min(50, pct)) : DEFAULT_COMMISSION_PCT,
    segment: parseSegment(c.segment),
  };
}

/** The honest one-line record of an ingest run. */
export function ingestLine(sourcesChecked: number, sourcesFailed: number, eventsNew: number, leadsNew: number): string {
  if (sourcesChecked === 0) return 'No active sources to check — add a permit portal or registry to this market.';
  const src = `${sourcesChecked} source${sourcesChecked === 1 ? '' : 's'} checked${sourcesFailed ? ` (${sourcesFailed} unreachable — counted, will retry)` : ''}`;
  if (eventsNew === 0) return `${src} — nothing new since the last run.`;
  return `${src} — ${eventsNew} new event${eventsNew === 1 ? '' : 's'}, ${leadsNew} scored lead${leadsNew === 1 ? '' : 's'}.`;
}

/** The one line stamped onto `le_sources.last_status` after a run — the ONLY run detail the panel
 *  shows, so it has to be the truth about what the run achieved, not merely what it fetched.
 *
 *  A READ THAT COULD NOT BE STORED IS NOT A CHECK. It used to render as
 *  "Checked — 240 rows read, 0 new, 0 updated." — indistinguishable from a genuinely quiet window,
 *  while the rows were dropped and (worse) the cursor moved past them. This states the failure and
 *  the consequence, in the source's own row where the operator is already looking. */
export function sourceStatusLine(run: {
  rowsParsed: number; rowsNew: number; rowsChanged: number; rowsDisqualified: number;
  pages: number; capped: boolean;
  /** Where the next run resumes, when this one stopped mid-window. */
  resumeOffset?: number | null;
  /** Set when the rows were read but the write failed — the honest headline. */
  persistError?: string | null;
}): string {
  const rows = `${run.rowsParsed} row${run.rowsParsed === 1 ? '' : 's'} read${run.pages > 1 ? ` over ${run.pages} pages` : ''}`;
  if (run.persistError) {
    return `Read ${rows} but COULD NOT STORE them — ${run.persistError.slice(0, 160)}. Nothing was recorded; the same window is re-read next run.`;
  }
  const dq = run.rowsDisqualified ? `, ${run.rowsDisqualified} below the floor (kept, flagged)` : '';
  const more = run.capped ? ` More remain — resuming at row ${run.resumeOffset ?? 0} next run.` : '';
  return `Checked — ${rows}, ${run.rowsNew} new, ${run.rowsChanged} updated${dq}.${more}`;
}

/** What the operator is told after one-click market creation. Every step past world-creation is
 *  fail-soft, so the copy MUST follow what actually landed: "permit feed wired, clock on, first
 *  check running" was printed unconditionally, including when the source insert and the first
 *  check had both thrown and been swallowed. A market that came up half-built now says so, names
 *  the reason, and points at the one place that fixes it. */
export function marketStartLine(m: {
  title: string; withPreset: boolean;
  clockOn: boolean; sourceWired: boolean;
  /** The ingest's own honest line, when the first check actually ran. */
  firstCheckLine?: string | null;
  /** One full sentence per step that did not happen. Empty = everything landed. */
  problems: string[];
}): { tone: 'success' | 'error'; text: string } {
  if (m.problems.length === 0) {
    if (!m.withPreset) return { tone: 'success', text: 'Market created and on the clock — add its first source inside.' };
    const check = m.firstCheckLine?.trim();
    return {
      tone: 'success',
      text: `${m.title} is live — permit feed wired, clock on.${check ? ` ${check}` : ''}`,
    };
  }
  const landed = [
    m.clockOn ? 'clock on' : null,
    m.sourceWired ? 'permit feed wired' : null,
  ].filter(Boolean).join(', ');
  return {
    tone: 'error',
    text: `${m.title} was created${landed ? ` (${landed})` : ''}, but ${m.problems.join(' ')} Finish it in Setup inside the market.`,
  };
}
