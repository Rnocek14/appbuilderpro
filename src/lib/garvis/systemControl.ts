// src/lib/garvis/systemControl.ts
// Client for the system-control edge function — the master-switch panel's data source. Reports
// which server secrets are set (presence only), which garvis cron jobs are scheduled, and the
// latest heartbeat stamps; and performs the one-time ARM call that turns the unattended layer on.

import { supabase } from '../supabase';

export interface SecretStatus { name: string; pillar: string; unlocks: string; set: boolean }
export interface CronJob { jobname: string; schedule: string; active: boolean }
export interface HeartbeatStamp { worker?: string; job?: string; last_tick_at?: string; [k: string]: unknown }

export interface SystemStatus {
  secrets: SecretStatus[];
  cron: CronJob[];
  cronError: string | null;
  heartbeat: HeartbeatStamp[];
}

/** The jobs garvis_arm_heartbeat schedules (app_0096) — the panel shows scheduled-vs-missing against this. */
export const EXPECTED_JOBS = [
  'garvis-pulse-hourly', 'garvis-worker-tick', 'garvis-standing-tick', 'garvis-followups-daily',
  'garvis-inbox-draft-daily', 'garvis-ads-watch-daily', 'garvis-invoice-chase-daily',
  'garvis-scorecard-weekly', 'garvis-reactivate-monthly', 'garvis-consolidate-weekly',
  'garvis-social-sync', 'garvis-canary-nightly',
] as const;

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const { data, error } = await supabase.functions.invoke('system-control', { body: { action: 'status' } });
  if (error) throw new Error('system-control is not deployed — run: supabase functions deploy system-control');
  if (data?.error) throw new Error(data.error);
  return data as SystemStatus;
}

export async function armHeartbeat(functionsBase: string, workerSecret: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('system-control', {
    body: { action: 'arm', functionsBase, workerSecret },
  });
  if (error) throw new Error('system-control is not deployed — run: supabase functions deploy system-control');
  if (data?.error) throw new Error(data.error);
  return String(data?.result ?? 'armed');
}

export interface PlacesProbe { ok: boolean; status?: number; reason: string }

/** Live-test the Google Places key with a real (tiny) call — catches an invalid/over-quota key that
 *  presence-only checks read as green. */
export async function probePlacesKey(): Promise<PlacesProbe> {
  try {
    const { data, error } = await supabase.functions.invoke('system-control', { body: { action: 'probe_places' } });
    if (error || !data) return { ok: false, reason: 'Could not run the probe — is system-control deployed?' };
    return data as PlacesProbe;
  } catch {
    return { ok: false, reason: 'Could not run the probe — is system-control deployed?' };
  }
}

/** Default functions base for this project — prefills the arm form. */
export function defaultFunctionsBase(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return url ? `${url.replace(/\/$/, '')}/functions/v1` : '';
}
