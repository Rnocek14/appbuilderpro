// supabase/functions/connections/index.ts
// The connections hub backend: list / connect / test / disconnect a user's provider connections.
// Tokens are stored server-side (provider_connections table, RLS-locked to the service role) and are
// NEVER returned to the browser — `list` returns only sanitized status (provider, label, expiry).
//
// This is the stepping-stone for the OAuth phases (C2/C3): "connect" accepts a token the user provides
// now; later the oauth functions write the same rows. Either way the rest of the app reads connections
// from here, not from localStorage.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { getConnection, upsertConnection, probeProvider } from '../_shared/connections.ts';

const PROVIDERS = new Set([
  'supabase', 'github', 'netlify', 'vercel', 'docusign', 'ayrshare',
  // Service keys (the API manager): per-user keys with the platform env key as fallback.
  'resend', 'lob', 'google_places', 'twilio',
]);

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
    const { action, provider, token, accountLabel, meta } = (await req.json().catch(() => ({}))) as {
      action?: string; provider?: string; token?: string; accountLabel?: string;
      meta?: { from_number?: string };
    };

    // Which service keys the PLATFORM has configured — booleans only, values never leave the server.
    // The hub uses this to say "running on the platform key" honestly instead of guessing.
    if (action === 'status') {
      const has = (n: string) => !!Deno.env.get(n)?.trim();
      return json({ platform: {
        resend: has('RESEND_API_KEY'),
        lob: has('LOB_API_KEY'),
        google_places: has('GOOGLE_PLACES_API_KEY'),
        twilio: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_FROM_NUMBER'),
        anthropic: has('ANTHROPIC_API_KEY'),
        stripe: has('STRIPE_SECRET_KEY'),
      } });
    }

    if (action === 'list') {
      const { data } = await admin.from('provider_connections')
        .select('provider, account_label, expires_at').eq('user_id', user.id);
      return json({ connections: (data ?? []).map((c) => ({ provider: c.provider, accountLabel: c.account_label, connected: true, expiresAt: c.expires_at })) });
    }

    if (!provider || !PROVIDERS.has(provider)) return json({ error: 'A valid provider is required.' }, 400);

    if (action === 'disconnect') {
      await admin.from('provider_connections').delete().eq('user_id', user.id).eq('provider', provider);
      return json({ ok: true });
    }

    if (action === 'test') {
      const conn = await getConnection(admin, user.id, provider);
      if (!conn?.access_token) return json({ ok: false, error: 'Not connected.' });
      const probe = await probeProvider(provider, conn.access_token);
      return json({ ok: probe.ok, label: probe.label, error: probe.error });
    }

    if (action === 'connect') {
      if (!token || !token.trim()) return json({ error: 'A token is required to connect.' }, 400);
      const probe = await probeProvider(provider, token.trim());
      if (!probe.ok) return json({ error: `Could not verify ${provider} token: ${probe.error ?? 'rejected'}` }, 400);
      // Twilio carries one extra fact — the sending number. Only that key is accepted, validated
      // to phone shape, and it lands in metadata (send-sms/garvis-line read it per-user).
      let metadata: Record<string, unknown> | undefined;
      if (provider === 'twilio' && meta?.from_number) {
        const from = meta.from_number.trim();
        if (!/^\+?[0-9][0-9 ().-]{6,18}$/.test(from)) return json({ error: 'The from number must be a phone number (E.164 like +15551234567 works best).' }, 400);
        metadata = { from_number: from };
      }
      await upsertConnection(admin, user.id, provider, {
        access_token: token.trim(), account_label: accountLabel ?? probe.label ?? null,
        ...(metadata ? { metadata } : {}),
      });
      return json({ ok: true, label: probe.label });
    }

    return json({ error: `Unknown action "${action}".` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
