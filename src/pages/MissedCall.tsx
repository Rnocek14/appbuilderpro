// src/pages/MissedCall.tsx
// MISSED-CALL TEXT-BACK desk — the operator configures, per client, the Twilio number that rings the
// business line and auto-texts anyone whose call goes unanswered. The config row IS the pre-authorization
// (a fixed transactional template + numbers); the voice-inbound webhook does the rest on the clock.
// Nothing rings or texts until Twilio secrets are set, a number's Voice webhook points here, and a
// config is switched on.

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { PhoneMissed, Loader2, Plus, Trash2, Info, Copy, Check, Power, Rocket, PhoneForwarded } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useToast } from '../context/ToastContext';
import { Button, StatCard, EmptyState, LoadError } from '../components/ui';
import { cn } from '../lib/utils';
import { supabaseUrl } from '../lib/supabase';
import {
  listMissedCallConfigs, createMissedCallConfig, updateMissedCallConfig, deleteMissedCallConfig,
  setMissedCallClient, listMissedCallEvents, DEFAULT_MISSED_CALL_TEMPLATE,
  type MissedCallConfig, type MissedCallEvent,
} from '../lib/garvis/missedCallStore';
import { listClientSubs, type ClientSubRow } from '../lib/garvis/billing/clientBilling';

const WEBHOOK_URL = `${supabaseUrl}/functions/v1/voice-inbound`;

export default function MissedCall() {
  const { toast } = useToast();
  const emsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [configs, setConfigs] = useState<MissedCallConfig[]>([]);
  const [events, setEvents] = useState<MissedCallEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // add-config form
  const [label, setLabel] = useState('');
  const [twilioNumber, setTwilioNumber] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [template, setTemplate] = useState(DEFAULT_MISSED_CALL_TEMPLATE);
  const [ringSeconds, setRingSeconds] = useState('20');

  const [clients, setClients] = useState<ClientSubRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [cs, evs, cl] = await Promise.all([listMissedCallConfigs(), listMissedCallEvents(), listClientSubs()]);
      setConfigs(cs); setEvents(evs); setClients(cl);
    } catch (e) { setLoadFailed(true); toast('error', emsg(e)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const attachClient = async (c: MissedCallConfig, clientId: string | null) => {
    setConfigs((cs) => cs.map((x) => (x.id === c.id ? { ...x, client_subscription_id: clientId } : x)));
    try { await setMissedCallClient(c.id, clientId); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };

  const copyWebhook = async () => {
    try { await navigator.clipboard.writeText(WEBHOOK_URL); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast('error', 'Could not copy.'); }
  };

  const add = async () => {
    if (!twilioNumber.trim() || !forwardTo.trim()) { toast('error', 'Twilio number and the business line to ring are both required.'); return; }
    setSaving(true);
    try {
      const row = await createMissedCallConfig({
        label, twilio_number: twilioNumber, forward_to: forwardTo, business_name: businessName,
        template, ring_seconds: Math.max(5, Math.min(60, parseInt(ringSeconds, 10) || 20)),
      });
      setConfigs((c) => [row, ...c]);
      setLabel(''); setTwilioNumber(''); setForwardTo(''); setBusinessName(''); setTemplate(DEFAULT_MISSED_CALL_TEMPLATE); setRingSeconds('20');
      toast('success', 'Saved. Point this Twilio number’s Voice webhook at the URL above, then switch it on.');
    } catch (e) { toast('error', emsg(e)); }
    finally { setSaving(false); }
  };

  const toggle = async (c: MissedCallConfig) => {
    const enabled = !c.enabled;
    setConfigs((cs) => cs.map((x) => (x.id === c.id ? { ...x, enabled } : x)));
    try { await updateMissedCallConfig(c.id, { enabled }); }
    catch (e) { toast('error', emsg(e)); void refresh(); }
  };
  const remove = async (c: MissedCallConfig) => {
    if (!window.confirm(`Remove the missed-call text-back for ${c.label || c.twilio_number}?`)) return;
    setConfigs((cs) => cs.filter((x) => x.id !== c.id));
    try { await deleteMissedCallConfig(c.id); } catch (e) { toast('error', emsg(e)); void refresh(); }
  };

  const textedBack = events.filter((e) => e.texted_back).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forge-ember/15 text-forge-ember"><PhoneMissed size={18} /></span>
          <h1 className="text-xl font-semibold text-forge-ink">Missed-call text-back</h1>
        </div>
        <p className="mb-5 text-sm text-forge-dim">
          Every missed call is a job walking to a competitor. Ring the business line first, and if no one picks up,
          auto-text the caller within seconds — “Sorry we missed you, how can we help?” Each text is a single,
          fixed, transactional reply to someone who <em>just called</em>; STOP is always honored.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-forge-dim"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : loadFailed ? (
          <LoadError message="Couldn’t load your missed-call setup." onRetry={() => void refresh()} />
        ) : (
          <>
            {/* Activity summary */}
            <div className="mb-5 grid grid-cols-3 gap-3">
              <StatCard label="Configured numbers" value={String(configs.length)} hint={`${configs.filter((c) => c.enabled).length} live`} />
              <StatCard label="Recent calls seen" value={String(events.length)} hint="last 25" />
              <StatCard label="Texted back" value={String(textedBack)} hint="recovered leads" />
            </div>

            {/* Setup: the webhook URL + required secrets */}
            <div className="mb-5 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-forge-ink"><Info size={15} className="text-forge-ember" /> One-time Twilio setup</div>
              <ol className="mb-3 ml-4 list-decimal space-y-1 text-[12px] text-forge-dim">
                <li>Set <code className="text-forge-ink">TWILIO_ACCOUNT_SID</code> + <code className="text-forge-ink">TWILIO_AUTH_TOKEN</code> in Supabase secrets (same as SMS).</li>
                <li>In Twilio, open the phone number and set its <span className="text-forge-ink">Voice &amp; Fax → A Call Comes In</span> webhook (HTTP POST) to the URL below.</li>
                <li>Add the number here with the business’s real line to ring, then switch it on.</li>
              </ol>
              <div className="flex items-center gap-2 rounded-lg border border-forge-border bg-forge-bg px-3 py-2">
                <code className="flex-1 truncate text-[11px] text-forge-ink">{WEBHOOK_URL}</code>
                <button onClick={() => void copyWebhook()} className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-2 py-1 text-[11px] text-forge-dim hover:text-forge-ink">
                  {copied ? <Check size={11} className="text-forge-ok" /> : <Copy size={11} />} Copy
                </button>
              </div>
            </div>

            {/* Add a number */}
            <div className="mb-5 rounded-2xl border border-forge-border bg-forge-panel/40 p-4">
              <div className="mb-3 text-sm font-medium text-forge-ink">Add a number</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Joe’s Plumbing)"
                  className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name (fills {business})"
                  className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <input value={twilioNumber} onChange={(e) => setTwilioNumber(e.target.value)} placeholder="Twilio number, E.164 (+15551234567)"
                  className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <div className="flex items-center gap-1 rounded-lg border border-forge-border bg-forge-bg px-3">
                  <PhoneForwarded size={13} className="shrink-0 text-forge-dim" />
                  <input value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} placeholder="Ring this real line (+15559998888)"
                    className="flex-1 bg-transparent py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:outline-none" />
                </div>
                <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={2}
                  placeholder={DEFAULT_MISSED_CALL_TEMPLATE}
                  className="sm:col-span-2 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-forge-dim">Ring for</label>
                  <input value={ringSeconds} onChange={(e) => setRingSeconds(e.target.value)} inputMode="numeric"
                    className="w-16 rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
                  <span className="text-xs text-forge-dim">sec before it’s “missed”</span>
                  <Button variant="primary" size="sm" className="ml-auto" onClick={() => void add()} disabled={saving}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Configured numbers */}
            {configs.length === 0 ? (
              <EmptyState icon={<PhoneMissed size={22} />} title="No numbers yet"
                body="Add a client’s Twilio number and the business line it should ring. Missed calls get an instant text back."
                action={<NavLink to="/garvis/client-billing" className="inline-flex items-center gap-1.5 rounded-lg bg-forge-ember px-3 py-2 text-sm font-medium text-white hover:bg-forge-ember/90"><Rocket size={15} /> Sell it to a client</NavLink>} />
            ) : (
              <div className="mb-5 space-y-2">
                {configs.map((c) => (
                  <div key={c.id} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                    <div className="flex items-center gap-3">
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', c.enabled ? 'bg-forge-ok/15 text-forge-ok' : 'bg-forge-raised text-forge-dim')}><PhoneMissed size={15} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-forge-ink">{c.label || c.twilio_number}</div>
                        <div className="text-[11px] text-forge-dim">{c.twilio_number} → rings {c.forward_to} for {c.ring_seconds}s · {c.enabled ? 'live' : 'off'}</div>
                        {clients.length > 0 && (
                          <select value={c.client_subscription_id ?? ''} onChange={(e) => void attachClient(c, e.target.value || null)}
                            title="Attribute this number to a paying client"
                            className="mt-1 rounded border border-forge-border bg-forge-bg px-1.5 py-0.5 text-[10.5px] text-forge-dim focus:border-forge-ember/60 focus:outline-none">
                            <option value="">Unassigned</option>
                            {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.business_name}</option>)}
                          </select>
                        )}
                      </div>
                      <button onClick={() => void toggle(c)} title={c.enabled ? 'Switch off' : 'Switch on'}
                        className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]',
                          c.enabled ? 'border-forge-ok/50 text-forge-ok' : 'border-forge-border text-forge-dim hover:text-forge-ink')}>
                        <Power size={12} /> {c.enabled ? 'On' : 'Off'}
                      </button>
                      <button onClick={() => void remove(c)} title="Remove" className="rounded-lg border border-forge-border p-1.5 text-forge-dim hover:text-forge-ember"><Trash2 size={13} /></button>
                    </div>
                    <p className="mt-2 rounded-lg bg-forge-bg/60 px-2.5 py-1.5 text-[11.5px] italic text-forge-dim">“{c.template}”</p>
                  </div>
                ))}
              </div>
            )}

            {/* Recent activity */}
            {events.length > 0 && (
              <>
                <h2 className="mb-2 text-sm font-semibold text-forge-ink">Recent calls</h2>
                <div className="overflow-x-auto rounded-xl border border-forge-border">
                  <table className="w-full min-w-[520px] text-left text-[12.5px]">
                    <thead>
                      <tr className="bg-forge-panel/40 text-[10.5px] uppercase tracking-wide text-forge-dim">
                        <th className="px-3 py-2 font-medium">From</th>
                        <th className="px-3 py-2 font-medium">Outcome</th>
                        <th className="px-3 py-2 font-medium">Texted back</th>
                        <th className="px-3 py-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-t border-forge-border/60">
                          <td className="px-3 py-2 tabular-nums text-forge-ink">{e.from_number ?? '—'}</td>
                          <td className="px-3 py-2 text-forge-dim">{e.dial_status ?? '—'}</td>
                          <td className="px-3 py-2">{e.texted_back
                            ? <span className="text-forge-ok">Yes</span>
                            : <span className="text-forge-dim">{e.note ?? 'No'}</span>}</td>
                          <td className="px-3 py-2 text-forge-dim">{new Date(e.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
