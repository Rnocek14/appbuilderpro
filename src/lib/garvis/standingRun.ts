// src/lib/garvis/standingRun.ts
// Impure half of standing orders: owner-scoped CRUD over the standing_orders table (RLS enforced)
// plus a "run now" that pokes the standing-worker for one order. Scheduling math comes from the
// verified core (via standing.ts) — the client computes the first next_run_at the same way the
// worker computes every subsequent one, so there is exactly one notion of "when".

import { supabase } from '../supabase';
import { nextRunAfter, type Cadence, type OrderKind, type StandingOrder, type WatchResult } from './standing';

interface OrderRow {
  id: string; world_id: string | null; kind: OrderKind; label: string; cadence: Cadence;
  config: { url?: string; note?: string } | null; status: 'active' | 'paused';
  anchor_at: string; next_run_at: string; last_run_at: string | null; last_result: WatchResult | null;
}

function toOrder(r: OrderRow): StandingOrder {
  return {
    id: r.id, kind: r.kind, label: r.label, cadence: r.cadence,
    config: r.config ?? {}, status: r.status,
    nextRunAt: r.next_run_at, lastRunAt: r.last_run_at, lastResult: r.last_result,
  };
}

export async function listOrders(worldId?: string): Promise<StandingOrder[]> {
  let q = supabase.from('standing_orders')
    .select('id, world_id, kind, label, cadence, config, status, anchor_at, next_run_at, last_run_at, last_result')
    .order('created_at', { ascending: false }).limit(50);
  if (worldId) q = q.eq('world_id', worldId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as OrderRow[]).map(toOrder);
}

export async function createOrder(input: {
  worldId?: string | null; kind: OrderKind; label: string; cadence: Cadence; url?: string;
}): Promise<StandingOrder> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const label = input.label.trim();
  if (label.length < 3) throw new Error('Give the order a name — what is it watching or digesting?');
  if (input.kind === 'watch_url') {
    const url = (input.url ?? '').trim();
    if (!/^https?:\/\/.+\..+/.test(url)) throw new Error('A watch needs a full URL (https://…).');
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase.from('standing_orders').insert({
    owner_id: uid, world_id: input.worldId ?? null, kind: input.kind, label,
    cadence: input.cadence, config: input.kind === 'watch_url' ? { url: input.url!.trim() } : {},
    status: 'active', anchor_at: nowIso,
    // First run = the next grid slot from now; the worker steps the same grid forever after.
    next_run_at: nextRunAfter(input.cadence, nowIso, nowIso),
  }).select('id, world_id, kind, label, cadence, config, status, anchor_at, next_run_at, last_run_at, last_result').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the order.');
  return toOrder(data as OrderRow);
}

export async function setOrderStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const { error } = await supabase.from('standing_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from('standing_orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Run one order right now (owner-scoped in the worker). Returns the worker's honest tallies. */
export async function runOrderNow(id: string): Promise<{ ran: number; changed: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('standing-worker', { body: { order_id: id } });
  if (error) throw new Error(error.message);
  const r = data as { ran?: number; changed?: number; failed?: number };
  return { ran: r.ran ?? 0, changed: r.changed ?? 0, failed: r.failed ?? 0 };
}
