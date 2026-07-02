// supabase/functions/ai-gateway/index.ts
// FableForge AI — the managed AI gateway for GENERATED apps. An app's edge functions call this
// with the per-app key (FABLEFORGE_AI_KEY, issued at backend deploy); we run the completion on
// the OPERATOR's key and meter the real cost against the APP OWNER's credit balance. No app-owner
// API keys, no setup — and every generated app's AI usage flows through the platform's credits.
//
// Deploy: npx supabase functions deploy ai-gateway --no-verify-jwt
// (external apps have no FableForge JWT — auth is the per-app gateway key)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, modelForPlan, type AIMessage } from '../_shared/ai.ts';
import { checkCredits, spendCredits, getUserPlan, InsufficientCreditsError } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-fableforge-key',
};

// Small margin on runtime AI (platform operates the key + infra). 1 credit ≈ $0.01.
const MARGIN = Number(Deno.env.get('FF_AI_GATEWAY_MARGIN') ?? '1.25');
const MAX_TOKENS_CAP = 4096;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // Auth: the per-app gateway key (Bearer or x-fableforge-key header).
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const key = req.headers.get('x-fableforge-key')?.trim() || bearer;
    if (!key || key.length < 24) return json({ error: 'Missing FableForge AI key.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: project } = await admin.from('projects')
      .select('id, owner_id').eq('ai_gateway_key', key).single();
    if (!project) return json({ error: 'Invalid FableForge AI key.' }, 401);
    const ownerId = project.owner_id as string;

    const body = (await req.json().catch(() => ({}))) as {
      messages?: { role: string; content: string }[];
      system?: string;
      maxTokens?: number;
      quality?: 'fast' | 'best';
    };
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === 'string') : [];
    if (!messages.length) return json({ error: 'messages is required.' }, 400);
    // Bound the request: last 24 messages, 8k chars each — runtime chat, not bulk processing.
    const bounded = messages.slice(-24).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, 8000),
    }));
    const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 1024, 64), MAX_TOKENS_CAP);

    // Meter against the OWNER's balance (402 if out of credits — the app should surface it).
    await checkCredits(admin, ownerId, 'app_ai');

    // Model by the owner's plan (free stays on the cheap tier); 'fast' forces the cheap tier.
    const plan = await getUserPlan(admin, ownerId);
    const planModel = modelForPlan(body.quality === 'fast' ? 'free' : plan);

    const all: AIMessage[] = [
      ...(body.system ? [{ role: 'system' as const, content: String(body.system).slice(0, 8000) }] : []),
      ...(bounded as AIMessage[]),
    ];
    const result = await complete(all, { provider: planModel.provider, model: planModel.model, maxTokens });

    await spendCredits(admin, ownerId, {
      costUsd: result.costUsd * MARGIN,
      kind: 'app_ai',
      provider: planModel.provider,
      model: planModel.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      projectId: project.id as string,
    });

    return json({ text: result.text, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return json({ error: 'This app is out of AI credits — its owner needs to top up in FableForge.', code: 'out_of_credits' }, 402);
    }
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
