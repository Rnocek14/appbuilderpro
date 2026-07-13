// src/lib/garvis/askCore.ts
// Pure core of Ask Garvis (no Supabase, no DOM; verified by ask.verify.ts): merge and rank the
// hits that hybrid retrieval produces. Kept separate from ask.ts so it can be exercised in
// isolation — the impure retrieval/synthesis lives in ask.ts and imports these.

export interface RawHit { subjectId: string; content: string; similarity: number | null; via: 'vector' | 'lexical'; kind?: 'artifact' | 'document' }

/** Merge two hit lists into one, deduped by subjectId. A subject found BOTH ways keeps the vector
 *  similarity (semantic score is the more trustworthy signal) and is boosted for appearing twice.
 *  Ranked: vector hits by similarity, lexical-only hits after, capped. Pure + deterministic. */
export function mergeHits(vector: RawHit[], lexical: RawHit[], cap = 8): RawHit[] {
  const by = new Map<string, RawHit & { both: boolean }>();
  for (const h of vector) by.set(h.subjectId, { ...h, both: false });
  for (const h of lexical) {
    const ex = by.get(h.subjectId);
    if (ex) ex.both = true;                       // seen by both — strongest signal
    else by.set(h.subjectId, { ...h, both: false });
  }
  const score = (h: RawHit & { both: boolean }): number => {
    const base = h.similarity ?? 0.2;             // lexical-only hits get a modest floor
    return base + (h.both ? 0.25 : 0);
  };
  return [...by.values()]
    .sort((a, b) => score(b) - score(a))
    .slice(0, cap)
    .map(({ both, ...h }) => { void both; return h; });
}
