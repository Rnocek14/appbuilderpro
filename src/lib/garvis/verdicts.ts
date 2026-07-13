// src/lib/garvis/verdicts.ts
// KEPT-VS-REWRITTEN — pure core (verified by verdicts.verify.ts).
//
// The QA audit's sharpest cut: "the ledger learns which drafts you keep vs. rewrite" was promised
// in five places and measured in zero — the one place the product violated its own no-theater law.
// This is the measurement's contract: verdict rows are counted (never inferred), the rate is
// computed only when there's enough signal, and the ledger line states its own basis.

export interface VerdictCounts { kept: number; rewritten: number }

/** Rewrite rate in [0,1], or null when there isn't a single verdict — never a fake 0%. */
export function rewriteRate(c: VerdictCounts): number | null {
  const total = c.kept + c.rewritten;
  if (total === 0) return null;
  return c.rewritten / total;
}

/** The ledger's honest line. Zero verdicts → an invitation, not a statistic. Few verdicts → counts
 *  without a percentage (a rate over 2 drafts is noise wearing precision). Enough → the real rate. */
export function verdictLine(kind: 'assist' | 'deliver', c: VerdictCounts): string {
  const total = c.kept + c.rewritten;
  const thing = kind === 'assist' ? 'repl' : 'document';
  const plural = (n: number) => (kind === 'assist' ? (n === 1 ? 'reply' : 'replies') : (n === 1 ? 'document' : 'documents'));
  void thing;
  if (total === 0) {
    return `No verdicts yet — after you copy a draft, tell the desk whether you sent it as-is or rewrote it, and this ledger fills with real numbers.`;
  }
  const base = `${c.kept} ${plural(c.kept)} kept as-is · ${c.rewritten} rewritten`;
  if (total < 5) return `${base} — counted from your ${total} verdict${total === 1 ? '' : 's'} (rate shown from 5).`;
  const rate = Math.round((rewriteRate(c)! * 100));
  return `${base} — ${rate}% rewrite rate over ${total} verdicts. A high rate means the knowledge base is thin where you work.`;
}
