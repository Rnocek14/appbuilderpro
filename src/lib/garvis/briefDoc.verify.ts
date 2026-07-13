// src/lib/garvis/briefDoc.verify.ts
// Run: npx tsx src/lib/garvis/briefDoc.verify.ts
// Verifies the brief-this-upload pure core: chunking is deterministic and boundary-aware with real
// overlap, the reduce context never silently drops sections, coverage lines are honest about partial
// reads, and the gate refuses to summarize nothing.

import {
  chunkForBrief, buildMapUser, buildReduceContext, coverageLine, decideBrief,
  BRIEF_MAP_SYSTEM, BRIEF_REDUCE_SYSTEM, CHUNK_SIZE, REDUCE_CONTEXT_CAP,
} from './briefDoc';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('briefDoc.verify');

// 1 — chunking basics.
{
  check('empty text → no chunks', chunkForBrief('   ').length === 0);
  check('short text → one chunk, verbatim', chunkForBrief('a short document').join('') === 'a short document');
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} with some real sentence content here.`).join('\n\n');
  const chunks = chunkForBrief(long, 500, 60);
  check('long text splits into multiple chunks', chunks.length > 3);
  check('every chunk respects the size cap', chunks.every((c) => c.length <= 500));
  check('deterministic: same input → same chunks', JSON.stringify(chunks) === JSON.stringify(chunkForBrief(long, 500, 60)));
  // Overlap: every character of the source appears in some chunk (nothing lost between cuts).
  const merged = chunks.join(' ');
  check('no content is lost between chunks', long.split(/\s+/).every((w) => merged.includes(w)));
}

// 2 — boundary awareness: prefers a paragraph break near the cut.
{
  const text = `${'x'.repeat(380)}.\n\n${'y'.repeat(400)}`;
  const chunks = chunkForBrief(text, 500, 50);
  check('cuts at the paragraph break instead of mid-run', chunks[0].endsWith('.') && chunks.length >= 2);
}

// 3 — reduce context: capped WITH a marker, never silent.
{
  const small = buildReduceContext(['note one', 'note two']);
  check('small notes all fit, nothing dropped', small.dropped === 0 && small.context.includes('SECTION 2 NOTES'));
  const big = buildReduceContext(Array.from({ length: 10 }, () => 'z'.repeat(3000)));
  check('overflowing notes are dropped with an explicit marker', big.dropped > 0 && big.context.includes('NOT reflected'));
  check('reduce context respects the cap', big.context.length <= REDUCE_CONTEXT_CAP + 200);
}

// 4 — coverage honesty.
{
  check('full coverage says whole document', coverageLine(3, 3, 0) === 'Covers the whole document.');
  check('a partial read admits it', /partial brief/i.test(coverageLine(12, 8, 0)) && coverageLine(12, 8, 0).includes('8 of 12'));
  check('dropped reduce notes reduce claimed coverage', coverageLine(8, 8, 2).includes('6 of 8'));
}

// 5 — the gate.
{
  const empty = decideBrief({ sourceLength: 10, reply: 'anything', coverage: 'x' });
  check('no source text → refusal, never a summary of nothing', empty.refusal !== null && empty.brief === '');
  check('the refusal names the likely cause (scan/empty extraction)', /scan|empty extraction/i.test(empty.refusal ?? ''));
  const thin = decideBrief({ sourceLength: 50_000, reply: 'ok.', coverage: 'x' });
  check('a thin compose → refusal', thin.refusal !== null);
  const good = decideBrief({ sourceLength: 50_000, reply: '## Summary\n\nA real brief with substance and structure that stands on the notes.', coverage: 'Covers the whole document.', costUsd: 0.01 });
  check('a real brief stands, with its coverage line and cost', good.refusal === null && good.brief.includes('## Summary') && good.coverage.includes('whole document') && good.costUsd === 0.01);
}

// 6 — prompt contracts.
{
  check('map prompt demands verbatim specifics and forbids invention', /verbatim/i.test(BRIEF_MAP_SYSTEM) && /do not invent|not invent/i.test(BRIEF_MAP_SYSTEM));
  check('reduce prompt grounds on notes only and never manufactures risk', /only those notes/i.test(BRIEF_REDUCE_SYSTEM) && /never manufacture risk/i.test(BRIEF_REDUCE_SYSTEM));
  check('map user turn names the section position', buildMapUser(2, 8).includes('section 3 of 8'));
  check('chunk size stays under the cluster-chat context cap', CHUNK_SIZE <= 12000);
}

console.log(`\nbriefDoc.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} briefDoc check(s) failed`);
