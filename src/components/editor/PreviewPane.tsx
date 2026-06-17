import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, Terminal, Wand2 } from 'lucide-react';
import type { ProjectFile } from '../../types';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

type Device = 'desktop' | 'tablet' | 'mobile';
const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '390px' };

interface Props {
  files: ProjectFile[];
  onFixError: (error: string) => void;
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

interface PreviewPayload { files: Record<string, string>; css: string; externals: string[] }

const REACT_PIN = '18.3.1';
const REACT_FAMILY = new Set(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime']);
// Build-time / Node-only specifiers that must never be fetched from esm.sh.
const NON_BROWSER = new Set([
  'vite', '@vitejs/plugin-react', '@vitejs/plugin-react-swc', 'typescript',
  'fs', 'path', 'url', 'crypto', 'http', 'https', 'stream', 'os', 'child_process',
  'util', 'events', 'buffer', 'process', 'module',
]);
// Files that are build config, not runnable app source — the native preview ignores them.
const isConfigFile = (p: string) => /\/(vite\.config\.[tj]s|vite\.config\.mjs)$/.test(p);

// Find bare npm imports across the source so the preview can pre-load them from esm.sh
// before running the app (require() is synchronous; dynamic import is not).
function scanExternals(files: Record<string, string>): string[] {
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
        if (REACT_FAMILY.has(s) || NON_BROWSER.has(s) || /\.css$/.test(s)) continue;
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
    if (isConfigFile(f.path)) continue; // build config, not app source
    if (/\.css$/.test(f.path)) cssChunks.push(f.content);
    else if (/\.(js|jsx|ts|tsx)$/.test(f.path)) jsFiles[f.path] = f.content;
  }
  // No synthetic fallback file — the shell shows an informative state when there's no entry,
  // so a genuine "no files yet" is never disguised as a rendered app.
  return { files: jsFiles, css: cssChunks.join('\n'), externals: scanExternals(jsFiles) };
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
<script type="importmap">${JSON.stringify(importMap)}</script>
<script src="https://cdn.tailwindcss.com"></script>
<style>html,body{margin:0;height:100%}#root{min-height:100%}
#__err{position:fixed;inset:0;background:#0b0b0f;color:#f7768e;font:13px/1.5 ui-monospace,monospace;padding:20px;white-space:pre-wrap;overflow:auto;display:none;z-index:99999}</style>
<style id="__appcss"></style>
</head>
<body>
<div id="root"></div>
<pre id="__err"></pre>
<script>
const BABEL_CDNS=${JSON.stringify(BABEL_CDNS)};
window.FILES={};
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
const PINS={'react-router-dom':'6.26.2','recharts':'2.13.0','lucide-react':'0.453.0','@supabase/supabase-js':'2.45.4','date-fns':'4.1.0','clsx':'2.1.1'};
function esmUrl(spec){ const v=PINS[spec]?('@'+PINS[spec]):''; return 'https://esm.sh/'+spec+v+'?external=react,react-dom'; }
// Load all needed packages in parallel. A failure here is NOT fatal — render proceeds, and
// if the app actually requires the missing package, makeRequire throws a clear error then.
async function ensureExternals(list){
  const todo=(list||[]).filter(function(s){return !EXTERNALS[s];});
  const res=await Promise.all(todo.map(function(spec){
    return import(esmUrl(spec)).then(function(m){ EXTERNALS[spec]=nsToObj(m); return null; })
      .catch(function(e){ return spec+' ('+((e&&e.message)||e)+')'; });
  }));
  const fails=res.filter(Boolean);
  if(fails.length){ try{ console.warn('[preview] packages failed to load from esm.sh: '+fails.join('; ')); }catch(_){ } }
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
function makeRequire(base){
  return function(spec){
    if(spec==='react') return reactExport;
    if(spec==='react-dom') return reactDomExport;
    if(spec==='react-dom/client') return reactDomClientExport;
    if(spec==='react/jsx-runtime'||spec==='react/jsx-dev-runtime') return jsxExport||{};
    if(/\\.css$/.test(spec)) return {};
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
      code=Babel.transform(window.FILES[path],{
        presets:[['react',{runtime:'classic'}],['env',{modules:'commonjs'}],
          (/\\.tsx?$/.test(path)?'typescript':null)].filter(Boolean),
        filename:path
      }).code;
    }catch(e){ throw new Error('Compile error in '+path+':\\n'+(e.message||e)); }
    const fn=new Function('require','module','exports','React','ReactDOM',code);
    fn(makeRequire(path),mod,mod.exports,REACT,REACTDOM);
    return mod.exports;
  };
}

// Pick the entry. main.tsx / index.js render themselves; App.tsx / App.js we render.
function entryPath(){
  const F=window.FILES;
  if(F['/src/main.tsx']) return {path:'/src/main.tsx',self:true};
  if(F['/src/main.jsx']) return {path:'/src/main.jsx',self:true};
  if(F['/index.js']) return {path:'/index.js',self:true};
  if(F['/src/App.tsx']) return {path:'/src/App.tsx',self:false};
  if(F['/App.js']) return {path:'/App.js',self:false};
  return null;
}

function info(msg){
  const r=document.getElementById('root');
  if(r) r.innerHTML='<div style="padding:40px;font:14px/1.5 system-ui;color:#888;text-align:center">'+msg+'</div>';
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
      throw new Error('No entry file found (expected /src/main.tsx or /src/App.tsx).\\nFiles present:\\n'+paths.join('\\n'));
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
  }catch(err){ showError((err&&err.stack)||(err&&err.message)||err); }
}

// Swap in a new file set. Invalidate only modules whose source changed plus every
// module that (transitively) imported them; reuse cached modules for everything else.
async function update(newFiles, externalsList){
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
    const el=document.getElementById('__appcss');
    if(el) el.textContent=d.css||'';
    update(d.files||{}, d.externals||[]);
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
function NativePreview({ files, device, showConsole, onFixError }: {
  files: ProjectFile[]; device: Device; showConsole: boolean; onFixError: (e: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shellReady = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0); // remount key for a hard retry

  // Load the shell from a blob: URL rather than srcDoc. A srcDoc document's URL is
  // "about:srcdoc", which has no valid base — react-router's `new URL(...)` throws on it.
  // A blob URL gives the iframe a real, same-origin location. `nonce` rebuilds it on Retry.
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([buildShell()], { type: 'text/html' })), [nonce]);
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);

  const payload = useMemo(() => buildPayload(files), [files]);
  const debounced = useDebounced(payload, 200);

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
      else if (d.type === 'error') { setError(d.message); setLoading(false); }
      else if (d.type === 'ready') { setError(null); setLoading(false); }
      else if (d.type === 'log') {
        setLogs((l) => [...l.slice(-99), { level: d.level, text: (d.args ?? []).join(' ') }]);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto panel-scroll bg-[#0A0B0F] p-3">
        <div
          className="relative h-full overflow-hidden rounded-lg border border-forge-border bg-white transition-all"
          style={{ width: DEVICE_WIDTH[device], maxWidth: '100%' }}
        >
          {loading && !error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <span className="text-xs text-gray-400">Building preview…</span>
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
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => onFixError(error)}>
              <Wand2 size={13} /> Fix with AI
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>Retry</Button>
          </div>
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

export function PreviewPane({ files, onFixError }: Props) {
  const [device, setDevice] = useState<Device>('desktop');
  const [showConsole, setShowConsole] = useState(false);

  const toolbar = (
    <div className="flex items-center gap-1 border-b border-forge-border bg-forge-panel px-2 py-1.5">
      <span className="px-1 text-xs font-medium uppercase tracking-wide text-forge-dim">Preview</span>
      <div className="mx-2 flex items-center gap-0.5 rounded-lg border border-forge-border p-0.5" role="group" aria-label="Device size">
        {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
          <button key={d} aria-label={`${d} preview`} aria-pressed={device === d} onClick={() => setDevice(d)}
            className={cn('rounded-md p-1.5', device === d ? 'bg-forge-raised text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button aria-label="Toggle console" aria-pressed={showConsole} onClick={() => setShowConsole((v) => !v)}
          className={cn('rounded p-1.5', showConsole ? 'text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}>
          <Terminal size={14} />
        </button>
      </div>
    </div>
  );

  // All projects (generated and imported) run in the self-contained native preview:
  // React + npm from esm.sh, in-browser TS/JSX compile, no CodeSandbox dependency.
  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <NativePreview files={files} device={device} showConsole={showConsole} onFixError={onFixError} />
    </div>
  );
}
