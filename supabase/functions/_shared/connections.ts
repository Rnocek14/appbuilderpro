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
    return { ok: true }; // unknown provider — accept without a probe
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
