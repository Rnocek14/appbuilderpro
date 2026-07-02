import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Terminal, RotateCw, Wand2, Loader2, Check, TriangleAlert } from 'lucide-react';
import type { ProjectFile } from '../../types';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import {
  subscribeRunner, getRunnerState, startRunner, syncFiles, hasPackageJson, type RunnerStatus, type TsDiag,
} from '../../lib/webcontainer';
import { updatePreviewSnapshot, pushPreviewLog, resetPreviewSnapshot, registerScreenshotCapture } from '../../lib/previewRuntime';

interface Props {
  files: ProjectFile[];
  projectId: string;
  onFixError: (error: string) => void;
  onHealTypes?: (diags: TsDiag[]) => void | Promise<void>;
  /** True while the assistant is already working — pauses auto-fix so runs never overlap. */
  aiBusy?: boolean;
}

const STATUS_LABEL: Record<RunnerStatus, string> = {
  idle: 'Preparing…',
  booting: 'Booting runtime…',
  mounting: 'Mounting files…',
  installing: 'Installing dependencies…',
  starting: 'Starting dev server…',
  ready: 'Running',
  error: 'Failed',
};

/**
 * Thin view over the persistent WebContainer runner store. The runtime + dev server live at
 * module scope (see lib/webcontainer.ts), so navigating away and back re-attaches instantly
 * instead of rebooting/reinstalling. This component only reflects state and issues commands.
 */
export function WebContainerPane({ files, projectId, onFixError, onHealTypes, aiBusy }: Props) {
  const runner = useSyncExternalStore(subscribeRunner, getRunnerState);
  const [showLog, setShowLog] = useState(true);
  const [showTypes, setShowTypes] = useState(false);
  const [healing, setHealing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Pending screenshot capture, resolved when the in-app observability shim posts the image back.
  const pendingShot = useRef<{ resolve: (v: string | null) => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  // Latest files without retriggering: only a project *change* should (re)start the runner.
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  // Boot ONCE per project — but only after the project's files (incl. package.json) have actually
  // loaded. Booting on mount raced the async file load and surfaced a false "No package.json" error
  // that never recovered (the start effect didn't re-run when files arrived). ALSO re-boot when the
  // runner is parked 'idle' for this project (a deep verify mounted+installed then parked the
  // container without starting the dev server — the boot rides its warm mount).
  const bootedRef = useRef<string | null>(null);
  useEffect(() => {
    const parkedIdle = runner.projectId === projectId && runner.status === 'idle';
    if (bootedRef.current === projectId && !parkedIdle) return;
    if (!hasPackageJson(files)) return; // wait for the files to load
    bootedRef.current = projectId;
    void startRunner(projectId, files);
  }, [projectId, files, runner.projectId, runner.status]);

  // Live-sync saved/AI edits into the running container so the dev server hot-reloads.
  useEffect(() => { void syncFiles(projectId, files); }, [files, projectId, runner.status]);

  // Only show this project's state (the store holds one active project at a time).
  const mine = runner.projectId === projectId;
  const status: RunnerStatus = mine ? runner.status : 'idle';
  const url = mine ? runner.url : null;
  const logs = mine ? runner.logs : [];
  const error = mine ? runner.error : null;
  const typecheck = mine ? runner.typecheck : undefined;
  const busy = status !== 'ready' && status !== 'error';
  // A loaded project with no package.json can't run in the full build (it's a lightweight/Instant app).
  const noPackage = files.length > 0 && !hasPackageJson(files);

  // AUTO-FIX app-level crashes (dev server exited / install broke after an edit) — same behavior
  // as the Instant preview: debounced, paused while the assistant works, capped at 2 attempts per
  // distinct error. Infra errors (cross-origin isolation, no package.json) stay manual — the AI
  // can't fix the environment.
  const fixAttempts = useRef(new Map<string, number>());
  const [autoFixing, setAutoFixing] = useState(false);
  useEffect(() => {
    if (!error || status !== 'error') { setAutoFixing(false); return; }
    if (aiBusy) return;
    if (!/dev server exited|npm install failed/i.test(error)) return; // infra errors stay manual
    const sig = error.slice(0, 200);
    const n = fixAttempts.current.get(sig) ?? 0;
    if (n >= 2) { setAutoFixing(false); return; }
    const t = window.setTimeout(() => {
      fixAttempts.current.set(sig, n + 1);
      setAutoFixing(true);
      onFixError(error + '\n\n' + logs.slice(-40).join(''));
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, status, aiBusy]);

  // Collapse the log automatically once the app is up.
  useEffect(() => { if (status === 'ready') setShowLog(false); }, [status]);
  // Surface the type panel automatically when a check fails.
  useEffect(() => { if (typecheck?.status === 'fail') setShowTypes(true); }, [typecheck?.status]);

  // Elapsed-time heartbeat so a slow-but-working install reads as progress, not a freeze.
  const [now, setNow] = useState(() => Date.now());
  const installStart = useRef<number | null>(null);
  useEffect(() => {
    if (status === 'installing') { if (installStart.current == null) installStart.current = Date.now(); }
    else installStart.current = null;
  }, [status]);
  useEffect(() => {
    if (!busy) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [busy]);
  const installSecs = installStart.current ? Math.round((now - installStart.current) / 1000) : 0;

  // Receive the in-app shim's reports (console, errors, DOM snapshot, screenshots) and feed
  // them into the shared runtime store so the chat can "see" this WebContainer app too.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || !d.__ff) return;
      if (d.type === 'error') updatePreviewSnapshot({ error: d.message });
      else if (d.type === 'ready') updatePreviewSnapshot({ error: null });
      else if (d.type === 'log') pushPreviewLog({ level: d.level, text: (d.args ?? []).join(' ') });
      else if (d.type === 'dom') updatePreviewSnapshot({ dom: d.dom ?? null, title: d.title ?? null, route: d.route ?? null });
      else if (d.type === 'screenshot' || d.type === 'screenshot-error') {
        const p = pendingShot.current;
        if (p) { clearTimeout(p.timer); pendingShot.current = null; p.resolve(d.type === 'screenshot' ? (d.dataUrl ?? null) : null); }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // New dev-server URL → fresh app instance; drop stale runtime state.
  useEffect(() => { if (url) resetPreviewSnapshot(); }, [url]);

  // Expose screenshot capture (the chat's camera button / Fix-with-AI use this).
  useEffect(() => {
    registerScreenshotCapture(() => new Promise<string | null>((resolve) => {
      const win = iframeRef.current?.contentWindow;
      if (!url || !win) { resolve(null); return; }
      if (pendingShot.current) { clearTimeout(pendingShot.current.timer); pendingShot.current.resolve(null); }
      const timer = setTimeout(() => { pendingShot.current = null; resolve(null); }, 12000);
      pendingShot.current = { resolve, timer };
      win.postMessage({ __ff_cmd: true, type: 'screenshot' }, '*');
    }));
    return () => registerScreenshotCapture(null);
  }, [url]);

  const restart = () => void startRunner(projectId, filesRef.current, { force: true });
  // Retry after a failure is a FORCED clean re-run (fresh mount + install) — a partial/broken
  // mount from the failed attempt must never be reused.
  const retry = () => void startRunner(projectId, filesRef.current, { force: true });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-forge-border bg-forge-panel px-2 py-1.5">
        <span className="px-1 text-xs font-medium uppercase tracking-wide text-forge-dim">Preview</span>
        <span className="flex items-center gap-1.5 text-xs">
          {busy && <Loader2 size={12} className="animate-spin text-forge-ember" />}
          <span className={cn('text-forge-dim', status === 'ready' && 'text-forge-ok', status === 'error' && 'text-forge-err')}>
            {STATUS_LABEL[status]}
          </span>
        </span>
        {typecheck && typecheck.status !== 'skipped' && (
          <button
            onClick={() => setShowTypes((v) => !v)} aria-pressed={showTypes}
            title="TypeScript type-check (tsc --noEmit)"
            className="flex items-center gap-1 rounded-md border border-forge-border px-1.5 py-0.5 text-[11px]"
          >
            {typecheck.status === 'running' ? <><Loader2 size={11} className="animate-spin text-forge-dim" /> <span className="text-forge-dim">Types…</span></>
              : typecheck.status === 'pass' ? <><Check size={11} className="text-forge-ok" /> <span className="text-forge-ok">Types</span></>
              : <><TriangleAlert size={11} className="text-forge-err" /> <span className="text-forge-err">{typecheck.errors.length} type error{typecheck.errors.length === 1 ? '' : 's'}</span></>}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            aria-label="Toggle log" aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}
            className={cn('rounded p-1.5', showLog ? 'text-forge-ember' : 'text-forge-dim hover:text-forge-ink')}
          >
            <Terminal size={14} />
          </button>
          <button
            aria-label="Restart" onClick={restart} disabled={busy}
            className="rounded p-1.5 text-forge-dim hover:text-forge-ink disabled:opacity-40"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      {showTypes && typecheck && typecheck.status === 'fail' && typecheck.errors.length > 0 && (
        <div className="shrink-0 border-b border-forge-border bg-forge-panel">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <TriangleAlert size={13} className="text-forge-err" />
            <span className="text-xs font-medium text-forge-ink">{typecheck.errors.length} type error{typecheck.errors.length === 1 ? '' : 's'}</span>
            {onHealTypes && (
              <Button size="sm" className="ml-auto" loading={healing}
                onClick={async () => { setHealing(true); try { await onHealTypes(typecheck.errors); } finally { setHealing(false); } }}>
                <Wand2 size={13} /> Fix type errors with AI
              </Button>
            )}
          </div>
          <div className="max-h-40 overflow-auto panel-scroll border-t border-forge-border px-2 py-1.5 font-mono text-[11px] leading-5 text-forge-dim">
            {typecheck.errors.map((e, i) => (
              <div key={i} className="whitespace-pre-wrap"><span className="text-forge-ink/80">{e.path}:{e.line}</span> — {e.message}</div>
            ))}
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col bg-[#0A0B0F]">
        {url && (
          <iframe
            ref={iframeRef}
            title="App preview"
            src={url}
            allow="cross-origin-isolated"
            className="min-h-0 flex-1 border-0 bg-white"
          />
        )}

        {status !== 'ready' && (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="max-w-md text-center">
              {noPackage ? (
                <>
                  <p className="text-sm font-medium text-forge-ink">This project has no package.json</p>
                  <p className="mt-1 text-xs text-forge-dim">It's a lightweight app — switch the preview toggle to <span className="font-medium text-forge-ink">Instant</span> to run it, or ask the AI in chat to “scaffold this as a full Vite + TypeScript project” to enable the full build.</p>
                </>
              ) : status === 'error' && error && /single webcontainer instance/i.test(error) ? (
                <>
                  {/* An orphaned runtime instance (page kept it through a code hot-update). No code
                      path can reclaim it — only a full page reload. Retry/AI would both be lies here. */}
                  <p className="text-sm font-medium text-forge-err">The preview runtime needs a page reload</p>
                  <p className="mt-1 text-xs text-forge-dim">
                    A studio update left the previous runtime instance orphaned in this page — it can only be
                    released by fully reloading. One reload fixes it.
                  </p>
                  <div className="mt-3 flex justify-center">
                    <Button size="sm" onClick={() => window.location.reload()}>
                      <RotateCw size={13} /> Reload the page
                    </Button>
                  </div>
                </>
              ) : status === 'error' ? (
                <>
                  <p className="text-sm font-medium text-forge-err">Couldn’t run the preview</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-forge-dim">{error}</p>
                  {(autoFixing || (aiBusy && error)) ? (
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-forge-ink">
                      <Wand2 size={13} className="animate-pulse text-forge-ember" /> Auto-fixing this error…
                    </p>
                  ) : (
                    <div className="mt-3 flex justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={retry}>
                        <RotateCw size={13} /> Retry
                      </Button>
                      {error && (
                        <Button size="sm" onClick={() => onFixError(error + '\n\n' + logs.slice(-40).join(''))}>
                          <Wand2 size={13} /> Fix with AI
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-forge-dim">
                    <Loader2 size={15} className="animate-spin text-forge-ember" />
                    {STATUS_LABEL[status]}
                  </div>
                  {status === 'installing' && (
                    <p className="text-[11px] text-forge-dim">
                      npm is quiet while it downloads — large apps can take a few minutes. {installSecs}s elapsed.
                    </p>
                  )}
                  {status === 'installing' && installSecs > 180 && (
                    <p className="text-[11px] text-forge-warn">
                      Taking longer than usual. Open the <span className="font-medium">Terminal</span> (header) and run{' '}
                      <span className="font-mono">cat package.json</span> / <span className="font-mono">npm install</span> to see what it’s doing.
                    </p>
                  )}
                  {logs.length > 0 && (
                    <p className="truncate font-mono text-[11px] text-forge-dim/80">{logs[logs.length - 1]}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showLog && (
          <div className="h-44 shrink-0 overflow-auto panel-scroll border-t border-forge-border bg-black/60 p-2 font-mono text-[11px] leading-5 text-forge-dim">
            {logs.length === 0
              ? <p className="text-forge-dim">Build output appears here.</p>
              : logs.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
