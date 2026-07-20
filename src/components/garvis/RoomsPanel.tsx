// src/components/garvis/RoomsPanel.tsx
// CUSTOM ROOMS (app_0099): built apps living INSIDE their business. The wardrobe-room promise
// made real at v1 — build the tool in the builder, deploy it, mount its URL here, and USE it
// without leaving Garvis. The iframe is sandboxed (scripts + same-origin for the app itself,
// nothing about this page); https-only is enforced at the data layer.

import { useEffect, useState } from 'react';
import { DoorOpen, Plus, X, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { listRooms, mountRoom, unmountRoom, type WorldRoom } from '../../lib/garvis/roomsRun';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function RoomsPanel({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const [rooms, setRooms] = useState<WorldRoom[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => { void listRooms(worldId).then(setRooms).catch(() => setRooms([])); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [worldId]);

  const add = async () => {
    setBusy(true);
    try {
      await mountRoom({ worldId, title, url });
      onToast('success', `Room "${title.trim()}" mounted — it opens right here.`);
      setTitle(''); setUrl(''); setAdding(false);
      refresh();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not mount the room.'); }
    finally { setBusy(false); }
  };

  if (rooms === null) return null;
  const open = rooms.find((r) => r.id === openId) ?? null;

  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
      <div className="flex items-center gap-2">
        <DoorOpen size={14} className="text-forge-ember" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Rooms</h3>
        <span className="text-[10px] text-forge-dim/70">apps this business USES — build in the builder, deploy, mount the URL</span>
        <button onClick={() => setAdding((a) => !a)} className="ml-auto rounded-md border border-forge-border p-1 text-forge-dim hover:text-forge-ink">
          <Plus size={12} />
        </button>
      </div>

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Room name — e.g. Wardrobe room"
            className="min-w-[10rem] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (the deployed app)"
            className="min-w-[12rem] flex-[2] rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void add()} disabled={busy || !title.trim() || !url.trim()}
            className="rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-xs font-medium text-forge-ember disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : 'Mount'}
          </button>
        </div>
      )}

      {rooms.length === 0 && !adding && (
        <p className="mt-2 text-[11px] text-forge-dim">No rooms yet. Build a tool for this business (say it in Orchestrate — "build me a wardrobe room…"), deploy it, then mount its URL here to use it in-place.</p>
      )}

      {rooms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rooms.map((r) => (
            <span key={r.id} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
              openId === r.id ? 'border-forge-ember/60 text-forge-ember' : 'border-forge-border text-forge-ink')}>
              <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="font-medium">{r.title}</button>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-forge-dim hover:text-forge-ink" title="Open in its own tab"><ExternalLink size={10} /></a>
              <button onClick={() => { void unmountRoom(r.id).then(refresh); }} className="text-forge-dim hover:text-forge-warn" title="Unmount"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-2 overflow-hidden rounded-lg border border-forge-border">
          <iframe
            src={open.url}
            title={open.title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="h-[560px] w-full bg-white"
          />
        </div>
      )}
    </div>
  );
}
