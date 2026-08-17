// src/lib/serverResumeRun.ts
// Enqueue a SERVER-SIDE generation resume (SW10.5): a jobs row of kind 'generation_resume' that
// the job-worker drains without a browser tab — re-deriving the missing-page manifest from the
// saved App.tsx (the one shared rule) on every step. Used by the stalled-build watchdog (SW10.6)
// server-side and available to the workspace as a manual kick. The kick ping is fire-and-forget:
// the worker's cron tick drains the queue even if the ping is lost.

import { supabase } from './supabase';

export async function enqueueServerResume(input: {
  projectId: string;
  generationId?: string | null;   // continue THIS stalled generation record (else a fresh one opens)
}): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  // One live resume per project — a second enqueue while one is queued/running would double-generate.
  const { data: existing } = await supabase.from('jobs')
    .select('id').eq('project_id', input.projectId).eq('kind', 'generation_resume')
    .in('status', ['queued', 'running']).limit(1);
  if (existing?.length) return (existing[0] as { id: string }).id;

  const { data, error } = await supabase.from('jobs').insert({
    owner_id: uid, project_id: input.projectId,
    kind: 'generation_resume', phase: 'resume',
    title: 'Resume interrupted build',
    brief: 'Server-side resume: derive missing pages from the saved App.tsx and recover them.',
    payload: input.generationId ? { generation_id: input.generationId } : {},
  }).select('id').single();
  if (error || !data) throw new Error(`Could not queue the resume: ${error?.message ?? 'unknown error'}`);

  // Nudge the worker now; the cron tick is the guarantee.
  void supabase.functions.invoke('job-worker', { body: {} }).catch(() => {});
  return (data as { id: string }).id;
}
