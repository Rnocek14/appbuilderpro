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

    // CRAFT, per channel — honesty says what not to invent; this says what GOOD looks like. Without
    // it a model writes clean, true, forgettable copy ("honest slop"). Direct-response + platform
    // norms are the difference between template-grade and competitive output.
    const CRAFT: Record<string, string> = {
      postcard: [
        'POSTCARD CRAFT (direct mail, read at arm\'s length in 3 seconds):',
        '- headline: a benefit or curiosity hook, 6 words or fewer — NEVER the business name, never generic ("Just Listed" alone is weaker than what makes THIS one worth a look).',
        '- body: state the concrete offer or the one specific reason to act; short declarative sentences; no throat-clearing.',
        '- cta: ONE specific action ("Text HOME to …", "Scan for your number"), plus a deadline or scarcity ONLY if materials support one.',
        '- Write like a neighbor who knows the market, not a brochure.',
      ].join('\n'),
      social: [
        'SOCIAL CRAFT — write natively for the platform named in the request:',
        '- instagram: the FIRST LINE is a hook that stops the scroll (question, tension, or specific detail) — it shows before the fold. Short lines, line breaks between thoughts, story over announcement, one CTA. Emojis sparingly, where a human would.',
        '- facebook: conversational, first-person, like telling a neighbor; 2-4 short paragraphs; CTA = comment or message.',
        '- linkedin: professional insight voice; the first two lines must earn the "see more" click; no emoji pile, no "DM me".',
        '- x: 280 characters TOTAL including hashtags; punchy, one thought, no hashtag stuffing.',
        '- Vary the opening angle — do not start every post the same way for the same kind.',
      ].join('\n'),
      email: [
        'EMAIL CRAFT (owner-to-person email, not a newsletter blast):',
        '- subject: 45 characters or fewer (mobile truncates); curiosity or specificity, never clickbait you can\'t cash.',
        '- The FIRST SENTENCE doubles as the preview text — make it carry information, not "Hi there!".',
        '- Paragraphs of 1-3 short sentences; scannable; ONE call to action, and a reply ("just reply") beats a link.',
        '- Sound like a person who will actually read the response.',
      ].join('\n'),
      idea: [
        'IDEA CRAFT — specific beats clever:',
        '- Every idea must name a concrete mechanism, user moment, or number drawn from MATERIALS (or an [EDIT] hole asking for exactly the missing number).',
        '- Banned: generic advice verbs ("leverage", "engage", "utilize", "optimize your presence"). If the idea would fit any business, it is wrong.',
        '- notes: first concrete step, the main risk, and a kill criterion (the number that says stop).',
      ].join('\n'),
    };
    const system = [
      'You write marketing copy for a small real business. HONESTY IS ABSOLUTE:',
      '- Use ONLY facts present in the materials JSON. NEVER invent an address, price, name, statistic, market claim, testimonial, or availability.',
      '- If the idea needs a fact you do not have, put a visible hole in its place, formatted exactly like: [EDIT: what goes here].',
      '- Preserve any {{merge_field}} tokens (e.g. {{first_name}}) exactly as-is; never replace them with a guessed value.',
      '- Keep any [EDIT: ...] holes from the current piece that the instruction does not resolve.',
      '- No hype you cannot back ("guaranteed", "#1", invented urgency).',
      '- No market-frequency or scarcity claims ("rare find", "won\'t last", "doesn\'t come up often", "going fast") unless the materials contain inventory, turnover, or days-on-market data that backs them — an urgency instruction is NOT license to invent scarcity.',
      '',
      'VOICE: if MATERIALS.tone is set, it describes this business\'s voice — write EVERY word in that voice. If MATERIALS.audience is set, that is exactly who you are writing to. If MATERIALS.voiceExample is set, it is a real piece the owner approved — match its register without copying it.',
      '',
      CRAFT[channel] ?? '',
      '',
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
          { role: 'system', content: [
            'You are a ruthless marketing editor. Judge the piece against this rubric and return ONLY strict JSON {"score": number 1-10, "notes": string (the 1-3 most important specific fixes, or "ship it")}.',
            'Rubric:',
            '1. HONESTY (hard fail → score <= 3): any fact, stat, market/scarcity claim, or testimonial NOT present in MATERIALS; a filled-in merge field; a removed [EDIT: …] hole that was not resolved by real facts.',
            '2. CRAFT (per the channel rules below): hook strength, specificity, platform-native form, length limits, one clear CTA.',
            '3. VOICE: matches MATERIALS.tone/audience if set; sounds like a person, not a brochure.',
            'Score 9-10 = a working professional would post this as-is. 7-8 = minor polish. <= 6 = needs the fixes in notes.',
            '', CRAFT[channel] ?? '',
          ].join('\n') },
          { role: 'user', content: `MATERIALS: ${JSON.stringify(body.materials ?? {})}\n\nTHE BRIEF: ${instruction}\n\nTHE PIECE: ${JSON.stringify(piece)}` },
        ], { provider: m.provider, model: m.model, maxTokens: 300 });
        track(jr);
        const v = JSON.parse(stripFences(jr.text)) as { score?: number; notes?: string };
        return typeof v.score === 'number' ? { score: Math.max(1, Math.min(10, v.score)), notes: String(v.notes ?? '') } : null;
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
