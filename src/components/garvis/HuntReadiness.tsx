// src/components/garvis/HuntReadiness.tsx
// THE "READY TO HUNT & SEND" LIGHT. One glance answers "can I scrape businesses and send pitches
// right now?" — with the exact fix for anything missing, so the operator never wonders why a hunt
// produced nothing (the APP_ORIGIN silent-blocker especially). Three honest gates: find+build,
// send, and the daily auto-hunt. Read-only; it never changes anything.

import { useEffect, useState } from 'react';
import { Radar, Check, X, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchHuntReadiness } from '../../lib/garvis/huntReadinessRun';
import { readinessLine, type Readiness, type ReadinessNeed } from '../../lib/garvis/huntReadiness';

const GATE_LABEL: Record<ReadinessNeed, string> = {
  hunt: 'Find businesses + build pitchable demos',
  send: 'Email a pitch (through the approval gate)',
  auto: 'Run the daily hunt automatically',
};

export function HuntReadiness() {
  const [r, setR] = useState<Readiness | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchHuntReadiness().then((res) => { if (live) setR(res); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Could not read readiness.'); });
    return () => { live = false; };
  }, []);

  if (err) return null; // the panel is advisory; a probe failure shouldn't shout on the Health page
  if (!r) return (
    <div className="flex items-center gap-2 rounded-xl border border-forge-border bg-forge-panel/40 p-3 text-sm text-forge-dim">
      <Loader2 size={14} className="animate-spin" /> Checking hunt readiness…
    </div>
  );

  const gates: { need: ReadinessNeed; ok: boolean }[] = [
    { need: 'hunt', ok: r.canHunt },
    { need: 'send', ok: r.canSend },
    { need: 'auto', ok: r.canAutoHunt },
  ];
  const allGood = r.canHunt && r.canSend && r.canAutoHunt;

  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
      <div className="flex items-center gap-2">
        <Radar size={15} className={allGood ? 'text-forge-ok' : 'text-forge-ember'} />
        <h3 className="text-sm font-semibold text-forge-ink">Ready to hunt &amp; send</h3>
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium',
          allGood ? 'bg-forge-ok/15 text-forge-ok' : 'bg-forge-ember/15 text-forge-ember')}>
          {allGood ? 'All systems go' : 'Setup needed'}
        </span>
      </div>
      <p className="mt-1 text-xs text-forge-dim">{readinessLine(r)}</p>

      {/* The three gates, each with its color */}
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {gates.map((g) => (
          <div key={g.need} className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]',
            g.ok ? 'border-forge-ok/30 text-forge-ok' : 'border-forge-ember/30 text-forge-ember')}>
            {g.ok ? <Check size={12} /> : <X size={12} />}
            <span className="text-forge-ink">{GATE_LABEL[g.need]}</span>
          </div>
        ))}
      </div>

      {/* Only the UNMET prerequisites, each with its exact fix */}
      {r.items.some((i) => !i.ok) && (
        <ul className="mt-2 space-y-1 border-t border-forge-border pt-2">
          {r.items.filter((i) => !i.ok).map((i) => (
            <li key={i.key} className="flex items-start gap-1.5 text-[11px]">
              <X size={11} className="mt-0.5 shrink-0 text-forge-ember" />
              <span><span className="font-medium text-forge-ink">{i.label}</span> <span className="text-forge-dim">— {i.fix}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
