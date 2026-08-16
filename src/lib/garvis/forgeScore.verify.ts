// Run: npx tsx src/lib/garvis/forgeScore.verify.ts
// Pins the scorecard's strict definitions: first-forge means compiled AND route-walked clean,
// coverage means the gate actually ran, orphans are flagged by id, and a fresh account shows
// honest zeroes — never a fake percent.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRuns, firstForgeSuccess, forgeScore, gateRan, type GenerationIn } from './forgeScore';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const gen = (over: Partial<GenerationIn>): GenerationIn => ({
  kind: 'create', status: 'succeeded',
  stages: [{ stage: 'validate', status: 'done', note: 'verified — compiles clean' }],
  summary: 'Built it.\nRoute walk: 4 routes rendered clean.', ...over,
});

// FIRST-FORGE — both halves required, strictly.
{
  check('compiled clean + clean route walk on a succeeded create = first-forge', firstForgeSuccess(gen({})));
  check('a compile that never ran is NOT first-forge',
    !firstForgeSuccess(gen({ stages: [{ stage: 'validate', status: 'done', note: 'static checks only' }] })));
  check('static issues at validate are NOT first-forge',
    !firstForgeSuccess(gen({ stages: [{ stage: 'validate', status: 'done', note: '3 issue(s) found' }] })));
  check('a broken route walk is NOT first-forge', !firstForgeSuccess(gen({ summary: 'Route walk: 1 of 4 routes broken.' })));
  check('an UNKNOWN route walk is NOT first-forge (strict on purpose)', !firstForgeSuccess(gen({ summary: 'Built it.' })));
  check('an unwalked route report is NOT first-forge', !firstForgeSuccess(gen({ summary: 'Route walk: Routes unwalked — no preview.' })));
  check('edits never count as forges', !firstForgeSuccess(gen({ kind: 'edit' })));
  check('a failed generation never counts', !firstForgeSuccess(gen({ status: 'failed' })));
}

// COVERAGE — verified means the gate RAN, clean or not.
{
  check('compiled clean counts as verified', gateRan(gen({})));
  check('compile FAILED also counts as verified (the gate ran and said so)',
    gateRan(gen({ stages: [{ stage: 'validate', status: 'done', note: 'compile failed — 3 type error(s)' }] })));
  check('static-only does not', !gateRan(gen({ stages: [{ stage: 'validate', status: 'done', note: 'static checks only' }] })));
}

// THE REDUCER — honest zeroes on a fresh account.
{
  const empty = forgeScore([]);
  check('a fresh account shows zero forges and NULL rates — never a fake percent',
    empty.forges === 0 && empty.firstTryRate === null && empty.coverage === null);
  const s = forgeScore([gen({}), gen({ summary: 'Route walk: 1 broken.' }), gen({ kind: 'edit' }), gen({ status: 'running' })]);
  check('running generations are not judged; edits are excluded', s.forges === 2);
  check('the rate reduces from the strict definition', s.firstTry === 1 && s.firstTryRate === 0.5);
}

// THE ORPHAN AUDIT — the approval spine's accounting identity, checked.
{
  const audit = auditRuns([
    { id: 'r1', connector: 'resend', status: 'ok', approval_id: 'a1' },
    { id: 'r2', connector: 'resend', status: 'ok', approval_id: null },
    { id: 'r3', connector: 'garvis', status: 'skipped', approval_id: null },
    { id: 'r4', connector: 'netlify', status: 'failed', approval_id: null },
  ]);
  check('a seeded orphan row is FLAGGED by id', audit.orphans.includes('r2') && audit.orphans.includes('r4'));
  check('decision records (connector garvis) are not external actions', !audit.orphans.includes('r3'));
  check('the external count is real rows only', audit.external === 3);
  check('a clean ledger audits clean', auditRuns([{ id: 'r1', connector: 'resend', status: 'ok', approval_id: 'a1' }]).orphans.length === 0);
}

// ---- the surface (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const health = readFileSync(join(here, '../../pages/Health.tsx'), 'utf8');
const run = readFileSync(join(here, 'forgeScoreRun.ts'), 'utf8');
{
  check('Health renders the scorecard with honest empty states',
    health.includes('<ScorecardCard />') && health.includes('no forges yet'));
  check('orphans render as a warning naming ids, never averaged away',
    health.includes('trace to NO approval') && health.includes('l.orphans.slice(0, 3)'));
  check('every probe is fail-soft (null section, never a fake zero)',
    run.includes('() => null') && health.includes('probe failed'));
  check('unattended actions count only autonomy-grant decisions',
    run.includes(".eq('decided_via', 'autonomy_grant')"));
}

console.log(`\nforgeScore.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} forge score check(s) failed`);
