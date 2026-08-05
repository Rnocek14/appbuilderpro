// src/lib/garvis/leadEngine/adapters.ts
// SOURCE ADAPTERS — pure. Turn a portal's API response into candidate le_events rows. No fetch,
// no Supabase, no clock: the lead-ingest edge function owns the I/O (through safeFetch); these
// own the URL construction, the row extraction, and the verbatim normalization. Verified with
// fixtures in leadEngine.verify.ts.
//
// Config-driven on purpose: every city names its fields differently, so a source row carries a
// field_map instead of us hardcoding one city's schema. VERBATIM RULE: a field the map can't
// find is null — never guessed, never defaulted to something that looks plausible.

import {
  contentHash, dedupeKey, normalizeKeyPart, normalizeRole, normalizeStatus,
  type LeadEventType, type MarketSegment, type NamedParty, type RecordStatus,
} from './leadEngine.ts';

export type SourceKind = 'socrata' | 'arcgis' | 'accela' | 'liquor' | 'health' | 'sos' | 'rss';

/** One party's column-set on a source row. Every key names a COLUMN except `role`, which is the
 *  literal role label to stamp (use `role_field` when the record itself labels the party — the
 *  Chicago pattern, where contact_1_type says 'CONTRACTOR-ELECTRICAL'). */
export interface PartyMap {
  role?: string;
  role_field?: string;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  license_no?: string;
  /** Several feeds split a person across first/last columns — the mirror of address_parts.
   *  Without a joiner those sources cannot produce a contact at all. */
  name_parts?: string[];
}

export interface FieldMap {
  title?: string; address?: string; valuation?: string; description?: string;
  date?: string; contact_name?: string; contact_company?: string; permalink?: string;
  /** Most permit feeds split an address across columns (street_number + direction + name +
   *  suffix). Joining them is REQUIRED for a usable lead — and for dedupe: without the house
   *  number every permit on one street in one month collapses into a single event. */
  address_parts?: string[];
  /** The mirror of address_parts for people (first + last name columns). */
  name_parts?: string[];

  // identity — the dedupe fix (capture spec §3.1)
  record_id?: string; parent_record_id?: string;

  // lifecycle — overwritten in place upstream, so unrecoverable if not taken now (§3.2)
  status?: string; status_date?: string;
  applied_date?: string; issued_date?: string; approved_date?: string;
  completed_date?: string; expires_date?: string;

  // geography / parcel (§3.3)
  lat?: string; lon?: string; parcel_id?: string;
  city?: string; state?: string; postal_code?: string; unit?: string;

  // classification — the commercial discriminator that replaces a valuation floor (§3.4)
  property_class?: string; work_class?: string;
  permit_type?: string; permit_sub_type?: string;
  use_type?: string; proposed_use?: string;

  // sizing — turns a lead into a price (§3.5)
  sqft_total?: string; sqft_new?: string; sqft_remodel?: string;
  stories?: string; units?: string; year_built?: string; fees?: string;
}

export interface SourceLike {
  kind: SourceKind;
  base_url: string;
  region: string;
  /** A STABLE slug ('chicago-il'), not the free-text region label. It is half of a record's
   *  identity, so two markets with overlapping regions can never collide. */
  jurisdiction?: string | null;
  /** field_map: source column names for our normalized fields. event_type: what this source's
   *  rows ARE (a liquor board emits liquor_license). where: extra server-side filter. */
  query_config: {
    event_type?: LeadEventType;
    date_field?: string;
    field_map?: FieldMap;
    /** Several column-sets, each a party on the record: Austin's contractor + applicant,
     *  Chicago's contact_1..15, NYC's permittee + owner. Persisted to le_event_parties. */
    parties?: PartyMap[];
    where?: string;
    /** A per-record public URL built from the row, used when the dataset has no permalink
     *  COLUMN. `{record_id}` / `{parent_record_id}` are substituted; if a referenced value is
     *  missing the link is null, never a half-built URL. */
    permalink_template?: string;
    jurisdiction?: string;
    /** Residential-junk floor: a record whose stated value is BELOW this is DISQUALIFIED — it is
     *  still stored (with the reason), because a rolling portal window makes a dropped row
     *  unrecoverable. Records with no stated value are kept qualified: we don't judge what the
     *  record doesn't say. */
    min_valuation_usd?: number;
    [k: string]: unknown;
  };
  /** Free-form jsonb on le_sources. `last_date` is the incremental watermark; `page_offset` is
   *  WHERE INSIDE that watermark's window we stopped (capture spec §6.6.2). A cursor carrying a
   *  page_offset is a RESUME point: the date filter stays put and the next tick continues at that
   *  row, so a day with more rows than one tick can read is never partially consumed and skipped. */
  cursor: { last_date?: string; page_offset?: number; [k: string]: unknown };
}

/** A party read off a record, with the column it came from (the verbatim discipline). */
export interface PartyCapture {
  ordinal: number;
  role: string | null;
  role_normalized: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  license_no: string | null;
  source_field: string;
}

export interface CandidateEvent {
  event_type: LeadEventType;
  occurred_at: string | null;
  /** WHICH date occurred_at came from — a filed date and a final date are otherwise
   *  indistinguishable once stored (capture spec §3.2). */
  occurred_kind: string | null;
  address: string | null;
  region: string;
  jurisdiction: string | null;
  valuation_usd: number | null;
  title: string;
  description: string | null;
  named_parties: NamedParty[];
  parties: PartyCapture[];
  raw: Record<string, unknown>;
  /** The record's own URL — null when the dataset publishes none. NEVER base_url. */
  source_url: string | null;
  dedupe_key: string;

  source_record_id: string | null;
  parent_record_id: string | null;
  record_status: string | null;
  status_normalized: RecordStatus;
  status_date: string | null;
  applied_at: string | null;
  issued_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  lat: number | null;
  lon: number | null;
  parcel_id: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  unit: string | null;
  property_class: string | null;
  work_class: string | null;
  permit_type: string | null;
  permit_sub_type: string | null;
  use_type: string | null;
  proposed_use: string | null;
  sqft_total: number | null;
  sqft_new: number | null;
  sqft_remodel: number | null;
  stories: number | null;
  units: number | null;
  year_built: number | null;
  fees_usd: number | null;

  /** Change detection over the normalized fields (never the raw row — a portal reordering keys
   *  is not a change). */
  content_hash: string;
  /** Stored, not dropped: a row below the junk floor persists with its reason so a filter
   *  mistake is visible and reversible instead of silent and permanent (§3.9). */
  qualified: boolean;
  disqualified_reason: string | null;
}

const DEFAULT_TYPE: Record<SourceKind, LeadEventType> = {
  socrata: 'permit_issued', arcgis: 'permit_issued', accela: 'permit_issued',
  liquor: 'liquor_license', health: 'health_permit', sos: 'business_registered', rss: 'news',
};

export const FETCH_LIMIT = 100; // rows per PAGE — a backlog drains over pages and ticks, never in one stampede

/** Pages per source per tick. FETCH_LIMIT × this is the most rows one source can consume in one
 *  run; past it the cursor keeps its date and records a `page_offset`, and the next tick resumes
 *  mid-window. Bounded work per tick, and never a skipped record (capture spec §6.6.2). */
export const MAX_PAGES_PER_TICK = 10;

/** The row offset a fetch should start at: the explicit page offset when the caller is paging
 *  within a tick, else the cursor's stored resume point, else the top of the window. */
export function fetchOffset(source: Pick<SourceLike, 'cursor'>, offset?: number): number {
  const n = Number(offset ?? source.cursor?.page_offset ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** The wire format a source speaks: JSON (Socrata/ArcGIS/plain), CSV export, or an RSS/Atom feed.
 *  Explicit via query_config.format; the rss kind defaults to 'rss', everything else to 'json'. */
export type SourceFormat = 'json' | 'csv' | 'rss';
export function sourceFormat(source: Pick<SourceLike, 'kind' | 'query_config'>): SourceFormat {
  const f = source.query_config?.format;
  if (f === 'csv' || f === 'rss' || f === 'json') return f;
  return source.kind === 'rss' ? 'rss' : 'json';
}

/** Build the incremental fetch URL for a source, optionally at a page offset. Socrata (SODA 2.x)
 *  and ArcGIS REST are the two JSON dialects; accela/liquor/health/sos portals that speak plain
 *  JSON reuse 'socrata' via their kind's own default event_type. CSV and RSS sources fetch
 *  base_url as-is (whole-feed reads — the dedupe key makes re-reads free), and ignore paging.
 *  Cursoring is by the configured date field.
 *
 *  THE CURSOR SKIP (capture spec §6.6.2): this used to send `$limit` with NO `$offset`, ordered by
 *  date ASC, and the cursor then advanced to the max date seen — so any day with more than
 *  FETCH_LIMIT qualifying records (routine in NYC and Chicago) moved the watermark past that day
 *  and the rest of it was never fetched again. Now the window is PAGED: `$offset` (SODA) /
 *  `resultOffset` (ArcGIS) walks it, and the date filter deliberately stays pinned to the SAME
 *  `cursor.last_date` while a `page_offset` is outstanding — resuming where we stopped instead of
 *  stepping over the remainder. */
export function buildFetchUrl(source: SourceLike, offset?: number): string {
  const cfg = source.query_config ?? {};
  if (sourceFormat(source) !== 'json') return source.base_url;
  const dateField = (cfg.date_field ?? '').trim();
  // NOT advanced mid-window: while paging, every page filters on the same watermark the tick
  // started with. Advancing it here is precisely the skip this fix exists to remove.
  const since = (source.cursor?.last_date ?? '').trim();
  const off = fetchOffset(source, offset);
  const base = source.base_url;

  if (source.kind === 'arcgis') {
    const clauses: string[] = [];
    if (cfg.where && String(cfg.where).trim()) clauses.push(`(${String(cfg.where).trim()})`);
    if (dateField && since) clauses.push(`${dateField} > TIMESTAMP '${since.replace(/'/g, '')}'`);
    const where = clauses.length ? clauses.join(' AND ') : '1=1';
    const p = new URLSearchParams({
      where, outFields: '*', f: 'json', resultRecordCount: String(FETCH_LIMIT),
      ...(dateField ? { orderByFields: `${dateField} ASC` } : {}),
      ...(off ? { resultOffset: String(off) } : {}),
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
  if (off) p.set('$offset', String(off));
  return `${base}${base.includes('?') ? '&' : '?'}${p.toString()}`;
}

/** Parse one CSV line respecting double-quoted fields (with "" escapes). Pure and small on
 *  purpose — government CSV exports are simple; a feed this can't read reports as unreachable. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** CSV export → row objects keyed by the header row (the field_map then works exactly as for
 *  JSON sources). Handles \r\n and quoted fields; rows shorter than the header are padded null. */
export function parseCsv(body: string): Record<string, unknown>[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? null; });
    return row;
  });
}

const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
const tagText = (item: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(item);
  return m ? stripCdata(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null : null;
};

/** RSS/Atom feed → row objects {title, link, pubDate, description}. Regex-based on purpose (no
 *  DOM in the worker runtime); a feed it can't read yields [] and the source reports unreachable. */
export function parseRss(body: string): Record<string, unknown>[] {
  const items = body.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  return items.map((item) => {
    // Atom links are attributes: <link href="…"/>. RSS links are element text.
    const atomLink = /<link[^>]*href="([^"]+)"/i.exec(item)?.[1] ?? null;
    return {
      title: tagText(item, 'title'),
      link: tagText(item, 'link') ?? atomLink,
      pubDate: tagText(item, 'pubDate') ?? tagText(item, 'updated') ?? tagText(item, 'published'),
      description: tagText(item, 'description') ?? tagText(item, 'summary'),
    };
  }).filter((r) => r.title || r.link);
}

/** Extract the row array from a response body, by the source's wire format. JSON: a Socrata-style
 *  array or ArcGIS features[].attributes. CSV: header-keyed rows. RSS: item objects. Unparseable →
 *  [] (the caller counts the failure honestly; an unreadable source is UNREACHABLE, never
 *  "no change"). */
export function parseRows(kind: SourceKind, body: string, format?: SourceFormat): Record<string, unknown>[] {
  return parseRowsResult(kind, body, format).rows;
}

/** parseRows, but it says WHY it read nothing. A truncated body, a changed response shape or a
 *  WAF interstitial all parse to zero rows, and reporting that as "Checked — 0 rows read" lets a
 *  source be dead for months while the UI calls it healthy (capture spec §6.6). The caller counts
 *  `ok: false` as UNREACHABLE — the module's own stated rule. An empty ARRAY is genuinely
 *  no-change and stays ok. */
export function parseRowsResult(
  kind: SourceKind, body: string, format?: SourceFormat,
): { rows: Record<string, unknown>[]; ok: boolean; error: string | null } {
  const fmt = format ?? (kind === 'rss' ? 'rss' : 'json');
  const ok = (rows: Record<string, unknown>[]) => ({ rows, ok: true, error: null });
  const bad = (error: string) => ({ rows: [] as Record<string, unknown>[], ok: false, error });
  if (fmt === 'csv') {
    const rows = parseCsv(body);
    return rows.length || !body.trim() ? ok(rows) : bad('CSV body had no readable header + row');
  }
  if (fmt === 'rss') {
    const rows = parseRss(body);
    return rows.length || /<(rss|feed)[\s>]/i.test(body) ? ok(rows) : bad('Body is not a readable RSS/Atom feed');
  }
  let data: unknown;
  try {
    data = JSON.parse(body) as unknown;
  } catch {
    return bad(`Body is not JSON (${body.trim().slice(0, 40).replace(/\s+/g, ' ')}…) — truncated, blocked, or an error page`);
  }
  if (Array.isArray(data)) return ok(data as Record<string, unknown>[]);
  if (kind === 'arcgis' && data && typeof data === 'object') {
    const feats = (data as { features?: { attributes?: Record<string, unknown> }[] }).features;
    if (Array.isArray(feats)) return ok(feats.map((f) => f?.attributes ?? {}).filter((a) => a && typeof a === 'object'));
  }
  const err = (data as { error?: { message?: string }; message?: string } | null);
  return bad(`JSON was not a row array${err?.error?.message || err?.message ? ` — portal said: ${String(err.error?.message ?? err.message).slice(0, 80)}` : ''}`);
}

function str(row: Record<string, unknown>, key: string | undefined): string | null {
  if (!key) return null;
  const v = row[key];
  if (v == null) return null;
  // Socrata 'url' columns arrive as {url, description}; 'location'/'point' columns as objects
  // too. A structured value is NOT a string — stringifying one yields "[object Object]", which
  // would be an invented field. Take the url when there is one, else null.
  if (typeof v === 'object') {
    const u = (v as Record<string, unknown>).url;
    return typeof u === 'string' && u.trim() ? u.trim() : null;
  }
  const s = String(v).trim();
  return s ? s : null;
}

/** A non-negative quantity (valuation, sqft, fees). Negatives are data errors here, not values. */
function num(row: Record<string, unknown>, key: string | undefined): number | null {
  const n = signed(row, key);
  return n !== null && n >= 0 ? n : null;
}

/** A SIGNED number — longitude is negative across the entire United States, so lat/lon must not
 *  go through the non-negative guard above (that bug would null every western coordinate). */
function signed(row: Record<string, unknown>, key: string | undefined): number | null {
  if (!key) return null;
  const v = row[key];
  if (v == null || v === '' || typeof v === 'object') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function int(row: Record<string, unknown>, key: string | undefined): number | null {
  const n = num(row, key);
  return n === null ? null : Math.trunc(n);
}

/** Join a set of columns into one string (address parts, first+last name). Missing parts are
 *  skipped, never padded with a placeholder. */
function joinParts(row: Record<string, unknown>, keys: string[] | undefined): string | null {
  if (!keys?.length) return null;
  return keys.map((k) => str(row, k)).filter(Boolean).join(' ').trim() || null;
}

/** Date columns → ISO, else null.
 *
 *  Two corrections from capture spec §6.5:
 *  1. Socrata serves FLOATING timestamps ('2024-03-15T00:00:00.000' — no zone). `Date.parse`
 *     reads those as LOCAL time, so on a non-UTC runtime a month-boundary record lands in a
 *     different bucket, the key changes, and the same record ingests twice. Floating stamps are
 *     now pinned to UTC explicitly.
 *  2. The epoch-millis heuristic ("any number > 10^10 is a timestamp") turns a numeric permit id
 *     into a plausible-looking date. It now applies ONLY where it is true — ArcGIS — via the
 *     per-source `date_format` hint. */
export type DateFormat = 'auto' | 'iso' | 'epoch_ms';

export function toIso(v: unknown, format: DateFormat = 'auto'): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return null;
  const s = String(v).trim();
  if (!s) return null;
  if (format !== 'iso') {
    const n = Number(s);
    // A bare number is epoch millis only when told so, or (auto) when it cannot be a year/id —
    // 'auto' keeps the historic ArcGIS behaviour for sources that predate the hint.
    if (Number.isFinite(n) && /^-?\d+$/.test(s) && (format === 'epoch_ms' || n > 10_000_000_000)) {
      return Number.isFinite(n) ? new Date(n).toISOString() : null;
    }
    if (format === 'epoch_ms') return null;
  }
  // Floating (zoneless) datetime → UTC, explicitly.
  const floating = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s);
  const t = Date.parse(floating ? `${s.replace(' ', 'T')}${s.includes('T') || s.includes(' ') ? '' : 'T00:00:00'}Z` : s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** A region label ("Denver, CO") → a stable slug ("denver-co"). Used when a source was created
 *  without an explicit jurisdiction: identity must never key on an empty string. */
export function slugJurisdiction(label: string | null | undefined): string {
  return normalizeKeyPart(label ?? '') || 'unknown';
}

/** The source's stable jurisdiction slug: the column, else the configured one, else a slug of the
 *  region label. Always something — identity must never key on an empty string. */
export function sourceJurisdiction(source: Pick<SourceLike, 'jurisdiction' | 'region' | 'query_config'>): string {
  const explicit = (source.jurisdiction ?? '').trim()
    || String(source.query_config?.jurisdiction ?? '').trim();
  return slugJurisdiction(explicit || source.region || '');
}

/** The config fingerprint stamped onto every event: which where-clause and floor were in effect
 *  when this row was taken. Without it the corpus's coverage footprint is retroactively
 *  unknowable (capture spec §3.8). */
export function configHash(source: Pick<SourceLike, 'query_config'>): string {
  return contentHash(source.query_config ?? {});
}

/** Build the per-record public URL from a template. Every referenced token must resolve, or the
 *  link is null — a half-substituted URL is worse than no link. */
function fillPermalink(template: string | undefined, values: Record<string, string | null>): string | null {
  if (!template) return null;
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = values[k];
    if (!v) { missing = true; return ''; }
    return encodeURIComponent(v);
  });
  return missing ? null : out;
}

/** Read one party's columns off a row. Null when the column-set names nobody at all — an empty
 *  party row is noise, not provenance. */
function readParty(row: Record<string, unknown>, pm: PartyMap, ordinal: number): PartyCapture | null {
  const used: string[] = [];
  const take = (key: string | undefined): string | null => {
    const v = str(row, key);
    if (v && key) used.push(key);
    return v;
  };
  const name = pm.name_parts?.length
    ? (() => { const v = joinParts(row, pm.name_parts); if (v) used.push(...pm.name_parts!); return v; })()
    : take(pm.name);
  const company = take(pm.company);
  const phone = take(pm.phone);
  const email = take(pm.email);
  const license_no = take(pm.license_no);
  const roleRaw = take(pm.role_field) ?? (pm.role ?? null);
  if (!name && !company && !phone && !email && !license_no) return null;
  return {
    ordinal,
    role: roleRaw,
    role_normalized: normalizeRole(roleRaw),
    name, company, phone, email, license_no,
    // Provenance: exactly which columns this party was read out of.
    source_field: (used.length ? used : ['(unmapped)']).join('+').slice(0, 200),
  };
}

/** Normalize one source row into a candidate event — verbatim fields only. Rows with no title
 *  AND no address are dropped (nothing identifiable to act on). */
const RSS_DEFAULT_MAP = { title: 'title', permalink: 'link', date: 'pubDate', description: 'description' };

export function normalizeEvent(source: SourceLike, row: Record<string, unknown>): CandidateEvent | null {
  const cfg = source.query_config ?? {};
  const map: FieldMap = { ...(sourceFormat(source) === 'rss' ? RSS_DEFAULT_MAP : {}), ...(cfg.field_map ?? {}) };
  const title = str(row, map.title) ?? '';
  const address = map.address_parts?.length ? joinParts(row, map.address_parts) : str(row, map.address);
  if (!title && !address) return null;

  const dateFormat = (cfg.date_format === 'iso' || cfg.date_format === 'epoch_ms') ? cfg.date_format : 'auto';
  const date = (key: string | undefined) => (key ? toIso(row[key], dateFormat) : null);

  // ── parties ──────────────────────────────────────────────────────────────
  // Legacy single-contact path stays working for every preset and hand-written source that
  // predates multi-party capture; declared `parties` add to it.
  const legacyName = map.name_parts?.length ? joinParts(row, map.name_parts) : str(row, map.contact_name);
  const legacyCompany = str(row, map.contact_company);
  const parties: PartyCapture[] = [];
  if (legacyName || legacyCompany) {
    const used = [
      ...(map.name_parts?.length ? (legacyName ? map.name_parts : []) : (legacyName && map.contact_name ? [map.contact_name] : [])),
      ...(legacyCompany && map.contact_company ? [map.contact_company] : []),
    ];
    parties.push({
      ordinal: 0, role: 'applicant', role_normalized: 'applicant',
      name: legacyName, company: legacyCompany, phone: null, email: null, license_no: null,
      source_field: (used.length ? used : ['(unmapped)']).join('+').slice(0, 200),
    });
  }
  for (const pm of (Array.isArray(cfg.parties) ? cfg.parties : [])) {
    const p = readParty(row, pm, parties.length);
    if (p) parties.push(p);
  }
  // The scoring core reads named_parties; it is the same list, verbatim.
  const named_parties: NamedParty[] = parties.map((p) => ({
    ...(p.role ? { role: p.role } : {}),
    ...(p.role_normalized ? { role_normalized: p.role_normalized as NamedParty['role_normalized'] } : {}),
    ...(p.name ? { name: p.name } : {}),
    ...(p.company ? { company: p.company } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.email ? { email: p.email } : {}),
    ...(p.license_no ? { license_no: p.license_no } : {}),
    ordinal: p.ordinal,
    source_field: p.source_field,
  }));

  // ── the junk floor: FLAG, never drop ─────────────────────────────────────
  // A city permit feed is mostly residential (a deck, a water heater). A record that STATES a
  // value below the floor is not a commercial project and never becomes a lead — but it is still
  // STORED with its reason. Portals serve rolling windows: a dropped row is gone for good, and
  // you cannot prove absence from a value-filtered subset (capture spec §3.9). Records with no
  // stated value stay qualified: we don't judge what the record doesn't say.
  const valuation = num(row, map.valuation);
  const floor = Number(cfg.min_valuation_usd);
  const belowFloor = Number.isFinite(floor) && floor > 0 && valuation !== null && valuation < floor;

  const recordId = str(row, map.record_id);
  const parentRecordId = str(row, map.parent_record_id);
  const recordStatus = str(row, map.status);
  const dateCol = map.date ?? cfg.date_field ?? undefined;
  const KIND_BY_COL: Record<string, string | undefined> = {
    ...(map.issued_date ? { [map.issued_date]: 'issued' } : {}),
    ...(map.applied_date ? { [map.applied_date]: 'applied' } : {}),
    ...(map.approved_date ? { [map.approved_date]: 'approved' } : {}),
    ...(map.completed_date ? { [map.completed_date]: 'completed' } : {}),
    ...(map.expires_date ? { [map.expires_date]: 'expires' } : {}),
    ...(map.status_date ? { [map.status_date]: 'status' } : {}),
  };

  const core = {
    event_type: cfg.event_type ?? DEFAULT_TYPE[source.kind],
    occurred_at: date(dateCol),
    occurred_kind: dateCol ? (KIND_BY_COL[dateCol] ?? dateCol) : null,
    address,
    region: source.region,
    jurisdiction: sourceJurisdiction(source),
    valuation_usd: valuation,
    title: title || (address as string),
    description: str(row, map.description),

    source_record_id: recordId,
    parent_record_id: parentRecordId,
    record_status: recordStatus,
    status_normalized: normalizeStatus(recordStatus),
    status_date: date(map.status_date),
    applied_at: date(map.applied_date),
    issued_at: date(map.issued_date),
    approved_at: date(map.approved_date),
    completed_at: date(map.completed_date),
    expires_at: date(map.expires_date),

    lat: signed(row, map.lat),
    lon: signed(row, map.lon),
    parcel_id: str(row, map.parcel_id),
    city: str(row, map.city),
    state: str(row, map.state),
    postal_code: str(row, map.postal_code),
    unit: str(row, map.unit),

    property_class: str(row, map.property_class),
    work_class: str(row, map.work_class),
    permit_type: str(row, map.permit_type),
    permit_sub_type: str(row, map.permit_sub_type),
    use_type: str(row, map.use_type),
    proposed_use: str(row, map.proposed_use),

    sqft_total: num(row, map.sqft_total),
    sqft_new: num(row, map.sqft_new),
    sqft_remodel: num(row, map.sqft_remodel),
    stories: int(row, map.stories),
    units: int(row, map.units),
    year_built: int(row, map.year_built),
    fees_usd: num(row, map.fees),
  };

  // THE PERMALINK (capture spec §6.6): the record's OWN url — a mapped permalink column first,
  // then a per-record template. It NEVER falls back to base_url: linking the dataset endpoint
  // while promising "every lead links its public record" is the bug this replaced.
  const source_url = str(row, map.permalink)
    ?? fillPermalink(cfg.permalink_template, { record_id: recordId, parent_record_id: parentRecordId });

  return {
    ...core,
    named_parties,
    parties,
    raw: row,
    source_url,
    dedupe_key: dedupeKey(core),
    // Hashed over the NORMALIZED fields, not the raw row: a portal reordering its keys or adding
    // an unmapped column is not a change to anything we hold.
    content_hash: contentHash({ ...core, parties, source_url }),
    qualified: !belowFloor,
    disqualified_reason: belowFloor
      ? `stated value $${Math.round(valuation as number).toLocaleString('en-US')} is below the $${Math.round(floor).toLocaleString('en-US')} floor`
      : null,
  };
}

/** What one tick's paging actually did — the only input the advance decision needs beyond the
 *  rows themselves. `drained` is the honest question: did the last page come back SHORT of
 *  FETCH_LIMIT (the window is exhausted), or did we stop because we hit the page cap with a full
 *  page still in hand (there is provably more behind it)? */
export interface PagingOutcome {
  /** Rows read across every page of this tick. */
  rows: number;
  /** The offset this tick STARTED at — the cursor's page_offset, or 0. */
  startOffset: number;
  /** True only when a page returned fewer than FETCH_LIMIT rows. */
  drained: boolean;
}

/** The next cursor after a tick. Pure — passing the same rows twice moves nothing.
 *
 *  THE ADVANCE RULES (capture spec §6.6.2), and the whole point of the fix:
 *
 *  - **Drained** — the last page came back short, so everything past `last_date` has been read.
 *    Advance `last_date` to the max date seen across ALL of this tick's pages (rows are ordered
 *    ASC, so the tail page holds the true maximum) and CLEAR `page_offset`.
 *  - **Capped** — we stopped at the page cap with a full page in hand, so the window is only
 *    PARTIALLY consumed. Keep `last_date` exactly as it was (the same filter this tick used) and
 *    record `page_offset` = rows consumed in total, so the next tick resumes mid-window.
 *
 *  A partially-consumed day therefore never has its watermark advanced past it. Omitting
 *  `paging` keeps the historic single-page behaviour: treat the batch as drained.
 *
 *  Note the drained-with-no-dates case: `last_date` is left alone and the offset is cleared, so
 *  the window is simply re-read from the top next tick — a free re-read (dedupe absorbs it),
 *  never a silent step over unread rows. */
export function nextCursor(
  source: SourceLike,
  events: readonly Pick<CandidateEvent, 'occurred_at'>[],
  paging?: PagingOutcome,
): SourceLike['cursor'] {
  // `page_offset` is re-derived every tick, never carried by accident.
  const { page_offset: _spent, ...held } = source.cursor ?? {};
  if (paging && !paging.drained) {
    const consumed = Math.max(0, Math.trunc(paging.startOffset || 0)) + Math.max(0, Math.trunc(paging.rows || 0));
    return { ...held, page_offset: consumed };
  }
  const dates = events.map((e) => e.occurred_at).filter((d): d is string => !!d).sort();
  const max = dates[dates.length - 1];
  return max ? { ...held, last_date: max } : { ...held };
}

// ---------------------------------------------------------------------------
// Starter presets — well-known public permit datasets, so wiring a market is a
// pick, not a research project. HONESTY NOTE: dataset URLs and column names are
// as last known (portals do move); the FIRST CHECK verifies each one live and a
// miss reports as unreachable with its reason — never silently. Everything is
// editable before saving.
// ---------------------------------------------------------------------------

/** The residential junk floor. NOT the commercial $25k screen — that number exists to keep
 *  residential work out, and using it here would delete the market. $1,000 only drops the
 *  one-line swaps (a water heater, a single fixture) that no residential contractor sells a
 *  project off. As everywhere: a below-floor row is FLAGGED and stored with its reason, and a
 *  record that states no value at all is never judged against a floor it cannot be measured by. */
export const RESIDENTIAL_FLOOR_USD = 1000;

export interface StarterSource {
  id: string;
  label: string;
  region: string;
  /** Stable slug — half of a record's identity. Never the display region. */
  jurisdiction: string;
  kind: SourceKind;
  base_url: string;
  /** Which market this preset is for. The UI groups by it; quickStartMarket names and configures
   *  the market from it. */
  segment: MarketSegment;
  query_config: SourceLike['query_config'];
}

export const STARTER_SOURCES: StarterSource[] = [
  {
    // Chicago publishes NO permalink column and no commercial marker, so: a per-record SODA URL
    // built from the permit number, and the value floor stays as the size screen (capture spec
    // §3.4). Its 15 TYPE-labelled contact slots are the full project org chart on one row —
    // Chicago deleted all 15 contractor phone columns in July 2019, which is exactly why the
    // names it still publishes are captured now rather than later.
    id: 'chicago-permits', label: 'Chicago building permits', region: 'Chicago, IL',
    jurisdiction: 'chicago-il', kind: 'socrata', segment: 'commercial',
    base_url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issue_date', min_valuation_usd: 25000,
      where: 'reported_cost > 25000',
      permalink_template: 'https://data.cityofchicago.org/resource/ydr8-5enu.json?permit_={record_id}',
      field_map: {
        title: 'work_description', valuation: 'reported_cost', date: 'issue_date',
        contact_name: 'contact_1_name',
        address_parts: ['street_number', 'street_direction', 'street_name', 'suffix'],
        // No status_date: Chicago's `permit_milestone` is a milestone LABEL, not a date, and
        // mapping it to a date slot would be a guess dressed as data. No postal_code either —
        // the only zip on the row is the CONTACT's, which is not the property's.
        record_id: 'permit_', status: 'permit_status',
        applied_date: 'application_start_date', issued_date: 'issue_date',
        permit_type: 'permit_type', permit_sub_type: 'review_type',
        lat: 'latitude', lon: 'longitude', fees: 'total_fee',
      },
      parties: [
        { role_field: 'contact_1_type', name: 'contact_1_name' },
        { role_field: 'contact_2_type', name: 'contact_2_name' },
        { role_field: 'contact_3_type', name: 'contact_3_name' },
        { role_field: 'contact_4_type', name: 'contact_4_name' },
        { role_field: 'contact_5_type', name: 'contact_5_name' },
      ],
    },
  },
  {
    id: 'nyc-dob-permits', label: 'NYC DOB permit issuance', region: 'New York, NY',
    jurisdiction: 'new-york-ny', kind: 'socrata', segment: 'commercial',
    base_url: 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json',
    query_config: {
      // NYC's issuance feed carries no cost column; job_type A1 (major alteration) and NB (new
      // building) are its substantial work — the rest is largely small/residential.
      // permit_si_no is the per-permit serial (the row's own identity); job__ is the JOB, which
      // is the parent that collapses a project's sub-permits.
      event_type: 'permit_issued', date_field: 'issuance_date',
      where: "job_type in ('A1','NB')",
      permalink_template: 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json?permit_si_no={record_id}',
      field_map: {
        title: 'job_type', date: 'issuance_date', contact_company: 'permittee_s_business_name',
        address_parts: ['house__', 'street_name'],
        record_id: 'permit_si_no', parent_record_id: 'job__',
        status: 'permit_status', applied_date: 'filing_date', issued_date: 'issuance_date',
        expires_date: 'expiration_date',
        permit_type: 'permit_type', permit_sub_type: 'permit_subtype', work_class: 'job_type',
        use_type: 'bldg_type', property_class: 'residential',
        // The city is the BOROUGH here: without it "100 Broadway" in Manhattan and in Brooklyn
        // produced an identical key. Cross-borough false merges were guaranteed.
        city: 'borough', postal_code: 'zip_code', parcel_id: 'bin__',
        lat: 'gis_latitude', lon: 'gis_longitude',
      },
      parties: [
        {
          role: 'permittee', name_parts: ['permittee_s_first_name', 'permittee_s_last_name'],
          company: 'permittee_s_business_name', phone: 'permittee_s_phone__',
          license_no: 'permittee_s_license__',
        },
        // Owner-distinct-from-permittee is the highest-intent segment there is: the owner is
        // doing the work and has not named a GC yet.
        {
          role: 'owner', name_parts: ['owner_s_first_name', 'owner_s_last_name'],
          company: 'owner_s_business_name', phone: 'owner_s_phone__',
        },
        { role: 'superintendent', name_parts: ['superintendent_first___last_name'], company: 'superintendent_business_name' },
      ],
    },
  },
  {
    // SF's existing_use vs proposed_use pair is the cleanest tenant-improvement detector in the
    // whole audit: when the two differ, the space is changing use and mechanical, plumbing,
    // electrical and fire subs are all pulled in at once.
    id: 'sf-building-permits', label: 'San Francisco building permits', region: 'San Francisco, CA',
    jurisdiction: 'san-francisco-ca', kind: 'socrata', segment: 'commercial',
    base_url: 'https://data.sfgov.org/resource/i98e-djp9.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issued_date', min_valuation_usd: 25000,
      where: 'estimated_cost > 25000',
      permalink_template: 'https://data.sfgov.org/resource/i98e-djp9.json?permit_number={record_id}',
      field_map: {
        title: 'description', valuation: 'estimated_cost', date: 'issued_date',
        address_parts: ['street_number', 'street_name', 'street_suffix'],
        record_id: 'permit_number',
        status: 'current_status', status_date: 'current_status_date',
        applied_date: 'filed_date', issued_date: 'issued_date', completed_date: 'completed_date',
        expires_date: 'permit_expiration_date',
        permit_type: 'permit_type', permit_sub_type: 'permit_type_definition',
        use_type: 'existing_use', proposed_use: 'proposed_use',
        unit: 'unit', postal_code: 'zipcode', parcel_id: 'block',
        stories: 'number_of_proposed_stories', units: 'proposed_units',
      },
    },
  },
  {
    // Austin is the richest wired feed by a wide margin: permit_class_mapped='Commercial' is a
    // real server-side commercial filter (it replaces the value floor, which keeps $300k
    // residential kitchens and drops unpriced commercial jobs), master_permit_num collapses
    // sub-permits, and the GC's phone number is published INLINE on the permit row.
    // ⚠️ The phone columns are cited from committed third-party DDL, not a live call — the
    // portal is unreachable from this environment (capture spec §0, §12.1). Mapping them is
    // safe under the verbatim rule: a column that does not exist reads as null, never invented.
    id: 'austin-permits', label: 'Austin building permits', region: 'Austin, TX',
    jurisdiction: 'austin-tx', kind: 'socrata', segment: 'commercial',
    base_url: 'https://data.austintexas.gov/resource/3syk-w9eu.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issued_date',
      where: "permit_class_mapped='Commercial'",
      permalink_template: 'https://data.austintexas.gov/resource/3syk-w9eu.json?permit_number={record_id}',
      field_map: {
        title: 'description', address: 'original_address1', valuation: 'total_job_valuation',
        date: 'issued_date', contact_name: 'applicant_full_name', permalink: 'link',
        record_id: 'permit_number', parent_record_id: 'master_permit_num',
        status: 'status_current', status_date: 'statusdate',
        applied_date: 'applied_date', issued_date: 'issued_date',
        completed_date: 'completed_date', expires_date: 'expiresdate',
        property_class: 'permit_class_mapped', work_class: 'work_class',
        permit_type: 'permit_type', permit_sub_type: 'permit_type_desc',
        use_type: 'permit_class',
        sqft_total: 'total_existing_bldg_sqft', sqft_new: 'total_new_add_sqft',
        sqft_remodel: 'remodel_repair_sqft',
        stories: 'number_of_floors', units: 'housing_units',
        parcel_id: 'tcad_id', city: 'original_city', state: 'original_state',
        postal_code: 'original_zip', lat: 'latitude', lon: 'longitude',
      },
      parties: [
        {
          role: 'contractor', name: 'contractor_full_name', company: 'contractor_company_name',
          phone: 'contractor_phone', role_field: 'contractor_trade',
        },
        {
          role: 'applicant', name: 'applicant_full_name', company: 'applicant_organization',
          phone: 'applicant_phone',
        },
      ],
    },
  },
  {
    // DATASET ID FIX (capture spec §6.6): this preset shipped pointing at `76t8-zvzf`, which does
    // not exist — it had almost certainly returned zero rows since the day it shipped, reported
    // as a healthy "0 rows read". The live Building Permits dataset is `76t5-zqzr`, confirmed via
    // the Seattle portal, its Socrata foundry page and the Data.gov catalogue entry.
    // It also carries a real `Link` permalink column and permitclassmapped, a server-side
    // commercial filter that replaces the value floor.
    id: 'seattle-permits', label: 'Seattle building permits', region: 'Seattle, WA',
    jurisdiction: 'seattle-wa', kind: 'socrata', segment: 'commercial',
    base_url: 'https://data.seattle.gov/resource/76t5-zqzr.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issueddate',
      where: "permitclassmapped='Non-Residential'",
      // The `Link` column is the Seattle Services Portal page for the record; the template is the
      // fallback for rows where the portal left it blank.
      permalink_template: 'https://data.seattle.gov/resource/76t5-zqzr.json?permitnum={record_id}',
      field_map: {
        title: 'description', address: 'originaladdress1', valuation: 'estprojectcost',
        date: 'issueddate', contact_company: 'contractorcompanyname', permalink: 'link',
        record_id: 'permitnum', parent_record_id: 'relatedmup',
        status: 'statuscurrent',
        applied_date: 'applieddate', issued_date: 'issueddate',
        completed_date: 'completeddate', expires_date: 'expiresdate',
        property_class: 'permitclassmapped', work_class: 'permitclass',
        permit_type: 'permittypemapped', permit_sub_type: 'permittypedesc',
        units: 'housingunits',
        city: 'originalcity', state: 'originalstate', postal_code: 'originalzip',
        lat: 'latitude', lon: 'longitude',
      },
      parties: [{ role: 'contractor', company: 'contractorcompanyname' }],
    },
  },

  // ── RESIDENTIAL PRESETS ───────────────────────────────────────────────────
  // The same three portals, read for the OTHER buyer. Three deliberate differences from their
  // commercial twins:
  //
  //  1. NO $25k FLOOR. That floor exists to keep residential work OUT; here it would delete the
  //     entire market. A small floor (RESIDENTIAL_FLOOR_USD) stays, only to flag the trivial
  //     one-line swaps — and, as always, a flagged row is STORED with its reason, never dropped,
  //     and a record with no stated value is never judged (capture spec §3.9).
  //  2. A RESIDENTIAL where-clause where the portal publishes a class marker, so the filter is
  //     server-side and the junk never crosses the wire.
  //  3. A DISTINCT jurisdiction slug (`…-res`). The slug is half of a record's identity, and a
  //     residential and a commercial preset for one city can match the SAME permit wherever the
  //     filters overlap (Chicago's do — its only screen is a value floor). Sharing a slug would
  //     let one market's ingest overwrite the other's event row. Separate streams, separate slugs.
  //
  // Everything else is identical to the commercial preset for that city — same dataset, same
  // address_parts, same record_id and permalink discipline — because those are already verified.
  {
    // FILTER PROVENANCE: `permit_class_mapped` and its 'Commercial' value are cited from committed
    // third-party DDL (capture spec §7, and the commercial preset above). 'Residential' is that
    // column's documented counterpart value — RESEARCH-SOURCED, not live-verified from this
    // environment. If the value is wrong the source reports zero rows on its first check, which is
    // visible in le_ingest_runs; it cannot silently mis-file anything.
    id: 'austin-permits-residential', label: 'Austin residential permits', region: 'Austin, TX',
    jurisdiction: 'austin-tx-res', kind: 'socrata', segment: 'residential',
    base_url: 'https://data.austintexas.gov/resource/3syk-w9eu.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issued_date',
      where: "permit_class_mapped='Residential'",
      min_valuation_usd: RESIDENTIAL_FLOOR_USD,
      permalink_template: 'https://data.austintexas.gov/resource/3syk-w9eu.json?permit_number={record_id}',
      field_map: {
        title: 'description', address: 'original_address1', valuation: 'total_job_valuation',
        date: 'issued_date', contact_name: 'applicant_full_name', permalink: 'link',
        record_id: 'permit_number', parent_record_id: 'master_permit_num',
        status: 'status_current', status_date: 'statusdate',
        applied_date: 'applied_date', issued_date: 'issued_date',
        completed_date: 'completed_date', expires_date: 'expiresdate',
        property_class: 'permit_class_mapped', work_class: 'work_class',
        permit_type: 'permit_type', permit_sub_type: 'permit_type_desc',
        use_type: 'permit_class',
        sqft_total: 'total_existing_bldg_sqft', sqft_new: 'total_new_add_sqft',
        sqft_remodel: 'remodel_repair_sqft',
        stories: 'number_of_floors', units: 'housing_units',
        parcel_id: 'tcad_id', city: 'original_city', state: 'original_state',
        postal_code: 'original_zip', lat: 'latitude', lon: 'longitude',
      },
      parties: [
        // On a residential permit the homeowner is frequently the applicant, and the contractor
        // named here is the one who already has the permitted scope — which is exactly what the
        // follow-on rule is about.
        {
          role: 'contractor', name: 'contractor_full_name', company: 'contractor_company_name',
          phone: 'contractor_phone', role_field: 'contractor_trade',
        },
        {
          role: 'applicant', name: 'applicant_full_name', company: 'applicant_organization',
          phone: 'applicant_phone',
        },
      ],
    },
  },
  {
    // Chicago publishes NO property-class marker at all (see the commercial preset), so there is
    // no residential/commercial column to filter on — VERIFIED absent, not un-researched. The only
    // server-side screen available is the same `reported_cost` the commercial preset uses, set
    // here to the small junk floor instead of $25k. Consequence stated plainly: this source reads
    // Chicago's whole permit stream above $1k, commercial rows included; the SEGMENT gate is what
    // decides which trades those rows are scored for.
    id: 'chicago-permits-residential', label: 'Chicago residential permits', region: 'Chicago, IL',
    jurisdiction: 'chicago-il-res', kind: 'socrata', segment: 'residential',
    base_url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issue_date',
      min_valuation_usd: RESIDENTIAL_FLOOR_USD,
      where: `reported_cost > ${RESIDENTIAL_FLOOR_USD}`,
      permalink_template: 'https://data.cityofchicago.org/resource/ydr8-5enu.json?permit_={record_id}',
      field_map: {
        title: 'work_description', valuation: 'reported_cost', date: 'issue_date',
        contact_name: 'contact_1_name',
        address_parts: ['street_number', 'street_direction', 'street_name', 'suffix'],
        record_id: 'permit_', status: 'permit_status',
        applied_date: 'application_start_date', issued_date: 'issue_date',
        permit_type: 'permit_type', permit_sub_type: 'review_type',
        lat: 'latitude', lon: 'longitude', fees: 'total_fee',
      },
      parties: [
        { role_field: 'contact_1_type', name: 'contact_1_name' },
        { role_field: 'contact_2_type', name: 'contact_2_name' },
        { role_field: 'contact_3_type', name: 'contact_3_name' },
      ],
    },
  },
  {
    // FILTER PROVENANCE: `permitclassmapped` is the same VERIFIED column the commercial preset
    // filters on with 'Non-Residential'; 'Residential' is its documented counterpart value —
    // research-sourced, and the first live check is what confirms it (a miss reports as zero rows
    // read, in the run log, never as silence).
    id: 'seattle-permits-residential', label: 'Seattle residential permits', region: 'Seattle, WA',
    jurisdiction: 'seattle-wa-res', kind: 'socrata', segment: 'residential',
    base_url: 'https://data.seattle.gov/resource/76t5-zqzr.json',
    query_config: {
      event_type: 'permit_issued', date_field: 'issueddate',
      where: "permitclassmapped='Residential'",
      min_valuation_usd: RESIDENTIAL_FLOOR_USD,
      permalink_template: 'https://data.seattle.gov/resource/76t5-zqzr.json?permitnum={record_id}',
      field_map: {
        title: 'description', address: 'originaladdress1', valuation: 'estprojectcost',
        date: 'issueddate', contact_company: 'contractorcompanyname', permalink: 'link',
        record_id: 'permitnum', parent_record_id: 'relatedmup',
        status: 'statuscurrent',
        applied_date: 'applieddate', issued_date: 'issueddate',
        completed_date: 'completeddate', expires_date: 'expiresdate',
        property_class: 'permitclassmapped', work_class: 'permitclass',
        permit_type: 'permittypemapped', permit_sub_type: 'permittypedesc',
        units: 'housingunits',
        city: 'originalcity', state: 'originalstate', postal_code: 'originalzip',
        lat: 'latitude', lon: 'longitude',
      },
      parties: [{ role: 'contractor', company: 'contractorcompanyname' }],
    },
  },
];

export function starterById(id: string): StarterSource | null {
  return STARTER_SOURCES.find((s) => s.id === id) ?? null;
}

/** The presets for one market segment — what the Lead Markets door groups its city buttons by. */
export function startersForSegment(segment: MarketSegment): StarterSource[] {
  return STARTER_SOURCES.filter((s) => s.segment === segment);
}
