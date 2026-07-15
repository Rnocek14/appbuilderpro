// src/lib/garvis/automation/triggersStore.ts
// Client data-access for the trigger engine's UI (Automations page). Thin, owner-scoped reads/writes
// over the app_0076 tables — RLS enforces ownership; these never bypass it. Best-effort reads return []
// so the UI degrades to empty (e.g. before the migration is applied) rather than erroring.

import { supabase } from '../../supabase';
import { capabilityById, type Capability } from './registry';
import { parseCustomerCsv, type AnchorField } from './triggers';

export { parseCustomerCsv };

export interface CustomerListRow { id: string; name: string; source: string; created_at: string }
export interface CustomerRow {
  id: string; list_id: string; email: string | null; name: string | null;
  last_service_at: string | null; last_visit_at: string | null;
  purchase_at: string | null; next_due_at: string | null; created_at: string;
}
export interface TriggerRow {
  id: string; list_id: string; capability_id: string; label: string;
  anchor_field: AnchorField; offset_days: number; window_days: number;
  template_subject: string; template_body: string; status: 'active' | 'paused'; created_at: string;
}
export interface FireRow { id: string; trigger_id: string; customer_id: string; fired_for: string; approval_id: string | null; created_at: string }

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---- customer lists ----
export async function listCustomerLists(): Promise<CustomerListRow[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('customer_lists').select('id,name,source,created_at')
    .eq('owner_id', u).order('created_at', { ascending: false });
  return (data ?? []) as CustomerListRow[];
}
export async function createCustomerList(name: string): Promise<CustomerListRow | null> {
  const u = await uid(); if (!u) return null;
  const { data } = await supabase.from('customer_lists')
    .insert({ owner_id: u, name: name.trim() || 'My customers', source: 'manual' })
    .select('id,name,source,created_at').single();
  return (data as CustomerListRow) ?? null;
}

// ---- customers ----
export async function listCustomers(listId: string): Promise<CustomerRow[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('customers').select('*')
    .eq('owner_id', u).eq('list_id', listId).order('created_at', { ascending: false });
  return (data ?? []) as CustomerRow[];
}
export interface NewCustomer {
  email: string | null; name?: string | null;
  last_service_at?: string | null; last_visit_at?: string | null;
  purchase_at?: string | null; next_due_at?: string | null;
}
export async function addCustomers(listId: string, rows: NewCustomer[]): Promise<number> {
  const u = await uid(); if (!u || rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    owner_id: u, list_id: listId, email: r.email?.trim() || null, name: r.name?.trim() || null,
    last_service_at: r.last_service_at || null, last_visit_at: r.last_visit_at || null,
    purchase_at: r.purchase_at || null, next_due_at: r.next_due_at || null,
    consent_basis: 'warm_transactional', consent_at: new Date().toISOString(),
  }));
  const { data } = await supabase.from('customers').insert(payload).select('id');
  return (data ?? []).length;
}

// ---- triggers ----
export async function listTriggers(): Promise<TriggerRow[]> {
  const u = await uid(); if (!u) return [];
  const { data } = await supabase.from('automation_triggers').select('*')
    .eq('owner_id', u).order('created_at', { ascending: false });
  return (data ?? []) as TriggerRow[];
}

/** Spin up a trigger for a capability using its registry defaults. Only capabilities that carry a
 *  triggerDefault (the date/interval ones) can become a trigger — the rest aren't schedule-shaped. */
export async function createTriggerFromCapability(listId: string, capabilityId: string): Promise<TriggerRow | null> {
  const u = await uid(); if (!u) return null;
  const cap: Capability | undefined = capabilityById(capabilityId);
  const d = cap?.triggerDefault;
  if (!cap || !d) return null;
  const { data } = await supabase.from('automation_triggers').insert({
    owner_id: u, list_id: listId, capability_id: cap.id, label: cap.title,
    anchor_field: d.anchorField, offset_days: d.offsetDays, window_days: d.windowDays,
    template_subject: d.subject, template_body: d.body, status: 'active',
  }).select('*').single();
  return (data as TriggerRow) ?? null;
}
export async function setTriggerStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const u = await uid(); if (!u) return;
  await supabase.from('automation_triggers').update({ status, updated_at: new Date().toISOString() })
    .eq('owner_id', u).eq('id', id);
}
export async function deleteTrigger(id: string): Promise<void> {
  const u = await uid(); if (!u) return;
  await supabase.from('automation_triggers').delete().eq('owner_id', u).eq('id', id);
}

/** Capabilities that can be turned into a per-customer trigger (have a triggerDefault + are deliverable). */
export { CAPABILITIES } from './registry';
