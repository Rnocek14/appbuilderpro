// src/lib/garvis/overnightRead.ts
// THE OVERNIGHT READ — pure core (verified by overnightRead.verify.ts). SW8.2: one metered
// model call per owner-morning, ONLY when real activity exists, producing a 2-3 sentence read
// that CONNECTS the morning brief's facts — never replaces them. The deterministic counts
// remain the spine; this is the "so what" on top, and it is additive and optional by
// construction: a failed synthesis degrades to the deterministic brief, a quiet night makes
// no call at all.
//
// The honesty gate is structural: the read may not contain ANY number that the fact lines
// don't already contain (counts never come from the model), it is capped at three sentences,
// and the house bans (hype, persona, hours-saved) apply verbatim.

export const READ_MAX_SENTENCES = 3;
export const READ_MAX_CHARS = 420;
/** Below this many brief facts there is nothing to connect — no call is made. */
export const READ_MIN_FACTS = 2;

export const READ_SYSTEM = `You write ONE short morning read (2-3 sentences) for a solo operator, connecting the dots
across the facts of their morning brief — what matters most, what relates to what, what to do first.
Rules, non-negotiable:
- Ground every claim in the FACTS provided. Never invent events, causes, or numbers.
- Use NO number that does not appear in the facts verbatim.
- No greetings, no praise, no hype, no talk about yourself. Plain, direct, specific.
- 2-3 sentences, nothing else. No lists, no markdown.`;

export function buildReadUser(factLines: string[], beliefs: string[], openQuestions: string[]): string {
  return [
    `THE MORNING'S FACTS (the only ground truth):\n${factLines.map((l) => `- ${l}`).join('\n')}`,
    beliefs.length ? `ACTIVE BELIEFS (the operator's working theses):\n${beliefs.map((b) => `- ${b}`).join('\n')}` : '',
    openQuestions.length ? `OPEN QUESTIONS:\n${openQuestions.map((q) => `- ${q}`).join('\n')}` : '',
    'Write the 2-3 sentence read now.',
  ].filter(Boolean).join('\n\n');
}

const BANNED = /hours? saved|saved you|productivit|time back|efficien|amazing|incredible|exciting|great news|awesome|\bI've been\b|\bhard at work\b|\bdon't worry\b/i;

/** Accept or reject a candidate read. Rejection reasons are named — a rejected read simply
 *  never ships (the deterministic brief stands alone), it is never "fixed up". */
export function acceptOvernightRead(text: string, factLines: string[]): { ok: true; read: string } | { ok: false; reason: string } {
  const read = text.trim().replace(/\s+/g, ' ');
  if (!read) return { ok: false, reason: 'empty' };
  if (read.length > READ_MAX_CHARS) return { ok: false, reason: 'too long' };
  const sentences = read.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length > READ_MAX_SENTENCES) return { ok: false, reason: `more than ${READ_MAX_SENTENCES} sentences` };
  if (BANNED.test(read)) return { ok: false, reason: 'banned phrasing (hype/persona/hours-saved)' };
  // THE NUMBERS GATE: every digit-run in the read must appear somewhere in the facts. A count
  // the rows never said is a count the model invented — dropped, whole read rejected.
  const facts = factLines.join('\n');
  for (const num of read.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    if (!facts.includes(num)) return { ok: false, reason: `invented number "${num}"` };
  }
  return { ok: true, read };
}
