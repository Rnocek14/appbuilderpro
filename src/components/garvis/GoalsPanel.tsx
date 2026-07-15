// src/components/garvis/GoalsPanel.tsx
// Goals & Constraints management for the Garvis page. Active goals are the brain's objective function;
// constraints are the limits it reasons within. Garvis-proposed goals show here for approval.

import { useState } from 'react';
import { Target, Check, X, Plus, SlidersHorizontal } from 'lucide-react';
import { useGarvisObjective } from '../../hooks/useGarvisObjective';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, Input } from '../ui';
import type { RiskLevel } from '../../types';

const selectCls = 'rounded border border-forge-border bg-forge-raised px-2 py-1.5 text-sm text-forge-ink';

export function GoalsPanel() {
  const { activeGoals, proposedGoals, constraints, addGoal, approveGoal, rejectGoal, updateGoalStatus, saveConstraints } = useGarvisObjective();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('');
  const [priority, setPriority] = useState(2);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const onAdd = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await addGoal({ title: title.trim(), success_metric: metric.trim() || null, priority, target_date: target || null });
      setTitle(''); setMetric(''); setPriority(2); setTarget('');
      toast('success', 'Goal added.');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not add goal.'); }
    finally { setBusy(false); }
  };

  const onConstraint = (patch: Parameters<typeof saveConstraints>[0]) =>
    saveConstraints(patch).catch((e) => toast('error', e instanceof Error ? e.message : 'Could not save constraints.'));

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Target size={16} className="text-forge-ember" />
        <h2 className="font-display text-sm font-semibold">Goals & constraints</h2>
        <span className="text-[11px] text-forge-dim/70">What Garvis optimizes for — and the limits it respects.</span>
      </div>

      {proposedGoals.length > 0 && (
        <div className="mb-3 space-y-2">
          {proposedGoals.map((g) => (
            <div key={g.id} className="flex items-start gap-3 rounded border border-forge-ember/30 bg-forge-ember/5 p-2.5">
              <Badge tone="ember">proposed</Badge>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-forge-ink">{g.title}</span>
                {g.success_metric && <span className="ml-2 text-[11px] text-forge-dim">metric: {g.success_metric}</span>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" onClick={() => approveGoal(g.id)} title="Approve — make active"><Check size={14} /></Button>
                <Button variant="ghost" onClick={() => rejectGoal(g.id)} title="Reject"><X size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {activeGoals.length === 0 && proposedGoals.length === 0 && (
          <p className="text-xs text-forge-dim">No goals yet — add what you're trying to achieve so Garvis can reason toward it.</p>
        )}
        {activeGoals.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded border border-forge-border p-2.5">
            <Badge tone="dim">P{g.priority}</Badge>
            <div className="min-w-0 flex-1">
              <span className="text-sm text-forge-ink">{g.title}</span>
              {g.success_metric && <span className="ml-2 text-[11px] text-forge-dim">metric: {g.success_metric}</span>}
              {g.target_date && <span className="ml-2 text-[11px] text-forge-dim/70">by {g.target_date}</span>}
            </div>
            <select
              className={selectCls}
              value={g.status}
              onChange={(e) => updateGoalStatus(g.id, e.target.value as typeof g.status)}
              title="Goal status"
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="achieved">achieved</option>
              <option value="abandoned">abandon</option>
            </select>
          </div>
        ))}
      </div>

      {/* add goal */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-forge-border pt-3">
        <Input className="min-w-[12rem] flex-1" placeholder="New goal (e.g. Get to $5k MRR)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input className="w-40" placeholder="success metric" value={metric} onChange={(e) => setMetric(e.target.value)} />
        <select className={selectCls} value={priority} onChange={(e) => setPriority(Number(e.target.value))} title="Priority">
          <option value={1}>P1</option><option value={2}>P2</option><option value={3}>P3</option><option value={4}>P4</option>
        </select>
        <Input className="w-36" type="date" value={target} onChange={(e) => setTarget(e.target.value)} title="Target date" />
        <Button onClick={onAdd} loading={busy}><Plus size={14} /> Add</Button>
      </div>

      {/* constraints */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-forge-border pt-3">
        <SlidersHorizontal size={14} className="text-forge-dim" />
        <span className="text-[11px] text-forge-dim">Constraints:</span>
        <Input className="w-28" type="number" placeholder="hrs/week" defaultValue={constraints?.weekly_hours ?? ''} onBlur={(e) => onConstraint({ weekly_hours: e.target.value ? Number(e.target.value) : null })} />
        <Input className="w-32" type="number" placeholder="$ budget/mo" defaultValue={constraints?.monthly_budget_usd ?? ''} onBlur={(e) => onConstraint({ monthly_budget_usd: e.target.value ? Number(e.target.value) : null })} />
        <select className={selectCls} defaultValue={constraints?.risk_tolerance ?? 'moderate'} onChange={(e) => onConstraint({ risk_tolerance: e.target.value as RiskLevel })} title="Risk tolerance">
          <option value="low">low risk</option><option value="moderate">moderate risk</option><option value="high">high risk</option>
        </select>
        <Input className="w-32" type="number" placeholder="max projects" defaultValue={constraints?.max_active_projects ?? ''} onBlur={(e) => onConstraint({ max_active_projects: e.target.value ? Number(e.target.value) : null })} />
      </div>
    </Card>
  );
}
