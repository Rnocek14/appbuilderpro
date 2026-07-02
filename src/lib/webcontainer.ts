// src/lib/webcontainer.ts
// Run imported projects (full-stack: TanStack Start, Next, Vite) in-browser via a
// WebContainer — a real Node.js + npm + dev server compiled to WebAssembly. This is what
// lets server-dependent apps actually boot, which the static blob preview cannot do.
//
// Requires the page to be cross-origin isolated (COOP: same-origin + COEP: credentialless,
// set in vite.config.ts). WebContainer.boot() throws otherwise.

import { WebContainer, type FileSystemTree, type WebContainerProcess } from '@webcontainer/api';
import type { ProjectFile } from '../types';
import { isMetaFile } from './projectBrain';

export type { WebContainerProcess };

// WebContainer allows only ONE instance per PAGE — and module-level state does not survive
// Vite HMR: a hot reload resets a module singleton while the booted instance lives on in the
// page, so the next boot throws "Only a single WebContainer instance can be booted". The boot
// promise therefore lives on globalThis (page-scoped), not in this module.
const BOOT_KEY = '__ff_wc_boot__';

export function getWebContainer(): Promise<WebContainer> {
  const g = globalThis as Record<string, unknown>;
  let p = g[BOOT_KEY] as Promise<WebContainer> | undefined | null;
  if (!p) {
    // coep must match the header the page is served with so preview iframes load.
    p = WebContainer.boot({ coep: 'credentialless' }).catch((e) => {
      // NEVER cache a failed boot — a transient failure would otherwise poison every later
      // caller (pane, deep verify, Retry button) until a full page reload.
      (globalThis as Record<string, unknown>)[BOOT_KEY] = null;
      throw e;
    });
    g[BOOT_KEY] = p;
  }
  return p;
}

export function isolationReady(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true;
}

/**
 * Wipe the previous project's files from the container FS before mounting a DIFFERENT project.
 * wc.mount() MERGES trees — without this, a project with few files (e.g. a stalled generation)
 * renders the LEFTOVER files of whatever project was mounted before (cross-project bleed).
 * node_modules is kept: npm install runs on every project switch anyway and reconciles deps.
 */
async function wipeProjectFs(wc: WebContainer): Promise<void> {
  let entries: string[] = [];
  try { entries = (await wc.fs.readdir('/')) as string[]; } catch { return; }
  await Promise.all(entries.map(async (name) => {
    if (name === 'node_modules' || name.startsWith('.')) return;
    try { await wc.fs.rm('/' + name, { recursive: true, force: true }); } catch { /* best-effort */ }
  }));
}

/** Convert flat project files (/src/main.tsx → content) into WebContainer's nested tree. */
export function buildFileTree(files: ProjectFile[]): FileSystemTree {
  const root: FileSystemTree = {};
  for (const f of files) {
    if (isMetaFile(f.path)) continue; // skip FableForge's .fableforge/ brain/map files
    const parts = f.path.replace(/^\//, '').split('/').filter(Boolean);
    if (!parts.length) continue;
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      const existing = dir[seg];
      if (!existing || !('directory' in existing)) dir[seg] = { directory: {} };
      dir = (dir[seg] as { directory: FileSystemTree }).directory;
    }
    dir[parts[parts.length - 1]] = { file: { contents: f.content } };
  }
  return root;
}

/** Pick the script that starts a dev server, from package.json. */
export function detectDevScript(files: ProjectFile[]): string | null {
  const pkg = files.find((f) => f.path === '/package.json');
  if (!pkg) return null;
  try {
    const scripts = (JSON.parse(pkg.content).scripts ?? {}) as Record<string, string>;
    for (const name of ['dev', 'start', 'serve']) if (scripts[name]) return name;
  } catch { /* ignore malformed package.json */ }
  return null;
}

export function hasPackageJson(files: ProjectFile[]): boolean {
  return files.some((f) => f.path === '/package.json');
}

// ---------------------------------------------------------------------------
// Observability shim
//
// The WebContainer dev server runs at its OWN cross-origin URL, so — unlike the same-origin
// blob preview — we can't read its DOM or console from the parent. Instead we inject this
// script into the app's index.html at mount time. It runs INSIDE the app and reports console
// output, errors, a DOM/text snapshot, and on-demand screenshots to the parent via postMessage
// (cross-origin postMessage is allowed), so the chat keeps its "eyes" on WebContainer apps too.
// Mirrors the message protocol the blob shell uses (see PreviewPane), so PreviewRuntime handles
// both identically. Backslashes are doubled so the regex/escape sequences survive into the page.
const OBSERVABILITY_SHIM = `<script>
(function(){
  if(window.__ffObsInstalled) return; window.__ffObsInstalled=true;
  function send(m){ try{ parent.postMessage(Object.assign({__ff:true},m),'*'); }catch(e){} }
  ['log','warn','error','info'].forEach(function(level){
    var orig=console[level]?console[level].bind(console):function(){};
    console[level]=function(){ try{ send({type:'log',level:level,args:[].slice.call(arguments).map(function(a){try{return typeof a==='string'?a:JSON.stringify(a);}catch(_){return String(a);}})}); }catch(_){ } orig.apply(null,arguments); };
  });
  window.addEventListener('error',function(e){ send({type:'error',message:String((e.error&&e.error.stack)||e.message)}); });
  window.addEventListener('unhandledrejection',function(e){ send({type:'error',message:'Unhandled rejection: '+String((e.reason&&(e.reason.stack||e.reason.message))||e.reason)}); });
  function visibleText(){ try{ var t=((document.body&&document.body.innerText)||'').replace(/[ \\t]+\\n/g,'\\n').replace(/\\n{3,}/g,'\\n\\n').trim(); return t.slice(0,4000);}catch(_){ return ''; } }
  function snap(){ send({type:'dom',dom:visibleText(),title:document.title,route:(location.pathname+location.search+location.hash)||'/'}); }
  var t=null; function schedule(){ if(t)clearTimeout(t); t=setTimeout(snap,500); }
  window.addEventListener('load',function(){ send({type:'ready'}); schedule(); try{ new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true}); }catch(_){ } });
  ['click','input','change','keyup'].forEach(function(ev){ try{ document.addEventListener(ev,schedule,true); }catch(_){ } });
  ['popstate','hashchange'].forEach(function(ev){ try{ window.addEventListener(ev,schedule); }catch(_){ } });
  var H2C=['https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js','https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'];
  function loadH2C(){ if(window.html2canvas) return Promise.resolve(); return new Promise(function(res,rej){ var i=0; (function n(){ if(i>=H2C.length){rej(new Error('h2c'));return;} var s=document.createElement('script'); s.src=H2C[i++]; s.crossOrigin='anonymous'; s.onload=function(){res();}; s.onerror=n; document.head.appendChild(s); })(); }); }
  window.addEventListener('message',function(e){ var d=e.data; if(!d||!d.__ff_cmd||d.type!=='screenshot') return;
    loadH2C().then(function(){ return window.html2canvas(document.body,{useCORS:true,allowTaint:false,logging:false,backgroundColor:'#ffffff',scale:1,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,windowWidth:document.documentElement.clientWidth,windowHeight:document.documentElement.clientHeight}); })
    .then(function(c){ var cv=c; if(c.width>1024){ var r=1024/c.width,nc=document.createElement('canvas'); nc.width=1024; nc.height=Math.round(c.height*r); nc.getContext('2d').drawImage(c,0,0,nc.width,nc.height); cv=nc; } send({type:'screenshot',dataUrl:cv.toDataURL('image/jpeg',0.8)}); })
    .catch(function(err){ send({type:'screenshot-error',message:String((err&&err.message)||err)}); });
  });
})();
</script>`;

/** Return files with the observability shim injected into index.html (non-mutating). */
function injectObservability(files: ProjectFile[]): ProjectFile[] {
  return files.map((f) => {
    if (f.path !== '/index.html' || f.content.includes('__ffObsInstalled')) return f;
    const content = f.content.includes('</head>')
      ? f.content.replace('</head>', OBSERVABILITY_SHIM + '\n</head>')
      : OBSERVABILITY_SHIM + '\n' + f.content;
    return { ...f, content };
  });
}

// ---------------------------------------------------------------------------
// package.json reconciliation
//
// Generated apps ship a fixed 8-dep package.json, but the app's code may import any browser
// package (Radix, framer-motion, …). In the real runtime, `npm install` only installs what's in
// package.json — so before installing we scan the actual imports and add any missing ones. This
// makes the WebContainer path reliably install whatever the code uses, regardless of whether the
// model kept package.json in sync. (The on-disk package.json may thus carry deps the DB copy
// doesn't — a harmless runtime artifact.)
const NODE_BUILTINS = new Set([
  'fs', 'path', 'url', 'crypto', 'http', 'https', 'stream', 'os', 'child_process',
  'util', 'events', 'buffer', 'process', 'module', 'zlib', 'net', 'tls', 'dns', 'assert',
]);

// Official npm package-name shape. The HARD gate: whatever the scan regexes false-positive on
// (SQL `from "users"` in template strings, prose, code-in-strings), nothing that isn't a real
// installable name may ever reach `npm install` — a single garbage entry fails the whole install.
const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Extract the installable package name from an import specifier, or null if not a bare package. */
function pkgNameOf(spec: string): string | null {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) return null;
  if (spec.startsWith('node:') || /\.css$/.test(spec) || spec.includes('://')) return null;
  if (/^(jsr|npm|deno):/.test(spec)) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? (parts.length >= 2 ? parts[0] + '/' + parts[1] : '') : parts[0];
  if (!name || NODE_BUILTINS.has(name)) return null;
  if (name.length > 64 || !NPM_NAME_RE.test(name)) return null;
  return name;
}

/** All bare package names imported across the app's source. */
function scanImports(files: ProjectFile[]): Set<string> {
  const names = new Set<string>();
  const patterns = [
    // Anchored to a statement start, and the run may not cross quotes OR backticks — so
    // `select * from "users"` inside a template literal can never look like an import.
    /(?:^|[\n;])\s*(?:import|export)\b[^'"`]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
    /(?:^|[\n;])\s*import\s*['"]([^'"\n]+)['"]/g,
    /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  for (const f of files) {
    if (isMetaFile(f.path) || !/\.(t|j)sx?$/.test(f.path)) continue;
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content))) { const n = pkgNameOf(m[1]); if (n) names.add(n); }
    }
  }
  return names;
}

/** Ensure every imported package is in package.json dependencies (added as "latest"). */
function reconcilePackageJson(files: ProjectFile[]): ProjectFile[] {
  const pkg = files.find((f) => f.path === '/package.json');
  if (!pkg) return files;
  let json: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try { json = JSON.parse(pkg.content); } catch { return files; }
  const deps = json.dependencies ?? (json.dependencies = {});
  const dev = json.devDependencies ?? {};
  let changed = false;
  for (const name of scanImports(files)) {
    if (deps[name] || dev[name]) continue;
    deps[name] = 'latest';
    changed = true;
  }
  if (!changed) return files;
  const content = JSON.stringify(json, null, 2) + '\n';
  return files.map((f) => (f.path === '/package.json' ? { ...f, content } : f));
}

/** Did the dependency set in package.json actually change (ignoring formatting)? */
function depsChanged(oldContent: string | undefined, newContent: string): boolean {
  if (oldContent === undefined) return false;
  const deps = (c: string) => {
    try { const p = JSON.parse(c); return JSON.stringify([p.dependencies ?? {}, p.devDependencies ?? {}]); }
    catch { return c; }
  };
  return deps(oldContent) !== deps(newContent);
}

// ---------------------------------------------------------------------------
// Persistent runner store
//
// The WebContainer + running dev server are kept at module scope (not in a React
// component) so they SURVIVE navigation: leaving and re-opening a project re-attaches
// to the already-running server instantly — no reboot, no reinstall, no restart. A
// component subscribes to this store and reflects its state.
// ---------------------------------------------------------------------------

export type RunnerStatus = 'idle' | 'booting' | 'mounting' | 'installing' | 'starting' | 'ready' | 'error';
/** A single TypeScript diagnostic from `tsc --noEmit`, normalized to a project path. */
export interface TsDiag { path: string; line: number; message: string }
export interface TypecheckState { status: 'running' | 'pass' | 'fail' | 'skipped'; errors: TsDiag[] }
export interface RunnerState {
  projectId: string;
  status: RunnerStatus;
  url: string | null;
  error: string | null;
  logs: string[];
  typecheck?: TypecheckState;
}

let state: RunnerState = { projectId: '', status: 'idle', url: null, error: null, logs: [] };
const listeners = new Set<() => void>();
let runToken = 0;            // guards against stale async steps after a project switch/restart
let tcToken = 0;             // guards typecheck: only the latest tsc run may patch state.typecheck
let handlersAttached = false;
let mountedProjectId: string | null = null; // whose files are mounted + npm-installed
let devProc: WebContainerProcess | null = null;
let syncedFiles = new Map<string, string>(); // path -> last content written to the container FS

function emit() { for (const l of listeners) l(); }
function patch(p: Partial<RunnerState>) { state = { ...state, ...p }; emit(); }
function pushLog(s: string) { state = { ...state, logs: [...state.logs.slice(-400), s] }; emit(); }

export function subscribeRunner(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function getRunnerState(): RunnerState { return state; }

function pipe(proc: WebContainerProcess, token: number) {
  proc.output.pipeTo(new WritableStream({ write(d) { if (token === runToken) pushLog(d); } })).catch(() => { /* closed on kill */ });
}

/** Parse `tsc --noEmit --pretty false` output ("src/App.tsx(12,5): error TS2304: ...") into diagnostics. */
function parseTscOutput(out: string): TsDiag[] {
  const diags: TsDiag[] = [];
  const seen = new Set<string>();
  for (const raw of out.split('\n')) {
    const m = /^(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+?)\s*$/.exec(raw.trim());
    if (!m) continue;
    const path = '/' + m[1].replace(/^\.\//, '').replace(/^\/+/, '');
    const message = m[3].trim();
    const key = `${path}:${m[2]}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diags.push({ path, line: Number(m[2]), message });
    if (diags.length >= 50) break; // cap noise
  }
  return diags;
}

/**
 * Run a REAL TypeScript type-check (`tsc --noEmit`) inside the running container and return the
 * diagnostics — the deepest verification gate (catches type/undefined/prop errors the regex QA can't).
 * Runs concurrently with the dev server (never blocks it). No-op/skip if the container isn't this
 * project's or tsc can't run. TypeScript is already in the scaffold's devDependencies.
 */
export async function runTypecheck(projectId: string): Promise<TsDiag[]> {
  if (state.projectId !== projectId) return [];
  const my = ++tcToken; // only the LATEST typecheck may write state (concurrent runs can't clobber)
  const fresh = () => my === tcToken && state.projectId === projectId;
  patch({ typecheck: { status: 'running', errors: state.typecheck?.errors ?? [] } });
  pushLog('$ npx tsc --noEmit  (type-check)');
  try {
    const wc = await getWebContainer();
    const proc = await wc.spawn('npx', ['--no-install', 'tsc', '--noEmit', '--pretty', 'false']);
    let buf = '';
    proc.output.pipeTo(new WritableStream({ write(d) { buf += d; if (fresh()) pushLog(d); } })).catch(() => {});
    const code = await proc.exit;
    const errors = parseTscOutput(buf);
    if (fresh()) {
      patch({ typecheck: { status: code === 0 || errors.length === 0 ? 'pass' : 'fail', errors } });
      pushLog(errors.length ? `$ tsc: ${errors.length} type error(s)` : '$ tsc: clean');
    }
    return errors;
  } catch (e) {
    if (fresh()) patch({ typecheck: { status: 'skipped', errors: [] } });
    pushLog('$ tsc skipped: ' + (e instanceof Error ? e.message : String(e)));
    return [];
  }
}

/**
 * Ensure the dev server for `projectId` is running. Idempotent: if it's already running or
 * starting for this project, this is a no-op (so React StrictMode double-mounts and repeated
 * navigation don't restart anything). Reinstalls only when the project actually changes.
 */
export async function startRunner(projectId: string, files: ProjectFile[], opts: { force?: boolean } = {}): Promise<void> {
  const force = !!opts.force;
  // Already up (or on its way) for this project — leave it. This is what survives navigation.
  // A deep verify's transient states (deepActive) do NOT count as "on its way": the dev server
  // must still be started once the verify parks the container.
  if (!force && !deepActive && state.projectId === projectId && state.status !== 'idle' && state.status !== 'error') return;
  // Never fight an in-flight deep verify for the container (two concurrent npm installs thrash
  // the same FS) — wait for it to park, then boot on the warm mount it leaves behind.
  if (deepRun) { try { await deepRun; } catch { /* verify failures don't block booting */ } }
  if (force) mountedProjectId = null; // force => full clean re-run

  const token = ++runToken;
  patch({ projectId, status: 'booting', url: null, error: null, logs: [] });

  try {
    if (!isolationReady()) {
      patch({ status: 'error', error: 'The preview runtime needs cross-origin isolation, which isn’t active. Fully restart the dev server (stop and re-run `npm run dev`), then hard-reload this page.' });
      return;
    }
    if (!hasPackageJson(files)) { patch({ status: 'error', error: 'No package.json in this project — nothing to install or run.' }); return; }
    const script = detectDevScript(files);
    if (!script) { patch({ status: 'error', error: 'No dev/start/serve script found in package.json.' }); return; }

    pushLog('$ booting WebContainer runtime…');
    const wc = await getWebContainer();
    if (token !== runToken) return;

    if (!handlersAttached) {
      handlersAttached = true;
      wc.on('server-ready', (_port, url) => { patch({ url, status: 'ready' }); pushLog('$ dev server ready → ' + url); });
      wc.on('error', (e) => { patch({ status: 'error', error: e?.message ?? String(e) }); });
    }

    if (mountedProjectId !== projectId) {
      if (devProc) { try { devProc.kill(); } catch { /* noop */ } devProc = null; }
      const reconciled = reconcilePackageJson(files);
      patch({ status: 'mounting' }); pushLog('$ mounting ' + reconciled.length + ' files…');
      if (mountedProjectId) { pushLog('$ clearing previous project…'); await wipeProjectFs(wc); }
      await wc.mount(buildFileTree(injectObservability(reconciled)));
      if (token !== runToken) return;

      patch({ status: 'installing' }); pushLog('$ npm install --no-audit --no-fund   (first run downloads packages)');
      const install = await wc.spawn('npm', ['install', '--no-audit', '--no-fund']);
      pipe(install, token);
      const code = await install.exit;
      if (token !== runToken) return;
      if (code !== 0) { patch({ status: 'error', error: 'npm install failed (exit ' + code + '). See the log.' }); return; }
      mountedProjectId = projectId;
      // Snapshot the reconciled (NOT shim-injected) files so later syncFiles() only writes
      // genuinely-changed files — and never overwrites index.html, preserving the injected shim.
      syncedFiles = new Map(reconciled.filter((f) => !isMetaFile(f.path)).map((f) => [f.path, f.content]));
    }

    if (devProc) { try { devProc.kill(); } catch { /* noop */ } devProc = null; }
    patch({ status: 'starting' }); pushLog('$ npm run ' + script);
    const proc = await wc.spawn('npm', ['run', script]);
    if (token !== runToken) { try { proc.kill(); } catch { /* noop */ } return; }
    devProc = proc;
    pipe(proc, token);
    proc.exit.then((c) => { if (token === runToken && c !== 0) patch({ status: 'error', error: 'Dev server exited (code ' + c + '). See the log.' }); });
    void runTypecheck(projectId); // real type-check, concurrent — never blocks the dev server
  } catch (e) {
    if (token === runToken) patch({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Write changed files into the running container's FS so the dev server (Vite HMR) live-updates
 * — no restart needed. No-op unless this project's server is currently running. Only files whose
 * content actually changed since the last mount/sync are written.
 */
export async function syncFiles(projectId: string, files: ProjectFile[]): Promise<void> {
  if (state.projectId !== projectId || state.status !== 'ready') return;
  const wc = await getWebContainer();
  // Reconcile first so a newly-imported package gets added to package.json → triggers reinstall.
  const prepared = reconcilePackageJson(files);
  let pkgChanged = false;
  for (const f of prepared) {
    if (isMetaFile(f.path)) continue;
    if (syncedFiles.get(f.path) === f.content) continue;
    if (f.path === '/package.json' && depsChanged(syncedFiles.get('/package.json'), f.content)) pkgChanged = true;
    const rel = f.path.replace(/^\/+/, '');
    const slash = rel.lastIndexOf('/');
    try {
      if (slash > 0) await wc.fs.mkdir(rel.slice(0, slash), { recursive: true });
      await wc.fs.writeFile(rel, f.content);
      syncedFiles.set(f.path, f.content);
    } catch { /* ignore individual write failures */ }
  }
  // A dependency change means the running node_modules is stale — reinstall, then restart the
  // dev server so the new package is actually available (Vite HMR alone can't add a dep).
  if (pkgChanged) void reinstall(projectId, prepared);
}

/**
 * Generation-time DEEP verify: run the real `tsc --noEmit` for a project even when the Full-runtime
 * preview isn't open — boot + mount + npm install headlessly (no dev server), then type-check. This
 * is what makes EVERY generation end compiler-verified instead of only sessions with the preview up.
 * Cheap when repeated: the mounted+installed container is reused for the same project (and a later
 * startRunner skips its own mount/install too). Returns ran:false when the environment can't run it
 * (no cross-origin isolation, no package.json, or the container is busy with another project).
 */
let deepActive = false;                                            // a deep verify owns the container
let deepRun: Promise<{ ran: boolean; diags: TsDiag[] }> | null = null; // in-flight verify (startRunner awaits it)

export async function deepTypecheck(projectId: string, files: ProjectFile[]): Promise<{ ran: boolean; diags: TsDiag[] }> {
  try {
    if (!isolationReady() || !hasPackageJson(files)) return { ran: false, diags: [] };

    // The live runner already serves this project — reuse it wholesale.
    if (state.projectId === projectId && state.status === 'ready') {
      await syncFiles(projectId, files);
      return { ran: true, diags: await runTypecheck(projectId) };
    }
    // A verify is already running — share its result instead of racing it.
    if (deepRun) return deepRun;
    // The container is busy with ANOTHER project (or mid-boot) — never clobber a live session.
    if (state.projectId !== projectId && state.status !== 'idle' && state.status !== 'error') {
      return { ran: false, diags: [] };
    }
    // A REAL boot (dev server) is in flight for this project — never fight it; static-only.
    if (state.projectId === projectId && !deepActive
        && (state.status === 'booting' || state.status === 'mounting' || state.status === 'installing' || state.status === 'starting')) {
      return { ran: false, diags: [] };
    }

    deepRun = runDeep(projectId, files);
    return await deepRun;
  } catch {
    return { ran: false, diags: [] };
  }
}

async function runDeep(projectId: string, files: ProjectFile[]): Promise<{ ran: boolean; diags: TsDiag[] }> {
  deepActive = true;
  try {
    const wc = await getWebContainer();

    // Same project already mounted + installed (e.g. a prior deep verify) — write changed files only.
    if (mountedProjectId === projectId) {
      const prepared = reconcilePackageJson(files);
      for (const f of prepared) {
        if (isMetaFile(f.path) || f.path === '/index.html') continue; // keep the injected shim
        if (syncedFiles.get(f.path) === f.content) continue;
        const rel = f.path.replace(/^\/+/, '');
        const slash = rel.lastIndexOf('/');
        try {
          if (slash > 0) await wc.fs.mkdir(rel.slice(0, slash), { recursive: true });
          await wc.fs.writeFile(rel, f.content);
          syncedFiles.set(f.path, f.content);
        } catch { /* ignore individual write failures */ }
      }
      if (state.projectId !== projectId) patch({ projectId });
      return { ran: true, diags: await runTypecheck(projectId) };
    }

    // Fresh headless mount + install (no dev server). Guarded by runToken so an incoming
    // startRunner (the user opening the Full-runtime preview) safely cancels these steps.
    const token = ++runToken;
    patch({ projectId, status: 'mounting', url: null, error: null });
    pushLog('$ deep verify: mounting project…');
    const reconciled = reconcilePackageJson(files);
    if (mountedProjectId && mountedProjectId !== projectId) await wipeProjectFs(wc);
    await wc.mount(buildFileTree(injectObservability(reconciled)));
    if (token !== runToken) return { ran: false, diags: [] };
    patch({ status: 'installing' });
    pushLog('$ npm install --no-audit --no-fund   (deep verify)');
    const install = await wc.spawn('npm', ['install', '--no-audit', '--no-fund']);
    pipe(install, token);
    const code = await install.exit;
    if (token !== runToken) return { ran: false, diags: [] };
    if (code !== 0) { patch({ status: 'idle' }); return { ran: false, diags: [] }; }
    mountedProjectId = projectId;
    syncedFiles = new Map(reconciled.filter((f) => !isMetaFile(f.path)).map((f) => [f.path, f.content]));
    const diags = await runTypecheck(projectId);
    // Park the container idle-but-warm: a later startRunner for this project skips mount+install.
    if (token === runToken) patch({ status: 'idle' });
    return { ran: true, diags };
  } catch {
    return { ran: false, diags: [] };
  } finally {
    deepActive = false;
    deepRun = null;
  }
}

export interface BuiltFile { path: string; b64: string; sha1: string }

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-1', new Uint8Array(bytes)); // ArrayBuffer-backed copy
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Production-BUILD the app in the WebContainer (`npm run build` → `tsc && vite build`) and read the
 * resulting `dist/` tree as base64 + sha1 per file — ready to upload to a static host. This is the
 * build half of one-click publish; the upload happens server-side (deploy-site edge fn) so the host
 * token never reaches the browser. Reuses the real toolchain (so a type error fails the build).
 */
export async function runBuild(projectId: string): Promise<{ ok: boolean; error?: string; files: BuiltFile[] }> {
  if (state.projectId !== projectId) return { ok: false, error: 'The runtime isn’t active for this project — switch to Full build first.', files: [] };
  try {
    const wc = await getWebContainer();
    pushLog('$ npm run build');
    const proc = await wc.spawn('npm', ['run', 'build']);
    proc.output.pipeTo(new WritableStream({ write(d) { pushLog(d); } })).catch(() => {});
    const code = await proc.exit;
    if (code !== 0) return { ok: false, error: `Build failed (exit ${code}) — see the log (often a type error).`, files: [] };

    const files: BuiltFile[] = [];
    const walk = async (dir: string, base: string): Promise<void> => {
      const entries = await wc.fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = `${dir}/${e.name}`;
        const rel = `${base}/${e.name}`;
        if (e.isDirectory()) await walk(full, rel);
        else { const bytes = await wc.fs.readFile(full); files.push({ path: rel, b64: bytesToB64(bytes), sha1: await sha1Hex(bytes) }); }
      }
    };
    try { await walk('dist', ''); } catch { return { ok: false, error: 'Build produced no dist/ output.', files: [] }; }
    if (!files.length) return { ok: false, error: 'Build produced no files.', files: [] };
    pushLog(`$ build ok — ${files.length} files in dist/`);
    return { ok: true, files };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), files: [] };
  }
}

/** Reinstall dependencies and restart the dev server in-place (after package.json changed). */
async function reinstall(projectId: string, files: ProjectFile[]): Promise<void> {
  if (state.projectId !== projectId) return;
  const wc = await getWebContainer();
  const token = ++runToken;
  if (devProc) { try { devProc.kill(); } catch { /* noop */ } devProc = null; }
  patch({ status: 'installing' }); pushLog('$ package.json changed — npm install');
  const install = await wc.spawn('npm', ['install', '--no-audit', '--no-fund']);
  pipe(install, token);
  const code = await install.exit;
  if (token !== runToken) return;
  if (code !== 0) { patch({ status: 'error', error: 'npm install failed (exit ' + code + '). See the log.' }); return; }

  const script = detectDevScript(files) ?? 'dev';
  patch({ status: 'starting' }); pushLog('$ npm run ' + script);
  const proc = await wc.spawn('npm', ['run', script]);
  if (token !== runToken) { try { proc.kill(); } catch { /* noop */ } return; }
  devProc = proc;
  pipe(proc, token);
  proc.exit.then((c) => { if (token === runToken && c !== 0) patch({ status: 'error', error: 'Dev server exited (code ' + c + '). See the log.' }); });
  void runTypecheck(projectId);
}
