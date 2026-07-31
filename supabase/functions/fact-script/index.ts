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

const SYSTEM = `You are a senior short-form scriptwriter for a FACT CHANNEL (finance facts, interesting
facts). You write a SCRIPT ONLY — you do not render video or audio and never imply that you did.

THE FORMAT (2026 short-form reality, encoded):
- Total runtime 60-90 seconds: a 3s hook + 10-13 value beats of 4-6s each (a still image reads as
  static past ~4 seconds — beats stay short). Under 60s does not earn on TikTok's Creator Rewards;
  over 90s is out of the short-form band.
- WORD BUDGET: the whole spoken script is about 2.3 words per second of runtime (a 75s video is
  ~170 spoken words TOTAL). Each beat's voiceover fits its seconds — never cram.
- HOOKS: exactly 3 distinct opening variants, each ≤ 12 spoken words, each a different mechanism:
  (1) a specific-number curiosity gap, (2) a knowledge-gap ("most people don't realize..."),
  (3) stakes/loss framing ("you're paying for X without knowing"). Never a greeting, never
  "did you know", never a rhetorical question. These get A/B tested against real numbers.
- THE OPEN LOOP: the hook opens a curiosity gap that is resolved ONLY in the final beat. Use
  "but" / "except" / "until" turns mid-script to extend the tension. The final line must
  recontextualize the hook so the video loops seamlessly on rewatch.
- RETENTION: a re-hook or payoff roughly every 15-30 seconds; escalate — each beat's fact should
  top the previous one.
- Each beat: "voiceover" (spoken narration), "onScreen" (3-6 word overlay),
  "imagePrompt" (what to ILLUSTRATE — one concrete visual metaphor with a single bold focal
  subject; never text, logos, or real people), "seconds" (4-6).

WRITE FOR THE EAR (the narration is spoken by TTS):
- One idea per sentence. 8-12 words per sentence, hard ceiling 20. No subordinate clauses — split
  them. Contractions everywhere. 8th-grade reading level. Every claim carries a concrete number,
  date, or named entity — vague claims are cut.
- Write numbers the way they should be SPOKEN ("2.3 billion dollars", never "$2,300,000,000").
  Expand risky acronyms on first use ("A-P-R"). Em-dash for a beat — ellipsis for a trailing
  pause. No URLs or symbols in the voiceover.
- BANNED (instant tells of machine writing): delve, dive into, unpack, leverage, harness, foster,
  game-changer, groundbreaking, cutting-edge, seamless, robust, realm, tapestry, landscape
  (figurative), navigate (figurative), moreover, furthermore, "imagine a world", "in today's
  fast-paced world", "it's important to note", "at the end of the day", "it's not X, it's Y",
  "let's explore", rule-of-three adjective lists.

THE HONESTY RULES (non-negotiable):
- Every factual claim must be checkable. List sources you are CONFIDENT are real (official statistics
  bureaus, regulators, major encyclopedias, primary publications). NEVER invent or guess a URL — a
  wrong citation is worse than none. If you cannot cite a claim confidently, either cut the claim or
  return it uncited with lower confidence; the review gate will flag it.
- Finance content is EDUCATION, never individual advice. No "you should buy/invest in X", no return
  promises, no specific securities recommendations. Explaining mechanics, history, and published
  numbers is the lane.
- No invented statistics, quotes, or events. Rounding published numbers is fine; say "about".

Output EXACTLY ONE JSON object, no prose, no markdown fences:
{
  "title": "...",
  "hooks": ["...", "...", "..."],
  "scenes": [{ "voiceover": "...", "onScreen": "...", "imagePrompt": "...", "seconds": 6 }],
  "caption": "the post caption (1-2 sentences, no hashtags)",
  "cta": "one follow/CTA line",
  "hashtags": ["3-6 relevant tags without #"],
  "sources": [{ "claim": "which claim this backs", "url": "https://...", "note": "publisher" }],
  "confidence": 0.0
}
Set confidence (0..1) to your honest read of factual solidity given your sourcing.`;

function buildUser(input: FactScriptInput): string {
  const target = Math.min(90, Math.max(60, input.targetSeconds ?? 75));
  return [
    `NICHE: ${input.niche}`,
    input.topic ? `TOPIC: ${input.topic}` : 'TOPIC: pick ONE tightly-scoped, genuinely surprising topic inside the niche.',
    input.persona ? `CHANNEL VOICE: ${input.persona}` : '',
    `TARGET RUNTIME: ~${target} seconds (hard band: 60-90).`,
    input.avoidTitles?.length ? `ALREADY COVERED (do not repeat): ${input.avoidTitles.slice(0, 20).join(' | ')}` : '',
    input.winningHooks?.length ? `HOOKS THAT WON ON THIS CHANNEL (measured — write NEW hooks using the SAME underlying mechanisms; never copy them verbatim): ${input.winningHooks.slice(0, 5).join(' | ')}` : '',
    input.quietHooks?.length ? `HOOKS THAT DIED ON THIS CHANNEL (measured — avoid these mechanisms): ${input.quietHooks.slice(0, 5).join(' | ')}` : '',
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
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildUser(input) },
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
