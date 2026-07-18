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
// The rubric lives in ONE place now (_shared/copyJudge.ts) so the content-week producer holds the
// same bar as the boards. Extracted verbatim — this function's behavior is unchanged.
import { FIELDS, honestySystemPrompt, judgeSystemPrompt, judgeUserPrompt, parseJudgeVerdict } from '../_shared/copyJudge.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KEY_FOR: Record<string, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY', local: null,
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

    const system = honestySystemPrompt(channel);

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
    const stripFences = (t: string) => t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    let costUsd = 0, inTok = 0, outTok = 0;
    const track = (r: { costUsd: number; inputTokens: number; outputTokens: number }) => {
      costUsd += r.costUsd; inTok += r.inputTokens; outTok += r.outputTokens;
    };

    const draft = await complete(
      [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      { provider: m.provider, model: m.model, maxTokens: 900 },
    );
    track(draft);
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(stripFences(draft.text)); }
    catch { return json({ error: 'The model returned something unparseable — try rewording the idea.' }, 502); }

    // THE QUALITY GATE — an editor in the loop. Every draft is judged against the same craft +
    // honesty rubric a demanding professional would apply; a weak draft gets ONE revision built
    // from the judge's specific notes, and the better of the two ships. The score rides along in
    // the response so automation can hold a bar ("only post >= 8") instead of hoping.
    // Fail-open on judge trouble: a broken judge must never block a good draft.
    const judge = async (piece: Record<string, unknown>): Promise<{ score: number; notes: string } | null> => {
      try {
        const jr = await complete([
          { role: 'system', content: judgeSystemPrompt(channel) },
          { role: 'user', content: judgeUserPrompt(body.materials, instruction, piece) },
        ], { provider: m.provider, model: m.model, maxTokens: 300 });
        track(jr);
        return parseJudgeVerdict(jr.text);
      } catch { return null; }
    };

    let quality = await judge(parsed);
    if (quality && quality.score < 8) {
      try {
        const rev = await complete([
          { role: 'system', content: system },
          { role: 'user', content: `${userMsg}\n\nYOUR FIRST DRAFT: ${JSON.stringify(parsed)}\n\nA professional editor's notes on it: ${quality.notes}\n\nRewrite the piece fixing exactly those notes. Keep every honesty rule: facts from MATERIALS only, [EDIT: …] holes for unknowns, merge fields untouched. Return ONLY the strict JSON.` },
        ], { provider: m.provider, model: m.model, maxTokens: 900 });
        track(rev);
        const revised = JSON.parse(stripFences(rev.text)) as Record<string, unknown>;
        const q2 = await judge(revised);
        if (q2 && q2.score > quality.score) { parsed = revised; quality = q2; }
      } catch { /* keep the first draft — a failed revision never blocks */ }
    }

    await spendCredits(admin, user.id, {
      costUsd, kind: 'board_copy', provider: m.provider, model: m.model,
      inputTokens: inTok, outputTokens: outTok,
    });

    return json({ ok: true, fields: parsed, quality });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'board-copy failed' }, 500);
  }
});
