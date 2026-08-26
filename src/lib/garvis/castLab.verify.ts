// Run: npx tsx src/lib/garvis/castLab.verify.ts
import {
  CHARACTER_STYLE_BLOCK, characterRefPrompts, locationRefPrompts,
  sixShotScene, testCostEstimateUsd, testReadiness, sceneTakes, likenessGate,
} from './castLab';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('castLab.verify');

{ // reference sheets
  const sheet = characterRefPrompts('A woman in her late 20s, shoulder-length dark hair, light freckles.', 'black sweater');
  check('a character sheet is face_front + face_34 + full_body', sheet.map((s) => s.kind).join(',') === 'face_front,face_34,full_body');
  check('the style block repeats VERBATIM across the whole sheet (the set-consistency rule)',
    sheet.every((s) => s.prompt.includes(CHARACTER_STYLE_BLOCK)));
  check('the subject description repeats identically — only the framing line changes',
    sheet.every((s) => s.prompt.includes('The same single person in every image: A woman in her late 20s') && s.prompt.includes('Wearing: black sweater.')));
  check('the guardrails ride every prompt (no text/watermarks/logos)', sheet.every((s) => s.prompt.includes('no watermarks, no logos')));
  const loc = locationRefPrompts('A small apartment living room, couch facing east windows.');
  check('a location sheet is loc_wide + loc_detail with no people', loc.map((s) => s.kind).join(',') === 'loc_wide,loc_detail' && loc.every((s) => s.prompt.includes('no people')));
}

{ // the six-shot test
  const shots = sixShotScene({ id: 'a1', name: 'Sarah' }, { id: 'b1', name: 'Jake' });
  check('six shots, indices 0-5', shots.length === 6 && shots.every((s, i) => s.sceneIndex === i));
  check('the scene alternates single shots and ends on the two-shot',
    shots[0].characterIds.join() === 'a1' && shots[1].characterIds.join() === 'b1' && shots[5].characterIds.join() === 'a1,b1');
  check('exactly two dialogue shots (lipsync is part of the test)', shots.filter((s) => s.dialogue).length === 2);
  check('total runtime lands in the 25-35s band', (() => { const t = shots.reduce((a, s) => a + s.durationS, 0); return t >= 25 && t <= 35; })());
  check('deterministic: same cast, same script', JSON.stringify(shots) === JSON.stringify(sixShotScene({ id: 'a1', name: 'Sarah' }, { id: 'b1', name: 'Jake' })));
  const usd = testCostEstimateUsd();
  check('the cost estimate prices shot 1 full-rate and shots 2-6 on the chained discount (under $5)', usd > 1 && usd < 5);
}

{ // readiness
  const ok = testReadiness(
    [{ id: 'a', name: 'Sarah', approvedKinds: ['face_front', 'full_body'] }, { id: 'b', name: 'Jake', approvedKinds: ['face_front', 'full_body', 'face_34'] }],
    [{ id: 'l', name: 'the apartment', approvedKinds: ['loc_wide'] }]);
  check('two complete characters + a wide location → ready, nothing missing', ok.ready && ok.missing.length === 0);
  const gaps = testReadiness(
    [{ id: 'a', name: 'Sarah', approvedKinds: ['face_front'] }],
    []);
  check('gaps are NAMED, never a dead button', !gaps.ready
    && gaps.missing.some((m) => m.includes('1 more character'))
    && gaps.missing.some((m) => m.includes('full_body for Sarah'))
    && gaps.missing.some((m) => m.includes('a location')));
  const unapproved = testReadiness(
    [{ id: 'a', name: 'Sarah', approvedKinds: ['face_front', 'full_body'] }, { id: 'b', name: 'Jake', approvedKinds: [] }],
    [{ id: 'l', name: 'the apartment', approvedKinds: [] }]);
  check('unapproved references do not count as ready', !unapproved.ready && unapproved.missing.some((m) => m.includes('Jake')) && unapproved.missing.some((m) => m.includes('the apartment')));
}

{ // scene assembly
  const takes = sceneTakes([
    { url: 'https://x/1.mp4', durationS: 5 }, { url: '', durationS: 4 }, { url: 'https://x/3.mp4', durationS: 22 },
  ]);
  check('scene takes carry EXPLICIT lengths (known cut times unlock sound cues)', takes.every((t) => typeof t.lengthS === 'number'));
  check('a clip without a url never enters the timeline', takes.length === 2);
  check('lengths clamp into the renderer band (1-15s)', takes[1].lengthS === 15);
}

{ // the likeness gate
  check('synthetic characters pass unconditionally',
    likenessGate([{ name: 'Sarah', likeness: 'synthetic', consentedAt: null }]).ok);
  const blocked = likenessGate([
    { name: 'Sarah', likeness: 'synthetic', consentedAt: null },
    { name: 'Jake (real)', likeness: 'real', consentedAt: null },
  ]);
  check('a real person without recorded consent blocks generation, by name',
    !blocked.ok && !!blocked.reason && blocked.reason.includes('Jake (real)') && blocked.reason.includes('consent'));
  check('recorded consent opens the gate',
    likenessGate([{ name: 'Jake (real)', likeness: 'real', consentedAt: '2026-08-26T00:00:00Z' }]).ok);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
