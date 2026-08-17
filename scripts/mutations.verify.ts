// Run: npx tsx scripts/mutations.verify.ts
// The looking-glass's own contract: mutants are real single-site edits of CODE (never comments
// or strings), deterministic, bounded, and never identical to the original.

import { generateMutants, codeMask, PER_OP_CAP } from './mutations';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const SRC = `export function gate(n: number, on: boolean): boolean {
  // a comment with n >= 3 && true inside it
  const msg = 'strings with n >= 3 && true stay untouched';
  if (!on) return false;
  return n >= 3 && msg.length > 0;
}`;

const mutants = generateMutants(SRC);
check('every classic operator finds its sites',
  ['cmp-boundary', 'logic-flip', 'bool-flip', 'num-bump'].every((op) => mutants.some((m) => m.op === op)));
check('a comparison mutant flips the boundary', mutants.some((m) => m.from === '>=' && m.to === '>'));
check('no mutant equals the original', mutants.every((m) => m.source !== SRC));
check('each mutant changes exactly one site',
  mutants.every((m) => m.source.length === SRC.length + (m.to.length - m.from.length)));
check('deterministic: same source, same mutants',
  JSON.stringify(generateMutants(SRC)) === JSON.stringify(mutants));
check('comment sites are never mutated',
  !mutants.some((m) => SRC.slice(0, m.index).split('\n').length === 2));
check('string-literal sites are never mutated',
  !mutants.some((m) => SRC.slice(0, m.index).split('\n').length === 3));
check('lines are 1-based and real', mutants.every((m) => SRC.split('\n')[m.line - 1].includes(m.from)));
check('the per-op cap bounds a pathological file',
  generateMutants(Array.from({ length: 100 }, () => 'if (a === b) { }').join('\n'))
    .filter((m) => m.op === 'eq-flip').length === PER_OP_CAP);
{
  const mask = codeMask(`code 'str' // comment`);
  check('the mask separates code from strings and comments',
    mask[0] && !mask[6] && !mask[12]);
}
check('escaped quotes do not derail the string scanner',
  (() => { const s = `const a = 'it\\'s'; return a === 'x';`; return generateMutants(s).some((m) => m.from === '==='); })());

console.log(`\nmutations.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} mutation tool check(s) failed`);
