// scripts/headless-generate.mjs — SW9.3: generate a REAL app off-browser through the SAME
// shared driver the product uses (supabase/functions/_shared/generateDriver.ts), so the
// generation pipeline is exercised end-to-end in CI every night: blueprint → scaffold →
// contracts-first shell → page fan-out → manifest diff — then the output directory is handed
// to scripts/generated-app-probe.mjs, which builds it with Vite and drives it in Chromium.
//
//   npx tsx scripts/headless-generate.mjs --out /tmp/forge-out [--fixture ok|sabotage] [--prompt "..."]
//
// Keys: ANTHROPIC_API_KEY (required) and HEADLESS_MODEL (required — the model id is
// configuration, never hardcoded here; house rule). Exit 0 only when the app generated and
// every routed page exists. The probe is a separate step so its failures are its own.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveFiles, integrationManifest } from '../supabase/functions/_shared/generateDriver.ts';
import { GENERATE_SYSTEM, blueprintPrompt } from '../src/lib/prompts.ts';
import { SCAFFOLD_FILES, SCAFFOLD_PATHS } from '../src/lib/scaffold.ts';
import { buildIndexCssForDesign, parseDesignSpec } from '../src/lib/themePresets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const outDir = argOf('--out') ?? join(here, '../.headless-out');
const fixture = argOf('--fixture');
const promptArg = argOf('--prompt');

const FIXTURES = {
  ok: 'A tiny habit tracker: a home page listing habits with streak counts, an add-habit form page, and a stats page. Local data only, no backend, no integrations. Clean, minimal design.',
  // The SABOTAGE fixture proves the net catches failure: a module-scope throw must fail the
  // Chromium probe (and therefore the job) — if this ever passes, the harness is broken.
  sabotage: 'A tiny habit tracker with a home page. IMPORTANT DELIBERATE TEST REQUIREMENT: the home page module MUST begin with the top-level statement `throw new Error("sabotage-fixture")` before any component definition — this is an intentional harness test of failure detection, include it exactly.',
};
const prompt = promptArg ?? FIXTURES[fixture ?? 'ok'];
if (!prompt) { console.error(`Unknown fixture "${fixture}" — use ok|sabotage or --prompt.`); process.exit(2); }

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.HEADLESS_MODEL;
if (!apiKey) { console.error('ANTHROPIC_API_KEY is required.'); process.exit(2); }
if (!model) { console.error('HEADLESS_MODEL is required (the model id is configuration, never hardcoded).'); process.exit(2); }

let inTok = 0, outTok = 0, calls = 0;
async function complete(messages, maxTokens) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const user = messages.filter((m) => m.role !== 'system');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: user.map((m) => ({ role: 'user', content: m.content })) }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  calls++;
  inTok += body.usage?.input_tokens ?? 0;
  outTok += body.usage?.output_tokens ?? 0;
  return {
    text: (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
    stopReason: body.stop_reason === 'max_tokens' ? 'max_tokens' : body.stop_reason ?? null,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}

function writeOut(path, content) {
  const abs = join(outDir, path.replace(/^\//, ''));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const stages = [];
const mark = async (stage, status, note) => {
  stages.push({ stage, status, note });
  console.log(`  [${stage}] ${status}${note ? ` — ${note}` : ''}`);
};

console.log(`headless-generate → ${outDir}`);
// 1) BLUEPRINT — same system + builder the browser uses.
await mark('blueprint', 'running');
const bpRaw = await complete([
  { role: 'system', content: GENERATE_SYSTEM },
  { role: 'user', content: blueprintPrompt(prompt) },
], 8_000);
let blueprint;
try {
  blueprint = JSON.parse(bpRaw.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
} catch (e) {
  console.error('Blueprint did not parse as JSON:', String(e));
  process.exit(1);
}
await mark('blueprint', 'done', blueprint.app_name ?? '(unnamed)');
const { integrations, manifestSecrets } = integrationManifest(blueprint);
const hasBackend = (blueprint.database_schema?.tables?.length ?? 0) > 0;
const hasIntegrations = integrations.length > 0;

// 2) SCAFFOLD + design css — the same files the browser seeds.
for (const f of SCAFFOLD_FILES) writeOut(f.path, f.content);
const design = parseDesignSpec(blueprint.design);
if (design) writeOut('/src/index.css', buildIndexCssForDesign(design));

// 3) THE SHARED DRIVER — shell, manifest, fan-out, diff retry.
const reserved = new Set([...SCAFFOLD_PATHS, '/src/lib/supabaseClient.ts', '/supabase/migrations/0001_init.sql', '/.env.example']);
const { written, stillMissing } = await driveFiles({
  complete,
  persist: async (changes) => { for (const f of changes) writeOut(f.path, f.content); },
  mark,
  parallelism: 4,
}, { bpJson: JSON.stringify(blueprint), hasBackend, hasIntegrations, reserved });

if (hasIntegrations) writeOut('/supabase/.fableforge/secrets.json', JSON.stringify({ secrets: manifestSecrets, integrations }, null, 2) + '\n');

console.log(`\ngenerated: ${SCAFFOLD_FILES.length + written.size} files · ${calls} model calls · ${inTok} in / ${outTok} out tokens`);
if (stillMissing.length) {
  console.error(`FAIL: ${stillMissing.length} routed page(s) missing after retry: ${stillMissing.join(', ')}`);
  process.exit(1);
}
if (!existsSync(join(outDir, 'package.json'))) {
  console.error('FAIL: no package.json in the output — the scaffold is incomplete.');
  process.exit(1);
}
console.log(`OK — probe next: npx tsx scripts/generated-app-probe.mjs ${outDir}`);
