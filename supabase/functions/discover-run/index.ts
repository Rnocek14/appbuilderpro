// supabase/functions/discover-run/index.ts
// SCRAPE EVERYTHING → a growing pool of real businesses (the swift-prep-pros model, ported).
// One call runs a BATCH of the (every-local-business-type × every-major-metro) grid, and — the thing
// that was missing — PERSISTS every business it finds into discovered_businesses (deduped). The UI
// loops this and watches the pool fill: "+12 found · 1,240 in pool". Owner-driven, so the operator
// can fill the pool to thousands in one sitting instead of waiting on the 40/day cron.
//
// Owner-auth (the operator, signed in). Reuses the pure discovery core + the big metro grid.
// Deploy: npx supabase functions deploy discover-run
// Secrets: GOOGLE_PLACES_API_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { LOCAL_NICHES } from '../../../src/lib/garvis/clientHuntSchedule.ts';
import { bigMetroCities } from '../../../src/lib/garvis/bigCities.ts';
import { parsePlace, buildDiscoveryQueries, exhaustionUpdate, PLACES_FIELD_MASK, type PlaceRaw } from '../../../src/lib/garvis/placesDiscovery.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const PLACES_PAGES = 3;   // 3 pages/query (~60 results) — swift's depth, up from the cron's 2.

interface QRow { id: string; query_text: string; keyword: string; last_run_at: string | null; total_inserted: number; run_count: number; consecutive_zero_runs: number }

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

// deno-lint-ignore no-explicit-any
async function insertLead(admin: any, ownerId: string, raw: PlaceRaw, keyword: string, queryId: string): Promise<boolean> {
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

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return json({ error: 'GOOGLE_PLACES_API_KEY is not set — add it in Supabase secrets.' }, 400);

    const { batch: rawBatch } = (await req.json().catch(() => ({}))) as { batch?: number };
    const batch = Math.max(1, Math.min(Math.floor(rawBatch ?? 4), 10));

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
      .select('id, query_text, keyword, last_run_at, total_inserted, run_count, consecutive_zero_runs')
      .eq('owner_id', ownerId).eq('exhausted', false)
      .order('last_run_at', { ascending: true, nullsFirst: true }).limit(batch);

    let combosRun = 0; let newLeads = 0; let dupes = 0; let apiError: string | null = null;
    for (const q of (queries ?? []) as QRow[]) {
      const { places, apiError: err } = await fetchPlaces(apiKey, q.query_text);
      if (err) { apiError = err; break; }   // a rejected key fails every combo — stop + surface (never exhaust)
      combosRun++;
      let inserted = 0;
      for (const raw of places) { if (await insertLead(admin, ownerId, raw, q.keyword, q.id)) { inserted++; } else { dupes++; } }
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
      ok: true, combosRun, newLeads, dupes, apiError,
      poolTotal: pool.count ?? 0, noWebsite: noSite.count ?? 0, freshCombosLeft: remaining.count ?? 0,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
