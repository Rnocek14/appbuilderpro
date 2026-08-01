// supabase/functions/fact-script/index.ts
// THE FACT-CHANNEL SCRIPTWRITER — drafts a cited 60-90s fact-video script for a growth channel:
// hook variants (the A/B seam), timed value beats with illustration prompts, a caption/CTA, and
// SOURCES. Script only — it renders nothing, posts nothing (garvis-short-script's honest boundary).
// The client validates + normalizes the result through the ONE pure core
// (src/lib/garvis/factChannel.ts parseFactScript) — a script with no real sources is flagged
// needs_review there, visibly, and the model is told to NEVER invent a URL.
//
// Provider-agnostic via _shared/ai.ts complete() (AI_PROVIDER / AI_MODEL), like garvis-brain.
// Deploy: npx supabase functions deploy fact-script

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, corsHeaders, parseJson, modelForPlan, type AIMessage } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';
import { FACT_SCRIPT_SYSTEM, buildFactScriptUser } from '../_shared/factScriptCore.ts';

interface FactScriptInput {
  niche: string;            // 'personal finance and money facts'
  topic?: string;           // optional specific topic; absent → the model picks one inside the niche
  persona?: string;         // the channel's voice
  targetSeconds?: number;   // 60-90; default 75
  avoidTitles?: string[];   // recent episode titles — don't repeat them
  // THE LEARNING LOOP feeding back in: hooks that won/died ON THIS CHANNEL (growthLoop.hookIntel).
  winningHooks?: string[];
  quietHooks?: string[];
}


function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try { await checkCredits(admin, user.id, 'short_script'); }
  catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }
  const m = modelForPlan(await getUserPlan(admin, user.id));

  let input: FactScriptInput;
  try { input = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!input?.niche?.trim()) return json({ error: 'niche is required' }, 400);

  const messages: AIMessage[] = [
    { role: 'system', content: FACT_SCRIPT_SYSTEM },
    { role: 'user', content: buildFactScriptUser(input) },
  ];

  let result;
  try { result = await complete(messages, { maxTokens: 3000, provider: m.provider, model: m.model }); }
  catch (e) { return json({ error: `model error: ${e instanceof Error ? e.message : String(e)}` }, 502); }
  await spendCredits(admin, user.id, {
    costUsd: result.costUsd, kind: 'short_script', provider: m.provider, model: m.model,
    inputTokens: result.inputTokens, outputTokens: result.outputTokens,
  });

  // The client re-validates through parseFactScript — this just hands the raw JSON over honestly.
  const parsed = parseJson<Record<string, unknown>>(result.text);
  if (!parsed) return json({ ok: false, error: 'The model did not return valid JSON — try again.', raw: result.text.slice(0, 2000) });
  return json({ ok: true, script: parsed, fidelity: 'script_only', costUsd: result.costUsd });
});
