// src/pages/Health.tsx  (/garvis/health)
// The integrations health board — one honest place to see what's actually wired: which edge
// functions are deployed (OPTIONS probe) and which ad providers have server secrets. Things whose
// secrets live server-side (Resend/Serper/Embeddings) are shown as "checked at use" rather than
// guessed. The audit's "no health surface across ~38 functions" gap, closed honestly.

import { useEffect, useState } from 'react';
import { Loader2, Activity, Check, X, HelpCircle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { cn } from '../lib/utils';
import { loadHealth, type HealthReport, type Probe } from '../lib/garvis/healthRun';
import { ClockStatus } from '../components/garvis/ClockStatus';

const PROBE_META: Record<Probe, { icon: typeof Check; cls: string; label: string }> = {
  deployed: { icon: Check, cls: 'text-forge-ok', label: 'deployed' },
  not_deployed: { icon: X, cls: 'text-forge-warn', label: 'not deployed' },
  error: { icon: X, cls: 'text-forge-warn', label: 'unreachable' },
  unknown: { icon: HelpCircle, cls: 'text-forge-dim', label: 'unknown' },
};

export default function Health() {
  const [report, setReport] = useState<HealthReport | null>(null);
  // A failed probe must be a visible state — null is "loading", so a rejection that resets to null
  // spun forever on exactly the page meant to diagnose a broken backend.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false); setReport(null);
    void loadHealth().then((r) => { if (live) setReport(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  const groups = report ? [...new Set(report.functions.map((f) => f.group))] : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <Activity size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">System health</h1>
            <p className="text-sm text-forge-dim">What's wired right now — deployed functions and connected providers. Server secrets stay server-side; those show "checked at use".</p>
          </div>
        </div>

        {/* The clock: deployment says functions EXIST; this says the heartbeat actually TICKS. */}
        <div className="mb-5"><ClockStatus /></div>

        {!report && failed ? (
          <div className="rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-4 text-sm text-forge-warn">
            <p>The health probe itself failed — the backend may be unreachable or Supabase isn't configured.</p>
            <button onClick={() => setAttempt((a) => a + 1)} className="mt-2 rounded-lg border border-forge-warn/50 px-3 py-1.5 text-xs text-forge-warn hover:bg-forge-warn/10">Retry the probe</button>
          </div>
        ) : !report ? (
          <div className="flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Probing…</div>
        ) : (
          <div className="space-y-5">
            {!report.supabaseConfigured && (
              <div className="rounded-xl border border-forge-warn/40 bg-forge-warn/10 p-3 text-sm text-forge-warn">
                Supabase isn't configured — set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Nothing can be probed until then.
              </div>
            )}

            {groups.map((g) => (
              <div key={g} className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">{g}</h3>
                <ul className="mt-2 space-y-1">
                  {report.functions.filter((f) => f.group === g).map((f) => {
                    const m = PROBE_META[f.probe];
                    const Icon = m.icon;
                    return (
                      <li key={f.name} className="flex items-center gap-2 text-sm">
                        <Icon size={13} className={m.cls} />
                        <span className="flex-1 font-mono text-xs text-forge-ink/80">{f.name}</span>
                        <span className={cn('text-[10px] uppercase tracking-wide', m.cls)}>{m.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Migration drift: the app being up says nothing about the DB being current — a
                missing table here names the exact migration to apply. */}
            <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Database (win-clients loop tables)</h3>
              <ul className="mt-2 space-y-1">
                {report.tables.map((t) => (
                  <li key={t.name} className="flex items-center gap-2 text-sm">
                    {t.present === true ? <Check size={13} className="text-forge-ok" />
                      : t.present === false ? <X size={13} className="text-forge-warn" />
                      : <HelpCircle size={13} className="text-forge-dim" />}
                    <span className="flex-1 font-mono text-xs text-forge-ink/80">{t.name}</span>
                    <span className={cn('text-[10px]', t.present === false ? 'text-forge-warn' : 'text-forge-dim')}>
                      {t.present === false ? `missing — apply ${t.feature}` : t.feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-forge-dim">Providers</h3>
              <ul className="mt-2 space-y-1.5">
                {report.providers.map((p) => (
                  <li key={p.name} className="flex items-center gap-2 text-sm">
                    {p.configured === true ? <Check size={13} className="text-forge-ok" />
                      : p.configured === false ? <X size={13} className="text-forge-warn" />
                      : <HelpCircle size={13} className="text-forge-dim" />}
                    <span className="flex-1 text-forge-ink/80">{p.name}</span>
                    <span className="text-[10px] text-forge-dim">{p.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
