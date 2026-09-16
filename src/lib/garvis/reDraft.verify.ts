// Run: npx tsx src/lib/garvis/reDraft.verify.ts
import { DRAFT_KINDS, draft, type DraftFact } from './reDraft';
import { renderWithFacts, hasUnresolvedHole, type FactRecord } from './reFacts';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('reDraft.verify');

const NOW = '2026-09-15T12:00:00.000Z';
const dues: DraftFact = { id: 'dues', claim: 'Association dues', valueText: 'billed quarterly' };
const pool: DraftFact = { id: 'pool', claim: 'The pool season', valueText: 'Memorial Day through September' };
const rec = (f: DraftFact, o: Partial<FactRecord> = {}): FactRecord => ({
  id: f.id, claim: f.claim, valueText: f.valueText, status: 'verified',
  reviewedAt: NOW, reviewDueAt: null, sourceCount: 1, ...o,
});

// ---- the shape -------------------------------------------------------------
{
  const d = draft({ kind: 'owner_brief', communityName: 'Abbey Springs', facts: [dues, pool], agentName: 'Gina Nocek' });
  check('the community is named', d.template.includes('Abbey Springs'));
  check('each fact becomes a slot, never a sentence', d.template.includes('{{fact:dues}}') && d.template.includes('{{fact:pool}}'));
  check('the facts it leans on are declared', d.factIds.join() === 'dues,pool');
  check('the agent signs it', d.template.includes('— Gina Nocek'));
  check('nothing is needed when a community and a fact are present', d.needs.length === 0);
  check('every draft kind composes', DRAFT_KINDS.every((k) => draft({ kind: k.id, communityName: 'A', facts: [dues] }).template.length > 0));
  check('it is deterministic', draft({ kind: 'owner_brief', communityName: 'A', facts: [dues] }).template
    === draft({ kind: 'owner_brief', communityName: 'A', facts: [dues] }).template);
}

// ---- nothing is invented ---------------------------------------------------
{
  const bare = draft({ kind: 'owner_brief', communityName: '', facts: [] });
  check('no community leaves a visible hole', bare.template.includes('[VERIFY: the community name]'));
  check('no facts leaves a visible hole', bare.template.includes('[VERIFY: a verified fact with a source]'));
  check('and both are stated as needs', bare.needs.length === 2);
  check('an empty draft can never be mistaken for finished copy', hasUnresolvedHole(bare.template));

  const invite = draft({ kind: 'seller_invite', communityName: 'Abbey Springs', facts: [dues] });
  check('the seller invitation makes NO claim about the reader\'s home',
    !/your home is|worth more|great time to sell|market is (hot|strong|up)/i.test(invite.template));
  check('it also makes no market-direction claim nobody verified',
    !/prices are|values are (up|rising)|inventory is/i.test(invite.template));
}

// ---- the fact gate, not this file, decides what may be said ----------------
{
  const d = draft({ kind: 'owner_brief', communityName: 'Abbey Springs', facts: [dues, pool] });

  const good = renderWithFacts(d.template, [rec(dues), rec(pool)], NOW);
  check('verified facts resolve into real copy', good.text.includes('billed quarterly') && good.text.includes('Memorial Day'));
  check('resolved copy has no holes left', !hasUnresolvedHole(good.text));
  check('and it reports which facts it used', good.usedFactIds.sort().join() === 'dues,pool');

  const stale = renderWithFacts(d.template, [rec(dues, { status: 'stale' }), rec(pool)], NOW);
  check('a stale fact becomes a hole rather than copy', stale.text.includes('[VERIFY: Association dues]'));
  check('the hole is reported to the operator', stale.holes.some((h) => h.includes('stale')));
  check('copy with a stale fact can never reach the queue', hasUnresolvedHole(stale.text));

  const unsourced = renderWithFacts(d.template, [rec(dues, { sourceCount: 0 }), rec(pool)], NOW);
  check('an unsourced fact becomes a hole', unsourced.holes.some((h) => h.includes('no source')));
  check('the other verified fact still renders beside it', unsourced.text.includes('Memorial Day'));
}

// ---- the brokerage line rides along ----------------------------------------
{
  const d = draft({ kind: 'owner_brief', communityName: 'Abbey Springs', facts: [dues], agentName: 'Gina', complianceLine: 'Gina Nocek · @properties' });
  check('the brokerage line is in the draft, not bolted on at send time', d.template.includes('Gina Nocek · @properties'));
  check('it comes last', d.template.trim().endsWith('Gina Nocek · @properties'));
  check('no line configured leaves the draft unchanged in shape',
    !draft({ kind: 'owner_brief', communityName: 'Abbey Springs', facts: [dues], agentName: 'Gina' }).template.includes('@properties'));
}

console.log(`\nreDraft.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reDraft check(s) failed`);
