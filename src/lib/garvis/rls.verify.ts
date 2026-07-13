// src/lib/garvis/rls.verify.ts — RLS COVERAGE, proven statically over the real migrations.
// The double-check found the exact bug this guards against: a new owner-scoped table shipped
// without a complete policy. This reads every app_00NN migration (the source of truth), reconstructs
// the final table+policy state, and FAILS if any table with an owner_id column lacks RLS or an
// owner policy. World-ownership pins are reported for review (some world_id columns are nullable
// set-null and legitimately unpinned, so that's a report, not a hard fail).
// Run: npx tsx src/lib/garvis/rls.verify.ts

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '../../../supabase/migrations');

const files = readdirSync(migDir).filter((f) => /^app_00\d+.*\.sql$/.test(f)).sort();
const sql = files.map((f) => readFileSync(join(migDir, f), 'utf8')).join('\n\n');
const lower = sql.toLowerCase();
// Whitespace-normalized copy: migrations align statements with runs of spaces, so substring checks
// must not assume single spaces.
const norm = lower.replace(/\s+/g, ' ');

// Some early migrations enable RLS + create owner policies dynamically inside a DO block:
//   foreach t in array['knowledge_worlds', …] loop execute format('… public.%I … owner_id = auth.uid() …')
// A static matcher can't see the table name next to the statement, so collect names covered that way:
// any quoted identifier inside an array[…] literal whose surrounding DO block enables RLS.
const dynamicRls = new Set<string>();
const dynamicOwnerPolicy = new Set<string>();
for (const block of lower.split('do $$').slice(1)) {
  const stops = block.indexOf('$$;');
  const body = stops === -1 ? block : block.slice(0, stops);
  if (!body.includes('enable row level security')) continue;
  const hasOwner = /owner_id\s*=\s*auth\.uid\(\)/.test(body);
  for (const arr of body.match(/array\s*\[[^\]]*\]/g) ?? []) {
    for (const q of arr.match(/'(\w+)'/g) ?? []) {
      const name = q.replace(/'/g, '');
      dynamicRls.add(name);
      if (hasOwner) dynamicOwnerPolicy.add(name);
    }
  }
}

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// Tables deliberately NOT owner-per-row (documented exceptions). If you add one, justify it here.
const ALLOW_NO_OWNER_POLICY = new Set<string>([
  'system_heartbeat', // read-all-authenticated liveness board; writes are service-role only (app_0060)
]);

// --- reconstruct every created public table + its CREATE block ---------------------------------
interface Table { name: string; block: string }
const tables: Table[] = [];
const createRe = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi;
for (let m = createRe.exec(sql); m; m = createRe.exec(sql)) {
  tables.push({ name: m[1].toLowerCase(), block: m[2].toLowerCase() });
}
check('found the migration corpus', files.length > 40 && tables.length > 20);

// --- map each table to the text of every policy declared on it (normalized) --------------------
const policyText = new Map<string, string>();
for (const frag of norm.split('create policy').slice(1)) {
  const on = /on public\.(\w+)/.exec(frag);
  if (!on) continue;
  const t = on[1];
  // Cut the fragment at the next statement boundary so we don't bleed into the following policy.
  const body = frag.slice(0, frag.indexOf(';') === -1 ? undefined : frag.indexOf(';') + 1);
  policyText.set(t, (policyText.get(t) ?? '') + ' ' + body);
}

// --- the enforced invariant: owner_id tables have RLS + an owner policy -------------------------
const ownerTables = tables.filter((t) => /\bowner_id\b/.test(t.block));
check('owner-scoped tables discovered', ownerTables.length > 15);

const missingRls: string[] = [];
const missingOwnerPolicy: string[] = [];
for (const t of ownerTables) {
  const rlsOn = norm.includes(`alter table public.${t.name} enable row level security`) || dynamicRls.has(t.name);
  if (!rlsOn) missingRls.push(t.name);
  if (ALLOW_NO_OWNER_POLICY.has(t.name)) continue;
  const pol = policyText.get(t.name) ?? '';
  // The owner gate can be written as `owner_id = auth.uid()` or `auth.uid() = owner_id`.
  const ownerGated = /owner_id\s*=\s*auth\.uid\(\)/.test(pol) || /auth\.uid\(\)\s*=\s*owner_id/.test(pol)
    || dynamicOwnerPolicy.has(t.name);
  if (!ownerGated) missingOwnerPolicy.push(t.name);
}
if (missingRls.length) console.error('   tables missing RLS:', missingRls.join(', '));
if (missingOwnerPolicy.length) console.error('   tables missing an owner policy:', missingOwnerPolicy.join(', '));
check('every owner_id table has RLS enabled', missingRls.length === 0);
check('every owner_id table has an owner-gated policy', missingOwnerPolicy.length === 0);

// --- world-ownership pin coverage (report, since nullable set-null world_id can be unpinned) ----
// World-ownership pins are defense-in-depth: these tables are ALREADY tenant-isolated by their
// owner_id policy (a user can only ever insert their own owner_id, and only ever reads their own
// rows). A pin additionally forbids tagging a row with a world_id you don't own. New tables should
// carry it (the farm/esign/mls/timeline set does); older owner-scoped tables are safe without it.
// So this is a REVIEW report, not a hard fail — pinning every legacy table is a separate migration.
const worldTables = ownerTables.filter((t) => /world_id\s+uuid[\s\S]*knowledge_worlds/.test(t.block));
const unpinned: string[] = [];
for (const t of worldTables) {
  const pol = policyText.get(t.name) ?? '';
  const pinned = /knowledge_worlds w[\s\S]*w\.owner_id = auth\.uid\(\)/.test(pol);
  if (!pinned) unpinned.push(t.name);
}
console.log(`   [review] world-ownership pins: ${worldTables.length - unpinned.length}/${worldTables.length} pinned`
  + (unpinned.length ? `; legacy-unpinned (owner_id still isolates these): ${unpinned.join(', ')}` : ''));

console.log(`\nrls.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
