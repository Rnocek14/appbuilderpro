// Static proof that shipping source to GitHub goes THROUGH the approval spine (SW10.1) — and
// that the old door is closed. These checks guard the boundary where a client request used to
// carry arbitrary files and a raw token into a privileged executor.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const request = readFileSync(join(here, 'deployRun.ts'), 'utf8');
const client = readFileSync(join(here, 'execution.ts'), 'utf8');
const executor = readFileSync(join(root, 'supabase/functions/github-export/index.ts'), 'utf8');
const workspace = readFileSync(join(root, 'src/pages/ProjectWorkspace.tsx'), 'utf8');
const ttl = readFileSync(join(root, 'supabase/functions/_shared/approvalTtl.ts'), 'utf8');
const meta = readFileSync(join(root, 'src/components/garvis/approvalMeta.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0152_ship_repo_enum.sql'), 'utf8');

// --- the request side: what the owner reviews is what ships ---
check('the approval binds a hash of the captured snapshot',
  request.includes('files_hash: filesHash') && request.includes('hashPayload(input.files)'));
check('secret-bearing paths are refused at capture',
  request.includes('.fableforge') && request.includes('never ship to GitHub'));
check('a failed enqueue does not strand the snapshot',
  /requestRepoShip[\s\S]*?deploy_bundles'\)\.delete\(\)/.test(request));
check('the client executor sends only approval identity',
  /ship_repo'\)\s*\{[\s\S]{0,400}body:\s*\{\s*approval_id:\s*a\.id\s*\}/.test(client));
check('a soft failure returns the row to pending (retryable, never stranded)',
  /ship_repo'\)\s*\{[\s\S]{0,800}revertToPending\(a\.id\)/.test(client));

// --- the executor: everything from the approved row, nothing from the request ---
check('the old door is CLOSED: no approval_id → 4xx, before anything else is read',
  executor.includes("if (!approval_id) return json({ error: 'This export must go through Approvals"));
check('the raw githubToken passthrough is REMOVED', !executor.includes('githubToken'));
check('the token resolves server-side at execution time',
  executor.includes("freshProviderToken(admin, user.id, 'github')") && executor.includes("Deno.env.get('GITHUB_TOKEN')"));
check('the executor verifies kind, status, and owner',
  executor.includes("approval.kind !== 'ship_repo'") && executor.includes("approval.status !== 'approved'")
  && executor.includes('approval.owner_id !== user.id'));
check('the executor verifies the approval payload hash (tamper → 409)',
  executor.includes('payloadMatches(approval.payload, approval.payload_hash'));
check('the executor re-derives the snapshot hash from the bundle (tamper → 409)',
  executor.includes('hashPayload(files)) !== payload.files_hash'));
check('the executor verifies bundle ownership and project binding',
  executor.includes('bundle.owner_id !== user.id || bundle.project_id !== projectId'));
check('secret-bearing paths are re-refused server-side',
  executor.includes('.fableforge') && executor.includes('never ship to GitHub'));
check('retries return the durable result instead of pushing twice',
  executor.includes('if (previous?.executed)') && executor.includes('replayed: true'));
check('the executor has an atomic expiring execution claim',
  executor.includes("result->>ship_claimed_at") && executor.includes("eq('status', 'approved')"));
check('every outcome lands in the one execution ledger',
  executor.includes("connector: 'github', action: 'ship_repo'"));
check('the snapshot is one-shot — consumed on success',
  /result:\s*\{\s*executed:\s*true[\s\S]{0,400}deploy_bundles'\)\.delete\(\)/.test(executor));

// --- the workspace: no direct invocation survives ---
check('ProjectWorkspace ships through the spine, never invoking github-export directly',
  workspace.includes('shipRepoThroughSpine({ projectId: id, repo, files: payload })')
  && !/invoke[^;]{0,120}github-export/s.test(workspace));
check('the local GitHub token field is gone (no client-held token, no passthrough)',
  !workspace.includes('githubToken') && !workspace.includes('ff:gh-token'));

// --- the vocabulary: the new kind is a first-class citizen ---
check('ship_repo has a decision TTL (the deploy family window)', /ship_repo:\s*14/.test(ttl));
check('ship_repo has Queue metadata (icon + label)', meta.includes('ship_repo:') && meta.includes('Ship code to GitHub'));
check('the enum migration is additive, idempotent, and ALONE in its file',
  migration.includes("add value if not exists 'ship_repo'")
  && !/create\s+table|update\s|insert\s/i.test(migration));

console.log(`\nshipRepo.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} ship_repo check(s) failed`);
