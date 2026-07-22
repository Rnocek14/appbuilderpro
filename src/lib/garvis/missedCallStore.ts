// src/lib/garvis/missedCallStore.ts
// Client data-access for missed-call text-back (app_0107). Owner-scoped reads/writes over
// missed_call_configs + missed_call_events; RLS enforces ownership (events are read-only from the
// client — only the service-role webhook writes them). Best-effort reads return [] so the UI degrades
// to empty (e.g. before the migration is applied) rather than erroring.

import { supabase } from '../supabase';
import { DEFAULT_MISSED_CALL_TEMPLATE } from './missedCall';

export { DEFAULT_MISSED_CALL_TEMPLATE };

export interface MissedCallConfig {
  id: string; label: string | null; twilio_number: string; forward_to: string;
  template: string; business_name: string | null; ring_seconds: number; enabled: boolean; created_at: string;
}
export interface MissedCallEvent {
  id: string; from_number: string | null; to_number: string | null; dial_status: string | null;
  texted_back: boolean; note: string | null; created_at: string;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listMissedCallConfigs(): Promise<MissedCallConfig[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('missed_call_configs')
    .select('id,label,twilio_number,forward_to,template,business_name,ring_seconds,enabled,created_at')
    .eq('owner_id', u).order('created_at', { ascending: false });
  return (data ?? []) as MissedCallConfig[];
}

export interface NewMissedCallConfig {
  label?: string | null; twilio_number: string; forward_to: string;
  template?: string; business_name?: string | null; ring_seconds?: number; enabled?: boolean;
}

export async function createMissedCallConfig(input: NewMissedCallConfig): Promise<MissedCallConfig> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('missed_call_configs').insert({
    owner_id: u,
    label: input.label?.trim() || null,
    twilio_number: input.twilio_number.trim(),
    forward_to: input.forward_to.trim(),
    template: (input.template ?? DEFAULT_MISSED_CALL_TEMPLATE).trim() || DEFAULT_MISSED_CALL_TEMPLATE,
    business_name: input.business_name?.trim() || null,
    ring_seconds: input.ring_seconds ?? 20,
    enabled: input.enabled ?? false,
  }).select('id,label,twilio_number,forward_to,template,business_name,ring_seconds,enabled,created_at').single();
  if (error) {
    // The Twilio number is globally unique — a clear message beats a raw 23505.
    if ((error as { code?: string }).code === '23505') throw new Error('That Twilio number is already configured (here or on another account).');
    throw new Error(error.message);
  }
  return data as MissedCallConfig;
}

export async function updateMissedCallConfig(id: string, patch: Partial<NewMissedCallConfig>): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) row.label = patch.label?.trim() || null;
  if (patch.twilio_number !== undefined) row.twilio_number = patch.twilio_number.trim();
  if (patch.forward_to !== undefined) row.forward_to = patch.forward_to.trim();
  if (patch.template !== undefined) row.template = patch.template.trim() || DEFAULT_MISSED_CALL_TEMPLATE;
  if (patch.business_name !== undefined) row.business_name = patch.business_name?.trim() || null;
  if (patch.ring_seconds !== undefined) row.ring_seconds = patch.ring_seconds;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  const { error } = await supabase.from('missed_call_configs').update(row).eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMissedCallConfig(id: string): Promise<void> {
  const u = await uid(); if (!u) throw new Error('Not signed in.');
  const { error } = await supabase.from('missed_call_configs').delete().eq('owner_id', u).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listMissedCallEvents(limit = 25): Promise<MissedCallEvent[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('missed_call_events')
    .select('id,from_number,to_number,dial_status,texted_back,note,created_at')
    .eq('owner_id', u).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as MissedCallEvent[];
}
