// supabase/functions/agent-turn/index.ts
// Thin, authenticated proxy for ONE model call in the client-side agentic build loop. The tool loop
// runs in the browser (read_file/write_file/run_typecheck need the project files + WebContainer), but
// in edge/production mode the Anthropic key must stay server-side — so each model turn is relayed
// through here. It forwards the messages + tools (including Anthropic's server-side web_search) and
// returns the raw Anthropic response for the browser loop to act on.
//
// Requires a signed-in user (so the operator key can't be burned anonymously). Model is operator-set
// (AI_MODEL) — the client never picks the model in edge mode.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, estimateCost, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Auth: only signed-in users may spend the operator key.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set for this deployment.' }, 500);

    // CREDIT GATE — every agentic turn is metered, so a long loop stops when credits run out and a
    // browser can't hammer this proxy for free. Checked per turn (the loop calls this repeatedly).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try {
      await checkCredits(admin, user.id, 'agent');
    } catch (e) {
      if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402);
      throw e;
    }

    const { system, messages, tools, maxTokens, fast } = (await req.json().catch(() => ({}))) as {
      system?: string; messages?: unknown[]; tools?: unknown[]; maxTokens?: number; fast?: boolean;
    };
    if (!Array.isArray(messages) || !messages.length) return json({ error: 'messages[] is required.' }, 400);

    // Free tier runs the cheap model; paid tiers the operator's model. `fast: true` opts a call
    // INTO the cheap tier (design previews, small classifications) — 3-4x faster + cheaper.
    const { model } = modelForPlan(fast ? 'free' : await getUserPlan(admin, user.id));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(Math.max(Number(maxTokens) || 8000, 1024), 16000),
        system: system ?? '',
        tools: Array.isArray(tools) ? tools : [],
        messages,
      }),
    });
    const text = await res.text();
    if (!res.ok) return json({ error: `Anthropic ${res.status}: ${text.slice(0, 400)}` }, 502);

    // Charge the real cost of this turn (tokens include any server-side web_search this turn made).
    try {
      const usage = (JSON.parse(text) as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      const inTok = usage?.input_tokens ?? 0;
      const outTok = usage?.output_tokens ?? 0;
      await spendCredits(admin, user.id, {
        costUsd: estimateCost(model, inTok, outTok), kind: 'agent', provider: 'anthropic', model,
        inputTokens: inTok, outputTokens: outTok,
      });
    } catch { /* never fail a completed turn on a ledger hiccup */ }

    // Pass the raw Anthropic response straight through — the browser loop parses content/stop_reason.
    return new Response(text, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
