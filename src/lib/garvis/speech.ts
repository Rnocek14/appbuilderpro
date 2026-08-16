// src/lib/garvis/speech.ts
// SPEAK-WHILE-THINKING — pure core (verified by speech.verify.ts). SW8.4: a spoken answer
// starts at the FIRST sentence's latency, not the whole paragraph's. chunkForSpeech splits a
// reply into orderable sentence chunks under the speak seam's cap (tiny sentences merge with a
// neighbor; an endless sentence hard-wraps at a space); the generation-token contract
// (staleAfter) is how a stale fetch is guaranteed to never play over a newer turn — the
// impure queue (speakRun) bumps the generation, every async closure carries its token, and
// anything stale unwinds silently.

export const SPEAK_CHUNK_CAP = 280;   // under the seam's own 300-char line cap, with headroom
export const SPEAK_MAX_CHUNKS = 6;    // a spoken answer ends; the full text is on screen
const MERGE_UNDER = 20;               // "Right." rides with its neighbor; real sentences stand alone

export function chunkForSpeech(text: string, cap = SPEAK_CHUNK_CAP, maxChunks = SPEAK_MAX_CHUNKS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const chunks: string[] = [];
  for (const s of sentences) {
    let rest = s.trim();
    // An endless sentence hard-wraps at the last space before the cap — never mid-word.
    while (rest.length > cap) {
      const cut = rest.lastIndexOf(' ', cap);
      const at = cut > 0 ? cut : cap;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (!rest) continue;
    const prev = chunks[chunks.length - 1];
    // Tiny sentences merge with their neighbor (either direction) when the pair still fits —
    // fewer fetches, same words. Real sentences stand alone so the first chunk starts fast.
    if (prev !== undefined && (rest.length < MERGE_UNDER || prev.length < MERGE_UNDER) && prev.length + rest.length + 1 <= cap) {
      chunks[chunks.length - 1] = `${prev} ${rest}`;
    } else {
      chunks.push(rest);
    }
  }
  return chunks.slice(0, maxChunks);
}

/** The generation-token contract: a fetch started under `token` may act only while `current`
 *  still equals it. Any bump (a new turn, a barge-in) makes every in-flight token stale. */
export function staleAfter(token: number, current: number): boolean {
  return token !== current;
}
