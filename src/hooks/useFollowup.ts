// src/hooks/useFollowup.ts
// Computes Garvis's open loops — the follow-through surface. Each active goal is a commitment; for
// each, we gather an observed progress signal (commits to the app's repo since the goal opened +
// latest liveness) and decide whether it's stale. No new table: derived from active goals + apps +
// app_liveness + live GitHub reads. Mirrors the other garvis hooks (refresh + realtime).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { countCommitsSince, getGitHubToken } from '../lib/garvis/github';
import { classifyLiveness, latestByApp } from '../lib/garvis/liveness';
import { daysSince, isLoopStale } from '../lib/garvis/followup';
import type { OpenLoop } from '../lib/garvis/followup';
import type { AppLiveness, GarvisGoal, PortfolioApp } from '../types';

export function useFollowup() {
  const { session } = useAuth();
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    const [goalsRes, appsRes, liveRes] = await Promise.all([
      supabase.from('garvis_goals').select('*').eq('status', 'active').order('priority', { ascending: true }),
      supabase.from('apps').select('id, name, repo_url, deploy_url').is('deleted_at', null),
      supabase.from('app_liveness').select('*').order('checked_at', { ascending: false }).limit(300),
    ]);

    const goals = (goalsRes.data as GarvisGoal[]) ?? [];
    const apps = (appsRes.data as Pick<PortfolioApp, 'id' | 'name' | 'repo_url' | 'deploy_url'>[]) ?? [];
    const appById = new Map(apps.map((a) => [a.id, a]));
    const latest = latestByApp((liveRes.data as AppLiveness[]) ?? []);
    const token = getGitHubToken();

    const built: OpenLoop[] = await Promise.all(
      goals.map(async (g) => {
        const app = g.app_id ? appById.get(g.app_id) : undefined;
        let signal: OpenLoop['signal'] = null;
        if (app) {
          const commitsSince = app.repo_url ? await countCommitsSince(app.repo_url, g.created_at, token) : null;
          signal = { commitsSince, liveness: classifyLiveness(app.deploy_url, latest[app.id]) };
        }
        const ageDays = daysSince(g.created_at);
        return {
          goalId: g.id,
          title: g.title,
          appId: g.app_id,
          appName: app?.name ?? null,
          priority: g.priority,
          ageDays,
          targetDate: g.target_date,
          signal,
          stale: isLoopStale(ageDays, signal),
        };
      }),
    );

    // Stale, highest-priority commitments first — the ones that most need a check-in.
    built.sort((a, b) => Number(b.stale) - Number(a.stale) || a.priority - b.priority);
    setLoops(built);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`garvis-followup-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_goals' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  return { loops, loading, refresh };
}
