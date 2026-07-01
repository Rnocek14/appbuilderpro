// src/components/editor/SearchPanel.tsx
// Project-wide code search (command-palette style). Pure client — greps the already-loaded project
// files (path + content), ranks matches (filename hits first), shows line context, and opens the file
// on click. No backend. Open with the header Search button or Cmd/Ctrl+K; Escape closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, FileCode } from 'lucide-react';

interface Match { path: string; lines: { n: number; text: string }[]; score: number }

export function SearchPanel({ files, onOpen, onClose }: {
  files: { path: string; content: string }[];
  onOpen: (path: string, line?: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo<Match[]>(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const out: Match[] = [];
    for (const f of files) {
      if (f.path.startsWith('/.fableforge')) continue; // skip FableForge meta (brain/map)
      const pathHit = f.path.toLowerCase().includes(query);
      const lines: { n: number; text: string }[] = [];
      const split = f.content.split('\n');
      for (let i = 0; i < split.length && lines.length < 6; i++) {
        if (split[i].toLowerCase().includes(query)) lines.push({ n: i + 1, text: split[i].trim().slice(0, 200) });
      }
      if (pathHit || lines.length) out.push({ path: f.path, lines, score: (pathHit ? 1000 : 0) + lines.length });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [q, files]);

  const totalLines = results.reduce((s, r) => s + r.lines.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-forge-border bg-forge-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-forge-border px-3 py-2.5">
          <Search size={15} className="shrink-0 text-forge-dim" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search across all files…"
            className="flex-1 bg-transparent text-sm text-forge-ink outline-none placeholder:text-forge-dim/60" />
          <button onClick={onClose} aria-label="Close search" className="shrink-0 text-forge-dim hover:text-forge-ink"><X size={15} /></button>
        </div>
        <div className="max-h-[60vh] overflow-auto panel-scroll p-1.5">
          {q.trim().length < 2 ? (
            <p className="px-2 py-6 text-center text-xs text-forge-dim">Type at least 2 characters to search file names and contents.</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-forge-dim">No matches for “{q}”.</p>
          ) : (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-forge-dim">{results.length} file{results.length === 1 ? '' : 's'} · {totalLines} line match{totalLines === 1 ? '' : 'es'}</div>
              {results.map((r) => (
                <div key={r.path} className="mb-1">
                  <button onClick={() => onOpen(r.path)} className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-forge-ink hover:bg-forge-raised">
                    <FileCode size={12} className="shrink-0 text-forge-ember" /><span className="truncate font-medium">{r.path}</span>
                  </button>
                  {r.lines.map((l, i) => (
                    <button key={i} onClick={() => onOpen(r.path, l.n)} className="flex w-full items-start gap-2 rounded px-2 py-0.5 text-left font-mono text-[11px] text-forge-dim hover:bg-forge-raised hover:text-forge-ink">
                      <span className="w-8 shrink-0 text-right text-forge-dim/50">{l.n}</span><span className="truncate">{l.text}</span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
