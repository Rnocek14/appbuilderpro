// src/hooks/useMissions.ts
// The Mission orchestrator — the Jarvis front door. planMission decomposes an objective into
// worker-typed tasks (the Planner); runMission dispatches each task to its Worker, saving the verified
// result. Bounded + sequential; the founder reviews the plan before it runs (human-in-the-loop).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { rawComplete } from '../lib/aiClient';
import { estimateCostUsd } from '../lib/garvis/directBrain';
import { buildPlannerSystem, buildPlannerUser, parsePlan } from '../lib/garvis/mission';
import { WORKERS, WORKER_KINDS, workerCatalog } from '../lib/garvis/workers';
import { buildVerifiedHandoff, deriveMissionStatus } from '../lib/garvis/missionRun';
import type { GarvisMission, GarvisTask, TaskResultData } from '../types';

export interface PlanMissionInput { objective: string; subject: string; appId?: string | null }

export function useMissions() {
  const { session } = useAuth();
  const [missions, setMissions] = useState<GarvisMission[]>([]);
  const [tasks, setTasks] = useState<GarvisTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const cancelled = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [m, t] = await Promise.all([
        supabase.from('garvis_missions').select('*').order('created_at', { ascending: false }),
        supabase.from('garvis_tasks').select('*').order('seq', { ascending: true }),
      ]);
      setMissions((m.data as GarvisMission[]) ?? []);
      setTasks((t.data as GarvisTask[]) ?? []);
    } finally {
      setLoading(false); // a failed load must never leave an eternal spinner
    }
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
      const { error: tasksError } = await supabase.from('garvis_tasks').insert(
        plan.tasks.map((t, i) => ({ owner_id: session.user.id, mission_id: mission.id, seq: i, worker: t.worker, title: t.title, input: { brief: t.brief }, status: 'queued' })),
      );
      if (tasksError) throw new Error(tasksError.message);
      const { error: planSaveError } = await supabase.from('garvis_missions').update({ status: 'planned', summary: plan.summary }).eq('id', mission.id);
      if (planSaveError) throw new Error(planSaveError.message);
      await refresh();
      return mission.id;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Mission planning failed.';
      await supabase.from('garvis_missions').update({
        status: 'failed', summary: `Planning failed: ${message.slice(0, 300)}`,
      }).eq('id', mission.id).then(() => {}, () => {});
      await refresh();
      throw e;
    } finally {
      setBusyId(null);
    }
  }, [session, refresh]);

  /** RUN: dispatch each queued task to its worker in order, saving the verified result. */
  const runMission = useCallback(async (missionId: string): Promise<void> => {
    if (!session) throw new Error('Missions require an authenticated user.');
    cancelled.current.delete(missionId);
    setBusyId(missionId);
    const { error: startError } = await supabase.from('garvis_missions').update({ status: 'running' }).eq('id', missionId);
    if (startError) { setBusyId(null); throw new Error(startError.message); }
    try {
      // Execution context comes from the database, never a possibly-stale React closure. Commander
      // can plan and auto-run in one turn without losing the new mission's app/subject.
      const [missionQ, tasksQ] = await Promise.all([
        supabase.from('garvis_missions').select('*').eq('id', missionId).single(),
        supabase.from('garvis_tasks').select('*').eq('mission_id', missionId).order('seq', { ascending: true }),
      ]);
      if (missionQ.error || !missionQ.data) throw new Error(missionQ.error?.message ?? 'Mission not found.');
      if (tasksQ.error) throw new Error(tasksQ.error.message);
      const mission = missionQ.data as GarvisMission;
      const list = ((tasksQ.data as GarvisTask[]) ?? []).map((t) => ({ ...t }));
      for (const task of list) {
        if (task.status === 'done') continue;
        if (cancelled.current.has(missionId)) break;
        const { error: taskStartError } = await supabase.from('garvis_tasks').update({ status: 'running' }).eq('id', task.id);
        if (taskStartError) throw new Error(taskStartError.message);
        task.status = 'running';
        await refresh();
        try {
          const worker = WORKERS[task.worker];
          const brief = typeof task.input?.brief === 'string' ? task.input.brief : '';
          const handoff = buildVerifiedHandoff(list, task.seq);
          const res = await worker.run([brief, handoff].filter(Boolean).join('\n\n'), {
            ownerId: session.user.id, missionId, taskId: task.id,
            appId: mission.app_id ?? null, subject: mission.subject ?? task.title,
          });
          const result: TaskResultData = { summary: res.summary, artifacts: res.artifacts, link: res.link ?? null };
          const status: GarvisTask['status'] = res.verify.ok ? 'done' : 'failed';
          const { error: saveError } = await supabase.from('garvis_tasks').update({
            status,
            result,
            verify: res.verify, cost_usd: res.costUsd,
          }).eq('id', task.id);
          if (saveError) throw new Error(saveError.message);
          task.status = status; task.result = result; task.verify = res.verify; task.cost_usd = res.costUsd;
        } catch (e) {
          const result: TaskResultData = { summary: e instanceof Error ? e.message : 'Worker failed.', artifacts: [] };
          const { error: failSaveError } = await supabase.from('garvis_tasks').update({ status: 'failed', result }).eq('id', task.id);
          if (failSaveError) throw new Error(failSaveError.message);
          task.status = 'failed'; task.result = result;
        }
        await refresh();
      }

      const wasCancelled = cancelled.current.has(missionId);
      if (wasCancelled) {
        const remaining = list.filter((t) => t.status === 'queued' || t.status === 'running').map((t) => t.id);
        if (remaining.length) {
          const { error } = await supabase.from('garvis_tasks').update({ status: 'skipped' }).in('id', remaining);
          if (error) throw new Error(error.message);
          for (const t of list) if (remaining.includes(t.id)) t.status = 'skipped';
        }
      }
      const finalStatus = deriveMissionStatus(list, wasCancelled);
      const { error: finalError } = await supabase.from('garvis_missions').update({ status: finalStatus }).eq('id', missionId);
      if (finalError) throw new Error(finalError.message);
      await refresh();
    } catch (e) {
      if (!cancelled.current.has(missionId)) {
        await supabase.from('garvis_missions').update({ status: 'failed' }).eq('id', missionId).then(() => {}, () => {});
      }
      await refresh();
      throw e;
    } finally {
      cancelled.current.delete(missionId);
      setBusyId(null);
    }
  }, [session, refresh]);

  /** Stop after the in-flight model call; no later task is dispatched. */
  const cancelMission = useCallback(async (missionId: string): Promise<void> => {
    cancelled.current.add(missionId);
    const { error } = await supabase.from('garvis_missions').update({ status: 'cancelled' }).eq('id', missionId);
    if (error) throw new Error(error.message);
    await refresh();
  }, [refresh]);

  const deleteMission = async (id: string) => { await supabase.from('garvis_missions').delete().eq('id', id); await refresh(); };

  return { missions, tasksByMission, loading, busyId, refresh, planMission, runMission, cancelMission, deleteMission };
}
