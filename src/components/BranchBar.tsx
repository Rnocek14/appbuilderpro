// src/components/BranchBar.tsx
// The feature-branch strip + merge modal. The bar sits above the workspace's 3-pane body and
// says one thing clearly: everything you're looking at (chat, code, preview) is THIS branch's
// view, and here's how far it has diverged from Main. Merging runs the readiness-gated pipeline
// in lib/mergeBranch.ts — the modal shows its live progress and the final report.

import { GitBranch, GitMerge, Trash2, Check, TriangleAlert, LoaderCircle } from 'lucide-react';
import { Badge, Button, Modal } from './ui';
import type { BranchSummary } from '../lib/branches';
import type { MergeProgress, MergeReport } from '../lib/mergeBranch';

export function BranchBar({ title, summary, busy, onMerge, onDiscard }: {
  title: string;
  summary: BranchSummary;
  busy: boolean;
  onMerge: () => void;
  onDiscard: () => void;
}) {
  const n = summary.changed;
  return (
    <div className="flex items-center gap-3 border-b border-forge-ember/30 bg-forge-ember/5 px-4 py-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-forge-ink">
        <GitBranch size={13} className="shrink-0 text-forge-ember" />
        <span className="truncate">{title}</span>
      </span>
      <span className="text-[11px] text-forge-dim">
        {n === 0 ? 'in sync with Main' : `${n} file${n === 1 ? '' : 's'} changed vs Main`}
      </span>
      {summary.conflicts > 0 && (
        <Badge tone="warn">{summary.conflicts} conflict{summary.conflicts === 1 ? '' : 's'} — auto-resolved on merge</Badge>
      )}
      <span className="hidden text-[11px] text-forge-dim lg:inline">
        Chat, code and preview show this branch — Main is untouched until you merge.
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy || n === 0} title="Throw away this branch's un-merged changes (the chat stays)">
          <Trash2 size={13} /> Discard
        </Button>
        <Button size="sm" onClick={onMerge} disabled={busy || n === 0} title="Verify the merged result, repair it if needed, then land it on Main">
          <GitMerge size={13} /> Merge into Main
        </Button>
      </div>
    </div>
  );
}

const STEP_LABEL: Record<MergeProgress['step'], string> = {
  diff: 'Diff',
  resolve: 'Resolve',
  verify: 'Verify',
  repair: 'Repair',
  commit: 'Commit',
};

export function MergeModal({ running, steps, report, onClose }: {
  running: boolean;
  steps: MergeProgress[];
  report: MergeReport | null;
  onClose: () => void;
}) {
  const last = steps[steps.length - 1];
  return (
    <Modal open onClose={onClose} title="Merge into Main">
      {/* Live progress feed — the pipeline narrates itself (diff → resolve → verify → repair → commit). */}
      <div className="max-h-56 overflow-y-auto panel-scroll rounded-lg border border-forge-border bg-forge-raised/40 p-3">
        {steps.length === 0 && <p className="text-xs text-forge-dim">Starting…</p>}
        <ul className="space-y-1">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide text-forge-ember">{STEP_LABEL[s.step]}</span>
              <span className={i === steps.length - 1 && running ? 'text-forge-ink' : 'text-forge-dim'}>{s.detail}</span>
            </li>
          ))}
        </ul>
        {running && (
          <p className="mt-2 flex items-center gap-2 text-xs text-forge-dim">
            <LoaderCircle size={13} className="animate-spin text-forge-ember" />
            {last ? STEP_LABEL[last.step] : 'Working'}… Main won't change until every check passes.
          </p>
        )}
      </div>

      {report && (
        <div className="mt-4">
          {report.ok ? (
            <div className="rounded-lg border border-forge-ok/40 bg-forge-ok/10 p-3 text-xs text-forge-ink">
              <p className="flex items-center gap-1.5 font-medium text-forge-ok"><Check size={14} /> Merged and verified — Main stayed green.</p>
              <ul className="mt-2 space-y-0.5 text-forge-dim">
                <li>{report.merged.length} file{report.merged.length === 1 ? '' : 's'} updated{report.deletedPaths.length ? `, ${report.deletedPaths.length} removed` : ''}</li>
                {report.conflictsResolved.length > 0 && <li>{report.conflictsResolved.length} conflict{report.conflictsResolved.length === 1 ? '' : 's'} resolved: {report.conflictsResolved.join(', ')}</li>}
                {report.repairRounds > 0 && <li>self-repaired before landing ({report.repairRounds} round{report.repairRounds === 1 ? '' : 's'})</li>}
                {report.skippedDeletes.length > 0 && <li>kept {report.skippedDeletes.length} file{report.skippedDeletes.length === 1 ? '' : 's'} Main had changed: {report.skippedDeletes.join(', ')}</li>}
                <li>checks: {report.checks}</li>
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-forge-err/40 bg-forge-err/10 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-forge-err"><TriangleAlert size={14} /> Merge did not land — Main is untouched.</p>
              <p className="mt-1.5 whitespace-pre-wrap text-forge-dim">{report.reason}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="outline" onClick={onClose} disabled={running}>{running ? 'Merging…' : 'Close'}</Button>
      </div>
    </Modal>
  );
}
