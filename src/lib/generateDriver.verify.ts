// Run: npx tsx src/lib/generateDriver.verify.ts
// Pins the ONE generation driver (supabase/functions/_shared/generateDriver.ts): the manifest
// rule, the truncation guards, the fan-out + manifest-diff retry, the reserved-path filter —
// and that both consumers (the browser's chunkedGenerate and the headless CI script) ride it
// instead of keeping private copies.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  driveFiles, integrationManifest, pagesFromAppTsx, contractsContext, type DriverCall,
} from '../../supabase/functions/_shared/generateDriver';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

// THE MANIFEST RULE — App.tsx's own imports, both forms, extensions defaulted.
{
  const app = `import Home from './pages/Home';
const About = lazy(() => import('./pages/About.tsx'));
import { x } from './lib/db';
const Later = lazy(() => import('./pages/deep/Later'));`;
  const pages = pagesFromAppTsx(app);
  check('static and lazy ./pages imports both count, extension defaulted',
    pages.includes('/src/pages/Home.tsx') && pages.includes('/src/pages/About.tsx') && pages.includes('/src/pages/deep/Later.tsx'));
  check('non-page imports never join the manifest', pages.every((p) => p.startsWith('/src/pages/')));
  check('deduped', new Set(pages).size === pages.length);
  check('no imports, no manifest', pagesFromAppTsx('export default 1').length === 0);
}

// CONTRACTS + INTEGRATIONS — pure helpers, same behavior the browser had inline.
{
  const written = new Map([['/src/App.tsx', 'A'.repeat(10)], ['/index.html', 'x'], ['/src/lib/db.ts', 'B']]);
  const ctx = contractsContext(written, 30);
  check('contracts context includes only /src files and honors the cap',
    ctx.includes('/src/App.tsx') && !ctx.includes('/index.html') && ctx.length <= 30);
  const mani = integrationManifest({ integrations: [
    { service: 'stripe', purpose: 'pay', secrets: ['STRIPE_KEY', 'STRIPE_KEY', 42] },
    { service: 'resend', purpose: 'mail', secrets: ['RESEND_KEY'] },
  ] });
  check('secrets dedupe by env; non-strings dropped',
    mani.manifestSecrets.length === 2 && mani.manifestSecrets[0]!.env === 'STRIPE_KEY');
  check('a blueprint with no integrations yields an empty manifest',
    integrationManifest({}).manifestSecrets.length === 0);
}

// THE PIPELINE — a scripted fake model proves the orchestration invariants.
const file = (path: string, content: string) => `§FILE ${path}\n${content}\n`;
const call = (text: string, stop: string | null = null): DriverCall => ({ text, stopReason: stop, inputTokens: 1, outputTokens: 1 });

async function run(script: (i: number, messages: { content: string }[]) => DriverCall, reserved = new Set<string>()) {
  const persisted: string[] = [];
  const marks: string[] = [];
  let i = 0;
  const res = await driveFiles({
    complete: async (messages) => script(i++, messages as { content: string }[]),
    persist: async (changes) => { for (const c of changes) persisted.push(c.path); },
    mark: async (_s, _st, note) => { if (note) marks.push(note); },
    parallelism: 2,
  }, { bpJson: '{}', hasBackend: false, hasIntegrations: false, reserved });
  return { res, persisted, marks };
}

{
  const APP = `import Home from './pages/Home';\nimport About from './pages/About';`;
  const { res, persisted } = await run((i) => {
    if (i === 0) return call(file('/src/App.tsx', APP) + file('/src/lib/db.ts', 'export const db = 1;') + '§END');
    const m = /pages\/(Home|About)/.exec('x');
    void m;
    return call(file(i === 1 ? '/src/pages/Home.tsx' : '/src/pages/About.tsx', 'export default () => null;') + '§END');
  });
  check('shell + both pages land; nothing missing', res.written.size === 4 && res.stillMissing.length === 0);
  check('everything accepted was persisted', persisted.length === 4);
}
{
  let threw = false;
  try { await run(() => call('§FILE /src/lib/db.ts\nexport const db = 1;\n§END')); } catch { threw = true; }
  check('a shell with no App.tsx throws — a generation failure, never a silent degrade', threw);
}
{
  // A page call that never emits its page: retried once, then reported missing — not invented.
  const APP = `import Home from './pages/Home';`;
  let pageCalls = 0;
  const { res } = await run((i) => {
    if (i === 0) return call(file('/src/App.tsx', APP) + '§END');
    pageCalls++;
    return call(file('/src/pages/Wrong.tsx', 'export default () => null;') + '§END');
  });
  check('a never-emitted page is retried exactly once then reported missing',
    pageCalls === 2 && res.stillMissing.join() === '/src/pages/Home.tsx');
}
{
  // Truncation guard: a max_tokens-cut tail file is dropped, never half-persisted.
  const APP = `import Home from './pages/Home';`;
  const { res } = await run((i) => {
    if (i === 0) return call(file('/src/App.tsx', APP) + file('/src/lib/half.ts', 'export function a() { if (x) { return {'), 'max_tokens');
    return call(file('/src/pages/Home.tsx', 'export default () => null;') + '§END');
  });
  check('a max_tokens-cut trailing file is dropped whole', !res.written.has('/src/lib/half.ts') && res.written.has('/src/App.tsx'));
}
{
  // Reserved paths and ui components never reach persist.
  const APP = `import Home from './pages/Home';`;
  const { res, persisted } = await run((i) => {
    if (i === 0) return call(file('/src/App.tsx', APP) + file('/index.html', 'nope') + file('/src/components/ui/button.tsx', 'nope') + '§END');
    return call(file('/src/pages/Home.tsx', 'export default () => null;') + '§END');
  }, new Set(['/index.html']));
  check('reserved and /src/components/ui paths never persist',
    !persisted.includes('/index.html') && !persisted.includes('/src/components/ui/button.tsx') && !res.written.has('/index.html'));
}

// ---- the consumers (textual contract) ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const aiClient = readFileSync(join(root, 'src/lib/aiClient.ts'), 'utf8');
const headless = readFileSync(join(root, 'scripts/headless-generate.mjs'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/nightly-generate.yml'), 'utf8');
{
  check('the browser generates through the shared driver',
    aiClient.includes('driveFiles({') && aiClient.includes('integrationManifest(blueprint)'));
  check('the resume path shares the ONE manifest rule', aiClient.includes('pagesFromAppTsx(appTsx)'));
  check('no private manifest regex survives in aiClient', !aiClient.includes("startsWith('./pages/')"));
  check('the headless script rides the same driver and the same prompt modules',
    headless.includes("from '../supabase/functions/_shared/generateDriver.ts'")
    && headless.includes("from '../src/lib/prompts.ts'"));
  check('the model id is configuration, never hardcoded',
    !/claude-/.test(headless) && !/claude-/.test(workflow) && headless.includes('HEADLESS_MODEL'));
  check('the nightly job can NEVER gate a merge (no push/PR trigger)',
    !workflow.includes('pull_request') && !workflow.includes('push:') && workflow.includes('workflow_dispatch'));
  check('failure files or updates ONE tracking issue', workflow.includes('gh issue list') && workflow.includes('gh issue create'));
  check('the sabotage fixture exists as a harness self-test',
    headless.includes('sabotage-fixture') && workflow.includes('sabotage'));
  check('the probe consumes the generated directory', workflow.includes('generated-app-probe.mjs /tmp/forge-out'));
}

console.log(`\ngenerateDriver.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} generate driver check(s) failed`);
