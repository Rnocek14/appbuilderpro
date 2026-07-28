// src/hooks/useFleetView.ts
// Gathers the fleet snapshots and runs the pure core (fleetView.ts). Every source is fail-soft on
// its own: a query that fails yields an EMPTY source plus a loadNote, so one broken table degrades
// one lane of the control plane instead of blanking the operator's morning. Nothing here decides
// what is an exception — that is the core's job, and it is verified.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildFleetView, type FleetSnapshots, type FleetViewResult } from '../lib/garvis/fleetView';

export interface FleetViewState {
  result: FleetViewResult | null;
  loading: boolean;
  loadNotes: string[];      // honest: which lanes could not be read this time
  reload: () => void;
}

export function useFleetView(): FleetViewState {
  const [result, setResult] = useState<FleetViewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadNotes, setLoadNotes] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const notes: string[] = [];

    const safe = async <T,>(lane: string, run: () => Promise<T>, empty: T): Promise<T> => {
      try { return await run(); } catch { notes.push(`${lane} could not be read`); return empty; }
    };

    void (async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) { if (live) { setResult({ exceptions: [], hidden: [] }); setLoading(false); } return; }
      const nowIso = new Date().toISOString();
      const since30 = new Date(Date.parse(nowIso) - 30 * 86400_000).toISOString();

      // ---- clients: subscription + pin + package definition ------------------------------------
      const clients = await safe('Clients', async () => {
        const { data } = await supabase.from('client_subscriptions')
          .select('id, business_name, world_id, package_pins(status, overrides, service_packages(key, version, definition))')
          .neq('status', 'canceled');
        type PkgEmbed = { key: string; version: number; definition: { establishes?: { watch_site?: boolean; propose_automations?: string[]; reporting?: 'monthly' | null } } };
        const rows = (data ?? []) as unknown as {
          id: string; business_name: string; world_id: string | null;
          // PostgREST shape (verified against the live FK graph in the shadow-DB pilot):
          //   client_subscriptions -> package_pins is ONE-TO-MANY  => array
          //   package_pins        -> service_packages is MANY-TO-ONE => OBJECT, not array
          // The pilot caught this: reading the package as [0] silently yielded undefined, which
          // made every client look packageless and killed the drift/report-due exceptions. We
          // normalize defensively so either shape survives a PostgREST upgrade.
          package_pins: { status: string; overrides: Record<string, unknown> | null; service_packages: PkgEmbed | PkgEmbed[] | null }[] | null;
        }[];
        // Consents, one query for all clients.
        const { data: cons } = await supabase.from('package_consents').select('client_subscription_id, action');
        const consentsBySub = new Map<string, string[]>();
        for (const c of ((cons ?? []) as { client_subscription_id: string; action: string }[])) {
          consentsBySub.set(c.client_subscription_id, [...(consentsBySub.get(c.client_subscription_id) ?? []), c.action]);
        }
        // Active watches per world.
        const { data: w } = await supabase.from('standing_orders')
          .select('world_id').eq('kind', 'watch_url').eq('status', 'active');
        const watchedWorlds = new Set(((w ?? []) as { world_id: string | null }[]).map((x) => x.world_id ?? ''));

        return rows.map((r) => {
          const pin = r.package_pins?.[0] ?? null;
          const embed = pin?.service_packages ?? null;
          const pkg: PkgEmbed | null = Array.isArray(embed) ? (embed[0] ?? null) : embed;
          const est = pkg?.definition?.establishes ?? {};
          const declined = Array.isArray((pin?.overrides as { declined_actions?: string[] } | null)?.declined_actions)
            ? ((pin!.overrides as { declined_actions: string[] }).declined_actions) : [];
          return {
            worldId: r.world_id, name: r.business_name,
            pinStatus: (pin?.status as 'active' | 'paused' | 'terminated' | undefined) ?? null,
            packageKey: pkg?.key ?? null,
            packageVersion: pkg?.version ?? null,
            desiredEstablishes: {
              watch_site: !!est.watch_site,
              propose_automations: Array.isArray(est.propose_automations) ? est.propose_automations : [],
              reporting: est.reporting === 'monthly' ? ('monthly' as const) : null,
            },
            hasWatch: !!r.world_id && watchedWorlds.has(r.world_id),
            consentedActions: consentsBySub.get(r.id) ?? [],
            declinedActions: declined,
          };
        });
      }, [] as FleetSnapshots['clients']);

      const worldBySub = new Map<string, string | null>();
      await safe('Client worlds', async () => {
        const { data } = await supabase.from('client_subscriptions').select('id, world_id');
        for (const r of ((data ?? []) as { id: string; world_id: string | null }[])) worldBySub.set(r.id, r.world_id);
        return null;
      }, null);

      const triggers = await safe('Automations', async () => {
        const { data } = await supabase.from('automation_triggers')
          .select('label, status, consecutive_failures, last_error, last_error_at, client_subscription_id, capability_id');
        return ((data ?? []) as { label: string; status: string; consecutive_failures: number | null; last_error: string | null; last_error_at: string | null; client_subscription_id: string | null; capability_id?: string | null }[])
          .map((t) => ({
            worldId: t.client_subscription_id ? (worldBySub.get(t.client_subscription_id) ?? null) : null,
            label: t.label, status: (t.status === 'paused' ? 'paused' : 'active') as 'active' | 'paused',
            consecutiveFailures: t.consecutive_failures ?? 0,
            lastError: t.last_error, lastErrorAt: t.last_error_at,
            action: t.capability_id ?? null,
          })) as FleetSnapshots['triggers'];
      }, [] as FleetSnapshots['triggers']);

      const watches = await safe('Site watches', async () => {
        const { data } = await supabase.from('standing_orders')
          .select('world_id, label, status, last_result, last_run_at').eq('kind', 'watch_url');
        return ((data ?? []) as { world_id: string | null; label: string; status: string; last_result: unknown; last_run_at: string | null }[])
          .map((w) => ({
            worldId: w.world_id, label: w.label,
            status: (w.status === 'paused' ? 'paused' : 'active') as 'active' | 'paused',
            lastResult: (w.last_result ?? null) as FleetSnapshots['watches'][number]['lastResult'],
            lastRunAt: w.last_run_at,
          }));
      }, [] as FleetSnapshots['watches']);

      const changeRequests = await safe('Change requests', async () => {
        const { data } = await supabase.from('change_requests')
          .select('world_id, status, priority, received_at')
          .not('status', 'in', '("closed","declined")');
        return ((data ?? []) as { world_id: string; status: string; priority: string; received_at: string }[])
          .map((c) => ({ worldId: c.world_id, status: c.status, priority: (c.priority as 'low' | 'normal' | 'high' | 'urgent'), receivedAt: c.received_at }));
      }, [] as FleetSnapshots['changeRequests']);

      const reports = await safe('Reports', async () => {
        const { data } = await supabase.from('client_reports')
          .select('world_id, period_end, delivery_state, approval_state, generated_at')
          .order('period_end', { ascending: false }).limit(200);
        return ((data ?? []) as { world_id: string; period_end: string; delivery_state: string; approval_state: string; generated_at: string | null }[])
          .map((r) => ({
            worldId: r.world_id, periodEnd: r.period_end,
            deliveryState: r.delivery_state as 'not_sent' | 'queued' | 'sent',
            approvalState: r.approval_state as 'draft' | 'approved',
            generatedAt: r.generated_at,
          }));
      }, [] as FleetSnapshots['reports']);

      const usageByWorld = await safe('Usage', async () => {
        const { data } = await supabase.from('usage_events')
          .select('world_id, cost_usd').gte('created_at', since30).not('world_id', 'is', null);
        const sums = new Map<string, number>();
        for (const u of ((data ?? []) as { world_id: string; cost_usd: number }[])) {
          sums.set(u.world_id, (sums.get(u.world_id) ?? 0) + (Number(u.cost_usd) || 0));
        }
        return [...sums.entries()].map(([worldId, costUsd30d]) => ({ worldId, costUsd30d }));
      }, [] as FleetSnapshots['usageByWorld']);

      if (!live) return;
      setResult(buildFleetView({ clients, triggers, watches, changeRequests, reports, usageByWorld, nowIso }));
      setLoadNotes(notes);
      setLoading(false);
    })();

    return () => { live = false; };
  }, [attempt]);

  return { result, loading, loadNotes, reload };
}
