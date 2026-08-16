// supabase/functions/_shared/evidenceMatch.ts — THE CITATION MATCHER, pure and verified
// (verify:evidencematch; re-exported client-side as src/lib/garvis/evidenceMatch.ts).
//
// The nightly consolidation asks the model which ACTIVE BELIEFS its events support or
// contradict. The model's word is never enough: a nomination survives only when its belief
// statement matches a real active belief VERBATIM (normalized) and every cited event subject
// matches a real fetched event. Unverifiable citations are DROPPED, never guessed — a belief's
// evidence count moves only on citations a human could re-check against the rows.

export interface EvidenceNomination { belief?: unknown; stance?: unknown; events?: unknown }
export interface BeliefRef { id: string; statement: string }
export interface EventRef { id: string; subject: string | null }
export interface VerifiedLink { beliefId: string; stance: 'supports' | 'contradicts'; eventIds: string[] }

/** Whitespace-collapsed, case-folded equality — verbatim in substance, tolerant only of the
 *  spacing/casing a model plausibly mangles. Anything looser would let paraphrase count. */
export function normalizeCitation(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function verifyNominations(
  noms: EvidenceNomination[], beliefs: BeliefRef[], events: EventRef[], maxLinks = 6,
): VerifiedLink[] {
  const beliefByStatement = new Map(beliefs.map((b) => [normalizeCitation(b.statement), b.id]));
  const eventBySubject = new Map<string, string>();
  for (const e of events) {
    if (e.subject) eventBySubject.set(normalizeCitation(e.subject), e.id);
  }
  const out: VerifiedLink[] = [];
  for (const n of noms) {
    if (out.length >= maxLinks) break;
    const stance = n.stance === 'supports' || n.stance === 'contradicts' ? n.stance : null;
    if (!stance) continue;
    const beliefId = typeof n.belief === 'string' ? beliefByStatement.get(normalizeCitation(n.belief)) : undefined;
    if (!beliefId) continue;                                     // a fabricated belief drops the whole nomination
    const cited = Array.isArray(n.events) ? n.events.filter((x): x is string => typeof x === 'string') : [];
    const eventIds = [...new Set(cited
      .map((s) => eventBySubject.get(normalizeCitation(s)))
      .filter((id): id is string => !!id))];
    if (!eventIds.length) continue;                              // zero verifiable citations → nothing to file
    out.push({ beliefId, stance, eventIds });
  }
  return out;
}
