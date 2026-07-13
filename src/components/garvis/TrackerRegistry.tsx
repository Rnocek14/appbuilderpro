// src/components/garvis/TrackerRegistry.tsx
// PERSONAL/INTERNAL REGISTRY — the `tracker` studio's workspace. Log an entry (a client note, an
// expense, a decision, a workout — whatever this registry is for) and it becomes a knowledge
// artifact on this cluster: embedded, world-scoped, and instantly part of the world's queryable
// memory. That's the Garvis-native trick — a tracker here isn't a database app, it's a log the Ask
// box and the rest of the system can GROUND on ("what do I know about Jane?" cites your own
// records). Entries are records, not automations: nothing is computed, sent, or inferred from them
// unless you ask.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NotebookPen, Loader2, Search } from 'lucide-react';
import { listClusterArtifacts, createArtifact, type StudioArtifact } from '../../lib/garvis/artifacts';
import { timeAgo } from '../../lib/utils';

export function TrackerRegistry({ clusterId, onToast, onChanged }: {
  worldId: string; clusterId: string; onToast: (kind: 'success' | 'error', msg: string) => void; onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<StudioArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const reload = useCallback(async () => {
    try {
      const all = await listClusterArtifacts(clusterId);
      // Entries are what the OWNER logged — seeds (the born-with playbook docs) are guidance, not records.
      setEntries(all.filter((a) => a.source !== 'garvis-seed'));
    } catch { /* the log form still works */ } finally { setLoading(false); }
  }, [clusterId]);

  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    const t = title.trim();
    const d = detail.trim();
    if (t.length < 2 || busy) return;
    setBusy(true);
    try {
      // The logged date rides in the detail so retrieval carries the WHEN along with the what.
      const stamped = `${d || t}\n\n— logged ${new Date().toISOString().slice(0, 10)}`;
      await createArtifact({ clusterId, kind: 'doc', title: t, detail: stamped, source: 'garvis' });
      setTitle(''); setDetail('');
      onToast('success', 'Logged — it\'s part of this world\'s memory now; the Ask box can cite it.');
      await reload(); onChanged?.();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not log the entry.'); }
    finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((a) => a.title.toLowerCase().includes(q) || (a.detail ?? '').toLowerCase().includes(q));
  }, [entries, filter]);

  return (
    <div className="mt-4 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <NotebookPen size={16} className="shrink-0 text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Registry</h3>
        {entries.length > 0 && <span className="text-[11px] text-forge-dim">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} on record</span>}
      </div>
      <p className="text-xs text-forge-dim">
        Log what you want remembered. Every entry becomes queryable memory — <span className="text-forge-ink/80">ask this world about anything you've logged and the answer cites your own records.</span>
      </p>

      {/* Log an entry */}
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="What is this entry? — e.g. “Jane Miller — kitchen remodel client”, “June: lumber $482”"
        className="mt-3 w-full rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
      />
      <textarea
        value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(); }}
        placeholder="The details worth recalling later — anything you type here is what future answers stand on."
        className="mt-2 w-full resize-y rounded-lg border border-forge-border bg-forge-raised/30 px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
      />
      <button
        onClick={() => void add()} disabled={busy || title.trim().length < 2}
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3.5 py-2 text-sm font-medium text-[#1A0E04] shadow-soft transition-transform hover:-translate-y-px disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <NotebookPen size={14} />} Log it
      </button>

      {/* The record */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-forge-dim">On record</h4>
          {entries.length > 3 && (
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1">
              <Search size={11} className="text-forge-dim" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter…"
                className="w-28 bg-transparent text-[11px] text-forge-ink placeholder:text-forge-dim/60 focus:outline-none" />
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-forge-dim/70">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-xs text-forge-dim/60">{entries.length === 0 ? 'Nothing logged yet — the first entry starts the memory.' : 'Nothing matches that filter.'}</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.slice(0, 30).map((a) => (
              <li key={a.id} className="rounded-lg border border-forge-border bg-forge-raised/20 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-forge-ink">{a.title}</span>
                  <span className="shrink-0 text-[10px] text-forge-dim">{timeAgo(a.created_at)}</span>
                </div>
                {a.detail && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-forge-dim">{a.detail.replace(/\n+— logged \d{4}-\d{2}-\d{2}\s*$/, '')}</p>}
              </li>
            ))}
            {shown.length > 30 && <li className="text-[11px] text-forge-dim/70">…and {shown.length - 30} more — use the filter, or just ask the world.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
