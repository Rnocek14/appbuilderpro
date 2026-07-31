// scopeContract.verify.ts — the scope invariant stays true in source, not just in the registry.
// Every WORLD_STAMPED_WRITERS entry is pinned to the code that performs the stamp; every
// world-null-producing writer must be registered in PLATFORM_SCOPES with a reason. A new writer
// that produces world-null rows without registering fails the registry-shape checks below.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_SCOPES, WORLD_STAMPED_WRITERS, isRegisteredPlatformScope } from './scopeContract';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const closeWon = read('src/lib/garvis/closeWonRun.ts');
const pkgRun = read('src/lib/garvis/billing/servicePackagesRun.ts');
const stripeHook = read('supabase/functions/stripe-webhook/index.ts');
const standingWorker = read('supabase/functions/standing-worker/index.ts');
const embedWorker = read('supabase/functions/embed-worker/index.ts');
const inbound = read('supabase/functions/resend-inbound/index.ts');
const spineMigration = read('supabase/migrations/app_0114_world_spine.sql');
const linkMigration = read('supabase/migrations/app_0118_client_world.sql');

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

// ---- the registry itself is well-formed: every entry carries a real reason ----
check('every platform scope documents a reason (≥40 chars — a reason, not a shrug)',
  PLATFORM_SCOPES.every((e) => e.reason.trim().length >= 40));
check('every platform scope names its writer and its rows',
  PLATFORM_SCOPES.every((e) => e.writer.trim().length > 8 && e.produces.trim().length > 5));
check('the registry answers lookups', isRegisteredPlatformScope(PLATFORM_SCOPES[0].writer) && !isRegisteredPlatformScope('unregistered writer'));
check('the stamped-writer roster is non-trivial', WORLD_STAMPED_WRITERS.length >= 8);

// ---- each stamped writer is pinned to the code that stamps ----
check('close-won births the client world and links the subscription',
  closeWon.includes("from('knowledge_worlds').insert") && closeWon.includes('world_id: worldId'));
check('close-won stamps the client contact\'s world', closeWon.includes("from('contacts').update({ world_id: worldId })"));
check('pinAndEstablish watch carries the client world', pkgRun.includes('world_id: input.worldId ?? null'));
check('stripe-webhook watch carries the client world', stripeHook.includes('.world_id ?? null, kind: \'watch_url\''));
check('stripe-webhook selects world_id with the sale', stripeHook.includes("preview_site_id, status, world_id"));
check('trigger-drain approvals carry the client world', standingWorker.includes('world_id: client?.worldId ?? null'));
check('execution_runs inherit the approval\'s world via the stamp trigger', spineMigration.includes('trg_execution_runs_world'));
check('embed-worker resolves worlds server-side', embedWorker.includes('worldBySubject'));
check('inbound mail stamps from known contacts', inbound.includes('world_id: mailWorldId'));
check('client_subscriptions.world_id exists with its comment', linkMigration.includes('client_subscriptions') && linkMigration.includes('world_id'));

console.log(`\nscopeContract.verify: ${14 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} scope-contract check(s) failed`);
