// supabase/functions/ads-sync/index.ts
// The ad-platform sync seam — READ-ONLY by design (best practice: reporting access first; the
// review bar for read is far lower than write, and Garvis never mutates campaigns from here).
// Secrets live in edge env only; the browser never sees a token:
//   Meta:   META_ADS_ACCESS_TOKEN            (a System User token — non-expiring, server-to-server)
//   Google: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
//           GOOGLE_ADS_REFRESH_TOKEN, optional GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC)
// Per-user, NON-secret config (which ad account / customer id) lives in public.connections.
//
// Modes (POST, authenticated):
//   { mode: 'status' }                          → which providers are server-configured
//   { mode: 'sync', provider, world_id }        → pull last-30d daily campaign metrics into
//                                                 ad_metrics (upsert — idempotent re-syncs),
//                                                 stamp world_id, update connections state.
// Honest degradation everywhere: missing env → {available:false} with the exact setup steps;
// API errors land in connections.last_error, never invented rows.
//
// Deploy: npx supabase functions deploy ads-sync

import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetricRow { date: string; campaign_name: string; spend_usd: number; impressions: number; clicks: number }

function metaConfigured(): boolean { return !!Deno.env.get('META_ADS_ACCESS_TOKEN'); }
function googleConfigured(): boolean {
  return !!(Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') && Deno.env.get('GOOGLE_ADS_CLIENT_ID')
    && Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') && Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN'));
}

// ---- Meta: Insights API off the ad account (read-only, daily, campaign level) --------------
async function fetchMeta(adAccountId: string): Promise<MetricRow[]> {
  const token = Deno.env.get('META_ADS_ACCESS_TOKEN')!;
  const acct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const url = `https://graph.facebook.com/v21.0/${acct}/insights?level=campaign&fields=campaign_name,spend,impressions,clicks&date_preset=last_30d&time_increment=1&limit=500&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Meta returned ${res.status}`);
  return ((body?.data ?? []) as Record<string, string>[]).map((r) => ({
    date: r.date_start,
    campaign_name: (r.campaign_name ?? 'unknown').slice(0, 200),
    spend_usd: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
  })).filter((r) => r.date);
}

// ---- Google: OAuth refresh → searchStream GAQL (read-only) ---------------------------------
async function googleAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_ADS_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) throw new Error(body?.error_description ?? 'Google OAuth refresh failed');
  return body.access_token as string;
}

async function fetchGoogle(customerId: string): Promise<MetricRow[]> {
  const access = await googleAccessToken();
  const cid = customerId.replace(/-/g, '');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${access}`,
    'developer-token': Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!,
  };
  const mcc = Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID');
  if (mcc) headers['login-customer-id'] = mcc.replace(/-/g, '');
  const res = await fetch(`https://googleads.googleapis.com/v21/customers/${cid}/googleAds:searchStream`, {
    method: 'POST', headers,
    body: JSON.stringify({
      query: 'SELECT campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date DURING LAST_30_DAYS',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body) ? body[0]?.error?.message : body?.error?.message;
    throw new Error(msg ?? `Google Ads returned ${res.status}`);
  }
  const out: MetricRow[] = [];
  for (const chunk of Array.isArray(body) ? body : [body]) {
    for (const row of (chunk?.results ?? []) as Record<string, Record<string, unknown>>[]) {
      out.push({
        date: String(row.segments?.date ?? ''),
        campaign_name: String(row.campaign?.name ?? 'unknown').slice(0, 200),
        spend_usd: Number(row.metrics?.costMicros ?? 0) / 1_000_000,
        impressions: Number(row.metrics?.impressions ?? 0),
        clicks: Number(row.metrics?.clicks ?? 0),
      });
    }
  }
  return out.filter((r) => r.date);
}

const SETUP: Record<string, string[]> = {
  meta_ads: [
    '1. Create a Meta Business app (developers.facebook.com) and request ads_read (read-only is the fast lane; ads_management can come later).',
    '2. In Business Settings → System Users: create a system user, assign your ad account, generate a non-expiring token with ads_read.',
    '3. Set the secret: supabase secrets set META_ADS_ACCESS_TOKEN=<token>',
    '4. Enter your ad account id (act_… or the number) below and sync.',
  ],
  google_ads: [
    '1. Apply for a Google Ads API developer token (API Center in your manager account) — basic access is enough for reporting.',
    '2. Create an OAuth client (Google Cloud), run the OAuth flow once to obtain a refresh token for the account.',
    '3. Set the secrets: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN (+ GOOGLE_ADS_LOGIN_CUSTOMER_ID if under an MCC).',
    '4. Enter your customer id (123-456-7890) below and sync.',
  ],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as { mode?: string; provider?: string; world_id?: string; owner_id?: string };

    // TWO callers, one sync path:
    //  1) the OWNER (browser) — Authorization JWT; syncs their own connection.
    //  2) the WATCHDOG worker (ads-watch, overnight refresh) — x-worker-secret + owner_id; the
    //     owner must actually HAVE a connections row (verified below), and metering still applies.
    const workerSecret = Deno.env.get('WORKER_SECRET');
    const byWorker = !!workerSecret && req.headers.get('x-worker-secret') === workerSecret;
    let uid: string;
    if (byWorker) {
      if (!body.owner_id) return json({ error: 'owner_id required for worker sync.' }, 400);
      uid = body.owner_id;
    } else {
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      );
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      uid = user.id;
    }

    if (body.mode === 'status') {
      return json({
        providers: {
          meta_ads: { serverConfigured: metaConfigured(), setup: SETUP.meta_ads },
          google_ads: { serverConfigured: googleConfigured(), setup: SETUP.google_ads },
        },
      });
    }

    if (body.mode !== 'sync') return json({ error: 'mode must be status|sync.' }, 400);
    const provider = body.provider;
    if (provider !== 'meta_ads' && provider !== 'google_ads') return json({ error: 'provider must be meta_ads|google_ads.' }, 400);
    const configured = provider === 'meta_ads' ? metaConfigured() : googleConfigured();
    if (!configured) return json({ available: false, setup: SETUP[provider] });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: conn } = await admin.from('connections')
      .select('id, config').eq('owner_id', uid).eq('provider', provider).maybeSingle();
    const accountId = String((conn?.config as Record<string, unknown> | null)?.ad_account_id ?? (conn?.config as Record<string, unknown> | null)?.customer_id ?? '').trim();
    if (!accountId) return json({ available: true, needsConfig: true, message: 'Enter your account id first.' });

    const fail = async (msg: string) => {
      await admin.from('connections').update({ status: 'error', last_error: msg.slice(0, 500) }).eq('id', conn!.id);
      return json({ available: true, ok: false, error: msg }, 200);
    };

    // CREDIT GATE — a sync spends operator API quota, so it meters the caller's credits (audit M2).
    try { await checkCredits(admin, uid, 'ads_sync'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    let rows: MetricRow[];
    try {
      rows = provider === 'meta_ads' ? await fetchMeta(accountId) : await fetchGoogle(accountId);
    } catch (e) {
      return await fail(e instanceof Error ? e.message : String(e));
    }
    await spendCredits(admin, uid, { costUsd: 0.02, kind: 'ads_sync', provider });

    // Upsert — idempotent re-syncs; world stamped on insert, metrics refreshed on conflict.
    let upserts = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200).map((r) => {
        const row: Record<string, unknown> = {
          owner_id: uid, provider, date: r.date, campaign_name: r.campaign_name,
          spend_usd: r.spend_usd, impressions: r.impressions, clicks: r.clicks,
        };
        // Stamp world_id ONLY when this sync is explicitly scoped to a world (deep scan P1): the
        // nightly refresh syncs with no world_id, and including `null` on conflict wiped the
        // attribution set at sync time. Omitting the column preserves the existing value.
        if (body.world_id) row.world_id = body.world_id;
        return row;
      });
      const { error } = await admin.from('ad_metrics').upsert(batch, { onConflict: 'owner_id,provider,date,campaign_name' });
      if (!error) upserts += batch.length;
    }
    await admin.from('connections').update({
      status: 'ready', last_error: null, last_synced_at: new Date().toISOString(),
    }).eq('id', conn!.id);

    const spend = rows.reduce((n, r) => n + r.spend_usd, 0);
    return json({ available: true, ok: true, rows: upserts, spendUsd: Math.round(spend * 100) / 100, days: 30 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
