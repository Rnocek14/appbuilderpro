// src/components/editor/DiffModal.tsx
// Review-before-write: shows the line diff of a proposed change set (PendingEdit) so the user approves
// or discards BEFORE anything is written. Uses the existing `diff` dependency. Nothing here mutates
// state — Apply/Discard are delegated to the parent.

import { useMemo } from 'react';
import { diffLines } from 'diff';
import { FileCode2, FilePlus2, Trash2, AlertTriangle } from 'lucide-react';
import { Badge, Button, Modal } from '../ui';
import type { PendingEdit, PendingFile } from '../../lib/pendingEdit';

function FileDiff({ file }: { file: PendingFile }) {
  const parts = useMemo(() => diffLines(file.before, file.after), [file.before, file.after]);
  return (
    <div className="rounded border border-forge-border">
      <div className="flex items-center gap-2 border-b border-forge-border bg-forge-panel px-2 py-1.5">
        {file.isNew ? <FilePlus2 size={12} className="text-forge-ok" /> : <FileCode2 size={12} className="text-forge-dim" />}
        <span className="font-mono text-[11px] text-forge-ink">{file.path}</span>
        {file.isNew && <Badge tone="ok">new file</Badge>}
      </div>
      <pre className="max-h-72 overflow-auto panel-scroll bg-forge-bg p-2 font-mono text-[11px] leading-5">
        {parts.map((p, i) => {
          const lines = p.value.replace(/\n$/, '').split('\n');
          const cls = p.added
            ? 'bg-forge-ok/10 text-forge-ok'
            : p.removed
              ? 'bg-forge-err/10 text-forge-err'
              : 'text-forge-dim';
          const sign = p.added ? '+' : p.removed ? '-' : ' ';
          return lines.map((ln, j) => (
            <div key={`${i}-${j}`} className={cls}>{sign} {ln || ' '}</div>
          ));
        })}
      </pre>
    </div>
  );
}

export function DiffModal({
  pending, onApply, onDiscard, applying,
}: { pending: PendingEdit | null; onApply: () => void; onDiscard: () => void; applying?: boolean }) {
  const count = (pending?.changes.length ?? 0) + (pending?.deletions.length ?? 0);
  return (
    <Modal open={!!pending} onClose={onDiscard} title="Review changes before applying">
      {pending && (
        <div className="space-y-3">
          {pending.explanation && <p className="text-sm text-forge-dim">{pending.explanation}</p>}

          <div className="max-h-[55vh] space-y-3 overflow-auto panel-scroll">
            {pending.changes.map((f) => <FileDiff key={f.path} file={f} />)}

            {pending.deletions.length > 0 && (
              <div className="rounded border border-forge-err/30 bg-forge-err/5 p-2 text-xs text-forge-err">
                <div className="mb-1 flex items-center gap-1 font-medium"><Trash2 size={12} /> Will delete</div>
                {pending.deletions.map((p) => <div key={p} className="font-mono text-[11px]">{p}</div>)}
              </div>
            )}

            {pending.blocked.length > 0 && (
              <div className="rounded border border-forge-warn/30 bg-forge-warn/5 p-2 text-xs text-forge-warn">
                <div className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle size={12} /> Skipped (couldn't see these files)</div>
                {pending.blocked.map((p) => <div key={p} className="font-mono text-[11px]">{p}</div>)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-forge-border pt-3">
            <Button variant="ghost" onClick={onDiscard} disabled={applying}>Discard</Button>
            <Button onClick={onApply} loading={applying}>
              Apply {count} change{count === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
