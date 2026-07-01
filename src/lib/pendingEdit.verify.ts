// src/lib/pendingEdit.verify.ts
// Verifies buildPendingFiles (run: `npm run verify:pendingedit`). Pure asserts, no DB.

import { buildPendingFiles } from './pendingEdit';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const current = [
  { path: '/src/A.tsx', content: 'old A' },
  { path: '/src/B.tsx', content: 'old B' },
];
const changes = [
  { path: '/src/A.tsx', content: 'new A' }, // edit existing
  { path: '/src/New.tsx', content: 'brand new' }, // new file
];
const pending = buildPendingFiles(current, changes);

check('maps before from current content for an existing file', pending[0].before === 'old A' && pending[0].after === 'new A');
check('existing file is not flagged new', pending[0].isNew === false);
check('new file has empty before', pending[1].before === '' && pending[1].after === 'brand new');
check('new file is flagged new', pending[1].isNew === true);
check('preserves change order', pending.map((p) => p.path).join(',') === '/src/A.tsx,/src/New.tsx');
check('does not include untouched files', pending.length === 2 && !pending.some((p) => p.path === '/src/B.tsx'));

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} pendingEdit check(s) failed`);
