// scripts/mutateRun.ts — the looking-glass's impure half. HUMAN-RUN, never CI:
//   npx tsx scripts/mutateRun.ts <core-file> <verify-script-name>
//   e.g. npx tsx scripts/mutateRun.ts supabase/functions/_shared/payloadHash.ts verify:payloadhash
// For each mutant of <core-file>: write it, run the paired suite, record killed/survived,
// RESTORE the original (also on crash/interrupt), and print the survivor table. A survivor is a
// mutation the suite cannot see — a missing assertion, or provably-meaningless code you then
// justify by hand. Exit code 0 either way: the human reads the table; nothing gates on it.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateMutants } from './mutations';

const [, , target, script] = process.argv;
if (!target || !script) {
  console.error('Usage: npx tsx scripts/mutateRun.ts <core-file> <verify-script-name>');
  process.exit(2);
}

const original = readFileSync(target, 'utf8');
const restore = () => { try { writeFileSync(target, original); } catch { /* the git tree is the backstop */ } };
process.on('SIGINT', () => { restore(); process.exit(130); });

const mutants = generateMutants(original);
console.log(`${target} → ${mutants.length} mutants; paired suite: npm run -s ${script}\n`);

let killed = 0;
const survivors: typeof mutants = [];
try {
  for (const m of mutants) {
    writeFileSync(target, m.source);
    let dead = false;
    try {
      execSync(`npm run -s ${script}`, { stdio: 'pipe', timeout: 120_000 });
    } catch {
      dead = true; // the suite failed → the mutant was SEEN → killed
    }
    if (dead) killed++;
    else survivors.push(m);
    process.stdout.write(dead ? '·' : 'S');
  }
} finally {
  restore();
}

console.log(`\n\nkilled ${killed}/${mutants.length}; ${survivors.length} survivor(s)`);
if (survivors.length) {
  const lines = original.split('\n');
  console.log('\nSURVIVORS (each is a missing assertion or needs a written justification):');
  for (const s of survivors) {
    console.log(`  L${s.line} [${s.op}] ${s.from} → ${s.to}   | ${lines[s.line - 1]?.trim().slice(0, 100)}`);
  }
}
