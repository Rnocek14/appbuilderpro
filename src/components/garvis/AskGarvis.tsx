// src/components/garvis/AskGarvis.tsx
// The ask surface the bones audit found missing: a box where you ask Garvis about your own
// worlds and get a cited answer grounded ONLY in what it actually has on record. Sources are
// shown so you can see its work — and see honestly when it has nothing.

import { useState } from 'react';
import { Loader2, Search, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { askGarvis, type AskResult } from '../../lib/garvis/ask';

export function AskGarvis({ worldId, placeholder }: { worldId?: string; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);

  const ask = async () => {
    const question = q.trim();
    if (question.length < 3 || busy) return;
    setBusy(true); setResult(null);
    try {
      setResult(await askGarvis(question, worldId ? { worldId } : undefined));
    } catch {
      setResult({ answer: 'Something went wrong reaching your knowledge. Try again.', sources: [], grounded: false, searched: 0 });
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-forge-ember" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void ask(); }}
          placeholder={placeholder ?? 'Ask Garvis about your business — "what\'s our direct-mail plan?", "who did we find in the finance segment?"'}
          className="min-w-0 flex-1 bg-transparent text-sm text-forge-ink placeholder:text-forge-dim/70 focus:outline-none"
        />
        <button
          onClick={() => void ask()} disabled={busy || q.trim().length < 3}
          className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : 'Ask'}
        </button>
      </div>

      {result && (
        <div className="mt-3 border-t border-forge-border/60 pt-3">
          <p className="whitespace-pre-line text-sm leading-relaxed text-forge-ink">{result.answer}</p>
          {result.sources.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-forge-dim">
                Sources ({result.sources.length} of {result.searched} searched)
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {result.sources.map((s, i) => (
                  <li key={s.id} className="rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-forge-dim">[{i + 1}]</span>
                      <span className="flex-1 truncate text-xs font-medium text-forge-ink">{s.title}</span>
                      {s.similarity !== null && <span className="text-[10px] text-forge-dim">{Math.round(s.similarity * 100)}%</span>}
                      {s.worldId && (
                        <Link to={`/garvis/webs/${s.worldId}`} className="flex items-center text-[10px] text-forge-ember hover:underline">
                          {s.area ?? 'open'} <ChevronRight size={11} />
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-forge-dim">{s.snippet}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
