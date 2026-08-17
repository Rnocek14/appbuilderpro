// src/lib/garvis/emailFlowsRun.ts
// Impure half of email flows (pure core: emailFlows.ts → _shared/emailFlowsCore.ts). The client
// creates/pauses flow DEFINITIONS and previews segments from the same real events the worker
// reads; all execution stays server-side on the standing tick (enroll → drip gate → one
// outreach_batch + one send_batch approval per due cohort). Flows are born paused.

import { supabase } from '../supabase';
import { computeSegment, validateFlow, type BehavioralRule, type DripStep, type SentStep } from './emailFlows';

export interface FlowRow {
  id: string; world_id: string | null; name: string;
  segment_rule: BehavioralRule; steps: DripStep[];
  status: 'paused' | 'active' | 'done'; created_at: string;
}

export interface FlowStats { members: number; replied: number; staged: number }

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Not signed in.');
  return id;
}

export async function listFlows(worldId?: string | null): Promise<FlowRow[]> {
  let q = supabase.from('email_flows')
    .select('id, world_id, name, segment_rule, steps, status, created_at')
    .order('created_at', { ascending: false }).limit(20);
  if (worldId) q = q.eq('world_id', worldId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FlowRow[];
}

export async function createFlow(input: {
  worldId?: string | null; name: string; rule: BehavioralRule; steps: DripStep[];
}): Promise<FlowRow> {
  const owner = await uid();
  validateFlow({ name: input.name, rule: input.rule, steps: input.steps });
  const { data, error } = await supabase.from('email_flows').insert({
    owner_id: owner, world_id: input.worldId ?? null, name: input.name.trim(),
    segment_rule: input.rule, steps: input.steps, status: 'paused',
  }).select('id, world_id, name, segment_rule, steps, status, created_at').single();
  if (error || !data) throw new Error(`Could not create the flow: ${error?.message ?? 'unknown error'}`);
  return data as FlowRow;
}

export async function setFlowStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const owner = await uid();
  const { error } = await supabase.from('email_flows').update({ status }).eq('id', id).eq('owner_id', owner);
  if (error) throw new Error(error.message);
}

/** Preview a rule against the operator's REAL events — the same computation the worker runs, so
 *  the count shown before activation is the count the clock will enroll. */
export async function previewSegment(rule: BehavioralRule): Promise<{ contacts: number }> {
  const sinceIso = new Date(Date.now() - Math.max(1, rule.sinceDays) * 86_400_000).toISOString();
  const { data, error } = await supabase.from('outreach_events')
    .select('contact_id, kind, created_at').gte('created_at', sinceIso).limit(5000);
  if (error) throw new Error(error.message);
  return { contacts: computeSegment(data ?? [], rule, new Date().toISOString()).contactIds.length };
}

export async function flowStats(flowId: string): Promise<FlowStats> {
  const { data, error } = await supabase.from('email_flow_members')
    .select('replied_at, steps_sent').eq('flow_id', flowId).limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { replied_at: string | null; steps_sent: SentStep[] }[];
  return {
    members: rows.length,
    replied: rows.filter((r) => r.replied_at).length,
    staged: rows.reduce((n, r) => n + (r.steps_sent?.length ?? 0), 0),
  };
}
