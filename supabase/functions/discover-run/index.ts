// supabase/functions/discover-run/index.ts
// SCRAPE EVERYTHING → a growing pool of real businesses. Two engines, one grid:
//
//  • source:'claude' (default) — "Claude runs the scraping." No Google Places, no Cloud project, no
//    billing. Claude uses the web_search tool to find real local businesses AND judge each one's site
//    (bad / missing / decent) in a single pass. Grounded: a business is persisted ONLY if it's tied
//    to a real citation URL Anthropic actually returned (see claudeScout.ts) — never an invented one.
//  • source:'places' — the Google Places engine (structured firehose) for when the operator has a
//    working Places key and wants raw volume.
//
// Either way one call runs a BATCH of the (every-local-business-type × every-major-metro) grid and
// PERSISTS every business it finds into discovered_businesses (deduped). The UI loops this and watches
// the pool fill: "+12 found · 1,240 in pool · 380 need a website".
//
// Owner-auth (the operator, signed in). Reuses the pure discovery core + the big metro grid.
// Deploy: npx supabase functions deploy discover-run
// Secrets: ANTHROPIC_API_KEY (claude mode) and/or GOOGLE_PLACES_API_KEY (places mode).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { completeWithWebSearch } from '../_shared/ai.ts';
import { LOCAL_NICHES } from '../../../src/lib/garvis/clientHuntSchedule.ts';
import { bigMetroCities } from '../../../src/lib/garvis/bigCities.ts';
import { parsePlace, buildDiscoveryQueries, exhaustionUpdate, PLACES_FIELD_MASK, type PlaceRaw } from '../../../src/lib/garvis/placesDiscovery.ts';
import { SCOUT_SYSTEM, buildScoutPrompt, groundScoutLeads, type ScoutLead } from '../../../src/lib/garvis/claudeScout.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const PLACES_PAGES = 3;                 // 3 pages/query (~60 results) — swift's depth.
const SCOUT_MODEL = 'claude-sonnet-4-6'; // house model; supports the web_search tool (as in research).

interface QRow { id: string; query_text: string; keyword: string; city: string | null; state: string | null; last_run_at: string | null; total_inserted: number; run_count: number; consecutive_zero_runs: number }

/** Google Places textSearch (paginated). Returns businesses + an apiError (never swallowed). */
async function fetchPlaces(apiKey: string, textQuery: string): Promise<{ places: PlaceRaw[]; apiError: string | null }> {
  const all: PlaceRaw[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < PLACES_PAGES; i++) {
    const body: Record<string, unknown> = { textQuery, maxResultCount: 20, regionCode: 'US' };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': PLACES_FIELD_MASK },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
      return { places: all, apiError: `${res.status}${snippet ? ` ${snippet}` : ''}` };
    }
    const json = (await res.json()) as { places?: PlaceRaw[]; nextPageToken?: string };
    if (json.places?.length) all.push(...json.places);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { places: all, apiError: null };
}

/** Claude web-search scout for one (type × city) combo. Returns grounded leads + an apiError. */
async function scout(keyword: string, city: string, state: string): Promise<{ leads: ScoutLead[]; apiError: string | null }> {
  try {
    const r = await completeWithWebSearch(
      [{ role: 'system', content: SCOUT_SYSTEM }, { role: 'user', content: buildScoutPrompt(keyword, city, state) }],
      { model: SCOUT_MODEL, maxUses: 6, maxTokens: 6000 },
    );
    const { leads } = groundScoutLeads(r.text, r.sources, keyword, city, state);
    return { leads, apiError: null };
  } catch (e) {
    return { leads: [], apiError: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

// deno-lint-ignore no-explicit-any
async function insertPlace(admin: any, ownerId: string, raw: PlaceRaw, keyword: string, queryId: string): Promise<boolean> {
  const biz = parsePlace(raw, keyword);
  if (!biz) return false;
  if (biz.place_id) {
    const { data } = await admin.from('discovered_businesses').select('id').eq('owner_id', ownerId).eq('place_id', biz.place_id).maybeSingle();
    if (data) return false;
  }
  if (biz.website_normalized) {
    const { data } = await admin.from('discovered_businesses').select('id').eq('owner_id', ownerId).eq('website_normalized', biz.website_normalized).maybeSingle();
    if (data) return false;
  }
  const { error } = await admin.from('discovered_businesses').insert({
    owner_id: ownerId, place_id: biz.place_id, company_name: biz.company_name, keyword: biz.keyword,
    website: biz.website, website_normalized: biz.website_normalized, phone: biz.phone, address: biz.address,
    city: biz.city, state: biz.state, category: biz.category, lat: biz.lat, lng: biz.lng,
    has_website: biz.has_website, status: 'new', source_query_id: queryId,
  });
  return !error;
}

// deno-lint-ignore no-explicit-any
async function insertScout(admin: any, ownerId: string, lead: ScoutLead, queryId: string): Promise<boolean> {
  // Dedupe: by normalized website when there is one; otherwise by (name, city) so a no-website shop
  // found on a later run doesn't pile up. (place_id is null for open-web finds.)
  if (lead.website_normalized) {
    const { data } = await admin.from('discovered_businesses').select('id').eq('owner_id', ownerId).eq('website_normalized', lead.website_normalized).limit(1);
    if (data && data.length) return false;
  } else {
    let q = admin.from('discovered_businesses').select('id').eq('owner_id', ownerId).eq('company_name', lead.company_name);
    q = lead.city ? q.eq('city', lead.city) : q.is('city', null);
    const { data } = await q.limit(1);
    if (data && data.length) return false;
  }
  const { error } = await admin.from('discovered_businesses').insert({
    owner_id: ownerId, place_id: null, company_name: lead.company_name, keyword: lead.keyword,
    website: lead.website, website_normalized: lead.website_normalized, phone: lead.phone, address: lead.address,
    city: lead.city, state: lead.state, category: lead.category, lat: null, lng: null,
    has_website: lead.has_website, status: 'new', source_query_id: queryId,
  });
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const ownerId = user.id;

    const { batch: rawBatch, source: rawSource } = (await req.json().catch(() => ({}))) as { batch?: number; source?: string };
    const source: 'claude' | 'places' = rawSource === 'places' ? 'places' : 'claude';

    // Each engine needs its own key. Claude web-search only needs the Anthropic key the app already
    // uses — no Google Cloud setup.
    const placesKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (source === 'places' && !placesKey) return json({ error: 'GOOGLE_PLACES_API_KEY is not set — add it in Supabase secrets.' }, 400);
    if (source === 'claude' && !Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'ANTHROPIC_API_KEY is not set — add it in Supabase secrets.' }, 400);

    // Claude calls are metered per combo, so batches stay small; Places is a cheap firehose.
    const maxBatch = source === 'claude' ? 3 : 10;
    const batch = Math.max(1, Math.min(Math.floor(rawBatch ?? (source === 'claude' ? 2 : 4)), maxBatch));

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Seed the WHOLE grid on the owner's first run: every local-business type × every big metro. The
    // unique(owner_id, query_text) index makes a re-seed a no-op.
    const { count: qCount } = await admin.from('discovery_queries').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId);
    if ((qCount ?? 0) === 0) {
      const rows = buildDiscoveryQueries([...LOCAL_NICHES], bigMetroCities()).map((r) => ({ owner_id: ownerId, ...r }));
      for (let i = 0; i < rows.length; i += 500) {
        await admin.from('discovery_queries').upsert(rows.slice(i, i + 500), { onConflict: 'owner_id,query_text', ignoreDuplicates: true });
      }
    }

    // Next-best combos: never-run first, then least-recently-run.
    const { data: queries } = await admin.from('discovery_queries')
      .select('id, query_text, keyword, city, state, last_run_at, total_inserted, run_count, consecutive_zero_runs')
      .eq('owner_id', ownerId).eq('exhausted', false)
      .order('last_run_at', { ascending: true, nullsFirst: true }).limit(batch);

    let combosRun = 0; let newLeads = 0; let dupes = 0; let apiError: string | null = null;
    for (const q of (queries ?? []) as QRow[]) {
      let inserted = 0;
      if (source === 'claude') {
        const { leads, apiError: err } = await scout(q.keyword, q.city ?? '', q.state ?? '');
        if (err) { apiError = err; break; }   // a rejected key/model fails every combo — stop + surface
        combosRun++;
        for (const lead of leads) { if (await insertScout(admin, ownerId, lead, q.id)) { inserted++; } else { dupes++; } }
      } else {
        const { places, apiError: err } = await fetchPlaces(placesKey!, q.query_text);
        if (err) { apiError = err; break; }
        combosRun++;
        for (const raw of places) { if (await insertPlace(admin, ownerId, raw, q.keyword, q.id)) { inserted++; } else { dupes++; } }
      }
      newLeads += inserted;
      const upd = exhaustionUpdate(q, inserted);
      await admin.from('discovery_queries').update({
        last_run_at: new Date().toISOString(), last_inserted: upd.last_inserted, total_inserted: upd.total_inserted,
        run_count: upd.run_count, consecutive_zero_runs: upd.consecutive_zero_runs, exhausted: upd.exhausted,
      }).eq('id', q.id);
    }

    // Pool totals for the live progress display.
    const [pool, noSite, remaining] = await Promise.all([
      admin.from('discovered_businesses').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
      admin.from('discovered_businesses').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('has_website', false),
      admin.from('discovery_queries').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('exhausted', false).is('last_run_at', null),
    ]);

    return json({
      ok: true, source, combosRun, newLeads, dupes, apiError,
      poolTotal: pool.count ?? 0, noWebsite: noSite.count ?? 0, freshCombosLeft: remaining.count ?? 0,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
