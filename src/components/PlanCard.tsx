import { ClipboardList, FileCode2, Check } from 'lucide-react';
import type { EditPlan } from '../types';
import { Button } from './ui';

/**
 * Renders a proposed plan (plan mode) before any code is written. Used by both
 * the chat panel (iterative edits) and the new-project page (cold-start).
 * An implementation plan lists files it will touch; an analysis plan does not.
 */
export function PlanCard({ plan, onApprove, approveLabel }: { plan: EditPlan; onApprove?: () => void; approveLabel?: string }) {
  const isImplementation = plan.fileHints.length > 0;
  const label = approveLabel ?? (isImplementation ? 'Approve & build' : 'Approve & continue');
  return (
    <div className="rounded-xl border border-forge-ember/40 bg-forge-raised p-3 shadow-ember">
      <div className="flex items-center gap-2">
        <ClipboardList size={15} className="text-forge-ember" />
        <span className="font-display text-sm font-medium">{isImplementation ? 'Proposed plan' : 'Proposed approach'}</span>
        <span className="ml-auto rounded-full border border-forge-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-forge-dim">
          {isImplementation ? 'no files changed yet' : 'analysis · no code'}
        </span>
      </div>
      {plan.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-forge-ink">{plan.summary}</p>}

      {plan.steps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-forge-dim">
          {plan.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {plan.fileHints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {plan.fileHints.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded border border-forge-border bg-forge-panel px-1.5 py-0.5 font-mono text-[10px] text-forge-dim">
              <FileCode2 size={10} /> {f}
            </span>
          ))}
        </div>
      )}
      {plan.options.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-forge-dim">Options</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-forge-ink">
            {plan.options.map((o) => <li key={o}>• {o}</li>)}
          </ul>
        </div>
      )}
      {plan.openQuestions.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-forge-dim">Open questions</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-forge-ember">
            {plan.openQuestions.map((q) => <li key={q}>• {q}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={onApprove}>
          <Check size={14} /> {label}
        </Button>
        <span className="text-[11px] text-forge-dim">…or reply below to change the plan.</span>
      </div>
    </div>
  );
}
