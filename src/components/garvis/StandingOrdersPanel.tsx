// src/components/garvis/StandingOrdersPanel.tsx
// THE CLOCK's face — a world's standing orders: "watch this page and tell me when it changes",
// "digest this world every week". Each order shows its honest last-run line (from the verified
// core): a failed check says it failed, a quiet week says quiet week, and nothing here ever sends
// anything — findings land in the waking moment and on the shelf; acting stays yours.

import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Loader2, Play, Pause, Trash2, Plus, Eye, CalendarClock } from 'lucide-react';
import { listOrders, createOrder, setOrderStatus, deleteOrder, runOrderNow } from '../../lib/garvis/standingRun';
import { orderStatusLine, type Cadence, type OrderKind, type StandingOrder } from '../../lib/garvis/standing';

export function StandingOrdersPanel({ worldId, onToast }: {
  worldId?: string; onToast: (kind: 'success' | 'error', msg: string) => void;
}) {
  // Without a worldId this is the GLOBAL panel (Ventures page): every order the owner has —
  // including world-less watches the Commander created — is visible, pausable, and deletable here.
  const global = !worldId;
  const [orders, setOrders] = useState<StandingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<OrderKind>('watch_url');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [cadence, setCadence] = useState<Cadence>('daily');
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setOrders(await listOrders(worldId)); }
    catch { /* panel stays usable; create still works */ }
    finally { setLoading(false); }
  }, [worldId]);

  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    if (busy) return;
    setBusy('create');
    try {
      await createOrder({ worldId: worldId ?? null, kind, label, cadence, url: kind === 'watch_url' ? url : undefined });
      setLabel(''); setUrl(''); setShowForm(false);
      onToast('success', 'Standing order set — it runs on the heartbeat; findings land in your waking moment.');
      await reload();
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not create the order.'); }
    finally { setBusy(null); }
  };

  const act = async (id: string, fn: () => Promise<unknown>, doneMsg?: string) => {
    if (busy) return;
    setBusy(id);
    try { await fn(); if (doneMsg) onToast('success', doneMsg); await reload(); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'That failed.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-4 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <AlarmClock size={16} className="shrink-0 text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Standing orders</h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:border-forge-ember/50 hover:text-forge-ember"
        ><Plus size={12} /> New</button>
      </div>
      <p className="text-xs text-forge-dim">
        {global
          ? <>Every recurring check you have, across all worlds — including watches created in conversation. <span className="text-forge-ink/80">They only read and record; nothing is ever sent for you.</span></>
          : <>Recurring checks that run on their own — watch a page for changes, or digest this world on a cadence. <span className="text-forge-ink/80">They only read and record; nothing is ever sent for you.</span></>}
      </p>

      {showForm && (
        <div className="mt-3 rounded-lg border border-forge-border bg-forge-raised/20 p-3">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setKind('watch_url')} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${kind === 'watch_url' ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ember' : 'border-forge-border text-forge-dim'}`}><Eye size={11} /> Watch a page</button>
            {!global && <button onClick={() => setKind('cadence_digest')} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${kind === 'cadence_digest' ? 'border-forge-ember/60 bg-forge-ember/10 text-forge-ember' : 'border-forge-border text-forge-dim'}`}><CalendarClock size={11} /> Digest this world</button>}
            {(['hourly', 'daily', 'weekly'] as Cadence[]).map((c) => (
              <button key={c} onClick={() => setCadence(c)} className={`rounded-full border px-2.5 py-1 text-[11px] ${cadence === c ? 'border-forge-cyan/50 text-forge-cyan' : 'border-forge-border text-forge-dim'}`}>{c}</button>
            ))}
          </div>
          <input
            value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'watch_url' ? 'Name it — e.g. “Acme’s pricing page”' : 'Name it — e.g. “Weekly digest”'}
            className="mt-2 w-full rounded-lg border border-forge-border bg-forge-raised/30 px-2.5 py-1.5 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
          />
          {kind === 'watch_url' && (
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://the-page-to-watch.com/pricing"
              className="mt-2 w-full rounded-lg border border-forge-border bg-forge-raised/30 px-2.5 py-1.5 font-mono text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/50 focus:outline-none"
            />
          )}
          <button
            onClick={() => void add()} disabled={busy === 'create'}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-1.5 text-xs font-medium text-[#1A0E04] disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 size={13} className="animate-spin" /> : <AlarmClock size={13} />} Set the order
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-xs text-forge-dim/70">Loading…</p>
      ) : orders.length === 0 ? (
        !showForm && <p className="mt-3 text-xs text-forge-dim/60">{global ? 'No standing orders yet — set a watch here, or create one in conversation ("keep an eye on…").' : 'No standing orders yet — set one and this world starts checking things on its own clock.'}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-forge-border bg-forge-raised/20 px-3 py-2">
              <div className="flex items-center gap-2">
                {o.kind === 'watch_url' ? <Eye size={13} className="shrink-0 text-forge-cyan" /> : <CalendarClock size={13} className="shrink-0 text-forge-cyan" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-forge-ink">{o.label}</span>
                <span className="shrink-0 rounded-full border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim">{o.cadence}</span>
                {o.status === 'paused' && <span className="shrink-0 rounded-full bg-forge-warn/15 px-1.5 py-0.5 text-[10px] text-forge-warn">paused</span>}
                <div className="flex shrink-0 items-center gap-1">
                  <button title="Run now" onClick={() => void act(o.id, async () => { const r = await runOrderNow(o.id); if (r.ran === 0) onToast('error', 'Nothing ran — the order was not found (it may have been deleted).'); else onToast(r.failed > 0 ? 'error' : 'success', r.changed > 0 ? 'Ran — something changed; check your waking moment.' : r.failed > 0 ? 'Ran — the check failed; see its status line below.' : 'Ran — no change.'); })}
                    disabled={!!busy} className="rounded border border-forge-border p-1 text-forge-dim hover:text-forge-ink disabled:opacity-50">
                    {busy === o.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  </button>
                  <button title={o.status === 'active' ? 'Pause' : 'Resume'} onClick={() => void act(o.id, () => setOrderStatus(o.id, o.status === 'active' ? 'paused' : 'active'))}
                    disabled={!!busy} className="rounded border border-forge-border p-1 text-forge-dim hover:text-forge-ink disabled:opacity-50">
                    {o.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button title="Delete" onClick={() => void act(o.id, () => deleteOrder(o.id), 'Order deleted.')}
                    disabled={!!busy} className="rounded border border-forge-border p-1 text-forge-dim hover:text-forge-warn disabled:opacity-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {/* The honest last-run line — exactly what the run did, from the verified core. */}
              <p className={`mt-1 text-[11px] ${o.lastResult?.status === 'changed' ? 'text-forge-ok' : o.lastResult?.status === 'unreachable' ? 'text-forge-warn' : 'text-forge-dim'}`}>
                {orderStatusLine(o)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
