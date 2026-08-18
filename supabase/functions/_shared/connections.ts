// supabase/functions/_shared/connections.ts
// Server-side helpers for reading/writing a user's provider connections (Supabase/GitHub/Netlify).
// Used by the `connections` function and (C2/C3/C4) the oauth + deploy functions, so tokens are only
// ever touched with the service role — never returned to the browser.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface ProviderConnection {
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  account_label: string | null;
  metadata: Record<string, unknown>;
}

export async function getConnection(admin: SupabaseClient, userId: string, provider: string): Promise<ProviderConnection | null> {
  const { data } = await admin.from('provider_connections')
    .select('provider, access_token, refresh_token, expires_at, scope, account_label, metadata')
    .eq('user_id', userId).eq('provider', provider).maybeSingle();
  return (data as ProviderConnection) ?? null;
}

export async function upsertConnection(admin: SupabaseClient, userId: string, provider: string, fields: Partial<ProviderConnection>): Promise<void> {
  await admin.from('provider_connections').upsert(
    { user_id: userId, provider, ...fields },
    { onConflict: 'user_id,provider' },
  );
}

/** Validate a token against the provider and return a human label (login / org name). */
export async function probeProvider(provider: string, token: string): Promise<{ ok: boolean; label?: string; error?: string }> {
  try {
    if (provider === 'github') {
      const r = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'FableForge' } });
      if (!r.ok) return { ok: false, error: `GitHub ${r.status}` };
      const u = await r.json(); return { ok: true, label: u.login };
    }
    if (provider === 'netlify') {
      const r = await fetch('https://api.netlify.com/api/v1/user', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { ok: false, error: `Netlify ${r.status}` };
      const u = await r.json(); return { ok: true, label: u.full_name || u.email || 'Netlify account' };
    }
    if (provider === 'supabase') {
      const r = await fetch('https://api.supabase.com/v1/organizations', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { ok: false, error: `Supabase ${r.status}` };
      const orgs = await r.json() as { name?: string }[];
      return { ok: true, label: orgs?.[0]?.name ?? 'Supabase org' };
    }
    if (provider === 'docusign') {
      const base = Deno.env.get('DOCUSIGN_AUTH_BASE') ?? 'https://account-d.docusign.com';
      const r = await fetch(`${base}/oauth/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { ok: false, error: `DocuSign ${r.status}` };
      const u = await r.json() as { name?: string; email?: string };
      return { ok: true, label: u.name || u.email || 'DocuSign account' };
    }
    if (provider === 'ayrshare') {
      const r = await fetch('https://app.ayrshare.com/api/user', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { ok: false, error: `Ayrshare ${r.status} — check the API key` };
      const u = await r.json() as { title?: string; email?: string; displayNames?: { platform?: string }[] };
      const n = (u.displayNames ?? []).length;
      return { ok: true, label: u.title || u.email || `${n} account${n === 1 ? '' : 's'} linked` };
    }
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { ok: false, error: `Resend ${r.status} — check the API key` };
      const d = await r.json() as { data?: { name?: string; status?: string }[] };
      const verified = (d.data ?? []).find((x) => x.status === 'verified');
      return { ok: true, label: verified?.name ?? d.data?.[0]?.name ?? 'Resend (no sending domain yet)' };
    }
    if (provider === 'lob') {
      const r = await fetch('https://api.lob.com/v1/addresses?limit=1', { headers: { Authorization: `Basic ${btoa(`${token}:`)}` } });
      if (!r.ok) return { ok: false, error: `Lob ${r.status} — check the API key` };
      return { ok: true, label: token.startsWith('live_') ? 'Lob (live)' : 'Lob (test)' };
    }
    if (provider === 'google_places') {
      // Places API (New) — the same backend every hunt path calls, so a key that passes here
      // is a key that actually works in production (system-control's probe_places pattern).
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': token, 'X-Goog-FieldMask': 'places.id' },
        body: JSON.stringify({ textQuery: 'coffee shop', maxResultCount: 1, regionCode: 'US' }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: { message?: string } };
        return { ok: false, error: d.error?.message ?? `Places ${r.status} — check the key and that "Places API (New)" is enabled` };
      }
      return { ok: true, label: 'Places API' };
    }
    if (provider === 'twilio') {
      const creds = splitTwilioToken(token);
      if (!creds) return { ok: false, error: 'Format: ACCOUNT_SID:AUTH_TOKEN — both are on the Twilio console home page.' };
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}.json`, {
        headers: { Authorization: `Basic ${btoa(`${creds.sid}:${creds.secret}`)}` },
      });
      if (!r.ok) return { ok: false, error: `Twilio ${r.status} — check the SID and auth token` };
      const u = await r.json() as { friendly_name?: string };
      return { ok: true, label: u.friendly_name ?? creds.sid };
    }
    return { ok: true }; // unknown provider — accept without a probe
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- CONNECTION-FIRST KEY CONSUMPTION (API manager part 2) --------------------------------------
// Executors resolve service keys through here: the owner's OWN connection first, the platform env
// key as fallback. `source` says which is carrying the call — surfaces and ledgers can stay honest.
// Deliberately NOT routed through here: inbound webhook signature checks (sms-inbound/voice-inbound
// validate against the PLATFORM number's auth token — per-user keys don't apply to inbound routing)
// and platform notifications to the operator (_shared/notify).

export interface ServiceKeyResult { key: string | null; source: 'connection' | 'platform' | null }

/** The owner's connected key for a provider, else the platform env key, else an honest null. */
export async function serviceKey(
  admin: SupabaseClient, ownerId: string, provider: string, envName: string,
): Promise<ServiceKeyResult> {
  const conn = await getConnection(admin, ownerId, provider).catch(() => null);
  const own = conn?.access_token?.trim();
  if (own) return { key: own, source: 'connection' };
  const fallback = Deno.env.get(envName)?.trim();
  return fallback ? { key: fallback, source: 'platform' } : { key: null, source: null };
}

export interface TwilioCreds { sid: string; token: string; from: string | null; source: 'connection' | 'platform' }

/** Twilio's credential pair + sending number, connection-first. Null = neither side is configured. */
export async function twilioCreds(admin: SupabaseClient, ownerId: string): Promise<TwilioCreds | null> {
  const conn = await getConnection(admin, ownerId, 'twilio').catch(() => null);
  const split = conn?.access_token ? splitTwilioToken(conn.access_token) : null;
  if (split) {
    const metaFrom = typeof conn?.metadata?.from_number === 'string' ? conn.metadata.from_number.trim() : '';
    return { sid: split.sid, token: split.secret, from: metaFrom || Deno.env.get('TWILIO_FROM_NUMBER') || null, source: 'connection' };
  }
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!sid || !token) return null;
  return { sid, token, from: Deno.env.get('TWILIO_FROM_NUMBER') ?? null, source: 'platform' };
}

/** Twilio is a credential PAIR — stored as one token "ACCOUNT_SID:AUTH_TOKEN". Null = malformed. */
export function splitTwilioToken(token: string): { sid: string; secret: string } | null {
  const i = token.indexOf(':');
  if (i < 0) return null;
  const sid = token.slice(0, i).trim();
  const secret = token.slice(i + 1).trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid) || !secret) return null;
  return { sid, secret };
}
