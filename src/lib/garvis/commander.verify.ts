// src/lib/garvis/commander.verify.ts
// Standalone verification of the Commander dispatcher pure helpers (run: `npm run verify:commander`).

import { parseCommand, buildCommanderUser, COMMANDER_SYSTEM } from './commander';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// 1. Reply parse.
const reply = parseCommand('{"kind":"reply","text":"You have 13 apps; only FableForge is active."}');
check('parses a reply', reply.kind === 'reply' && reply.kind === 'reply' && reply.text.includes('13 apps'));

// 2. Mission parse with an app match.
const mission = parseCommand('{"kind":"mission","preface":"On it.","objective":"Grow Theory Thread","subject":"Theory Thread","app":"Theory Thread"}');
check('parses a mission', mission.kind === 'mission');
if (mission.kind === 'mission') {
  check('mission carries objective', mission.objective === 'Grow Theory Thread');
  check('mission carries the matched app', mission.app === 'Theory Thread');
  check('mission has a preface', mission.preface === 'On it.');
}

// 3. External mission (app null).
const ext = parseCommand('{"kind":"mission","preface":"Let\'s help her.","objective":"Market the business","subject":"mom\'s real estate","app":null}');
check('external mission has null app', ext.kind === 'mission' && ext.app === null);
const extStr = parseCommand('{"kind":"mission","objective":"x","subject":"y","app":"null"}');
check('string "null" app is treated as null', extStr.kind === 'mission' && extStr.app === null);

// 4. Mission without an objective falls back to reply (not a malformed mission).
check('mission missing objective => reply', parseCommand('{"kind":"mission","subject":"x"}').kind === 'reply');

// 5. Garbage fails soft into a reply carrying the text.
const garbage = parseCommand('Sure — you have a few options here.');
check('garbage => reply with the text', garbage.kind === 'reply' && garbage.kind === 'reply' && garbage.text.includes('options'));
check('empty => reply with a nudge', parseCommand('').kind === 'reply');

// 6. Prompt builders.
const user = buildCommanderUser('grow Theory Thread', '- Theory Thread (building)\n- FableForge (building)', [{ role: 'user', text: 'hi' }, { role: 'garvis', text: 'hey' }]);
check('user prompt includes the message', user.includes('grow Theory Thread'));
check('user prompt includes the portfolio snapshot', user.includes('Theory Thread (building)'));
check('user prompt includes recent conversation', user.includes('FOUNDER: hi') && user.includes('GARVIS: hey'));
check('system describes the two choices', COMMANDER_SYSTEM.includes('REPLY') && COMMANDER_SYSTEM.includes('MISSION'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} commander check(s) failed`);
