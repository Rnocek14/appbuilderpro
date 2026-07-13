// supabase/functions/_shared/heartbeat.ts
// Stamp a cron job's liveness so the UI can say honestly whether the clock is ticking. The
// readiness audit's worst finding: an unarmed heartbeat kills every scheduled feature SILENTLY —
// cron 401s go to pg_net and nobody. Cron-hit functions call this once per real tick.
// Fire-and-forget by contract: a stamping failure must never affect the job's actual work.

// deno-lint-ignore no-explicit-any
export async function stampHeartbeat(admin: any, job: string): Promise<void> {
  try {
    await admin.from('system_heartbeat').upsert({ job, last_tick_at: new Date().toISOString() }, { onConflict: 'job' });
  } catch { /* never throw — liveness reporting must not break the work */ }
}
