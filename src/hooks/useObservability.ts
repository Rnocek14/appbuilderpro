// src/hooks/useObservability.ts
// Mission Control data — a read/rollup over everything Garvis already records (no new table). Answers:
// what is Garvis doing, what did it find, what did it spend, what changed today.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { sumCostWithin, countWithin, topByConfidence, sortFeed, withinDays } from '../lib/garvis/observability';
import type { FeedItem } from '../lib/garvis/observability';
import type { AgentRun, GarvisGoal, GarvisMission, GarvisOpportunity, GarvisTask } from '../types';

export interface MissionControl {
  today: { opportunities: number; missionsCompleted: number; recommendations: number; spendUsd: number };
  spend: { today: number; week: number; total: number };
  staleCount: number;
  running: number;
  topOpportunity: GarvisOpportunity | null;
  topRisk: GarvisOpportunity | null;
  topRecommendation: string | null;
  feed: FeedItem[];
}

const EMPTY: MissionControl = {
  today: { opportunities: 0, missionsCompleted: 0, recommendations: 0, spendUsd: 0 },
  spend: { today: 0, week: 0, total: 0 }, staleCount: 0, running: 0,
  topOpportunity: null, topRisk: null, topRecommendation: null, feed: [],
};

export function useObservability() {
  const { session } = useAuth();
  const [data, setData] = useState<MissionControl>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    const now = Date.now();
    try {
    const [runsRes, tasksRes, missionsRes, oppsRes, goalsRes] = await Promise.all([
      supabase.from('agent_runs').select('id, kind, title, status, recommendation, cost_usd, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('garvis_tasks').select('cost_usd, created_at').limit(500),
      supabase.from('garvis_missions').select('id, objective, status, created_at, updated_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('garvis_opportunities').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('garvis_goals').select('id, title, status, created_at').eq('status', 'active'),
    ]);

    const runs = (runsRes.data as AgentRun[]) ?? [];
    const tasks = (tasksRes.data as Pick<GarvisTask, 'cost_usd' | 'created_at'>[]) ?? [];
    const missions = (missionsRes.data as GarvisMission[]) ?? [];
    const opps = (oppsRes.data as GarvisOpportunity[]) ?? [];
    const goals = (goalsRes.data as Pick<GarvisGoal, 'id' | 'title' | 'status' | 'created_at'>[]) ?? [];

    const costRows = [...runs, ...tasks];
    const activeOpps = opps.filter((o) => o.status === 'new' || o.status === 'saved');

    // Feed: missions + opportunities + the reasoning runs.
    const feed: FeedItem[] = [
      ...missions.map((m): FeedItem => ({ id: `m-${m.id}`, ts: m.created_at, kind: 'mission', title: m.objective, detail: m.status, tone: m.status === 'failed' ? 'warn' : m.status === 'running' ? 'ember' : 'ok' })),
      ...opps.map((o): FeedItem => ({ id: `o-${o.id}`, ts: o.created_at, kind: 'opportunity', title: o.title, detail: o.type, tone: o.type === 'risk' ? 'warn' : 'ember' })),
      ...runs.filter((r) => r.kind === 'recommend' || r.kind === 'analyze' || r.kind === 'content').map((r): FeedItem => ({
        id: `r-${r.id}`, ts: r.created_at, kind: r.kind as FeedItem['kind'], title: r.recommendation || r.title, detail: r.kind, tone: 'dim',
      })),
    ];

    const latestRec = runs.find((r) => r.kind === 'recommend' && r.status === 'succeeded');

    setData({
      today: {
        opportunities: countWithin(opps as unknown as Record<string, unknown>[], 1, now),
        missionsCompleted: missions.filter((m) => (m.status === 'review' || m.status === 'done') && withinDays(m.updated_at, 1, now)).length,
        recommendations: runs.filter((r) => (r.kind === 'recommend' || r.kind === 'analyze') && withinDays(r.created_at, 1, now)).length,
        spendUsd: sumCostWithin(costRows, 1, now),
      },
      spend: { today: sumCostWithin(costRows, 1, now), week: sumCostWithin(costRows, 7, now), total: sumCostWithin(costRows, null, now) },
      staleCount: goals.filter((g) => !withinDays(g.created_at, 7, now)).length, // active goals open >7 days
      running: missions.filter((m) => m.status === 'running').length + runs.filter((r) => r.status === 'running' || r.status === 'queued').length,
      topOpportunity: topByConfidence(activeOpps),
      topRisk: topByConfidence(activeOpps.filter((o) => o.type === 'risk')),
      topRecommendation: latestRec?.recommendation ?? null,
      feed: sortFeed(feed, 24),
    });
    } catch {
      // A network-layer rejection must not strand the spinner — resolve to the honest empty state.
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`garvis-control-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_missions' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_opportunities' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, refresh]);

  return { data, loading, refresh };
}
