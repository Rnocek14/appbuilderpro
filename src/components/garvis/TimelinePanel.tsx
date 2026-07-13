// src/components/garvis/TimelinePanel.tsx
// TRANSACTION TIMELINES: contract-to-close (or listing-to-live) checklists whose dated steps can
// become firing reminders. Honesty on the surface: the template note ("YOUR contract sets the real
// deadlines") renders verbatim; overdue is computed and named; done says done.

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { TIMELINE_TEMPLATES, timelineLine, isOverdue, type TimelineKind } from '../../lib/garvis/timelines';
import {
  createTimeline, listTimelines, setStepDone, setTimelineStatus, deleteTimeline,
  type TimelineRow,
} from '../../lib/garvis/timelinesRun';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function TimelinePanel({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  const [rows, setRows] = useState<TimelineRow[] | null>(null);
  const [kind, setKind] = useState<TimelineKind>('purchase');
  const [title, setTitle] = useState('');
  const [anchor, setAnchor] = useState('');
  const [withReminders, setWithReminders] = useState(true);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tpl = TIMELINE_TEMPLATES[kind];

  const refresh = async () => {
    try { setRows(await listTimelines(worldId)); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not load timelines (is app_0067 applied?)'); setRows([]); }
  };
  useEffect(() => { void refresh(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  const doCreate = async () => {
    try {
      setBusy(true);
      const res = await createTimeline({ worldId, title, kind, anchorDate: anchor, addReminders: withReminders });
      onToast('success', `Timeline started — ${res.steps} steps${res.reminders ? `, ${res.reminders} reminders will fire at their due times` : ''}.`);
      setTitle(''); setAnchor('');
      await refresh();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not create.'); }
    finally { setBusy(false); }
  };

  const doToggle = async (t: TimelineRow, stepId: string, done: boolean) => {
    try {
      await setStepDone(stepId, done);
      setRows((rs) => (rs ?? []).map((r) => r.id !== t.id ? r : {
        ...r, steps: r.steps.map((s) => (s.id === stepId ? { ...s, done, done_at: done ? new Date().toISOString() : null } : s)),
      }));
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not update the step.'); }
  };

  const doClose = async (t: TimelineRow) => {
    try { await setTimelineStatus(t.id, t.status === 'active' ? 'closed' : 'active'); await refresh(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };

  const doDelete = async (t: TimelineRow) => {
    if (!window.confirm(`Delete timeline "${t.title}" and its steps? (Reminders it armed stay until they fire or you delete them.)`)) return;
    try { await deleteTimeline(t.id); await refresh(); onToast('info', 'Timeline deleted.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not delete.'); }
  };

  if (rows === null) return <div className="mt-4 flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading timelines…</div>;

  return (
    <div className="mt-4 rounded-xl border border-forge-border bg-forge-raised/30 p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink">
        <CalendarClock size={14} className="text-forge-ember" /> Transaction timelines
      </h4>
      <p className="mt-0.5 text-[11px] text-forge-dim">{tpl.note}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as TimelineKind)}
          className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none">
          {(Object.keys(TIMELINE_TEMPLATES) as TimelineKind[]).map((k) => (
            <option key={k} value={k}>{TIMELINE_TEMPLATES[k].label}</option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "10 Shore Dr — buyers"'
          className="w-52 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
        <label className="flex items-center gap-1 text-[11px] text-forge-dim">
          {tpl.anchorLabel}:
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)}
            className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-forge-dim">
          <input type="checkbox" checked={withReminders} onChange={(e) => setWithReminders(e.target.checked)} className="accent-[#FF8A3D]" />
          arm a firing reminder per step
        </label>
        <button onClick={() => void doCreate()} disabled={busy || !title.trim() || !anchor}
          className="flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-50">
          <Plus size={13} /> Start timeline
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 space-y-3">
          {rows.map((t) => (
            <div key={t.id} className={cn('rounded-lg border p-2.5', t.status === 'closed' ? 'border-forge-border/50 opacity-60' : 'border-forge-border')}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-forge-ink">{t.title}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-forge-dim">{TIMELINE_TEMPLATES[t.kind].label} · anchor {t.anchor_date}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => void doClose(t)} className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:text-forge-ink">
                    {t.status === 'active' ? 'close' : 'reopen'}
                  </button>
                  <button onClick={() => void doDelete(t)} className="text-forge-dim hover:text-forge-warn"><Trash2 size={12} /></button>
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-forge-dim">
                {timelineLine(t.steps.map((s) => ({ title: s.title, dueDate: s.due_date, done: s.done })), today)}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {t.steps.map((s) => {
                  const over = isOverdue({ title: s.title, dueDate: s.due_date, done: s.done }, today);
                  return (
                    <li key={s.id} className="flex items-center gap-2 text-xs">
                      <button onClick={() => void doToggle(t, s.id, !s.done)} className={s.done ? 'text-forge-ok' : 'text-forge-dim hover:text-forge-ink'}>
                        {s.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      </button>
                      <span className={cn('min-w-0 flex-1 truncate', s.done ? 'text-forge-dim line-through' : 'text-forge-ink/85')}>{s.title}</span>
                      {s.due_date && (
                        <span className={cn('shrink-0 text-[10px]', over ? 'font-semibold text-forge-warn' : 'text-forge-dim')}>
                          {s.due_date}{over ? ' · OVERDUE' : ''}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
