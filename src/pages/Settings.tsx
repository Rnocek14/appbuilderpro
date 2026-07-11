import { useEffect, useState, useSyncExternalStore } from 'react';
import { Upload, KeyRound, BellRing, Cpu, ExternalLink, CheckCircle2, AlertCircle, Check } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { Button, Card, Input } from '../components/ui';
import { ConnectionsHub } from '../components/ConnectionsHub';
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
                onChange={(e) => setModel(provider, e.target.value)}
                placeholder={info.defaultModel}
                title="Or type any model id the provider supports"
                className="font-mono"
              />
            </div>
          </div>

          {/* Always-visible preset chips — the old datalist hid every option that didn't match the
              current value, so newly added models were invisible until the box was cleared. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {info.models.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(provider, m)}
                className={
                  m === model
                    ? 'rounded-full border border-forge-ember bg-forge-ember/10 px-2.5 py-1 font-mono text-[11px] text-forge-ember'
                    : 'rounded-full border border-forge-border px-2.5 py-1 font-mono text-[11px] text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink'
                }
              >
                {m}
              </button>
            ))}
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

/** THE EMAIL FRONT DOOR (audit E1): outreach_settings had no UI, so outbound_enabled stayed false
 *  and every send blocked — the safest pillar was unreachable. This card is the missing config:
 *  the kill switch, sender identity, the CAN-SPAM mailing address (required to send), daily cap,
 *  and timezone (drives the cap window AND your morning brief). All gates stay server-side in
 *  send-email; this only supplies the settings they read. */
function OutreachCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [cap, setCap] = useState('25');
  const [tz, setTz] = useState('America/Chicago');
  // Speed-to-lead: the ONE pre-authorized action class (app_0044) — a template ack to a new lead.
  const [autoTouch, setAutoTouch] = useState(false);
  const [ftSubject, setFtSubject] = useState('');
  const [ftBody, setFtBody] = useState('');

  useEffect(() => {
    if (!session) return;
    let live = true;
    void supabase.from('outreach_settings').select('*').eq('owner_id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const s = data as {
          outbound_enabled?: boolean; from_name?: string | null; from_email?: string | null; reply_to?: string | null;
          company_name?: string | null; physical_address?: string | null; daily_send_cap?: number; timezone?: string;
          auto_first_touch?: boolean; first_touch_subject?: string | null; first_touch_body?: string | null;
        } | null;
        if (s) {
          setEnabled(!!s.outbound_enabled);
          setFromName(s.from_name ?? ''); setFromEmail(s.from_email ?? ''); setReplyTo(s.reply_to ?? '');
          setCompanyName(s.company_name ?? ''); setAddress(s.physical_address ?? '');
          setCap(String(s.daily_send_cap ?? 25)); setTz(s.timezone ?? 'America/Chicago');
          setAutoTouch(!!s.auto_first_touch);
          setFtSubject(s.first_touch_subject ?? ''); setFtBody(s.first_touch_body ?? '');
        }
        setLoaded(true);
      });
    return () => { live = false; };
  }, [session]);

  const canEnable = fromEmail.trim() && address.trim();
  const save = async () => {
    if (!session) return;
    if (enabled && !canEnable) { toast('error', 'To turn sending on you need a from-address and a real mailing address (CAN-SPAM requires it on every email).'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('outreach_settings').upsert({
        owner_id: session.user.id,
        outbound_enabled: enabled && !!canEnable,
        from_name: fromName.trim() || null,
        from_email: fromEmail.trim() || null,
        reply_to: replyTo.trim() || null,
        company_name: companyName.trim() || null,
        physical_address: address.trim() || null,
        daily_send_cap: Math.max(0, Math.min(500, Number(cap) || 0)),
        timezone: tz.trim() || 'America/Chicago',
        auto_first_touch: autoTouch && enabled && !!canEnable,
        first_touch_subject: ftSubject.trim() || null,
        first_touch_body: ftBody.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id' });
      if (error) throw new Error(error.message);
      toast('success', enabled && canEnable ? 'Outreach is ON — approved emails will send, within your daily cap.' : 'Saved. Sending stays off until you flip it on.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save outreach settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;
  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Outreach — sending email</h2>
          <p className="mt-1 text-xs text-forge-dim">
            The master switch for real email. Every send still needs your approval in the queue; this
            sets who it's from, the legally required mailing address, and your daily cap.
          </p>
        </div>
        <button
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          title={enabled ? 'Sending is ON — click to stop all sends' : 'Sending is OFF — every send blocks until enabled'}
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${enabled ? 'border-forge-ok/60 bg-forge-ok/30' : 'border-forge-border bg-forge-panel'}`}
        >
          <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${enabled ? 'left-6 bg-forge-ok' : 'left-0.5 bg-forge-dim'}`} style={{ height: 18, width: 18 }} />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-forge-dim">From name
          <Input className="mt-1" placeholder="Riley from Acme" value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </label>
        <label className="block text-xs text-forge-dim">From email (a domain you can verify with Resend)
          <Input className="mt-1" placeholder="riley@yourdomain.com" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
        </label>
        <label className="block text-xs text-forge-dim">Reply-to (optional)
          <Input className="mt-1" placeholder="inbox@yourdomain.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
        </label>
        <label className="block text-xs text-forge-dim">Company name (footer)
          <Input className="mt-1" placeholder="Acme LLC" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <label className="block text-xs text-forge-dim sm:col-span-2">Mailing address — required by CAN-SPAM, shown in every email footer
          <Input className="mt-1" placeholder="123 Main St, Suite 4, Austin TX 78701" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="block text-xs text-forge-dim">Daily send cap
          <Input className="mt-1" type="number" min={0} max={500} value={cap} onChange={(e) => setCap(e.target.value)} />
          <span className="mt-1 block">0 blocks everything. Start small — deliverability grows with reputation.</span>
        </label>
        <label className="block text-xs text-forge-dim">Timezone (cap window + your morning brief)
          <Input className="mt-1" placeholder="America/Chicago" value={tz} onChange={(e) => setTz(e.target.value)} />
        </label>
      </div>

      {enabled && !canEnable && (
        <p className="mt-3 rounded-lg border border-forge-warn/40 bg-forge-warn/10 px-3 py-2 text-xs text-forge-warn">
          Sending can't turn on yet — add a from-address and mailing address first.
        </p>
      )}

      {/* SPEED-TO-LEAD — the one standing rule. Answering a lead within minutes is ~100x more
          likely to make contact (MIT); this is the only thing Garvis ever sends without a
          per-send click, it's YOUR template verbatim, and it runs through every safety gate. */}
      <div className="mt-5 rounded-lg border border-forge-border bg-forge-bg/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-forge-ink">⚡ Instant first touch (works while you sleep)</p>
            <p className="mt-1 text-xs text-forge-dim">
              When a new lead lands on one of your sites — even at 3am — Garvis instantly sends
              <em> your</em> acknowledgment template so they hear back in seconds, and stamps the lead
              "answered instantly." Your words, filled with their name; never AI-invented. Same
              suppression, cap, and kill-switch gates as every send; every touch lands in the
              execution log. Skips anyone you've already been talking to this week.
            </p>
          </div>
          <button
            onClick={() => setAutoTouch((v) => !v)}
            aria-pressed={autoTouch}
            disabled={!enabled}
            title={!enabled ? 'Turn sending on first' : autoTouch ? 'On — new leads get your template instantly' : 'Off — leads wait for you'}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${autoTouch && enabled ? 'border-forge-ember/60 bg-forge-ember/30' : 'border-forge-border bg-forge-panel'}`}
          >
            <span className={`absolute top-0.5 rounded-full transition-all ${autoTouch && enabled ? 'left-6 bg-forge-ember' : 'left-0.5 bg-forge-dim'}`} style={{ height: 18, width: 18 }} />
          </button>
        </div>
        {autoTouch && enabled && (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-forge-dim">Subject
              <Input className="mt-1" placeholder="Got your message — I’ll reply personally shortly" value={ftSubject} onChange={(e) => setFtSubject(e.target.value)} />
            </label>
            <label className="block text-xs text-forge-dim">
              Message — <code className="text-forge-ember">{'{{first_name}}'}</code> and <code className="text-forge-ember">{'{{business}}'}</code> fill in automatically
              <textarea
                rows={5}
                className="mt-1 w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none"
                placeholder={'Hi {{first_name}},\n\nThanks for reaching out to {{business}} — your message just landed and I wanted you to hear back right away.\n\nI’ll read it properly and reply personally within a few hours. If it’s time-sensitive, just reply to this email and it goes straight to me.\n\nTalk soon'}
                value={ftBody}
                onChange={(e) => setFtBody(e.target.value)}
              />
              <span className="mt-1 block">Leave blank to use the default above. Keep it a human acknowledgment — the personal reply is still yours to write in the morning.</span>
            </label>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Button onClick={() => void save()} loading={saving}>Save outreach settings</Button>
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

        <OutreachCard />

        <Card className="mt-4 p-5">
          <h2 className="text-sm font-medium">Connections</h2>
          <p className="mt-1 mb-3 text-xs text-forge-dim">Connect Supabase, GitHub, and Netlify once — every project reuses them for databases, exports, and publishing.</p>
          <ConnectionsHub />
        </Card>

        <SpendCard />
      </div>
    </AppShell>
  );
}
