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
import {
  scoreLead, pickContact, whyNow, ingestLine, parseLeadEngineConfig,
  type LeadEventLike, type TradeKey,
} from '../../../src/lib/garvis/leadEngine/leadEngine.ts';
import {
  buildFetchUrl, parseRows, normalizeEvent, nextCursor,
  type SourceLike, type CandidateEvent,
} from '../../../src/lib/garvis/leadEngine/adapters.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-worker-secret, x-cron-secret' };
const MAX_SOURCES_PER_RUN = 10;   // a big market drains over ticks, never in one stampede
const PAUSE_AFTER_FAILURES = 5;   // the app_0113 reliability pattern: pause loudly, retry on resume
const MAX_BODY = 2_000_000;       // 2 MB of JSON per source per tick is plenty
const MAX_PLACES_PER_RUN = 8;     // contact append (Wave 1): bounded per tick, best-effort
const APPEND_MIN_SCORE = 60;      // score-gated enrichment — junk spends nothing

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
          'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.formattedAddress',
        },
        body: JSON.stringify({ textQuery, maxResultCount: 1, regionCode: 'US' }),
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => ({}))) as { places?: { displayName?: { text?: string }; nationalPhoneNumber?: string }[] };
      const hit = json.places?.[0];
      const phone = (hit?.nationalPhoneNumber ?? '').trim();
      if (!phone) continue;
      const patch: Record<string, unknown> = { contact_phone: phone, updated_at: new Date().toISOString() };
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

  const cfg = parseLeadEngineConfig({ trades: body.trades, commissionPct: body.commissionPct });
  const nowIso = new Date().toISOString();

  // The sources to check — always re-verified against the owner (defense in depth over RLS).
  let q = admin.from('le_sources')
    .select('id, owner_id, world_id, name, kind, base_url, region, active, query_config, cursor, consecutive_failures')
    .eq('owner_id', owner).eq('active', true).limit(MAX_SOURCES_PER_RUN);
  if (body.source_id) q = q.eq('id', body.source_id);
  if (body.world_id) q = q.eq('world_id', body.world_id);
  const { data: sources, error } = await q;
  if (error) return json({ error: error.message }, 500);

  let checked = 0, unreachable = 0, eventsNew = 0, leadsNew = 0;
  const newLeadRecords: { id: string; score: number; contact_phone: string | null; contact_company: string | null; contact_name: string | null; title: string; address: string | null; region: string }[] = [];

  for (const src of (sources ?? []) as SourceRow[]) {
    checked++;
    let candidates: CandidateEvent[] = [];
    let fetchOk = false;
    try {
      const res = await safeFetch(buildFetchUrl(src));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).slice(0, MAX_BODY);
      const rows = parseRows(src.kind, text);
      fetchOk = true;
      candidates = rows.map((r) => normalizeEvent(src, r)).filter((e): e is CandidateEvent => e !== null);
    } catch (e) {
      unreachable++;
      const failures = (src.consecutive_failures ?? 0) + 1;
      const paused = failures >= PAUSE_AFTER_FAILURES;
      await admin.from('le_sources').update({
        consecutive_failures: failures, ...(paused ? { active: false } : {}),
        last_fetch_at: nowIso, updated_at: nowIso,
        last_status: `Unreachable — ${e instanceof Error ? e.message.slice(0, 120) : 'fetch failed'}. ${paused ? `Paused after ${failures} straight failures.` : 'Will retry on schedule.'}`,
      }).eq('id', src.id);
      if (paused) {
        await admin.from('mind_events').insert({
          owner_id: src.owner_id, event_type: 'note', source: 'lead-engine',
          subject: `Lead source paused: ${src.name} failed ${failures} runs in a row (${src.region})`,
          payload: { key: `le-source-paused:${src.id}`, source_id: src.id, world_id: src.world_id },
        }).then(() => {}, () => {});
      }
      continue;
    }

    // Dedupe-at-insert: unique(owner_id, dedupe_key) + ignoreDuplicates — only genuinely new
    // rows come back, so eventsNew is what actually entered the table.
    let newEvents: { id: string; dedupe_key: string }[] = [];
    if (candidates.length) {
      const { data: inserted } = await admin.from('le_events').upsert(
        candidates.map((c) => ({
          owner_id: src.owner_id, world_id: src.world_id, source_id: src.id,
          event_type: c.event_type, occurred_at: c.occurred_at, address: c.address, region: c.region,
          valuation_usd: c.valuation_usd, title: c.title.slice(0, 300), description: c.description,
          named_parties: c.named_parties, raw: c.raw, source_url: c.source_url, dedupe_key: c.dedupe_key,
        })),
        { onConflict: 'owner_id,dedupe_key', ignoreDuplicates: true },
      ).select('id, dedupe_key');
      newEvents = (inserted ?? []) as { id: string; dedupe_key: string }[];
      eventsNew += newEvents.length;
    }

    // Score each NEW event for each configured trade with the verified core. A null score is a
    // zero-relevance pairing — it never becomes a row.
    if (newEvents.length) {
      const byKey = new Map(candidates.map((c) => [c.dedupe_key, c]));
      const leadRows: Record<string, unknown>[] = [];
      for (const ev of newEvents) {
        const c = byKey.get(ev.dedupe_key);
        if (!c) continue;
        const eventLike: LeadEventLike = {
          event_type: c.event_type, occurred_at: c.occurred_at, address: c.address, region: c.region,
          valuation_usd: c.valuation_usd, title: c.title, description: c.description,
          named_parties: c.named_parties, source_url: c.source_url,
        };
        for (const trade of cfg.trades as TradeKey[]) {
          const s = scoreLead(eventLike, trade, nowIso);
          if (!s) continue;
          const contact = pickContact(c.named_parties);
          leadRows.push({
            owner_id: src.owner_id, world_id: src.world_id, event_id: ev.id, trade,
            score: s.score, score_reasons: s.reasons,
            contact_name: contact?.name ?? null, contact_company: contact?.company ?? null,
            why_now: whyNow(eventLike).slice(0, 400), status: 'new',
          });
        }
      }
      if (leadRows.length) {
        const eventMeta = new Map(newEvents.map((ev) => {
          const c = byKey.get(ev.dedupe_key);
          return [ev.id, { title: c?.title ?? '', address: c?.address ?? null, region: c?.region ?? src.region }] as const;
        }));
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

    if (fetchOk) {
      await admin.from('le_sources').update({
        consecutive_failures: 0, last_fetch_at: nowIso, updated_at: nowIso,
        cursor: nextCursor(src, candidates),
        last_status: `Checked — ${candidates.length} row${candidates.length === 1 ? '' : 's'} read, ${newEvents.length} new.`,
      }).eq('id', src.id);
    }
  }

  // Wave-1 contact append — best-effort, bounded, score-gated; never affects the ingest result.
  const appended = await appendContacts(admin, newLeadRecords).catch(() => 0);

  let line = ingestLine(checked, unreachable, eventsNew, leadsNew);
  if (appended > 0) line += ` ${appended} phone${appended === 1 ? '' : 's'} appended from Places.`;
  return json({ ok: true, line, sources_checked: checked, sources_unreachable: unreachable, events_new: eventsNew, leads_new: leadsNew, contacts_appended: appended });
});
