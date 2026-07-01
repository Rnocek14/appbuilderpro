// src/hooks/useLiveness.ts
// Garvis liveness checks: ping each app's deploy_url from the browser and record whether it was
// reachable, as an append-only time series. CORS-blind (no-cors), so a resolved fetch means "the host
// responded with something" — a coarse but real, automatic outcome signal. Mirrors usePortfolio's shape.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { latestByApp } from '../lib/garvis/liveness';
import type { AppLiveness, PortfolioApp } from '../types';

export interface LivenessCheckResult { checked: number; reachable: number }
export interface CheckOpts { onProgress?: (done: number, total: number, name: string) => void }

interface PingResult { reachable: boolean; status: string; latencyMs: number | null }

/** Best-effort reachability ping. no-cors: resolves on any host response, throws on network failure. */
async function pingDeployUrl(url: string, timeoutMs = 8000): Promise<PingResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    await fetch(url, { mode: 'no-cors', signal: ctrl.signal, redirect: 'follow' });
    return { reachable: true, status: 'reachable', latencyMs: Date.now() - start };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { reachable: false, status: aborted ? 'timeout' : 'unreachable', latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}

export function useLiveness() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AppLiveness[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    // Recent checks only — enough to derive the latest-per-app and a short trend.
    const { data } = await supabase
      .from('app_liveness')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(300);
    setRows((data as AppLiveness[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`garvis-liveness-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_liveness' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  const latestByAppId = useMemo(() => latestByApp(rows), [rows]);

  /** Ping every app that has a deploy_url and record a row each. Sequential, with progress. */
  const checkAll = useCallback(async (apps: PortfolioApp[], opts: CheckOpts = {}): Promise<LivenessCheckResult> => {
    if (!session) return { checked: 0, reachable: 0 };
    const targets = apps.filter((a) => a.deploy_url);
    if (targets.length === 0) return { checked: 0, reachable: 0 };
    setChecking(true);
    let reachable = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const app = targets[i];
        opts.onProgress?.(i + 1, targets.length, app.name);
        const r = await pingDeployUrl(app.deploy_url!);
        if (r.reachable) reachable++;
        await supabase.from('app_liveness').insert({
          owner_id: session.user.id,
          app_id: app.id,
          reachable: r.reachable,
          status: r.status,
          latency_ms: r.latencyMs,
          source: 'browser',
        });
      }
      await refresh();
      return { checked: targets.length, reachable };
    } finally {
      setChecking(false);
    }
  }, [session, refresh]);

  return { rows, latestByAppId, loading, checking, refresh, checkAll };
}
