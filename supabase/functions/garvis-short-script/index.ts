// supabase/functions/garvis-short-script/index.ts
// Garvis capability: draft a short-form video SCRIPT. This is a PURE LLM capability that lives in
// Garvis — it does NOT touch Traction Engine, render any video, or publish anything. Its output is
// text only, explicitly marked fidelity: 'script_only' so nothing downstream can mistake it for a
// finished asset. (When real rendering/assets/social accounts are involved, THAT capability will live
// in Traction Engine and Garvis will call it — this is the thin first step.)
//
// Provider-agnostic: reasons via _shared/ai.ts complete() (AI_PROVIDER / AI_MODEL), same as garvis-brain.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, corsHeaders, parseJson, type AIMessage } from '../_shared/ai.ts';

interface ShortScriptInput {
  topic: string;
  audience?: string;
  goal?: string;
  source_material?: string;
  tone?: string;
  platform?: string;
  length?: string;
}

const SYSTEM = `You are a senior short-form video scriptwriter. You produce a SCRIPT ONLY — you do NOT
render video, generate audio, or publish anything, and you must never imply that you did. Write a tight,
platform-aware short script that earns attention in the first 2 seconds and drives the stated goal.

Output EXACTLY ONE JSON object, no prose, no markdown fences:
{
  "hook": "the first line / on-screen opener that stops the scroll",
  "script": "the full spoken/voiceover script, with natural beats",
  "caption": "the post caption with a few relevant hashtags",
  "cta": "the single call to action",
  "visual_beats": ["beat 1", "beat 2", "..."],
  "confidence": 0.0
}
Set confidence (0..1) to your honest read of how well this fits the brief given what you were told.
Ground the script in the provided source material if any; do not invent facts, numbers, or quotes.`;

function buildUser(input: ShortScriptInput): string {
  return [
    `TOPIC: ${input.topic}`,
    input.audience ? `AUDIENCE: ${input.audience}` : '',
    input.goal ? `GOAL: ${input.goal}` : '',
    input.platform ? `PLATFORM: ${input.platform}` : 'PLATFORM: generic short-form (TikTok/Reels/Shorts)',
    input.tone ? `TONE: ${input.tone}` : '',
    input.length ? `TARGET LENGTH: ${input.length}` : 'TARGET LENGTH: ~30s',
    input.source_material ? `SOURCE MATERIAL (ground the script in this):\n${input.source_material}` : '',
    '',
    'Return the single JSON object now.',
  ].filter(Boolean).join('\n');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let input: ShortScriptInput;
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!input?.topic) return json({ error: 'topic is required' }, 400);

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUser(input) },
  ];

  let result;
  try {
    result = await complete(messages, { maxTokens: 1800 });
  } catch (e) {
    return json({ error: `model error: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = parseJson<Record<string, unknown>>(result.text);
  } catch {
    parsed = { script: result.text };
  }

  // Stub-honesty is part of the contract: the server stamps it, and the client re-stamps it too.
  return json({
    hook: parsed.hook ?? '',
    script: parsed.script ?? '',
    caption: parsed.caption ?? '',
    cta: parsed.cta ?? '',
    visual_beats: Array.isArray(parsed.visual_beats) ? parsed.visual_beats : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    fidelity: 'script_only',
    required_approval: true,
    costUsd: result.costUsd,
  });
});
