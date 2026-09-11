// Run: npx tsx src/lib/garvis/approvalRisk.verify.ts
// Pins the risk classifier's two laws: MONOTONIC (adding a risk feature never lowers the
// score) and CAN-ONLY-BLOCK (it may take autonomy away, never grant it; absence fails closed).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RISK_HIGH, riskBlocksAutonomy, riskFor, type RiskFacts } from './approvalRisk';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// THE FEATURES — deterministic points, every point with a named reason.
{
  const quiet = riskFor({ kind: 'crm_action' });
  check('a plain record-keeping kind scores zero with zero reasons', quiet.score === 0 && quiet.reasons.length === 0);
  check('send kinds carry base risk (they reach a person)', riskFor({ kind: 'send_email' }).score === 10);
  check('money/infrastructure kinds carry more', riskFor({ kind: 'deploy_backend' }).score === 25);
  check('a large amount is named', riskFor({ kind: 'spend', amountUsd: 750 }).reasons.some((r) => r.includes('$750.00')));
  check('a first-contact recipient is named', riskFor({ kind: 'send_email', recipientKnown: false }).reasons.some((r) => r.includes('never been contacted')));
  check('recipientKnown null adds nothing (not applicable is not a risk)',
    riskFor({ kind: 'send_email', recipientKnown: null }).score === riskFor({ kind: 'send_email' }).score);
  check('off-hours minting is named', riskFor({ kind: 'send_email', mintedHourLocal: 3 }).reasons.some((r) => r.includes('off-hours')));
  check('business hours add nothing', riskFor({ kind: 'send_email', mintedHourLocal: 14 }).score === 10);
  check('a payload far above its class median is named',
    riskFor({ kind: 'send_email', payloadBytes: 50_000, classMedianBytes: 1_000 }).reasons.some((r) => r.includes('far larger')));
  check('the score caps at 100', riskFor({ kind: 'spend', amountUsd: 9_999, recipientKnown: false, mintedHourLocal: 2, payloadBytes: 99_999, classMedianBytes: 100 }).score === 100);
  check('deterministic', JSON.stringify(riskFor({ kind: 'send_email', amountUsd: 120 })) === JSON.stringify(riskFor({ kind: 'send_email', amountUsd: 120 })));
  check('every point carries a reason', riskFor({ kind: 'spend', amountUsd: 750, recipientKnown: false }).reasons.length === 3);
}

// MONOTONICITY — the property, checked across the whole feature grid: layering ANY feature
// onto ANY base never lowers the score. No combination talks the classifier down.
{
  const bases: RiskFacts[] = [
    { kind: 'crm_action' }, { kind: 'send_email' }, { kind: 'spend' },
    { kind: 'send_batch', amountUsd: 120 }, { kind: 'send_email', mintedHourLocal: 2 },
  ];
  const layers: Partial<RiskFacts>[] = [
    { amountUsd: 600 }, { recipientKnown: false }, { mintedHourLocal: 23 },
    { payloadBytes: 40_000, classMedianBytes: 500 },
  ];
  let holds = true;
  for (const b of bases) {
    for (const l of layers) {
      if (riskFor({ ...b, ...l }).score < riskFor(b).score) holds = false;
    }
    // and layering everything at once:
    if (riskFor({ ...b, amountUsd: 600, recipientKnown: false, mintedHourLocal: 23, payloadBytes: 40_000, classMedianBytes: 500 }).score < riskFor(b).score) holds = false;
  }
  check('adding a risk feature NEVER lowers the score (whole grid)', holds);
}

// CAN-ONLY-BLOCK — the acceptance case and the fail-closed default.
{
  check('the threshold is the documented one', RISK_HIGH === 50);
  check('ACCEPTANCE: an auto-mode send to a brand-new recipient is HIGH — stays manual',
    riskBlocksAutonomy(riskFor({ kind: 'send_email', recipientKnown: false })));
  check('a routine known-recipient follow-up is not blocked',
    !riskBlocksAutonomy(riskFor({ kind: 'send_email', recipientKnown: true })));
  check('NO verdict at all blocks (absence fails closed to manual)', riskBlocksAutonomy(null) && riskBlocksAutonomy(undefined));
  check('the boundary is inclusive', riskBlocksAutonomy({ score: RISK_HIGH, reasons: [] }) && !riskBlocksAutonomy({ score: RISK_HIGH - 1, reasons: [] }));
}

// ---- the wiring (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const gate = readFileSync(join(root, 'supabase/functions/_shared/autonomyGate.ts'), 'utf8');
const worker = readFileSync(join(root, 'supabase/functions/standing-worker/index.ts'), 'utf8');
const queue = readFileSync(join(root, 'src/pages/Queue.tsx'), 'utf8');
{
  check('the gate checks risk BEFORE the grant lookup — block first, never grant',
    gate.indexOf('riskBlocksAutonomy(') > 0 && gate.indexOf('riskBlocksAutonomy(') < gate.indexOf("from('autonomy_grants')"));
  check('the gate recomputes from raw facts — it never trusts the stored columns',
    !gate.includes('risk_score'));
  for (const fn of ['outreach-followups', 'inbox-draft', 'invoice-chase', 'outreach-reactivate']) {
    const src = readFileSync(join(root, `supabase/functions/${fn}/index.ts`), 'utf8');
    check(`${fn} supplies its candidate's facts to the gate`, src.includes("{ kind: 'send_email', recipientKnown: true"));
  }
  check('the chase passes its real amount (a big bill stays manual even in auto mode)',
    readFileSync(join(root, 'supabase/functions/invoice-chase/index.ts'), 'utf8').includes('amountUsd: Number(inv.amount_usd)'));
  check('the worker annotates only unscored pending rows, best-effort',
    worker.includes(".eq('status', 'pending').is('risk_score', null)") && worker.includes('the Queue renders without it'));
  check('the Queue chip shows only at HIGH with the reasons named — no other render path exists',
    queue.includes('a.risk_score >= RISK_HIGH') && queue.includes('review closely')
    && [...queue.matchAll(/a\.risk_score/g)].length === 2);
}

console.log(`\napprovalRisk.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} approval risk check(s) failed`);
