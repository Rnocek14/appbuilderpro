// src/lib/garvis/billing/clientConsoleRun.ts
// The impure loader for the per-client automation console: fetch the operator's clients + every
// automation surface (triggers, missed-call numbers, customer lists), then roll them up with the PURE
// core (clientConsole.ts). Owner-scoped via RLS; best-effort so the UI degrades to empty rather than
// erroring before the migrations are applied.

import { supabase } from '../../supabase';
import { listClientSubs, type ClientSubRow } from './clientBilling';
import {
  buildClientConsole, type ClientConsoleRow, type ClientRef, type TriggerRef, type MissedCallRef, type ListRef,
} from './clientConsole';

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export interface ClientConsole { clients: ClientSubRow[]; rows: ClientConsoleRow[] }

/** Load + aggregate the per-client console in one call. */
export async function loadClientConsole(): Promise<ClientConsole> {
  const u = await uid(); if (!u) return { clients: [], rows: [] };
  const [clients, trig, missed, lists] = await Promise.all([
    listClientSubs(),
    supabase.from('automation_triggers').select('client_subscription_id, status').eq('owner_id', u),
    supabase.from('missed_call_configs').select('client_subscription_id, enabled').eq('owner_id', u),
    supabase.from('customer_lists').select('client_subscription_id').eq('owner_id', u),
  ]);
  const clientRefs: ClientRef[] = clients.map((c) => ({
    id: c.id, business_name: c.business_name, status: c.status, price_cents: c.price_cents, cadence: c.cadence,
  }));
  const rows = buildClientConsole(
    clientRefs,
    (trig.data ?? []) as TriggerRef[],
    (missed.data ?? []) as MissedCallRef[],
    (lists.data ?? []) as ListRef[],
  );
  return { clients, rows };
}
