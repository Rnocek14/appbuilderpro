// src/lib/garvis/readiness.verify.ts — proof the operator console tells the truth about setup state.
// Run: npx tsx src/lib/garvis/readiness.verify.ts

import { computeReadiness, GROUP_LABEL, type ReadinessState } from './readiness';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const EMPTY: ReadinessState = {
  clock: 'never', worldCount: 0, brandPresent: false, brandHasCompliance: false, brandHasLook: false,
  emailFrom: false, emailAddress: false, emailEnabled: false, contactsCount: 0,
  docusignConnected: false, mlsConnected: false,
};
const READY: ReadinessState = {
  clock: 'alive', worldCount: 1, brandPresent: true, brandHasCompliance: true, brandHasLook: true,
  emailFrom: true, emailAddress: true, emailEnabled: true, contactsCount: 240,
  docusignConnected: true, mlsConnected: true,
};

// --- nothing set up ------------------------------------------------------------------------------
const a = computeReadiness(EMPTY);
check('a blank account is NOT ready', a.coreReady === false && a.coreDone === 0);
check('headline states how many essentials remain', a.headline.includes(`0 of ${a.coreTotal}`));
check('every core step is a to-do (no false green)', a.steps.filter((s) => s.group === 'core').every((s) => s.status !== 'done'));
check('email with no account reads as needs_account, not todo',
  a.steps.find((s) => s.id === 'email')?.status === 'needs_account');
check('docusign with no account is needs_account', a.steps.find((s) => s.id === 'docusign')?.status === 'needs_account');
check('MLS is optional, never blocks', a.steps.find((s) => s.id === 'mls')?.group === 'optional'
  && a.steps.find((s) => s.id === 'mls')?.status === 'optional_todo');

// --- fully set up --------------------------------------------------------------------------------
const b = computeReadiness(READY);
check('a fully-set-up account IS ready', b.coreReady === true && b.coreDone === b.coreTotal);
check('headline says ready', b.headline === 'Ready to operate her business.');
check('contacts step shows the real count', b.steps.find((s) => s.id === 'contacts')?.detail.includes('240') === true);
check('MLS connected reads optional_done', b.steps.find((s) => s.id === 'mls')?.status === 'optional_done');

// --- honest partials -----------------------------------------------------------------------------
const noCompliance = computeReadiness({ ...READY, brandHasCompliance: false });
check('brand without a compliance line is NOT done, and says why',
  noCompliance.steps.find((s) => s.id === 'brand')?.status === 'todo'
  && (noCompliance.steps.find((s) => s.id === 'brand')?.detail.includes('compliance line') ?? false));
check('a missing compliance line drops core-ready', noCompliance.coreReady === false);

const staleClock = computeReadiness({ ...READY, clock: 'stale' });
check('a stale clock is not done and points at Health',
  staleClock.steps.find((s) => s.id === 'clock')?.status === 'todo'
  && staleClock.steps.find((s) => s.id === 'clock')?.href === '/garvis/health');

const emailSetOff = computeReadiness({ ...READY, emailEnabled: false });
check('email configured but switched off: core email done, sending step is a todo',
  emailSetOff.steps.find((s) => s.id === 'email')?.status === 'done'
  && emailSetOff.steps.find((s) => s.id === 'email_on')?.status === 'todo');
check('the kill switch being off does NOT block core-ready (email is configured)', emailSetOff.coreReady === true);

const worldButNoContacts = computeReadiness({ ...EMPTY, worldCount: 1, clock: 'alive' });
check('world created flips that step, contacts still a todo',
  worldButNoContacts.steps.find((s) => s.id === 'world')?.status === 'done'
  && worldButNoContacts.steps.find((s) => s.id === 'contacts')?.status === 'todo');

// --- structure -----------------------------------------------------------------------------------
check('every step has an action + a real href', a.steps.every((s) => s.action.length > 0 && s.href.startsWith('/')));
check('group labels cover every group used', a.steps.every((s) => !!GROUP_LABEL[s.group]));
check('deterministic', JSON.stringify(computeReadiness(READY)) === JSON.stringify(computeReadiness(READY)));

console.log(`\nreadiness.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
