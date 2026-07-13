// src/lib/garvis/assist.verify.ts
// Run: npx tsx src/lib/garvis/assist.verify.ts
// Verifies the Operator Assistant's honesty gate: no sources → refuse (never invent an answer),
// gaps are surfaced honestly, and a saved draft is a deterministic, cited record.

import { decideAssist, extractGaps, buildAssistUser, assistArtifact, type AssistSource } from './assist';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('assist.verify');

const SRC: AssistSource[] = [
  { id: 'a', title: 'Return policy', snippet: 'Returns accepted within 30 days with receipt.', where: 'Policies' },
  { id: 'b', title: 'Shipping', snippet: 'Orders ship in 2 business days via USPS.', where: 'Policies' },
];

// 1 — the core refusal: zero sources must NEVER produce an answer.
{
  const d = decideAssist({ incoming: 'Can I return this?', sources: [], reply: 'Sure, our policy is 60 days.' });
  check('no knowledge base match → refused', d.grounded === false && d.reply === '' && !!d.refusal);
  check('the refusal names the fix (add an entry)', /add an entry|knowledge base|vault/i.test(d.refusal ?? ''));
}

// 2 — grounded when real sources back a real reply; gaps surfaced.
{
  const reply = 'Yes — returns are accepted within 30 days with a receipt [1]. For your order date, [needs your input: order number]. Shipping is 2 business days [2].';
  const d = decideAssist({ incoming: 'Can I return this and when did it ship?', sources: SRC, reply, costUsd: 0.002 });
  check('sources + a real reply → grounded', d.grounded === true && d.reply.length > 20);
  check('the [needs your input] gap is extracted', d.gaps.length === 1 && d.gaps[0] === 'order number');
  check('sources ride along for the show-your-work list', d.sources.length === 2);
  check('cost passes through', d.costUsd === 0.002);
}

// 3 — a thin/empty model reply is refused even with sources (no half-answers sent).
{
  const d = decideAssist({ incoming: 'x', sources: SRC, reply: 'ok' });
  check('a too-thin reply → refused, sources still shown', d.grounded === false && d.reply === '' && d.sources.length === 2);
}

// 4 — extractGaps dedupes and strips the wrapper.
{
  const gaps = extractGaps('A [needs your input: their email] and B [needs your input: their email] and C [needs your input: ship date].');
  check('gaps deduped + unwrapped', gaps.length === 2 && gaps.includes('their email') && gaps.includes('ship date'));
  check('no gaps → empty', extractGaps('a clean grounded reply with no markers').length === 0);
}

// 5 — the user prompt carries KB + incoming + tone, and is honest when the KB is empty.
{
  const u = buildAssistUser('Where is my order?', SRC, 'warm and concise');
  check('prompt includes tone, numbered sources, and the incoming', u.includes('warm and concise') && u.includes('[1] Return policy') && u.includes('Where is my order?'));
  const empty = buildAssistUser('hi', [], null);
  check('empty KB is stated, not faked', empty.includes('returned nothing relevant'));
}

// 6 — a saved draft is a deterministic, cited 'garvis' record.
{
  const d = decideAssist({ incoming: 'Return question about my mug', sources: SRC, reply: 'Yes, 30 days [1].' });
  const art = assistArtifact('Return question about my mug', d);
  const art2 = assistArtifact('Return question about my mug', d);
  check('artifact id is deterministic for the same incoming', art.id === art2.id && art.id.startsWith('answer-'));
  check('artifact is a garvis doc that cites its sources', art.kind === 'doc' && art.source === 'garvis' && art.detail.includes('Return policy'));
  check('artifact title is the trimmed incoming', art.title.startsWith('Reply:') && art.title.includes('Return question'));
}

console.log(`\nassist.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assist check(s) failed`);
