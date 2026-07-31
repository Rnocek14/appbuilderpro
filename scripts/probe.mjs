// scripts/probe.mjs — point the generic behavioural prober at self-contained pages.
//
//   npm run probe:prototypes
//   node scripts/probe.mjs prototypes/minute-zero.html --verbose
//
// The prober itself lives in scripts/lib/probe-core.mjs, shared with scripts/generated-app-probe.mjs
// so a fix to its judgement reaches both callers. This file is just the CLI over file:// pages.
//
// WHAT A GREEN RUN MEANS: the page loads and renders without errors, stops changing, offers
// controls, every control does something and none of them throws, everything is keyboard-reachable,
// reduced motion survives, and nothing overflows a phone. That is "not broken" — a real bar, and a
// much lower one than "good". The claim suites (walkthrough:*) are what test whether each page
// keeps the specific promise it makes on screen.
//
// THE PROBER HAS BEEN WRONG BEFORE, AND THE HISTORY IS IN probe-core:
// its first run reported six problems across the prototypes and five were its own — a live
// stopwatch read as "never settled", an already-selected tab read as "dead", overflow that only
// existed because it resized a desktop layout. Treat a new check here as suspect until it has been
// run against pages known to be good.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { probeUrl, launchOptions } from './lib/probe-core.mjs';

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('usage: node scripts/probe.mjs <file.html> [...]'); process.exit(2); }

const browser = await chromium.launch(launchOptions(existsSync));
const results = [];
for (const f of files) {
  process.stdout.write(`probing ${f} … `);
  const r = await probeUrl(browser, `file://${resolve(f)}`, { name: f.split('/').pop() });
  const failed = r.findings.filter((x) => !x.ok).length;
  console.log(failed ? `${failed} problem(s)` : 'clean');
  results.push(r);
}
await browser.close();

console.log('\n' + '='.repeat(78));
let totalFail = 0;
for (const r of results) {
  const fails = r.findings.filter((f) => !f.ok);
  totalFail += fails.length;
  console.log(`\n${r.name}  —  ${fails.length ? `${fails.length} PROBLEM(S)` : 'no problems found'}`);
  for (const f of r.findings) {
    if (f.label.startsWith('·')) { if (VERBOSE) console.log(`     ${f.label} ${f.detail}`); continue; }
    if (!f.ok || VERBOSE) console.log(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.label}${f.detail ? ' — ' + f.detail : ''}`);
  }
}
console.log(`\n${'='.repeat(78)}\n${results.length} page(s) probed · ${totalFail} problem(s) total`);
console.log('Reminder: this proves "not broken", which is not the same claim as "good".');
process.exit(totalFail ? 1 : 0);
