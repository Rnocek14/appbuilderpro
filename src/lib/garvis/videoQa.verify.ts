// Run: npx tsx src/lib/garvis/videoQa.verify.ts
import {
  parseObservation, judge, pickBest, buildQaPrompt,
  IDENTITY_ACCEPT, IDENTITY_REJECT, OVERALL_ACCEPT,
  type QaObservation,
} from './videoQa';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('videoQa.verify');

const clean: QaObservation = {
  dimensions: { temporal: 92, motion: 90, fidelity: 91, adherence: 94, cinematic: 88 },
  defects: [], identity: { sarah: 93, jake: 90 }, continuityOk: true, actionOccurred: true, notes: [],
};

{ // parsing untrusted VLM output
  const obs = parseObservation({
    dimensions: { temporal: 120, motion: -5, fidelity: 'x', adherence: 88, cinematic: 70 },
    defects: [{ type: 'identity_drift', severity: 'severe' }, { type: 'made_up_defect', severity: 'severe' }, { type: 'jitter' }],
    identity: { sarah: 101, jake: null }, continuityOk: 'yes', actionOccurred: true, notes: ['a', 1, 'b'],
  });
  check('scores clamp to 0-100 and junk falls to the 50 default', obs.dimensions.temporal === 100 && obs.dimensions.motion === 0 && obs.dimensions.fidelity === 50);
  check('unknown defect types are dropped (allowlist)', obs.defects.length === 2 && !obs.defects.some((d) => (d.type as string) === 'made_up_defect'));
  check('a defect without severity defaults to minor', obs.defects.find((d) => d.type === 'jitter')?.severity === 'minor');
  check('identity clamps; null (no reference) survives as null', obs.identity.sarah === 100 && obs.identity.jake === null);
  check('non-boolean continuity falls to null, notes keep strings only', obs.continuityOk === null && obs.notes.join('') === 'ab');
  check('an empty payload fails toward review, not acceptance', judge(parseObservation({})).decision !== 'accept');
}

{ // the identity gate — the new arm
  check('a clean clip with matched identity accepts', judge(clean).decision === 'accept');
  const recast = judge({ ...clean, identity: { sarah: 93, jake: IDENTITY_REJECT - 5 } });
  check('one broken identity rejects the whole clip (weakest character gates)', recast.decision === 'reject' && recast.identityMin === IDENTITY_REJECT - 5);
  const drift = judge({ ...clean, identity: { sarah: IDENTITY_ACCEPT - 5, jake: 90 } });
  check('identity between floors → human review, never silent acceptance', drift.decision === 'review');
  check('no references supplied → identityMin is null and does not gate', judge({ ...clean, identity: {} }).decision === 'accept');
}

{ // ported deduction math and caps
  const severe = judge({ ...clean, defects: [{ type: 'identity_drift', severity: 'severe' }] });
  check('a severe identity_drift caps temporal at 65 (ported cap)', severe.dimensions.temporal <= 65);
  const wrongSubject = judge({ ...clean, defects: [{ type: 'wrong_subject', severity: 'severe' }] });
  check('a severe wrong_subject caps adherence at 50 (ported cap)', wrongSubject.dimensions.adherence <= 50);
  const twoSevere = judge({ ...clean, defects: [{ type: 'limb_anomaly', severity: 'severe' }, { type: 'morphing', severity: 'severe' }] });
  check('two severe defects reject (ported hard-fail rule)', twoSevere.decision === 'reject');
  const oneSevere = judge({ ...clean, defects: [{ type: 'limb_anomaly', severity: 'severe' }] });
  check('one severe defect → review, not silent acceptance', oneSevere.decision === 'review');
  const minor = judge({ ...clean, defects: [{ type: 'jitter', severity: 'minor' }] });
  check('a minor defect deducts but does not block acceptance', minor.decision === 'accept' && minor.dimensions.motion < clean.dimensions.motion);
}

{ // spectacle tolerance — the genre lane's structural advantage, kept from traction
  const floaty: QaObservation = { ...clean, defects: [{ type: 'floaty_motion', severity: 'severe' }] };
  const drama = judge(floaty);
  const genre = judge(floaty, { spectacle: true });
  check('spectacle mode relaxes the physics cap (60 → 75)', drama.dimensions.motion <= 60 && genre.dimensions.motion > drama.dimensions.motion);
  const driftGenre = judge({ ...clean, defects: [{ type: 'identity_drift', severity: 'severe' }] }, { spectacle: true });
  check('spectacle never excuses identity_drift — the temporal cap still lands', driftGenre.dimensions.temporal <= 70);
}

{ // action + continuity checks
  const noAction = judge({ ...clean, actionOccurred: false });
  check('the requested action not occurring blocks acceptance', noAction.decision !== 'accept' && noAction.reasons.some((r) => r.includes('action')));
  const brokenCont = judge({ ...clean, continuityOk: false });
  check('broken continuity blocks acceptance', brokenCont.decision !== 'accept');
  check('no previous shot (null) does not penalize', judge({ ...clean, continuityOk: null }).decision === 'accept');
}

{ // candidate selection
  const a = judge({ ...clean, identity: { sarah: 55 } });                                     // reject
  const b = judge(clean);                                                                     // accept, strong
  const c = judge({ ...clean, dimensions: { ...clean.dimensions, adherence: OVERALL_ACCEPT - 10 } }); // review
  check('pickBest skips rejects and prefers accept over review', pickBest([a, c, b]) === 2);
  check('all rejects → null (regenerate, never ship the least-bad)', pickBest([a, a]) === null);
  const b2 = judge({ ...clean, dimensions: { ...clean.dimensions, cinematic: 98 } });
  check('among accepts, the higher overall wins', pickBest([b, b2]) === 1);
}

{ // the vision prompt
  const p = buildQaPrompt({
    action: 'Sarah turns and sees Jake.', dialogue: 'How did you get in here?',
    characters: [{ id: 'sarah', name: 'Sarah', hasReference: true }, { id: 'jake', name: 'Jake', hasReference: true }],
    previousShot: true, spectacle: false,
  });
  check('the prompt declares the canonical-reference ordering and names', p.includes('CANONICAL reference') && p.includes('Sarah, Jake'));
  check('identity is asked as same-PERSON, face structure not clothing', p.includes('THE SAME PERSON') && p.includes('not clothing'));
  check('the defect list is the closed allowlist', p.includes('ONLY from') && p.includes('identity_drift') && p.includes('jitter'));
  check('high scores demand cited evidence (ported calibration rule)', p.includes('90+ require a cited visual observation'));
  check('continuity question appears only when a previous shot exists',
    p.includes('continuityOk') && !buildQaPrompt({ action: 'x', characters: [], previousShot: false, spectacle: false }).includes('continuityOk: does'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
