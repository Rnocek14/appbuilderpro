// src/lib/qaCheck.verify.ts
// Pure-function checks for the cross-file export resolution in validateProject (run with tsx).
//   npx tsx src/lib/qaCheck.verify.ts
import { validateProject } from './qaCheck';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
type F = { path: string; content: string };
const run = (files: F[]) => validateProject(files);
const has = (files: F[], sub: string) => run(files).some((i) => i.message.includes(sub));

console.log('qaCheck.verify');

// 1) named import the target doesn't export → flagged
check('missing named export is flagged', has(
  [{ path: '/src/App.tsx', content: `import { Foo } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export const Bar = 1;` }],
  "does not export 'Foo'"));

// 2) named import the target DOES export → not flagged
check('present named export is OK', !has(
  [{ path: '/src/App.tsx', content: `import { Bar } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export const Bar = 1;` }],
  "does not export 'Bar'"));

// 3) default import from a module with no default → flagged
check('missing default export is flagged', has(
  [{ path: '/src/App.tsx', content: `import X from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export const Bar = 1;` }],
  'no default export'));

// 4) default import from a module WITH a default → not flagged
check('present default export is OK', !has(
  [{ path: '/src/App.tsx', content: `import X from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export default function X(){ return 1 }` }],
  'no default export'));

// 5) barrel (export *) target → never flagged (names unknowable)
check('barrel re-export is not flagged', !has(
  [{ path: '/src/App.tsx', content: `import { Anything } from './ui';\nexport default function App(){return null}` },
   { path: '/src/ui/index.ts', content: `export * from './button';` },
   { path: '/src/ui/button.ts', content: `export const Button = 1;` }],
  'does not export'));

// 6) aliased export: `export { A as B }` exports B, not A
check('aliased export name resolves', !has(
  [{ path: '/src/App.tsx', content: `import { B } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `const A = 1; export { A as B };` }],
  "does not export 'B'"));
check('aliased export hides original name', has(
  [{ path: '/src/App.tsx', content: `import { A } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `const A = 1; export { A as B };` }],
  "does not export 'A'"));

// 7) namespace import → no per-name check
check('namespace import is not flagged', !has(
  [{ path: '/src/App.tsx', content: `import * as NS from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export const Bar = 1;` }],
  'does not export'));

// 8) package (non-relative) imports are not export-checked here
check('package import not export-checked', !has(
  [{ path: '/src/App.tsx', content: `import { useState } from 'react';\nexport default function App(){return null}` }],
  'does not export'));

// 9) re-export `export { Z } from './a'` makes Z exported
check('named re-export counts as exported', !has(
  [{ path: '/src/App.tsx', content: `import { Z } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export { Z } from './z';` },
   { path: '/src/lib/z.ts', content: `export const Z = 1;` }],
  "does not export 'Z'"));

// 11) `import { default as X }` resolves against a DEFAULT export (not a named one)
check('aliased default import is OK with a default export', !has(
  [{ path: '/src/App.tsx', content: `import { default as Foo } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export default function Foo(){ return 1 }` }],
  "does not export 'default'"));
check('aliased default import flags a missing default', has(
  [{ path: '/src/App.tsx', content: `import { default as Foo } from './lib/x';\nexport default function App(){return null}` },
   { path: '/src/lib/x.ts', content: `export const Bar = 1;` }],
  'no default export'));

// 10) css import never crashes / not flagged
check('css import is ignored', !has(
  [{ path: '/src/App.tsx', content: `import './styles.css';\nexport default function App(){return null}` },
   { path: '/src/styles.css', content: `body{}` }],
  'does not export'));

console.log(`\nqaCheck.verify: ${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} check(s) failed`);
