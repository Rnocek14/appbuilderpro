// supabase/functions/cluster-chat/index.ts
// The Cluster Studio chat's reasoning seam (docs/garvis-studios-blueprint.md §11). Mirrors the
// garvis-brain philosophy: this function carries NO state and NO tool execution — it only DECIDES.
// The client compiles the studio context (pure, src/lib/garvis/clusterChat.ts), sends it with the
// message, and executes the returned decision through existing owner-scoped paths (artifacts.ts for
// create/revise, execution.ts enqueueApproval for proposals). Structural safety: the only
// outward-facing verb this can emit is a PROPOSAL into the approval queue — it cannot send.
//
// Provider-agnostic via _shared/ai.ts complete() (anthropic | openai | openrouter | local).
// Credit-metered like explorer-turn: small, frequent calls.
//
// Deploy: npx supabase functions deploy cluster-chat

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, corsHeaders, modelForPlan, type AIMessage } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';

interface ChatRequest {
  system?: string;    // STUDIO_SYSTEM from the client (kept client-side so pure core + prompt live together)
  context?: string;   // compiled studio context (byte-budgeted client-side)
  history?: { role: 'user' | 'garvis'; content: string }[];
  message?: string;
}

const MAX_CONTEXT = 12000;
const MAX_MESSAGE = 4000;

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

    const body = (await req.json().catch(() => ({}))) as ChatRequest;
    const message = (body.message ?? '').trim().slice(0, MAX_MESSAGE);
    if (!message) return json({ error: 'message is required.' }, 400);
    const system = (body.system ?? '').trim().slice(0, MAX_CONTEXT);
    if (!system) return json({ error: 'system is required.' }, 400);
    const context = (body.context ?? '').trim().slice(0, MAX_CONTEXT);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await checkCredits(admin, user.id, 'explore');
    const m = modelForPlan(await getUserPlan(admin, user.id));

    const history = (body.history ?? []).slice(-6)
      .map((t) => `${t.role === 'user' ? 'OWNER' : 'GARVIS'}: ${String(t.content ?? '').slice(0, 300)}`)
      .join('\n');

    const messages: AIMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [context, history && `RECENT CONVERSATION:\n${history}`, `OWNER SAYS: ${message}`, 'Respond with exactly one decision JSON object.']
          .filter(Boolean).join('\n\n'),
      },
    ];

    const r = await complete(messages, { provider: m.provider, model: m.model, maxTokens: 2500 });
    await spendCredits(admin, user.id, {
      costUsd: r.costUsd, kind: 'explore', provider: m.provider, model: m.model,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens,
    });

    // Raw text back — the CLIENT parses with the tolerant pure parser (parseStudioDecision), so the
    // parse rules live in one verified place, not duplicated here.
    return json({ text: r.text, costUsd: r.costUsd });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return json({ error: e.message, remaining: e.remaining }, 402);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
