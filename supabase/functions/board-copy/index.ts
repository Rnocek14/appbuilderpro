// supabase/functions/board-copy/index.ts
// THE BOARD-COPY SEAM — the one LLM call behind every creative board's words. Before this, the boards'
// prompt boxes were placebos: generate() returned canned templates and a "rendition" was a regex. This
// turns a typed idea ("lakefront open house with free kayak rides") or a rendition instruction ("make
// it punchier, mention the school district") into REAL copy — under the same honesty rules the
// deterministic templates keep:
//   • Use ONLY the facts provided in `materials` — never invent an address, price, stat, or claim.
//   • Anything unknown stays a visible [EDIT: …] hole, exactly as passed in or newly created.
//   • Merge fields like {{first_name}} are preserved verbatim, never filled with a guessed name.
//   • This seam writes WORDS only — imagery/photo rules (listing kinds need a real photo) live in the
//     image seam and are untouched here.
// Degrades honestly: no provider key → { available:false } and the boards keep their deterministic
// templates. Credit-gated per call like every paid seam.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, modelForPlan, getProviderConfig } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KEY_FOR: Record<string, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY', local: null,
};

const FIELDS: Record<string, string> = {
  postcard: '{"headline": string (<=48 chars, the front of a printed postcard), "sub": string (<=90 chars supporting line), "body": string (2-4 short sentences for the back), "cta": string (<=60 chars call to action)}',
  social: '{"caption": string (platform-appropriate post text, line breaks allowed), "hashtags": string[] (3-6, no # prefix)}',
  email: '{"subject": string (<=70 chars), "body": string (the full email body, greeting through sign-off, plain text)}',
  idea: '{"title": string (<=60 chars, the idea in one line), "pitch": string (2-3 sentences: what it is and why it matters for THIS project), "notes": string (3-5 short lines: first concrete steps, risks, open questions), "tag": string (exactly one of: feature, automation, content, growth, revenue, wild)}',
};

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

    // Honest degrade: no key for the configured provider → the boards keep their templates.
    const envKey = KEY_FOR[getProviderConfig().provider];
    if (envKey && !Deno.env.get(envKey)) return json({ available: false });

    const body = (await req.json().catch(() => ({}))) as {
      channel?: string; mode?: string; platform?: string | null; kindLabel?: string | null;
      instruction?: string; materials?: Record<string, unknown>; current?: Record<string, unknown> | null;
    };
    const channel = String(body.channel ?? '');
    const fields = FIELDS[channel];
    if (!fields) return json({ error: `Unknown channel "${channel}".` }, 400);
    const instruction = String(body.instruction ?? '').trim();
    if (instruction.length < 3) return json({ error: 'An idea or instruction is required.' }, 400);
    const mode = body.mode === 'rendition' ? 'rendition' : 'make';

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try { await checkCredits(admin, user.id, 'board_copy'); }
    catch (e) { if (e instanceof InsufficientCreditsError) return json({ error: e.message }, 402); throw e; }

    const system = [
      'You write marketing copy for a small real business. HONESTY IS ABSOLUTE:',
      '- Use ONLY facts present in the materials JSON. NEVER invent an address, price, name, statistic, market claim, testimonial, or availability.',
      '- If the idea needs a fact you do not have, put a visible hole in its place, formatted exactly like: [EDIT: what goes here].',
      '- Preserve any {{merge_field}} tokens (e.g. {{first_name}}) exactly as-is; never replace them with a guessed value.',
      '- Keep any [EDIT: ...] holes from the current piece that the instruction does not resolve.',
      '- No hype you cannot back ("guaranteed", "#1", invented urgency). Warm, specific, human; match the platform.',
      `Return ONLY strict JSON matching: ${fields} — no markdown fences, no commentary.`,
    ].join('\n');

    const userMsg = [
      `CHANNEL: ${channel}${body.platform ? ` (platform: ${body.platform})` : ''}`,
      `KIND: ${body.kindLabel ?? 'general'}`,
      `MATERIALS (the only facts you may use): ${JSON.stringify(body.materials ?? {})}`,
      body.current ? `CURRENT PIECE (you are revising this): ${JSON.stringify(body.current)}` : '',
      mode === 'rendition'
        ? `INSTRUCTION — change the current piece accordingly, keeping everything it got right: ${instruction}`
        : `THE IDEA — write the piece from it: ${instruction}`,
    ].filter(Boolean).join('\n\n');

    const m = modelForPlan(await getUserPlan(admin, user.id));
    const result = await complete(
      [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      { provider: m.provider, model: m.model, maxTokens: 900 },
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
    } catch {
      return json({ error: 'The model returned something unparseable — try rewording the idea.' }, 502);
    }

    await spendCredits(admin, user.id, {
      costUsd: result.costUsd, kind: 'board_copy', provider: m.provider, model: m.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    });

    return json({ ok: true, fields: parsed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'board-copy failed' }, 500);
  }
});
