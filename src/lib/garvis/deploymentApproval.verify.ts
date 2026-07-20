// Static proof that deployment executes the exact payload and bytes the owner approved. These
// checks guard the boundary where authenticated client input crosses into privileged host/API keys.

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
const site = readFileSync(join(root, 'supabase/functions/deploy-site/index.ts'), 'utf8');
const backend = readFileSync(join(root, 'supabase/functions/deploy-backend/index.ts'), 'utf8');

check('site approval binds a hash of the staged bytes', request.includes('bundle_hash: bundleHash') && request.includes('hashPayload(input.files)'));
check('site client sends only approval identity', client.includes("body: { approval_id: a.id }")
  && !client.includes('body: { approval_id: a.id, projectId, siteId, files'));
check('site executor verifies approval payload hash', site.includes('payloadMatches(approval.payload, approval.payload_hash'));
check('site executor derives target from approved payload', site.includes('const projectId = payload.project_id') && site.includes('const bundleId = payload.bundle_id'));
check('site executor verifies bundle ownership and project binding', site.includes('bundle.owner_id !== user.id || bundle.project_id !== projectId'));
check('site executor verifies staged byte hash', site.includes("hashPayload(files)) !== payload.bundle_hash"));
check('site executor binds the approved hosting target', request.includes('site_id: input.siteId ?? null') && site.includes("'site_id' in payload"));
check('site retries return durable result instead of redeploying', site.includes('if (previous?.executed)') && site.includes('replayed: true'));
check('site executor has an atomic expiring execution claim', site.includes("result->>deploy_claimed_at") && site.includes("eq('status', 'approved')"));
check('backend executor verifies approval payload hash', backend.includes('payloadMatches(approval.payload, approval.payload_hash'));
check('backend executor has an atomic expiring execution claim', backend.includes("result->>deploy_claimed_at") && backend.includes("eq('status', 'approved')"));
check('UI distinguishes building from confirmed live', client.includes("live, state: res?.state ?? 'building'"));

console.log(`\ndeploymentApproval.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} deployment approval check(s) failed`);
