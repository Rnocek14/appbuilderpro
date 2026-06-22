import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Terminal, RotateCw, Wand2, Loader2 } from 'lucide-react';
import type { ProjectFile } from '../../types';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import {
  subscribeRunner, getRunnerState, startRunner, syncFiles, type RunnerStatus,
} from '../../lib/webcontainer';
import { updatePreviewSnapshot, pushPreviewLog, resetPreviewSnapshot, registerScreenshotCapture } from '../../lib/previewRuntime';

interface Props {
  files: ProjectFile[];
  projectId: string;
  onFixError: (error: string) => void;
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
export function WebContainerPane({ files, projectId, onFixError }: Props) {
  const runner = useSyncExternalStore(subscribeRunner, getRunnerState);
  const [showLog, setShowLog] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Pending screenshot capture, resolved when the in-app observability shim posts the image back.
  const pendingShot = useRef<{ resolve: (v: string | null) => void; timer: ReturnType<typeof setTimeout> } | null>(null);

  // Latest files without retriggering: only a project *change* should (re)start the runner.
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => { void startRunner(projectId, filesRef.current); }, [projectId]);

  // Live-sync saved/AI edits into the running container so the dev server hot-reloads.
  useEffect(() => { void syncFiles(projectId, files); }, [files, projectId, runner.status]);

  // Only show this project's state (the store holds one active project at a time).
  const mine = runner.projectId === projectId;
  const status: RunnerStatus = mine ? runner.status : 'idle';
  const url = mine ? runner.url : null;
  const logs = mine ? runner.logs : [];
  const error = mine ? runner.error : null;
  const busy = status !== 'ready' && status !== 'error';

  // Collapse the log automatically once the app is up.
  useEffect(() => { if (status === 'ready') setShowLog(false); }, [status]);

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
  const retry = () => void startRunner(projectId, filesRef.current);

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
              {status === 'error' ? (
                <>
                  <p className="text-sm font-medium text-forge-err">Couldn’t run the preview</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-forge-dim">{error}</p>
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
