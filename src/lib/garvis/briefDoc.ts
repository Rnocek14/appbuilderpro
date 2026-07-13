// src/lib/garvis/briefDoc.ts
// BRIEF-THIS-UPLOAD — pure core (no Supabase, no DOM; verified by briefDoc.verify.ts).
//
// The intake gap from the stress test: Garvis could RETRIEVE from documents but couldn't COMPREHEND
// one on demand — "summarize this 40-page PDF", "read this contract and flag the risky clauses" had
// no home. This is the map-reduce brief: the document's own text is split into sections, each
// section is reduced to notes containing ONLY what is written, and the notes compose one grounded
// brief. This module owns the chunking math, the two prompt contracts, the COVERAGE HONESTY (a
// brief that only read part of a long document says exactly how much), and the refusal gate.
//
// The rule that matters: the brief is grounded in the document and nothing else. No outside facts,
// no invented specifics — and when the source text is empty (a scan, a failed extraction), the
// answer is a refusal, not a summary of nothing.

export interface DocBrief {
  brief: string;            // the composed markdown brief ('' when refused)
  coverage: string;         // the honest coverage line ("briefed the whole document" / "first N of M sections")
  refusal: string | null;
  costUsd: number;
}

// cluster-chat caps: context ≤ 12000 chars per call. Chunks and the reduce context both stay under.
export const CHUNK_SIZE = 10_000;
export const CHUNK_OVERLAP = 400;
export const MAX_MAP_CHUNKS = 8;      // ~80k chars ≈ a 40-50 page document fully covered
export const REDUCE_CONTEXT_CAP = 11_500;

// ---------------------------------------------------------------------------
// Chunking — deterministic, overlapping, boundary-aware
// ---------------------------------------------------------------------------

/** Split text into overlapping chunks, preferring to break at a paragraph/sentence boundary near
 *  the cut so a clause is never sliced mid-sentence when a natural break is close. Deterministic. */
export function chunkForBrief(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + size, t.length);
    if (end < t.length) {
      // Look back up to 600 chars for a paragraph break, then a sentence end.
      const window = t.slice(Math.max(start, end - 600), end);
      const para = window.lastIndexOf('\n\n');
      const sent = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
      const cut = para >= 0 ? para : sent >= 0 ? sent + 1 : -1;
      if (cut >= 0) end = Math.max(start, end - 600) + cut + 1;
    }
    chunks.push(t.slice(start, end).trim());
    if (end >= t.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}

// ---------------------------------------------------------------------------
// The two prompt contracts
// ---------------------------------------------------------------------------

export const BRIEF_MAP_SYSTEM = `You are Garvis reading ONE SECTION of the owner's document (in the
context). Reduce it to SECTION NOTES — a tight bullet list of only what is actually written:
- The facts, decisions, and claims the section makes.
- Every specific VERBATIM: names, dates, amounts, percentages, deadlines, durations.
- Any obligation, commitment, penalty, auto-renewal, termination clause, or one-sided term.
Do NOT add outside knowledge, do NOT interpret beyond the text, do NOT invent anything. If the
section is boilerplate with nothing substantive, say "(boilerplate — nothing substantive)".
Plain text bullets only, no markdown fences.`;

export const BRIEF_REDUCE_SYSTEM = `You are Garvis composing a BRIEF of the owner's document from
SECTION NOTES (in the context) that were extracted verbatim from it. Use ONLY those notes — no
outside knowledge, no invented specifics. Output MARKDOWN with exactly these sections, omitting any
that would be empty:
## Summary — 3-5 plain sentences: what this document is and what it does.
## Key points — the substantive facts and decisions, as bullets.
## Specifics on record — names, dates, amounts, deadlines, verbatim, as bullets.
## Watch-outs — obligations, deadlines, penalties, auto-renewals, or one-sided terms the owner
should not miss. ONLY include what the notes actually contain; if there are none, omit the section
entirely — never manufacture risk.
## Open questions — what the document leaves unclear or unanswered.
No preamble, no fences — start at "## Summary".`;

/** The map call's user turn — the chunk rides in the CONTEXT field; this is just the instruction. */
export function buildMapUser(chunkIx: number, totalChunks: number): string {
  return `This is section ${chunkIx + 1} of ${totalChunks}. Extract the section notes now.`;
}

/** Join section notes into the reduce context, capped honestly: if the notes overflow the model's
 *  context budget, later sections are dropped WITH A MARKER — never silently. */
export function buildReduceContext(notes: string[]): { context: string; dropped: number } {
  const parts: string[] = [];
  let used = 0, dropped = 0;
  for (let i = 0; i < notes.length; i++) {
    const block = `--- SECTION ${i + 1} NOTES ---\n${notes[i].trim()}`;
    if (used + block.length + 2 > REDUCE_CONTEXT_CAP) { dropped = notes.length - i; break; }
    parts.push(block); used += block.length + 2;
  }
  if (dropped > 0) parts.push(`--- NOTE: ${dropped} later section(s) did not fit and are NOT reflected below ---`);
  return { context: parts.join('\n\n'), dropped };
}

// ---------------------------------------------------------------------------
// Coverage honesty + the gate
// ---------------------------------------------------------------------------

/** The honest coverage line: exactly how much of the document this brief actually read. */
export function coverageLine(totalChunks: number, mappedChunks: number, droppedNotes: number): string {
  if (mappedChunks >= totalChunks && droppedNotes === 0) return 'Covers the whole document.';
  const read = Math.min(mappedChunks, totalChunks) - droppedNotes;
  return `Covers ${Math.max(1, read)} of ${totalChunks} sections — the rest was not read. Treat this as a partial brief.`;
}

/** Decide whether a brief may stand: no source text → refuse (never summarize nothing); a thin
 *  compose → refuse with the sections shown as the fallback. */
export function decideBrief(input: { sourceLength: number; reply: string; coverage: string; costUsd?: number }): DocBrief {
  const costUsd = input.costUsd ?? 0;
  if (input.sourceLength < 80) {
    return {
      brief: '', coverage: '', costUsd,
      refusal: 'This document has no usable text on record (it may be a scan or an empty extraction) — there is nothing to brief. Re-upload a text version and I\'ll read it.',
    };
  }
  const reply = (input.reply ?? '').trim();
  if (reply.length < 60) {
    return {
      brief: '', coverage: input.coverage, costUsd,
      refusal: 'The brief came back too thin to trust — try again, or open the document\'s stored text directly.',
    };
  }
  return { brief: reply, coverage: input.coverage, refusal: null, costUsd };
}
