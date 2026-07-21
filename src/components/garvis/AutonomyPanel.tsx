// src/components/garvis/AutonomyPanel.tsx
// THE TRUST DIAL (app_0097). Four recurring approval classes, each with its real human-decision
// streak. Auto is OFFERED only after the streak earns it (5 clean approvals), granted only by
// the operator's click, capped per day, revoked in one click — and revocation is instant because
// the cron drafters re-read the grant on every mint. Cold pitches have no dial, ever.

import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { autonomyStatus, setAutonomy, type AutonomyStatus } from '../../lib/garvis/autonomyRun';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function AutonomyPanel({ onToast }: { onToast: Toast }) {
  const [rows, setRows] = useState<AutonomyStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => { void autonomyStatus().then(setRows).catch(() => setRows([])); };
  useEffect(refresh, []);

  const flip = async (r: AutonomyStatus) => {
    setBusy(r.id);
    try {
      const next = r.mode === 'auto' ? 'manual' : 'auto';
      await setAutonomy(r.id, next, r.dailyCap);
      onToast(next === 'auto' ? 'success' : 'info',
        next === 'auto'
          ? `${r.title} now run themselves (max ${r.dailyCap}/day, every send gate still applies). Revoke any time.`
          : `${r.title} are back to manual review.`);
      refresh();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not change that.'); }
    finally { setBusy(null); }
  };

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={14} className="text-forge-ember" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Earned autonomy</h3>
        <span className="text-[10px] text-forge-dim/70">5 clean approvals earn the offer — you grant it, it stays capped, revoke is instant</span>
      </div>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-forge-ink" title={r.what}>{r.title}</p>
              <p className="text-[10px] text-forge-dim">
                {r.mode === 'auto'
                  ? `AUTO — ${r.autoToday}/${r.dailyCap} today`
                  : r.eligible ? `earned (${r.streak} clean) — grant when ready` : `${r.streak}/5 clean approvals`}
              </p>
            </div>
            <button
              onClick={() => void flip(r)}
              disabled={busy === r.id || (r.mode === 'manual' && !r.eligible)}
              className={cn('rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-40',
                r.mode === 'auto'
                  ? 'border-forge-warn/50 text-forge-warn hover:bg-forge-warn/10'
                  : 'border-forge-ember/50 text-forge-ember hover:bg-forge-ember/10')}
            >
              {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : r.mode === 'auto' ? 'Revoke' : 'Grant auto'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
