// src/components/garvis/VerticalPlanner.tsx
// THE VERTICAL EMPIRE PLANNER — the structured plan the operator asked for: N faceless channels
// laid out as cards (niche, persona, look, first three episode ideas), the CTA that funnels
// every audience at the marketed thing, and ONE Implement press that compiles it into the
// orchestrator's reviewable arc and RUNS it — worlds, channels, CTA wiring, the daily draft
// clock, episode one — with live per-step statuses and honest failures. Nothing renders or
// posts from here; production stays in each studio and everything outbound waits in the Queue.

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, Play, TriangleAlert, X } from 'lucide-react';
import { buildVerticalPlan, planNotes, planToArc, VERTICAL_LIBRARY } from '../../lib/garvis/verticalPlan';
import { savePlan, runArc } from '../../lib/garvis/orchestratorRun';
import type { StepStatus } from '../../lib/garvis/orchestrator';
import { Button, Card } from '../ui';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function VerticalPlanner({ initialCount = 7, onToast }: { initialCount?: number; onToast: Toast }) {
  const [count, setCount] = useState(Math.max(1, Math.min(initialCount, VERTICAL_LIBRARY.length)));
  const [ctaUrl, setCtaUrl] = useState('');
  const [marketed, setMarketed] = useState('');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<StepStatus[] | null>(null);
  const [running, setRunning] = useState(false);
  const [finalNote, setFinalNote] = useState<string | null>(null);

  const plan = buildVerticalPlan(count, { ctaUrl: ctaUrl.trim() || null, marketed: marketed.trim() || undefined });
  const arc = planToArc(plan);

  const implement = async () => {
    setRunning(true);
    setFinalNote(null);
    setStatuses(plan.verticals.map(() => ({ kind: 'pending', note: '' })));
    try {
      const planId = await savePlan(`Vertical empire: ${plan.title}`, arc);
      const report = await runArc(planId, (s) => setStatuses([...s]));
      setStatuses([...report.statuses]);
      const done = report.statuses.filter((s) => s.kind === 'done' || s.kind === 'needs_review').length;
      setFinalNote(report.state === 'done'
        ? `${done} of ${plan.verticals.length} verticals stand. Drafted episodes wait in each studio; posts wait in your Queue.`
        : report.state === 'waiting'
          ? `Paused honestly: ${report.waitingReason ?? 'a step needs you first'} — it resumes after that.`
          : `${done} of ${plan.verticals.length} landed before a step failed — the note on the red step says exactly why.`);
    } catch (e) {
      setFinalNote(e instanceof Error ? e.message : 'The run could not start.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="mb-6 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-forge-ink">The vertical plan</p>
        <span className="text-xs text-forge-dim">— one faceless channel per niche, every audience funneled at the same place</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-forge-dim">
          verticals
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink">
            {VERTICAL_LIBRARY.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input value={marketed} onChange={(e) => setMarketed(e.target.value)} placeholder="what are these funneling to? e.g. “the stroke app”"
          className="min-w-[220px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
        <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="CTA link (https://…) — every caption carries it"
          className="min-w-[240px] flex-1 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
      </div>

      {arc.questions.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-forge-warn"><TriangleAlert size={12} className="mt-0.5 shrink-0" /> {arc.questions[0]}</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {plan.verticals.map((v, i) => {
          const st = statuses?.[i];
          const open = openIdx === i;
          return (
            <div key={v.libId} className={cn('rounded-xl border p-2.5', st?.kind === 'failed' ? 'border-forge-err/50' : st && (st.kind === 'done' || st.kind === 'needs_review') ? 'border-forge-ok/40' : 'border-forge-border bg-forge-bg/50')}>
              <div className="flex items-center gap-1.5">
                {st?.kind === 'running' ? <Loader2 size={12} className="shrink-0 animate-spin text-forge-ember" />
                  : st && (st.kind === 'done' || st.kind === 'needs_review') ? <Check size={12} className="shrink-0 text-forge-ok" />
                    : st?.kind === 'failed' ? <X size={12} className="shrink-0 text-forge-err" /> : null}
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-forge-ink">{v.name}</p>
                <button onClick={() => setOpenIdx(open ? null : i)} aria-label={open ? `Collapse ${v.name}` : `Expand ${v.name}`}
                  className="rounded p-0.5 text-forge-dim hover:text-forge-ink">{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-forge-dim">{v.niche}</p>
              {open && (
                <div className="mt-1.5 space-y-1 text-[11px] text-forge-dim">
                  <p><span className="text-forge-ink">Persona:</span> {v.persona}</p>
                  <p><span className="text-forge-ink">Look:</span> {v.visualStyle} · voice {v.voice}</p>
                  <p><span className="text-forge-ink">Why:</span> {v.why}</p>
                  <p className="text-forge-ink">First episodes:</p>
                  <ul className="list-none space-y-0.5 pl-0">{v.firstIdeas.map((idea, j) => <li key={j}>{j + 1}. {idea}</li>)}</ul>
                </div>
              )}
              {st && st.note && <p className={cn('mt-1 text-[11px]', st.kind === 'failed' ? 'text-forge-err' : 'text-forge-dim')}>{st.note}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-1">
        {planNotes(plan).map((n, i) => <p key={i} className="text-[11px] text-forge-dim">· {n}</p>)}
      </div>

      <div className="mt-3">
        <Button variant="primary" onClick={() => void implement()} loading={running} disabled={running}>
          <Play size={14} /> Implement — build all {plan.verticals.length}
        </Button>
        {finalNote && <p className="mt-2 text-xs text-forge-ink">{finalNote}</p>}
      </div>
    </Card>
  );
}
