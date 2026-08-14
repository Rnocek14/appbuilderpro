// supabase/functions/_shared/qualityCore.ts
// THE QUALITY BAR — one constant, one rule (verified by src/lib/garvis/quality.verify.ts).
//
// "Nothing automated ships below score ≥ 8" is the platform's level-10 invariant
// (docs/garvis-level-10.md), and until now the 8 lived as a magic literal at its single call
// site — no shared constant, nothing to import, nothing for a second consumer or a scorecard to
// agree with. This is the machine-readable form.
//
// Contract: holdsBar answers "has this piece PROVEN it meets the bar?" — so a missing or
// unparseable score (null/undefined/NaN) is FALSE, never a pass. Automation treats "not proven"
// exactly like "failed": revise or hold, never ship on a shrug.

export const QUALITY_BAR = 8;

export function holdsBar(score: number | null | undefined): boolean {
  return typeof score === 'number' && Number.isFinite(score) && score >= QUALITY_BAR;
}
