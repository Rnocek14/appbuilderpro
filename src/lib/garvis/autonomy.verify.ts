// src/lib/garvis/autonomy.verify.ts — the earned-autonomy trust contract (npm run verify:autonomygrants).

import { classifyApproval, computeStreak, eligibleForAuto, MIN_CLEAN_STREAK, AUTONOMY_CLASSES } from './autonomy';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// Classification is from payload MARKERS, never free text.
check('chase_stage marks an invoice chase', classifyApproval('send_email', { chase_stage: 2, message_id: 'm', invoice_id: 'i' }) === 'invoice_chase');
check('sweep marks a reactivation', classifyApproval('send_email', { sweep: 'reactivation', message_id: 'm' }) === 'reactivation');
check('reply_id marks an inbox reply', classifyApproval('send_email', { reply_id: 'r', message_id: 'm', campaign_id: 'c' }) === 'inbox_reply');
check('campaign+message alone marks a followup', classifyApproval('send_email', { campaign_id: 'c', message_id: 'm' }) === 'followup');
check('a COLD pitch (kind marker) never classifies — stays manual forever, no followup streak', classifyApproval('send_email', { campaign_id: 'c', message_id: 'm', kind: 'cold_site_pitch' }) === null);
check('a batch recipient is NOT a followup (one batch approval is its authority)', classifyApproval('send_email', { campaign_id: 'c', message_id: 'm', batch_id: 'b' }) === null);
check('speed-to-lead stays out (its own pre-authorized rule)', classifyApproval('send_email', { standing_rule: 'auto_first_touch', message_id: 'm', campaign_id: 'c' }) === null);
check('non-email kinds never classify', classifyApproval('publish_post', { campaign_id: 'c', message_id: 'm' }) === null);
check('empty payload never classifies', classifyApproval('send_email', null) === null);

// Streaks: consecutive approvals from newest; rejection resets; pendings don't count either way.
check('all approved counts fully', computeStreak([{ status: 'approved' }, { status: 'approved' }, { status: 'approved' }]) === 3);
check('a rejection stops the streak where it happened', computeStreak([{ status: 'approved' }, { status: 'rejected' }, { status: 'approved' }]) === 1);
check('a fresh rejection means zero', computeStreak([{ status: 'rejected' }, { status: 'approved' }]) === 0);
check('pendings are neutral', computeStreak([{ status: 'approved' }, { status: 'pending' }, { status: 'approved' }]) === 2);
check('no history means zero', computeStreak([]) === 0);

// Eligibility: earned, with a real bar.
check(`eligibility starts at ${MIN_CLEAN_STREAK} clean approvals`, !eligibleForAuto(MIN_CLEAN_STREAK - 1) && eligibleForAuto(MIN_CLEAN_STREAK));
check('four classes, no cold-pitch class anywhere', AUTONOMY_CLASSES.length === 4 && !AUTONOMY_CLASSES.some((c) => /pitch|cold/i.test(c.id)));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} autonomy check(s) failed`);
