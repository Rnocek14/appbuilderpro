// src/components/garvis/AddKnowledge.tsx
// The knowledge-in affordance the grounded studios were missing. A studio that grounds on the world's
// knowledge base is only as good as what's IN it — and the honesty gate refuses over an empty one. This
// gives the desk/document studio an obvious, in-place way to add knowledge to THIS world: paste a
// policy, a canned answer, a rate card, a past reply → ingestNote(worldId) files it as a retrievable
// document (world-scoped, embedded), so the very next draft can stand on it. Collapsed by default so it
// never competes with the studio's own surface.

import { useState } from 'react';
import { Loader2, Check, BookPlus, ChevronDown } from 'lucide-react';
import { ingestNote } from '../../lib/garvis/brain';

export function AddKnowledge({ worldId, label, placeholder, onAdded, onToast }: {
  worldId: string;
  label?: string;
  placeholder?: string;
  onAdded?: () => void;
  onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const add = async () => {
    const body = text.trim();
    if (body.length < 10 || busy) return;
    setBusy(true);
    try {
      await ingestNote(title.trim() || body.replace(/\s+/g, ' ').slice(0, 48), body, { worldId });
      setText(''); setTitle(''); setDone(true); setTimeout(() => setDone(false), 1800);
      onToast('success', 'Added to this world’s knowledge — the next draft can use it.');
      onAdded?.();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not add that.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-lg border border-forge-border bg-forge-raised/20">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <BookPlus size={14} className="shrink-0 text-forge-ember" />
        <span className="flex-1 text-xs font-medium text-forge-ink">{label ?? 'Add knowledge to this world'}</span>
        {done && <Check size={13} className="text-forge-ok" />}
        <ChevronDown size={14} className={`text-forge-dim transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="border-t border-forge-border/60 px-3 py-2.5">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional) — e.g. “Return policy”"
            className="mb-2 w-full rounded-lg border border-forge-border bg-forge-raised/30 px-2.5 py-1.5 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
          />
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder={placeholder ?? 'Paste a policy, a canned answer, a fact, or a past reply. Studios ground their drafts only in what’s here.'}
            className="w-full resize-y rounded-lg border border-forge-border bg-forge-raised/30 px-2.5 py-1.5 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => void add()} disabled={busy || text.trim().length < 10}
              className="flex items-center gap-1.5 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-1.5 text-xs font-medium text-forge-ember disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <BookPlus size={13} />} Add to knowledge base
            </button>
            <span className="text-[11px] text-forge-dim/60">or drop a file in the studio’s Files — text lands here too.</span>
          </div>
        </div>
      )}
    </div>
  );
}
