import { useEffect, useState, useSyncExternalStore } from 'react';
import { Upload, KeyRound, BellRing, Cpu, ExternalLink, CheckCircle2, AlertCircle, Check } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Button, Card, Input } from '../components/ui';
import {
  PROVIDERS, providerInfo, resolveAI, subscribeAIConfig,
  getProvider, getModel, getKey, setProvider, setModel, setKey, DIRECT,
  type Provider,
} from '../lib/aiConfig';
import { spendTotals, subscribeUsage, clearUsage, formatUSD } from '../lib/usage';

/** Runtime AI provider / model / key editor (drives the local DIRECT path). */
function AIProviderCard() {
  useSyncExternalStore(subscribeAIConfig, () => {
    const ai = resolveAI();
    return ai.provider + '|' + ai.model + '|' + (ai.ready ? '1' : '0');
  });
  const provider = getProvider();
  const info = providerInfo(provider);
  const model = getModel(provider);
  const ai = resolveAI();

  // Key is a draft committed with Save (explicit confirmation; never stores a half-typed key).
  const [keyDraft, setKeyDraft] = useState(getKey(provider));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setKeyDraft(getKey(provider)); setSaved(false); }, [provider]);
  const dirty = keyDraft.trim() !== getKey(provider);
  const saveKey = () => { setKey(provider, keyDraft.trim()); setSaved(true); };

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-start gap-3">
        <Cpu size={16} className="mt-0.5 shrink-0 text-forge-ember" />
        <div className="flex-1">
          <p className="text-sm font-medium text-forge-ink">Coding model</p>
          <p className="mt-1 text-xs text-forge-dim">
            Choose which provider and model writes your code, and paste the matching API key. The choice is
            saved in this browser and applies to your next message — no rebuild.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-forge-dim" htmlFor="ai-provider">Provider</label>
              <select
                id="ai-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink focus:border-forge-ember/60 focus:outline-none"
              >
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-forge-dim" htmlFor="ai-model">Model</label>
              <Input
                id="ai-model"
                value={model}
                list="ai-model-list"
                onChange={(e) => setModel(provider, e.target.value)}
                placeholder={info.defaultModel}
                className="font-mono"
              />
              <datalist id="ai-model-list">
                {info.models.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
          </div>

          <p className="mt-2 text-xs text-forge-dim">{info.blurb}</p>

          {info.needsKey && (
            <div className="mt-3">
              <label className="mb-1 flex items-center gap-1.5 text-xs text-forge-dim" htmlFor="ai-key">
                <KeyRound size={12} /> {info.label} API key
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="ai-key"
                  type="password"
                  value={keyDraft}
                  onChange={(e) => { setKeyDraft(e.target.value); setSaved(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveKey(); }}
                  placeholder={info.keyPlaceholder}
                  autoComplete="off"
                  className="font-mono"
                />
                <Button size="sm" onClick={saveKey} disabled={!dirty} className="shrink-0">
                  {saved && !dirty ? <><Check size={14} /> Saved</> : 'Save key'}
                </Button>
              </div>
              <a href={info.keysUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-forge-dim hover:text-forge-ember">
                Get a key <ExternalLink size={11} />
              </a>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 text-xs">
            {ai.ready
              ? <><CheckCircle2 size={14} className="text-forge-ok" /><span className="text-forge-dim">Ready — <span className="font-mono text-forge-ink">{model}</span> on {info.label}.</span></>
              : <><AlertCircle size={14} className="text-forge-err" /><span className="text-forge-err">Add an API key to use {info.label}.</span></>}
          </div>

          {!DIRECT && (
            <p className="mt-3 rounded-lg border border-forge-border bg-forge-raised p-2.5 text-xs text-forge-dim">
              This instance runs in edge mode: live calls use server-side keys set by the operator
              (<code className="font-mono">supabase secrets set</code>). This picker drives local/direct mode.
            </p>
          )}
          <p className="mt-2 text-[11px] text-forge-dim">
            Keys are stored only in this browser's local storage and sent directly to the provider — never to FableForge's servers.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Estimated AI spend per provider (from the local usage ledger). */
function SpendCard() {
  const { toast } = useToast();
  const key = useSyncExternalStore(subscribeUsage, () => {
    const t = spendTotals();
    return t.total + ':' + t.byProvider.length;
  });
  void key;
  const totals = spendTotals();

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-forge-ink">AI spend (estimated)</p>
          <p className="mt-1 text-xs text-forge-dim">
            Token cost of your AI calls in this browser, in direct mode. Figures are estimates from a
            built-in price table and may drift from your provider's invoice.
          </p>
        </div>
        <p className="shrink-0 font-display text-xl font-semibold text-forge-ember">~{formatUSD(totals.total)}</p>
      </div>

      {totals.byProvider.length === 0 ? (
        <p className="mt-4 text-xs text-forge-dim">No usage recorded yet — send a message to start tracking.</p>
      ) : (
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="text-left text-forge-dim">
              <th className="pb-1 font-medium">Provider</th>
              <th className="pb-1 text-right font-medium">Calls</th>
              <th className="pb-1 text-right font-medium">Tokens (in / out)</th>
              <th className="pb-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {totals.byProvider.map((p) => (
              <tr key={p.provider} className="border-t border-forge-border">
                <td className="py-1.5">{providerInfo(p.provider).label}</td>
                <td className="py-1.5 text-right font-mono">{p.calls}</td>
                <td className="py-1.5 text-right font-mono text-forge-dim">
                  {(p.inputTokens / 1000).toFixed(1)}k / {(p.outputTokens / 1000).toFixed(1)}k
                </td>
                <td className="py-1.5 text-right font-mono text-forge-ink">~{formatUSD(p.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { clearUsage(); toast('info', 'Spend history cleared.'); }}
          disabled={totals.byProvider.length === 0}
        >
          Reset spend history
        </Button>
      </div>
    </Card>
  );
}

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [webhookUrl, setWebhookUrl] = useState(profile?.webhook_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName.trim(), webhook_url: webhookUrl.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    setSaving(false);
    if (error) toast('error', error.message);
    else { toast('success', 'Profile saved.'); refreshProfile(); }
  };

  const uploadAvatar = async (file: File) => {
    if (!profile) return;
    if (file.size > 2 * 1024 * 1024) return toast('error', 'Avatar must be under 2 MB.');
    setUploading(true);
    const path = `${profile.id}/avatar-${Date.now()}`;
    const { error } = await supabase.storage.from('project-assets').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('project-assets').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);
      toast('success', 'Avatar updated.');
      refreshProfile();
    } else {
      toast('error', error.message);
    }
    setUploading(false);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-xl font-semibold">Settings</h1>

        <Card className="mt-6 p-5">
          <h2 className="text-sm font-medium">Profile</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-forge-dim" htmlFor="full-name">Full name</label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-forge-dim" htmlFor="email">Email</label>
              <Input id="email" value={profile?.email ?? ''} disabled className="opacity-60" />
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-forge-border px-3 py-2 text-xs text-forge-dim hover:border-forge-ember/40 hover:text-forge-ink">
                <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload avatar'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </label>
              {profile?.avatar_url && <img src={profile.avatar_url} alt="Your avatar" className="h-9 w-9 rounded-full border border-forge-border object-cover" />}
            </div>
            <label className="block text-xs text-forge-dim">
              <span className="flex items-center gap-1.5"><BellRing size={12} /> Notification webhook (Discord, Slack, or any URL)</span>
              <Input
                className="mt-1"
                placeholder="https://discord.com/api/webhooks/…"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <span className="mt-1 block">
                Autopilot pings this when a build finishes, fails, pauses, or needs an answer — so you can
                check in from your phone.
              </span>
            </label>
            <Button onClick={saveProfile} loading={saving}>Save changes</Button>
          </div>
        </Card>

        <AIProviderCard />
        <SpendCard />
      </div>
    </AppShell>
  );
}
