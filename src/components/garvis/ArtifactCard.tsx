// src/components/garvis/ArtifactCard.tsx
// One artifact in a studio, with its version history. Expanding shows the current content; the
// version pills reveal a diff against the current version and let you restore an older one (which is
// itself a new version, so nothing is ever lost).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, History, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { diffLines } from '../../lib/garvis/clusterChat';
import { listVersions, restoreVersion, type StudioArtifact, type ArtifactVersion } from '../../lib/garvis/artifacts';
import { StudioPreviewFrame, mediumOf, mediumLabel } from './StudioPreviewFrame';

export function ArtifactCard({ artifact, onChanged, accent }: { artifact: StudioArtifact; onChanged: () => void; accent?: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ArtifactVersion[] | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [diffAgainst, setDiffAgainst] = useState<ArtifactVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Invalidate all cached version state whenever the artifact changes (a revise/restore bumps
  // revision and creates a new snapshot) — otherwise the pill list is stale and an open diff would
  // silently recompute against a new "current".
  useEffect(() => {
    setVersions(null);
    setShowVersions(false);
    setDiffAgainst(null);
  }, [artifact.revision]);

  const loadVersions = useCallback(async () => {
    if (versions) { setShowVersions((s) => !s); return; }
    // On failure leave versions null (not []) so the button retries instead of caching a dead state.
    try { setVersions(await listVersions(artifact.id)); setShowVersions(true); } catch { setVersions(null); }
  }, [artifact.id, versions]);

  const restore = async (v: ArtifactVersion) => {
    setRestoring(true);
    try { await restoreVersion(artifact.id, v); onChanged(); } finally { setRestoring(false); }
  };

  const diff = diffAgainst ? diffLines(diffAgainst.detail ?? '', artifact.detail ?? '') : null;
  // Classify the artifact's medium once so the row shows what it IS (a postcard, a social post…)
  // and the expanded view frames it in that medium instead of a raw text dump.
  const medium = useMemo(() => mediumOf(artifact), [artifact]);

  return (
    <div className="rounded-lg border border-forge-border bg-forge-panel/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <FileText size={14} className="text-forge-ember" />
        <button onClick={() => setOpen((o) => !o)} className="flex-1 text-left text-sm text-forge-ink">{artifact.title}</button>
        <span className="rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim" title="What this artifact is">{mediumLabel(medium)}</span>
        {artifact.revision > 1 && (
          <button onClick={() => void loadVersions()} title="Version history"
            className="flex items-center gap-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:text-forge-ink">
            <History size={11} /> v{artifact.revision}
          </button>
        )}
      </div>

      {open && !diff && (
        <div className="border-t border-forge-border p-3">
          <StudioPreviewFrame medium={medium} content={artifact.detail || '—'} accent={accent} />
        </div>
      )}

      {showVersions && versions && versions.length > 0 && (
        <div className="border-t border-forge-border px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-forge-dim">history</span>
            {versions.map((v) => (
              <button key={v.id}
                onClick={() => { setDiffAgainst(diffAgainst?.id === v.id ? null : v); setOpen(true); }}
                className={cn('rounded border px-1.5 py-0.5 text-[10px]', diffAgainst?.id === v.id ? 'border-forge-ember text-forge-ember' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                v{v.version}
              </button>
            ))}
          </div>
          {diffAgainst && (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] text-forge-dim">diff: v{diffAgainst.version} → v{artifact.revision} (current)</span>
              <button onClick={() => void restore(diffAgainst)} disabled={restoring}
                className="flex items-center gap-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:text-forge-ink disabled:opacity-50">
                {restoring ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />} restore v{diffAgainst.version}
              </button>
            </div>
          )}
        </div>
      )}

      {open && diff && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-forge-border px-3 py-2 text-xs">
          {diff.map((l, i) => (
            <div key={i} className={cn(
              l.type === 'added' && 'bg-forge-ok/10 text-forge-ok',
              l.type === 'removed' && 'bg-forge-err/10 text-forge-err line-through/0',
              l.type === 'same' && 'text-forge-dim',
            )}>
              <span className="select-none opacity-50">{l.type === 'added' ? '+ ' : l.type === 'removed' ? '- ' : '  '}</span>{l.text || ' '}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
