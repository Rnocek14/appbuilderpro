// supabase/functions/concierge/index.ts
// THE CONCIERGE'S SECOND TIER — the AI fallback behind the corner agent. Tier 1 (the verified
// pure-core matcher) resolves known asks instantly and free; only a MISS reaches here. This
// function classifies the operator's sentence against the task registry the client sends — it
// picks ONE task id, or answers in two sentences when no task fits. It never acts: navigation
// and creation stay client-side behind the same confirmations as tier 1.
//
//   { sentence, tasks: [{ id, label }] } → { available, ok, taskId | null, answer | null }
//   no AI key → { available: false, setup: [...] }   (honest degradation — the dock falls back
//   to its deterministic suggestions, never a fake answer)
//
// Metered as a 'garvis' brain step; runs on the plan's cheap model — this is a router, not an
// essay. Deploy: npx supabase functions deploy concierge

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, modelForPlan, getProviderConfig } from '../_shared/ai.ts';

// The configured provider's key, or null — the honest-degradation check (no shared helper exists).
function providerKey(): string | null {
  const p = getProviderConfig().provider;
  const key = p === 'openai' ? Deno.env.get('OPENAI_API_KEY')
    : p === 'openrouter' ? Deno.env.get('OPENROUTER_API_KEY')
    : p === 'local' ? 'local'
    : Deno.env.get('ANTHROPIC_API_KEY');
  return key?.trim() ? key : null;
}
import { checkCredits, spendCredits, getUserPlan, InsufficientCreditsError } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TASKS = 120;
const MAX_SENTENCE = 400;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    if (!providerKey()) {
      return json({ available: false, setup: ['Set an AI provider key in the edge secrets (see System health) — the concierge falls back to exact matching until then.'] });
    }

    const body = (await req.json().catch(() => ({}))) as {
      sentence?: string; tasks?: { id?: string; label?: string }[];
    };
    const sentence = String(body.sentence ?? '').trim().slice(0, MAX_SENTENCE);
    const tasks = (Array.isArray(body.tasks) ? body.tasks : [])
      .filter((t) => t?.id && t?.label).slice(0, MAX_TASKS) as { id: string; label: string }[];
    if (!sentence || tasks.length === 0) return json({ error: 'sentence and tasks are required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try { await checkCredits(admin, user.id, 'garvis'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    const plan = await getUserPlan(admin, user.id);
    const { provider, model } = modelForPlan(plan === 'pro' ? 'free' : plan); // router work → always the cheap tier
    const list = tasks.map((t) => `${t.id} :: ${t.label}`).join('\n');
    const result = await complete([
      {
        role: 'system',
        content: 'You route an operator\'s sentence to ONE task from the list, by meaning. Reply with STRICT JSON only: {"taskId": "<id>"} when one task clearly fits, or {"taskId": null, "answer": "<at most two short sentences>"} when none does. Never invent task ids. The answer must be honest — if you do not know, say so.',
      },
      { role: 'user', content: `TASKS:\n${list}\n\nSENTENCE: ${sentence}` },
    ], { provider, model, maxTokens: 200 });

    await spendCredits(admin, user.id, {
      costUsd: result.costUsd, kind: 'garvis', provider, model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    });

    // Defensive parse: a malformed reply degrades to "no pick", never a crash or a fake pick.
    let taskId: string | null = null;
    let answer: string | null = null;
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) as { taskId?: unknown; answer?: unknown } : {};
      const id = typeof parsed.taskId === 'string' ? parsed.taskId : null;
      taskId = id && tasks.some((t) => t.id === id) ? id : null;
      answer = typeof parsed.answer === 'string' ? parsed.answer.slice(0, 400) : null;
    } catch { /* no pick */ }

    return json({ available: true, ok: true, taskId, answer });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
