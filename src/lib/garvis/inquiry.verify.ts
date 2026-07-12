// src/lib/garvis/inquiry.verify.ts
// Standalone verification of the decision laboratory (run: `npm run verify:inquiry`).
// Guards the contracts: substance gates reject thin output BY NAME, falsifiers are non-negotiable,
// verdicts map to honest edge types, and artifacts carry the full record.

import {
  parseComparison, comparisonArtifact, comparisonDetail, VERDICT_EDGE,
  parseTheoryScaffold, theoryArtifact, theoryDetail, THEORY_ARTIFACT_ID,
  buildCompareUser, buildTheoryUser,
  type Comparison, type TheoryScaffold,
} from './inquiry';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const goodCompare = JSON.stringify({
  a: { claim: 'Time is fundamental — a background all events sit in.', assumptions: ['spacetime is a real manifold'], strengths: ['matches GR math'], problems: ['quantum gravity resists it'] },
  b: { claim: 'Time is emergent — bookkeeping for change between configurations.', assumptions: ['relations are primary'], strengths: ['dissolves the frozen-formalism problem'], problems: ['recovering smooth time is unsolved'] },
  agree: ['both accept relativity’s observed time dilation'],
  conflict: ['whether t in the equations refers to something real'],
  hinges: ['whether the Wheeler-DeWitt timelessness is a bug or a feature'],
  discriminators: ['a quantum-gravity regime observation where the two give different predictions'],
  verdict: 'contradicts',
  readout: 'These are genuinely rival pictures: both cannot be right about what t refers to. The disagreement hinges on ontology, not data — today no experiment separates them.',
});

// 1. Comparison — substance gates, by name.
{
  const ok = parseComparison(goodCompare);
  check('a full comparison parses', !!ok.cmp && ok.missing.length === 0);
  check('verdict survives', ok.cmp?.verdict === 'contradicts');

  const thin = parseComparison(JSON.stringify({ a: { claim: 'x is true' }, b: {}, agree: [], conflict: [], discriminators: [], readout: 'ok' }));
  check('thin comparison rejected', thin.cmp === null);
  check("gaps named: B's claim", thin.missing.some((m) => m.includes("B's core claim")));
  check('gaps named: assumptions', thin.missing.some((m) => m.includes('assumptions')));
  check('gaps named: discriminators', thin.missing.some((m) => m.includes('tell them apart')));
  check('gaps named: readout', thin.missing.some((m) => m.includes('readout')));
  check('garbage → everything missing, no throw', parseComparison('nope').cmp === null && parseComparison('nope').missing.length === 1);
  check('unknown verdict clamps to overlapping', (() => {
    const o = JSON.parse(goodCompare) as Record<string, unknown>; o.verdict = 'who-knows';
    return parseComparison(JSON.stringify(o)).cmp?.verdict === 'overlapping';
  })());
}

// 2. The discovered relationship becomes an honest edge.
{
  check('contradicts → contradicts edge', VERDICT_EDGE.contradicts === 'contradicts');
  check('complementary/overlapping → relates (never a fake support claim)', VERDICT_EDGE.complementary === 'relates' && VERDICT_EDGE.overlapping === 'relates');
}

// 3. Comparison artifact — durable, readable, stable id per pair.
{
  const cmp = parseComparison(goodCompare).cmp as Comparison;
  const a1 = comparisonArtifact('Time is fundamental', 'Time is emergent', cmp);
  const a2 = comparisonArtifact('Time is fundamental', 'Time is emergent', cmp);
  check('same pair → same artifact id (a recompare refreshes, not litters)', a1.id === a2.id);
  check('artifact kind research, source lab', a1.kind === 'research' && a1.source === 'lab');
  const d = comparisonDetail('A-title', 'B-title', cmp);
  check('detail carries the decision-lab sections', d.includes('WHERE THEY CONFLICT') && d.includes('WHAT WOULD SETTLE IT') && d.includes('VERDICT: contradicts'));
  check('detail names both sides', d.includes('A — A-title') && d.includes('B — B-title'));
}

// 4. Theory scaffold — falsifiers are the heart, and their absence is rejected by name.
{
  const good = JSON.stringify({
    claim: 'Time is an emergent property of change, not a fundamental background.',
    definitions: ['change — difference between configurations'], assumptions: ['relations are primary'],
    related: ['relational mechanics (Barbour school)'], supporting: ['none yet'],
    contradicting: ['GR treats t as coordinate structure with real consequences'],
    predictions: ['no physical clock exists in a truly static configuration'],
    falsifiers: ['an observed physical process that advances with zero change in any configuration'],
    experiments: ['thought experiment: a universe of one static particle — does anything tick?'],
    open: ['how does smooth experienced time recover from discrete change?'],
  });
  const ok = parseTheoryScaffold(good);
  check('a full scaffold parses', !!ok.scaffold && ok.missing.length === 0);

  const noFals = JSON.parse(good) as Record<string, unknown>; noFals.falsifiers = [];
  const rejected = parseTheoryScaffold(JSON.stringify(noFals));
  check('NO FALSIFIERS → REJECTED (the echo-chamber guard)', rejected.scaffold === null);
  check('…and the gap is named as non-negotiable', rejected.missing.some((m) => m.includes('prove this wrong') && m.includes('non-negotiable')));

  const noAgainst = JSON.parse(good) as Record<string, unknown>; noAgainst.contradicting = [];
  check('no case-against → rejected (a critic, not a cheerleader)', parseTheoryScaffold(JSON.stringify(noAgainst)).scaffold === null);
  const vague = JSON.parse(good) as Record<string, unknown>; vague.claim = 'stuff is weird';
  check('a vague claim is rejected', parseTheoryScaffold(JSON.stringify(vague)).scaffold === null);

  const t = ok.scaffold as TheoryScaffold;
  const art = theoryArtifact(t);
  check('theory artifact has the stable scaffold id', art.id === THEORY_ARTIFACT_ID);
  check('detail leads with the claim and carries the falsification block', !!art.detail && art.detail.startsWith('CLAIM:') && art.detail.includes('WHAT WOULD PROVE THIS WRONG'));
  check('detail carries the case against', theoryDetail(t).includes('THE CASE AGAINST'));
}

// 5. Prompt builders — bounded inputs, both sides present.
{
  const u = buildCompareUser({ title: 'A', summary: 's', detail: 'x'.repeat(5000) }, { title: 'B' }, 'Time');
  check('compare user names both sides + world, caps detail', u.includes('A: A') && u.includes('B: B') && u.includes('EXPLORATION: Time') && u.length < 3000);
  const tu = buildTheoryUser('t'.repeat(2000), 'c'.repeat(5000));
  check('theory user caps statement + context', tu.length < 2000);
}

console.log(`\ninquiry.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node and tsx still exits non-zero on failure.
if (failed > 0) throw new Error(`${failed} inquiry check(s) failed`);
