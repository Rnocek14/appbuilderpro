// src/components/clients/ClientConnections.tsx
// The per-client CONNECTIONS checklist — the one place to hook up a client's accounts. It seeds the
// client's connector rows on first open, refreshes their status against the real connector tables, and
// shows each as a checklist line: green when connected, amber when still needed, with a Connect button
// that deep-links to wherever that connector is set up. The operator can also mark a connector "not
// needed" (this client won't use it) or reopen it. Pure logic lives in connections.ts; I/O in the store.

import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Globe, AtSign, MessageSquare, PhoneMissed, CalendarClock, CreditCard, Star, Calendar, PenLine,
  Loader2, Check, ArrowRight, Circle,
} from 'lucide-react';
import { CONNECTOR_META, connectionRollup, type ConnectorId, type ConnectionStatus } from '../../lib/garvis/clients/connections';
import { refreshConnections, setConnectionStatus, type ConnectionRow } from '../../lib/garvis/clients/connectionsStore';
import { useToast } from '../../context/ToastContext';

const ICON: Record<ConnectorId, typeof Globe> = {
  domain: Globe, email_sender: AtSign, sms_number: MessageSquare, voice_number: PhoneMissed,
  booking: CalendarClock, payments: CreditCard, google_business: Star, calendar: Calendar, esign: PenLine,
};

const DOT: Record<ConnectionStatus, string> = {
  connected: 'text-forge-ok', needed: 'text-forge-warn', pending: 'text-forge-dim',
  error: 'text-forge-ember', not_needed: 'text-forge-dim/40',
};

export function ClientConnections({ clientSubId, tier, refreshKey = 0 }: {
  clientSubId: string; tier: 'website' | 'website_automation'; refreshKey?: number;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConnectionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await refreshConnections(clientSubId, tier)); }
    catch { setRows([]); }
  }, [clientSubId, tier]);
  // Re-refresh when the parent bumps refreshKey (e.g. after saving their Twilio number), so the
  // sms_number line flips to connected without a manual reopen.
  useEffect(() => { void load(); }, [load, refreshKey]);

  const mark = async (row: ConnectionRow, status: ConnectionStatus) => {
    setBusy(row.id);
    // optimistic — the checklist should feel instant
    setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, status } : r)) ?? rs);
    try { await setConnectionStatus(row.id, status); }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not update.'); void load(); }
    finally { setBusy(null); }
  };

  if (rows === null) {
    return <div className="flex items-center gap-2 py-3 text-[11px] text-forge-dim"><Loader2 size={12} className="animate-spin" /> Checking connections…</div>;
  }

  const roll = connectionRollup(rows);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-wide text-forge-dim">Connections</span>
        <span className="text-[10.5px] text-forge-dim">
          <span className={roll.needed === 0 ? 'text-forge-ok' : 'text-forge-ink'}>{roll.connected}</span>/{roll.total} hooked up
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((row) => {
          const meta = CONNECTOR_META[row.connector];
          if (!meta) return null;
          const Icon = ICON[row.connector];
          const connected = row.status === 'connected';
          const notNeeded = row.status === 'not_needed';
          return (
            <li key={row.id} className="flex items-center gap-2 rounded-lg border border-forge-border/60 bg-forge-bg/40 px-2.5 py-1.5">
              <Icon size={14} className={notNeeded ? 'text-forge-dim/40' : 'text-forge-dim'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[12px] font-medium ${notNeeded ? 'text-forge-dim/60' : 'text-forge-ink'}`}>{meta.title}</span>
                  {connected ? <Check size={11} className="text-forge-ok" /> : <Circle size={7} className={DOT[row.status]} fill="currentColor" />}
                </div>
                <div className="truncate text-[10.5px] text-forge-dim">
                  {row.status === 'error' && row.error ? <span className="text-forge-ember">{row.error}</span>
                    : row.detail ? row.detail
                    : !meta.built ? 'coming soon'
                    : meta.what}
                </div>
              </div>
              {/* Action zone */}
              <div className="flex shrink-0 items-center gap-1">
                {!meta.built ? (
                  <span className="text-[10px] text-forge-dim/50">soon</span>
                ) : connected ? (
                  <button onClick={() => void mark(row, 'needed')} disabled={busy === row.id}
                    className="text-[10.5px] text-forge-dim hover:text-forge-ink" title="Re-check / reconnect">Redo</button>
                ) : notNeeded ? (
                  <button onClick={() => void mark(row, 'needed')} disabled={busy === row.id}
                    className="rounded-md border border-forge-border px-2 py-0.5 text-[10.5px] text-forge-dim hover:text-forge-ink">Add</button>
                ) : (
                  <>
                    {meta.setupRoute ? (
                      <NavLink to={meta.setupRoute}
                        className="inline-flex items-center gap-0.5 rounded-md border border-forge-ember/40 px-2 py-0.5 text-[10.5px] text-forge-ember hover:bg-forge-ember/10">
                        {meta.setupLabel} <ArrowRight size={10} />
                      </NavLink>
                    ) : (
                      <span className="text-[10px] text-forge-dim/70" title="Set their number in the field above">↑ field above</span>
                    )}
                    <button onClick={() => void mark(row, 'not_needed')} disabled={busy === row.id}
                      className="text-[10px] text-forge-dim/60 hover:text-forge-dim" title="This client won't use this">skip</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
