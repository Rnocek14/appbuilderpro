// supabase/functions/mls-sync/index.ts
// THE MLS DATA RAIL — a RESO Web API (OData) client, rebuilt in house style from the lakegen
// harvest (its client was real; nothing ever called it and nowhere accepted credentials).
// Actions (owner JWT only; the feed token is SEALED here — the browser never sees it):
//   save   {base_url, token}  → probe the feed with ONE $top=1 query, store in provider_connections
//   sync   {}                 → pull changed listings since the newest modified_at we hold (paged),
//                               upsert into mls_listings, return HONEST counts
//   status {}                 → connection + row counts (no secrets returned)
// Honesty: a failed probe refuses to save; a partial sync says how far it got; field mapping uses
// RESO standard names and stores what the feed SAID (status text as-is), never normalized guesses.
//
// Deploy: in package.json functions:deploy. No new global secrets — credentials are per-user.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { getConnection, upsertConnection } from '../_shared/connections.ts';

const PAGE = 200;
const MAX_PAGES = 5; // one sync call moves at most 1000 listings — run it again to continue (said in the result)

interface ResoProperty {
  ListingKey?: string; StandardStatus?: string; ListPrice?: number; ClosePrice?: number;
  UnparsedAddress?: string; City?: string; PostalCode?: string; PropertyType?: string;
  BedroomsTotal?: number; BathroomsTotalInteger?: number; LivingArea?: number;
  ListingContractDate?: string; CloseDate?: string; DaysOnMarket?: number; ModificationTimestamp?: string;
}

function mapRow(uid: string, p: ResoProperty) {
  return {
    owner_id: uid,
    listing_key: String(p.ListingKey ?? ''),
    status: String(p.StandardStatus ?? ''),
    list_price: p.ListPrice ?? null,
    close_price: p.ClosePrice ?? null,
    address1: String(p.UnparsedAddress ?? '').slice(0, 300),
    city: String(p.City ?? '').slice(0, 120),
    zip: String(p.PostalCode ?? '').slice(0, 10),
    property_type: String(p.PropertyType ?? '').slice(0, 80),
    beds: p.BedroomsTotal ?? null,
    baths: p.BathroomsTotalInteger ?? null,
    sqft: p.LivingArea ?? null,
    list_date: p.ListingContractDate ? String(p.ListingContractDate).slice(0, 10) : null,
    close_date: p.CloseDate ? String(p.CloseDate).slice(0, 10) : null,
    dom: p.DaysOnMarket ?? null,
    modified_at: p.ModificationTimestamp ?? null,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const uid = user.id;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = (await req.json().catch(() => ({}))) as { action?: string; base_url?: string; token?: string };

    if (body.action === 'save') {
      const base = (body.base_url ?? '').trim().replace(/\/+$/, '');
      const token = (body.token ?? '').trim();
      if (!/^https:\/\//.test(base)) return json({ error: 'The feed base URL must be https.' }, 400);
      if (!token) return json({ error: 'The feed token is required.' }, 400);
      // Probe with the cheapest possible real query — a feed that can't answer this can't sync.
      const probe = await fetch(`${base}/Property?$top=1`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }).catch(() => null);
      if (!probe || !probe.ok) {
        return json({ error: `The feed refused the probe (${probe ? `HTTP ${probe.status}` : 'unreachable'}) — check the base URL and token with your MLS/RESO provider. Nothing was saved.` }, 400);
      }
      await upsertConnection(admin, uid, 'mls_reso', {
        access_token: token, account_label: new URL(base).host, metadata: { base_url: base },
      });
      return json({ ok: true, note: `Feed verified and saved (${new URL(base).host}).` });
    }

    if (body.action === 'status') {
      const conn = await getConnection(admin, uid, 'mls_reso');
      const { count } = await admin.from('mls_listings').select('id', { count: 'exact', head: true }).eq('owner_id', uid);
      return json({ ok: true, connected: !!conn?.access_token, host: conn?.account_label ?? null, rows: count ?? 0 });
    }

    if (body.action === 'sync') {
      const conn = await getConnection(admin, uid, 'mls_reso');
      const base = (conn?.metadata as { base_url?: string } | null)?.base_url;
      if (!conn?.access_token || !base) return json({ error: 'No MLS feed configured — save one first.' }, 400);

      // Cursor: the newest ModificationTimestamp we already hold (never a guessed date).
      const { data: newest } = await admin.from('mls_listings')
        .select('modified_at').eq('owner_id', uid).not('modified_at', 'is', null)
        .order('modified_at', { ascending: false }).limit(1).maybeSingle();
      const since = (newest?.modified_at as string | undefined) ?? '1970-01-01T00:00:00Z';

      let fetched = 0; let upserted = 0; let pages = 0; let hitCap = false;
      let cursor = since;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = `${base}/Property?$filter=${encodeURIComponent(`ModificationTimestamp gt ${cursor}`)}&$orderby=${encodeURIComponent('ModificationTimestamp asc')}&$top=${PAGE}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${conn.access_token}`, Accept: 'application/json' } });
        if (!r.ok) {
          const txt = await r.text().catch(() => '');
          return json({ error: `Feed error on page ${page + 1} (HTTP ${r.status}): ${txt.slice(0, 200)}. Synced ${upserted} rows before failing — they are kept.`, fetched, upserted }, 502);
        }
        const out = await r.json() as { value?: ResoProperty[] };
        const items = (out.value ?? []).filter((p) => p.ListingKey);
        pages++;
        fetched += items.length;
        if (items.length === 0) break;
        const rows = items.map((p) => mapRow(uid, p));
        const { error: upErr } = await admin.from('mls_listings')
          .upsert(rows, { onConflict: 'owner_id,listing_key' });
        if (upErr) return json({ error: `Could not store page ${page + 1}: ${upErr.message}`, fetched, upserted }, 500);
        upserted += rows.length;
        const last = items[items.length - 1]?.ModificationTimestamp;
        if (!last || last === cursor) break; // no forward progress — stop rather than loop
        cursor = last;
        if (items.length < PAGE) break;
        if (page === MAX_PAGES - 1) hitCap = true;
      }

      await admin.from('mind_events').insert({
        owner_id: uid, event_type: 'note', source: 'execution',
        subject: `MLS sync: ${upserted} listing${upserted === 1 ? '' : 's'} updated${hitCap ? ' (more remain — run sync again)' : ''}`,
        payload: { key: `mls-sync:${new Date().toISOString().slice(0, 13)}`, fetched, upserted, pages },
      }).then(() => {}, () => {});

      return json({ ok: true, fetched, upserted, pages, more: hitCap,
        note: hitCap ? `Moved ${upserted} listings (cap ${MAX_PAGES * PAGE}/call) — run sync again to continue.` : `Up to date: ${upserted} listings updated.` });
    }

    return json({ error: `Unknown action "${body.action}".` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
