import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getWebContainer, isolationReady, type WebContainerProcess } from '../../lib/webcontainer';

/**
 * Interactive shell into the running WebContainer (the same Node runtime the dev server uses).
 * Spawns `jsh` (WebContainer's shell), rendered with xterm so ANSI output looks right. The
 * shell is tied to this component's lifetime — opening/closing the panel starts/stops it.
 */
export function WebContainerTerminal() {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let disposed = false;
    let shell: WebContainerProcess | null = null;

    const term = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#0A0B0F', foreground: '#cbd5e1' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try { fit.fit(); } catch { /* element not laid out yet */ }

    const onResize = () => {
      try { fit.fit(); shell?.resize?.({ cols: term.cols, rows: term.rows }); } catch { /* noop */ }
    };
    window.addEventListener('resize', onResize);

    (async () => {
      if (!isolationReady()) {
        term.writeln('Cross-origin isolation is not active — fully restart the dev server, then reload.');
        return;
      }
      term.writeln('Starting shell…');
      const wc = await getWebContainer();
      if (disposed) return;
      shell = await wc.spawn('jsh', { terminal: { cols: term.cols, rows: term.rows } });
      shell.output.pipeTo(new WritableStream({ write(d) { term.write(d); } })).catch(() => { /* closed */ });
      const writer = shell.input.getWriter();
      term.onData((d) => { writer.write(d).catch(() => { /* closed */ }); });
    })();

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      try { shell?.kill(); } catch { /* noop */ }
      term.dispose();
    };
  }, []);

  return <div ref={elRef} className="h-full w-full overflow-hidden" />;
}
