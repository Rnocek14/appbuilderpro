// src/pages/ClientBilling.tsx
// CLIENT BILLING — the operator's own book of business: sell the two tiers (Website, Website +
// Automation), track who's paying, and see real MRR. v1 fulfils with Stripe Payment Links the operator
// creates in Stripe (zero code): save the two links once, record a sale, copy the link to send, and mark
// the client active when they pay. Nothing here charges a card directly — the automated Checkout path
// layers on later. This is DISTINCT from FableForge's own /billing (which bills the operator for Pro).

import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { Receipt, Loader2, Copy, Check, Trash2, CircleDollarSign, Link as LinkIcon, Info, Rocket, Zap } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { Button, StatCard, EmptyState, LoadError } from '../components/ui';
import { cn } from '../lib/utils';
import { CLIENT_TIERS, tierById, formatUsd, monthlyRevenueCents, oneTimeRevenueCents, type TierId } from '../lib/garvis/billing/clientTiers';
import {
  getBillingSettings, saveBillingSettings, listClientSubs, createClientSub, setClientStatus, deleteClientSub,
  type BillingSettings, type ClientSubRow,
} from '../lib/garvis/billing/clientBilling';
import { detectVertical } from '../lib/garvis/verticals';
import { menuForVertical } from '../lib/garvis/automation/registry';

const STATUS_CLS: Record<string, string> = {
  active: 'text-forge-ok', pending: 'text-forge-warn', canceled: 'text-forge-dim',
};

export default function ClientBilling() {
  const { toast } = useToast();
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [settings, setSettings] = useState<BillingSettings>({ website_payment_link: null, automation_payment_link: null });
  const [subs, setSubs] = useState<ClientSubRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  // Upsell ladder rung 3: per-client custom-automation menu (industry-fitted, honest inventory).
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // record-a-sale form
  const [bizName, setBizName] = useState('');
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState<TierId>('website_automation');
  const [price, setPrice] = useState('500');
  const [saving, setSaving] = useState(false);

  // Carry a won deal forward: Win clients deep-links here with the prospect already filled in, so the
  // operator never re-types the business + email they already scraped. Read once, then clear the params.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const b = params.get('business'); const e = params.get('email'); const t = params.get('tier');
    if (b) setBizName(b);
    if (e) setEmail(e);
    if (t === 'website' || t === 'website_automation') { setTier(t); setPrice(t === 'website' ? '1500' : '500'); }
    if (b || e || t) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [s, list] = await Promise.all([getBillingSettings(), listClientSubs()]);
      setSettings(s); setSubs(list);
    } catch (e) { setLoadFailed(true); toast('error', emsg(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const mrr = monthlyRevenueCents(subs);
  const oneTime = oneTimeRevenueCents(subs);
  const activeCount = subs.filter((s) => s.status === 'active').length;

  const saveLinks = async () => {
    try { await saveBillingSettings(settings); toast('success', 'Payment links saved.'); }
    catch (e) { toast('error', emsg(e)); }
  };

  const record = async () => {
    if (!bizName.trim()) { toast('error', 'Add the business name.'); return; }
    const cadence = tierById(tier)!.cadence;
    const cents = Math.round((parseFloat(price) || 0) * 100);
    setSaving(true);
    try {
      const row = await createClientSub({ business_name: bizName, email, tier, cadence, price_cents: cents });
      setSubs((s) => [row, ...s]); setBizName(''); setEmail('');
      toast('success', 'Client recorded — send them the payment link, then mark them active once paid.');
    } catch (e) { toast('error', emsg(e)); }
    finally { setSaving(false); }
  };

  const mark = async (row: ClientSubRow, status: 'active' | 'canceled' | 'pending') => {
    setSubs((s) => s.map((x) => (x.id === row.id ? { ...x, status } : x)));
    try { await setClientStatus(row.id, status); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };
  const remove = async (row: ClientSubRow) => {
    if (!window.confirm(`Remove ${row.business_name} from your billing book?`)) return;
    setSubs((s) => s.filter((x) => x.id !== row.id));
    try { await deleteClientSub(row.id); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };
  const linkFor = (t: TierId) => (t === 'website' ? settings.website_payment_link : settings.automation_payment_link);
  const copyLink = async (row: ClientSubRow) => {
    const url = linkFor(row.tier);
    if (!url) { toast('error', 'No payment link saved for this tier yet — add it above.'); return; }
    try { await navigator.clipboard.writeText(url); setCopied(row.id); setTimeout(() => setCopied(null), 1500); }
    catch { toast('error', 'Could not copy.'); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Receipt size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Client revenue</h1>
        </div>
        <p className="mb-5 text-sm text-forge-dim">
          Sell the two offers and track your book. Send a client their payment link, mark them active when they pay, and watch your MRR add up.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : loadFailed ? (
          <LoadError message="Couldn’t load your billing book." onRetry={() => void refresh()} />
        ) : (
          <>
            {/* Revenue summary */}
            <div className="mb-5 grid grid-cols-3 gap-3">
              <StatCard label="Monthly recurring" value={formatUsd(mrr)} hint={`${activeCount} active client${activeCount === 1 ? '' : 's'}`} />
              <StatCard label="One-time (booked)" value={formatUsd(oneTime)} />
              <StatCard label="Annualized MRR" value={formatUsd(mrr * 12)} hint="run-rate" />
            </div>

            {/* Payment links */}
            <div className="mb-5 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-forge-ink"><LinkIcon size={15} className="text-forge-ember" /> Your Stripe payment links</div>
              <p className="mb-3 flex items-start gap-1.5 text-[11px] text-forge-dim"><Info size={12} className="mt-0.5 shrink-0" /> Create two Payment Links in your Stripe dashboard (Products → Payment links) — one per offer — and paste them here. They’re reused for every client. See <code className="text-forge-ink">docs/client-billing-setup.md</code>.</p>
              <div className="space-y-2">
                {CLIENT_TIERS.map((t) => (
                  <div key={t.id} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <label className="w-44 shrink-0 text-xs text-forge-dim">{t.name} <span className="text-forge-dim/60">({t.priceHint})</span></label>
                    <input
                      value={(t.id === 'website' ? settings.website_payment_link : settings.automation_payment_link) ?? ''}
                      onChange={(e) => setSettings((s) => ({ ...s, [t.id === 'website' ? 'website_payment_link' : 'automation_payment_link']: e.target.value }))}
                      placeholder="https://buy.stripe.com/…"
                      className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-end"><Button variant="outline" size="sm" onClick={() => void saveLinks()}>Save links</Button></div>
            </div>

            {/* Record a sale */}
            <div className="mb-5 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="mb-3 text-sm font-medium text-forge-ink">Record a sale</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Business name"
                  className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Contact email (optional)"
                  className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <select value={tier} onChange={(e) => { const t = e.target.value as TierId; setTier(t); setPrice(t === 'website' ? '1500' : '500'); }}
                  className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none">
                  {CLIENT_TIERS.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.priceHint}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-forge-dim">$</span>
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="500"
                    className="w-28 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                  <span className="text-xs text-forge-dim">{tierById(tier)!.cadence === 'monthly' ? '/mo' : 'one-time'}</span>
                  <Button variant="primary" size="sm" className="ml-auto" onClick={() => void record()} disabled={saving}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <CircleDollarSign size={13} />} Record
                  </Button>
                </div>
              </div>
            </div>

            {/* The book */}
            {subs.length === 0 ? (
              <EmptyState icon={<Receipt size={22} />} title="No clients yet"
                body="Win a client, then record the sale here to start tracking your MRR."
                action={<NavLink to="/garvis/clients" className="inline-flex items-center gap-1.5 rounded-lg bg-forge-ember px-3 py-2 text-sm font-medium text-white hover:bg-forge-ember/90"><Rocket size={15} /> Go find clients</NavLink>} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-forge-border">
                <table className="w-full min-w-[620px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-forge-panel/40 text-[10.5px] uppercase tracking-wide text-forge-dim">
                      <th className="px-3 py-2 font-medium">Business</th>
                      <th className="px-3 py-2 font-medium">Offer</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => {
                      const menu = menuFor === s.id
                        ? menuForVertical(detectVertical(`${s.business_name} ${s.notes ?? ''}`))
                        : [];
                      const copyMenuPitch = async () => {
                        const lines = menu.map((c) => `• ${c.title} — ${c.pitch} (${c.monthlyPrice})`);
                        await navigator.clipboard.writeText(
                          `Custom automations we can run for ${s.business_name}:\n${lines.join('\n')}\n\nEvery message is approved before it sends — nothing goes out without a yes.`,
                        );
                        toast('success', 'Automation pitch copied — paste it into your email or text.');
                      };
                      return (
                      <React.Fragment key={s.id}>
                      <tr className="border-t border-forge-border/60">
                        <td className="px-3 py-2">
                          <div className="font-medium text-forge-ink">{s.business_name}</div>
                          {s.email && <div className="text-[11px] text-forge-dim">{s.email}</div>}
                        </td>
                        <td className="px-3 py-2 text-forge-dim">{tierById(s.tier)?.name ?? s.tier}</td>
                        <td className="px-3 py-2 tabular-nums text-forge-ink">{formatUsd(s.price_cents)}{s.cadence === 'monthly' ? '/mo' : ''}</td>
                        <td className={cn('px-3 py-2 font-medium', STATUS_CLS[s.status])}>{s.status}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => void copyLink(s)} title="Copy payment link"
                              className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                              {copied === s.id ? <Check size={11} className="text-forge-ok" /> : <Copy size={11} />} Link
                            </button>
                            <button onClick={() => setMenuFor((m) => (m === s.id ? null : s.id))}
                              title="Industry-fitted automations to pitch this client"
                              className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]',
                                menuFor === s.id ? 'border-forge-ember/50 text-forge-ember' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                              <Zap size={11} /> Automations
                            </button>
                            {s.status !== 'active'
                              ? <button onClick={() => void mark(s, 'active')} className="rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-ok hover:bg-forge-ok/10">Mark paid</button>
                              : <button onClick={() => void mark(s, 'canceled')} className="rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">Cancel</button>}
                            <button onClick={() => void remove(s)} title="Remove" className="rounded-lg border border-forge-border p-1 text-forge-dim hover:text-forge-ember"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                      {menuFor === s.id && (
                        <tr className="border-t border-forge-border/40 bg-forge-panel/30">
                          <td colSpan={5} className="px-3 py-3">
                            {/* The custom-automation menu (upsell rung 3): honest inventory only —
                                'not_built' capabilities never appear here or anywhere. */}
                            {menu.length === 0 ? (
                              <p className="text-[11px] text-forge-dim">No deliverable automations match this business yet.</p>
                            ) : (
                              <>
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className="text-[10.5px] uppercase tracking-wide text-forge-dim">Recommended for their business flow</span>
                                  <button onClick={() => void copyMenuPitch()} className="text-[11px] text-forge-ember hover:underline">Copy as pitch</button>
                                </div>
                                <ul className="space-y-1">
                                  {menu.map((c) => (
                                    <li key={c.id} className="text-[11.5px]">
                                      <span className="font-medium text-forge-ink">{c.title}</span>
                                      <span className="text-forge-dim"> — {c.pitch} </span>
                                      <span className="text-forge-heat">({c.monthlyPrice})</span>
                                    </li>
                                  ))}
                                </ul>
                                <p className="mt-1.5 text-[10.5px] text-forge-dim/80">
                                  Set these up under Automations once they say yes — every send stays approval-gated.
                                </p>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
