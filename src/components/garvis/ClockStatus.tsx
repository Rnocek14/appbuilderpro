// src/components/garvis/ClockStatus.tsx
// The clock's honest face. The readiness audit's worst finding: an unarmed heartbeat kills every
// scheduled feature SILENTLY. This banner reads the workers' real stamps (system_heartbeat) and
// says plainly: never armed / stopped since X / ticking. With `quiet`, a healthy clock renders
// nothing — the banner only speaks when something is wrong.

import { useEffect, useState } from 'react';
import { AlarmClockOff, AlarmClockCheck } from 'lucide-react';
import { clockState, clockLine, type ClockState } from '../../lib/garvis/heartbeatStatus';

export function ClockStatus({ quiet = false }: { quiet?: boolean }) {
  const [c, setC] = useState<ClockState | null>(null);

  useEffect(() => {
    let live = true;
    void clockState().then((r) => { if (live) setC(r); });
    return () => { live = false; };
  }, []);

  if (!c) return null;                       // still loading — say nothing rather than guess
  if (quiet && c.state === 'alive') return null;

  if (c.state === 'alive') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-forge-dim/70">
        <AlarmClockCheck size={12} className="text-forge-ok" /> {clockLine(c)}
      </p>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
      <AlarmClockOff size={14} className="mt-0.5 shrink-0" />
      <span>{clockLine(c)}</span>
    </div>
  );
}
