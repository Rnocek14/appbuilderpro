// src/lib/garvis/prospects/stage.verify.ts — the Prospects pipeline stage brain (npm run verify:prospectstage).

import { deriveStage, nextAction, stageRollup, canBuildAndSend, STAGE_LADDER, STAGE_META } from './stage';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── ladder + meta ──────────────────────────────────────────────────────────
check('ladder is new→built→pitched→won (skipped is off-ladder)', STAGE_LADDER.join(',') === 'new,built,pitched,won');
check('every stage (incl. skipped) has meta with a next action', (['new', 'built', 'pitched', 'won', 'skipped'] as const).every((s) => !!STAGE_META[s]?.next));

// ── deriveStage priority ─────────────────────────────────────────────────
check('a bare new lead is New', deriveStage({ status: 'new' }) === 'new');
check('built + no email (preview) is Built', deriveStage({ status: 'built', previewStatus: 'preview' }) === 'built');
check('built + emailed demo is Pitched', deriveStage({ status: 'built', previewStatus: 'emailed' }) === 'pitched');
check('a published demo reads as Pitched', deriveStage({ status: 'built', previewStatus: 'published' }) === 'pitched');
check('a purchased demo is Won', deriveStage({ status: 'built', previewStatus: 'purchased' }) === 'won');
check('a linked sale is Won even if the demo says emailed', deriveStage({ status: 'built', previewStatus: 'emailed', won: true }) === 'won');
check('WON beats SKIPPED — a skipped lead that later bought is Won', deriveStage({ status: 'skipped', won: true }) === 'won');
check('skipped with no demo + no sale stays Skipped', deriveStage({ status: 'skipped' }) === 'skipped');
check('an explicit skip is final (short of a win) — beats a prior emailed demo', deriveStage({ status: 'skipped', previewStatus: 'emailed' }) === 'skipped');
check('no preview at all + status new is New', deriveStage({ status: 'new', previewStatus: null }) === 'new');

// ── nextAction ─────────────────────────────────────────────────────────────
check('New → build+send action', /build/i.test(nextAction('new')));
check('Won → set up accounts action', /set up/i.test(nextAction('won')));

// ── canBuildAndSend ────────────────────────────────────────────────────────
check('Build & send applies to New and Built only', canBuildAndSend('new') && canBuildAndSend('built') && !canBuildAndSend('pitched') && !canBuildAndSend('won') && !canBuildAndSend('skipped'));

// ── stageRollup ────────────────────────────────────────────────────────────
const roll = stageRollup(['new', 'new', 'built', 'pitched', 'won', 'won', 'skipped']);
check('rollup counts each stage', roll.new === 2 && roll.built === 1 && roll.pitched === 1 && roll.won === 2 && roll.skipped === 1);
check('rollup shows an empty stage as 0, never missing', stageRollup(['new']).won === 0);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} prospect-stage check(s) failed`);
