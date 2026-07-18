// supabase/functions/_shared/copyJudge.ts
// THE EDITOR'S RUBRIC, SHARED — pure prompt-and-parse helpers (no Deno, no Supabase) so the SAME
// honesty rules, craft standards, and judge rubric govern every writer in the system: the boards'
// board-copy seam (fail-OPEN there — a broken judge never blocks a human-reviewed draft) and the
// content-week producer (fail-CLOSED there — an unjudged draft never auto-queues). Extracted
// verbatim from board-copy/index.ts; its behavior is unchanged.

export const FIELDS: Record<string, string> = {
  postcard: '{"headline": string (<=48 chars, the front of a printed postcard), "sub": string (<=90 chars supporting line), "body": string (2-4 short sentences for the back), "cta": string (<=60 chars call to action)}',
  social: '{"caption": string (platform-appropriate post text, line breaks allowed), "hashtags": string[] (3-6, no # prefix)}',
  email: '{"subject": string (<=70 chars), "body": string (the full email body, greeting through sign-off, plain text)}',
  idea: '{"title": string (<=60 chars, the idea in one line), "pitch": string (2-3 sentences: what it is and why it matters for THIS project), "notes": string (3-5 short lines: first concrete steps, risks, open questions), "tag": string (exactly one of: feature, automation, content, growth, revenue, wild)}',
};

// CRAFT, per channel — honesty says what not to invent; this says what GOOD looks like. Without
// it a model writes clean, true, forgettable copy ("honest slop").
export const CRAFT: Record<string, string> = {
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

/** The writer's system prompt: honesty rules + channel craft + strict output contract. */
export function honestySystemPrompt(channel: string): string {
  return [
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
    `Return ONLY strict JSON matching: ${FIELDS[channel] ?? '{}'} — no markdown fences, no commentary.`,
  ].join('\n');
}

/** The judge's system prompt — the ruthless-editor rubric. */
export function judgeSystemPrompt(channel: string): string {
  return [
    'You are a ruthless marketing editor. Judge the piece against this rubric and return ONLY strict JSON {"score": number 1-10, "notes": string (the 1-3 most important specific fixes, or "ship it")}.',
    'Rubric:',
    '1. HONESTY (hard fail → score <= 3): any fact, stat, market/scarcity claim, or testimonial NOT present in MATERIALS; a filled-in merge field; a removed [EDIT: …] hole that was not resolved by real facts.',
    '2. CRAFT (per the channel rules below): hook strength, specificity, platform-native form, length limits, one clear CTA.',
    '3. VOICE: matches MATERIALS.tone/audience if set; sounds like a person, not a brochure.',
    'Score 9-10 = a working professional would post this as-is. 7-8 = minor polish. <= 6 = needs the fixes in notes.',
    '', CRAFT[channel] ?? '',
  ].join('\n');
}

/** The judge's user message. */
export function judgeUserPrompt(materials: unknown, brief: string, piece: unknown): string {
  return `MATERIALS: ${JSON.stringify(materials ?? {})}\n\nTHE BRIEF: ${brief}\n\nTHE PIECE: ${JSON.stringify(piece)}`;
}

export function stripFences(t: string): string {
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

/** Parse a judge response to a clamped verdict, or null when unparseable. */
export function parseJudgeVerdict(raw: string): { score: number; notes: string } | null {
  try {
    const v = JSON.parse(stripFences(raw)) as { score?: number; notes?: string };
    return typeof v.score === 'number'
      ? { score: Math.max(1, Math.min(10, v.score)), notes: String(v.notes ?? '') }
      : null;
  } catch { return null; }
}
