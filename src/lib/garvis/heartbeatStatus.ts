// src/lib/garvis/heartbeatStatus.ts
// Reads the clock's pulse (system_heartbeat, stamped by cron-hit workers) so the UI can say
// honestly whether "while you sleep" is real right now. Three states, no synthesis:
//   never — no stamp exists (heartbeat never armed, or the liveness migration isn't applied)
//   stale — the last stamp is old (armed once, dead now: secret mismatch, cron unscheduled, …)
//   alive — a worker ticked recently.

import { supabase } from '../supabase';

export interface ClockState {
  state: 'never' | 'stale' | 'alive';
  lastTick: string | null;   // ISO of the freshest stamp
  ageMinutes: number | null;
}

// The busiest job ticks every 15 minutes; 2 hours of silence means the clock is genuinely dead,
// not just between ticks.
const STALE_AFTER_MIN = 120;

export async function clockState(): Promise<ClockState> {
  try {
    const { data, error } = await supabase
      .from('system_heartbeat').select('last_tick_at')
      .order('last_tick_at', { ascending: false }).limit(1);
    if (error) return { state: 'never', lastTick: null, ageMinutes: null };
    const last = (data?.[0] as { last_tick_at?: string } | undefined)?.last_tick_at ?? null;
    if (!last) return { state: 'never', lastTick: null, ageMinutes: null };
    const age = Math.round((Date.now() - Date.parse(last)) / 60000);
    return { state: age > STALE_AFTER_MIN ? 'stale' : 'alive', lastTick: last, ageMinutes: age };
  } catch {
    return { state: 'never', lastTick: null, ageMinutes: null };
  }
}

/** The honest one-liner for each state. */
export function clockLine(c: ClockState): string {
  if (c.state === 'never') {
    return 'The clock has never ticked — scheduled features (watches, digests, follow-ups, invoice chases) are NOT running. Arm the heartbeat: run garvis_arm_heartbeat(<functions-url>, <secret>) in the SQL editor (see docs/RUNBOOK.md).';
  }
  if (c.state === 'stale') {
    const h = Math.round((c.ageMinutes ?? 0) / 60);
    return `The clock hasn't ticked in ~${h}h — scheduled features have stopped. Check that WORKER_SECRET matches the armed secret, and that the cron jobs are scheduled (docs/RUNBOOK.md).`;
  }
  return `Clock ticking — last tick ${c.ageMinutes ?? 0} min ago.`;
}
