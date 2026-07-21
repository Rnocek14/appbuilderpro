// Standalone verification of the human-facing Workshop model.

import { FLAVORS, makeCharter } from './workweb';
import { WORKSHOP_GROUPS, workshopFor, workshopSearchText, workshopState } from './workshops';

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

for (const flavor of FLAVORS) {
  const workshop = workshopFor(makeCharter('studio', flavor));
  check(`${flavor} has a named workshop`, workshop.name.endsWith('Workshop') || workshop.name.endsWith('Lab'));
  check(`${flavor} has one useful outcome`, workshop.outcome.length > 24);
  check(`${flavor} has a three-step rhythm`, workshop.steps.length === 3 && workshop.steps.every(Boolean));
}

check('all four discovery groups exist', new Set(WORKSHOP_GROUPS.map((x) => x.id)).size === 4);
check('archetype fallback works', workshopFor(makeCharter('intel', 'generic')).name === 'Research Workshop');
check('null charter gets a safe working session', workshopFor(null).name === 'Working Session');

check('empty area is honestly ready', workshopState({ earnedArtifacts: 0, pendingApprovals: 0 }).label === 'Ready to start');
check('real artifacts produce an active state', workshopState({ earnedArtifacts: 2, pendingApprovals: 0 }).tone === 'ember');
check('approval takes priority over artifacts', workshopState({ earnedArtifacts: 2, pendingApprovals: 1 }).tone === 'warn');
check('explicit done is respected', workshopState({ earnedArtifacts: 2, pendingApprovals: 0, liveStatus: 'done' }).tone === 'ok');

const social = workshopFor(makeCharter('studio', 'social'));
check('search includes workshop + business + area language',
  workshopSearchText(social, 'Lake Content', 'Mom Real Estate').includes('mom real estate')
  && workshopSearchText(social, 'Lake Content', 'Mom Real Estate').includes('social workshop'));

console.log(`\nworkshops.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} workshop check(s) failed`);
