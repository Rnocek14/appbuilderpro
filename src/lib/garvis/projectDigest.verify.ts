// Run: npx tsx src/lib/garvis/projectDigest.verify.ts
// Pins the digest contract: the fingerprint catches every kind of source change (so auto-refresh
// cannot be missed by a new write path), metadata never counts as source, and a stale summary is
// LABELLED rather than passed off as current.
import {
  DIGEST_PATH, composeProjectContext, fingerprintFiles, formatDigest, isDigestStale,
  parseDigest, projectTree, sourceFiles, summaryPrompt, SUMMARY_SYSTEM, type DigestFile,
} from './projectDigest';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const base: DigestFile[] = [
  { path: '/src/App.tsx', content: 'export function App() { return <Home /> }' },
  { path: '/src/Home.tsx', content: 'export function Home() { return <h1>Hi</h1> }' },
  { path: '/package.json', content: '{"name":"app"}' },
];

// WHAT COUNTS AS SOURCE.
{
  const withNoise: DigestFile[] = [
    ...base,
    { path: '/.fableforge/brain.md', content: 'my notes' },
    { path: '/.fableforge/digest.md', content: 'the digest itself' },
    { path: '/node_modules/react/index.js', content: 'huge' },
    { path: '/package-lock.json', content: 'enormous' },
    { path: '/public/logo.png', content: 'binary-ish' },
  ];
  const src = sourceFiles(withNoise).map((f) => f.path);
  check('metadata, vendored code, lockfiles and binaries are not source',
    src.length === 3 && !src.some((p) => /fableforge|node_modules|lock|png/.test(p)));
  check('the digest never fingerprints itself (no self-invalidating loop)',
    !sourceFiles(withNoise).some((f) => f.path === DIGEST_PATH));
}

// THE FINGERPRINT — the whole auto-refresh mechanism rests on this.
{
  const fp = fingerprintFiles(base);
  check('deterministic', fp === fingerprintFiles(base));
  check('row order does not matter (DB order is not stable)',
    fp === fingerprintFiles([base[2]!, base[0]!, base[1]!]));
  check('EDITING a file moves it',
    fp !== fingerprintFiles([{ ...base[0]!, content: 'export function App() { return <Dash /> }' }, base[1]!, base[2]!]));
  check('a SAME-LENGTH edit still moves it (length alone would miss this)',
    (() => {
      const same = 'export function App() { return <Homf /> }';
      return same.length === base[0]!.content.length && fp !== fingerprintFiles([{ ...base[0]!, content: same }, base[1]!, base[2]!]);
    })());
  check('ADDING a file moves it', fp !== fingerprintFiles([...base, { path: '/src/New.tsx', content: 'x' }]));
  check('DELETING a file moves it', fp !== fingerprintFiles(base.slice(1)));
  check('RENAMING a file moves it',
    fp !== fingerprintFiles([{ ...base[0]!, path: '/src/Main.tsx' }, base[1]!, base[2]!]));
  check('touching only METADATA does NOT move it (notes are not code)',
    fp === fingerprintFiles([...base, { path: '/.fableforge/brain.md', content: 'rewritten notes' }]));
  check('the fingerprint is short enough to store in a comment', fp.length < 30);
}

// STORAGE ROUND-TRIP.
{
  const raw = formatDigest('3-abc12345', 'A todo app with a login screen.');
  const parsed = parseDigest(raw);
  check('round-trips', parsed?.fingerprint === '3-abc12345' && parsed.summary === 'A todo app with a login screen.');
  check('a missing digest parses as null (→ regenerate)', parseDigest(null) === null && parseDigest('') === null);
  check('a digest with no fingerprint header is null (→ regenerate)', parseDigest('just some text') === null);
  check('a fingerprint with no summary is null (→ regenerate)', parseDigest(formatDigest('3-abc12345', '   ')) === null);
}

// STALENESS.
{
  const fp = fingerprintFiles(base);
  check('no stored digest → stale', isDigestStale(null, fp));
  check('matching fingerprint → fresh', !isDigestStale({ fingerprint: fp, summary: 's' }, fp));
  check('drifted fingerprint → stale', isDigestStale({ fingerprint: 'other', summary: 's' }, fp));
}

// THE TREE.
{
  check('sorted and complete for a small project', projectTree(base) === '/package.json\n/src/App.tsx\n/src/Home.tsx');
  const many = Array.from({ length: 80 }, (_, i) => ({ path: `/src/f${String(i).padStart(2, '0')}.ts`, content: 'x' }));
  const tree = projectTree(many);
  check('caps long trees and says how many it dropped', tree.includes('…and 20 more files') && tree.split('\n').length === 61);
  check('an empty project says so honestly', projectTree([]) === '(no source files yet)');
}

// THE COMPOSED CONTEXT — what the brain tier actually sees.
{
  const ctx = composeProjectContext({
    name: 'Mind Weave Recover', description: 'Stroke recovery exercises', files: base,
    brain: '## North Star\nHelp families run daily aphasia practice.', summary: 'A React app with a home screen.',
  });
  check('carries name, description, file count, tree, notes and summary',
    ctx.includes('PROJECT: Mind Weave Recover') && ctx.includes('Stroke recovery exercises')
    && ctx.includes('FILES (3)') && ctx.includes('/src/App.tsx')
    && ctx.includes('Help families run daily aphasia practice') && ctx.includes('A React app with a home screen'));
  check('a FRESH summary is not labelled stale', !/OUT OF DATE/.test(ctx));

  const stale = composeProjectContext({ name: 'X', files: base, summary: 'Old news.', summaryStale: true });
  check('a STALE summary is labelled, never passed off as current',
    stale.includes('OUT OF DATE') && stale.includes('Old news.'));

  const untouched = composeProjectContext({
    name: 'X', files: base,
    brain: '## North Star\nThe one sentence that captures what this is and why it matters.\n\n## Vision\n',
  });
  check('the untouched brain TEMPLATE is skipped (no empty headings in the prompt)',
    !untouched.includes('OPERATOR'));

  check('the free layer stands alone with no AI summary at all',
    (() => { const free = composeProjectContext({ name: 'X', files: base }); return free.includes('FILES (3)') && !free.includes('WHAT THE CODE DOES'); })());
  check('an empty project still composes without crashing',
    composeProjectContext({ name: 'X', files: [] }).includes('(no source files yet)'));
}

// SIZE — the whole point is that this is CHEAP. Guard the budget.
{
  const big: DigestFile[] = Array.from({ length: 200 }, (_, i) => ({ path: `/src/deep/nested/module${i}.ts`, content: 'x'.repeat(4000) }));
  const ctx = composeProjectContext({
    name: 'Big App', description: 'd'.repeat(400), files: big,
    brain: 'b'.repeat(9000), summary: 's'.repeat(9000),
  });
  check('a 200-file project with huge notes still fits a few thousand tokens', ctx.length < 12_000);
  check('…and clips rather than truncating mid-structure', ctx.includes('…and 140 more files') && ctx.includes('…'));
}

// THE SUMMARY REQUEST — honesty is instructed, not hoped for.
{
  check('the summary system prompt forbids guessing', /never guess|only what the files actually show/i.test(SUMMARY_SYSTEM));
  check('…and asks for incompleteness to be named', /stub|TODO|incomplete/i.test(SUMMARY_SYSTEM));
  const p = summaryPrompt('App', '/src/App.tsx', 'export const x = 1');
  check('the prompt carries name, tree and code', p.includes('App') && p.includes('/src/App.tsx') && p.includes('export const x = 1'));
}

console.log(`\nprojectDigest.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} projectDigest check(s) failed`);
