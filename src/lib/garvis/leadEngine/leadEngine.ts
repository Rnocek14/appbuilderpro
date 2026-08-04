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

export interface NamedParty { role?: string; name?: string; company?: string }

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
  source_url: string;
}

// ---------------------------------------------------------------------------
// Trades — which events feed which trade, and how strongly (0 = not relevant)
// ---------------------------------------------------------------------------

export type TradeKey = 'acoustics' | 'security' | 'janitorial' | 'fire_safety' | 'signage';

export interface TradeProfile {
  label: string;
  /** Base relevance per event type, 0..40. 0 = this event never becomes a lead for this trade. */
  weights: Partial<Record<LeadEventType, number>>;
  /** One honest line of why this trade buys after these events — shown in the UI, never sent. */
  buys: string;
}

export const TRADES: Record<TradeKey, TradeProfile> = {
  acoustics: {
    label: 'Acoustic panels & treatment',
    weights: { permit_issued: 30, permit_applied: 20, liquor_license: 35, health_permit: 30, business_registered: 15, news: 10 },
    buys: 'Fit-outs, restaurants, gyms, and offices treat sound near the end of build-out.',
  },
  security: {
    label: 'Security & access control',
    weights: { permit_issued: 35, permit_applied: 25, liquor_license: 30, health_permit: 25, business_registered: 20, news: 10 },
    buys: 'Every new commercial space needs alarms, cameras, and access control before opening.',
  },
  janitorial: {
    label: 'Commercial cleaning',
    weights: { permit_issued: 25, permit_applied: 10, liquor_license: 30, health_permit: 35, business_registered: 20, news: 10 },
    buys: 'New locations sign recurring cleaning contracts at opening.',
  },
  fire_safety: {
    label: 'Fire & life safety',
    weights: { permit_issued: 35, permit_applied: 25, liquor_license: 25, health_permit: 25, business_registered: 15, news: 5 },
    buys: 'Code-mandated: every new commercial space buys inspection and monitoring, forever.',
  },
  signage: {
    label: 'Signage',
    weights: { permit_issued: 25, permit_applied: 15, liquor_license: 35, health_permit: 30, business_registered: 25, news: 10 },
    buys: 'A new location needs signs before it opens — timing is everything.',
  },
};

export const TRADE_KEYS = Object.keys(TRADES) as TradeKey[];

export function isTradeKey(v: unknown): v is TradeKey {
  return typeof v === 'string' && v in TRADES;
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

/** type :: normalized address (or title) :: month bucket. The month bucket keeps a re-fetched
 *  record identical while letting a genuinely new filing at the same address (next quarter's
 *  renovation) be a new event. */
export function dedupeKey(e: Pick<LeadEventLike, 'event_type' | 'address' | 'title' | 'occurred_at'>): string {
  const place = normalizeKeyPart(e.address || e.title);
  const bucket = (e.occurred_at ?? '').slice(0, 7) || 'undated';
  return `${e.event_type}::${place}::${bucket}`;
}

// ---------------------------------------------------------------------------
// Scoring — deterministic, reasons attached, caller supplies now
// ---------------------------------------------------------------------------

export interface LeadScore { score: number; reasons: string[] }

const DAY_MS = 86_400_000;

/** Score an event for a trade. Returns null when the trade has no weight for this event type —
 *  a zero-relevance pairing never becomes a lead row. Score is 0..100:
 *  base weight (0..40) + valuation band (0..30) + recency (0..20) + named contact (0..10). */
export function scoreLead(event: LeadEventLike, trade: TradeKey, nowIso: string): LeadScore | null {
  const base = TRADES[trade].weights[event.event_type] ?? 0;
  if (base <= 0) return null;
  const reasons: string[] = [`${event.event_type.replace(/_/g, ' ')} is a ${TRADES[trade].label} trigger (+${base})`];
  let score = base;

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

  return { score: Math.min(100, score), reasons };
}

/** The best contact the record itself names: prefer a party with a person name, else a company.
 *  Null when the record names nobody — the lead ships without a contact, honestly. */
export function pickContact(parties: NamedParty[]): NamedParty | null {
  if (!Array.isArray(parties)) return null;
  const named = parties.filter((p) => (p?.name ?? '').trim() || (p?.company ?? '').trim());
  if (!named.length) return null;
  return named.find((p) => (p.name ?? '').trim()) ?? named[0];
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
  source_url: string;
  title: string;
}

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
      `   Source: ${l.source_url}`,
    ].filter(Boolean).join('\n');
  });
  const body = `Top leads for ${worldLabel}, ranked by the engine's stated reasons:\n\n${lines.join('\n\n')}\n\nEvery lead links its public record. Reply with what you quoted or won — outcomes make next week's ranking smarter.`;
  return { subject, body, included: ranked.length };
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
}

/** Parse an order's config into a safe LeadEngineConfig. Unknown trades are dropped; an empty
 *  list falls back to ALL trades (scoring more is honest; delivering is still gated). */
export function parseLeadEngineConfig(config: unknown): LeadEngineConfig {
  const c = (config ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(c.trades) ? (c.trades as unknown[]).filter(isTradeKey) : [];
  const pct = Number(c.commissionPct);
  return {
    trades: raw.length ? (raw as TradeKey[]) : [...TRADE_KEYS],
    commissionPct: Number.isFinite(pct) ? Math.max(0, Math.min(50, pct)) : DEFAULT_COMMISSION_PCT,
  };
}

/** The honest one-line record of an ingest run. */
export function ingestLine(sourcesChecked: number, sourcesFailed: number, eventsNew: number, leadsNew: number): string {
  if (sourcesChecked === 0) return 'No active sources to check — add a permit portal or registry to this market.';
  const src = `${sourcesChecked} source${sourcesChecked === 1 ? '' : 's'} checked${sourcesFailed ? ` (${sourcesFailed} unreachable — counted, will retry)` : ''}`;
  if (eventsNew === 0) return `${src} — nothing new since the last run.`;
  return `${src} — ${eventsNew} new event${eventsNew === 1 ? '' : 's'}, ${leadsNew} scored lead${leadsNew === 1 ? '' : 's'}.`;
}
