// src/components/ConnectionsHub.tsx
// THE API MANAGER — one place to connect everything the platform can use. Driven by the pure
// connectorCatalog (verified): accounts (OAuth/token, consumed from provider_connections), service
// keys (per-user key, platform env key as fallback — the row says WHICH is carrying it), and
// platform-only rows (honest configured/missing status, nothing to paste). Tokens are validated
// LIVE against the provider before they save, stored server-side, never returned to the browser.
import { useState } from 'react';
import {
  Check, Github, Globe, Database, Loader2, ExternalLink, X, FileSignature, Share2,
  Mail, MailOpen, MapPin, Phone, Brain, CreditCard,
} from 'lucide-react';
import { useConnections } from '../hooks/useConnections';
import { useToast } from '../context/ToastContext';
import { Button, Input } from './ui';
import { AyrshareDestinations } from './garvis/AyrshareDestinations';
import { CONNECTOR_CATALOG, connectorStatusLine, type ConnectorSpec } from '../lib/garvis/connectorCatalog';

const ICONS: Record<string, typeof Github> = {
  supabase: Database, github: Github, netlify: Globe, docusign: FileSignature, ayrshare: Share2,
  resend: Mail, lob: MailOpen, google_places: MapPin, twilio: Phone, anthropic: Brain, stripe: CreditCard,
};

const GROUPS: { kind: ConnectorSpec['kind']; title: string; sub: string }[] = [
  { kind: 'account', title: 'Your accounts', sub: 'Connect once — every project and client reuses them.' },
  { kind: 'service', title: 'Service keys', sub: 'Paste a key to run on your own accounts; without one, the platform key carries it where configured.' },
  { kind: 'platform', title: 'Platform', sub: 'Managed with the deployment — shown here so nothing is a mystery.' },
];

export function ConnectionsHub() {
  const { loading, isConnected, labelFor, platformHas, connect, startOAuth, disconnect } = useConnections();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fromDrafts, setFromDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const doOAuth = async (provider: string) => {
    setBusy(provider);
    try { await startOAuth(provider); } // redirects the browser away on success
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not start the connection.'); setBusy(null); }
  };

  const doConnect = async (spec: ConnectorSpec) => {
    const token = (drafts[spec.id] ?? '').trim();
    if (!token) return;
    setBusy(spec.id);
    try {
      const from = (fromDrafts[spec.id] ?? '').trim();
      const label = await connect(spec.id, token, spec.needsFromNumber && from ? { from_number: from } : undefined);
      setDrafts((d) => ({ ...d, [spec.id]: '' }));
      setFromDrafts((d) => ({ ...d, [spec.id]: '' }));
      toast('success', `${spec.name} connected${label ? ` as ${label}` : ''}.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not connect.');
    } finally { setBusy(null); }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-[12px] text-forge-dim"><Loader2 size={13} className="animate-spin" /> Loading connections…</div>;
  }

  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <div key={g.kind}>
          <div className="mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-forge-dim">{g.title}</span>
            <p className="text-[11px] text-forge-dim/70">{g.sub}</p>
          </div>
          <div className="space-y-2">
            {CONNECTOR_CATALOG.filter((p) => p.kind === g.kind).map((p) => {
              const connected = p.kind !== 'platform' && isConnected(p.id);
              const status = connectorStatusLine(p, {
                connected, label: labelFor(p.id), platformConfigured: platformHas(p.id),
              });
              const healthy = connected || (p.kind === 'platform' && platformHas(p.id))
                || (p.kind === 'service' && platformHas(p.id));
              const Icon = ICONS[p.id] ?? Globe;
              return (
                <div key={p.id} className="rounded-lg border border-forge-border bg-forge-panel p-3">
                  <div className="flex items-center gap-2">
                    <Icon size={15} className="text-forge-dim" />
                    <span className="text-sm font-medium text-forge-ink">{p.name}</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] ${healthy ? 'text-emerald-400' : 'text-forge-dim'}`}>
                      {healthy && <Check size={12} />} {status}
                    </span>
                    {!connected && p.oauth && (
                      <Button size="sm" className="ml-auto" loading={busy === p.id} onClick={() => doOAuth(p.id)}>Connect {p.name}</Button>
                    )}
                    {!connected && !p.oauth && p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline">Get key <ExternalLink size={10} /></a>
                    )}
                    {connected && (
                      <button onClick={() => void disconnect(p.id)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-err"><X size={11} /> disconnect</button>
                    )}
                  </div>
                  {!connected && p.kind !== 'platform' && <p className="mt-1 text-[11px] text-forge-dim">{p.hint}</p>}
                  {!connected && !p.oauth && p.kind !== 'platform' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input type="password" placeholder={p.tokenPlaceholder ? `Paste ${p.tokenPlaceholder}` : `Paste your ${p.name} token`}
                        value={drafts[p.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))} />
                      {p.needsFromNumber && (
                        <Input placeholder="+1 555 123 4567 (your Twilio number)"
                          value={fromDrafts[p.id] ?? ''} onChange={(e) => setFromDrafts((d) => ({ ...d, [p.id]: e.target.value }))} />
                      )}
                      <Button size="sm" variant="outline" loading={busy === p.id} disabled={!(drafts[p.id] ?? '').trim()} onClick={() => void doConnect(p)}>Connect</Button>
                    </div>
                  )}
                  {/* Multi-business destinations (app_0084): each brand posts to ITS OWN accounts. */}
                  {connected && p.id === 'ayrshare' && <AyrshareDestinations />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-forge-dim/70">Keys are verified live against the provider when you connect, stored server-side, and never shipped to the browser.</p>
    </div>
  );
}
