// supabase/functions/oauth/index.ts
// OAuth connect flow for provider integrations (C2: Supabase; C3/C4 add GitHub/Netlify).
//   action 'start'    → create PKCE + CSRF state, return the provider authorize URL
//   action 'exchange' → swap the returned code (+ stored verifier) for tokens, store the connection
// Tokens are written to provider_connections (service role) and never returned to the browser.
//
// SETUP: register the provider OAuth app, set <PROVIDER>_OAUTH_CLIENT_ID / _CLIENT_SECRET as edge
// secrets, and add <studio>/oauth/callback as a redirect URI.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { OAUTH_PROVIDERS, makePkce, randomState, clientCreds, exchangeCode } from '../_shared/oauth.ts';
import { upsertConnection, probeProvider } from '../_shared/connections.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { action, provider, redirectUri, code, state } = (await req.json().catch(() => ({}))) as {
      action?: string; provider?: string; redirectUri?: string; code?: string; state?: string;
    };

    const p = provider ? OAUTH_PROVIDERS[provider] : undefined;
    if (!provider || !p) return json({ error: `Unsupported OAuth provider "${provider}".` }, 400);
    const creds = clientCreds(p);
    if (!creds) return json({ error: `${provider} OAuth isn't configured — set ${p.clientIdEnv} and ${p.clientSecretEnv} as edge secrets.` }, 400);

    if (action === 'start') {
      if (!redirectUri) return json({ error: 'redirectUri is required.' }, 400);
      const { verifier, challenge } = p.pkce ? await makePkce() : { verifier: '', challenge: '' };
      const st = randomState();
      await admin.from('oauth_states').insert({ state: st, user_id: user.id, provider, code_verifier: verifier, redirect_uri: redirectUri });
      const pkceParams = p.pkce ? `&code_challenge=${challenge}&code_challenge_method=S256` : '';
      const url = `${p.authorizeUrl}?response_type=code&client_id=${encodeURIComponent(creds.id)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(st)}${pkceParams}&scope=${encodeURIComponent(p.scope)}`;
      return json({ url });
    }

    if (action === 'exchange') {
      if (!code || !state) return json({ error: 'code and state are required.' }, 400);
      const { data: row } = await admin.from('oauth_states').select('*').eq('state', state).maybeSingle();
      if (!row || row.user_id !== user.id || row.provider !== provider) return json({ error: 'Invalid or expired OAuth state — start the connection again.' }, 400);
      const tok = await exchangeCode(p, { code, redirectUri: row.redirect_uri, verifier: row.code_verifier, id: creds.id, secret: creds.secret });
      await admin.from('oauth_states').delete().eq('state', state);
      if (!tok.ok || !tok.access_token) {
        console.error(`[oauth ${provider}] exchange failed: ${tok.error}`);
        return json({ error: `${provider} token exchange failed: ${tok.error ?? 'unknown'}` }, 502);
      }
      const probe = await probeProvider(provider, tok.access_token);
      const expires_at = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null;
      await upsertConnection(admin, user.id, provider, {
        access_token: tok.access_token, refresh_token: tok.refresh_token ?? null,
        expires_at, scope: p.scope, account_label: probe.label ?? null,
      });
      return json({ ok: true, label: probe.label });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
