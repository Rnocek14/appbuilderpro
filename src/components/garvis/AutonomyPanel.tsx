// src/components/garvis/AutonomyPanel.tsx
// THE TRUST DIAL (app_0097). Four recurring approval classes, each with its real human-decision
// streak. Auto is OFFERED only after the streak earns it (5 clean approvals), granted only by
// the operator's click, capped per day, revoked in one click — and revocation is instant because
// the cron drafters re-read the grant on every mint. Cold pitches have no dial, ever.
//
// The words were rewritten with the rest of the app. "Earned autonomy" over four buttons all
// reading "Grant auto" told the owner nothing: four identical controls, and a heading naming a
// concept rather than the thing it decides. Each button now says what it does to the row beside
// it, and carries that row's name for anyone listening instead of looking.

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
          ? `${r.title} will run without asking you — at most ${r.dailyCap} a day, and every safety check still runs. Switch it off any time.`
          : `${r.title} will wait for you again.`);
      refresh();
    } catch (e) { onToast('error', e instanceof Error ? e.message : "That setting didn't change — try again."); }
    finally { setBusy(null); }
  };

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={14} className="text-forge-ember" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Things that can run without asking you</h3>
        <span className="text-[10px] text-forge-dim/70">Each one has to get five in a row right before it's offered. You switch it on, it stays capped per day, and switching it off takes effect immediately.</span>
      </div>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-forge-ink" title={r.what}>{r.title}</p>
              <p className="text-[10px] text-forge-dim">
                {r.mode === 'auto'
                  ? `Running on its own — ${r.autoToday} of ${r.dailyCap} today`
                  : r.eligible ? `Ready — you approved the last ${r.streak} without changing them` : `${r.streak} of 5 approved without changes`}
              </p>
            </div>
            {/* A row that has not earned it yet gets NO button. It used to get a disabled one, so
                a panel of four rows showed four dead controls reading the same thing — the state is
                already on the line above ("2 of 5 approved without changes"), which is the honest
                place for it. A control appears when there is something to press. */}
            {(r.mode === 'auto' || r.eligible) && (
              <button
                onClick={() => void flip(r)}
                disabled={busy === r.id}
                aria-label={r.mode === 'auto' ? `Stop ${r.title} running on their own` : `Let ${r.title} run without asking you`}
                className={cn('shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-40',
                  r.mode === 'auto'
                    ? 'border-forge-warn/50 text-forge-warn hover:bg-forge-warn/10'
                    : 'border-forge-ember/50 text-forge-ember hover:bg-forge-ember/10')}
              >
                {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : r.mode === 'auto' ? 'Stop this' : 'Let it run'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
