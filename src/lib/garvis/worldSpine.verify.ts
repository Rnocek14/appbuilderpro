// worldSpine.verify.ts — the world_id spine (app_0114) stays wired end to end.
// Source pins in the agentRunControl style: the spine is only real if every stamp survives —
// the ledger trigger, the vector stamp, the retrieval scope, and the inbound best-effort.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const migration = readFileSync(join(root, 'supabase/migrations/app_0114_world_spine.sql'), 'utf8');
const embedWorker = readFileSync(join(root, 'supabase/functions/embed-worker/index.ts'), 'utf8');
const inbound = readFileSync(join(root, 'supabase/functions/resend-inbound/index.ts'), 'utf8');
const ask = readFileSync(join(root, 'src/lib/garvis/ask.ts'), 'utf8');

let failed = 0;
const check = (name: string, pass: boolean) => {
  console.log(`  ${pass ? 'ok ' : 'FAIL'} - ${name}`);
  if (!pass) failed++;
};

// -- the migration: three stamped ledgers + a scoped RPC, no overload ambiguity --
check('execution_runs gains world_id + the approvals auto-stamp trigger',
  migration.includes('trg_execution_runs_world') && migration.includes('from public.approvals a where a.id = new.approval_id'));
check('execution_runs backfilled from the approvals lineage', /update public\.execution_runs r\s+set world_id = a\.world_id/.test(migration));
check('usage_events gains world_id + index', migration.includes('idx_usage_events_world'));
check('embeddings gains world_id, backfilled from documents AND artifacts-via-cluster AND clusters',
  (migration.match(/set world_id = /g) ?? []).length >= 4);
check('match_embeddings is DROPPED before recreation (no PostgREST overload ambiguity)',
  migration.includes('drop function if exists public.match_embeddings(uuid, vector, int, text, float, uuid);'));
check('match_embeddings filters by _world', migration.includes('(_world is null or e.world_id = _world)'));

// -- embed-worker: world resolved SERVER-side, never trusted from the client --
check('embed-worker resolves document worlds server-side', embedWorker.includes("from('documents').select('id, world_id')"));
check('embed-worker resolves artifact worlds via their cluster', embedWorker.includes("knowledge_clusters(world_id)"));
check('embed-worker stamps world_id on every row', embedWorker.includes('world_id: worldBySubject.get('));

// -- retrieval: the bleed is closed at the index, not post-hoc --
check('ask vectorHits threads the world into the RPC', ask.includes('_world: worldId ?? null'));
check('the account-wide-vector escape hatch is gone', !ask.includes('vector is account-wide'));
check('scoped asks pass worldId to vectorHits', (ask.match(/vectorHits\(q, uid, opts\?\.worldId\)/g) ?? []).length >= 2);

// -- inbound: best-effort stamp from a known contact, honest null otherwise --
check('resend-inbound stamps world from a known contact', inbound.includes('world_id: mailWorldId'));

console.log(`\nworldSpine.verify: ${13 - failed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} world-spine check(s) failed`);
