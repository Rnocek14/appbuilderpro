import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

const here = dirname(fileURLToPath(import.meta.url));
const loader = readFileSync(join(here, 'mindContextRun.ts'), 'utf8');
const runtime = readFileSync(join(here, 'index.ts'), 'utf8');
const builder = readFileSync(join(here, '../agent/edit.ts'), 'utf8');

check('one loader reads all four mind sections', ['mind_identity', 'mind_beliefs', 'mind_decisions', 'mind_events'].every((t) => loader.includes(t)));
check('loader delegates budgeting to compileMindContext', loader.includes('compileMindContext({'));
check('general agent input includes the mind contract', runtime.includes('loadMindRecordContext({ appId, budgetChars: 4_000 })'));
check('builder input includes the same mind contract', builder.includes('mindDigest, knowledgeDigest'));
check('context loading fails soft without fabricating a replacement', loader.includes("catch {\n    return '';"));

console.log(`\nmindContextRun.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} mind context checks failed`);
