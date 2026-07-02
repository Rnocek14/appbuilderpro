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

// 12) RLS lint: table without RLS → error; RLS without policy → warning; both present → clean
const app = { path: '/src/App.tsx', content: `export default function App(){return null}` };
check('table without RLS is flagged', has(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `create table posts (id uuid primary key);` }],
  'without ROW LEVEL SECURITY'));
check('RLS without policy is a warning', run(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `create table posts (id uuid primary key);\nalter table posts enable row level security;` }],
).some((i) => i.severity === 'warning' && i.message.includes('no CREATE POLICY')));
check('RLS + policy is clean', !has(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `create table posts (id uuid primary key);\nalter table posts enable row level security;\ncreate policy "own posts" on posts for all using (auth.uid() = user_id);` }],
  'ROW LEVEL SECURITY'));
check('commented-out create table is ignored', !has(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `-- create table posts (id uuid primary key);\nselect 1;` }],
  'ROW LEVEL SECURITY'));
check('non-public schema is ignored', !has(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `create table cron.job_extra (id int);` }],
  'ROW LEVEL SECURITY'));
check('public-prefixed table without RLS is flagged', has(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `create table public.items (id uuid primary key);` }],
  'without ROW LEVEL SECURITY'));
check('if-not-exists + quoted table resolves', has(
  [app, { path: '/supabase/migrations/0001_init.sql', content: `create table if not exists "orders" (id uuid primary key);` }],
  'without ROW LEVEL SECURITY'));
check('non-migration sql is not linted', !has(
  [app, { path: '/notes/schema.sql', content: `create table posts (id uuid primary key);` }],
  'ROW LEVEL SECURITY'));

// 13) HashRouter anchor + catch-all checks
check('in-page anchor is flagged', has(
  [{ path: '/src/pages/Privacy.tsx', content: `export default function P(){return <a href="#data-we-collect">Data</a>}` }, app],
  'breaks HashRouter routing'));
check('hash-route link is not flagged', !has(
  [{ path: '/src/pages/Nav.tsx', content: `export default function N(){return <a href="#/pricing">Pricing</a>}` }, app],
  'breaks HashRouter routing'));
check('missing catch-all is a warning', run(
  [{ path: '/src/App.tsx', content: `import {Routes,Route} from 'react-router-dom';\nexport default function App(){return <Routes><Route path="/" element={<div/>} /></Routes>}` }],
).some((i) => i.severity === 'warning' && i.message.includes('catch-all')));
check('catch-all present is clean', !has(
  [{ path: '/src/App.tsx', content: `import {Routes,Route} from 'react-router-dom';\nexport default function App(){return <Routes><Route path="/" element={<div/>} /><Route path="*" element={<div/>} /></Routes>}` }],
  'catch-all'));

// 14) dynamic import (React.lazy route) to a missing file → flagged; to an existing file → clean
check('lazy dynamic import of missing page is flagged', has(
  [{ path: '/src/App.tsx', content: `import { lazy } from 'react';\nconst Landing = lazy(() => import('./pages/Landing'));\nexport default function App(){return null}` }],
  "Import does not resolve: './pages/Landing'"));
check('lazy dynamic import of existing page is clean', !has(
  [{ path: '/src/App.tsx', content: `import { lazy } from 'react';\nconst Landing = lazy(() => import('./pages/Landing'));\nexport default function App(){return null}` },
   { path: '/src/pages/Landing.tsx', content: `export default function Landing(){return null}` }],
  'does not resolve'));

// 15) truncated file (unbalanced braces) → flagged; balanced file → clean
check('truncated file is flagged', has(
  [{ path: '/src/components/NewsCard.tsx', content: `export function NewsCard(){\n  return (\n    <div>\n      <div>\n        {items.map((i) => {\n` }],
  'truncated or malformed'));
check('balanced file is clean', !has(
  [{ path: '/src/components/Ok.tsx', content: `export function Ok(){ const s = "{"; return <div>{s}</div>; }` }],
  'truncated or malformed'));

console.log(`\nqaCheck.verify: ${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} check(s) failed`);
