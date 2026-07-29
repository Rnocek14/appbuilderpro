// scripts/self-interaction-lint.mjs — point the interaction lint at the PRODUCT'S OWN source.
//
//   npm run verify:selfinteraction
//
// The lint in supabase/functions/_shared/qa.ts was written for GENERATED apps. This runs it against
// the app that generates them, where the same defects are just as possible and had never been
// looked for. On its first run it found five real ones: an editor tab strip, a file tree, a data
// grid, an upload drop-zone and a lead list — every one of them mouse-only.
//
// It also found nine that were not real, and narrowing the rule to clear them is what makes this
// worth keeping. Real UI code is full of click handlers that are NOT controls (modal backdrops,
// click-away dismissers, stopPropagation guards) and of markup assembled inside template literals
// whose handlers are attached by delegation. Those are now exempt, and the rule is 6-for-6 on this
// codebase rather than 6-for-15.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProject } from '../src/lib/qaCheck.ts';

function collect(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git'].includes(e)) continue;
    const p = join(dir, e), rel = `${base}/${e}`;
    if (statSync(p).isDirectory()) out.push(...collect(p, rel));
    else if (/\.tsx$/.test(e)) out.push({ path: rel, content: readFileSync(p, 'utf8') });
  }
  return out;
}

const files = collect('src', '/src');
// validateProject also resolves imports and routes, which is meaningless against a repo laid out
// differently from a generated app. Only the interaction findings apply here.
const INTERACTION = /does nothing when clicked|ReferenceError|unreachable by keyboard|discards what was typed/;
const issues = validateProject(files).filter((i) => INTERACTION.test(i.message));

console.log(`self-interaction-lint: ${files.length} .tsx files`);
for (const i of issues) console.log(`  ${i.severity === 'error' ? 'ERR ' : 'warn'} ${i.path}\n       ${i.message}`);
const errors = issues.filter((i) => i.severity === 'error').length;
console.log(`  ${issues.length ? '' : 'ok   nothing found\n'}\nself-interaction-lint: ${issues.length} finding(s), ${errors} error(s)`);
if (issues.length) throw new Error(`${issues.length} interaction finding(s) in the app's own source`);
