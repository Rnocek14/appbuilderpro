// The one-dependency-truth contract: the registry's pins are exact, and every surface that
// carries package knowledge — the scaffold's package.json, the QA allowlist, the blob preview's
// esm.sh pins, and the WebContainer reconcile — either derives from the registry or is held to
// it here. Drift in any of them is a CI failure, not a runtime surprise.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEP_REGISTRY, REACT_VERSION, generatedImportable, previewPins, registryPin } from '../depRegistry';
import { PACKAGE_JSON } from '../../../supabase/functions/_shared/scaffold';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

// --- the registry itself ---
const EXACT = /^\d+\.\d+\.\d+$/;
check('every pin is an exact x.y.z version',
  Object.values(DEP_REGISTRY).every((p) => EXACT.test(p.version)),
  Object.entries(DEP_REGISTRY).filter(([, p]) => !EXACT.test(p.version)).map(([n]) => n).join(', '));
check('react and react-dom share one version', DEP_REGISTRY['react'].version === DEP_REGISTRY['react-dom'].version
  && REACT_VERSION === DEP_REGISTRY['react'].version);
check('generated allowlist is a strict subset of the registry',
  generatedImportable().every((n) => n in DEP_REGISTRY));
check('preview pins exclude the react family (import map owns it)',
  !('react' in previewPins()) && !('react-dom' in previewPins()));
check('registryPin answers null for the never-blessed', registryPin('left-pad') === null);

// --- the scaffold is held to the registry ---
const scaffoldPkg = JSON.parse(PACKAGE_JSON) as { dependencies: Record<string, string> };
const scaffoldDrift = Object.entries(scaffoldPkg.dependencies)
  .filter(([name, range]) => range !== `^${registryPin(name) ?? '<unregistered>'}`);
check('every scaffold dependency is the registry pin with a caret',
  scaffoldDrift.length === 0,
  scaffoldDrift.map(([n, r]) => `${n}@${r} vs registry ${registryPin(n) ?? 'MISSING'}`).join(', '));

// --- the derived consumers actually derive (no private copies left) ---
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8');

const qa = read('../../../supabase/functions/_shared/qa.ts');
check('qa.ts derives its allowlist from the registry', qa.includes('generatedImportable()'));
check('qa.ts carries no private package list', !qa.includes("'framer-motion', 'zustand'"));

const preview = read('../../components/editor/PreviewPane.tsx');
check('PreviewPane pins React from the registry', preview.includes('REACT_PIN = REACT_VERSION'));
check('PreviewPane interpolates esm.sh pins from the registry', preview.includes('JSON.stringify(previewPins())'));
check('PreviewPane carries no inline version literals', !/'react-router-dom':'\d/.test(preview));

const wc = read('../webcontainer.ts');
check('reconcilePackageJson consults the registry', wc.includes('registryPin(name)'));
check('an unregistered package is logged, never silent', wc.includes('has no registry pin'));

console.log(`\ndepRegistry.verify: ${passed} passed, ${failed} failed (${Object.keys(DEP_REGISTRY).length} pinned packages)`);
if (failed) throw new Error(`${failed} dep registry check(s) failed`);
