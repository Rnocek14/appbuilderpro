// src/hooks/useMissions.ts
// The Mission orchestrator — the Jarvis front door. planMission decomposes an objective into
// worker-typed tasks (the Planner); runMission dispatches each task to its Worker, saving the verified
// result. Bounded + sequential; the founder reviews the plan before it runs (human-in-the-loop).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { rawComplete } from '../lib/aiClient';
import { estimateCostUsd } from '../lib/garvis/directBrain';
import { buildPlannerSystem, buildPlannerUser, parsePlan } from '../lib/garvis/mission';
import { WORKERS, WORKER_KINDS, workerCatalog } from '../lib/garvis/workers';
import type { GarvisMission, GarvisTask } from '../types';

export interface PlanMissionInput { objective: string; subject: string; appId?: string | null }

export function useMissions() {
  const { session } = useAuth();
  const [missions, setMissions] = useState<GarvisMission[]>([]);
  const [tasks, setTasks] = useState<GarvisTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const [m, t] = await Promise.all([
      supabase.from('garvis_missions').select('*').order('created_at', { ascending: false }),
      supabase.from('garvis_tasks').select('*').order('seq', { ascending: true }),
    ]);
    setMissions((m.data as GarvisMission[]) ?? []);
    setTasks((t.data as GarvisTask[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`garvis-missions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_missions' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'garvis_tasks' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, refresh]);

  const tasksByMission = useMemo(() => {
    const map: Record<string, GarvisTask[]> = {};
    for (const t of tasks) (map[t.mission_id] ??= []).push(t);
    return map;
  }, [tasks]);

  /** PLAN: decompose the objective into worker-typed tasks (queued, awaiting the founder's go). */
  const planMission = useCallback(async (input: PlanMissionInput): Promise<string | null> => {
    if (!session) throw new Error('Missions require an authenticated user.');
    const { data: created, error } = await supabase
      .from('garvis_missions')
      .insert({ owner_id: session.user.id, app_id: input.appId ?? null, objective: input.objective, subject: input.subject, status: 'planning' })
      .select().single();
    if (error) throw new Error(error.message);
    const mission = created as GarvisMission;
    setBusyId(mission.id);
    try {
      const r = await rawComplete([
        { role: 'system', content: buildPlannerSystem(workerCatalog()) },
        { role: 'user', content: buildPlannerUser(input.objective, input.subject, !input.appId) },
      ], 1200);
      const plan = parsePlan(r.text, new Set(WORKER_KINDS));
      if (plan.tasks.length === 0) { await supabase.from('garvis_missions').update({ status: 'failed', summary: 'Could not produce a plan.' }).eq('id', mission.id); throw new Error('Garvis could not produce a plan for that.'); }
      await supabase.from('garvis_tasks').insert(
        plan.tasks.map((t, i) => ({ owner_id: session.user.id, mission_id: mission.id, seq: i, worker: t.worker, title: t.title, input: { brief: t.brief }, status: 'queued' })),
      );
      await supabase.from('garvis_missions').update({ status: 'planned', summary: plan.summary }).eq('id', mission.id);
      await refresh();
      return mission.id;
    } catch (e) {
      await refresh();
      throw e;
    } finally {
      setBusyId(null);
    }
  }, [session, refresh]);

  /** RUN: dispatch each queued task to its worker in order, saving the verified result. */
  const runMission = useCallback(async (missionId: string): Promise<void> => {
    if (!session) throw new Error('Missions require an authenticated user.');
    setBusyId(missionId);
    await supabase.from('garvis_missions').update({ status: 'running' }).eq('id', missionId);
    try {
      const { data } = await supabase.from('garvis_tasks').select('*').eq('mission_id', missionId).order('seq', { ascending: true });
      const mission = missions.find((m) => m.id === missionId);
      const list = (data as GarvisTask[]) ?? [];
      for (const task of list) {
        if (task.status === 'done') continue;
        await supabase.from('garvis_tasks').update({ status: 'running' }).eq('id', task.id);
        await refresh();
        try {
          const worker = WORKERS[task.worker];
          const brief = typeof task.input?.brief === 'string' ? task.input.brief : '';
          const res = await worker.run(brief, {
            ownerId: session.user.id, missionId, taskId: task.id,
            appId: mission?.app_id ?? null, subject: mission?.subject ?? task.title,
          });
          await supabase.from('garvis_tasks').update({
            status: 'done',
            result: { summary: res.summary, artifacts: res.artifacts, link: res.link ?? null },
            verify: res.verify, cost_usd: res.costUsd,
          }).eq('id', task.id);
        } catch (e) {
          await supabase.from('garvis_tasks').update({ status: 'failed', result: { summary: e instanceof Error ? e.message : 'Worker failed.', artifacts: [] } }).eq('id', task.id);
        }
        await refresh();
      }
      await supabase.from('garvis_missions').update({ status: 'review' }).eq('id', missionId);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }, [session, refresh, missions]);

  const deleteMission = async (id: string) => { await supabase.from('garvis_missions').delete().eq('id', id); await refresh(); };

  return { missions, tasksByMission, loading, busyId, refresh, planMission, runMission, deleteMission };
}
