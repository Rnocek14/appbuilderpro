// scripts/mutations.ts
// THE MUTATION LOOKING-GLASS — pure operator core (verified by mutations.verify.ts). A verify
// suite that stays green while its core's `>=` becomes `>` is decoration, not protection. This
// generates the classic small mutants; the impure runner (mutateRun.ts) applies each one, runs
// the PAIRED suite, and prints the survivors — every survivor is either a missing assertion or
// provably meaningless (dead code, logging), and the operator decides which, by hand. Human-run
// on purpose: mutation runs burn minutes and judgment, not CI.

export interface Mutant {
  id: string;            // stable: op + index-in-file
  op: string;            // which operator produced it
  index: number;         // character offset of the mutation site
  line: number;          // 1-based line of the site (for the survivor report)
  from: string;
  to: string;
  source: string;        // the FULL mutated source
}

interface MutOp { name: string; pattern: RegExp; replace: (match: string) => string | null }

/** The classic five, token-level. Each site yields exactly one mutant; caps bound the run. */
const OPS: MutOp[] = [
  { name: 'eq-flip', pattern: /===|!==/g, replace: (m) => (m === '===' ? '!==' : '===') },
  { name: 'cmp-boundary', pattern: />=|<=|>|</g, replace: (m) => ({ '>=': '>', '<=': '<', '>': '>=', '<': '<=' }[m] ?? null) },
  { name: 'logic-flip', pattern: /&&|\|\|/g, replace: (m) => (m === '&&' ? '||' : '&&') },
  { name: 'bool-flip', pattern: /\btrue\b|\bfalse\b/g, replace: (m) => (m === 'true' ? 'false' : 'true') },
  { name: 'num-bump', pattern: /\b\d+\b/g, replace: (m) => String(Number(m) + 1) },
];

export const PER_OP_CAP = 40;

/** Strip comments and string literals from consideration: a mutant inside prose or a message
 *  string changes no behavior worth testing and pollutes the survivor report with noise.
 *  Returns a mask (true = mutable code position), same length as the source. */
export function codeMask(source: string): boolean[] {
  const mask = new Array<boolean>(source.length).fill(true);
  let i = 0;
  const n = source.length;
  const blank = (a: number, b: number) => { for (let k = a; k < b && k < n; k++) mask[k] = false; };
  while (i < n) {
    const c = source[i];
    const two = source.slice(i, i + 2);
    if (two === '//') { const e = source.indexOf('\n', i); blank(i, e === -1 ? n : e); i = e === -1 ? n : e; continue; }
    if (two === '/*') { const e = source.indexOf('*/', i + 2); blank(i, e === -1 ? n : e + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === c) break;
        j++;
      }
      blank(i, Math.min(j + 1, n)); i = j + 1; continue;
    }
    i++;
  }
  return mask;
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/** Every mutant for a source file, deterministic order, comment/string sites excluded. */
export function generateMutants(source: string): Mutant[] {
  const mask = codeMask(source);
  const out: Mutant[] = [];
  for (const op of OPS) {
    let count = 0;
    for (const m of source.matchAll(op.pattern)) {
      if (count >= PER_OP_CAP) break;
      const index = m.index ?? 0;
      if (!mask[index]) continue;
      const to = op.replace(m[0]);
      if (to === null || to === m[0]) continue;
      out.push({
        id: `${op.name}:${index}`,
        op: op.name,
        index,
        line: lineOf(source, index),
        from: m[0],
        to,
        source: source.slice(0, index) + to + source.slice(index + m[0].length),
      });
      count++;
    }
  }
  return out;
}
