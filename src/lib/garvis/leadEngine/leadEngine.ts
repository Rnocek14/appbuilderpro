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
 *  moment the model changes — bump this whenever scoreLead's arithmetic changes. */
export const SCORE_VERSION = 'le-1';

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
   *  existing caller still type-checks; read ONLY by the residential follow-on rule below, and
   *  only as the record's own words. */
  work_class?: string | null;
  permit_type?: string | null;
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

/** The trade a permit's own text names, or null when its words name none of ours. Pure and
 *  deterministic; reads title, description and the record's classification columns only. */
export function permittedTrade(event: Pick<LeadEventLike, 'title' | 'description' | 'work_class' | 'permit_type'>): TradeKey | null {
  const text = [event.title, event.description, event.work_class, event.permit_type]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ')
    .toLowerCase();
  if (!text) return null;
  for (const [re, trade] of PERMITTED_TRADE_PATTERNS) if (re.test(text)) return trade;
  return null;
}

/** Do jobs of `permitted` scope typically create work for `trade` afterwards? */
export function isFollowOnTrade(permitted: TradeKey, trade: TradeKey): boolean {
  return (FOLLOW_ON_TRADES[permitted] ?? []).includes(trade);
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

  // THE FOLLOW-ON RULE (residential permits only — see the block comment above).
  if (segment === 'residential' && (event.event_type === 'permit_issued' || event.event_type === 'permit_applied')) {
    const permitted = permittedTrade(event);
    if (permitted) {
      const permittedLabel = TRADES[permitted].label.toLowerCase();
      if (permitted === trade) {
        score -= PERMITTED_TRADE_PENALTY;
        reasons.push(`-${PERMITTED_TRADE_PENALTY}: the permit names ${permittedLabel} itself — that scope is usually contracted before the permit is pulled`);
      } else if (isFollowOnTrade(permitted, trade)) {
        score += FOLLOW_ON_BONUS;
        reasons.push(`+${FOLLOW_ON_BONUS}: permitted work is ${permittedLabel}; ${TRADES[trade].label.toLowerCase()} typically follows`);
      }
    }
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
