// Run: npx tsx src/lib/garvis/ask.verify.ts
import { mergeHits, type RawHit } from './askCore';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('ask.verify');

const V = (id: string, sim: number): RawHit => ({ subjectId: id, content: `v-${id}`, similarity: sim, via: 'vector' });
const L = (id: string): RawHit => ({ subjectId: id, content: `l-${id}`, similarity: null, via: 'lexical' });

{
  const merged = mergeHits([V('a', 0.9), V('b', 0.5)], [L('c'), L('d')]);
  check('all distinct hits survive the merge', merged.length === 4);
  check('vector hits rank above lexical-only', merged[0].subjectId === 'a' && merged[1].subjectId === 'b');
  check('lexical hits keep their content (searchable without embeddings)', merged.some((h) => h.subjectId === 'c' && h.content === 'l-c'));
}
{
  // A hit found BOTH ways is the strongest signal — must beat a slightly higher vector-only hit.
  const merged = mergeHits([V('shared', 0.6), V('vonly', 0.7)], [L('shared'), L('lonly')]);
  check('a both-ways hit dedupes to ONE entry', merged.filter((h) => h.subjectId === 'shared').length === 1);
  check('both-ways boost lifts it above a higher vector-only hit', merged[0].subjectId === 'shared');
  check('the deduped hit keeps its vector similarity/content', merged[0].content === 'v-shared' && merged[0].similarity === 0.6);
}
{
  const merged = mergeHits(Array.from({ length: 20 }, (_, i) => V(`v${i}`, 0.9 - i * 0.01)), [], 8);
  check('cap is respected', merged.length === 8);
  check('empty in → empty out, no throw', mergeHits([], []).length === 0);
}
{
  // Determinism — same inputs, same order.
  const a = mergeHits([V('x', 0.5), V('y', 0.8)], [L('z')]);
  const b = mergeHits([V('x', 0.5), V('y', 0.8)], [L('z')]);
  check('deterministic ordering', JSON.stringify(a) === JSON.stringify(b));
}

console.log(`\nask.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} ask check(s) failed`);
