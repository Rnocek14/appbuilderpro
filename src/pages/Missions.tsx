import { useState } from 'react';
import { Rocket, Sparkles, ChevronDown, ChevronRight, Play, Trash2, Check } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { MissionTasks } from '../components/garvis/MissionTasks';
import { usePortfolio } from '../hooks/usePortfolio';
import { useMissions } from '../hooks/useMissions';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui';
import { timeAgo } from '../lib/utils';
import type { MissionStatus } from '../types';

const MISSION_TONE: Record<MissionStatus, 'dim' | 'ember' | 'ok' | 'warn'> = {
  planning: 'ember', planned: 'warn', running: 'ember', review: 'ok', done: 'ok', failed: 'warn',
};

export default function Missions() {
  const { apps } = usePortfolio();
  const { missions, tasksByMission, loading, busyId, planMission, runMission, deleteMission } = useMissions();
  const { toast } = useToast();
  const [objective, setObjective] = useState('');
  const [appId, setAppId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const onPlan = async () => {
    if (!objective.trim()) { toast('info', 'Tell Garvis the objective.'); return; }
    const subject = appId ? (apps.find((a) => a.id === appId)?.name ?? objective) : objective.trim();
    try {
      const id = await planMission({ objective: objective.trim(), subject, appId: appId || null });
      if (id) { setOpenId(id); setObjective(''); toast('success', 'Garvis planned it — review, then run.'); }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Planning failed.');
    }
  };

  const onRun = async (id: string) => {
    try { await runMission(id); toast('success', 'Mission complete — review the results.'); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Mission run failed.'); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Rocket size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Missions</h1>
            <p className="text-sm text-forge-dim">Hand Garvis an objective. It plans the work, dispatches its workers, and brings back results.</p>
          </div>
        </div>

        <Card className="mb-6 p-4">
          <label className="mb-1 block text-xs font-medium text-forge-dim">What should Garvis take on?</label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={2}
            placeholder="e.g. Grow Theory Thread — find the opportunity, plan the build, and create launch marketing"
            className="mb-3 w-full rounded border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink focus:border-forge-ember focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="rounded border border-forge-border bg-forge-panel px-2 py-1.5 text-xs text-forge-dim focus:border-forge-ember focus:outline-none"
            >
              <option value="">External / portfolio-wide</option>
              {apps.map((a) => <option key={a.id} value={a.id}>About: {a.name}</option>)}
            </select>
            <Button onClick={onPlan} loading={busyId !== null}><Sparkles size={15} /> Plan mission</Button>
          </div>
          <p className="mt-2 text-[11px] text-forge-dim/60">Prefer to just talk? Use <span className="text-forge-ember">Command</span> — same engine, conversational.</p>
        </Card>

        {loading ? (
          <div className="py-16 text-center"><Spinner label="Loading missions…" /></div>
        ) : missions.length === 0 ? (
          <EmptyState icon={<Rocket size={28} />} title="No missions yet" body="Give Garvis an objective above — it'll decompose it into work for its team and report back." />
        ) : (
          <div className="space-y-3">
            {missions.map((m) => {
              const open = openId === m.id;
              const mTasks = tasksByMission[m.id] ?? [];
              const done = mTasks.filter((t) => t.status === 'done').length;
              return (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start gap-2">
                    <button onClick={() => setOpenId(open ? null : m.id)} className="mt-0.5 text-forge-dim hover:text-forge-ink">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold">{m.objective}</span>
                        <Badge tone={MISSION_TONE[m.status]}>{m.id === busyId && m.status !== 'planned' ? 'working…' : m.status}</Badge>
                        {mTasks.length > 0 && <span className="text-[11px] text-forge-dim/60">{done}/{mTasks.length} done</span>}
                        <span className="text-[11px] text-forge-dim/60">{timeAgo(m.created_at)}</span>
                      </div>
                      {m.summary && <p className="mt-1 text-xs text-forge-dim">{m.summary}</p>}
                    </div>
                    {(m.status === 'planned' || m.status === 'review' || m.status === 'failed') && (
                      <Button onClick={() => onRun(m.id)} loading={busyId === m.id} title="Dispatch the workers">
                        <Play size={13} /> {m.status === 'planned' ? 'Run' : 'Re-run'}
                      </Button>
                    )}
                    <button onClick={() => deleteMission(m.id)} className="text-forge-dim/60 hover:text-forge-err" title="Delete"><Trash2 size={14} /></button>
                  </div>

                  {open && mTasks.length > 0 && (
                    <div className="mt-3 animate-fadeInUp">
                      <MissionTasks tasks={mTasks} />
                      {m.status === 'review' && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] text-forge-ember"><Check size={12} /> Mission complete — expand each task for the deliverable.</p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
