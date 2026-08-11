// src/lib/garvis/discoverRelevance.ts
// RELEVANCE GATE — pure core (verified by discover.verify.ts). The old gather attached whatever
// page Wikipedia's top hit happened to be — and EVERY file on it — so unrelated photos landed on
// topics regularly. The honesty rule: NO image beats a WRONG image. A resolved page must share a
// significant term with the query; a page file must share one with the query or page title.

const MEDIA_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'at', 'by', 'from', 'how', 'what', 'why', 'does', 'work', 'works', 'about', 'ideas', 'idea']);

/** Significant terms of a phrase/filename: lowercased, punctuation/underscores split, no stopwords. */
export function significantTerms(s: string): string[] {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !MEDIA_STOP.has(w));
}

/** True when candidate shares at least one significant term with the query (prefix-folded, so
 *  brand/branding and lake/lakes match). Empty terms on either side = NOT relevant — honest no. */
export function mediaRelevant(query: string, candidate: string): boolean {
  const q = significantTerms(query);
  const c = significantTerms(candidate);
  if (!q.length || !c.length) return false;
  return q.some((w) => c.some((cw) => cw === w || cw.startsWith(w) || w.startsWith(cw)));
}
