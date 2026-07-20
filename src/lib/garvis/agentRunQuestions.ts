// Clarification inbox for the general Garvis runtime. Consequence approvals live in `approvals`;
// these are questions the model must have answered before it can continue the SAME checkpoint.

import { supabase } from '../supabase';
import type { AgentRun, GarvisCheckpoint } from '../../types';

export interface AgentRunQuestion {
  id: string;
  title: string;
  question: string;
  options: string[];
  createdAt: string;
}

export async function listAgentRunQuestions(): Promise<AgentRunQuestion[]> {
  const { data, error } = await supabase.from('agent_runs')
    .select('id, title, output, checkpoint, created_at')
    .eq('status', 'waiting_approval')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as Pick<AgentRun, 'id' | 'title' | 'output' | 'checkpoint' | 'created_at'>;
    const pending = (r.checkpoint as GarvisCheckpoint | null)?.pendingQuestion;
    return {
      id: r.id,
      title: r.title,
      question: pending?.question || r.output || 'Garvis needs a decision before it can continue.',
      options: pending?.options ?? [],
      createdAt: r.created_at,
    };
  });
}

export async function answerAgentRunQuestion(runId: string, answer: string): Promise<void> {
  const clean = answer.trim();
  if (!clean) throw new Error('An answer is required.');
  const { data, error } = await supabase.rpc('resume_agent_run', { p_run_id: runId, p_answer: clean });
  if (error) throw new Error(error.message);
  const resumed = (data as AgentRun[] | null) ?? [];
  if (!resumed.length) throw new Error('This question was already answered or the run is no longer waiting.');

  // The state transition is already durable. Nudge the exact owner-scoped run; cron remains the
  // fallback if this request is interrupted after the browser leaves the page.
  void supabase.functions.invoke('garvis-worker', { body: { run_id: runId } }).catch(() => {});
}
