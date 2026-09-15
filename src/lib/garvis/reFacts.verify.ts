// Run: npx tsx src/lib/garvis/reFacts.verify.ts
import { parseFact, citationBlocker, isCitable, renderWithFacts, factGate, hasUnresolvedHole, type FactRecord } from './reFacts';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('reFacts.verify');

const NOW = '2026-09-15T12:00:00.000Z';
const fact = (o: Partial<FactRecord> = {}): FactRecord => ({
  id: 'dues', claim: 'Abbey Springs dues are billed quarterly',
  valueText: 'billed quarterly', status: 'verified',
  reviewedAt: '2026-08-01T00:00:00.000Z', reviewDueAt: '2026-12-01T00:00:00.000Z',
  sourceCount: 1, ...o,
});

// ---- the one rule ----------------------------------------------------------
{
  check('a verified, sourced, in-date fact is citable', isCitable(fact(), NOW));
  check('an evergreen fact (no review date) is citable', isCitable(fact({ reviewDueAt: null }), NOW));

  check('a DRAFT fact is never citable', !isCitable(fact({ status: 'draft' }), NOW));
  check('a RETIRED fact is never citable', !isCitable(fact({ status: 'retired' }), NOW));
  check('a STALE fact is never citable', !isCitable(fact({ status: 'stale' }), NOW));
  check('a verified fact with NO SOURCE is never citable', !isCitable(fact({ sourceCount: 0 }), NOW));
  check('a fact past its review date is never citable',
    !isCitable(fact({ reviewDueAt: '2026-09-01T00:00:00.000Z' }), NOW));
  check('a fact due exactly now is treated as due (not squeaked through)',
    !isCitable(fact({ reviewDueAt: NOW }), NOW));
}

// ---- refusals are named, not generic ---------------------------------------
{
  check('an unverified fact says so', citationBlocker(fact({ status: 'draft' }), NOW).includes('not been verified'));
  check('a sourceless fact says so', citationBlocker(fact({ sourceCount: 0 }), NOW).includes('no source'));
  check('an expired fact names its date',
    citationBlocker(fact({ reviewDueAt: '2026-09-01T00:00:00.000Z' }), NOW).includes('2026-09-01'));
  check('every refusal quotes the claim so the operator knows which fact',
    citationBlocker(fact({ status: 'draft' }), NOW).includes('Abbey Springs dues'));
  check('a citable fact produces no reason at all', citationBlocker(fact(), NOW) === '');
}

// ---- rendering: a missing fact stays missing -------------------------------
{
  const tpl = 'Owning at Abbey Springs: dues are {{fact:dues}} and the pool opens {{fact:pool}}.';
  const r = renderWithFacts(tpl, [fact()], NOW);
  check('a citable fact renders its verified value', r.text.includes('billed quarterly'));
  check('an unknown fact leaves a VISIBLE hole', r.text.includes('[VERIFY: pool]'));
  check('the hole is reported, not just rendered', r.holes.some((h) => h.includes('pool')));
  check('only the facts actually used are recorded', JSON.stringify(r.usedFactIds) === JSON.stringify(['dues']));
  check('nothing plausible is substituted for the missing fact',
    !/quarterly.*pool opens (in|on|at) [A-Z]/.test(r.text) && r.text.includes('[VERIFY'));

  const stale = renderWithFacts(tpl, [fact({ status: 'stale' }), fact({ id: 'pool', claim: 'the pool opens Memorial Day', valueText: 'Memorial Day weekend' })], NOW);
  check('an uncitable fact renders as a hole naming the CLAIM, not the id',
    stale.text.includes('[VERIFY: Abbey Springs dues are billed quarterly]'));
  check('a citable sibling still renders beside it', stale.text.includes('Memorial Day weekend'));

  check('a fact with no value falls back to its claim, never to an invention',
    renderWithFacts('{{fact:dues}}', [fact({ valueText: null })], NOW).text === 'Abbey Springs dues are billed quarterly');
  check('a template with no placeholders passes through untouched',
    renderWithFacts('Just a sentence.', [], NOW).text === 'Just a sentence.');
}

// ---- holes must never reach the queue --------------------------------------
{
  check('rendered holes are detectable', hasUnresolvedHole('dues are [VERIFY: dues]'));
  check('un-rendered placeholders are detectable', hasUnresolvedHole('dues are {{fact:dues}}'));
  check('clean copy is clean', !hasUnresolvedHole('Abbey Springs dues are billed quarterly.'));
  check('the placeholder regex does not go stale between calls (lastIndex reset)',
    hasUnresolvedHole('{{fact:a}}') && hasUnresolvedHole('{{fact:a}}'));
}

// ---- the server-side gate: a fact can go stale AFTER approval ---------------
{
  check('a post whose facts are all citable passes', factGate(['dues'], [fact()], NOW) === null);
  check('a post whose fact went stale between approval and send is BLOCKED',
    factGate(['dues'], [fact({ status: 'stale' })], NOW) !== null);
  check('a post whose fact expired between approval and send is BLOCKED',
    factGate(['dues'], [fact({ reviewDueAt: '2026-09-14T00:00:00.000Z' })], NOW) !== null);
  check('a post whose fact row has vanished is BLOCKED, never published anyway',
    factGate(['gone'], [fact()], NOW) !== null);
  check('a post relying on no facts is not blocked by this gate',
    factGate([], [fact({ status: 'draft' })], NOW) === null);
  check('the block reason is the fact-level reason, so the operator knows what to fix',
    (factGate(['dues'], [fact({ sourceCount: 0 })], NOW) ?? '').includes('no source'));
}

// ---- tolerant reader -------------------------------------------------------
{
  const row = parseFact({ id: 'x', claim: 'c', value_text: 'v', status: 'verified', review_due_at: '2026-12-01T00:00:00.000Z', source_count: 2 });
  check('a snake_case DB row reads back', row?.valueText === 'v' && row?.sourceCount === 2 && row?.status === 'verified');
  check('an unknown status degrades to draft, never to verified',
    parseFact({ id: 'x', claim: 'c', status: 'totally-fine' })?.status === 'draft');
  check('a row with no id or claim is not a fact', parseFact({ claim: 'c' }) === null && parseFact({ id: 'x' }) === null);
  check('a missing source count reads as zero, never as one', parseFact({ id: 'x', claim: 'c' })?.sourceCount === 0);
  check('junk never throws', parseFact(null) === null && parseFact('nope') === null);
}

console.log(`\nreFacts.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reFacts check(s) failed`);
