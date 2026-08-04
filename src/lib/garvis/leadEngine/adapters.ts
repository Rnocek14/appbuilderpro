// src/lib/garvis/leadEngine/adapters.ts
// SOURCE ADAPTERS — pure. Turn a portal's API response into candidate le_events rows. No fetch,
// no Supabase, no clock: the lead-ingest edge function owns the I/O (through safeFetch); these
// own the URL construction, the row extraction, and the verbatim normalization. Verified with
// fixtures in leadEngine.verify.ts.
//
// Config-driven on purpose: every city names its fields differently, so a source row carries a
// field_map instead of us hardcoding one city's schema. VERBATIM RULE: a field the map can't
// find is null — never guessed, never defaulted to something that looks plausible.

import { dedupeKey, type LeadEventType, type NamedParty } from './leadEngine.ts';

export type SourceKind = 'socrata' | 'arcgis' | 'accela' | 'liquor' | 'health' | 'sos' | 'rss';

export interface SourceLike {
  kind: SourceKind;
  base_url: string;
  region: string;
  /** field_map: source column names for our normalized fields. event_type: what this source's
   *  rows ARE (a liquor board emits liquor_license). where: extra server-side filter. */
  query_config: {
    event_type?: LeadEventType;
    date_field?: string;
    field_map?: {
      title?: string; address?: string; valuation?: string; description?: string;
      date?: string; contact_name?: string; contact_company?: string; permalink?: string;
    };
    where?: string;
    [k: string]: unknown;
  };
  cursor: { last_date?: string; [k: string]: unknown };
}

export interface CandidateEvent {
  event_type: LeadEventType;
  occurred_at: string | null;
  address: string | null;
  region: string;
  valuation_usd: number | null;
  title: string;
  description: string | null;
  named_parties: NamedParty[];
  raw: Record<string, unknown>;
  source_url: string;
  dedupe_key: string;
}

const DEFAULT_TYPE: Record<SourceKind, LeadEventType> = {
  socrata: 'permit_issued', arcgis: 'permit_issued', accela: 'permit_issued',
  liquor: 'liquor_license', health: 'health_permit', sos: 'business_registered', rss: 'news',
};

export const FETCH_LIMIT = 100; // per source per tick — a backlog drains over ticks, never in one stampede

/** Build the incremental fetch URL for a source. Socrata (SODA 2.x) and ArcGIS REST are the two
 *  Phase-0 dialects; accela/liquor/health/sos portals that speak plain JSON reuse 'socrata' via
 *  their kind's own default event_type. Cursoring is by the configured date field. */
export function buildFetchUrl(source: SourceLike): string {
  const cfg = source.query_config ?? {};
  const dateField = (cfg.date_field ?? '').trim();
  const since = (source.cursor?.last_date ?? '').trim();
  const base = source.base_url;

  if (source.kind === 'arcgis') {
    const clauses: string[] = [];
    if (cfg.where && String(cfg.where).trim()) clauses.push(`(${String(cfg.where).trim()})`);
    if (dateField && since) clauses.push(`${dateField} > TIMESTAMP '${since.replace(/'/g, '')}'`);
    const where = clauses.length ? clauses.join(' AND ') : '1=1';
    const p = new URLSearchParams({
      where, outFields: '*', f: 'json', resultRecordCount: String(FETCH_LIMIT),
      ...(dateField ? { orderByFields: `${dateField} ASC` } : {}),
    });
    return `${base}${base.includes('?') ? '&' : '?'}${p.toString()}`;
  }

  // Socrata-style JSON resource (the default dialect).
  const p = new URLSearchParams({ $limit: String(FETCH_LIMIT) });
  const clauses: string[] = [];
  if (cfg.where && String(cfg.where).trim()) clauses.push(`(${String(cfg.where).trim()})`);
  if (dateField && since) clauses.push(`${dateField} > '${since.replace(/'/g, '')}'`);
  if (clauses.length) p.set('$where', clauses.join(' AND '));
  if (dateField) p.set('$order', `${dateField} ASC`);
  return `${base}${base.includes('?') ? '&' : '?'}${p.toString()}`;
}

/** Extract the row array from a response body. Socrata: a JSON array. ArcGIS: features[].attributes.
 *  Anything else that is a JSON array passes through. Unparseable → [] (the caller counts the
 *  failure honestly; an unreadable source is UNREACHABLE, never "no change"). */
export function parseRows(kind: SourceKind, body: string): Record<string, unknown>[] {
  try {
    const data = JSON.parse(body) as unknown;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (kind === 'arcgis' && data && typeof data === 'object') {
      const feats = (data as { features?: { attributes?: Record<string, unknown> }[] }).features;
      if (Array.isArray(feats)) return feats.map((f) => f?.attributes ?? {}).filter((a) => a && typeof a === 'object');
    }
    return [];
  } catch { return []; }
}

function str(row: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null;
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(row: Record<string, unknown>, key: string | undefined): number | null {
  if (!key) return null;
  const v = row[key];
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** ArcGIS dates are epoch millis; Socrata dates are ISO-ish strings. Either → ISO, else null. */
export function toIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  const t = Number.isFinite(n) && n > 10_000_000_000 ? n : Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Normalize one source row into a candidate event — verbatim fields only. Rows with no title
 *  AND no address are dropped (nothing identifiable to act on). */
export function normalizeEvent(source: SourceLike, row: Record<string, unknown>): CandidateEvent | null {
  const cfg = source.query_config ?? {};
  const map = cfg.field_map ?? {};
  const title = str(row, map.title) ?? '';
  const address = str(row, map.address);
  if (!title && !address) return null;

  const name = str(row, map.contact_name);
  const company = str(row, map.contact_company);
  const parties: NamedParty[] = [];
  if (name || company) parties.push({ role: 'applicant', ...(name ? { name } : {}), ...(company ? { company } : {}) });

  const event = {
    event_type: cfg.event_type ?? DEFAULT_TYPE[source.kind],
    occurred_at: toIso(map.date ? row[map.date] : (cfg.date_field ? row[cfg.date_field] : null)),
    address,
    region: source.region,
    valuation_usd: num(row, map.valuation),
    title: title || (address as string),
    description: str(row, map.description),
    named_parties: parties,
    raw: row,
    source_url: str(row, map.permalink) ?? source.base_url,
  };
  return { ...event, dedupe_key: dedupeKey(event) };
}

/** The next cursor after a batch: the max date seen (ISO), else the cursor unchanged. Pure —
 *  passing the same rows twice moves nothing. */
export function nextCursor(source: SourceLike, events: CandidateEvent[]): SourceLike['cursor'] {
  const dates = events.map((e) => e.occurred_at).filter((d): d is string => !!d).sort();
  const max = dates[dates.length - 1];
  return max ? { ...source.cursor, last_date: max } : { ...source.cursor };
}

// ---------------------------------------------------------------------------
// Starter presets — well-known public permit datasets, so wiring a market is a
// pick, not a research project. HONESTY NOTE: dataset URLs and column names are
// as last known (portals do move); the FIRST CHECK verifies each one live and a
// miss reports as unreachable with its reason — never silently. Everything is
// editable before saving.
// ---------------------------------------------------------------------------

export interface StarterSource {
  id: string;
  label: string;
  region: string;
  kind: SourceKind;
  base_url: string;
  query_config: SourceLike['query_config'];
}

export const STARTER_SOURCES: StarterSource[] = [
  {
    id: 'chicago-permits', label: 'Chicago building permits', region: 'Chicago, IL', kind: 'socrata',
    base_url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issue_date',
      field_map: { title: 'work_description', address: 'street_name', valuation: 'reported_cost', date: 'issue_date', contact_name: 'contact_1_name' },
    },
  },
  {
    id: 'nyc-dob-permits', label: 'NYC DOB permit issuance', region: 'New York, NY', kind: 'socrata',
    base_url: 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issuance_date',
      field_map: { title: 'job_type', address: 'street_name', date: 'issuance_date', contact_company: 'permittee_s_business_name' },
    },
  },
  {
    id: 'sf-building-permits', label: 'San Francisco building permits', region: 'San Francisco, CA', kind: 'socrata',
    base_url: 'https://data.sfgov.org/resource/i98e-djp9.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issued_date',
      field_map: { title: 'description', address: 'street_name', valuation: 'estimated_cost', date: 'issued_date' },
    },
  },
  {
    id: 'austin-permits', label: 'Austin building permits', region: 'Austin, TX', kind: 'socrata',
    base_url: 'https://data.austintexas.gov/resource/3syk-w9eu.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issued_date',
      field_map: { title: 'description', address: 'original_address1', valuation: 'total_job_valuation', date: 'issued_date', contact_name: 'applicant_full_name' },
    },
  },
  {
    id: 'seattle-permits', label: 'Seattle building permits', region: 'Seattle, WA', kind: 'socrata',
    base_url: 'https://data.seattle.gov/resource/76t8-zvzf.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issueddate',
      field_map: { title: 'description', address: 'originaladdress1', valuation: 'estprojectcost', date: 'issueddate', contact_name: 'applicantname' },
    },
  },
];

export function starterById(id: string): StarterSource | null {
  return STARTER_SOURCES.find((s) => s.id === id) ?? null;
}
