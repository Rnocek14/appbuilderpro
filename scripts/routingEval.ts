// scripts/routingEval.ts
// Pure grader for the LIVE routing eval (verified by orchestratorCases.verify.ts so the contract
// suite and the live eval can never drift). A live compile passes a case when the surviving action
// sequence matches EXACTLY and no forbidden sibling appears anywhere in it. Holes/question minimums
// are contract-suite concerns — live grading judges ROUTING, the thing that failed on 2026-08-18.

export interface GradeInput {
  actions: string[];
  forbid?: string[];
}

export interface GradeResult { pass: boolean; reason: string }

export function gradeRouting(c: GradeInput, got: string[]): GradeResult {
  const forbiddenHit = (c.forbid ?? []).filter((f) => got.includes(f));
  if (forbiddenHit.length) {
    return { pass: false, reason: `chose forbidden sibling [${forbiddenHit.join(', ')}] — got [${got.join(', ')}]` };
  }
  if (got.join(',') !== c.actions.join(',')) {
    return { pass: false, reason: `expected [${c.actions.join(', ')}], got [${got.join(', ')}]` };
  }
  return { pass: true, reason: 'routed as pinned' };
}
