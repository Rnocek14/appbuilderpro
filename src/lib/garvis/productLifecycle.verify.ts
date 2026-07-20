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
const lifecycle = readFileSync(join(here, 'productLifecycle.ts'), 'utf8');
const bridge = readFileSync(join(here, 'buildBridge.ts'), 'utf8');
const execution = readFileSync(join(here, 'execution.ts'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/app_0092_execution_truth.sql'), 'utf8');

check('project/app identity is unique per owner', migration.includes('uq_apps_owner_project') && migration.includes('where project_id is not null'));
check('new project links as a building portfolio app', lifecycle.includes("stage: 'building'") && lifecycle.includes('project_id: projectId'));
check('world build invokes lifecycle adapter', bridge.includes('ensurePortfolioAppForProject(projectId)'));
check('only a confirmed-live deploy marks the linked app launched', execution.includes('if (live && url) await markProjectAppLaunched(projectId, url)'));
check('launch sync records the live URL', lifecycle.includes("stage: 'launched', deploy_url: deployUrl"));

console.log(`\nproductLifecycle.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} product lifecycle check(s) failed`);
