// src/lib/garvis/forgeScore.ts
// THE BUILDER/AUTONOMY SCORECARD — pure core (verified by forgeScore.verify.ts). SW9.4: the
// headline metrics stop being unfalsifiable. Every number here reduces from real rows with a
// strict, stated definition — and a fresh account shows honest zeroes (rates are null, never a
// fake 0% or 100%).
//
//   FIRST-FORGE SUCCESS — a 'create' generation that succeeded, whose validate stage recorded
//   the compiler's own clean label, AND whose summary shows a route walk with nothing broken.
//   Strict on purpose: an unknown route walk does NOT count as success.
//
//   VERIFICATION COVERAGE — the share of finished forges where the compile gate actually RAN
//   (clean or failed, both count as verified); 'static checks only'/'unverified' do not.
//
//   ORPHAN AUDIT — every REAL external execution (a row a connector actually ran) must trace
//   to an approval. A row that doesn't is an orphan, flagged by id — the approval spine's
//   accounting identity, checked instead of assumed.

export interface GenerationIn {
  kind: string;
  status: string;
  stages: { stage: string; status: string; note?: string | null }[];
  summary?: string | null;
}

export interface ForgeScore {
  forges: number;              // finished 'create' generations considered
  firstTry: number;
  firstTryRate: number | null; // null when forges === 0 — never a fake percent
  verified: number;
  coverage: number | null;
}

const CLEAN_LABEL = 'verified — compiles clean';

function validateNote(g: GenerationIn): string {
  return g.stages.find((s) => s.stage === 'validate')?.note ?? '';
}

export function firstForgeSuccess(g: GenerationIn): boolean {
  if (g.kind !== 'create' || g.status !== 'succeeded') return false;
  if (!validateNote(g).includes(CLEAN_LABEL)) return false;
  const summary = g.summary ?? '';
  const walk = /Route walk: ([^\n]*)/.exec(summary)?.[1] ?? '';
  return !!walk && !/broken|unwalked/i.test(walk);
}

export function gateRan(g: GenerationIn): boolean {
  const note = validateNote(g);
  return note.includes(CLEAN_LABEL) || note.includes('compile failed');
}

export function forgeScore(gens: GenerationIn[]): ForgeScore {
  const forges = gens.filter((g) => g.kind === 'create' && ['succeeded', 'failed'].includes(g.status));
  const firstTry = forges.filter(firstForgeSuccess).length;
  const verified = forges.filter(gateRan).length;
  return {
    forges: forges.length,
    firstTry,
    firstTryRate: forges.length ? firstTry / forges.length : null,
    verified,
    coverage: forges.length ? verified / forges.length : null,
  };
}

// ---- the execution-ledger orphan audit ----

export interface RunIn { id: string; connector: string; status: string; approval_id: string | null }

export interface LedgerAudit { external: number; orphans: string[] }

/** connector 'garvis' rows are decision records (skipped/ledger notes), not external actions —
 *  everything else that ran (ok or failed at the provider) is external and must trace. */
export function auditRuns(runs: RunIn[]): LedgerAudit {
  const external = runs.filter((r) => r.connector !== 'garvis' && ['ok', 'failed'].includes(r.status));
  return {
    external: external.length,
    orphans: external.filter((r) => !r.approval_id).map((r) => r.id),
  };
}
