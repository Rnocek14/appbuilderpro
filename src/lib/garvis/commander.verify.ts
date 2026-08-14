// src/lib/garvis/commander.verify.ts
// Standalone verification of the Commander dispatcher pure helpers (run: `npm run verify:commander`).

import { commanderSnag, parseCommand, buildCommanderUser, COMMANDER_SYSTEM, postureOf } from './commander';

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

// ---- commanderSnag: failures speak operator, never plumbing (honesty spine) ----
check('a JS type error becomes "shape I couldn\'t read", never raw plumbing',
  commanderSnag(new TypeError('((intermediate value) ?? []).filter is not a function')).includes("shape I couldn't read"));
check('undefined-property crashes are translated too',
  commanderSnag(new TypeError("Cannot read properties of undefined (reading 'map')")).includes("shape I couldn't read"));
check('network/edge failures name the real fix',
  commanderSnag(new Error('Edge Function returned a non-2xx status code')).includes('is an AI key set'));
check('operator-language messages pass through untouched',
  commanderSnag(new Error('Out of credits for this billing period — top up on Subscription.')) === 'Out of credits for this billing period — top up on Subscription.');
check('non-Error throws never crash the translator', commanderSnag(undefined).length > 0);

// ---- the Intention Router's posture axis (SW4.1): total, tolerant, and defaulted by kind ----
check('a valid model-supplied posture rides through',
  postureOf(parseCommand('{"kind":"reply","text":"Revenue is $4,200.","posture":"observe"}')) === 'observe');
check('a garbage posture is dropped, never trusted',
  postureOf(parseCommand('{"kind":"reply","text":"hi","posture":"panic"}')) === 'think');
check('every kind resolves a posture WITHOUT the model supplying one', ([
  ['{"kind":"reply","text":"hi"}', 'think'],
  ['{"kind":"mission","preface":"p","objective":"o","subject":"s","app":null}', 'execute'],
  ['{"kind":"act","preface":"p","instruction":"i"}', 'execute'],
  ['{"kind":"open","preface":"p","surface":"mailer","world":null}', 'create'],
  ['{"kind":"build","preface":"p","prompt":"x"}', 'create'],
  ['{"kind":"explore","query":"q","preface":"p"}', 'think'],
] as const).every(([raw, want]) => postureOf(parseCommand(raw)) === want));
check('an unparseable reply still has a posture (total)', postureOf(parseCommand('not json at all')) === 'think');
check('the prompt teaches all four postures',
  ['"think"', '"create"', '"execute"', '"observe"'].every((p) => COMMANDER_SYSTEM.includes(p)));
check('every schema line carries the posture field',
  (COMMANDER_SYSTEM.match(/"posture":"…"/g) ?? []).length === 6);
check('a mission keeps its fields alongside the posture', (() => {
  const m = parseCommand('{"kind":"mission","preface":"On it.","objective":"Grow X","subject":"X","app":null,"posture":"execute"}');
  return m.kind === 'mission' && m.objective === 'Grow X' && postureOf(m) === 'execute';
})());

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} commander check(s) failed`);
