// src/pages/FleetView.tsx  (/garvis/fleet)
// THE FLEET — the operator control plane for many clients. Not a grid of client cards: a healthy
// client appears NOWHERE except in the one quiet counts line at the bottom. Everything listed is
// an exception with row-derived evidence, act-severity first. The rule the whole page obeys:
// normal operations must never occupy attention.

import { useState } from 'react';
import { Loader2, AlertTriangle, Eye, ChevronRight, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { cn } from '../lib/utils';
import { useFleetView } from '../hooks/useFleetView';
import type { FleetException } from '../lib/garvis/fleetView';

const KIND_LABEL: Record<string, string> = {
  breaker_paused: 'Automation paused itself',
  automation_failing: 'Automation failing',
  site_down: 'Site down',
  watch_unreachable: 'Site unconfirmed',
  cr_aging: 'Request aging',
  report_due: 'Report due',
  report_blocked: 'Report stuck',
  cost_outlier: 'Unusual cost',
  drift: 'Package drift',
  consent_missing: 'Consent missing',
};

function ExceptionRow({ e }: { e: FleetException }) {
  const [open, setOpen] = useState(false);
  const act = e.severity === 'act';
  return (
    <div className={cn('rounded-xl border bg-forge-surface/60', act ? 'border-forge-warn/40' : 'border-forge-line')}>
      <button
        className="flex w-full items-start gap-3 p-3.5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {act ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-forge-warn" />
             : <Eye size={15} className="mt-0.5 shrink-0 text-forge-dim" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-forge-ink">{e.clientName}</span>
            <span className="rounded-full border border-forge-line px-2 py-0.5 text-[11px] uppercase tracking-wide text-forge-dim">
              {KIND_LABEL[e.kind] ?? e.kind}
            </span>
          </span>
          <span className="mt-1 block text-[13.5px] leading-relaxed text-forge-dim">{e.summary}</span>
        </span>
        <ChevronRight size={14} className={cn('mt-1 shrink-0 text-forge-dim transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="border-t border-forge-line px-3.5 py-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-forge-dim">Evidence</p>
          <ul className="space-y-1">
            {e.evidence.map((ev, i) => (
              <li key={i} className="font-mono text-[12px] leading-relaxed text-forge-dim">{ev}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function FleetView() {
  const { result, loading, loadNotes, reload } = useFleetView();
  const acts = result?.exceptions.filter((e) => e.severity === 'act') ?? [];
  const watches = result?.exceptions.filter((e) => e.severity === 'watch') ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">The fleet</h1>
            <p className="mt-1 text-[13.5px] text-forge-dim">
              Only what needs judgment. Everything healthy stays quiet at the bottom.
            </p>
          </div>
          <button
            onClick={reload}
            className="flex items-center gap-1.5 rounded-lg border border-forge-line px-2.5 py-1.5 text-[12.5px] text-forge-dim hover:text-forge-ink"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-forge-dim">
            <Loader2 size={15} className="animate-spin" /> Reading the fleet…
          </div>
        )}

        {!loading && result && result.exceptions.length === 0 && (
          <div className="rounded-xl border border-forge-line bg-forge-surface/60 p-6 text-center">
            <p className="text-sm text-forge-ink">Nothing needs you.</p>
            <p className="mt-1.5 text-[13px] text-forge-dim">
              {result.hidden.length
                ? result.hidden.map((h) => `${h.count} ${h.label}`).join(' · ')
                : 'No clients on the books yet.'}
            </p>
          </div>
        )}

        {!loading && result && result.exceptions.length > 0 && (
          <div className="space-y-5">
            {acts.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[11px] uppercase tracking-wide text-forge-warn">Needs you today</h2>
                {acts.map((e, i) => <ExceptionRow key={`a${i}`} e={e} />)}
              </section>
            )}
            {watches.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[11px] uppercase tracking-wide text-forge-dim">Worth an eye</h2>
                {watches.map((e, i) => <ExceptionRow key={`w${i}`} e={e} />)}
              </section>
            )}
          </div>
        )}

        {!loading && result && result.hidden.length > 0 && result.exceptions.length > 0 && (
          <p className="mt-6 border-t border-forge-line pt-4 text-[12.5px] text-forge-dim">
            Quiet: {result.hidden.map((h) => `${h.count} ${h.label}`).join(' · ')}
          </p>
        )}

        {loadNotes.length > 0 && (
          <p className="mt-4 text-[12px] text-forge-warn">
            Partial read — {loadNotes.join('; ')}. The rest of the board is accurate.
          </p>
        )}
      </div>
    </AppShell>
  );
}
