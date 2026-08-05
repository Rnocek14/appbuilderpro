// supabase/functions/lead-ingest/index.ts
// THE LEAD ENGINE'S FETCH ARM — pulls a market world's active sources (permit portals, liquor
// boards, registries) through the hardened SSRF-safe fetch, normalizes rows into verbatim
// le_events (deduped at insert), and scores them into le_leads with the VERIFIED pure core
// (src/lib/garvis/leadEngine/). READ + RECORD only: this function never sends, posts, or spends —
// digests go out through Approvals like everything else.
//
// HONESTY RULES (the standing-order discipline):
//   - A failed fetch is UNREACHABLE — counted in the line, never "no change". Five consecutive
//     failures pause the source loudly (mind_event) instead of failing silently forever.
//   - Events are verbatim: fields come from the record or they are null. Every row keeps its raw
//     source row and its source URL.
//   - No model calls in this path (structured APIs only) — zero credits spent.
//
// Auth: x-worker-secret / service bearer (the standing-worker's lead_engine branch) runs any
//       owner's sources when given { owner_id }; a signed-in user runs only their own.
// Deploy: in functions:deploy (JWT-verified; internal callers send the service bearer).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { safeFetch } from '../_shared/safeFetch.ts';
import { hashPayload } from '../_shared/payloadHash.ts';
import {
  scoreLead, pickLeadContact, whyNow, ingestLine, sourceStatusLine, parseLeadEngineConfig,
  digestFor, digestDue, isTradeKey,
  pitchFor, tradeForPlaceType, changedFields, tradeMatchesSegment, TRADES, SCORE_VERSION,
  type LeadEventLike, type TradeKey, type DigestLead,
} from '../../../src/lib/garvis/leadEngine/leadEngine.ts';
import {
  buildFetchUrl, parseRowsResult, sourceFormat, normalizeEvent, nextCursor, configHash,
  fetchOffset, FETCH_LIMIT, MAX_PAGES_PER_TICK,
  type SourceLike, type CandidateEvent,
} from '../../../src/lib/garvis/leadEngine/adapters.ts';

// CORS: the browser client ALWAYS sends apikey + x-client-info. Omitting them fails the
// preflight, and supabase-js reports it as 'Failed to send a request to the Edge Function' —
// a message that looks like a network or project problem and is neither. Same header set as
// every other browser-callable function in this repo.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret, x-cron-secret',
};
const MAX_SOURCES_PER_RUN = 10;   // a big market drains over ticks, never in one stampede
const PAUSE_AFTER_FAILURES = 5;   // the app_0113 reliability pattern: pause loudly, retry on resume
const MAX_BODY = 2_000_000;       // 2 MB of JSON per source per tick is plenty
const MAX_PLACES_PER_RUN = 8;     // contact append (Wave 1): bounded per tick, best-effort
const PITCHES_PER_WEEK = 5;       // auto-pitch pacing: at most five new contractors a week
const MAX_PITCH_CANDIDATES = 12;  // sites read per run — bounded like every other fetch loop
const APPEND_MIN_SCORE = 60;      // score-gated enrichment — junk spends nothing
// safeFetch has NO default timeout and Deno's fetch has none either, so a portal that accepts the
// connection and never answers used to hold the whole run until the platform killed it — with the
// source's status and its le_ingest_runs row never written, i.e. the run vanished. One tick can
// issue ~100 portal reads plus the enrichment reads; every one of them is bounded here.
const PORTAL_TIMEOUT_MS = 25_000;
const SITE_TIMEOUT_MS = 8_000;

/** WAVE-1 CONTACT APPEND (docs/lead-engine-data-plan.md §Layer 2): the highest-leverage
 *  enrichment is a phone number. For a bounded set of NEW high-score leads, ask Google Places
 *  for the business at the record's address (the same endpoint discover-run uses). Verbatim
 *  rule holds: we store what Places returned (phone, and the matched business name only when
 *  the record named nobody), and the lead's reasons say the contact came from a Places match.
 *  Best-effort throughout — a Places failure never affects the ingest result. */
async function appendContacts(
  // deno-lint-ignore no-explicit-any
  admin: any,
  leads: { id: string; score: number; contact_phone: string | null; contact_company: string | null; contact_name: string | null; title: string; address: string | null; region: string }[],
): Promise<number> {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return 0;
  const targets = leads
    .filter((l) => !l.contact_phone && l.score >= APPEND_MIN_SCORE && (l.address || l.contact_company))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PLACES_PER_RUN);
  let appended = 0;
  for (const l of targets) {
    try {
      const textQuery = `${(l.contact_company ?? l.title).slice(0, 80)} ${(l.address ?? l.region).slice(0, 80)}`.trim();
      if (textQuery.length < 6) continue;
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST', signal: AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress',
        },
        body: JSON.stringify({ textQuery, maxResultCount: 1, regionCode: 'US' }),
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => ({}))) as { places?: { displayName?: { text?: string }; nationalPhoneNumber?: string; websiteUri?: string }[] };
      const hit = json.places?.[0];
      const phone = (hit?.nationalPhoneNumber ?? '').trim();
      // Wave-1b: when the matched business has a website, read its contact page for an email —
      // through the hardened fetch, best-effort, verbatim (the first plausible address, no guessing).
      let email: string | null = null;
      if (hit?.websiteUri) {
        try {
          const site = await safeFetch(hit.websiteUri, { signal: AbortSignal.timeout(SITE_TIMEOUT_MS) });
          const html = (await site.text()).slice(0, 300_000);
          const m = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
          email = m.find((e) => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e) && !/example\.|sentry|wixpress|godaddy/i.test(e)) ?? null;
        } catch { /* a site that won't read costs nothing */ }
      }
      if (!phone && !email) continue;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (phone) patch.contact_phone = phone;
      if (email) patch.contact_email = email.toLowerCase();
      // Provenance, so an appended contact is never mistaken for one the public record named.
      // Only set here because this path only runs when the record named no phone at all.
      patch.contact_source = phone ? 'places' : 'website';
      if (!l.contact_company && !l.contact_name && hit?.displayName?.text) patch.contact_company = hit.displayName.text.slice(0, 120);
      await admin.from('le_leads').update(patch).eq('id', l.id);
      appended++;
    } catch { /* one lookup's failure never blocks the rest */ }
  }
  return appended;
}

interface SourceRow extends SourceLike {
  id: string; owner_id: string; world_id: string; name: string; active: boolean;
  consecutive_failures: number;
}

/** The normalized columns that constitute "the record as we hold it". A difference in any of
 *  them IS a portal-side change, and becomes a le_event_versions row. Deliberately excludes
 *  `raw` (a reordered key is not a change) and the bookkeeping columns. */
const VERSIONED_COLS = [
  'occurred_at', 'occurred_kind', 'address', 'valuation_usd', 'title', 'description', 'source_url',
  'source_record_id', 'parent_record_id', 'record_status', 'status_normalized', 'status_date',
  'applied_at', 'issued_at', 'approved_at', 'completed_at', 'expires_at',
  'lat', 'lon', 'parcel_id', 'city', 'state', 'postal_code', 'unit',
  'property_class', 'work_class', 'permit_type', 'permit_sub_type', 'use_type', 'proposed_use',
  'sqft_total', 'sqft_new', 'sqft_remodel', 'stories', 'units', 'year_built', 'fees_usd',
  'qualified', 'disqualified_reason',
] as const;

const EXISTING_COLS = `id, dedupe_key, content_hash, seen_count, ${VERSIONED_COLS.join(', ')}`;

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Keep the LAST row per dedupe key. A single response can legitimately carry the same record
 *  twice; Postgres refuses to let one ON CONFLICT statement touch a row twice, so the batch is
 *  collapsed before it is sent rather than failing the whole source. */
function byLastKey(candidates: CandidateEvent[]): CandidateEvent[] {
  const m = new Map<string, CandidateEvent>();
  for (const c of candidates) m.set(c.dedupe_key, c);
  return [...m.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const workerSecret = Deno.env.get('WORKER_SECRET');

  // Gate: the worker/service runs anyone's (given owner_id); a signed-in user runs only their own.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const isWorker = (!!workerSecret && req.headers.get('x-worker-secret') === workerSecret) || bearer === serviceKey;
  const body = (await req.json().catch(() => ({}))) as {
    owner_id?: string; world_id?: string; source_id?: string; trades?: unknown; commissionPct?: unknown;
    /** The market's segment, forwarded from the standing order's config by standing-worker.
     *  Absent (a direct call, or an order written before segments existed) → 'commercial'. */
    segment?: unknown;
  };
  let owner: string;
  if (isWorker) {
    if (!body.owner_id) return json({ error: 'owner_id required on the worker path' }, 400);
    owner = body.owner_id;
  } else {
    if (!bearer) return json({ error: 'Unauthorized' }, 401);
    const { data: u } = await admin.auth.getUser(bearer);
    if (!u.user) return json({ error: 'Unauthorized' }, 401);
    owner = u.user.id;
  }

  const nowIso = new Date().toISOString();

  // The sources to check — always re-verified against the owner (defense in depth over RLS).
  let q = admin.from('le_sources')
    .select('id, owner_id, world_id, name, kind, base_url, region, jurisdiction, active, query_config, cursor, consecutive_failures')
    .eq('owner_id', owner).eq('active', true)
    // LEAST-RECENTLY-CHECKED FIRST. The cap is meant to let "a big market drain over ticks", but
    // with no ORDER BY Postgres returns the same first rows every time, so a market with more than
    // MAX_SOURCES_PER_RUN sources never checked the tail of its list — silently, forever.
    .order('last_fetch_at', { ascending: true, nullsFirst: true })
    .limit(MAX_SOURCES_PER_RUN);
  if (body.source_id) q = q.eq('id', body.source_id);
  if (body.world_id) q = q.eq('world_id', body.world_id);
  const { data: sources, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // ── THE MARKET'S SEGMENT ───────────────────────────────────────────────────
  // Which buyer this market serves decides which trades an event may be scored for. It arrives
  // three ways, in descending authority: the standing-worker forwards it from the order's config;
  // a direct call ("Check sources now") has none, so the order is read here; and a market whose
  // clock was removed still says so on its own sources. Absent everywhere → 'commercial', which is
  // what every market created before segments existed is.
  let segmentRaw: unknown = body.segment;
  if (segmentRaw === undefined && body.world_id) {
    const { data: ords } = await admin.from('standing_orders').select('config')
      .eq('owner_id', owner).eq('world_id', body.world_id).eq('kind', 'lead_engine').limit(1);
    segmentRaw = ((ords ?? [])[0] as { config?: Record<string, unknown> } | undefined)?.config?.segment;
  }
  if (segmentRaw === undefined) {
    segmentRaw = ((sources ?? []) as SourceRow[])
      .map((s) => (s.query_config ?? {}).segment)
      .find((v) => v !== undefined);
  }
  const cfg = parseLeadEngineConfig({ trades: body.trades, commissionPct: body.commissionPct, segment: segmentRaw });

  let checked = 0, unreachable = 0, eventsNew = 0, eventsChanged = 0, leadsNew = 0, persistFailures = 0;
  const newLeadRecords: { id: string; score: number; contact_phone: string | null; contact_company: string | null; contact_name: string | null; title: string; address: string | null; region: string }[] = [];

  for (const src of (sources ?? []) as SourceRow[]) {
    checked++;
    // THE COVERAGE LOG (capture spec §3.8): one le_ingest_runs row per source per run. What each
    // run actually saw — read, disqualified, new, changed, and the cursor either side — cannot be
    // reconstructed after the fact from a single overwritten last_status field.
    const cfgHash = configHash(src);
    // Where this tick starts reading: the top of the window, or the row the LAST tick stopped on
    // when it ran out of pages mid-window (capture spec §6.6.2).
    const startOffset = fetchOffset(src);
    const run = {
      owner_id: src.owner_id, source_id: src.id, started_at: nowIso,
      request_url: null as string | null, http_status: null as number | null,
      body_bytes: 0, body_truncated: false,
      rows_parsed: 0, rows_disqualified: 0, rows_new: 0, rows_changed: 0,
      // The paging truth (app_0133): how many pages this tick actually read, and whether it
      // stopped because the window drained or because it hit the cap with more still behind it.
      pages_fetched: 0, capped: false,
      cursor_before: (src.cursor ?? {}) as Record<string, unknown>,
      cursor_after: (src.cursor ?? {}) as Record<string, unknown>,
      config_hash: cfgHash, error: null as string | null,
      finished_at: null as string | null,
    };

    // ── the capture pipeline, PER PAGE ──────────────────────────────────────
    // Everything app_0131 does runs on every page exactly as it did when a tick was a single
    // page: read what we already hold, upsert-on-change, version the transitions, replace the
    // parties, score the new qualified rows. Paging changes how much we read, never how we
    // treat what we read.
    const processPage = async (candidates: CandidateEvent[]) => {
      // ── What do we already hold? ──────────────────────────────────────────
      // Read the rows these candidates would collide with, so a portal-side EDIT is visible.
      // ignoreDuplicates used to mean a corrected status, valuation or contractor was frozen at
      // our first-seen version forever (capture spec §3.8).
      const existing = new Map<string, Record<string, unknown> & { id: string; content_hash: string | null; seen_count: number }>();
      for (const keys of chunk(candidates.map((c) => c.dedupe_key), 100)) {
        const { data: rows } = await admin.from('le_events').select(EXISTING_COLS)
          .eq('owner_id', src.owner_id).in('dedupe_key', keys);
        for (const r of (rows ?? []) as unknown as (Record<string, unknown> & { id: string; dedupe_key: string; content_hash: string | null; seen_count: number })[]) {
          existing.set(r.dedupe_key, r);
        }
      }

      const fresh = candidates.filter((c) => !existing.has(c.dedupe_key));
      const changed = candidates.filter((c) => {
        const prev = existing.get(c.dedupe_key);
        return !!prev && prev.content_hash !== c.content_hash;
      });
      run.rows_new += fresh.length;
      run.rows_changed += changed.length;
      eventsNew += fresh.length;
      eventsChanged += changed.length;

      const idByKey = new Map<string, string>();
      for (const [k, v] of existing) idByKey.set(k, v.id);

      if (candidates.length) {
        // ON CONFLICT DO UPDATE (not DO NOTHING): every observation bumps seen_count and
        // last_seen_at, and a changed row is actually updated. Columns absent from the payload —
        // found_at above all — are left untouched, so first-seen stays first-seen.
        const rows = candidates.map((c) => ({
          owner_id: src.owner_id, world_id: src.world_id, source_id: src.id,
          event_type: c.event_type, occurred_at: c.occurred_at, occurred_kind: c.occurred_kind,
          address: c.address, region: c.region, jurisdiction: c.jurisdiction,
          valuation_usd: c.valuation_usd, title: c.title.slice(0, 300), description: c.description,
          named_parties: c.named_parties, raw: c.raw, source_url: c.source_url, dedupe_key: c.dedupe_key,
          source_record_id: c.source_record_id, parent_record_id: c.parent_record_id,
          content_hash: c.content_hash, source_config_hash: cfgHash,
          record_status: c.record_status, status_normalized: c.status_normalized, status_date: c.status_date,
          applied_at: c.applied_at, issued_at: c.issued_at, approved_at: c.approved_at,
          completed_at: c.completed_at, expires_at: c.expires_at,
          lat: c.lat, lon: c.lon, parcel_id: c.parcel_id, city: c.city, state: c.state,
          postal_code: c.postal_code, unit: c.unit,
          property_class: c.property_class, work_class: c.work_class,
          permit_type: c.permit_type, permit_sub_type: c.permit_sub_type,
          use_type: c.use_type, proposed_use: c.proposed_use,
          sqft_total: c.sqft_total, sqft_new: c.sqft_new, sqft_remodel: c.sqft_remodel,
          stories: c.stories, units: c.units, year_built: c.year_built, fees_usd: c.fees_usd,
          // STORED, NOT DROPPED: a sub-floor row persists with its reason. A portal's rolling
          // window makes a discarded row unrecoverable, and you cannot prove absence from a
          // value-filtered subset (spec §3.9). Leads are minted for qualified rows only.
          qualified: c.qualified, disqualified_reason: c.disqualified_reason,
          last_seen_at: nowIso,
          seen_count: (existing.get(c.dedupe_key)?.seen_count ?? 0) + 1,
        }));
        const { data: upserted, error: upErr } = await admin.from('le_events')
          .upsert(rows, { onConflict: 'owner_id,dedupe_key' }).select('id, dedupe_key');
        if (upErr) {
          run.error = `persist failed — ${upErr.message.slice(0, 300)}`;
          eventsNew -= fresh.length; eventsChanged -= changed.length;
          run.rows_new -= fresh.length; run.rows_changed -= changed.length;
        }
        for (const r of (upserted ?? []) as { id: string; dedupe_key: string }[]) idByKey.set(r.dedupe_key, r.id);

        // The append-only observation history. Every transition the portal makes between our
        // observations is destroyed upstream — this is the only place it survives.
        if (!upErr && changed.length) {
          const versions = changed.map((c) => {
            const prev = existing.get(c.dedupe_key)!;
            const after: Record<string, unknown> = {};
            for (const k of VERSIONED_COLS) after[k] = (c as unknown as Record<string, unknown>)[k];
            return {
              owner_id: src.owner_id, event_id: idByKey.get(c.dedupe_key),
              observed_at: nowIso, record_status: c.record_status,
              status_normalized: c.status_normalized, valuation_usd: c.valuation_usd,
              content_hash: c.content_hash,
              changed_fields: changedFields(prev as Record<string, unknown>, after),
              raw: c.raw,
            };
          }).filter((v) => !!v.event_id);
          if (versions.length) await admin.from('le_event_versions').insert(versions).then(() => {}, () => {});
        }

        // Parties, with provenance. Replaced wholesale on a changed record — portals correct
        // contact data, and a stale contact is worse than none.
        if (!upErr) {
          const touched = [...fresh, ...changed];
          const changedIds = changed.map((c) => idByKey.get(c.dedupe_key)).filter((x): x is string => !!x);
          for (const ids of chunk(changedIds, 100)) {
            await admin.from('le_event_parties').delete().in('event_id', ids).then(() => {}, () => {});
          }
          const partyRows = touched.flatMap((c) => {
            const eventId = idByKey.get(c.dedupe_key);
            if (!eventId) return [];
            return c.parties.map((p) => ({
              owner_id: src.owner_id, event_id: eventId, ordinal: p.ordinal,
              role: p.role, role_normalized: p.role_normalized,
              name: p.name, company: p.company, phone: p.phone, email: p.email,
              license_no: p.license_no, source_field: p.source_field,
            }));
          });
          for (const batch of chunk(partyRows, 200)) {
            await admin.from('le_event_parties').insert(batch).then(() => {}, () => {});
          }
        }
      }

      // Score each NEW, QUALIFIED event for each configured trade with the verified core. A null
      // score is a zero-relevance pairing — it never becomes a row. A disqualified event is stored
      // but never sold.
      const scorable = fresh.filter((c) => c.qualified && idByKey.has(c.dedupe_key));
      if (scorable.length) {
        const leadRows: Record<string, unknown>[] = [];
        for (const c of scorable) {
          const eventId = idByKey.get(c.dedupe_key)!;
          const eventLike: LeadEventLike = {
            event_type: c.event_type, occurred_at: c.occurred_at, address: c.address, region: c.region,
            valuation_usd: c.valuation_usd, title: c.title, description: c.description,
            named_parties: c.named_parties, source_url: c.source_url,
            // The record's own classification words — what the residential follow-on rule and the
            // fit signal read to tell which trade the record actually implicates. permit_sub_type
            // carries the READABLE label on several portals ("Mechanical Permit" against a
            // permit_type of "MP"), which is exactly the wording that names a trade.
            work_class: c.work_class, permit_type: c.permit_type, permit_sub_type: c.permit_sub_type,
          };
          const contact = pickLeadContact(c.named_parties);
          for (const trade of cfg.trades as TradeKey[]) {
            // The segment gate lives in scoreLead: a trade that does not sell into this market
            // returns null and never becomes a row.
            const s = scoreLead(eventLike, trade, nowIso, { segment: cfg.segment });
            if (!s) continue;
            leadRows.push({
              owner_id: src.owner_id, world_id: src.world_id, event_id: eventId, trade,
              score: s.score, score_reasons: s.reasons,
              contact_name: contact?.name ?? null, contact_company: contact?.company ?? null,
              contact_phone: contact?.phone ?? null, contact_email: contact?.email ?? null,
              // Provenance: a phone the PERMIT published and a phone Google Places guessed at are
              // not the same asset, and used to be the same column with no way to tell them apart.
              contact_source: contact ? 'record' : null,
              contact_role: contact?.role_normalized ?? null,
              stage: c.status_normalized, score_version: SCORE_VERSION,
              why_now: whyNow(eventLike).slice(0, 400), status: 'new',
            });
          }
        }
        if (leadRows.length) {
          const eventMeta = new Map(scorable.map((c) => [idByKey.get(c.dedupe_key)!, {
            title: c.title, address: c.address, region: c.region,
          }] as const));
          const { data: ins } = await admin.from('le_leads')
            .upsert(leadRows, { onConflict: 'owner_id,event_id,trade', ignoreDuplicates: true })
            .select('id, event_id, score, contact_phone, contact_company, contact_name');
          const inserted = (ins ?? []) as { id: string; event_id: string; score: number; contact_phone: string | null; contact_company: string | null; contact_name: string | null }[];
          leadsNew += inserted.length;
          for (const row of inserted) {
            const meta = eventMeta.get(row.event_id);
            if (meta) newLeadRecords.push({ ...row, ...meta });
          }
        }
      }
    };

    // ── THE PAGING LOOP (capture spec §6.6.2) ───────────────────────────────
    // One page used to BE the tick: $limit with no $offset, then the cursor jumped to the max
    // date read. A day with more than FETCH_LIMIT qualifying rows — routine for NYC and Chicago —
    // therefore had its remainder stepped over and never fetched again. Now we walk the window
    // page by page, bounded by MAX_PAGES_PER_TICK, and what we do not reach this tick is recorded
    // as a resume point rather than abandoned.
    let fetchOk = false;
    let pages = 0;
    let rowsThisTick = 0;
    let drained = false;
    // Only the dates matter to the advance decision, so the tick holds these instead of every
    // page's rows.
    const dateSamples: { occurred_at: string | null }[] = [];
    try {
      let offset = startOffset;
      while (pages < MAX_PAGES_PER_TICK) {
        const url = buildFetchUrl(src, offset);
        run.request_url = url.slice(0, 2000);   // the page in hand: on failure, the one that failed
        const res = await safeFetch(url, { signal: AbortSignal.timeout(PORTAL_TIMEOUT_MS) });
        run.http_status = res.status;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = await res.text();
        run.body_bytes += full.length;
        if (full.length > MAX_BODY) run.body_truncated = true;   // the 2MB slice, made visible
        const parsed = parseRowsResult(src.kind, full.slice(0, MAX_BODY), sourceFormat(src));
        // An UNREADABLE source is unreachable, never "no change" — a truncated body, a changed
        // response shape or a WAF page used to report as a healthy "0 rows read" (spec §6.6).
        if (!parsed.ok) throw new Error(parsed.error ?? 'Response could not be read');
        fetchOk = true;
        pages++;
        run.pages_fetched = pages;
        run.rows_parsed += parsed.rows.length;
        rowsThisTick += parsed.rows.length;
        const candidates = byLastKey(parsed.rows.map((r) => normalizeEvent(src, r)).filter((e): e is CandidateEvent => e !== null));
        run.rows_disqualified += candidates.filter((c) => !c.qualified).length;
        for (const c of candidates) dateSamples.push({ occurred_at: c.occurred_at });
        await processPage(candidates);
        // A SHORT page means the window is exhausted — that is the only honest "drained" signal.
        // CSV and RSS sources have nothing to page: one read is the whole feed.
        if (parsed.rows.length < FETCH_LIMIT || sourceFormat(src) !== 'json') { drained = true; break; }
        offset += FETCH_LIMIT;
      }
      // Stopped at the cap with a full page still in hand: there is provably more behind it.
      run.capped = !drained;
    } catch (e) {
      unreachable++;
      run.error = e instanceof Error ? e.message.slice(0, 400) : 'fetch failed';
      const failures = (src.consecutive_failures ?? 0) + 1;
      const paused = failures >= PAUSE_AFTER_FAILURES;
      await admin.from('le_sources').update({
        consecutive_failures: failures, ...(paused ? { active: false } : {}),
        last_fetch_at: nowIso, updated_at: nowIso, config_hash: cfgHash,
        last_status: `Unreachable — ${run.error.slice(0, 120)}. ${paused ? `Paused after ${failures} straight failures.` : 'Will retry on schedule.'}`,
      }).eq('id', src.id);
      if (paused) {
        await admin.from('mind_events').insert({
          owner_id: src.owner_id, event_type: 'note', source: 'lead-engine',
          subject: `Lead source paused: ${src.name} failed ${failures} runs in a row (${src.region})`,
          payload: { key: `le-source-paused:${src.id}`, source_id: src.id, world_id: src.world_id },
        }).then(() => {}, () => {});
      }
      await admin.from('le_ingest_runs').insert({ ...run, finished_at: new Date().toISOString() })
        .then(() => {}, () => {});
      continue;
    }

    if (fetchOk) {
      // A PERSIST FAILURE IS NOT A SUCCESSFUL CHECK. The fetch worked, so the rows were read — but
      // if the upsert failed they were never stored, and advancing the watermark past them deleted
      // them for good (a portal serves a rolling window; nothing re-offers a skipped day). That is
      // the exact silent-permanent-loss class app_0133 was written to end, arriving through the
      // other door. On a persist failure the cursor stays EXACTLY where it was, so the same window
      // is read again next run, and the source says so in the one field the panel shows.
      const persistFailed = !!run.error;
      if (persistFailed) persistFailures++;
      const cursorAfter = persistFailed
        ? ((src.cursor ?? {}) as Record<string, unknown>)
        // THE ADVANCE DECISION lives in the pure core (adapters.nextCursor), verified there:
        // drained → the watermark moves to the max date read and the offset is cleared; capped →
        // the watermark stays exactly where it was and the offset records how far in we got.
        : (nextCursor(src, dateSamples, { rows: rowsThisTick, startOffset, drained }) as Record<string, unknown>);
      run.cursor_after = cursorAfter;
      await admin.from('le_sources').update({
        consecutive_failures: 0, last_fetch_at: nowIso, updated_at: nowIso,
        cursor: cursorAfter, config_hash: cfgHash,
        // Composed by the verified pure core — including the "read but could not store" headline.
        last_status: sourceStatusLine({
          rowsParsed: run.rows_parsed, rowsNew: run.rows_new, rowsChanged: run.rows_changed,
          rowsDisqualified: run.rows_disqualified, pages, capped: run.capped,
          resumeOffset: (cursorAfter as { page_offset?: number }).page_offset ?? null,
          persistError: run.error,
        }),
      }).eq('id', src.id);
    }
    await admin.from('le_ingest_runs').insert({ ...run, finished_at: new Date().toISOString() })
      .then(() => {}, () => {});
  }

  // Wave-1 contact append — best-effort, bounded, score-gated; never affects the ingest result.
  const appended = await appendContacts(admin, newLeadRecords).catch(() => 0);

  // WEEKLY AUTO-DIGEST (worker path only — the clock composes, the owner approves): each active
  // customer due their digest gets one PENDING approval, trade-filtered, composed by the pure
  // core from real rows. The invoice-chase pattern exactly — nothing sends itself, and a quiet
  // week drafts nothing. last_digest_at advances at QUEUE time so a rejected draft waits a week.
  let digestsDrafted = 0;
  if (isWorker && body.world_id) {
    try {
      const { data: due } = await admin.from('le_customers')
        .select('id, world_id, contact_id, name, email, trade, last_digest_at')
        .eq('owner_id', owner).eq('world_id', body.world_id).eq('status', 'active').limit(50);
      const dueCustomers = ((due ?? []) as { id: string; contact_id: string | null; name: string; email: string; trade: string; last_digest_at: string | null }[])
        .filter((c) => digestDue(c.last_digest_at, nowIso));
      if (dueCustomers.length) {
        const { data: freshRows } = await admin.from('le_leads')
          .select('id, trade, score, why_now, contact_name, contact_company, le_events(title, source_url)')
          .eq('world_id', body.world_id).eq('status', 'new').order('score', { ascending: false }).limit(100);
        const fresh = (freshRows ?? []) as unknown as { id: string; trade: string; score: number; why_now: string; contact_name: string | null; contact_company: string | null; le_events: { title: string; source_url: string } | null }[];
        const { data: world } = await admin.from('knowledge_worlds').select('title').eq('id', body.world_id).maybeSingle();
        const worldTitle = ((world as { title?: string } | null)?.title ?? 'Lead market').trim();
        const deliveredIds = new Set<string>();
        for (const cust of dueCustomers) {
          const scoped = fresh.filter((l) => (cust.trade === 'all' || l.trade === cust.trade) && isTradeKey(l.trade));
          const digestLeads: DigestLead[] = scoped.map((l) => ({
            trade: l.trade as TradeKey, score: l.score, why_now: l.why_now,
            contact_name: l.contact_name, contact_company: l.contact_company,
            source_url: l.le_events?.source_url ?? '', title: l.le_events?.title ?? l.why_now,
          }));
          const dig = digestFor(worldTitle, digestLeads);
          if (dig.included === 0) continue; // a quiet week is not a digest
          const { data: camp } = await admin.from('outreach_campaigns').insert({
            owner_id: owner, contact_id: cust.contact_id, kind: 'lead_digest', state: 'pending_approval',
          }).select('id').single();
          if (!camp) continue;
          const { data: msg } = await admin.from('outreach_messages').insert({
            owner_id: owner, campaign_id: (camp as { id: string }).id, contact_id: cust.contact_id,
            sequence_step: 0, subject: dig.subject, body_text: dig.body, to_address: cust.email, status: 'draft',
          }).select('id').single();
          if (!msg) continue;
          const leadIds = scoped.slice(0, dig.included).map((l) => l.id);
          const apPayload = { message_id: (msg as { id: string }).id, world_id: body.world_id, le_customer_id: cust.id, lead_ids: leadIds };
          await admin.from('approvals').insert({
            owner_id: owner, kind: 'send_email', status: 'pending', requested_by: 'worker',
            title: `Weekly digest → ${cust.email} (${dig.included} lead${dig.included === 1 ? '' : 's'})`,
            preview: `${dig.subject}\n\n${dig.body.slice(0, 400)}`,
            payload: apPayload, payload_hash: await hashPayload(apPayload),
          });
          await admin.from('le_customers').update({ last_digest_at: nowIso, updated_at: nowIso }).eq('id', cust.id);
          leadIds.forEach((id) => deliveredIds.add(id));
          digestsDrafted++;
        }
        if (deliveredIds.size) {
          await admin.from('le_leads')
            .update({ status: 'delivered', delivered_at: nowIso, updated_at: nowIso })
            .in('id', [...deliveredIds]);
        }
      }
    } catch { /* digest drafting must never wedge the ingest */ }
  }

  // WEEKLY AUTO-PITCH (worker path only): the market sells itself. Contractors the client hunt
  // already discovered in this market's region, whose Places category maps to a trade we score,
  // get a sample pitch built from REAL leads — plus their demo site when one exists (the bundle:
  // leads open the door, the website raises the ticket). Every pitch is a PENDING approval; a
  // business is pitched at most once, ever; at most PITCHES_PER_WEEK land per week.
  let pitchesDrafted = 0;
  if (isWorker && body.world_id) {
    try {
      // Pace: count this owner's lead-pitch campaigns in the last 7 days.
      const weekAgo = new Date(Date.parse(nowIso) - 7 * 86_400_000).toISOString();
      const { count: recent } = await admin.from('outreach_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', owner).eq('kind', 'lead_pitch').gte('created_at', weekAgo);
      const budget = Math.max(0, PITCHES_PER_WEEK - (recent ?? 0));

      if (budget > 0) {
        const { data: srcRows } = await admin.from('le_sources')
          .select('region').eq('world_id', body.world_id).eq('active', true).limit(5);
        const regions = [...new Set(((srcRows ?? []) as { region: string }[]).map((r) => r.region).filter(Boolean))];
        const cities = regions.map((r) => r.split(',')[0].trim()).filter((c) => c.length > 1);

        if (cities.length) {
          // Candidate contractors: discovered in one of this market's cities, category maps to a
          // trade, and reachable (a website we can read an address off, or one already stored).
          const { data: bizRows } = await admin.from('discovered_businesses')
            .select('id, company_name, website, category, city, state, preview_site_id')
            .eq('owner_id', owner).in('city', cities).not('category', 'is', null)
            .not('website', 'is', null).order('created_at', { ascending: false }).limit(60);
          const candidates = ((bizRows ?? []) as { id: string; company_name: string; website: string | null; category: string | null; city: string | null; state: string | null; preview_site_id: string | null }[])
            .map((b) => ({ ...b, trade: tradeForPlaceType(b.category) }))
            // A contractor is only pitched a market that sells their trade: a commercial market
            // has no residential leads to prove itself with, and vice versa.
            .filter((b) => !!b.trade && tradeMatchesSegment(b.trade, cfg.segment))
            .slice(0, MAX_PITCH_CANDIDATES);

          if (candidates.length) {
            // The leads we can pitch, per trade (freshest, highest-scoring first).
            const { data: leadRows } = await admin.from('le_leads')
              .select('trade, score, why_now, contact_name, contact_company, le_events(title, source_url)')
              .eq('world_id', body.world_id).in('status', ['new', 'delivered'])
              .order('score', { ascending: false }).limit(120);
            const byTrade = new Map<string, DigestLead[]>();
            for (const l of ((leadRows ?? []) as unknown as { trade: string; score: number; why_now: string; contact_name: string | null; contact_company: string | null; le_events: { title: string; source_url: string } | null }[])) {
              if (!isTradeKey(l.trade)) continue;
              const arr = byTrade.get(l.trade) ?? [];
              arr.push({
                trade: l.trade as TradeKey, score: l.score, why_now: l.why_now,
                contact_name: l.contact_name, contact_company: l.contact_company,
                source_url: l.le_events?.source_url ?? '', title: l.le_events?.title ?? l.why_now,
              });
              byTrade.set(l.trade, arr);
            }

            const { data: os } = await admin.from('outreach_settings')
              .select('from_name, company_name').eq('owner_id', owner).maybeSingle();
            const fromName = ((os as { from_name?: string | null } | null)?.from_name ?? '').trim()
              || ((os as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'Me';
            const appOrigin = (Deno.env.get('APP_ORIGIN') ?? '').replace(/\/+$/, '');

            for (const biz of candidates) {
              if (pitchesDrafted >= budget) break;
              const trade = biz.trade as TradeKey;
              const tradeLeads = byTrade.get(trade) ?? [];
              if (tradeLeads.length === 0) continue;   // no real leads for their trade → no pitch

              // An email address, read from their own site (verbatim; bounded; never guessed).
              let email: string | null = null;
              try {
                const site = await safeFetch(biz.website!, { signal: AbortSignal.timeout(SITE_TIMEOUT_MS) });
                const html = (await site.text()).slice(0, 300_000);
                const found = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
                email = found.find((e) => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e)
                  && !/example\.|sentry|wixpress|godaddy|schema\.org/i.test(e)) ?? null;
              } catch { /* an unreadable site simply isn't pitched */ }
              if (!email) continue;
              const to = email.toLowerCase();

              // Never pitch the same inbox twice — ever.
              const { data: prior } = await admin.from('contacts')
                .select('id').eq('owner_id', owner).eq('email', to).maybeSingle();
              let contactId = (prior as { id: string } | null)?.id ?? null;
              if (contactId) {
                const { count: already } = await admin.from('outreach_campaigns')
                  .select('id', { count: 'exact', head: true })
                  .eq('owner_id', owner).eq('kind', 'lead_pitch').eq('contact_id', contactId);
                if ((already ?? 0) > 0) continue;
              } else {
                const { data: c } = await admin.from('contacts').insert({
                  owner_id: owner, email: to, full_name: biz.company_name?.slice(0, 120) ?? null,
                  email_status: 'unknown', is_primary: false,
                }).select('id').maybeSingle();
                contactId = (c as { id: string } | null)?.id ?? null;
              }
              if (!contactId) continue;

              // The bundle: their already-built demo site, when one exists.
              let siteUrl: string | null = null;
              if (biz.preview_site_id && appOrigin) {
                const { data: ps } = await admin.from('preview_sites')
                  .select('slug').eq('id', biz.preview_site_id).maybeSingle();
                const slug = (ps as { slug?: string } | null)?.slug;
                if (slug) siteUrl = `${appOrigin}/preview-site/${slug}`;
              }

              const region = regions.find((r) => r.startsWith(biz.city ?? '')) ?? regions[0];
              const pitch = pitchFor(trade, region, tradeLeads, fromName, { siteUrl });
              if (!pitch) continue;

              const { data: camp } = await admin.from('outreach_campaigns').insert({
                owner_id: owner, contact_id: contactId, kind: 'lead_pitch', state: 'pending_approval',
              }).select('id').single();
              if (!camp) continue;
              const { data: msg } = await admin.from('outreach_messages').insert({
                owner_id: owner, campaign_id: (camp as { id: string }).id, contact_id: contactId,
                sequence_step: 0, subject: pitch.subject, body_text: pitch.body, to_address: to, status: 'draft',
              }).select('id').single();
              if (!msg) continue;
              const pPayload = {
                message_id: (msg as { id: string }).id, world_id: body.world_id,
                lead_pitch: true, discovered_business_id: biz.id,
              };
              await admin.from('approvals').insert({
                owner_id: owner, kind: 'send_email', status: 'pending', requested_by: 'worker',
                title: `Sample pitch (${TRADES[trade].label}) → ${biz.company_name || to}`,
                preview: `${pitch.subject}\n\n${pitch.body.slice(0, 400)}`,
                payload: pPayload, payload_hash: await hashPayload(pPayload),
              });
              pitchesDrafted++;
            }
          }
        }
      }
    } catch { /* auto-pitching must never wedge the ingest */ }
  }

  let line = ingestLine(checked, unreachable, eventsNew, leadsNew);
  // A source that read rows and could not store them must not disappear behind "nothing new".
  if (persistFailures > 0) line += ` ${persistFailures} source${persistFailures === 1 ? '' : 's'} read rows but could NOT store them — see the source's status; the same window is re-read next run.`;
  if (eventsChanged > 0) line += ` ${eventsChanged} record${eventsChanged === 1 ? '' : 's'} changed upstream and ${eventsChanged === 1 ? 'was' : 'were'} updated.`;
  if (pitchesDrafted > 0) line += ` ${pitchesDrafted} sample pitch${pitchesDrafted === 1 ? '' : 'es'} drafted for approval.`;
  if (appended > 0) line += ` ${appended} contact${appended === 1 ? '' : 's'} appended.`;
  if (digestsDrafted > 0) line += ` ${digestsDrafted} weekly digest${digestsDrafted === 1 ? '' : 's'} drafted for approval.`;
  return json({ ok: true, line, sources_checked: checked, sources_unreachable: unreachable, events_new: eventsNew, events_changed: eventsChanged, leads_new: leadsNew, contacts_appended: appended, digests_drafted: digestsDrafted });
});
