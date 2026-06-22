import { useState } from 'react';
import { ChevronDown, Plus, MessagesSquare, Pencil, Trash2, Check } from 'lucide-react';
import type { Thread } from '../../lib/threads';
import { MAIN_THREAD_ID } from '../../lib/threads';
import { cn } from '../../lib/utils';

/**
 * Conversation-thread switcher shown in place of the "Assistant" title. Lets the user keep
 * separate chat flows for different ideas/features (all editing the same project). Switch, create,
 * rename, and delete threads here.
 */
export function ThreadSwitcher({ threads, activeId, ready, onSwitch, onNew, onRename, onDelete }: {
  threads: Thread[];
  activeId: string;
  ready: boolean;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = threads.find((t) => t.id === activeId) ?? threads[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Switch conversation thread"
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-forge-ink transition-colors hover:bg-forge-raised"
      >
        <MessagesSquare size={13} className="shrink-0 text-forge-ember" />
        <span className="truncate">{active?.title ?? 'Main'}</span>
        {threads.length > 1 && (
          <span className="rounded-full bg-forge-border/50 px-1.5 text-[10px] text-forge-dim">{threads.length}</span>
        )}
        <ChevronDown size={13} className="shrink-0 text-forge-dim" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-forge-border bg-forge-panel p-1 shadow-2xl">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-forge-dim">Threads</p>
            {!ready && (
              <p className="mx-1 mb-1 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-2 py-1.5 text-[10px] leading-relaxed text-forge-ink">
                Run the one-line DB migration to enable separate threads. Until then, messages stay in Main.
              </p>
            )}
            <ul className="max-h-72 overflow-y-auto panel-scroll">
              {threads.map((t) => (
                <li key={t.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => { onSwitch(t.id); setOpen(false); }}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                      t.id === activeId ? 'bg-forge-ember/10 text-forge-ink' : 'text-forge-dim hover:bg-forge-raised hover:text-forge-ink',
                    )}
                  >
                    {t.id === activeId ? <Check size={12} className="shrink-0 text-forge-ember" /> : <span className="w-3 shrink-0" />}
                    <span className="truncate">{t.title}</span>
                  </button>
                  {t.id !== MAIN_THREAD_ID && (
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        aria-label="Rename thread"
                        onClick={() => { const v = window.prompt('Rename thread', t.title); if (v != null) onRename(t.id, v); }}
                        className="rounded p-1 text-forge-dim hover:text-forge-ink"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        aria-label="Delete thread"
                        onClick={() => { if (window.confirm(`Delete "${t.title}"? Its messages move to Main.`)) { onDelete(t.id); } }}
                        className="rounded p-1 text-forge-dim hover:text-forge-err"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={() => { onNew(); setOpen(false); }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-forge-border px-2 py-2 text-xs text-forge-ember hover:bg-forge-raised"
            >
              <Plus size={13} /> New thread
            </button>
          </div>
        </>
      )}
    </div>
  );
}
