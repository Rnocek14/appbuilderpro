// src/components/garvis/VerdictPrompt.tsx
// The one-tap verdict that makes "the ledger learns kept-vs-rewritten" TRUE instead of promised.
// Appears after a draft is copied; the answer is a real row the ledger counts. Skippable — an
// unanswered prompt records nothing (never a guessed verdict).

import { useState } from 'react';
import { Check, PenLine } from 'lucide-react';
import { recordVerdict } from '../../lib/garvis/verdictsRun';

export function VerdictPrompt({ worldId, kind, topic, onToast }: {
  worldId: string; kind: 'assist' | 'deliver'; topic: string;
  onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  const [state, setState] = useState<'asking' | 'saving' | 'done'>('asking');

  const answer = async (verdict: 'kept' | 'rewritten') => {
    if (state !== 'asking') return;
    setState('saving');
    try {
      await recordVerdict({ worldId, kind, verdict, topic });
      setState('done');
    } catch (e) {
      setState('asking');
      onToast('error', e instanceof Error ? e.message : 'Could not record that.');
    }
  };

  if (state === 'done') {
    return <p className="mt-2 text-[11px] text-forge-ok">Noted — the ledger counts it.</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-forge-dim">
      <span>Did you send it as-is?</span>
      <button onClick={() => void answer('kept')} disabled={state === 'saving'}
        className="flex items-center gap-1 rounded-full border border-forge-ok/40 px-2 py-0.5 text-forge-ok hover:bg-forge-ok/10 disabled:opacity-50">
        <Check size={11} /> Sent as-is
      </button>
      <button onClick={() => void answer('rewritten')} disabled={state === 'saving'}
        className="flex items-center gap-1 rounded-full border border-forge-warn/40 px-2 py-0.5 text-forge-warn hover:bg-forge-warn/10 disabled:opacity-50">
        <PenLine size={11} /> I rewrote it
      </button>
      <span className="text-forge-dim/60">— this is how the desk learns where it's thin</span>
    </div>
  );
}
