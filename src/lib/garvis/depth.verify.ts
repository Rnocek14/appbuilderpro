// src/lib/garvis/depth.verify.ts
// Verifies the Depth Engine's pure core (run: `npm run verify:depth`). Pure asserts, no DB.
// The critique parser is an upgrade path, never a gate — every failure mode must resolve to
// "ship the draft", and every malformed critique point must be dropped rather than guessed at.

import { parseCritique, needsRefine, refineInstruction, depthNote, MAX_CRITIQUE_POINTS, type Critique } from './depth';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// ---- parse: happy path ----
const good = parseCritique(JSON.stringify({
  verdict: 'refine',
  points: [
    { severity: 'must_fix', section: 'Money', issue: 'Revenue targets are stated with no basis at all.', fix: 'Mark the target [YOU FILL: monthly revenue goal] and derive the funnel math from it.' },
    { severity: 'sharpen', section: 'Channels', issue: 'Channel list is generic advice that fits any business.', fix: 'Name the two channels the research supports and cut the rest.' },
  ],
}));
check('valid critique parses with both points', !!good && good.points.length === 2 && good.verdict === 'refine');
check('needsRefine true for refine-with-points', !!good && needsRefine(good));

// ---- parse: the gauntlet ----
const messy = parseCritique('```json\n' + JSON.stringify({
  verdict: 'refine',
  points: [
    { severity: 'catastrophic', section: 's', issue: 'A long enough issue statement here.', fix: 'A long enough fix instruction here.' }, // bad severity → dropped
    { severity: 'must_fix', section: '', issue: 'short', fix: 'A long enough fix instruction here.' },                                    // thin issue → dropped
    { severity: 'must_fix', section: '', issue: 'Claims about the market have no support.', fix: 'Ground them in the research block.' },   // empty section → defaulted
  ],
}) + '\n```');
check('fences stripped, bad severity dropped, thin issue dropped', !!messy && messy.points.length === 1);
check('empty section defaults to whole-document', !!messy && messy.points[0].section === '(whole document)');
check('garbage returns null (ship the draft), not a throw', parseCritique('utter nonsense') === null);
check('unknown verdict returns null', parseCritique(JSON.stringify({ verdict: 'maybe', points: [] })) === null);
const overflow = parseCritique(JSON.stringify({
  verdict: 'refine',
  points: Array.from({ length: MAX_CRITIQUE_POINTS + 5 }, (_, i) => ({ severity: 'sharpen', section: `s${i}`, issue: 'A sufficiently long issue text.', fix: 'A sufficiently long fix text here.' })),
}));
check(`points capped at ${MAX_CRITIQUE_POINTS}`, !!overflow && overflow.points.length === MAX_CRITIQUE_POINTS);

// ---- refine gating ----
const ship: Critique = { verdict: 'ship', points: [{ severity: 'sharpen', section: 's', issue: 'Minor issue, long enough text.', fix: 'Minor fix, long enough text here.' }] };
check('ship verdict never triggers refine', !needsRefine(ship));
check('refine with zero points never triggers refine', !needsRefine({ verdict: 'refine', points: [] }));

// ---- instruction rendering ----
const inst = refineInstruction(good!);
check('must_fix ordered before sharpen', inst.indexOf('MUST FIX') < inst.indexOf('sharpen'));
check('instruction carries both issue and fix', inst.includes('Revenue targets') && inst.includes('funnel math'));

// ---- provenance notes ----
check('null critique note admits critique was unavailable', depthNote(null, false).includes('unavailable'));
check('refined note counts severities', depthNote(good, true).includes('1 must-fix') && depthNote(good, true).includes('1 sharpen'));
check('kept-draft note is honest about the weaker refine', depthNote(good, false).includes('kept the draft'));
check('ship note does not manufacture criticism', depthNote(ship, false).includes('shipped the draft'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} depth check(s) failed`);
