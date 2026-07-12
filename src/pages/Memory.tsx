// src/pages/Memory.tsx  (/garvis/memory)
// ONE MEMORY (design review P2). Mind and Brain were two nav doors wearing the same icon — the
// reasoning record (beliefs · decisions · identity · events) and the document library (files ·
// insights · Ask) are halves of one organ: what Garvis holds, readable and correctable. This room
// mounts both as tabs; the old /garvis/mind and /garvis/brain routes stay alive (merge and
// relocate, never amputate), the nav shows one door.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BrainCircuit } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { cn } from '../lib/utils';
import { BrainContent } from './Brain';
import { MindContent } from './Mind';

export default function Memory() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'library' | 'mind'>(params.get('tab') === 'mind' ? 'mind' : 'library');
  // In-app navigation to /garvis/memory?tab=… while already mounted (⌘K belief hits do this)
  // must switch tabs — the initializer alone only runs on mount (review fix).
  useEffect(() => {
    const t = params.get('tab');
    if (t === 'mind' || t === 'library') setTab(t);
  }, [params]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <BrainCircuit size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Memory</h1>
            <p className="text-sm text-forge-dim">Everything Garvis holds — documents and insights on one side, beliefs and the record on the other. Read it, search it, correct it.</p>
          </div>
          <div className="flex shrink-0 rounded-lg border border-forge-border p-0.5 text-xs">
            {([['library', 'Library'], ['mind', 'The record']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn('rounded-md px-3 py-1.5', tab === key ? 'bg-forge-raised text-forge-ink' : 'text-forge-dim hover:text-forge-ink')}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {tab === 'library' ? <BrainContent /> : <div className="px-4 py-4"><MindContent /></div>}
    </AppShell>
  );
}
