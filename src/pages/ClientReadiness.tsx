// src/pages/ClientReadiness.tsx  (/garvis/setup)
// THE OPERATOR CONSOLE — your home base for running the business FOR your client. One glanceable
// answer to "is everything set up to operate?", with each step's honest status and a link straight
// to the fix. State comes from real data (readinessRun); nothing is shown green it can't prove.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, KeyRound, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Skeleton } from '../components/ui';
import { computeReadiness, GROUP_LABEL, type Readiness, type ReadinessStep, type StepGroup } from '../lib/garvis/readiness';
import { loadReadiness } from '../lib/garvis/readinessRun';
import { cn } from '../lib/utils';

const STATUS_STYLE: Record<ReadinessStep['status'], { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'text-forge-ok border-forge-ok/50' },
  todo: { label: 'To do', cls: 'text-forge-warn border-forge-warn/50' },
  needs_account: { label: 'Needs an account', cls: 'text-forge-cyan border-forge-cyan/50' },
  optional_todo: { label: 'Optional', cls: 'text-forge-dim border-forge-border' },
  optional_done: { label: 'Done', cls: 'text-forge-ok border-forge-ok/50' },
};

export default function ClientReadiness() {
  const navigate = useNavigate();
  const [r, setR] = useState<Readiness | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setFailed(false); setBusy(true);
      setR(computeReadiness(await loadReadiness()));
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const groups: StepGroup[] = ['core', 'channel', 'optional'];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <KeyRound size={20} className="text-forge-ember" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-forge-ink">Setup console</h1>
            <p className="text-sm text-forge-dim">Everything needed to run her business, in one place. You operate — it all goes out as her.</p>
          </div>
          <button onClick={() => void refresh()} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim hover:text-forge-ink disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Recheck
          </button>
        </div>

        {r === null && !failed ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : failed ? (
          <div className="rounded-xl border border-forge-err/30 bg-forge-err/10 p-4 text-sm text-forge-err">
            Couldn't read your setup state — a connection problem, not a blank account.{' '}
            <button onClick={() => void refresh()} className="underline">Retry</button>
          </div>
        ) : r && (
          <>
            {/* Headline summary */}
            <div className={cn('rounded-xl border p-5', r.coreReady ? 'border-forge-ok/40 bg-forge-ok/5' : 'border-forge-ember/40 bg-forge-ember/5')}>
              <div className="flex items-center gap-3">
                <div className="text-2xl font-semibold text-forge-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {r.coreDone}<span className="text-forge-dim">/{r.coreTotal}</span>
                </div>
                <div>
                  <div className={cn('text-sm font-semibold', r.coreReady ? 'text-forge-ok' : 'text-forge-ember')}>{r.headline}</div>
                  <div className="text-[11px] text-forge-dim">Essentials are what must be true to operate; channels and optional light up as you connect accounts.</div>
                </div>
              </div>
            </div>

            {/* Steps by group */}
            <div className="mt-5 space-y-6">
              {groups.map((g) => {
                const steps = r.steps.filter((s) => s.group === g);
                if (steps.length === 0) return null;
                return (
                  <div key={g}>
                    <h2 className="mb-2 text-[11px] uppercase tracking-wide text-forge-dim">{GROUP_LABEL[g]}</h2>
                    <div className="space-y-2">
                      {steps.map((s) => {
                        const done = s.status === 'done' || s.status === 'optional_done';
                        const st = STATUS_STYLE[s.status];
                        return (
                          <div key={s.id} className="flex items-start gap-3 rounded-xl border border-forge-border bg-forge-panel/50 p-3.5">
                            <div className={cn('mt-0.5 shrink-0', done ? 'text-forge-ok' : 'text-forge-dim')}>
                              {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-forge-ink">{s.title}</span>
                                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', st.cls)}>{st.label}</span>
                              </div>
                              <p className="mt-1 text-[13px] text-forge-dim">{s.detail}</p>
                            </div>
                            {!done && (
                              <button onClick={() => navigate(s.href)}
                                className="mt-0.5 flex shrink-0 items-center gap-1 self-start rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-ink hover:border-forge-ember/50">
                                {s.action} <ArrowRight size={11} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 text-[11px] text-forge-dim">
              Operating as her: set her domain + from-address and her business's physical address in Outreach, and put
              her brokerage/license compliance line in the brand — every send then carries her identity and disclosure
              automatically. Full setup reference: <code className="text-forge-ember">docs/RUNBOOK.md</code>.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
