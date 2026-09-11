// Run: npx tsx scripts/reviewGate.verify.ts
// Pins the review gate's one promise: it can only ever block on a CONFIRMED high-severity
// finding touching a protected path — and a broken reviewer never blocks anything at all.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTECTED_PATHS, gateVerdict, onProtectedPath } from './reviewGate';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const finding = (over: Record<string, unknown> = {}) => ({
  file: 'supabase/functions/stripe-webhook/index.ts',
  severity: 'high',
  verdict: 'CONFIRMED',
  summary: 'signature check bypassable',
  ...over,
});
const asRaw = (arr: unknown[]): string => JSON.stringify({ findings: arr });

// THE ONE WAY TO FAIL — confirmed, high, on a protected path. All three, or nothing.
{
  const v = gateVerdict(asRaw([finding()]));
  check('CONFIRMED high on a protected path fails the gate', !v.pass);
  check('…the reason names the count', v.reason.includes('1 CONFIRMED high-severity'));
  check('…and the finding rides along for the report', v.blocking.length === 1 && v.blocking[0]!.file.includes('stripe-webhook'));
  const two = gateVerdict(asRaw([finding(), finding({ file: 'supabase/migrations/app_0146_x.sql' })]));
  check('two blocking findings are both counted', !two.pass && two.reason.startsWith('2 '));
}

// EVERYTHING ELSE PASSES — the ~79% adversarial-death rate of unverified findings is the
// whole reason verdicts exist.
{
  check('PLAUSIBLE never blocks, even high on a protected path',
    gateVerdict(asRaw([finding({ verdict: 'PLAUSIBLE' })])).pass);
  check('a missing verdict never blocks (unverified is unverified)',
    gateVerdict(asRaw([finding({ verdict: undefined })])).pass);
  check('normal severity never blocks, even confirmed on the money path',
    gateVerdict(asRaw([finding({ severity: 'normal' })])).pass);
  check('a confirmed high OFF the protected paths never blocks',
    gateVerdict(asRaw([finding({ file: 'src/pages/Home.tsx' })])).pass);
  const clean = gateVerdict(asRaw([]));
  check('no findings passes with a named reason', clean.pass && clean.reason.includes('no confirmed high-severity'));
}

// SAFE-OPEN — a broken reviewer must never block a hotfix, and the pass says why.
{
  const garbage = gateVerdict('the model rambled instead of emitting JSON');
  check('unparseable output passes', garbage.pass);
  check('…with the safe-open reason named', garbage.reason.includes('safe-open'));
  const noArray = gateVerdict('{"summary": "looks fine"}');
  check('JSON without a findings array passes safe-open', noArray.pass && noArray.reason.includes('safe-open'));
  check('a bare top-level array is accepted too', !gateVerdict(JSON.stringify([finding()])).pass);
  check('findings without a file string are ignored, not crashed on',
    gateVerdict(asRaw([{ severity: 'high', verdict: 'CONFIRMED' }, null, 'noise'])).pass);
  check('the empty string passes safe-open', gateVerdict('').pass);
}

// THE PROTECTED PERIMETER — send paths, money, the approval spine, migrations. Prefix
// semantics: 'send-' catches send-email AND send-sms without listing each.
{
  check('send-email is inside', onProtectedPath('supabase/functions/send-email/index.ts'));
  check('send-sms is inside via the same prefix', onProtectedPath('supabase/functions/send-sms/index.ts'));
  check('every migration is inside', onProtectedPath('supabase/migrations/app_0146_anything.sql'));
  check('the payload-hash spine is inside', onProtectedPath('supabase/functions/_shared/payloadHash.ts'));
  check('garvis-line (phone binding) is inside', onProtectedPath('supabase/functions/garvis-line/index.ts'));
  check('a UI page is outside', !onProtectedPath('src/pages/Queue.tsx'));
  check('the pulse (read-only) is outside', !onProtectedPath('supabase/functions/garvis-pulse/index.ts'));
  check('a lookalike prefix does not leak in', !onProtectedPath('supabase/functions-old/send-email/index.ts'));
  check('the list is real paths, not empty', PROTECTED_PATHS.length >= 10 && PROTECTED_PATHS.every((p) => p.length > 0));
}

// ---- textual pins: the wiring stays REPORT-ONLY and the criteria stay pre-registered ----
{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const run = readFileSync(join(root, 'scripts/reviewGateRun.ts'), 'utf8');
  check('the runner enforces only behind the explicit flip flag',
    run.includes("if (!v.pass && process.env.REVIEW_GATE_ENFORCE === '1') process.exit(1)"));
  check('…and names the ledger that governs the flip', run.includes('docs/reviews/ai-review-ledger.md'));

  const ledger = readFileSync(join(root, 'docs/reviews/ai-review-ledger.md'), 'utf8');
  check('the flip criteria are pre-registered: 4 weeks', ledger.includes('≥ 4 weeks'));
  check('…and 60% high-severity precision', ledger.includes('≥ 60% precision'));
  check('…and the ledger says not to move them', ledger.includes('do not move them after'));

  const aiReview = readFileSync(join(root, '.github/workflows/ai-review.yml'), 'utf8');
  check('ai-review echoes the gate without ever failing on it', aiReview.includes('reviewGateRun.ts') && /reviewGateRun[^\n]*\n?[^\n]*\|\| true/.test(aiReview));
  check('…and asks the reviewer for the machine-readable block the gate parses', aiReview.includes('```json'));

  const sec = readFileSync(join(root, '.github/workflows/security-review.yml'), 'utf8');
  check('the security lane is same-repo only (fork PRs never reach the key)',
    sec.includes('github.event.pull_request.head.repo.full_name == github.repository'));
  check('…and is comment-only — no step can fail the build on a finding',
    sec.includes('comment-pr: true') && !sec.includes('exit 1'));
}

console.log(`\nreviewGate.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reviewGate check(s) failed`);
