// src/components/garvis/StrategiesPanel.tsx — SW9.2: the world's strategies, behind its chip
// (closed by default, per the simplicity doctrine — NO new orange button; the world keeps its
// one primary action). Each strategy shows its honest basis: MEASURED cites the verbatim fact
// lines it stands on; HEURISTIC says so in as many words. Adopt/retire only shapes what the
// waking moment suggests — nothing here sends anything, ever.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lightbulb } from 'lucide-react';
import { listStrategies, proposeStrategies, setStrategyStatus, type StrategyRow } from '../../lib/garvis/strategiesRun';

export function StrategiesPanel({ worldId, onToast }: { worldId: string; onToast: (kind: 'success' | 'error', msg: string) => void }) {
  const [rows, setRows] = useState<StrategyRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);

  const refresh = useCallback(async () => {
    try { setRows(await listStrategies(worldId)); } catch { setRows([]); }
  }, [worldId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const propose = async () => {
    setProposing(true);
    try {
      const r = await proposeStrategies(worldId);
      if (!r.ok) { onToast('error', r.error ?? 'The proposals came back too thin.'); return; }
      onToast('success', `${r.strategies.length} strategies proposed — adopt what you believe in.`);
      await refresh();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not propose strategies.'); }
    finally { setProposing(false); }
  };

  const flip = async (id: string, status: 'adopted' | 'retired') => {
    setBusy(id);
    try { await setStrategyStatus(id, status); await refresh(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not update the strategy.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-forge-ink">Strategies — proposed from this business's real record</p>
        <button onClick={() => void propose()} disabled={proposing}
          className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:border-forge-ember/50 hover:text-forge-ink disabled:opacity-50">
          {proposing ? <Loader2 size={11} className="animate-spin" /> : <Lightbulb size={11} />} Propose strategies
        </button>
      </div>
      {rows === null ? (
        <p className="mt-2 text-xs text-forge-dim">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-forge-dim">
          None yet. Propose strategies reads this business's record — goal, research, real send and channel counts —
          and drafts 2-4 grounded ways forward. Measured claims cite the rows; thin evidence is labeled heuristic. Nothing sends.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((s) => (
            <li key={s.id} className="rounded-lg border border-forge-border bg-forge-bg/50 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-forge-ink">{s.title}</span>
                <span title={s.basis === 'measured' ? s.evidence.join(' · ') : 'No measured rows behind this yet — judgment, labeled as such'}
                  className={`rounded-full px-1.5 py-px text-[10px] ${s.basis === 'measured' ? 'border border-forge-ok/40 text-forge-ok' : 'border border-forge-border text-forge-dim'}`}>
                  {s.basis}
                </span>
                {s.status === 'adopted' && <span className="rounded-full bg-forge-ember/15 px-1.5 py-px text-[10px] text-forge-ember">adopted</span>}
                <span className="ml-auto flex gap-1">
                  {s.status !== 'adopted' && (
                    <button onClick={() => void flip(s.id, 'adopted')} disabled={busy === s.id}
                      className="rounded-lg border border-forge-border px-2 py-0.5 text-[10px] text-forge-dim hover:text-forge-ink disabled:opacity-50">Adopt</button>
                  )}
                  <button onClick={() => void flip(s.id, 'retired')} disabled={busy === s.id}
                    className="rounded-lg border border-forge-border px-2 py-0.5 text-[10px] text-forge-dim hover:text-forge-err disabled:opacity-50">Retire</button>
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-forge-dim">{s.rationale}</p>
              {s.basis === 'measured' && s.evidence.length > 0 && (
                <p className="mt-1 text-[10px] text-forge-dim/80">Evidence: {s.evidence.join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
