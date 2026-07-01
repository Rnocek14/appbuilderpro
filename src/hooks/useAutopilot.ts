// src/hooks/useAutopilot.ts
// Hooks for the background job queue and the approval inbox.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Job, JobMilestone, AgentQuestion } from '../types';

/** Nudge the worker. Cheap and idempotent — it exits instantly when idle. */
export async function tickWorker(): Promise<void> {
  try { await supabase.functions.invoke('job-worker', { body: { source: 'app' } }); } catch { /* worker may not be deployed yet */ }
}

export function useJobs() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
    setJobs((data as Job[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`jobs-feed-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  const createJob = async (input: { project_id: string; title: string; brief: string; budget_usd: number; priority?: number }) => {
    const { data, error } = await supabase
      .from('jobs')
      .insert({ ...input, owner_id: session!.user.id })
      .select().single();
    if (error) throw new Error(error.message);
    await supabase.from('audit_logs').insert({
      actor_id: session!.user.id, action: 'job.create', entity_type: 'job', entity_id: data.id,
    });
    tickWorker(); // fire and forget — gets the queue moving immediately
    return data as Job;
  };

  const setStatus = async (id: string, status: Job['status']) => {
    await supabase.from('jobs').update({ status, pause_reason: null, lease_until: null }).eq('id', id);
    if (status === 'queued') tickWorker();
    await refresh();
  };

  return { jobs, loading, refresh, createJob, setStatus };
}

export function useMilestones(jobId: string | null) {
  const [milestones, setMilestones] = useState<JobMilestone[]>([]);

  const refresh = useCallback(async () => {
    if (!jobId) { setMilestones([]); return; }
    const { data } = await supabase.from('job_milestones').select('*').eq('job_id', jobId).order('position');
    setMilestones((data as JobMilestone[]) ?? []);
  }, [jobId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`milestones-${jobId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_milestones', filter: `job_id=eq.${jobId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId, refresh]);

  return milestones;
}

export function useInbox() {
  const { session } = useAuth();
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('agent_questions').select('*')
      .order('created_at', { ascending: false }).limit(100);
    setQuestions((data as AgentQuestion[]) ?? []);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`inbox-feed-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_questions' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  const answer = async (id: string, text: string) => {
    await supabase.from('agent_questions').update({ answer: text, status: 'answered' }).eq('id', id);
    tickWorker(); // requeue trigger may have flipped the job back to queued
    await refresh();
  };

  const skip = async (id: string) => {
    await supabase.from('agent_questions').update({ status: 'skipped' }).eq('id', id);
    tickWorker();
    await refresh();
  };

  const pendingCount = questions.filter((q) => q.status === 'pending').length;
  return { questions, pendingCount, loading, answer, skip };
}
