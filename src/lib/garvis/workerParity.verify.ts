// Static contract proof: every tool advertised to the unattended model has an actual server
// dispatch case, and every server case remains present in the capability manifest.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GARVIS_SERVER_TOOL_NAMES, toolsForServer } from './tools';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(join(here, '../../../supabase/functions/garvis-worker/index.ts'), 'utf8');
const handlers = [...worker.matchAll(/case\s+'([^']+)'/g)].map((m) => m[1]).sort();
const advertised = [...GARVIS_SERVER_TOOL_NAMES].sort();

check('server manifest has no duplicate tools', new Set(advertised).size === advertised.length);
check('worker dispatch has no duplicate cases', new Set(handlers).size === handlers.length);
check('every advertised server tool has a handler', advertised.every((name) => handlers.includes(name)),
  advertised.filter((name) => !handlers.includes(name)).join(', '));
check('every handler is declared in the server manifest', handlers.every((name) => advertised.includes(name as typeof GARVIS_SERVER_TOOL_NAMES[number])),
  handlers.filter((name) => !advertised.includes(name as typeof GARVIS_SERVER_TOOL_NAMES[number])).join(', '));
check('service-role app ids pass an explicit owner check', worker.includes('async function ownedAppId(')
  && worker.includes(".eq('owner_id', ctx.ownerId).eq('id', appId)"));
check('worker clarification checkpoint preserves the question turn', worker.includes("{ role: 'assistant', content: decision.question }"));

for (const mode of ['observe', 'plan', 'act'] as const) {
  check(`${mode} server tools stay inside the manifest`, toolsForServer(mode).every((t) => advertised.includes(t.name as typeof GARVIS_SERVER_TOOL_NAMES[number])));
}

console.log(`\nworkerParity.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} worker parity check(s) failed`);
