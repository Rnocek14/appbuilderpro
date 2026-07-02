// supabase/functions/explorer-turn/index.ts
// The metered chokepoint for EVERY Explorer (Knowledge Universe) model call — overview, currents,
// think-out-loud, mind, bridge, investigate. The Explorer used to call providers browser-direct with
// a user-pasted key; this proxy keeps the operator key server-side, meters each turn against the
// unified credit balance ('explore' kind, small + frequent), and picks the model per plan — exactly
// the agent-turn/chat-edit conventions.
//
// Two shapes, one contract:
//   POST { messages: [{role, content}], maxTokens?, stream?: false }
//     → { text, inputTokens, outputTokens, costUsd }
//   POST { messages: [{role, content}], maxTokens?, stream: true }
//     → SSE: data:{"t":"<delta>"} … data:{"done":true,"inputTokens":…,"outputTokens":…,"costUsd":…}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, completeStream, corsHeaders, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';

const MAX_TOKENS_CAP = 4000; // Explorer calls are small (220–3500); cap hard so a client can't burn big

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Auth: only signed-in users may spend the operator key.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // CREDIT GATE — checked per turn; a long rabbit hole stops cleanly when credits run out.
    try {
      await checkCredits(admin, user.id, 'explore');
    } catch (e) {
      if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402);
      throw e;
    }
    const m = modelForPlan(await getUserPlan(admin, user.id)); // free → cheap model

    const { messages, maxTokens, stream } = (await req.json().catch(() => ({}))) as {
      messages?: { role?: string; content?: string }[]; maxTokens?: number; stream?: boolean;
    };
    if (!Array.isArray(messages) || !messages.length) return json({ error: 'messages[] is required.' }, 400);
    const msgs = messages
      .filter((x) => typeof x?.role === 'string' && typeof x?.content === 'string')
      .map((x) => ({ role: x.role as string, content: x.content as string }));
    if (!msgs.length) return json({ error: 'messages[] is required.' }, 400);
    const max = Math.min(Math.max(Number(maxTokens) || 800, 100), MAX_TOKENS_CAP);

    if (!stream) {
      const r = await complete(msgs, { provider: m.provider, model: m.model, maxTokens: max });
      await spendCredits(admin, user.id, {
        costUsd: r.costUsd, kind: 'explore', provider: m.provider, model: m.model,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens,
      });
      return json({ text: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd });
    }

    // Streaming: deltas as {t}, then a final {done} carrying usage so the client can show cost.
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          const r = await completeStream(
            msgs, { provider: m.provider, model: m.model, maxTokens: max },
            (delta) => send({ t: delta }),
          );
          await spendCredits(admin, user.id, {
            costUsd: r.costUsd, kind: 'explore', provider: m.provider, model: m.model,
            inputTokens: r.inputTokens, outputTokens: r.outputTokens,
          });
          send({ done: true, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd });
        } catch (err) {
          send({ error: err instanceof Error ? err.message.slice(0, 300) : String(err) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(body, {
      headers: { ...corsHeaders, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
