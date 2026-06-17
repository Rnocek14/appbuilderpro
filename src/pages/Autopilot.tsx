// src/pages/Autopilot.tsx
// Queue product briefs and let FableForge build in the background.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot, Plus, Pause, Play, XCircle, CheckCircle2, AlertTriangle,
  CircleDashed, Hammer, FileText, Inbox as InboxIcon,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Badge, Button, Card, EmptyState, Input, Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useJobs, useMilestones } from '../hooks/useAutopilot';
import { useProjects } from '../hooks/useProjectData';
import { formatUsd, timeAgo, cn } from '../lib/utils';
import type { Job, JobMilestone } from '../types';

const STATUS_TONE: Record<Job['status'], 'dim' | 'ember' | 'ok' | 'err' | 'warn'> = {
  queued: 'dim', running: 'ember', waiting_approval: 'warn',
  paused: 'warn', completed: 'ok', failed: 'err', cancelled: 'dim',
};
const STATUS_LABEL: Record<Job['status'], string> = {
  queued: 'Queued', running: 'Building', waiting_approval: 'Needs answers',
  paused: 'Paused', completed: 'Done', failed: 'Failed', cancelled: 'Cancelled',
};

function MilestoneRow({ m }: { m: JobMilestone }) {
  const icon =
    m.status === 'done' ? <CheckCircle2 size={14} className="text-forge-ok" /> :
    m.status === 'done_with_warnings' ? <AlertTriangle size={14} className="text-forge-warn" /> :
    m.status === 'building' ? <Hammer size={14} className="animate-pulse text-forge-ember" /> :
    <CircleDashed size={14} className="text-forge-dim" />;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className={cn('text-sm', m.status === 'pending' ? 'text-forge-dim' : 'text-forge-ink')}>{m.title}</p>
        {m.summary && <p className="mt-0.5 text-xs text-forge-dim">{m.summary}</p>}
        {m.warning && <p className="mt-0.5 text-xs text-forge-warn">⚠ {m.warning}</p>}
      </div>
    </div>
  );
}

function JobCard({ job, onSetStatus }: { job: Job; onSetStatus: (id: string, s: Job['status']) => void }) {
  const [expanded, setExpanded] = useState(false);
  const milestones = useMilestones(expanded ? job.id : null);
  const doneCount = milestones.filter((m) => m.status === 'done' || m.status === 'done_with_warnings').length;
  const budget = Number(job.budget_usd);
  const spent = Number(job.spent_usd);
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  return (
    <Card className="p-4">
      <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-forge-ink">{job.title}</p>
            <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-forge-dim">{job.brief}</p>
          {job.pause_reason && <p className="mt-1 text-xs text-forge-warn">{job.pause_reason}</p>}
        </div>
        <div className="shrink-0 text-right text-xs text-forge-dim">
          <p>{formatUsd(spent)} / {formatUsd(budget)}</p>
          <p className="mt-0.5">{timeAgo(job.updated_at)}</p>
        </div>
      </button>

      <div className="mt-3 h-1 overflow-hidden rounded bg-forge-raised">
        <div
          className={cn('h-full transition-all', pct > 85 ? 'bg-forge-warn' : 'bg-forge-ember')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {expanded && (
        <div className="mt-3 border-t border-forge-border pt-3">
          {milestones.length > 0 ? (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-forge-dim">
                Milestones · {doneCount}/{milestones.length}
              </p>
              {milestones.map((m) => <MilestoneRow key={m.id} m={m} />)}
            </>
          ) : (
            <p className="text-xs text-forge-dim">Planning milestones…</p>
          )}

          {job.report && (
            <div className="mt-3 rounded-lg border border-forge-border bg-forge-bg p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-forge-ink">
                <FileText size={13} className="text-forge-ember" /> Build report
              </p>
              {job.report.summary && <p className="mt-1.5 text-xs text-forge-dim">{job.report.summary}</p>}
              {!!job.report.built?.length && (
                <p className="mt-1.5 text-xs text-forge-dim"><span className="text-forge-ok">Built:</span> {job.report.built.join(' · ')}</p>
              )}
              {!!job.report.concerns?.length && (
                <p className="mt-1 text-xs text-forge-dim"><span className="text-forge-warn">Concerns:</span> {job.report.concerns.join(' · ')}</p>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/project/${job.project_id}`}>
              <Button size="sm" variant="outline">Open project</Button>
            </Link>
            {job.status === 'waiting_approval' && (
              <Link to="/inbox">
                <Button size="sm"><InboxIcon size={13} /> Answer questions</Button>
              </Link>
            )}
            {(job.status === 'running' || job.status === 'queued') && (
              <Button size="sm" variant="ghost" onClick={() => onSetStatus(job.id, 'paused')}><Pause size={13} /> Pause</Button>
            )}
            {job.status === 'paused' && (
              <Button size="sm" variant="ghost" onClick={() => onSetStatus(job.id, 'queued')}><Play size={13} /> Resume</Button>
            )}
            {job.status !== 'completed' && job.status !== 'cancelled' && (
              <Button size="sm" variant="ghost" onClick={() => onSetStatus(job.id, 'cancelled')}><XCircle size={13} /> Cancel</Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Autopilot() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { jobs, loading, createJob, setStatus } = useJobs();
  const { projects, createProject } = useProjects();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState('2.00');
  const [projectId, setProjectId] = useState<string>('__new__');
  const [submitting, setSubmitting] = useState(false);

  const active = useMemo(() => jobs.filter((j) => !['completed', 'cancelled'].includes(j.status)), [jobs]);
  const finished = useMemo(() => jobs.filter((j) => ['completed', 'cancelled'].includes(j.status)), [jobs]);

  const submit = async () => {
    if (!session || !title.trim() || !brief.trim()) return;
    setSubmitting(true);
    try {
      let pid = projectId;
      if (pid === '__new__') {
        const p = await createProject(title.trim());
        if (!p) throw new Error('Could not create the project');
        pid = p.id;
      }
      await createJob({
        project_id: pid, title: title.trim(), brief: brief.trim(),
        budget_usd: Math.max(0.25, parseFloat(budget) || 2),
      });
      toast('success', 'Queued — Autopilot is on it');
      setOpen(false); setTitle(''); setBrief('');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not queue the job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-forge-ink">Autopilot</h1>
            <p className="mt-1 text-sm text-forge-dim">
              Write a brief, set a budget, walk away. Answers land in your inbox; the report lands here.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus size={15} /> New brief</Button>
        </div>

        {!loading && jobs.length === 0 && (
          <div className="mt-10">
            <EmptyState
              icon={<Bot size={28} />}
              title="Nothing building yet"
              body="Queue a product brief and FableForge will plan it into milestones, build each one, validate, self-fix, and leave you a report."
              action={<Button onClick={() => setOpen(true)}><Plus size={15} /> Queue your first brief</Button>}
            />
          </div>
        )}

        {active.length > 0 && (
          <div className="mt-8 space-y-3">
            <p className="text-xs uppercase tracking-wide text-forge-dim">In progress</p>
            {active.map((j) => <JobCard key={j.id} job={j} onSetStatus={setStatus} />)}
          </div>
        )}
        {finished.length > 0 && (
          <div className="mt-8 space-y-3">
            <p className="text-xs uppercase tracking-wide text-forge-dim">Finished</p>
            {finished.map((j) => <JobCard key={j.id} job={j} onSetStatus={setStatus} />)}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Queue a build">
        <div className="space-y-3">
          <label className="block text-xs text-forge-dim">
            Title
            <Input className="mt-1" placeholder="Invoicing module" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-xs text-forge-dim">
            Brief — what should exist when you're back?
            <textarea
              className="mt-1 h-32 w-full rounded-lg border border-forge-border bg-forge-bg p-3 text-sm text-forge-ink outline-none focus:border-forge-ember/50"
              placeholder="Build the invoicing module: client CRUD, invoice list with status filters, PDF-style invoice view, overdue highlighting…"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-forge-dim">
              Project
              <select
                className="mt-1 w-full rounded-lg border border-forge-border bg-forge-bg p-2.5 text-sm text-forge-ink outline-none"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="__new__">＋ New project from this brief</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-forge-dim">
              Budget cap (USD)
              <Input className="mt-1" type="number" min="0.25" step="0.25" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-forge-dim">
            The job hard-stops at the cap, after repeated failed fixes it moves on with a warning instead of
            burning budget, and real decisions come to you as inbox questions.
          </p>
          <Button onClick={submit} loading={submitting} disabled={!title.trim() || !brief.trim()}>
            <Bot size={15} /> Start building
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
