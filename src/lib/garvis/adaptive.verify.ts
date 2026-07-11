// Run: npx tsx src/lib/garvis/adaptive.verify.ts
import { adapt, channelFacts, type ChannelIn } from './adaptive';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('adaptive.verify');

const CH = (over: Partial<ChannelIn>): ChannelIn => ({
  name: 'x', out: 0, outLabel: 'sends', responses: 0, responseLabel: 'replies', spendUsd: null, instrumented: true, ...over,
});

// --- the core scenario: postcards produced, email silent → shift, with the numbers ----------
{
  const recs = adapt([
    CH({ name: 'direct mail', out: 200, outLabel: 'pieces', responses: 3, responseLabel: 'leads' }),
    CH({ name: 'email', out: 40, responses: 0 }),
  ]);
  const shift = recs.find((r) => r.text.includes('Shift effort'));
  check('working vs silent → a shift recommendation', !!shift && shift.text.includes('from email toward direct mail'));
  check('the shift carries BOTH channels\' real numbers', !!shift && shift.evidence.includes('200 pieces → 3 leads') && shift.evidence.includes('40 sends → 0'));
  check('3+ responses → confidence act; measured basis', shift?.confidence === 'act' && shift?.basis === 'measured');
}
// --- small samples refuse to conclude ------------------------------------------------------
{
  const recs = adapt([
    CH({ name: 'email', out: 4, responses: 0 }),
    CH({ name: 'direct mail', out: 200, outLabel: 'pieces', responses: 2, responseLabel: 'leads' }),
  ]);
  check('below MIN_SAMPLE → too-early, never a verdict against it', recs.some((r) => r.confidence === 'too-early' && r.text.includes('email') && r.evidence.includes('Only 4')));
  check('no shift rec against a too-early channel', !recs.some((r) => r.text.includes('Shift effort from email')));
  check('a working channel with <3 responses → watch, not act', recs.every((r) => !(r.text.includes('Shift') && r.confidence === 'act')));
}
// --- CPL: only when both sides are real ----------------------------------------------------
{
  const recs = adapt([
    CH({ name: 'google ads', out: 300, outLabel: 'clicks', responses: 6, responseLabel: 'leads', spendUsd: 120 }),
    CH({ name: 'meta ads', out: 500, outLabel: 'clicks', responses: 2, responseLabel: 'leads', spendUsd: 200 }),
  ]);
  const cpl = recs.find((r) => r.text.includes('cheaper'));
  check('two measured CPLs → the cheaper channel wins the budget rec', !!cpl && cpl.text.includes('google ads') && cpl.basis === 'measured');
  check('CPL evidence carries real dollars per lead', !!cpl && cpl.evidence.includes('$20/lead') && cpl.evidence.includes('$100/lead'));
  const facts = channelFacts([CH({ name: 'x', out: 50, responses: 5, spendUsd: null })]);
  check('no spend logged → no CPL invented', facts[0].cpl === null && !facts[0].summary.includes('$'));
}
// --- nothing measured → one honest heuristic -----------------------------------------------
{
  const recs = adapt([CH({ name: 'email', out: 0 })]);
  check('zero outbound → single instrument-and-test rec, labeled heuristic', recs.length === 1 && recs[0].basis === 'heuristic' && recs[0].confidence === 'too-early');
}
// --- dark channels get an instrumentation rec, not an opinion ------------------------------
{
  const recs = adapt([
    CH({ name: 'email', out: 40, responses: 2 }),
    CH({ name: 'radio', out: 1, outLabel: 'campaigns', instrumented: false }),
  ]);
  check('un-instrumented + active → "running blind, instrument it"', recs.some((r) => r.text.includes('radio') && r.text.includes('blind')));
  const facts = channelFacts([CH({ name: 'radio', instrumented: false })]);
  check('facts label un-instrumented honestly', facts[0].verdict === 'not-instrumented' && facts[0].summary.includes('not instrumented'));
}
// --- determinism + rate honesty ------------------------------------------------------------
{
  const input = [CH({ name: 'email', out: 42, responses: 3 })];
  check('deterministic: same rows, same advice', JSON.stringify(adapt(input)) === JSON.stringify(adapt(input)));
  const facts = channelFacts(input);
  check('rates shown only at honest sample sizes', facts[0].summary.includes('7.1%'));
  const tiny = channelFacts([CH({ name: 'email', out: 3, responses: 1 })]);
  check('no percentage theater on tiny samples', !tiny[0].summary.includes('%'));
}

console.log(`\nadaptive.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} adaptive check(s) failed`);
