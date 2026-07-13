// src/pages/Money.tsx
// THE MONEY PAGE — F1's cockpit: create an invoice in a minute, queue the send through Approvals
// (the one gated path), watch the chaser escalate politely while you sleep, and mark PAID the
// moment your processor confirms it — which is the instant it becomes real revenue in the weekly
// scorecard. Honest by construction: totals are arithmetic over your line items, "paid" is your
// own confirmation, and every outgoing email waits in the queue.

import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Plus, Send, Check, Ban, Loader2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Card, Badge, EmptyState, Button, Input, Skeleton } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useUndoBar } from '../components/garvis/UndoBar';
import { invoiceTotal, chaseStage, type LineItem } from '../lib/garvis/money';
import { listInvoices, createInvoice, queueInvoiceSend, markInvoicePaid, unmarkInvoicePaid, voidInvoice, unvoidInvoice, type InvoiceRow } from '../lib/garvis/moneyRun';

const usd = (n: number) => `$${Number(n).toFixed(2)}`;
const STAGE_LABEL = ['', 'reminder queued window', 'due', 'past due', 'final notice'];

export default function Money() {
  const { toast } = useToast();
  const { offerUndo, undoBar } = useUndoBar((e) => toast('error', e instanceof Error ? e.message : 'Could not undo that.'));
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // form
  const [title, setTitle] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ description: '', qty: 1, unit_usd: 0 }]);

  const refresh = useCallback(async () => {
    try { setRows(await listInvoices()); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not load invoices.'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void refresh(); }, [refresh]);

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((cur) => cur.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  const save = async () => {
    setSaving(true);
    try {
      const inv = await createInvoice({ title, toEmail, lineItems: items, dueDate: dueDate || null, paymentUrl: payUrl || null });
      toast('success', `${inv.number} created — queue the send when you're ready.`);
      setTitle(''); setToEmail(''); setDueDate(''); setPayUrl(''); setItems([{ description: '', qty: 1, unit_usd: 0 }]); setCreating(false);
      await refresh();
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not create the invoice.'); }
    finally { setSaving(false); }
  };

  // Optimistic (system scan): the row's status flips NOW ("Mark paid" lights instantly, like it
  // should); the background refresh reconciles, and a failure restores the truthful row.
  // Returns whether the action landed — Undo must only be offered for a void that actually took.
  const act = async (id: string, fn: () => Promise<void>, ok: string, optimistic?: Partial<InvoiceRow>): Promise<boolean> => {
    setBusyId(id);
    const prev = rows;
    if (optimistic) setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...optimistic } : r)));
    try { await fn(); toast('success', ok); void refresh(); return true; }
    catch (e) { setRows(prev); toast('error', e instanceof Error ? e.message : 'Action failed.'); return false; }
    finally { setBusyId(null); }
  };

  const now = new Date();
  const outstanding = rows.filter((r) => r.status === 'sent').reduce((s, r) => s + Number(r.amount_usd), 0);
  const collected = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.amount_usd), 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <CircleDollarSign size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Money</h1>
            <p className="text-sm text-forge-dim">Invoice → gated send → the chaser asks so you don't have to → paid = real revenue.</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {/* Totals sum the loaded invoices (newest 200). Say so when we're at the cap, rather than
                showing a silently-undercounted number (deep scan P2, no-invented-numbers). */}
            <span className="text-forge-dim" title={rows.length >= 200 ? 'across the latest 200 invoices' : undefined}>
              Outstanding <b className="text-forge-warn">{usd(outstanding)}</b>{rows.length >= 200 && <span className="ml-0.5 text-[10px] text-forge-dim/60">(latest 200)</span>}
            </span>
            <span className="text-forge-dim">Collected <b className="text-forge-ok">{usd(collected)}</b></span>
            {!creating && <Button onClick={() => setCreating(true)}><Plus size={14} /> New invoice</Button>}
          </div>
        </div>

        {creating && (
          <Card className="mb-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-forge-dim">What for
                <Input autoFocus className="mt-1" placeholder="Lakefront listing photography" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block text-xs text-forge-dim">Bill to (email)
                <Input className="mt-1" placeholder="client@theirdomain.com" value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
              </label>
              <label className="block text-xs text-forge-dim">Due date (the chase ladder runs from this)
                <Input className="mt-1" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="block text-xs text-forge-dim">Payment link (your Stripe/Square link — money goes to YOUR account)
                <Input className="mt-1" placeholder="https://buy.stripe.com/…  (optional)" value={payUrl} onChange={(e) => setPayUrl(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input className="min-w-[180px] flex-1" placeholder="Line item" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                  <Input className="w-20" type="number" min={0} placeholder="Qty" value={String(it.qty)} onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })} />
                  <Input className="w-28" type="number" min={0} step="0.01" placeholder="$ each" value={String(it.unit_usd)} onChange={(e) => setItem(i, { unit_usd: Number(e.target.value) || 0 })} />
                  <span className="w-20 text-right text-xs text-forge-dim">{usd((it.qty || 0) * (it.unit_usd || 0))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button onClick={() => setItems((c) => [...c, { description: '', qty: 1, unit_usd: 0 }])} className="text-xs text-forge-dim hover:text-forge-ember">+ line item</button>
                <span className="text-sm font-medium text-forge-ink">Total {usd(invoiceTotal(items))}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void save()} loading={saving}>Create invoice</Button>
              <button onClick={() => setCreating(false)} className="rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim hover:text-forge-ink">Cancel</button>
            </div>
          </Card>
        )}

        {loading ? (
          // Skeletons over spinners (design review): the page keeps its shape while it loads.
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-forge-border bg-forge-panel p-3">
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-1/4" /></div>
                <Skeleton className="h-7 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<CircleDollarSign size={20} />} title="No invoices yet"
            body="Create one in a minute — Garvis sends it through your approval queue, chases it politely while you sleep, and counts it as revenue the moment you mark it paid." />
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const stage = chaseStage(r, now);
              return (
                <Card key={r.id} className="flex animate-fadeInUp flex-wrap items-center gap-3 p-3" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-forge-dim">{r.number}</span>
                      <span className="truncate text-sm font-medium text-forge-ink">{r.title}</span>
                      <Badge tone={r.status === 'paid' ? 'ok' : r.status === 'sent' ? (stage >= 2 ? 'err' : 'warn') : 'dim'}>
                        {r.status === 'sent' && stage >= 2 ? STAGE_LABEL[stage] : r.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-forge-dim">{r.to_email}{r.due_date ? ` · due ${r.due_date}` : ''} · {usd(r.amount_usd)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.status === 'draft' && (
                      <button disabled={busyId === r.id} onClick={() => void act(r.id, () => queueInvoiceSend(r), 'Invoice queued — approve the send in the Queue.', { status: 'sent' })}
                        className="flex items-center gap-1 rounded-lg border border-forge-ember/50 bg-forge-ember/10 px-2.5 py-1.5 text-xs text-forge-ember hover:bg-forge-ember/20 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Queue send
                      </button>
                    )}
                    {r.status === 'sent' && (
                      <button disabled={busyId === r.id} onClick={() => {
                        // Mark paid is a money mutation — it gets an Undo too (parity with void), so a
                        // mis-click doesn't permanently book revenue with no way back. This button only
                        // shows for a 'sent' invoice, so Undo restores it to 'sent'.
                        void act(r.id, () => markInvoicePaid(r.id), 'Paid — recorded as revenue. 🎉', { status: 'paid' }).then((ok) => {
                          if (ok) offerUndo(`Marked ${r.number} paid`, async () => { await unmarkInvoicePaid(r.id, 'sent'); await refresh(); });
                        });
                      }}
                        className="flex items-center gap-1 rounded-lg border border-forge-ok/50 bg-forge-ok/10 px-2.5 py-1.5 text-xs text-forge-ok hover:bg-forge-ok/20 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Mark paid
                      </button>
                    )}
                    {r.status !== 'paid' && r.status !== 'void' && (
                      <button disabled={busyId === r.id} title="Void — kept on record, never chased (Undo for 6s)"
                        onClick={() => {
                          // UNDO LAYER (design review): the confirm dialog is gone — void acts
                          // instantly, and Undo restores exactly the status it took away.
                          const restoreTo = r.status === 'sent' ? 'sent' as const : 'draft' as const;
                          void act(r.id, () => voidInvoice(r.id), `Voided ${r.number}.`, { status: 'void' }).then((ok) => {
                            if (ok) offerUndo(`Voided ${r.number}`, async () => { await unvoidInvoice(r.id, restoreTo); await refresh(); });
                          });
                        }}
                        className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-err disabled:opacity-50"><Ban size={12} /></button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {undoBar}
    </AppShell>
  );
}
