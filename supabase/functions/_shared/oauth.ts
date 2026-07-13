// supabase/functions/_shared/oauth.ts
// Provider OAuth config + PKCE helpers, shared by the `oauth` edge function. Extensible: add a provider
// to OAUTH_PROVIDERS and the start/exchange flow handles it. Client id/secret come from edge secrets.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getConnection, upsertConnection } from './connections.ts';

export interface OAuthProvider {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scope: string;
  pkce: boolean; // Supabase requires PKCE; GitHub OAuth apps use the client secret instead.
  tokenAuth?: 'body' | 'basic'; // DocuSign requires HTTP Basic on the token endpoint; default 'body'.
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  supabase: {
    authorizeUrl: 'https://api.supabase.com/v1/oauth/authorize',
    tokenUrl: 'https://api.supabase.com/v1/oauth/token',
    clientIdEnv: 'SB_OAUTH_CLIENT_ID',        // NOT SUPABASE_* — that prefix is reserved by the platform
    clientSecretEnv: 'SB_OAUTH_CLIENT_SECRET',
    scope: 'all',
    pkce: true,
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    scope: 'repo',
    pkce: false,
  },
  // DocuSign: demo (developer sandbox) by default; production flips DOCUSIGN_AUTH_BASE to
  // https://account.docusign.com by CONFIG, never by code (the lakegen audit's hardcoded-demo trap).
  docusign: {
    authorizeUrl: `${Deno.env.get('DOCUSIGN_AUTH_BASE') ?? 'https://account-d.docusign.com'}/oauth/auth`,
    tokenUrl: `${Deno.env.get('DOCUSIGN_AUTH_BASE') ?? 'https://account-d.docusign.com'}/oauth/token`,
    clientIdEnv: 'DOCUSIGN_OAUTH_CLIENT_ID',
    clientSecretEnv: 'DOCUSIGN_OAUTH_CLIENT_SECRET',
    scope: 'signature',
    pkce: false,
    tokenAuth: 'basic',
  },
  // C4 adds: netlify
};

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Generate a PKCE verifier + S256 challenge. */
export async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const rnd = new Uint8Array(48);
  crypto.getRandomValues(rnd);
  const verifier = b64url(rnd);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

export function randomState(): string {
  const rnd = new Uint8Array(24);
  crypto.getRandomValues(rnd);
  return b64url(rnd);
}

export function clientCreds(p: OAuthProvider): { id: string; secret: string } | null {
  const id = Deno.env.get(p.clientIdEnv);
  const secret = Deno.env.get(p.clientSecretEnv);
  return id && secret ? { id, secret } : null;
}

/** Exchange an authorization code (with PKCE verifier) for tokens. */
export async function exchangeCode(p: OAuthProvider, args: { code: string; redirectUri: string; verifier: string; id: string; secret: string }): Promise<{ ok: boolean; access_token?: string; refresh_token?: string; expires_in?: number; error?: string }> {
  const basic = p.tokenAuth === 'basic';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  if (!basic) { body.set('client_id', args.id); body.set('client_secret', args.secret); }
  if (args.verifier) body.set('code_verifier', args.verifier); // PKCE providers only
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (basic) headers.Authorization = `Basic ${btoa(`${args.id}:${args.secret}`)}`;
  const r = await fetch(p.tokenUrl, { method: 'POST', headers, body });
  const t = await r.text();
  if (!r.ok) return { ok: false, error: `${r.status}: ${t.slice(0, 300)}` };
  try {
    // GitHub returns HTTP 200 even on failure, with an `error`/`error_description` in the body.
    const j = JSON.parse(t) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!j.access_token) return { ok: false, error: j.error_description || j.error || `No access_token returned: ${t.slice(0, 200)}` };
    return { ok: true, ...j };
  } catch { return { ok: false, error: `Unparseable token response: ${t.slice(0, 200)}` }; }
}

/**
 * Return a valid access token for the user's connection to `provider`, refreshing it if near expiry.
 * Used by the deploy/migration/provision functions so they act as the user via their OAuth token.
 */
export async function freshProviderToken(admin: SupabaseClient, userId: string, provider: string): Promise<string | null> {
  const conn = await getConnection(admin, userId, provider);
  if (!conn?.access_token) return null;
  const p = OAUTH_PROVIDERS[provider];
  const nearExpiry = conn.expires_at ? new Date(conn.expires_at).getTime() < Date.now() + 60_000 : false;
  if (p && nearExpiry && conn.refresh_token) {
    const creds = clientCreds(p);
    if (creds) {
      const r = await refreshToken(p, { refresh_token: conn.refresh_token, id: creds.id, secret: creds.secret });
      if (r.ok && r.access_token) {
        await upsertConnection(admin, userId, provider, {
          access_token: r.access_token, refresh_token: r.refresh_token ?? conn.refresh_token,
          expires_at: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null,
        });
        return r.access_token;
      }
    }
  }
  return conn.access_token;
}

/**
 * The right Supabase Management token for a project: the PLATFORM token when the project's database is
 * managed under FableForge's org (FableForge Cloud), otherwise the user's own OAuth token (their org),
 * falling back to an operator PAT. Used by db-console / apply-migration / deploy-backend.
 */
export async function projectSupabaseToken(admin: SupabaseClient, userId: string, managed: boolean): Promise<string | null> {
  if (managed) return Deno.env.get('FF_PLATFORM_MANAGEMENT_TOKEN') ?? null;
  return (await freshProviderToken(admin, userId, 'supabase')) || Deno.env.get('SB_MANAGEMENT_TOKEN') || null;
}

/** Refresh an access token. */
export async function refreshToken(p: OAuthProvider, args: { refresh_token: string; id: string; secret: string }): Promise<{ ok: boolean; access_token?: string; refresh_token?: string; expires_in?: number; error?: string }> {
  const basic = p.tokenAuth === 'basic';
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: args.refresh_token });
  if (!basic) { body.set('client_id', args.id); body.set('client_secret', args.secret); }
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (basic) headers.Authorization = `Basic ${btoa(`${args.id}:${args.secret}`)}`;
  const r = await fetch(p.tokenUrl, { method: 'POST', headers, body });
  const t = await r.text();
  if (!r.ok) return { ok: false, error: `${r.status}: ${t.slice(0, 200)}` };
  try { return { ok: true, ...(JSON.parse(t) as object) }; } catch { return { ok: false, error: 'Bad refresh response' }; }
}
