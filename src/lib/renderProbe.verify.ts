// The render probe's contract: routes come from the app's own source, judgments name their
// evidence, and the verdict counts instead of adjectivizing.

import { extractRoutePaths, judgeSnapshot, probeSummary, probeFixRequest } from './renderProbe';

let passed = 0; let failed = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}${detail ? ` — ${detail}` : ''}`); }
}

// --- route extraction ---
const APP = `
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/about" element={<About />} />
  <Route path='/pricing' element={<Pricing />} />
  <Route path={'/contact'} element={<Contact />} />
  <Route path="/items/:id" element={<Item />} />
  <Route path="*" element={<NotFound />} />
  <Route path="/about" element={<AboutDupe />} />
</Routes>`;
const routes = extractRoutePaths(APP);
check('static routes extracted from all three attribute forms',
  routes.includes('/about') && routes.includes('/pricing') && routes.includes('/contact'));
check('parameterized and wildcard routes are skipped (nothing honest to substitute)',
  !routes.some((r) => r.includes(':') || r.includes('*')));
check('duplicates dropped', routes.filter((r) => r === '/about').length === 1);
check('root probes first', routes[0] === '/');
check('lazy React.lazy routing still yields paths (paths live on <Route>, not the import)',
  extractRoutePaths('<Route path="/dash" element={<Suspense><Dash /></Suspense>} />').includes('/dash'));
check('an index route implies the root', extractRoutePaths('<Route index element={<Home />} />')[0] === '/');
check('bare paths gain their slash', extractRoutePaths('<Route path="settings" element={<S />} />')[0] === '/settings');
check('the cap bounds the walk', extractRoutePaths(
  Array.from({ length: 30 }, (_, i) => `<Route path="/p${i}" element={<X />} />`).join('\n'), 12,
).length === 12);

// --- judgment ---
check('an uncaught error convicts with the evidence quoted',
  (() => { const j = judgeSnapshot('/x', { error: 'TypeError: boom', dom: 'plenty of content here' }); return !j.ok && j.problem!.includes('TypeError: boom'); })());
check('a blank screen convicts even with no error',
  (() => { const j = judgeSnapshot('/x', { error: null, dom: '  ' }); return !j.ok && j.problem!.includes('blank screen'); })());
check('visible content with no error passes', judgeSnapshot('/x', { error: null, dom: 'Welcome to the dashboard' }).ok);

// --- verdicts ---
const mixed = [
  judgeSnapshot('/', { error: null, dom: 'home page content' }),
  judgeSnapshot('/about', { error: 'ReferenceError: x is not defined', dom: 'x' }),
];
check('a clean walk counts itself', probeSummary([mixed[0]]) === '1/1 routes render');
check('failures are named route by route', (() => { const s = probeSummary(mixed); return s.includes('1 of 2') && s.includes('/about') && s.includes('ReferenceError'); })());
check('no results, no verdict (never an invented count)', probeSummary([]) === '');
check('the fix request names each broken route', probeFixRequest(mixed).includes('/about') && probeFixRequest(mixed).includes('ROOT CAUSE'));
check('a clean walk asks for no fixes', probeFixRequest([mixed[0]]) === '');

// --- protocol parity: both preview runtimes must speak the same navigate command -----------
// (the workerParity pattern: textual proof, so a shell edit that drops the handler is a CI
// failure, not a probe that silently stops walking one runtime)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const blobShell = readFileSync(join(here, '../components/editor/PreviewPane.tsx'), 'utf8');
const wcShim = readFileSync(join(here, 'webcontainer.ts'), 'utf8');
const runtime = readFileSync(join(here, 'previewRuntime.ts'), 'utf8');
for (const [name, src] of [['blob shell', blobShell], ['webcontainer shim', wcShim]] as const) {
  check(`${name} handles the navigate command`,
    src.includes("d.type==='navigate'") || src.includes("d.type!=='navigate'"));
  check(`${name} hops hash routers by hash`, src.includes("location.hash.indexOf('#/')===0"));
  check(`${name} re-matches BrowserRouter via popstate`, src.includes("new PopStateEvent('popstate')"));
}
check('both panes register the navigator', blobShell.includes('registerPreviewNavigator((route)')
  && readFileSync(join(here, '../components/editor/WebContainerPane.tsx'), 'utf8').includes('registerPreviewNavigator((route)'));
check('the runtime exposes exactly one steering wheel', runtime.includes('export function navigatePreview'));

console.log(`\nrenderProbe.verify: ${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} render probe check(s) failed`);
