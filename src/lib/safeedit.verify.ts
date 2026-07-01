// src/lib/safeedit.verify.ts
// Verifies the Phase-1 safe-import / safe-edit invariants (run: `npm run verify:safeedit`).
// Pure-function asserts over supabase-free modules (matches the garvis *.verify.ts pattern).
//   1. .env secrets are redacted on import; .env.example passes through untouched.
//   2. The edit guardrail blocks writes/deletes to existing files the model couldn't see, but
//      allows visible edits and brand-new files.

import { isEnvSecretFile, redactEnvValues } from './importSafety';
import { applyEditGuardrail } from './contextBudget';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// 1. Redaction.
check('.env is treated as a secret file', isEnvSecretFile('/.env') && isEnvSecretFile('/app/.env.production'));
check('.env.example is NOT a secret file', !isEnvSecretFile('/.env.example') && !isEnvSecretFile('/.env.sample'));
check('non-env files are not secret files', !isEnvSecretFile('/src/config.ts') && !isEnvSecretFile('/package.json'));

const env = 'SUPABASE_URL=https://abc.supabase.co\n# comment\nexport API_KEY = sk-secret-123\n\nPLAIN';
const redacted = redactEnvValues(env);
check('redaction strips real secret values', !redacted.includes('abc.supabase.co') && !redacted.includes('sk-secret-123'));
check('redaction keeps the keys', redacted.includes('SUPABASE_URL=') && redacted.includes('API_KEY ='));
check('redaction preserves comments + non-assignment lines', redacted.includes('# comment') && redacted.includes('PLAIN'));

// 2. Guardrail. Files are large enough that only the keyword-matched one fits the context budget,
//    so the other two are deterministically trimmed out (not visible to the model).
const big = 'x'.repeat(100_000); // 3 × 100k = 300k > 160k budget → only the top-scored file fits
const appFiles = [
  { path: '/src/Visible.tsx', content: `update visible component ${big}` }, // keyword-matched → visible
  { path: '/src/UnseenA.tsx', content: big },                               // trimmed out
  { path: '/src/UnseenB.tsx', content: big },                               // trimmed out
];
const message = 'update the visible component';
const changes = [
  { path: '/src/Visible.tsx', content: 'edited' }, // visible existing → allowed
  { path: '/src/UnseenA.tsx', content: 'edited' }, // existing but unseen → BLOCKED
  { path: '/src/New.tsx', content: 'created' },     // brand new → allowed
];
const { safeChanges, blocked } = applyEditGuardrail(appFiles, message, '', changes, ['/src/UnseenB.tsx']);
const safePaths = safeChanges.map((c) => c.path);
check('guardrail allows a visible existing-file edit', safePaths.includes('/src/Visible.tsx'));
check('guardrail allows a brand-new file', safePaths.includes('/src/New.tsx'));
check('guardrail BLOCKS an edit to an existing unseen file', !safePaths.includes('/src/UnseenA.tsx') && blocked.includes('/src/UnseenA.tsx'));
check('guardrail blocks a deletion of an unseen file', blocked.includes('/src/UnseenB.tsx'));

// Small project (untrimmed): nothing is ever blocked.
const small = [{ path: '/src/A.tsx', content: 'a' }, { path: '/src/B.tsx', content: 'b' }];
const r2 = applyEditGuardrail(small, 'anything', '', [{ path: '/src/B.tsx', content: 'edited' }], []);
check('small projects never block (all files visible)', r2.blocked.length === 0 && r2.safeChanges.length === 1);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) throw new Error(`${failed} safe-edit check(s) failed`);
