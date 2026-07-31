// scripts/prototype-source-audit.mjs — catch the one dishonesty a browser cannot show you.
//
//   npm run verify:prototypesource
//
// THE DEFECT THIS EXISTS FOR
// A prototype writes a computed figure into an element:
//
//     <span id="total">$47.12</span>          <!-- typed by hand, and wrong -->
//     ...
//     $('total').textContent = money(grandTotal);   // computes $45.63
//
// The script overwrites the literal before first paint, so the page is correct, every runtime
// assertion passes, and the source still carries a second — stale, wrong — source of truth for a
// number the data already knows. It shipped exactly this way in the-ledger ($47.12 / 214 against
// real values of $45.63 / 45) and again in the-request ("Eight steps"). Both were found by reading,
// which does not scale and does not run in CI. This does.
//
// WHY IT IS A `verify:*` SCRIPT
// It is pure: it reads files and does string analysis. No browser, no network, no database. That is
// the contract for the suites CI runs automatically, so this one is picked up with the rest and
// costs nothing — unlike the browser tier, which needs Chromium and its own gate.
//
// WHAT IT DELIBERATELY DOES NOT FLAG
// A lone "0" (a genuine zero start, e.g. a counter at rest), CSS, attributes, script contents, and
// any element the script never writes to. False positives here would send someone to "fix" correct
// code, so the rule is narrow on purpose: only slots the script demonstrably overwrites.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../prototypes/', import.meta.url).pathname;
const files = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();

let failed = 0, checked = 0;
const problems = [];

/** Every element id the script assigns text/HTML into. */
function writtenIds(src) {
  const ids = new Set();
  const patterns = [
    /\$\(\s*['"]([\w-]+)['"]\s*\)\s*\.\s*(?:textContent|innerHTML|innerText)\s*=/g,
    /getElementById\(\s*['"]([\w-]+)['"]\s*\)\s*\.\s*(?:textContent|innerHTML|innerText)\s*=/g,
    /querySelector\(\s*['"]#([\w-]+)['"]\s*\)\s*\.\s*(?:textContent|innerHTML|innerText)\s*=/g,
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) ids.add(m[1]);
  return ids;
}

/** The literal text sitting inside <tag id="x"> … </tag> in the markup, tags stripped. */
function initialContent(src, id) {
  // Find the opening tag, then walk to its matching close. Prototypes keep these slots shallow
  // (a span or a div), so a non-nesting scan is sufficient and avoids a DOM dependency.
  const open = new RegExp(`<(\\w+)([^>]*\\bid=["']${id}["'][^>]*)>`, 'i');
  const m = src.match(open);
  if (!m) return null;
  const tag = m[1];
  const start = m.index + m[0].length;
  const close = src.indexOf(`</${tag}>`, start);
  if (close === -1) return null;
  return src.slice(start, close).replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

/**
 * Does this initial content carry a figure that could go stale?
 *
 * The first version of this check flagged any digit at all and was wrong 3 times out of 5 — it
 * objected to the "P2" in a prototype's own name and to two stopwatches resting at 0:00. Both are
 * fine: a label is not a quantity, and a zero start is the honest value, not a duplicate of one.
 * So two exemptions, and nothing more, because every exemption is also a place a real defect can
 * hide.
 */
function significantFigure(text) {
  const stripped = text
    .replace(/^P\d+\s*·\s*/, '')                 // "P2 · Explore…" — the prototype's own label
    .replace(/\$?\b0+(?:[.:]0+)*%?\b/g, '');     // 0, 0:00, 0.00, $0.00, 0% — a genuine resting zero
  return /\d/.test(stripped);
}

console.log('prototype-source-audit — slots the script writes must not be pre-filled with figures\n');

for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8');
  const ids = writtenIds(src);
  const bad = [];
  for (const id of ids) {
    const initial = initialContent(src, id);
    if (initial === null || initial === '') continue;
    checked++;
    if (significantFigure(initial)) bad.push({ id, initial: initial.slice(0, 60) });
  }
  if (bad.length) {
    failed += bad.length;
    problems.push({ f, bad });
    console.log(`  FAIL ${f}`);
    for (const b of bad) {
      console.log(`       #${b.id} is pre-filled with "${b.initial}" but the script overwrites it.`);
      console.log(`       Empty the markup slot — the figure belongs to the data object alone.`);
    }
  } else {
    console.log(`  ok   ${f} — ${ids.size} script-written slot(s), none pre-filled with a figure`);
  }
}

console.log(`\nprototype-source-audit: ${files.length} files, ${checked} pre-filled slot(s) examined, ${failed} problem(s)`);
if (failed) {
  console.error(
    '\nA figure is typed into markup for a slot the script computes. This is invisible at runtime —\n' +
    'the page renders correctly and every browser test passes — which is exactly why it needs\n' +
    'catching here. See the-ledger ($47.12 vs $45.63) for how long one can survive unnoticed.',
  );
  throw new Error(`${failed} second source(s) of truth`);
}
