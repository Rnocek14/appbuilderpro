// src/components/garvis/MissionTasks.tsx
// Shared renderer for a mission's tasks — used by both the Missions page and the Command chat so the
// "what the workers produced" experience is identical everywhere. Each task shows its worker, status,
// and (when done) the deliverable rendered as markdown.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Badge, Spinner } from '../ui';
import { Markdown } from '../Markdown';
import type { GarvisTask, TaskStatus, WorkerKind } from '../../types';

export const WORKER_META: Record<WorkerKind, { label: string; tone: 'ok' | 'ember' | 'warn' | 'dim' }> = {
  research: { label: 'Research', tone: 'ok' },
  analytics: { label: 'Analytics', tone: 'ok' },
  marketing: { label: 'Marketing', tone: 'ember' },
  bug: { label: 'Bug / QA', tone: 'warn' },
  builder: { label: 'Builder', tone: 'ember' },
};
const TASK_TONE: Record<TaskStatus, 'dim' | 'ember' | 'ok' | 'warn'> = {
  queued: 'dim', running: 'ember', blocked: 'warn', done: 'ok', failed: 'warn', skipped: 'dim',
};

function TaskRow({ task }: { task: GarvisTask }) {
  const [open, setOpen] = useState(false);
  const meta = WORKER_META[task.worker];
  const hasResult = task.status === 'done' && task.result;
  return (
    <div className="rounded border border-forge-border p-2.5">
      <div className="flex items-center gap-2">
        <Badge tone={meta?.tone ?? 'dim'}>{meta?.label ?? task.worker}</Badge>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-forge-ink">{task.title}</span>
        {task.status === 'running' && <Spinner />}
        <Badge tone={TASK_TONE[task.status]}>{task.status}</Badge>
        {task.verify && !task.verify.ok && <AlertTriangle size={12} className="text-forge-err" />}
        {hasResult && (
          <button onClick={() => setOpen((v) => !v)} className="text-forge-dim hover:text-forge-ink">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>
      {hasResult && task.result && (
        <>
          {!open && <p className="mt-1 line-clamp-2 text-[11px] text-forge-dim">{task.result.summary}</p>}
          {open && (
            <div className="mt-2 space-y-2 animate-fadeInUp">
              {task.result.artifacts.map((a, i) => (
                <div key={i} className="rounded border border-forge-border bg-forge-panel/40 p-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-forge-dim">{a.title}</p>
                  <Markdown content={a.body} />
                </div>
              ))}
              {task.result.link && (
                <Link to={task.result.link} className="inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline">
                  Open <ArrowUpRight size={11} />
                </Link>
              )}
            </div>
          )}
        </>
      )}
      {task.status === 'failed' && task.result && <p className="mt-1 text-[11px] text-forge-err">{task.result.summary}</p>}
    </div>
  );
}

export function MissionTasks({ tasks }: { tasks: GarvisTask[] }) {
  return (
    <div className="space-y-1.5">
      {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
    </div>
  );
}
