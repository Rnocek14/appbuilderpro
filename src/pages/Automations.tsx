// src/pages/Automations.tsx
// THE AUTOMATIONS DESK — turn on recurring, per-customer automations (recall, seasonal, review) for a
// business's OWN warm customer list, and fire the due ones into the Queue for approval. This is the UI
// half of the trigger engine (app_0076 + automation/triggers*): import a list → switch on a sector
// automation → "Run due now" enqueues an approval-gated send per due customer. Nothing sends without a
// yes; suppression/caps/CAN-SPAM/unsubscribe all come from the one send path.

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { Zap, Loader2, Plus, Play, Pause, Trash2, Upload, Users, CalendarClock, ArrowRight, Info } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { Button, EmptyState } from '../components/ui';
import { cn } from '../lib/utils';
import {
  listCustomerLists, createCustomerList, listCustomers, addCustomers, parseCustomerCsv,
  listTriggers, createTriggerFromCapability, setTriggerStatus, deleteTrigger, CAPABILITIES,
  type CustomerListRow, type CustomerRow, type TriggerRow,
} from '../lib/garvis/automation/triggersStore';
import { runTriggersForOwner, type TriggerRunSummary } from '../lib/garvis/automation/triggersRun';

// Only capabilities that carry a triggerDefault (the date/interval ones) can become a trigger.
const TRIGGERABLE = CAPABILITIES.filter((c) => c.triggerDefault && c.status !== 'not_built');

const ANCHOR_LABEL: Record<string, string> = {
  last_service_at: 'last service', last_visit_at: 'last visit', purchase_at: 'purchase', next_due_at: 'due date',
};

export default function Automations() {
  const { toast } = useToast();
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  const [lists, setLists] = useState<CustomerListRow[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<TriggerRunSummary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, ts] = await Promise.all([listCustomerLists(), listTriggers()]);
      setLists(ls);
      setTriggers(ts);
      setListId((cur) => cur ?? ls[0]?.id ?? null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!listId) { setCustomers([]); return; }
    void listCustomers(listId).then(setCustomers).catch(() => setCustomers([]));
  }, [listId]);

  const newList = async () => {
    const name = window.prompt('Name this customer list (e.g. "Past patients")', 'My customers');
    if (name === null) return;
    try {
      const row = await createCustomerList(name);
      if (row) { setLists((l) => [row, ...l]); setListId(row.id); toast('success', 'List created.'); }
      else toast('error', 'Could not create the list — is the migration applied?');
    } catch (e) { toast('error', emsg(e)); }
  };

  const importCsv = async () => {
    if (!listId) return;
    const parsed = parseCustomerCsv(csv);
    if (parsed.length === 0) { toast('error', 'No valid rows found. Header needs at least email; dates as YYYY-MM-DD.'); return; }
    try {
      const n = await addCustomers(listId, parsed);
      setCsv(''); setCsvOpen(false);
      setCustomers(await listCustomers(listId));
      toast('success', `Imported ${n} customer${n === 1 ? '' : 's'}.`);
    } catch (e) { toast('error', emsg(e)); }
  };

  const addTrigger = async (capabilityId: string) => {
    if (!listId) { toast('error', 'Create a customer list first.'); return; }
    try {
      const row = await createTriggerFromCapability(listId, capabilityId);
      if (row) { setTriggers((t) => [row, ...t]); toast('success', `Turned on "${row.label}".`); }
      else toast('error', 'Could not create the automation — is the migration applied?');
    } catch (e) { toast('error', emsg(e)); }
  };

  const toggle = async (t: TriggerRow) => {
    const next = t.status === 'active' ? 'paused' : 'active';
    setTriggers((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try { await setTriggerStatus(t.id, next); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };

  const remove = async (t: TriggerRow) => {
    if (!window.confirm(`Delete the "${t.label}" automation? Its send history is kept.`)) return;
    setTriggers((ts) => ts.filter((x) => x.id !== t.id));
    try { await deleteTrigger(t.id); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };

  const runNow = async () => {
    setRunning(true); setLastRun(null);
    try {
      const s = await runTriggersForOwner();
      setLastRun(s);
      toast(s.queued > 0 ? 'success' : 'info',
        s.queued > 0 ? `Queued ${s.queued} send${s.queued === 1 ? '' : 's'} for your approval.`
          : s.due === 0 ? 'No customers are due right now.' : 'Nothing new to queue.');
    } catch (e) { toast('error', emsg(e)); }
    finally { setRunning(false); }
  };

  const triggersForList = triggers.filter((t) => t.list_id === listId);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><Zap size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Automations</h1>
        </div>
        <p className="mb-5 text-sm text-forge-dim">
          Recurring, per-customer nudges on a client’s own warm list — recall reminders, seasonal service, review requests.
          Due ones land in your <NavLink to="/garvis/queue" className="text-forge-ember hover:underline">Queue</NavLink> to approve. Nothing sends without your OK.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : lists.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No customer list yet"
            body="Automations run on a business’s own past customers. Create a list and import a few to begin."
            action={<Button variant="primary" size="md" onClick={() => void newList()}><Plus size={15} /> New customer list</Button>} />
        ) : (
          <>
            {/* List picker + actions */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select value={listId ?? ''} onChange={(e) => setListId(e.target.value)}
                className="rounded-lg border border-forge-border bg-forge-bg px-2.5 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none">
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <span className="text-xs text-forge-dim">{customers.length} customer{customers.length === 1 ? '' : 's'}</span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCsvOpen((o) => !o)}><Upload size={13} /> Import CSV</Button>
                <Button variant="outline" size="sm" onClick={() => void newList()}><Plus size={13} /> New list</Button>
                <Button variant="primary" size="sm" onClick={() => void runNow()} disabled={running || triggersForList.length === 0}>
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run due now
                </Button>
              </div>
            </div>

            {lastRun && (
              <div className="mb-4 rounded-lg border border-forge-border bg-forge-panel/40 px-3 py-2 text-xs text-forge-dim">
                Last run — {lastRun.due} due · <span className="text-forge-ok">{lastRun.queued} queued</span>
                {lastRun.skipped > 0 && ` · ${lastRun.skipped} already sent`}
                {lastRun.errors > 0 && <span className="text-forge-warn"> · {lastRun.errors} failed</span>}
                {lastRun.queued > 0 && <NavLink to="/garvis/queue" className="ml-2 text-forge-ember hover:underline">Review in Queue <ArrowRight size={11} className="inline" /></NavLink>}
              </div>
            )}

            {csvOpen && (
              <div className="mb-4 rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] text-forge-dim"><Info size={12} /> Paste CSV — header row with <code className="text-forge-ink">email</code> (required), plus any of <code className="text-forge-ink">name, last_service_at, last_visit_at, purchase_at, next_due_at</code> (dates YYYY-MM-DD).</p>
                <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5}
                  placeholder={'name,email,last_visit_at\nAda Lovelace,ada@example.com,2026-01-16'}
                  className="w-full rounded-lg border border-forge-border bg-forge-bg px-3 py-2 font-mono text-xs text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <div className="mt-2 flex justify-end"><Button variant="primary" size="sm" onClick={() => void importCsv()}><Upload size={13} /> Import</Button></div>
              </div>
            )}

            {/* Active automations for this list */}
            <h2 className="mb-2 text-sm font-semibold text-forge-ink">Automations on this list</h2>
            {triggersForList.length === 0 ? (
              <div className="mb-4 rounded-xl border border-dashed border-forge-border bg-forge-panel/20 p-4 text-center text-xs text-forge-dim">
                None yet — turn one on below.
              </div>
            ) : (
              <div className="mb-5 space-y-2">
                {triggersForList.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', t.status === 'active' ? 'bg-forge-ok/15 text-forge-ok' : 'bg-forge-raised text-forge-dim')}><CalendarClock size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-forge-ink">{t.label}</div>
                      <div className="text-[11px] text-forge-dim">{t.offset_days} days after {ANCHOR_LABEL[t.anchor_field] ?? t.anchor_field} · {t.status}</div>
                    </div>
                    <button onClick={() => void toggle(t)} title={t.status === 'active' ? 'Pause' : 'Resume'}
                      className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-ink">
                      {t.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button onClick={() => void remove(t)} title="Delete"
                      className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-ember">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Turn on a sector automation */}
            <h2 className="mb-2 text-sm font-semibold text-forge-ink">Turn on an automation</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRIGGERABLE.map((c) => (
                <button key={c.id} onClick={() => void addTrigger(c.id)}
                  className="group rounded-xl border border-forge-border bg-forge-panel/40 p-3 text-left hover:border-forge-ember/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-forge-ink">{c.title}</span>
                    <span className="rounded-full bg-forge-raised px-1.5 py-0.5 text-[10px] uppercase text-forge-dim">{c.status}</span>
                    <Plus size={14} className="ml-auto text-forge-dim group-hover:text-forge-ember" />
                  </div>
                  <p className="mt-1 text-[12px] text-forge-dim">{c.pitch}</p>
                  <p className="mt-1 text-[11px] text-forge-dim/70">{c.monthlyPrice}{c.complianceNote ? ` · ${c.complianceNote}` : ''}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
