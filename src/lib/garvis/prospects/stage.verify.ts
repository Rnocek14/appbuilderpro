// src/lib/garvis/prospects/stage.verify.ts — the Prospects pipeline stage brain (npm run verify:prospectstage).

import { deriveStage, nextAction, stageRollup, canBuildAndSend, signalChips, STAGE_LADDER, STAGE_META } from './stage';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ── ladder + meta ──────────────────────────────────────────────────────────
check('ladder is new→built→pitched→won (skipped is off-ladder)', STAGE_LADDER.join(',') === 'new,built,pitched,won');
check('every stage (incl. skipped) has meta with a next action', (['new', 'built', 'pitched', 'won', 'skipped'] as const).every((s) => !!STAGE_META[s]?.next));

// ── the naming rules ───────────────────────────────────────────────────────
// These stage labels are the words the operator actually reads — on the filter chips, on every row,
// and at the top of the drawer. Two rules, enforced here so a future edit can't quietly regress them:
// no two stages may read the same (a duplicate label is a screen you can't navigate), and no stage may
// be named in house vocabulary the operator never agreed to. "New"/"Built"/"Pitched"/"Won" were all
// three-quarters of the way there — they described the record's column, not what the operator is
// looking at. The bar: a person who has never seen this app can tell the stages apart on sight.
const STAGES = ['new', 'built', 'pitched', 'won', 'skipped'] as const;
const labels = STAGES.map((s) => STAGE_META[s].label);
check('no two stages share a label', new Set(labels.map((l) => l.toLowerCase())).size === labels.length);
const JARGON = /\b(pitch(ed)?|lead|prospect|demo|world|web|rung|stage|status|derive)\b/i;
check('no stage label uses house vocabulary', labels.every((l) => !JARGON.test(l)));
check('every next action uses house-free words too', STAGES.every((s) => !JARGON.test(STAGE_META[s].next)));
check('every next action is a sentence, not a column name', STAGES.every((s) => STAGE_META[s].next.split(/\s+/).length >= 4));

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
check('Not started → build the site + write the email', /build/i.test(nextAction('new')));
check('Paying you → set up their account', /set up/i.test(nextAction('won')));
check('Site built → read it before it goes (never "just send")', /read/i.test(nextAction('built')));

// ── canBuildAndSend ────────────────────────────────────────────────────────
check('there is still something to build for Not started + Site built only', canBuildAndSend('new') && canBuildAndSend('built') && !canBuildAndSend('pitched') && !canBuildAndSend('won') && !canBuildAndSend('skipped'));

// ── stageRollup ────────────────────────────────────────────────────────────
const roll = stageRollup(['new', 'new', 'built', 'pitched', 'won', 'won', 'skipped']);
check('rollup counts each stage', roll.new === 2 && roll.built === 1 && roll.pitched === 1 && roll.won === 2 && roll.skipped === 1);
check('rollup shows an empty stage as 0, never missing', stageRollup(['new']).won === 0);

// ── signal chips ─────────────────────────────────────────────────────────
const none = signalChips({ opened: false, openCount: 0, demoViews: 0, engaged: false, replied: false });
check('no activity → no chips (strip stays quiet)', none.length === 0);
const hot = signalChips({ opened: true, openCount: 3, demoViews: 2, engaged: true, replied: true });
check('they wrote back is first + green', hot[0].label === 'wrote back' && hot[0].tone === 'ok');
check('opened shows the count when >1', hot.some((c) => c.label === 'opened the email 3 times' && c.tone === 'heat'));
check('looked at the site shows the count when >1', hot.some((c) => c.label === 'looked at the site 2 times'));
check('a single open drops the count', signalChips({ opened: true, openCount: 1, demoViews: 1, engaged: false, replied: false }).some((c) => c.label === 'opened the email') );
check('a single site view reads "looked at the site"', signalChips({ opened: false, openCount: 0, demoViews: 1, engaged: false, replied: false })[0].label === 'looked at the site');
// The chips are read at a glance next to a company name — no "×" shorthand, no record vocabulary.
check('no chip uses × shorthand or house vocabulary', hot.every((c) => !/×/.test(c.label) && !JARGON.test(c.label)));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} prospect-stage check(s) failed`);
