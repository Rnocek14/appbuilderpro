import { useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, MousePointerClick } from 'lucide-react';
import type { ProjectFile } from '../../types';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import { updatePreviewSnapshot, pushPreviewLog, resetPreviewSnapshot, registerScreenshotCapture } from '../../lib/previewRuntime';

export type Device = 'desktop' | 'tablet' | 'mobile';
const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '390px' };

/** An element the user clicked in select mode — maps straight back to its source JSX. */
export interface SelectedElement { loc: string; tag: string; text: string; className: string; count: number }

interface Props {
  files: ProjectFile[];
  onFixError: (error: string) => void;
  // Controlled by the workspace so the preview controls share the Runtime bar (one toolbar row).
  device: Device;
  showConsole: boolean;
  /** True while the assistant is already working — pauses auto-fix so runs never overlap. */
  busy?: boolean;
  /** Select mode: the user clicked an element in the preview — becomes precise chat context. */
  onSelectElement?: (sel: SelectedElement) => void;
}

// ============================================================
// Self-contained preview for FableForge-generated apps.
// Compiles the app in the browser (Babel Standalone + React from a CDN with
// fallbacks) and renders it in a sandboxed iframe — no dependency on the
// CodeSandbox remote bundler, which can be blocked on some networks.
// ============================================================

const REACT_CDNS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js',
];
const REACT_DOM_CDNS = [
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js',
];
const BABEL_CDNS = [
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js',
];

interface PreviewPayload { files: Record<string, string>; css: string; externals: string[]; aliases: Record<string, string>; env: Record<string, string> }

const REACT_PIN = '18.3.1';
const REACT_FAMILY = new Set(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime']);
// Build-time / Node-only specifiers that must never be fetched from esm.sh.
const NON_BROWSER = new Set([
  'vite', '@vitejs/plugin-react', '@vitejs/plugin-react-swc', 'typescript',
  'fs', 'path', 'url', 'crypto', 'http', 'https', 'stream', 'os', 'child_process',
  'util', 'events', 'buffer', 'process', 'module',
  'express', 'vitest', 'jsdom', 'supertest', // server/test-only — not browser app deps
]);
// Scoped packages that are dev/test-only — matched by prefix.
const NON_BROWSER_PREFIXES = ['@testing-library/', '@vitest/'];

// The standard shadcn/ui Tailwind theme. Imported apps (Lovable/shadcn) write classes like
// `bg-background`/`text-foreground`/`border-border` that only exist when Tailwind is told to
// map them to CSS variables. The Tailwind Play CDN ships its *default* config (none of these),
// so we feed it this. The actual colour values come from the app's own index.css (:root
// { --background: … }). Functions (plugins) are omitted so it stays JSON-serialisable.
const SHADCN_TW_CONFIG = {
  darkMode: ['class'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))', input: 'hsl(var(--input))', ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))', foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))', 'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))', 'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))', ring: 'hsl(var(--sidebar-ring))',
        },
        chart: {
          '1': 'hsl(var(--chart-1))', '2': 'hsl(var(--chart-2))', '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))', '5': 'hsl(var(--chart-5))',
        },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: { 'accordion-down': 'accordion-down 0.2s ease-out', 'accordion-up': 'accordion-up 0.2s ease-out' },
    },
  },
};
// Directories/files that are NOT runnable browser app source. Imported real-world repos
// carry Deno edge functions (/supabase/functions), build/test config, and type-only files
// — scanning them pulls junk specifiers (jsr:, deno.land, express, vitest, @eslint/js)
// into the esm.sh preload and breaks the preview. The app only needs its own source.
// Anchored to the path root so we skip the top-level /supabase/functions (Deno) dir
// WITHOUT also excluding the app's own /src/integrations/supabase/client.ts.
const NON_APP_DIRS = ['/supabase/', '/node_modules/', '/.fableforge/', '/dist/', '/build/', '/.git/'];
function isAppSource(p: string): boolean {
  if (NON_APP_DIRS.some((d) => p.startsWith(d))) return false;
  if (/\/(__tests__|\.storybook)\//.test(p)) return false; // test/story dirs
  const base = p.split('/').pop() ?? '';
  if (/\.(test|spec)\.[tj]sx?$/.test(base)) return false; // tests
  if (/^setuptests\.[tj]sx?$/i.test(base)) return false;  // test bootstrap (pulls @testing-library)
  if (/\.config\.[tjm]s$/.test(base)) return false;       // vite/vitest/tailwind/postcss config
  if (/\.d\.ts$/.test(base)) return false;                // type declarations
  if (/^eslint\.config\./.test(base)) return false;       // eslint flat config
  return true;
}

// Vite exposes import.meta.env.VITE_* from .env files. Imported repos sometimes ship
// these (or .env.example); surface them so the previewed app reads real config instead
// of crashing on undefined. Only VITE_-prefixed keys, matching Vite's own behaviour.
function detectEnv(files: ProjectFile[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const f of files) {
    const base = f.path.split('/').pop() ?? '';
    if (!/^\.env(\.[\w.-]+)?$/.test(base)) continue;
    for (const line of f.content.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || !m[1].startsWith('VITE_')) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v; // first .env wins (e.g. .env over .env.example)
    }
  }
  return env;
}

// Resolve non-relative import prefixes (e.g. the Vite/shadcn "@/") to real paths so the
// preview treats them as local modules instead of asking esm.sh for "@/components/...".
// Reads tsconfig paths when present; defaults to the near-universal "@/" → "/src/".
function detectAliases(files: ProjectFile[]): Record<string, string> {
  const aliases: Record<string, string> = { '@/': '/src/' };
  const tsconfig = files.find((f) => /\/tsconfig(\.[\w-]+)?\.json$/.test(f.path));
  if (tsconfig) {
    try {
      // tsconfig allows // and /* */ comments — strip them before JSON.parse.
      const cleaned = tsconfig.content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const paths = JSON.parse(cleaned)?.compilerOptions?.paths as Record<string, string[]> | undefined;
      for (const [key, targets] of Object.entries(paths ?? {})) {
        const t = targets?.[0];
        if (!t) continue;
        const prefix = key.replace(/\*$/, '');                       // "@/*"   → "@/"
        let target = t.replace(/\*$/, '').replace(/^\.?\//, '/');    // "./src/*" → "/src/"
        if (!target.startsWith('/')) target = '/' + target;
        if (prefix) aliases[prefix] = target;
      }
    } catch { /* keep the default */ }
  }
  return aliases;
}

function matchesAlias(spec: string, aliases: Record<string, string>): boolean {
  return Object.keys(aliases).some((p) => spec.startsWith(p));
}

// Find bare npm imports across the source so the preview can pre-load them from esm.sh
// before running the app (require() is synchronous; dynamic import is not).
function scanExternals(files: Record<string, string>, aliases: Record<string, string>): string[] {
  const specs = new Set<string>();
  const patterns = [
    /(?:import|export)[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const content of Object.values(files)) {
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const s = m[1];
        if (s.startsWith('.') || s.startsWith('/') || s.startsWith('node:')) continue;
        if (matchesAlias(s, aliases)) continue;            // local module via alias
        if (s.includes('://') || /^(jsr|npm|deno):/.test(s)) continue; // Deno/URL imports
        if (REACT_FAMILY.has(s) || NON_BROWSER.has(s) || /\.css$/.test(s)) continue;
        if (NON_BROWSER_PREFIXES.some((p) => s.startsWith(p))) continue;
        specs.add(s);
      }
    }
  }
  return [...specs];
}

// Extract the compilable file map + concatenated CSS + external package list. This is the
// only thing that changes between hot updates — the runtime shell stays mounted.
function buildPayload(files: ProjectFile[]): PreviewPayload {
  const jsFiles: Record<string, string> = {};
  const cssChunks: string[] = [];
  for (const f of files) {
    if (!isAppSource(f.path)) continue; // skip edge functions, config, tests, type decls
    if (/\.css$/.test(f.path)) cssChunks.push(f.content);
    else if (/\.(js|jsx|ts|tsx)$/.test(f.path)) jsFiles[f.path] = f.content;
  }
  const aliases = detectAliases(files);
  // No synthetic fallback file — the shell shows an informative state when there's no entry,
  // so a genuine "no files yet" is never disguised as a rendered app.
  return { files: jsFiles, css: cssChunks.join('\n'), externals: scanExternals(jsFiles, aliases), aliases, env: detectEnv(files) };
}

// The runtime shell — built ONCE, never re-rendered. React + npm packages load from esm.sh
// (sharing a single React instance via the import map), TypeScript/JSX compiles in-browser
// with Babel, and updates arrive via postMessage for flash-free hot reloads. No dependency
// on CodeSandbox infrastructure.
function buildShell(): string {
  const reactUrl = 'https://esm.sh/react@' + REACT_PIN;
  const reactDomUrl = 'https://esm.sh/react-dom@' + REACT_PIN;
  const importMap = {
    imports: {
      'react': reactUrl,
      'react-dom': reactDomUrl,
      'react-dom/client': reactDomUrl + '/client',
      'react/jsx-runtime': reactUrl + '/jsx-runtime',
      'react/jsx-dev-runtime': reactUrl + '/jsx-dev-runtime',
    },
  };
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://esm.sh" crossorigin />
<link rel="dns-prefetch" href="https://esm.sh" />
<script type="importmap">${JSON.stringify(importMap)}</script>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config=${JSON.stringify(SHADCN_TW_CONFIG)};</script>
<style>html,body{margin:0;height:100%}#root{min-height:100%}
#__err{position:fixed;inset:0;background:#0b0b0f;color:#f7768e;font:13px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap;overflow:auto;display:none;z-index:99999}</style>
<!-- Default shadcn/ui design tokens so semantic classes (bg-background, bg-primary, …) render
     with correct colors even if the app hasn't defined them. The app's own index.css (injected
     into #__appcss below) comes after and overrides these. -->
<style id="__shadcn_defaults">
:root{--background:0 0% 100%;--foreground:222.2 84% 4.9%;--card:0 0% 100%;--card-foreground:222.2 84% 4.9%;--popover:0 0% 100%;--popover-foreground:222.2 84% 4.9%;--primary:222.2 47.4% 11.2%;--primary-foreground:210 40% 98%;--secondary:210 40% 96.1%;--secondary-foreground:222.2 47.4% 11.2%;--muted:210 40% 96.1%;--muted-foreground:215.4 16.3% 46.9%;--accent:210 40% 96.1%;--accent-foreground:222.2 47.4% 11.2%;--destructive:0 84.2% 60.2%;--destructive-foreground:210 40% 98%;--border:214.3 31.8% 91.4%;--input:214.3 31.8% 91.4%;--ring:222.2 84% 4.9%;--radius:0.5rem;--chart-1:12 76% 61%;--chart-2:173 58% 39%;--chart-3:197 37% 24%;--chart-4:43 74% 66%;--chart-5:27 87% 67%;--sidebar-background:0 0% 98%;--sidebar-foreground:240 5.3% 26.1%;--sidebar-primary:240 5.9% 10%;--sidebar-primary-foreground:0 0% 98%;--sidebar-accent:240 4.8% 95.9%;--sidebar-accent-foreground:240 5.9% 10%;--sidebar-border:220 13% 91%;--sidebar-ring:217.2 91.2% 59.8%;}
.dark{--background:222.2 84% 4.9%;--foreground:210 40% 98%;--card:222.2 84% 4.9%;--card-foreground:210 40% 98%;--popover:222.2 84% 4.9%;--popover-foreground:210 40% 98%;--primary:210 40% 98%;--primary-foreground:222.2 47.4% 11.2%;--secondary:217.2 32.6% 17.5%;--secondary-foreground:210 40% 98%;--muted:217.2 32.6% 17.5%;--muted-foreground:215 20.2% 65.1%;--accent:217.2 32.6% 17.5%;--accent-foreground:210 40% 98%;--destructive:0 62.8% 30.6%;--destructive-foreground:210 40% 98%;--border:217.2 32.6% 17.5%;--input:217.2 32.6% 17.5%;--ring:212.7 26.8% 83.9%;--chart-1:220 70% 50%;--chart-2:160 60% 45%;--chart-3:30 80% 55%;--chart-4:280 65% 60%;--chart-5:340 75% 55%;--sidebar-background:240 5.9% 10%;--sidebar-foreground:240 4.8% 95.9%;--sidebar-primary:224.3 76.3% 48%;--sidebar-primary-foreground:0 0% 100%;--sidebar-accent:240 3.7% 15.9%;--sidebar-accent-foreground:240 4.8% 95.9%;--sidebar-border:240 3.7% 15.9%;--sidebar-ring:217.2 91.2% 59.8%;}
</style>
<style type="text/tailwindcss" id="__appcss"></style>
<!-- The app's :root/.dark token VALUES, mirrored into a PLAIN stylesheet placed last so they
     always win over #__shadcn_defaults regardless of how Tailwind Play compiles/orders #__appcss.
     This is what makes theme presets actually recolor the app. -->
<style id="__apptokens"></style>
</head>
<body>
<div id="root"></div>
<pre id="__err"></pre>
<script>
// The shell loads from a blob: URL, whose pathname is the blob UUID — so a client
// router (react-router etc.) sees "/<uuid>" and matches no route, rendering a blank
// page. Normalise to "/" before any app code runs so the app's "/" route renders.
try{ history.replaceState(null,'',location.origin+'/'); }catch(e){}
const BABEL_CDNS=${JSON.stringify(BABEL_CDNS)};
window.FILES={};
let ALIASES={};        // import prefix (e.g. "@/") -> real path ("/src/")
// import.meta shim. Modules run inside new Function (not a module), so literal
// import.meta is a syntax error — we rewrite it to __import_meta__ and pass this in.
let IMPORT_META={url:location.href,env:{MODE:'production',DEV:false,PROD:true,SSR:false,BASE_URL:'/'}};
const modules={};      // resolved path -> { exports }
const deps={};         // resolved path -> { importedPath: true }  (forward edges)
const EXTERNALS={};    // npm spec -> module exports (from esm.sh)
let REACT=null, REACTDOM=null;
let reactExport=null, reactDomExport=null, reactDomClientExport=null, jsxExport=null;
let root=null;

function showError(msg){
  const el=document.getElementById('__err');
  el.style.display='block'; el.textContent=String(msg);
  try{ parent.postMessage({__ff:true,type:'error',message:String(msg)},'*'); }catch(e){}
}
function hideError(){ const el=document.getElementById('__err'); el.style.display='none'; el.textContent=''; }
window.addEventListener('error',function(e){ showError((e.error&&e.error.stack)||e.message); });
window.addEventListener('unhandledrejection',function(e){ showError('Unhandled promise rejection: '+(e.reason&&(e.reason.stack||e.reason.message)||e.reason)); });

['log','warn','error','info'].forEach(function(level){
  const orig=console[level].bind(console);
  console[level]=function(){
    try{ parent.postMessage({__ff:true,type:'log',level:level,
      args:[].slice.call(arguments).map(function(a){try{return typeof a==='string'?a:JSON.stringify(a);}catch(_){return String(a);}})},'*'); }catch(e){}
    orig.apply(null,arguments);
  };
});

// --- Live snapshot: tell the parent what's actually on screen, so the chat can "see"
// the running app (current route, page title, and the visible rendered text). Sent after
// each render and, debounced, as the user navigates/interacts or the DOM mutates.
function visibleText(){
  try{
    var root=document.getElementById('root');
    var t=((root&&root.innerText)||'').replace(/[ \\t]+\\n/g,'\\n').replace(/\\n{3,}/g,'\\n\\n').trim();
    return t.slice(0,4000);
  }catch(_){ return ''; }
}
function curRoute(){ try{ return location.hash||location.pathname||'/'; }catch(_){ return null; } }
function postSnapshot(){
  try{ parent.postMessage({__ff:true,type:'dom',dom:visibleText(),title:document.title,route:curRoute()},'*'); }catch(_){ }
}
var __snapT=null;
function scheduleSnapshot(){ if(__snapT)clearTimeout(__snapT); __snapT=setTimeout(postSnapshot,500); }
// --- Screenshot: rasterize the rendered DOM to a JPEG so the chat model can SEE the
// app, not just its text. html2canvas is loaded lazily from a CDN (same pattern as Babel).
var H2C_CDNS=['https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js','https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'];
function ensureH2C(){ return window.html2canvas?Promise.resolve():loadScript(H2C_CDNS); }
function downscale(canvas,maxW){
  if(canvas.width<=maxW) return canvas;
  var r=maxW/canvas.width, c=document.createElement('canvas');
  c.width=maxW; c.height=Math.round(canvas.height*r);
  c.getContext('2d').drawImage(canvas,0,0,c.width,c.height);
  return c;
}
function captureScreenshot(){
  ensureH2C().then(function(){
    return window.html2canvas(document.body,{useCORS:true,allowTaint:false,logging:false,backgroundColor:'#ffffff',scale:1,
      width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,
      windowWidth:document.documentElement.clientWidth,windowHeight:document.documentElement.clientHeight});
  }).then(function(canvas){
    var url=downscale(canvas,1024).toDataURL('image/jpeg',0.8);
    parent.postMessage({__ff:true,type:'screenshot',dataUrl:url},'*');
  }).catch(function(e){
    try{ parent.postMessage({__ff:true,type:'screenshot-error',message:String((e&&e.message)||e)},'*'); }catch(_){ }
  });
}

var __watch=false;
function installSnapshotWatchers(){
  if(__watch) return; __watch=true;
  try{
    var mo=new MutationObserver(scheduleSnapshot);
    var r=document.getElementById('root'); if(r) mo.observe(r,{childList:true,subtree:true,characterData:true});
  }catch(_){ }
  ['click','input','change','keyup'].forEach(function(ev){ try{ document.addEventListener(ev,scheduleSnapshot,true); }catch(_){ } });
  ['hashchange','popstate'].forEach(function(ev){ try{ window.addEventListener(ev,scheduleSnapshot); }catch(_){ } });
}

function loadScript(urls){
  return new Promise(function(resolve,reject){
    let i=0;
    (function next(){
      if(i>=urls.length){ reject(new Error('Failed to load: '+urls[0])); return; }
      const s=document.createElement('script');
      s.src=urls[i++]; s.crossOrigin='anonymous';
      s.onload=function(){resolve();}; s.onerror=next;
      document.head.appendChild(s);
    })();
  });
}

// Copy a module namespace into a plain object with __esModule so Babel's commonjs interop
// resolves default and named imports correctly.
function nsToObj(ns){ const o={__esModule:true}; for(const k in ns) o[k]=ns[k]; if(ns&&ns.default!==undefined)o.default=ns.default; return o; }
// Pin the curated deps to the versions in the scaffold's package.json so esm.sh doesn't
// surprise us with a breaking "latest".
const PINS={'react-router-dom':'6.26.2','recharts':'2.13.0','lucide-react':'0.453.0','@supabase/supabase-js':'2.45.4','date-fns':'4.1.0','clsx':'2.1.1',
// Motion/3D stack — pinned to a known-compatible set so esm.sh never drifts a peer-dep and wedges
// the preview (three<->fiber<->drei are the classic footgun). These power the advanced-motion kit.
'framer-motion':'11.11.17','gsap':'3.12.5','lenis':'1.1.14','three':'0.169.0','@react-three/fiber':'8.17.10','@react-three/drei':'9.114.3'};
function esmUrl(spec){
  const v=PINS[spec]?('@'+PINS[spec]):'';
  // @react-three/* MUST share the app's single pinned three instance (bundling their own copy
  // gives "multiple instances of three" errors). Force three external for them; pin it via ?deps.
  const r3f=spec.indexOf('@react-three/')===0;
  const ext=r3f?'react,react-dom,three':'react,react-dom';
  const deps=r3f?'&deps=three@'+PINS['three']:'';
  return 'https://esm.sh/'+spec+v+'?external='+ext+deps;
}
// Load all needed packages in parallel. A failure here is NOT fatal — render proceeds, and
// if the app actually requires the missing package, makeRequire throws a clear error then.
async function ensureExternals(list){
  const todo=(list||[]).filter(function(s){return !EXTERNALS[s];});
  const res=await Promise.all(todo.map(function(spec){
    // Per-package timeout so one hanging esm.sh fetch can't wedge the whole preview
    // on "Building preview…" — a slow/dead package degrades to a non-fatal warning.
    return withTimeout(import(esmUrl(spec)),20000,spec).then(function(m){ EXTERNALS[spec]=nsToObj(m); return null; })
      .catch(function(e){ return spec+' ('+((e&&e.message)||e)+')'; });
  }));
  const fails=res.filter(Boolean);
  if(fails.length){ try{ console.warn('[preview] packages failed to load from esm.sh: '+fails.join('; ')); }catch(_){ } }
  patchRouter();
}

// The iframe is served from a blob: URL whose pathname is the blob UUID, and the browser
// won't let us rewrite it to "/". So BrowserRouter (which reads window.location) matches no
// route and the app renders blank. Swap BrowserRouter -> MemoryRouter (defaults to "/") and
// createBrowserRouter -> createMemoryRouter so routing works off in-memory history instead.
// Link/useNavigate/etc. are router-agnostic and keep working; only the URL bar is inert.
function patchRouter(){
  ['react-router-dom','react-router'].forEach(function(rr){
    const m=EXTERNALS[rr];
    if(!m) return;
    [m, m.default].forEach(function(ns){
      if(!ns||typeof ns!=='object') return;
      try{
        if(ns.MemoryRouter && ns.BrowserRouter!==ns.MemoryRouter) ns.BrowserRouter=ns.MemoryRouter;
        if(ns.createMemoryRouter && ns.createBrowserRouter) ns.createBrowserRouter=ns.createMemoryRouter;
      }catch(_){ /* frozen namespace — the named-export copy is what the app reads */ }
    });
  });
}

function normalize(base, rel){
  if(rel[0]!=='.') return rel;
  const dir=base.slice(0,base.lastIndexOf('/'));
  const parts=(dir+'/'+rel).split('/'); const out=[];
  for(const p of parts){ if(p===''||p==='.')continue; if(p==='..')out.pop(); else out.push(p); }
  return '/'+out.join('/');
}
function resolvePath(p){
  const c=[p,p+'.js',p+'.jsx',p+'.ts',p+'.tsx',p+'/index.js',p+'/index.jsx',p+'/index.ts',p+'/index.tsx'];
  for(const x of c) if(x in window.FILES) return x;
  return null;
}
// VISUAL EDITS groundwork: tag every host JSX element with its source location at compile time
// (data-ff-loc="file:line:col"). We own the compiler, so this is a free, deterministic map from
// any rendered DOM node back to the exact JSX that produced it. Registered LAZILY — this shell
// script executes before the Babel <script> finishes loading, so a top-level registerPlugin
// throws "Babel is not defined"; makeRequire calls this right before the first transform.
var __ffLocRegistered=false;
function registerFfLoc(){
  if(__ffLocRegistered||typeof Babel==='undefined') return;
  __ffLocRegistered=true;
  Babel.registerPlugin('ff-loc', function(b){
    const t=b.types;
    return {visitor:{JSXOpeningElement:function(path,state){
      const n=path.node; if(!n.loc) return;
      const nm=n.name; if(!nm||nm.type!=='JSXIdentifier'||!/^[a-z]/.test(nm.name)) return; // host elements only
      for(var i=0;i<n.attributes.length;i++){ var a=n.attributes[i]; if(a.type==='JSXAttribute'&&a.name&&a.name.name==='data-ff-loc') return; }
      var file=(state.file&&state.file.opts&&state.file.opts.filename)||'?';
      n.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-ff-loc'),t.stringLiteral(file+':'+n.loc.start.line+':'+n.loc.start.column)));
    }}};
  });
}

// Selection mode: parent toggles it; hovering highlights tagged elements, clicking reports the
// element's source location (and how many siblings share it — a .map() renders one JSX many times).
(function(){
  var hl=null;
  function box(){ if(hl) return hl; hl=document.createElement('div');
    hl.style.cssText='position:fixed;z-index:2147483000;pointer-events:none;border:2px solid #FF8A3D;background:rgba(255,138,61,0.08);border-radius:4px;transition:all 60ms;display:none';
    document.body.appendChild(hl); return hl; }
  function target(e){ return e.target&&e.target.closest?e.target.closest('[data-ff-loc]'):null; }
  function move(e){ var el=target(e); var b=box();
    if(!el){ b.style.display='none'; return; }
    var r=el.getBoundingClientRect();
    b.style.display='block'; b.style.left=r.left+'px'; b.style.top=r.top+'px'; b.style.width=r.width+'px'; b.style.height=r.height+'px'; }
  function click(e){ var el=target(e); if(!el) return;
    e.preventDefault(); e.stopPropagation();
    var loc=el.getAttribute('data-ff-loc');
    var dup=document.querySelectorAll('[data-ff-loc="'+loc+'"]').length;
    parent.postMessage({__ff:true,type:'selected',loc:loc,tag:el.tagName.toLowerCase(),
      text:(el.textContent||'').slice(0,160),className:el.getAttribute('class')||'',count:dup},'*'); }
  window.addEventListener('message',function(ev){ var d=ev.data;
    if(!d||!d.__ff_cmd||d.type!=='edit-mode') return;
    if(d.on){ document.addEventListener('mousemove',move,true); document.addEventListener('click',click,true); }
    else{ document.removeEventListener('mousemove',move,true); document.removeEventListener('click',click,true); if(hl) hl.style.display='none'; }
  });
})();

function makeRequire(base){
  return function(spec){
    if(spec==='react') return reactExport;
    if(spec==='react-dom') return reactDomExport;
    if(spec==='react-dom/client') return reactDomClientExport;
    if(spec==='react/jsx-runtime'||spec==='react/jsx-dev-runtime') return jsxExport||{};
    if(/\\.css$/.test(spec)) return {};
    // Rewrite path aliases ("@/x" -> "/src/x") so they resolve as local modules.
    for(var a in ALIASES){ if(spec.indexOf(a)===0){ spec=ALIASES[a]+spec.slice(a.length); break; } }
    if(spec==='crypto'||spec==='node:crypto'){
      const C=(self.crypto||window.crypto);
      const shim={__esModule:true,
        randomUUID:function(){ return (C&&C.randomUUID)?C.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){const r=Math.random()*16|0,v=c==='x'?r:((r&0x3)|0x8);return v.toString(16);}); },
        getRandomValues:function(a){ return C.getRandomValues(a); }
      };
      shim.default=shim; return shim;
    }
    if(spec[0]!=='.'&&spec[0]!=='/'){
      if(EXTERNALS[spec]) return EXTERNALS[spec];
      throw new Error('Package "'+spec+'" was not pre-loaded (add it to the imports).');
    }
    const path=resolvePath(normalize(base,spec));
    if(!path) throw new Error('Module not found: "'+spec+'" imported from '+base);
    (deps[base]=deps[base]||{})[path]=true;
    if(modules[path]) return modules[path].exports;
    const mod={exports:{}}; modules[path]=mod;
    let code;
    try{
      registerFfLoc();
      code=Babel.transform(window.FILES[path],{
        presets:[['react',{runtime:'classic'}],['env',{modules:'commonjs'}],
          (/\\.tsx?$/.test(path)?'typescript':null)].filter(Boolean),
        plugins:(__ffLocRegistered?['ff-loc']:[]),
        filename:path
      }).code;
    }catch(e){ throw new Error('Compile error in '+path+':\\n'+(e.message||e)); }
    code=code.replace(/import\\.meta/g,'__import_meta__'); // import.meta is illegal in new Function
    const fn=new Function('require','module','exports','React','ReactDOM','__import_meta__',code);
    fn(makeRequire(path),mod,mod.exports,REACT,REACTDOM,IMPORT_META);
    return mod.exports;
  };
}

// Pick the entry. "self" entries call createRoot themselves (main/index); for App-style
// entries we render the default export. Ordered most- to least-specific.
function entryPath(){
  const F=window.FILES;
  const selfEntries=['/src/main.tsx','/src/main.jsx','/src/main.ts','/src/main.js',
    '/src/index.tsx','/src/index.jsx','/src/index.ts','/src/index.js',
    '/main.tsx','/main.jsx','/index.tsx','/index.jsx','/index.js',
    '/src/client.tsx','/src/client.jsx','/src/entry-client.tsx'];
  for(const p of selfEntries) if(F[p]) return {path:p,self:true};
  const appEntries=['/src/App.tsx','/src/App.jsx','/src/app.tsx','/App.tsx','/App.jsx','/App.js'];
  for(const p of appEntries) if(F[p]) return {path:p,self:false};
  return null;
}

// Frameworks that need a Node/edge server runtime — our browser-only preview can't run them.
function detectServerFramework(){
  const F=window.FILES;
  if(F['/src/routeTree.gen.ts']||F['/src/start.ts']||(F['/src/server.ts']&&F['/src/router.tsx'])) return 'TanStack Start';
  for(const k in F){ if(/\\/next\\.config\\.[mc]?[tj]s$/.test(k)||k==='/next.config.js') return 'Next.js'; }
  for(const k in F){ if(/\\/(remix\\.config|vite\\.config)\\.[tj]s$/.test(k)&&/@remix-run/.test(F[k]||'')) return 'Remix'; }
  return null;
}

function info(msg){
  const r=document.getElementById('root');
  if(r) r.innerHTML='<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0B0D12;color:#8A8F98;font:13px/1.6 ui-sans-serif,system-ui,sans-serif;text-align:center;padding:40px">'
    +'<style>@keyframes ffp{0%,100%{opacity:.55;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}@keyframes ffb{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}</style>'
    +'<div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#FF8A3D,#FF5C39);display:flex;align-items:center;justify-content:center;animation:ffp 1.6s ease-in-out infinite;box-shadow:0 0 34px rgba(255,138,61,.35)">'
    +'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A0E04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></div>'
    +'<div style="color:#E8E6E1;font-weight:600;font-size:14px;letter-spacing:-0.01em">'+msg+'</div>'
    +'<div style="color:#8A8F98;font-size:11px">Your app is being forged — files land here live</div>'
    +'<div style="width:180px;height:3px;border-radius:99px;background:#1E222B;overflow:hidden"><div style="width:40%;height:100%;border-radius:99px;background:linear-gradient(90deg,#FF8A3D,#FF5C39);animation:ffb 1.4s ease-in-out infinite"></div></div>'
    +'</div>';
  // Clear the parent's "Building preview…" overlay so this message is actually visible.
  try{ parent.postMessage({__ff:true,type:'ready'},'*'); }catch(e){}
}
function renderApp(){
  hideError();
  try{
    deps['/']={};
    const paths=Object.keys(window.FILES);
    const e=entryPath();
    try{ console.log('[preview] render — entry:', e&&e.path, '| files:', paths.length, '| pkgs:', Object.keys(EXTERNALS).join(',')||'none'); }catch(_){ }
    if(!e){
      if(!paths.length){ info('Waiting for project files…'); return; }
      const fw=detectServerFramework();
      if(fw){ info('This is a '+fw+' app — a full-stack framework that runs on a server.<br>The in-browser preview supports client-side React/Vite apps, so it can\\'t render this one.<br><br>You can still edit its code and use the assistant; deploy it to see it live.'); return; }
      throw new Error('No client entry file found (expected e.g. /src/main.tsx, /src/index.tsx, or /src/App.tsx).\\nFiles present:\\n'+paths.join('\\n'));
    }
    if(e.self){
      makeRequire('/')(e.path);
    } else {
      const exp=makeRequire('/')(e.path);
      const App=(exp&&(exp.default||exp.App))||exp;
      if(typeof App!=='function') throw new Error(e.path+' must default-export a React component.');
      if(!root) root=reactDomClientExport.createRoot(document.getElementById('root'));
      root.render(REACT.createElement(App));
    }
    try{ parent.postMessage({__ff:true,type:'ready'},'*'); }catch(e){}
    installSnapshotWatchers(); scheduleSnapshot();
    // BLANK-SCREEN DETECTOR: a mounted app that renders NOTHING throws no error — but silence
    // is not success. If the root has no visible content 3s after mount, report it as an error
    // so the auto-fix loop engages instead of leaving a white screen with no explanation.
    setTimeout(function(){
      try{
        var r=document.getElementById('root');
        var txt=(r&&r.innerText||'').trim();
        if(r&&r.childElementCount===0&&!txt){
          parent.postMessage({__ff:true,type:'error',message:'The app mounted but rendered a BLANK screen at "'+(location.hash||'#/')+'" — no elements, no text, and no thrown error. Likely causes: the route renders null, a data guard never resolves (loading state stuck), or App returns nothing. Find the root cause and fix it.'},'*');
        }
      }catch(e){}
    },3000);
  }catch(err){ showError((err&&err.stack)||(err&&err.message)||err); }
}

// Swap in a new file set. Invalidate only modules whose source changed plus every
// module that (transitively) imported them; reuse cached modules for everything else.
async function update(newFiles, externalsList, aliasMap, envMap){
  ALIASES=aliasMap||{};
  IMPORT_META={url:location.href,env:Object.assign({MODE:'production',DEV:false,PROD:true,SSR:false,BASE_URL:'/'},envMap||{})};
  const oldFiles=window.FILES||{};
  const seen={}; let k;
  for(k in oldFiles) seen[k]=true;
  for(k in newFiles) seen[k]=true;
  const changed=[];
  for(k in seen){ if(oldFiles[k]!==newFiles[k]) changed.push(k); }
  const rev={};
  for(const imp in deps){ for(const t in deps[imp]){ (rev[t]=rev[t]||{})[imp]=true; } }
  const inval={}; const queue=changed.slice();
  while(queue.length){
    const p=queue.shift();
    if(inval[p]) continue;
    inval[p]=true;
    if(rev[p]) for(const i in rev[p]) if(!inval[i]) queue.push(i);
  }
  for(const q in inval){ delete modules[q]; delete deps[q]; }
  window.FILES=newFiles;
  try{ await ensureExternals(externalsList); }
  catch(err){ showError((err&&err.stack)||(err&&err.message)||err); return; }
  renderApp();
}

window.addEventListener('message',function(e){
  const d=e.data;
  if(!d||!d.__ff_cmd) return;
  if(d.type==='update'){
    const css=d.css||'';
    const el=document.getElementById('__appcss');
    if(el) el.textContent=css;
    // Also mirror the app CSS into a PLAIN stylesheet (last in <head>) so the :root/.dark token
    // VALUES always apply, even if Tailwind Play hasn't recompiled #__appcss or orders it before
    // the defaults. @apply/@tailwind in here are harmlessly ignored by the browser (Play handles
    // them via #__appcss); the plain :root/.dark rules are what guarantee themes recolor.
    const tok=document.getElementById('__apptokens');
    if(tok) tok.textContent=css;
    update(d.files||{}, d.externals||[], d.aliases||{}, d.env||{});
  } else if(d.type==='screenshot'){
    captureScreenshot();
  }
});

function withTimeout(p,ms,label){
  return Promise.race([p,new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('Timed out loading '+label+' (network blocked?)')); },ms); })]);
}
(async function(){
  try{
    await withTimeout(loadScript(BABEL_CDNS),15000,'the compiler (Babel)');
    reactExport=nsToObj(await withTimeout(import('react'),15000,'React'));
    reactDomExport=nsToObj(await withTimeout(import('react-dom'),15000,'ReactDOM'));
    reactDomClientExport=nsToObj(await withTimeout(import('react-dom/client'),15000,'ReactDOM client'));
    try{ jsxExport=nsToObj(await import('react/jsx-runtime')); }catch(_){ jsxExport=null; }
    REACT=reactExport.default||reactExport;
    REACTDOM=reactDomExport.default||reactDomExport;
    // Memoize createRoot so self-rendering entries (main.tsx) don't double-mount on hot updates.
    const _cr=reactDomClientExport.createRoot;
    reactDomClientExport.createRoot=function(c){ if(!root) root=_cr(c); return root; };
    try{ parent.postMessage({__ff:true,type:'shell-ready'},'*'); }catch(e){}
  }catch(err){ showError('Failed to start the preview runtime: '+((err&&err.stack)||(err&&err.message)||err)); }
})();
</script>
</body>
</html>`;
}

interface LogLine { level: string; text: string }

// Debounce a value so rapid edits collapse into a single preview update.
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** In-browser preview for generated apps. The iframe shell mounts once; file changes
 * are streamed in via postMessage for flash-free hot updates. */
function NativePreview({ files, device, showConsole, onFixError, busy, onSelectElement }: {
  files: ProjectFile[]; device: Device; showConsole: boolean; onFixError: (e: string) => void; busy?: boolean;
  onSelectElement?: (sel: SelectedElement) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shellReady = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // AUTO-FIX: when the app hits a runtime/compile error, hand it to the AI immediately — no
  // button press needed. Debounced (transient errors during a rebuild settle first), paused
  // while the assistant is already working, and capped at 2 attempts per distinct error so a
  // stubborn failure can never loop credits away.
  const fixAttempts = useRef(new Map<string, number>());
  const [autoFixing, setAutoFixing] = useState(false);
  useEffect(() => {
    if (!error) { setAutoFixing(false); return; }
    if (busy) return;
    const sig = error.slice(0, 200);
    const n = fixAttempts.current.get(sig) ?? 0;
    if (n >= 2) { setAutoFixing(false); return; }
    const t = window.setTimeout(() => {
      fixAttempts.current.set(sig, n + 1);
      setAutoFixing(true);
      onFixError(error);
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, busy]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false); // true once a load has run long enough to look stuck
  const [nonce, setNonce] = useState(0); // remount key for a hard retry
  // Pending screenshot capture: resolves when the iframe posts back its rasterized image.
  const pendingShot = useRef<{ resolve: (v: string | null) => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  // Load the shell from a blob: URL rather than srcDoc. A srcDoc document's URL is
  // "about:srcdoc", which has no valid base — react-router's `new URL(...)` throws on it.
  // A blob URL gives the iframe a real, same-origin location. `nonce` rebuilds it on Retry.
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([buildShell()], { type: 'text/html' })), [nonce]);
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);

  const payload = useMemo(() => buildPayload(files), [files]);
  const debounced = useDebounced(payload, 200);

  // After a while, a still-loading preview reads as "stuck" — surface an explanation + Reload.
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 18000);
    return () => clearTimeout(t);
  }, [loading, nonce]);

  // Keep the freshest payload available for the initial post on shell-ready.
  const latest = useRef(payload);
  useEffect(() => { latest.current = payload; }, [payload]);

  const post = (p: PreviewPayload) => {
    iframeRef.current?.contentWindow?.postMessage({ __ff_cmd: true, type: 'update', ...p }, '*');
  };

  // A fresh iframe (Retry) isn't ready yet — wait for its shell-ready handshake.
  useEffect(() => {
    shellReady.current = false;
    setError(null); setLogs([]); setLoading(true);
    resetPreviewSnapshot(); // drop runtime state from the previous iframe
  }, [nonce]);

  // Stream debounced edits into the running iframe.
  useEffect(() => {
    if (shellReady.current) post(debounced);
  }, [debounced]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || !d.__ff) return;
      if (d.type === 'shell-ready') { shellReady.current = true; post(latest.current); }
      else if (d.type === 'error') { setError(d.message); setLoading(false); updatePreviewSnapshot({ error: d.message }); }
      else if (d.type === 'ready') { setError(null); setLoading(false); updatePreviewSnapshot({ error: null }); }
      else if (d.type === 'log') {
        const text = (d.args ?? []).join(' ');
        setLogs((l) => [...l.slice(-99), { level: d.level, text }]);
        pushPreviewLog({ level: d.level, text });
      } else if (d.type === 'dom') {
        updatePreviewSnapshot({ dom: d.dom ?? null, title: d.title ?? null, route: d.route ?? null });
      } else if (d.type === 'selected') {
        setEditMode(false);
        onSelectRef.current?.({ loc: d.loc ?? '', tag: d.tag ?? '', text: d.text ?? '', className: d.className ?? '', count: d.count ?? 1 });
      } else if (d.type === 'screenshot' || d.type === 'screenshot-error') {
        const p = pendingShot.current;
        if (p) { clearTimeout(p.timer); pendingShot.current = null; p.resolve(d.type === 'screenshot' ? (d.dataUrl ?? null) : null); }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Expose screenshot capture to the chat: post a request into the iframe and resolve
  // when it sends the rasterized image back (or null on timeout / failure / not-ready).
  useEffect(() => {
    registerScreenshotCapture(() => new Promise<string | null>((resolve) => {
      const win = iframeRef.current?.contentWindow;
      if (!shellReady.current || !win) { resolve(null); return; }
      if (pendingShot.current) { clearTimeout(pendingShot.current.timer); pendingShot.current.resolve(null); }
      const timer = setTimeout(() => { pendingShot.current = null; resolve(null); }, 12000);
      pendingShot.current = { resolve, timer };
      win.postMessage({ __ff_cmd: true, type: 'screenshot' }, '*');
    }));
    return () => registerScreenshotCapture(null);
  }, []);

  // PAGE SELECTOR: every concrete <Route path> in the app, jumpable from a dropdown. The blob
  // iframe is same-origin, so navigation is a direct hash set (HashRouter picks it up).
  const routes = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      if (!/\.(t|j)sx?$/.test(f.path)) continue;
      for (const m of f.content.matchAll(/<Route\b[^>]*\bpath=["']([^"']+)["']/g)) {
        const p = m[1];
        if (p.includes('*') || p.includes(':')) continue; // skip catch-alls + param routes
        set.add(p.startsWith('/') ? p : '/' + p);
      }
    }
    return [...set].sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
  }, [files]);
  const [page, setPage] = useState('/');
  const goto = (path: string) => {
    setPage(path);
    try {
      const w = iframeRef.current?.contentWindow;
      if (w) w.location.hash = '#' + path;
    } catch { /* cross-origin shouldn't happen for blob previews; ignore */ }
  };

  // Select-to-edit mode: toggles the in-iframe overlay; a click there reports the element and
  // turns the mode back off. Callback kept in a ref so the message listener stays stable.
  const [editMode, setEditMode] = useState(false);
  const onSelectRef = useRef(onSelectElement);
  useEffect(() => { onSelectRef.current = onSelectElement; }, [onSelectElement]);
  useEffect(() => {
    try { iframeRef.current?.contentWindow?.postMessage({ __ff_cmd: true, type: 'edit-mode', on: editMode }, '*'); } catch { /* not ready */ }
  }, [editMode]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-forge-border bg-forge-panel px-2 py-1">
        {routes.length > 1 && (
          <>
            <span className="text-[10px] font-medium uppercase tracking-wide text-forge-dim">Page</span>
            <select
              value={page}
              onChange={(e) => goto(e.target.value)}
              aria-label="Jump to a page"
              className="h-6 rounded border border-forge-border bg-forge-bg px-1.5 font-mono text-[11px] text-forge-ink focus:border-forge-ember/60 focus:outline-none"
            >
              {routes.map((r) => <option key={r} value={r}>{r === '/' ? '/ (home)' : r}</option>)}
            </select>
            <span className="text-[10px] text-forge-dim">{routes.length} pages</span>
          </>
        )}
        {onSelectElement && (
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
            title="Select an element — click anything in the preview to target it in chat"
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors',
              editMode ? 'border-forge-ember bg-forge-ember/15 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink',
            )}
          >
            <MousePointerClick size={11} /> {editMode ? 'Click an element…' : 'Select'}
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto panel-scroll bg-[#0A0B0F] p-3">
        <div
          className="relative h-full overflow-hidden rounded-lg border border-forge-border bg-white transition-all"
          style={{ width: DEVICE_WIDTH[device], maxWidth: '100%' }}
        >
          {loading && !error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white px-6 text-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
              <span className="text-xs font-medium text-gray-500">Building preview…</span>
              {logs.length > 0 && (
                <span className="max-w-full truncate font-mono text-[10px] text-gray-400">{logs[logs.length - 1].text}</span>
              )}
              {slow && (
                <div className="mt-1 flex flex-col items-center gap-1.5">
                  <span className="max-w-xs text-[11px] leading-relaxed text-gray-400">
                    First load compiles your app and fetches its packages — this can take 20–40s. It speeds up on reload.
                  </span>
                  <button
                    onClick={() => setNonce((n) => n + 1)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Reload preview
                  </button>
                </div>
              )}
            </div>
          )}
          <iframe
            key={nonce}
            ref={iframeRef}
            title="App preview"
            src={blobUrl}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            className="h-full w-full border-0"
          />
        </div>
      </div>

      {error && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-forge-err/40 bg-forge-bg/95 p-3 shadow-xl">
          <p className="text-xs font-medium text-forge-err">Preview error</p>
          <pre className="mt-1 max-h-24 overflow-auto panel-scroll whitespace-pre-wrap font-mono text-[11px] text-forge-dim">
            {error}
          </pre>
          {(autoFixing || busy) ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-forge-ink">
              <Wand2 size={12} className="animate-pulse text-forge-ember" /> Auto-fixing this error…
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={() => onFixError(error)}>
                <Wand2 size={13} /> Fix with AI
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>Retry</Button>
              {(fixAttempts.current.get(error.slice(0, 200)) ?? 0) >= 2 && (
                <span className="text-[10px] text-forge-dim">Auto-fix tried twice — tell the chat what you expected to see.</span>
              )}
            </div>
          )}
        </div>
      )}

      {showConsole && (
        <div className="h-40 shrink-0 overflow-auto panel-scroll border-t border-forge-border bg-forge-panel p-2 font-mono text-[11px]">
          {logs.length === 0 ? (
            <p className="text-forge-dim">Console output appears here.</p>
          ) : logs.map((l, i) => (
            <div key={i} className={cn('whitespace-pre-wrap', l.level === 'error' ? 'text-forge-err' : l.level === 'warn' ? 'text-yellow-400' : 'text-forge-dim')}>
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PreviewPane({ files, onFixError, device, showConsole, busy, onSelectElement }: Props) {
  // The toolbar (device size + console) now lives in the workspace's unified Runtime bar, so the
  // preview area is just the rendered app — one toolbar row instead of two.
  return (
    <div className="flex h-full flex-col">
      <NativePreview files={files} device={device} showConsole={showConsole} onFixError={onFixError} busy={busy} onSelectElement={onSelectElement} />
    </div>
  );
}
