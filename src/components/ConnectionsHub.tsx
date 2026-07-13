// src/components/ConnectionsHub.tsx
// One place to connect external providers (Supabase / GitHub / Netlify). Connect once per account —
// the token is stored server-side (never in the browser) and reused by every project. This is the
// foundation the OAuth phases plug into: today you paste a token; later a "Connect" button does OAuth.
import { useState } from 'react';
import { Check, Github, Globe, Database, Loader2, ExternalLink, X, FileSignature } from 'lucide-react';
import { useConnections } from '../hooks/useConnections';
import { useToast } from '../context/ToastContext';
import { Button, Input } from './ui';

const PROVIDERS = [
  { id: 'supabase', label: 'Supabase', icon: Database, oauth: true, hint: 'One-click OAuth — provisions a database per app in your org', url: '' },
  { id: 'github', label: 'GitHub', icon: Github, oauth: true, hint: 'One-click OAuth — export your projects to a repo', url: '' },
  { id: 'netlify', label: 'Netlify', icon: Globe, oauth: false, hint: 'Personal access token (publish the live site)', url: 'https://app.netlify.com/user/applications#personal-access-tokens' },
  { id: 'docusign', label: 'DocuSign', icon: FileSignature, oauth: true, hint: 'One-click OAuth — send paperwork for e-signature (sandbox by default)', url: '' },
] as const;

export function ConnectionsHub() {
  const { loading, isConnected, labelFor, connect, startOAuth, disconnect } = useConnections();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const doOAuth = async (provider: string) => {
    setBusy(provider);
    try { await startOAuth(provider); } // redirects the browser away on success
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not start the connection.'); setBusy(null); }
  };

  const doConnect = async (provider: string) => {
    const token = (drafts[provider] ?? '').trim();
    if (!token) return;
    setBusy(provider);
    try {
      const label = await connect(provider, token);
      setDrafts((d) => ({ ...d, [provider]: '' }));
      toast('success', `${provider} connected${label ? ` as ${label}` : ''}.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not connect.');
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => {
        const connected = isConnected(p.id);
        const label = labelFor(p.id);
        const Icon = p.icon;
        return (
          <div key={p.id} className="rounded-lg border border-forge-border bg-forge-panel p-3">
            <div className="flex items-center gap-2">
              <Icon size={15} className="text-forge-dim" />
              <span className="text-sm font-medium text-forge-ink">{p.label}</span>
              {connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><Check size={12} /> connected{label ? ` · ${label}` : ''}</span>
              ) : p.oauth ? (
                <Button size="sm" className="ml-auto" loading={busy === p.id} disabled={loading} onClick={() => doOAuth(p.id)}>Connect {p.label}</Button>
              ) : (
                <a href={p.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-forge-ember hover:underline">Get token <ExternalLink size={10} /></a>
              )}
              {connected && (
                <button onClick={() => disconnect(p.id)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-err"><X size={11} /> disconnect</button>
              )}
            </div>
            {!connected && !p.oauth && (
              <>
                <p className="mt-1 text-[11px] text-forge-dim">{p.hint}</p>
                <div className="mt-2 flex gap-2">
                  <Input type="password" placeholder={`Paste your ${p.label} token`} value={drafts[p.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))} />
                  <Button size="sm" variant="outline" loading={busy === p.id} disabled={loading || !(drafts[p.id] ?? '').trim()} onClick={() => doConnect(p.id)}>Connect</Button>
                </div>
              </>
            )}
            {!connected && p.oauth && <p className="mt-1 text-[11px] text-forge-dim">{p.hint}</p>}
          </div>
        );
      })}
      <p className="text-[10px] text-forge-dim/70">Tokens are stored securely server-side and never shipped to the browser. Connect once — every project reuses them. OAuth one-click connect is coming.</p>
    </div>
  );
}
