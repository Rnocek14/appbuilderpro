// src/lib/garvis/connectionsRun.ts
// Client side of the ad-platform connections: read honest status (server env + per-user config),
// save the NON-secret account ids, trigger read-only syncs. Secrets never touch this file —
// they live in edge env (supabase secrets), per current platform best practice (system-user
// token for Meta, OAuth refresh + developer token for Google, reporting access first).

import { supabase } from '../supabase';

export type AdProvider = 'meta_ads' | 'google_ads';

export interface ConnectionState {
  provider: AdProvider;
  label: string;
  serverConfigured: boolean;        // the edge function holds the secrets
  accountId: string;                // the user's non-secret id (act_… / customer id)
  status: 'unconfigured' | 'ready' | 'error';
  lastSyncedAt: string | null;
  lastError: string | null;
  setup: string[];                  // the exact registration steps, from the server
}

const LABELS: Record<AdProvider, string> = { meta_ads: 'Meta ads', google_ads: 'Google ads' };

export async function listConnections(): Promise<ConnectionState[]> {
  const [{ data: statusData }, { data: rows }] = await Promise.all([
    supabase.functions.invoke('ads-sync', { body: { mode: 'status' } }).then((r) => ({ data: r.data as { providers?: Record<string, { serverConfigured: boolean; setup: string[] }> } | null })).catch(() => ({ data: null })),
    supabase.from('connections').select('provider, config, status, last_synced_at, last_error'),
  ]);
  const providers = statusData?.providers ?? {};
  const byProvider = new Map((rows ?? []).map((r) => [(r as { provider: string }).provider, r as { provider: string; config: Record<string, string> | null; status: string; last_synced_at: string | null; last_error: string | null }]));
  return (['meta_ads', 'google_ads'] as AdProvider[]).map((p) => {
    const row = byProvider.get(p);
    const cfg = row?.config ?? {};
    return {
      provider: p,
      label: LABELS[p],
      serverConfigured: providers[p]?.serverConfigured ?? false,
      accountId: String(cfg.ad_account_id ?? cfg.customer_id ?? ''),
      status: (row?.status as ConnectionState['status']) ?? 'unconfigured',
      lastSyncedAt: row?.last_synced_at ?? null,
      lastError: row?.last_error ?? null,
      setup: providers[p]?.setup ?? [],
    };
  });
}

export async function saveConnectionAccount(provider: AdProvider, accountId: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const key = provider === 'meta_ads' ? 'ad_account_id' : 'customer_id';
  const { error } = await supabase.from('connections').upsert({
    owner_id: uid, provider, config: { [key]: accountId.trim() },
  }, { onConflict: 'owner_id,provider' });
  if (error) throw new Error(error.message);
}

export interface SyncOutcome { ok: boolean; message: string }

export async function syncProvider(provider: AdProvider, worldId: string): Promise<SyncOutcome> {
  const { data, error } = await supabase.functions.invoke('ads-sync', {
    body: { mode: 'sync', provider, world_id: worldId },
  });
  if (error) throw new Error(error.message);
  const r = data as { available?: boolean; ok?: boolean; needsConfig?: boolean; rows?: number; spendUsd?: number; error?: string; setup?: string[]; message?: string };
  if (r?.available === false) return { ok: false, message: 'Not connected on the server yet — follow the setup steps shown on the card.' };
  if (r?.needsConfig) return { ok: false, message: r.message ?? 'Enter your account id first.' };
  if (r?.ok === false) return { ok: false, message: `The platform refused: ${r.error ?? 'unknown error'}` };
  return { ok: true, message: `Synced ${r?.rows ?? 0} daily campaign rows — $${r?.spendUsd ?? 0} platform-reported spend over ${30} days.` };
}
