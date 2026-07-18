// src/lib/branches.verify.ts
// Verifies the pure feature-branch logic (run: `npm run verify:branches`). Pure asserts, no DB.
// Covers: overlay decoding, the composed branch view, three-way merge classification, and
// candidate building — the invariants the readiness-gated merge depends on.

import {
  readBranchState, composeBranchFiles, classifyBranch, buildCandidate, summarizeBranch,
  branchWorkPath, branchBasePath, branchManifestPath,
} from './branchCore';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const B = 'b-test';

// Project rows: Main app files, a meta file, and branch b-test's overlay.
const rows = [
  { path: '/src/App.tsx', content: 'main app v2' },          // Main moved on after the fork
  { path: '/src/Nav.tsx', content: 'nav v1' },               // untouched by Main since fork
  { path: '/src/Old.tsx', content: 'old v1' },               // branch deleted it; Main unchanged
  { path: '/src/Hot.tsx', content: 'hot v2' },               // branch deleted it; Main CHANGED it
  { path: '/.fableforge/brain.md', content: 'brain' },       // meta passes through
  { path: branchWorkPath(B, '/src/App.tsx'), content: 'branch app' },
  { path: branchBasePath(B, '/src/App.tsx'), content: 'main app v1' },
  { path: branchWorkPath(B, '/src/Nav.tsx'), content: 'branch nav' },
  { path: branchBasePath(B, '/src/Nav.tsx'), content: 'nav v1' },
  { path: branchWorkPath(B, '/src/New.tsx'), content: 'brand new' },   // no base → branch-created
  { path: branchBasePath(B, '/src/Hot.tsx'), content: 'hot v1' },      // frozen at delete time
  { path: branchManifestPath(B), content: JSON.stringify({ deleted: ['/src/Old.tsx', '/src/Hot.tsx'] }) },
];

// ---- readBranchState ----
const st = readBranchState(rows, B);
check('decodes working copies at their real paths', st.overrides.get('/src/App.tsx') === 'branch app' && st.overrides.get('/src/New.tsx') === 'brand new');
check('decodes frozen bases', st.bases.get('/src/App.tsx') === 'main app v1');
check('decodes tombstones from the manifest', st.deleted.has('/src/Old.tsx') && st.deleted.has('/src/Hot.tsx'));
check('ignores other branches', readBranchState(rows, 'other').overrides.size === 0);

// ---- composeBranchFiles ----
const view = composeBranchFiles(rows, B);
const paths = view.map((f) => f.path).sort();
check('overlay replaces Main content', view.find((f) => f.path === '/src/App.tsx')?.content === 'branch app');
check('branch-created file appears', view.find((f) => f.path === '/src/New.tsx')?.content === 'brand new');
check('tombstoned files are hidden', !paths.includes('/src/Old.tsx') && !paths.includes('/src/Hot.tsx'));
check('meta files pass through', paths.includes('/.fableforge/brain.md'));
check('branch bookkeeping rows are hidden', !paths.some((p) => p.startsWith('/.fableforge/branches/')));
check('untouched Main files show through', view.filter((f) => f.path === '/src/Nav.tsx').length === 1);

// ---- classifyBranch ----
const mainApp = new Map(rows.filter((r) => !r.path.startsWith('/.fableforge/')).map((r) => [r.path, r.content]));
const changes = classifyBranch(mainApp, st);
const action = (p: string) => changes.find((c) => c.path === p)?.action;
check('Main moved + branch edited → conflict', action('/src/App.tsx') === 'conflict');
check('Main unchanged since fork → take-branch', action('/src/Nav.tsx') === 'take-branch');
check('branch-created file → take-branch', action('/src/New.tsx') === 'take-branch');
check('delete where Main unchanged → delete', action('/src/Old.tsx') === 'delete');
check('delete where Main changed → delete-skipped', action('/src/Hot.tsx') === 'delete-skipped');
check('conflict carries all three versions', (() => {
  const c = changes.find((x) => x.path === '/src/App.tsx')!;
  return c.base === 'main app v1' && c.main === 'main app v2' && c.branch === 'branch app';
})());

// Branch and Main independently identical → noop (nothing to land).
const stNoop = readBranchState([
  { path: '/x.ts', content: 'same' },
  { path: branchWorkPath(B, '/x.ts'), content: 'same' },
  { path: branchBasePath(B, '/x.ts'), content: 'old' },
], B);
check('identical content → noop even if both diverged from base', classifyBranch(new Map([['/x.ts', 'same']]), stNoop)[0].action === 'noop');

// Main deleted a file the branch kept editing → branch restores it.
const stRestore = readBranchState([
  { path: branchWorkPath(B, '/gone.ts'), content: 'branch kept it' },
  { path: branchBasePath(B, '/gone.ts'), content: 'was here' },
], B);
check('Main deleted + branch edited → take-branch (restore)', classifyBranch(new Map(), stRestore)[0].action === 'take-branch');

// A write after a delete supersedes the tombstone.
const stRewrite = readBranchState([
  { path: '/y.ts', content: 'main y' },
  { path: branchWorkPath(B, '/y.ts'), content: 'rewritten' },
  { path: branchManifestPath(B), content: JSON.stringify({ deleted: ['/y.ts'] }) },
], B);
check('write after delete clears the tombstone', !stRewrite.deleted.has('/y.ts') && stRewrite.overrides.get('/y.ts') === 'rewritten');

// ---- buildCandidate ----
const resolutions = new Map([['/src/App.tsx', 'merged app']]);
const candidate = buildCandidate(mainApp, changes, resolutions);
check('candidate applies resolved conflicts', candidate.get('/src/App.tsx') === 'merged app');
check('candidate applies take-branch content', candidate.get('/src/Nav.tsx') === 'branch nav' && candidate.get('/src/New.tsx') === 'brand new');
check('candidate drops clean deletes', !candidate.has('/src/Old.tsx'));
check('candidate keeps Main\'s version for skipped deletes', candidate.get('/src/Hot.tsx') === 'hot v2');
check('unresolved conflict throws (never merged blind)', (() => {
  try { buildCandidate(mainApp, changes, new Map()); return false; } catch { return true; }
})());

// ---- summarizeBranch ----
const sum = summarizeBranch(rows, B);
check('summary counts landable changes (non-noop)', sum.changed === 5);
check('summary counts conflicts', sum.conflicts === 1);
check('summary counts skipped deletes', sum.skippedDeletes === 1);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} branches check(s) failed`);
