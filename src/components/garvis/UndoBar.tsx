// src/components/garvis/UndoBar.tsx
// THE UNDO LAYER (design review, gap-to-9 #1): reversible actions act instantly and offer Undo
// for six seconds — Linear's signature forgiveness, as one shared piece so every surface inherits
// the same bar instead of reinventing it. One undoable at a time (a new one replaces the last:
// its moment has passed). Consequences (approve/send/deploy) must never be offered here — there
// is no honest undo for a consequence.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Undo2 } from 'lucide-react';

export function useUndoBar(onError?: (e: unknown) => void, timeoutMs = 6000): {
  offerUndo: (label: string, run: () => Promise<void>) => void;
  undoBar: ReactNode;
} {
  const [undoable, setUndoable] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offerUndo = (label: string, run: () => Promise<void>) => {
    if (timer.current) clearTimeout(timer.current);
    setUndoable({ label, run });
    timer.current = setTimeout(() => setUndoable(null), timeoutMs);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const undoBar: ReactNode = undoable ? (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-forge-border bg-forge-raised px-4 py-2.5 shadow-lift animate-fadeInUp [animation-duration:0.15s]">
      <span className="text-sm text-forge-ink">{undoable.label}</span>
      <button
        onClick={() => {
          const u = undoable;
          setUndoable(null);
          if (timer.current) clearTimeout(timer.current);
          void u.run().catch((e) => onError?.(e));
        }}
        className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1 text-xs font-medium text-forge-ember hover:bg-forge-ember/20"
      >
        <Undo2 size={12} /> Undo
      </button>
    </div>
  ) : null;

  return { offerUndo, undoBar };
}
