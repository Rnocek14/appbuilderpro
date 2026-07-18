// src/components/garvis/MasterSwitch.tsx
// THE MASTER SWITCH — the audit's biggest single finding made visible and fixable in one place:
// the entire unattended layer (9 cron jobs) hangs off one garvis_arm_heartbeat() call that was
// documented only in a migration comment, plus ~16 server secrets nothing ever listed. This panel
// shows exactly which secrets are set (presence only — values never reach the browser), which of
// the 9 jobs are actually scheduled, and offers the guarded Arm button.

import { useEffect, useState } from 'react';
import { Loader2, Power, Check, X, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button, Input } from '../ui';
import { useToast } from '../../context/ToastContext';
import {
  fetchSystemStatus, armHeartbeat, defaultFunctionsBase, EXPECTED_JOBS,
  type SystemStatus,
} from '../../lib/garvis/systemControl';

export function MasterSwitch() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Arm form
  const [armOpen, setArmOpen] = useState(false);
  const [fnBase, setFnBase] = useState(defaultFunctionsBase());
  const [secret, setSecret] = useState('');
  const [arming, setArming] = useState(false);

  useEffect(() => {
    let live = true;
    setError(null); setStatus(null);
    void fetchSystemStatus()
      .then((s) => { if (live) setStatus(s); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Status probe failed.'); });
    return () => { live = false; };
  }, [attempt]);

  const scheduled = new Set((status?.cron ?? []).filter((j) => j.active).map((j) => j.jobname));
  const missing = EXPECTED_JOBS.filter((j) => !scheduled.has(j));
  const armed = status && !status.cronError && missing.length === 0;
  const pillars = status ? [...new Set(status.secrets.map((s) => s.pillar))] : [];

  const doArm = async () => {
    if (!fnBase.trim() || !secret.trim()) { toast('error', 'Both the functions URL and the worker secret are required.'); return; }
    setArming(true);
    try {
      const result = await armHeartbeat(fnBase.trim(), secret.trim());
      toast('success', result);
      setArmOpen(false); setSecret('');
      setAttempt((a) => a + 1);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Arm failed.');
    } finally {
      setArming(false);
    }
  };

  return (
    <div className="rounded-2xl border border-forge-ember/40 bg-forge-panel/40 p-4">
      <div className="flex items-center gap-2">
        <Power size={15} className={armed ? 'text-forge-ok' : 'text-forge-err'} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Master switch — the unattended layer</h3>
        {status && (
          <span className={cn('ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium',
            armed ? 'border-forge-ok/40 bg-forge-ok/10 text-forge-ok' : 'border-forge-err/40 bg-forge-err/10 text-forge-err')}>
            {armed ? 'ARMED' : status.cronError ? 'UNKNOWN' : `${missing.length} of ${EXPECTED_JOBS.length} jobs missing`}
          </span>
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3 text-xs text-forge-warn">
          <p>{error}</p>
          <button onClick={() => setAttempt((a) => a + 1)} className="mt-2 rounded-lg border border-forge-warn/50 px-2.5 py-1 text-[11px] hover:bg-forge-warn/10">Retry</button>
        </div>
      ) : !status ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-forge-dim"><Loader2 size={13} className="animate-spin" /> Checking the switch…</p>
      ) : (
        <div className="mt-3 space-y-4">
          {/* Cron jobs: exists-and-active vs missing, against the 9 the arm call creates. */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-forge-dim">Scheduled jobs {status.cronError && <span className="text-forge-warn">({status.cronError})</span>}</p>
            <ul className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {EXPECTED_JOBS.map((j) => (
                <li key={j} className="flex items-center gap-2 text-xs">
                  {scheduled.has(j) ? <Check size={12} className="shrink-0 text-forge-ok" /> : <X size={12} className="shrink-0 text-forge-err" />}
                  <span className="truncate font-mono text-[11px] text-forge-ink/80">{j}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Secrets by pillar — presence booleans from the server, never values. */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-forge-dim">Server secrets (what each unlocks)</p>
            <div className="mt-1.5 space-y-2">
              {pillars.map((p) => (
                <div key={p}>
                  <p className="text-[10px] font-medium capitalize text-forge-ember/80">{p}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {status.secrets.filter((s) => s.pillar === p).map((s) => (
                      <li key={s.name} className="flex items-center gap-2 text-xs">
                        {s.set ? <Check size={12} className="shrink-0 text-forge-ok" /> : <X size={12} className="shrink-0 text-forge-err" />}
                        <span className="font-mono text-[11px] text-forge-ink/80">{s.name}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-forge-dim">{s.unlocks}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* The guarded arm. Idempotent server-side — re-arming updates URL/secret. */}
          {armOpen ? (
            <div className="rounded-xl border border-forge-border bg-forge-raised/40 p-3">
              <p className="text-xs text-forge-dim">
                Arming stores the URL + secret in Vault and schedules all {EXPECTED_JOBS.length} jobs. The secret must equal the
                <span className="font-mono"> WORKER_SECRET</span> set on your edge functions. Safe to re-run.
              </p>
              <div className="mt-2 space-y-2">
                <Input value={fnBase} onChange={(e) => setFnBase(e.target.value)} placeholder="https://<ref>.supabase.co/functions/v1" aria-label="Functions base URL" className="font-mono text-xs" />
                <Input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder="WORKER_SECRET value" aria-label="Worker secret" className="font-mono text-xs" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={doArm} loading={arming}><Zap size={13} /> Arm the heartbeat</Button>
                  <Button size="sm" variant="ghost" onClick={() => setArmOpen(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          ) : (
            <Button size="sm" variant={armed ? 'outline' : 'primary'} onClick={() => setArmOpen(true)}>
              <Zap size={13} /> {armed ? 'Re-arm (rotate URL/secret)' : 'Arm the heartbeat'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
