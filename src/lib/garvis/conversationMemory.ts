// src/lib/garvis/conversationMemory.ts
// CONVERSATIONAL MEMORY — pure core (verified by conversationMemory.verify.ts). The JARVIS
// trait after speak-first: Tony never repeats himself. "Do that for the pet app" / "again"
// work because the dock remembers the LAST real ask and its SUBJECT (the play's extracted
// marketed-thing, world, niche, or focus) and re-runs the remembered sentence with the
// subject swapped.
//
// Honesty rules:
//   - Conservative matchers: only unmistakable follow-up forms match — anything else falls
//     through to the real tiers untouched.
//   - No guessing: a swap with no remembered subject, or a subject that no longer appears in
//     the remembered sentence, returns null and the dock says so — it never fabricates an ask.

export interface AskMemory {
  /** The last full sentence that resolved somewhere real. */
  sentence: string;
  /** Its extracted subject (from the plan shape), when one exists. */
  subject: string | null;
}

export type FollowupAsk = { kind: 'again' } | { kind: 'swap'; target: string };

/** Detect a follow-up form. Null = not a follow-up (the tiers proceed normally). */
export function parseFollowupAsk(input: string): FollowupAsk | null {
  const t = input.trim().replace(/[.!?]+$/, '');
  if (/^(?:do (?:that|it) again|run (?:that|it) again|again|same again|one more time)$/i.test(t)) return { kind: 'again' };
  const m = /^(?:do (?:that|it|the same)(?: but)? for|make (?:that|it|the same)(?: but)? for|same(?: thing)?(?: but)?(?: now)? for|now do(?: it| that)? for|and(?: also)? for)\s+(.{3,60})$/i.exec(t);
  if (m) {
    const target = m[1]!.trim();
    if (/^(?:me|us|you|now|later|today|tomorrow|that|it|them)$/i.test(target)) return null;
    return { kind: 'swap', target };
  }
  return null;
}

/** Resolve a follow-up against memory into a full sentence to re-run — or null with nothing to
 *  honestly resolve (no memory, no subject, or the subject no longer present verbatim). */
export function applyFollowupAsk(f: FollowupAsk, mem: AskMemory | null): string | null {
  if (!mem?.sentence) return null;
  if (f.kind === 'again') return mem.sentence;
  if (!mem.subject) return null;
  const idx = mem.sentence.toLowerCase().indexOf(mem.subject.toLowerCase());
  if (idx < 0) return null;
  // Article cleanup: "market my <subject>" + target "the pet app" must not become "my the pet
  // app" — when the remembered sentence already carries the article/possessive, drop the
  // target's own leading article.
  let target = f.target;
  if (/\b(?:my|our|the|a|an)\s$/i.test(mem.sentence.slice(0, idx))) {
    target = target.replace(/^(?:the|my|our|a|an)\s+/i, '');
  }
  return mem.sentence.slice(0, idx) + target + mem.sentence.slice(idx + mem.subject.length);
}
