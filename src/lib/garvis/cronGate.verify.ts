// Run: npx tsx src/lib/garvis/cronGate.verify.ts
// The clock gate's contract (paired suite for the mutation looking-glass, SW10.12): constant-time
// equality that is actually EQUALITY, and authorization only when a REAL secret matches a REAL
// header — either pair suffices, absence of both refuses.

import { timingSafeEqual, cronAuthorized, type CronGateEnv } from '../../../supabase/functions/_shared/cronGate';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// ---- the comparison itself ----
check('equal strings are equal', timingSafeEqual('secret-1', 'secret-1') === true);
check('a one-byte difference refuses', timingSafeEqual('secret-1', 'secret-2') === false);
check('a length difference refuses', timingSafeEqual('secret', 'secret-1') === false);
check('empty vs empty is equal (the caller guards emptiness)', timingSafeEqual('', '') === true);
check('a difference ANYWHERE refuses (first byte too)', timingSafeEqual('Xecret-1', 'secret-1') === false);

// ---- the gate ----
const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n] ?? null } });
const env = (e: Record<string, string>): CronGateEnv => ({ get: (n) => e[n] });

check('a matching cron secret authorizes',
  cronAuthorized(req({ 'x-cron-secret': 's1' }), env({ CRON_SECRET: 's1' })) === true);
check('a matching worker secret authorizes (either pair suffices)',
  cronAuthorized(req({ 'x-worker-secret': 's2' }), env({ WORKER_SECRET: 's2' })) === true);
check('a wrong secret refuses',
  cronAuthorized(req({ 'x-cron-secret': 'wrong' }), env({ CRON_SECRET: 's1' })) === false);
check('NO CONFIGURED SECRET refuses — an empty env can never be matched',
  cronAuthorized(req({ 'x-cron-secret': '' }), env({})) === false);
check('an empty header refuses even when a secret exists',
  cronAuthorized(req({}), env({ CRON_SECRET: 's1' })) === false);
check('an empty configured secret refuses (fail-closed on misconfiguration)',
  cronAuthorized(req({ 'x-cron-secret': '' }), env({ CRON_SECRET: '' })) === false);
check('a cron header never matches the WORKER secret (pairs do not cross)',
  cronAuthorized(req({ 'x-cron-secret': 's2' }), env({ WORKER_SECRET: 's2' })) === false);
check('NO REACHABLE ENVIRONMENT refuses — under tsx there is no Deno, and the gate must not open',
  cronAuthorized(req({ 'x-cron-secret': 's1' })) === false);

console.log(`\ncronGate.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} cron gate check(s) failed`);
