// Run: npm run verify:veoqa
import { hardenVeoPrompt, VEO_JUDGE_SYSTEM, parseVeoVerdict, passesVeoGate } from './veoQaCore.ts';

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('veoQa.verify');

const hp = hardenVeoPrompt('Water rising through a clear pipe');
check('hardened prompt keeps the subject and bans the failure modes',
  hp.startsWith('Water rising through a clear pipe.') && /no cuts/i.test(hp) && /No people/i.test(hp) && /no on-screen text/i.test(hp));
check('judge system demands strict JSON with every rubric field',
  /subject_match/.test(VEO_JUDGE_SYSTEM) && /no_faces/.test(VEO_JUDGE_SYSTEM) && /loopable/.test(VEO_JUDGE_SYSTEM) && /reads_as_progression/.test(VEO_JUDGE_SYSTEM));

const good = parseVeoVerdict('```json\n{"subject_match":true,"no_text_artifacts":true,"no_faces":true,"single_continuous_shot":true,"loopable":false,"reads_as_progression":true,"overall":8,"reason":"clean fill"}\n```');
check('fenced verdict parses', good.overall === 8 && good.subject_match);
const gate = passesVeoGate(good);
check('a progression clip passes toward SCRUB mode', gate.pass && gate.mode === 'scrub');

const loopy = passesVeoGate({ ...good, reads_as_progression: false, loopable: true });
check('a loopable non-progression clip passes toward LOOP mode', loopy.pass && loopy.mode === 'loop');

check('unparseable reply fails safe', passesVeoGate(parseVeoVerdict('sorry, I cannot')).pass === false);
check('wrong subject is an instant reject even at overall 10',
  !passesVeoGate({ ...good, subject_match: false, overall: 10 }).pass);
check('text artifacts are an instant reject', !passesVeoGate({ ...good, no_text_artifacts: false }).pass);
check('faces are an instant reject', !passesVeoGate({ ...good, no_faces: false }).pass);
check('cuts are an instant reject', !passesVeoGate({ ...good, single_continuous_shot: false }).pass);
check('below the overall floor rejects with the reason named',
  passesVeoGate({ ...good, overall: 5 }).reasons.some((r) => r.includes('below')));
check('neither loopable nor progression rejects',
  !passesVeoGate({ ...good, loopable: false, reads_as_progression: false }).pass);
check('overall clamps to 0-10', parseVeoVerdict('{"overall": 99}').overall === 10);

console.log(`\nveoQa.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} veoQa check(s) failed`);
