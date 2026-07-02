// supabase/functions/discover-media/index.ts
// Server-side media discovery for Explorer/spike mode. Holds the Perplexity + Serper keys SERVER-SIDE
// (they must never ship in the browser bundle via VITE_) and meters each call against credits. Thin
// proxy: it forwards the request and returns the provider's raw JSON so the client keeps its existing
// parsing/scoring. Auth-gated + credit-gated like every other AI-spend surface.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError } from '../_shared/credits.ts';

// Flat cost estimates per call (these providers don't return token cost); keeps metering honest-ish.
const PERPLEXITY_COST = 0.006;
const SERPER_COST = 0.002;

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
    try {
      await checkCredits(admin, user.id, 'discover');
    } catch (e) {
      if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402);
      throw e;
    }

    const { provider, topic, path, q } = (await req.json().catch(() => ({}))) as {
      provider?: string; topic?: string; path?: string; q?: string;
    };

    if (provider === 'perplexity') {
      const key = Deno.env.get('PERPLEXITY_API_KEY');
      if (!key) return json({ available: false }); // feature simply off if the operator hasn't set a key
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'sonar', return_images: true, max_tokens: 450,
          messages: [
            { role: 'system', content: 'Explain the topic to a curious mind: a vivid, specific, genuinely interesting 3-5 sentence understanding — the version a brilliant friend would tell you, concrete and a little surprising. No preamble, no headers, no bullet lists — just the explanation.' },
            { role: 'user', content: String(topic ?? '') },
          ],
        }),
      });
      if (!res.ok) return json({ error: `Perplexity ${res.status}` }, 502);
      const data = await res.json();
      await spendCredits(admin, user.id, { costUsd: PERPLEXITY_COST, kind: 'discover', provider: 'perplexity', model: 'sonar' });
      return json({ available: true, data });
    }

    if (provider === 'serper') {
      const key = Deno.env.get('SERPER_API_KEY');
      if (!key) return json({ available: false });
      const safePath = /^[a-z]+$/.test(String(path ?? '')) ? String(path) : 'search';
      const res = await fetch(`https://google.serper.dev/${safePath}`, {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'content-type': 'application/json' },
        body: JSON.stringify({ q: String(q ?? '') }),
      });
      if (!res.ok) return json({ error: `Serper ${res.status}` }, 502);
      const data = await res.json();
      await spendCredits(admin, user.id, { costUsd: SERPER_COST, kind: 'discover', provider: 'serper', model: safePath });
      return json({ available: true, data });
    }

    return json({ error: 'Unknown provider.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
