// src/lib/qaCheck.verify.ts
// Pure-function checks for the cross-file export resolution in validateProject (run with tsx).
//   npx tsx src/lib/qaCheck.verify.ts
import { validateProject, missingLocalModules, looksTruncated } from './qaCheck';

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

// 16) missingLocalModules — concrete target paths for imports of files that don't exist
{
  const app = `import { lazy } from 'react';
import Header from '../components/Header';
import './missing.css';
const Landing = lazy(() => import('./pages/LandingPage'));
const NewProject = lazy(() => import('./pages/NewProjectPage'));
export default function App(){return null}`;
  const missing = missingLocalModules([
    { path: '/src/App.tsx', content: app },
    { path: '/components/Header.tsx', content: 'export default function Header(){return null}' },
  ]);
  const paths = missing.map((m) => m.path).sort();
  check('missing lazy pages get .tsx target paths',
    paths.includes('/src/pages/LandingPage.tsx') && paths.includes('/src/pages/NewProjectPage.tsx'));
  check('missing css keeps its extension', paths.includes('/src/missing.css'));
  check('resolving import is not reported', !paths.some((p) => p.includes('Header')));
  const lp = missing.find((m) => m.path === '/src/pages/LandingPage.tsx');
  check('importer + import line captured', lp?.importers[0]?.path === '/src/App.tsx'
    && (lp?.importers[0]?.lines[0] ?? '').includes("import('./pages/LandingPage')"));
}
// 17) one target imported from two files → single entry with both importers
{
  const missing = missingLocalModules([
    { path: '/src/App.tsx', content: `import Nav from './components/Nav';` },
    { path: '/src/pages/Home.tsx', content: `import Nav from '../components/Nav';` },
  ]);
  check('shared missing module is deduped with both importers',
    missing.length === 1 && missing[0].importers.length === 2);
}
// 18) looksTruncated — the drop-the-half-file gate for max_tokens-cut streams
check('looksTruncated: cut-off file detected', looksTruncated('export function X(){\n  return (\n    <div>{items.map((i) => {\n'));
check('looksTruncated: complete file is clean', !looksTruncated('export function X(){ return <div/>; }'));
check('looksTruncated: braces in strings ignored', !looksTruncated('const s = "{{{{"; export default s;'));

// ============================================================================================
// 19) INTERACTION INTEGRITY — the checks that answer "will it respond?", not "will it build?"
// Each pair is written as (fires when broken / silent when fine), because the value of a lint
// that feeds a self-heal loop is entirely in the second half: a false positive makes the
// generator rewrite code that already worked.
// ============================================================================================
const jsx = (content: string): F[] => [{ path: '/src/App.tsx', content }];

// a button that does nothing — the "looks finished, isn't" defect
check('dead button is flagged', has(jsx(`export default function A(){return <button>Save</button>}`),
  'does nothing when clicked'));
check('button with onClick is fine', !has(jsx(`export default function A(){const s=()=>{};return <button onClick={s}>Save</button>}`),
  'does nothing when clicked'));
check('type="submit" button inside a form is fine', !has(jsx(`export default function A(){return <form onSubmit={e=>e.preventDefault()}><button type="submit">Go</button></form>}`),
  'does nothing when clicked'));
check('a spread that may carry the handler is left alone', !has(jsx(`export default function A(p:any){return <button {...p}>Save</button>}`),
  'does nothing when clicked'));
check('a disabled button is not treated as dead', !has(jsx(`export default function A(){return <button disabled>Save</button>}`),
  'does nothing when clicked'));
check('an arrow body containing > does not truncate the tag scan',
  !has(jsx(`export default function A(){const n=1;return <button onClick={()=>{if(n>0){}}}>Go</button>}`), 'does nothing when clicked'));

// a handler pointing at a name that does not exist — throws on first click
check('handler bound to an undefined name is flagged',
  has(jsx(`export default function A(){return <button onClick={handleSave}>Save</button>}`), "bound to 'handleSave'"));
check('handler defined in the file is fine',
  !has(jsx(`export default function A(){const handleSave=()=>{};return <button onClick={handleSave}>Save</button>}`), "bound to 'handleSave'"));
check('handler imported from elsewhere is fine',
  !has([{ path: '/src/App.tsx', content: `import { handleSave } from './h';\nexport default function A(){return <button onClick={handleSave}>Save</button>}` },
        { path: '/src/h.ts', content: `export const handleSave = () => {};` }], "bound to 'handleSave'"));
check('handler destructured from props is fine',
  !has(jsx(`export default function A({onSave}:{onSave:()=>void}){return <button onClick={onSave}>Save</button>}`), "bound to 'onSave'"));
check('a browser global is not mistaken for a missing handler',
  !has(jsx(`export default function A(){return <button onClick={print}>Print</button>}`), "bound to 'print'"));

// a control a keyboard cannot reach
check('onClick on a div is flagged as unreachable',
  has(jsx(`export default function A(){const s=()=>{};return <div onClick={s}>Save</div>}`), 'unreachable by keyboard'));
check('div with role + tabIndex is fine',
  !has(jsx(`export default function A(){const s=()=>{};return <div role="button" tabIndex={0} onClick={s}>Save</div>}`), 'unreachable by keyboard'));
check('a plain button is never flagged for reachability',
  !has(jsx(`export default function A(){const s=()=>{};return <button onClick={s}>Save</button>}`), 'unreachable by keyboard'));

// a form that loses what was typed
check('form without onSubmit is flagged', has(jsx(`export default function A(){return <form><input/></form>}`), 'discards what was typed'));
check('form with onSubmit is fine', !has(jsx(`export default function A(){return <form onSubmit={e=>e.preventDefault()}><input/></form>}`), 'discards what was typed'));

// the lint must not fire on non-JSX modules, and must not flood
check('plain .ts modules are untouched',
  !has([{ path: '/src/App.tsx', content: `export default function A(){return null}` },
        { path: '/src/x.ts', content: `export const html = '<button>Save</button>';` }], 'does nothing when clicked'));
check('three dead buttons in one file report once, not three times',
  run(jsx(`export default function A(){return <div><button>a</button><button>b</button><button>c</button></div>}`))
    .filter((i) => i.message.includes('does nothing when clicked')).length === 1);

// comments are prose — scanning them caused a false positive AND a false negative on the first
// run against real generated apps, which is why stripComments() exists.
check('a <button> mentioned in a comment is not a dead button',
  !has(jsx(`// the clickable element is a real <button>, on purpose\nexport default function A(){const s=()=>{};return <button onClick={s}>Save</button>}`),
  'does nothing when clicked'));
check('a handler named only in a comment still counts as undefined',
  has(jsx(`// wire this to onClick={handleShare} later\nexport default function A(){return <button onClick={handleShare}>Share</button>}`),
  "bound to 'handleShare'"));
check('a block comment cannot hide a real dead button',
  has(jsx(`/* a nice toolbar */\nexport default function A(){return <button>Export</button>}`), 'does nothing when clicked'));
check('a // inside a string does not swallow the line',
  !has(jsx(`export default function A(){const u='https://x.example'; const s=()=>u; return <button onClick={s}>Go</button>}`),
  'does nothing when clicked'));

console.log(`\nqaCheck.verify: ${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} check(s) failed`);
