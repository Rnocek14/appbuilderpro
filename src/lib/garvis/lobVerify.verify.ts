// Run: npx tsx src/lib/garvis/lobVerify.verify.ts
// The verification rail's contract (SW10.2): Lob answers map honestly (errors never guess), the
// spend button is capped and priced BEFORE it runs, the mail kill switch fails closed, and a
// known-undeliverable household never reaches a mail merge.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapDeliverability, verifyCostLine, VERIFY_RUN_CAP, VERIFY_UNIT_USD } from './lobCore';
import { partitionMailable, type FarmRecipient } from './farm';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// ---- the honest mapping ----
check('deliverable → verified, no caveat', (() => { const m = mapDeliverability('deliverable'); return m.status === 'verified' && m.detail === null; })());
check('deliverable_missing_unit → verified WITH the caveat carried',
  (() => { const m = mapDeliverability('deliverable_missing_unit'); return m.status === 'verified' && !!m.detail?.includes('missing unit'); })());
check("undeliverable → undeliverable, in USPS's words",
  (() => { const m = mapDeliverability('undeliverable'); return m.status === 'undeliverable' && !!m.detail; })());
check('an unrecognized answer is honestly unverified, never guessed',
  mapDeliverability('no_match').status === 'unverified'
  && mapDeliverability(undefined).status === 'unverified'
  && mapDeliverability('').status === 'unverified'
  && mapDeliverability(42).status === 'unverified');

// ---- the priced, capped button ----
check('the cost line prices the run BEFORE it happens', verifyCostLine(40) === `40 lookups × $${VERIFY_UNIT_USD} ≈ $1.00`);
check('singular grammar at one lookup', verifyCostLine(1).startsWith('1 lookup ×'));
check('over the cap, the line says exactly what one run covers',
  verifyCostLine(250).includes(`first ${VERIFY_RUN_CAP} of 250`));
check('nothing to verify, no line', verifyCostLine(0) === '');
check('the cap is real and bounded', VERIFY_RUN_CAP > 0 && VERIFY_RUN_CAP <= 200);

// ---- the merge gate learns the verdicts ----
const recip = (over: Partial<FarmRecipient>): FarmRecipient => ({
  fullName: 'Jane Doe',
  situs: { address1: '123 Main St', city: 'Waukesha', state: 'WI', zip5: '53186' },
  mail: null, isAbsentee: false, householdKey: '123 main st|waukesha|53186', attrs: {},
  ...over,
});
{
  const p = partitionMailable([
    recip({ verifyStatus: 'verified' }),
    recip({ householdKey: 'k2', situs: { address1: '9 Oak St', city: 'Waukesha', state: 'WI', zip5: '53186' }, verifyStatus: 'undeliverable' }),
    recip({ householdKey: 'k3', situs: { address1: '5 Elm St', city: 'Waukesha', state: 'WI', zip5: '53186' } }),
  ], new Set());
  check('undeliverable is suppressed with its reason named',
    p.suppressed.length === 1 && p.suppressed[0].reason.includes('undeliverable'));
  check('verified and unverified both stay mailable (no lookup ≠ evidence against)',
    p.mailable.length === 2);
}

// ---- wiring pins ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const fn = readFileSync(join(root, 'supabase/functions/lob-verify/index.ts'), 'utf8');
const run = readFileSync(join(here, 'farmRun.ts'), 'utf8');
const ui = readFileSync(join(root, 'src/components/garvis/canvas/MarketingCanvas.tsx'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0153_lob_mail.sql'), 'utf8');
{
  check('the function enforces the per-run cap at the QUERY', fn.includes('.limit(VERIFY_RUN_CAP)'));
  check('the mail kill switch fails closed with a named reason',
    fn.includes('!settings?.mail_enabled') && fn.includes('Direct mail is disabled'));
  check('a missing Lob key is a named setup step, never a silent degrade', fn.includes('LOB_API_KEY') && fn.includes('Lob is not connected'));
  check('errors leave rows unverified — only real answers are written',
    /if \(mapping\.status === 'verified' \|\| mapping\.status === 'undeliverable'\) \{[\s\S]{0,400}verify_status: mapping\.status/.test(fn));
  check('lookups are throttled', fn.includes('VERIFY_THROTTLE_MS') && fn.includes('await sleep('));
  check('territory ownership is checked before any spend', fn.includes('terr.owner_id !== user.id'));
  check('mail goes to the owner mailing address when present — that is what gets verified',
    fn.includes('r.mail_address1') && fn.includes('situs_address1'));
  check('the client reads verify_status with the recipients', run.includes("attrs, verify_status'"));
  check('the UI shows the priced line ON the control, before the click', ui.includes('verifyCostLine(vstats.unverified)'));
  check('the UI shows verified/undeliverable/unverified counts',
    ui.includes('verified · ') || ui.includes('vstats.verified.toLocaleString()'));
  check('verify_status defaults unverified in the schema', migration.includes("default 'unverified'"));
  check('the mail kill switch defaults OFF in the schema', migration.includes('mail_enabled boolean not null default false'));
  check('qr_token is unique per piece', migration.includes('create unique index if not exists idx_mail_pieces_qr'));
  check('batches bind an estimated total for the approval ceiling', migration.includes('est_total_usd'));
}

console.log(`\nlobVerify.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} lob verify check(s) failed`);
