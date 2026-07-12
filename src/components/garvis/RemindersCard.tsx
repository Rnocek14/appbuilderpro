// src/components/garvis/RemindersCard.tsx
// The user's own reminders — set, see, clear. Due ones also surface as the top-ranked waking move
// (collectReminders); this card is where they're managed. The one operator affordance with no home.

import { useCallback, useEffect, useState } from 'react';
import { Bell, Plus, Check, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { cn, timeAgo } from '../../lib/utils';
import { listReminders, addReminder, completeReminder, deleteReminder, type ReminderRow } from '../../lib/garvis/remindersRun';

export function RemindersCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try { setRows(await listReminders()); } catch { /* stays empty */ } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const add = async () => {
    if (!title.trim()) return;
    try {
      const r = await addReminder({ title, dueAt: due ? new Date(due).toISOString() : null });
      setRows((p) => [...p, r].sort((a, b) => (a.due_at ?? '9999') < (b.due_at ?? '9999') ? -1 : 1));
      setTitle(''); setDue(''); setAdding(false);
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not save.'); }
  };
  const done = async (id: string) => {
    try { await completeReminder(id); setRows((p) => p.filter((r) => r.id !== id)); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };
  const remove = async (id: string) => {
    try { await deleteReminder(id); setRows((p) => p.filter((r) => r.id !== id)); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not delete.'); }
  };

  if (!loaded && !rows.length) return null;
  // Cold-start clutter guard: an empty reminders card above the suggestions is noise on day one.
  // (It reappears the moment a reminder exists, or while the user is adding one via the ⌘K path.)
  if (loaded && !rows.length && !adding) return null;
  const isDue = (r: ReminderRow) => !r.due_at || new Date(r.due_at).getTime() <= Date.now();

  return (
    <div id="reminders-card" className="rounded-2xl border border-forge-border bg-forge-panel/40 p-3">
      <div className="flex items-center gap-2">
        <Bell size={14} className="text-forge-ember" />
        <span className="text-sm font-semibold text-forge-ink">Reminders</span>
        <span className="flex-1" />
        <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[11px] text-forge-ember hover:underline">
          <Plus size={12} /> add
        </button>
      </div>

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
            placeholder="Remind me to…" className="min-w-0 flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-dim focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void add()} className="rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10">Save</button>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <button onClick={() => void done(r.id)} title="Mark done" className="text-forge-dim hover:text-forge-ok"><Check size={13} /></button>
              <span className={cn('min-w-0 flex-1 truncate text-xs', isDue(r) ? 'text-forge-ink' : 'text-forge-dim')}>{r.title}</span>
              {r.due_at && <span className={cn('text-[10px]', isDue(r) ? 'text-forge-ember' : 'text-forge-dim')}>{isDue(r) ? 'due' : timeAgo(r.due_at)}</span>}
              <button onClick={() => void remove(r.id)} title="Delete" className="text-forge-dim/60 hover:text-forge-warn"><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
