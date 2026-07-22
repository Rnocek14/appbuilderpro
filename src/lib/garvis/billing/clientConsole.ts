// src/lib/garvis/billing/clientConsole.ts
// PURE aggregation for the per-client automation console (no I/O; verified by clientConsole.verify.ts).
// One operator runs automations for many clients; this rolls up — per paying client — how many
// automations/lists/missed-call numbers are attached and how many are actually live, so the operator
// can see at a glance what each client is getting. Anything not attached to a client falls into a single
// "Unassigned" bucket (shown only when it has something), so nothing is ever silently uncounted.
//
// Zero runtime imports — a leaf; the store feeds it rows and renders the result.

export interface ClientRef { id: string; business_name: string; status: string; price_cents: number; cadence: string }
export interface TriggerRef { client_subscription_id: string | null; status: string }        // status: 'active' | 'paused'
export interface MissedCallRef { client_subscription_id: string | null; enabled: boolean }
export interface ListRef { client_subscription_id: string | null }

export interface ClientConsoleRow {
  clientId: string | null;          // null == the Unassigned bucket
  name: string;
  status: string | null;
  priceCents: number;
  cadence: string | null;
  triggers: number; liveTriggers: number;
  missedCall: number; liveMissedCall: number;
  lists: number;
  /** Total live delivery surfaces (active triggers + enabled missed-call numbers) — the honest
   *  "is anything actually running for this client" number. */
  liveTotal: number;
}

const UNASSIGNED = '__unassigned__';

/** Roll up every automation surface by the client it's attached to. Clients appear in the order given
 *  (even with nothing attached, so a paying client with no automations is visibly empty, not missing);
 *  the Unassigned bucket is appended only when it actually holds something. Pure + deterministic. */
export function buildClientConsole(
  clients: ClientRef[], triggers: TriggerRef[], missed: MissedCallRef[], lists: ListRef[],
): ClientConsoleRow[] {
  const blank = (): Omit<ClientConsoleRow, 'clientId' | 'name' | 'status' | 'priceCents' | 'cadence'> =>
    ({ triggers: 0, liveTriggers: 0, missedCall: 0, liveMissedCall: 0, lists: 0, liveTotal: 0 });

  const buckets = new Map<string, ReturnType<typeof blank>>();
  for (const c of clients) buckets.set(c.id, blank());
  const bucketFor = (id: string | null) => {
    const key = id && buckets.has(id) ? id : UNASSIGNED;   // an FK to a since-deleted client → Unassigned
    let b = buckets.get(key);
    if (!b) { b = blank(); buckets.set(key, b); }
    return b;
  };

  for (const t of triggers) { const b = bucketFor(t.client_subscription_id); b.triggers++; if (t.status === 'active') b.liveTriggers++; }
  for (const m of missed) { const b = bucketFor(m.client_subscription_id); b.missedCall++; if (m.enabled) b.liveMissedCall++; }
  for (const l of lists) { bucketFor(l.client_subscription_id).lists++; }

  const rows: ClientConsoleRow[] = clients.map((c) => {
    const b = buckets.get(c.id)!;
    return {
      clientId: c.id, name: c.business_name, status: c.status, priceCents: c.price_cents, cadence: c.cadence,
      ...b, liveTotal: b.liveTriggers + b.liveMissedCall,
    };
  });

  const un = buckets.get(UNASSIGNED);
  if (un && (un.triggers || un.missedCall || un.lists)) {
    rows.push({
      clientId: null, name: 'Unassigned', status: null, priceCents: 0, cadence: null,
      ...un, liveTotal: un.liveTriggers + un.liveMissedCall,
    });
  }
  return rows;
}

/** Total live delivery surfaces across all clients — a one-glance "how much is running" number. */
export function totalLiveSurfaces(rows: ClientConsoleRow[]): number {
  return rows.reduce((n, r) => n + r.liveTotal, 0);
}
