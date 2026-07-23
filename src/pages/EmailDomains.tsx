// src/pages/EmailDomains.tsx  (/garvis/email-domains)
// SENDING DOMAINS — verify a client's own domain so their emails send from it and land in the inbox.
// Add a domain → we register it with Resend and show the exact DNS records to add at their registrar →
// they add them → hit Verify. Once verified, set that brand's from-address to hello@theirdomain.com on
// the Setup screen and every send (pitch or automation) delivers from their domain. Operator-only.

import { useCallback, useEffect, useState } from 'react';
import {
  MailCheck, Loader2, Plus, RefreshCw, Trash2, Copy, Check, ShieldCheck, CircleAlert, Clock, ExternalLink,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { Button, StatCard, EmptyState, LoadError } from '../components/ui';
import { cn } from '../lib/utils';
import {
  listSenderDomains, connectSenderDomain, refreshSenderDomain, verifySenderDomain, removeSenderDomain,
  type SenderDomainRow,
} from '../lib/garvis/email/senderDomainsRun';
import { statusLabel, summarizeRecords, isDeliveryReady, fromAddressFor, type DomainStatus } from '../lib/garvis/email/senderDomain';

const STATUS_UI: Record<DomainStatus, { cls: string; icon: typeof ShieldCheck }> = {
  verified: { cls: 'text-forge-ok', icon: ShieldCheck },
  pending: { cls: 'text-forge-warn', icon: Clock },
  not_started: { cls: 'text-forge-warn', icon: Clock },
  failure: { cls: 'text-forge-err', icon: CircleAlert },
  temporary_failure: { cls: 'text-forge-dim', icon: Clock },
};

export default function EmailDomains() {
  const { toast } = useToast();
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<SenderDomainRow[]>([]);
  const [domain, setDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try { setRows(await listSenderDomains()); }
    catch (e) { setLoadFailed(true); toast('error', emsg(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const add = async () => {
    if (!domain.trim()) { toast('error', 'Enter a domain.'); return; }
    setAdding(true);
    try {
      const saved = await connectSenderDomain(domain.trim());
      if (saved) { setRows((r) => [saved, ...r.filter((x) => x.id !== saved.id)]); setExpanded(saved.id); }
      setDomain('');
      toast('success', 'Domain registered — add the DNS records below, then verify.');
    } catch (e) { toast('error', emsg(e)); }
    finally { setAdding(false); }
  };

  const doVerify = async (row: SenderDomainRow) => {
    setBusyId(row.id);
    try {
      const updated = await verifySenderDomain(row.id);
      if (updated) { setRows((r) => r.map((x) => (x.id === row.id ? updated : x)));
        toast(isDeliveryReady(updated.status) ? 'success' : 'info',
          isDeliveryReady(updated.status) ? 'Verified — this domain sends live.' : 'Not verified yet — DNS can take up to an hour to propagate.'); }
    } catch (e) { toast('error', emsg(e)); }
    finally { setBusyId(null); }
  };

  const doRefresh = async (row: SenderDomainRow) => {
    setBusyId(row.id);
    try { const updated = await refreshSenderDomain(row.id); if (updated) setRows((r) => r.map((x) => (x.id === row.id ? updated : x))); }
    catch (e) { toast('error', emsg(e)); }
    finally { setBusyId(null); }
  };

  const remove = async (row: SenderDomainRow) => {
    if (!window.confirm(`Stop sending from ${row.domain}? This removes it from your email provider too.`)) return;
    setRows((r) => r.filter((x) => x.id !== row.id));
    try { await removeSenderDomain(row.id); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };

  const copy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(null), 1200); }
    catch { toast('error', 'Could not copy.'); }
  };

  const verifiedCount = rows.filter((r) => isDeliveryReady(r.status)).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><MailCheck size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Sending domains</h1>
        </div>
        <p className="mb-5 text-sm text-forge-dim">
          Verify a client’s own domain so their emails send from it — and land in the inbox, not spam. Add the domain, drop the DNS records at their registrar, then verify. Once it’s green, set their from-address to <code className="text-forge-ink">hello@theirdomain.com</code> on the Setup screen.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : loadFailed ? (
          <LoadError message="Couldn’t load your sending domains." onRetry={() => void refresh()} />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <StatCard label="Domains" value={String(rows.length)} />
              <StatCard label="Verified · sending live" value={String(verifiedCount)} hint={rows.length ? `${rows.length - verifiedCount} still pending` : undefined} />
            </div>

            {/* Add a domain */}
            <div className="mb-5 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="mb-2 text-sm font-medium text-forge-ink">Add a domain</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="theirbusiness.com"
                  onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
                  className="flex-1 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <Button variant="primary" size="sm" onClick={() => void add()} disabled={adding}>
                  {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add domain
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-forge-dim">We register it with Resend and hand back the exact DNS records to add. Nothing sends from it until it’s verified.</p>
            </div>

            {/* The domains */}
            {rows.length === 0 ? (
              <EmptyState icon={<MailCheck size={22} />} title="No sending domains yet"
                body="Add a client’s domain above to start verifying it — then their emails send from their own address." />
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => {
                  const ui = STATUS_UI[row.status];
                  const StatusIcon = ui.icon;
                  const sum = summarizeRecords(row.records);
                  const open = expanded === row.id;
                  return (
                    <li key={row.id} className="rounded-xl border border-forge-border bg-forge-panel/40">
                      <div className="flex items-center gap-3 p-3">
                        <StatusIcon size={16} className={ui.cls} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-forge-ink">{row.domain}</span>
                            <span className={cn('text-[11px] font-medium', ui.cls)}>{statusLabel(row.status)}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-forge-dim">
                            {isDeliveryReady(row.status) ? <>Send as <code className="text-forge-ink">{fromAddressFor(row.domain)}</code></> : <>{sum.verified}/{sum.total} DNS records verified</>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {!isDeliveryReady(row.status) && (
                            <Button variant="primary" size="sm" onClick={() => void doVerify(row)} disabled={busyId === row.id}>
                              {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verify
                            </Button>
                          )}
                          <button onClick={() => void doRefresh(row)} disabled={busyId === row.id} title="Re-check status"
                            className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-ink disabled:opacity-50"><RefreshCw size={13} /></button>
                          <button onClick={() => setExpanded(open ? null : row.id)}
                            className={cn('rounded-lg border px-2 py-1 text-[11px]', open ? 'border-forge-ember/50 text-forge-ember' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                            DNS records
                          </button>
                          <button onClick={() => void remove(row)} title="Remove" className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-err"><Trash2 size={13} /></button>
                        </div>
                      </div>

                      {open && (
                        <div className="border-t border-forge-border/60 px-3 py-3">
                          <p className="mb-2 text-[11px] text-forge-dim">Add these at the domain’s registrar (GoDaddy, Namecheap, Cloudflare…). DNS can take up to an hour to propagate; hit Verify after.</p>
                          {row.records.length === 0 ? (
                            <p className="text-[11px] text-forge-dim">No records returned yet — hit “Re-check status”.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[560px] text-left text-[11px]">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-wide text-forge-dim">
                                    <th className="py-1 pr-2 font-medium">Type</th>
                                    <th className="py-1 pr-2 font-medium">Name / Host</th>
                                    <th className="py-1 pr-2 font-medium">Value</th>
                                    <th className="py-1 pr-2 font-medium">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="align-top">
                                  {row.records.map((rec, i) => {
                                    const verified = (rec.status ?? '').toLowerCase() === 'verified';
                                    return (
                                      <tr key={i} className="border-t border-forge-border/40">
                                        <td className="py-1.5 pr-2 font-mono text-forge-ink">{rec.type}{rec.priority != null ? ` (${rec.priority})` : ''}</td>
                                        <td className="py-1.5 pr-2">
                                          <button onClick={() => void copy(`${row.id}-n-${i}`, rec.name)} className="inline-flex items-center gap-1 font-mono text-forge-dim hover:text-forge-ember">
                                            <span className="max-w-[140px] truncate">{rec.name || '@'}</span>
                                            {copied === `${row.id}-n-${i}` ? <Check size={10} className="text-forge-ok" /> : <Copy size={10} />}
                                          </button>
                                        </td>
                                        <td className="py-1.5 pr-2">
                                          <button onClick={() => void copy(`${row.id}-v-${i}`, rec.value)} className="inline-flex items-center gap-1 font-mono text-forge-dim hover:text-forge-ember">
                                            <span className="max-w-[220px] truncate">{rec.value}</span>
                                            {copied === `${row.id}-v-${i}` ? <Check size={10} className="text-forge-ok" /> : <Copy size={10} />}
                                          </button>
                                        </td>
                                        <td className={cn('py-1.5 pr-2', verified ? 'text-forge-ok' : 'text-forge-dim')}>{verified ? 'verified' : (rec.status ?? 'pending')}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <a href="https://resend.com/docs/dashboard/domains/introduction" target="_blank" rel="noreferrer noopener"
                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-ember">
                            How DNS records work <ExternalLink size={10} />
                          </a>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
