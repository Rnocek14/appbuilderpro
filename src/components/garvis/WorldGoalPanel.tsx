// src/components/garvis/WorldGoalPanel.tsx
// THE WORLD GOAL — what THIS project is FOR, in the owner's own words (world_goals, app_0042).
// Once set, every function bends toward it: Next Move boosts moves that advance it (and names
// it), producers write at it, Ask frames answers with it, and the Commander carries all project
// goals into every conversation. Distinct from the legacy portfolio GoalsPanel (Garvis page).
//
// Progress is HONEST: measured only from real rows (leads/visits since the goal was set), the
// owner's own manual count (labeled as such), or "directional — not measured". Never a fake meter.

import { useCallback, useEffect, useState } from 'react';
import { Target, Plus, Check, Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  listGoals, addGoal, updateGoal, deleteGoal, measureGoal,
  type WorldGoal, type GoalProgress,
} from '../../lib/garvis/goalsRun';

const METRICS: { value: WorldGoal['metric_kind']; label: string; hint: string }[] = [
  { value: 'leads', label: 'Leads', hint: 'measured from your site’s form submissions' },
  { value: 'visits', label: 'Site visits', hint: 'measured from your site’s reporting' },
  { value: 'manual', label: 'I’ll track it', hint: 'you log the number; shown as your own count' },
  { value: 'none', label: 'Directional', hint: 'no meter — the goal still steers Garvis' },
];

export function WorldGoalPanel({ worldId }: { worldId: string }) {
  const { toast } = useToast();
  const [goals, setGoals] = useState<WorldGoal[]>([]);
  const [progress, setProgress] = useState<Record<string, GoalProgress>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  // form
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [metric, setMetric] = useState<WorldGoal['metric_kind']>('leads');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');

  const refresh = useCallback(async () => {
    try {
      const rows = await listGoals(worldId, 'all');
      setGoals(rows.filter((g) => g.status !== 'dropped'));
      const active = rows.filter((g) => g.status === 'active');
      const entries = await Promise.all(active.map(async (g) => [g.id, await measureGoal(g)] as const));
      setProgress(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    if (!title.trim()) { toast('error', 'Say what the goal is — your words.'); return; }
    setSaving(true);
    try {
      await addGoal({
        worldId, title, why,
        metricKind: metric,
        targetValue: target.trim() ? Number(target) : null,
        targetDate: date || null,
      });
      setTitle(''); setWhy(''); setTarget(''); setDate(''); setAdding(false);
      toast('success', 'Goal set — Garvis now steers this world toward it.');
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save the goal.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (g: WorldGoal, status: WorldGoal['status']) => {
    try { await updateGoal(g.id, { status }); await refresh(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); }
  };

  const logManual = async (g: WorldGoal) => {
    const raw = window.prompt(`Your progress on “${g.title}” so far${g.target_value ? ` (target ${g.target_value})` : ''}:`, String(g.current_manual ?? ''));
    if (raw == null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) { toast('error', 'Enter a number.'); return; }
    try { await updateGoal(g.id, { current_manual: n }); await refresh(); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not log it.'); }
  };

  if (loading) return null;
  const active = goals.filter((g) => g.status === 'active');
  const done = goals.filter((g) => g.status === 'achieved');
  const paused = goals.filter((g) => g.status === 'paused');

  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-forge-ember" />
          <span className="text-sm font-medium text-forge-ink">The goal</span>
          <span className="hidden text-[11px] text-forge-dim sm:inline">what this world is for — every tool aims at it</span>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim transition-colors hover:border-forge-ember/60 hover:text-forge-ember"
          >
            <Plus size={13} /> {active.length ? 'Add another' : 'Set the goal'}
          </button>
        )}
      </div>

      {!active.length && !adding && (
        <p className="text-sm text-forge-dim">
          No goal set. Say what you’re trying to achieve here — Garvis will rank moves, write copy,
          and answer questions with it in mind.
        </p>
      )}

      {/* Active goals with honest progress */}
      <div className="space-y-2.5">
        {active.map((g) => {
          const p = progress[g.id];
          return (
            <div key={g.id} className="rounded-lg border border-forge-border bg-forge-bg/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-forge-ink">{g.title}</div>
                  {g.why && <div className="mt-0.5 text-xs text-forge-dim">{g.why}</div>}
                  <div className="mt-1 text-[11px] text-forge-dim">
                    {g.target_date && <span className="mr-2">By {g.target_date}.</span>}
                    {p?.note ?? ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {g.metric_kind === 'manual' && (
                    <button onClick={() => void logManual(g)} title="Log progress"
                      className="rounded-md border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                      Log
                    </button>
                  )}
                  <button onClick={() => void setStatus(g, 'achieved')} title="Mark achieved"
                    className="rounded-md border border-forge-border p-1.5 text-forge-dim transition-colors hover:border-forge-ok/60 hover:text-forge-ok">
                    <Check size={13} />
                  </button>
                  <button onClick={() => void setStatus(g, 'paused')} title="Pause (stops steering)"
                    className="rounded-md border border-forge-border p-1.5 text-forge-dim hover:text-forge-warn">
                    <Pause size={13} />
                  </button>
                </div>
              </div>
              {/* The meter renders ONLY with a real numerator + denominator. */}
              {p?.pct != null && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-forge-border/60">
                    <div className="h-full rounded-full bg-forge-ember transition-all" style={{ width: `${p.pct}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-forge-dim">
                    {p.pct}% — {p.basis === 'measured' ? 'measured from real rows' : 'your own count'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-forge-border bg-forge-bg/60 p-3">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140}
            placeholder="The goal, in your words — e.g. “10 seller leads a month”"
            className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none"
          />
          <input
            value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200}
            placeholder="Why it matters (optional)"
            className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={metric} onChange={(e) => setMetric(e.target.value as WorldGoal['metric_kind'])}
              title={METRICS.find((m) => m.value === metric)?.hint}
              className="rounded-lg border border-forge-border bg-forge-panel px-2.5 py-2 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none"
            >
              {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {metric !== 'none' && (
              <input
                value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Target #" inputMode="numeric"
                className="w-24 rounded-lg border border-forge-border bg-forge-panel px-2.5 py-2 text-xs text-forge-ink placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none"
              />
            )}
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-forge-border bg-forge-panel px-2.5 py-2 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none"
            />
            <span className="text-[11px] text-forge-dim">{METRICS.find((m) => m.value === metric)?.hint}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void save()} disabled={saving}
              className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-3 py-2 text-xs font-medium text-forge-ember transition-colors hover:bg-forge-ember/20 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Target size={13} />} Set the goal
            </button>
            <button onClick={() => setAdding(false)} className="rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim hover:text-forge-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Paused / achieved — quiet history, one line each */}
      {(paused.length > 0 || done.length > 0) && (
        <div className="mt-3 space-y-1 border-t border-forge-border/60 pt-2">
          {paused.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-[11px] text-forge-dim">
              <Pause size={11} /> <span className="truncate">{g.title}</span>
              <button onClick={() => void setStatus(g, 'active')} className="ml-auto flex items-center gap-1 text-forge-dim hover:text-forge-ember"><Play size={11} /> Resume</button>
              <button onClick={() => void deleteGoal(g.id).then(refresh)} className="text-forge-dim hover:text-forge-err" title="Delete"><Trash2 size={11} /></button>
            </div>
          ))}
          {done.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-[11px] text-forge-dim">
              <Check size={11} className="text-forge-ok" /> <span className="truncate line-through">{g.title}</span>
              <span className="ml-auto text-forge-ok">achieved</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
