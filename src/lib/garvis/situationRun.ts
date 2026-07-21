// src/lib/garvis/situationRun.ts
// Impure half of the situation model: gather the real rows (parallel, each fail-soft — a broken
// probe yields an EMPTY slice, never an invented one), compile through the pure budgeted
// compiler. This is THE context assembler's situation source (holy-grail gaps 3 + 10): the
// Orchestrator compile and the Commander both call assembleSituation, so both plan from the
// same current reality.

import { supabase } from '../supabase';
import { compileSituation, type SituationInputs } from './situation';
import { clockState } from './heartbeatStatus';

async function slice<T>(p: PromiseLike<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export async function assembleSituation(): Promise<string> {
  const [worlds, arcs, engagements, orders, approvals, opps, invoices, clock] = await Promise.all([
    slice(supabase.from('knowledge_worlds').select('title').order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => (data ?? []) as { title: string }[]), []),
    slice(supabase.from('orchestrator_plans').select('title, status, waiting_reason')
      .in('status', ['running', 'waiting', 'ready']).order('last_activity_at', { ascending: false }).limit(8)
      .then(({ data }) => (data ?? []) as { title: string; status: string; waiting_reason: string | null }[]), []),
    slice(supabase.from('client_engagements').select('client_name, status, intake')
      .in('status', ['prospect', 'active']).limit(8)
      .then(({ data }) => ((data ?? []) as { client_name: string; status: string; intake: { received?: boolean }[] }[])
        .map((e) => ({
          client_name: e.client_name, status: e.status,
          received: (Array.isArray(e.intake) ? e.intake : []).filter((i) => i?.received).length,
          total: Array.isArray(e.intake) ? e.intake.length : 0,
        }))), []),
    slice(supabase.from('standing_orders').select('kind, label, status').limit(12)
      .then(({ data }) => (data ?? []) as { kind: string; label: string; status: string }[]), []),
    slice(supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => count ?? 0), 0),
    slice(supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => count ?? 0), 0),
    slice(supabase.from('invoices').select('amount_usd').eq('status', 'sent').limit(200)
      .then(({ data }) => ((data ?? []) as { amount_usd: number }[]).reduce((s, r) => s + Number(r.amount_usd || 0), 0)), 0),
    slice(clockState().then((c) => c.state), 'never' as const),
  ]);

  const inputs: SituationInputs = {
    worlds, arcs, engagements, standingOrders: orders,
    pendingApprovals: approvals, newOpportunities: opps, outstandingInvoicesUsd: invoices,
    // 'never' can mean "not armed yet" OR "probe unreachable" — treat as unknown, not dead.
    clockAlive: clock === 'alive' ? true : clock === 'stale' ? false : null,
  };
  return compileSituation(inputs);
}
