import { useState } from 'react';
import { Megaphone, Sparkles, ChevronDown, ChevronRight, Check, X, Copy, Send, Trash2, AlertTriangle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { usePortfolio } from '../hooks/usePortfolio';
import { useMarketing } from '../hooks/useMarketing';
import { useToast } from '../context/ToastContext';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui';
import { timeAgo } from '../lib/utils';
import { CHANNEL_OPTS, copyText } from '../lib/garvis/channels';
import type { MarketingAsset, MarketingCampaignStatus } from '../types';

const CAMPAIGN_TONE: Record<MarketingCampaignStatus, 'dim' | 'ember' | 'ok' | 'warn'> = {
  generating: 'ember', review: 'warn', active: 'ok', done: 'ok', failed: 'warn',
};
const KIND_LABEL: Record<string, string> = {
  strategy: 'Strategy', calendar: 'Content calendar', social_post: 'Social posts', email: 'Email', landing_page: 'Landing page',
};
const KIND_ORDER = ['strategy', 'calendar', 'social_post', 'email', 'landing_page'];

function val(c: Record<string, unknown>, k: string): string { return typeof c[k] === 'string' ? (c[k] as string) : ''; }
function arr(c: Record<string, unknown>, k: string): string[] { return Array.isArray(c[k]) ? (c[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []; }

function AssetBody({ asset }: { asset: MarketingAsset }) {
  const c = asset.content;
  if (asset.kind === 'strategy') {
    return (
      <div className="space-y-1 text-xs text-forge-dim">
        <p><span className="text-forge-ink">Positioning:</span> {val(c, 'positioning')}</p>
        <p><span className="text-forge-ink">Audience:</span> {val(c, 'audience')}</p>
        <p><span className="text-forge-ink">Channels:</span> {arr(c, 'channels').join(', ')}</p>
        {arr(c, 'key_messages').length > 0 && <p><span className="text-forge-ink">Messages:</span> {arr(c, 'key_messages').join(' · ')}</p>}
      </div>
    );
  }
  if (asset.kind === 'calendar') {
    const entries = Array.isArray(c.entries) ? (c.entries as Record<string, unknown>[]) : [];
    return (
      <ul className="space-y-0.5 text-xs text-forge-dim">
        {entries.map((e, i) => <li key={i}><span className="text-forge-ink">{val(e, 'when')}</span> · {val(e, 'channel')} — {val(e, 'theme')}</li>)}
      </ul>
    );
  }
  if (asset.kind === 'social_post') {
    return (
      <div className="space-y-1 text-xs text-forge-dim">
        <p className="font-medium text-forge-ink">{val(c, 'hook')}</p>
        <p className="whitespace-pre-wrap">{val(c, 'body')}</p>
        <p className="text-forge-ember">{val(c, 'cta')}</p>
        <p className="text-forge-dim/70">{arr(c, 'hashtags').join(' ')}</p>
      </div>
    );
  }
  if (asset.kind === 'email') {
    return (
      <div className="space-y-1 text-xs text-forge-dim">
        <p><span className="text-forge-ink">Subject:</span> {val(c, 'subject')}</p>
        <p className="whitespace-pre-wrap">{val(c, 'body')}</p>
        <p className="text-forge-ember">{val(c, 'cta')}</p>
      </div>
    );
  }
  // landing_page
  const sections = Array.isArray(c.sections) ? (c.sections as Record<string, unknown>[]) : [];
  return (
    <div className="space-y-1 text-xs text-forge-dim">
      <p className="font-display text-sm font-semibold text-forge-ink">{val(c, 'headline')}</p>
      <p>{val(c, 'subhead')}</p>
      {sections.map((s, i) => <p key={i}><span className="text-forge-ink">{val(s, 'heading')}:</span> {val(s, 'body')}</p>)}
      <p className="text-forge-ember">[{val(c, 'cta')}]</p>
    </div>
  );
}

function AssetCard({ asset, onApprove, onReject, onPublish, onChannel, onCopy }: {
  asset: MarketingAsset;
  onApprove: () => void; onReject: () => void; onPublish: () => void;
  onChannel: (ch: string) => void; onCopy: () => void;
}) {
  const v = asset.verify;
  const hasChannel = asset.kind === 'social_post' || asset.kind === 'email';
  return (
    <div className="rounded border border-forge-border p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-forge-ink">{asset.title}</span>
        <Badge tone={asset.status === 'published' ? 'ok' : asset.status === 'rejected' ? 'dim' : asset.status === 'approved' ? 'ember' : 'dim'}>{asset.status}</Badge>
        {v && !v.ok && <span className="inline-flex items-center gap-1 text-[10px] text-forge-err"><AlertTriangle size={10} /> {v.issues.join('; ')}</span>}
        {v && v.ok && v.warnings.length > 0 && <span className="text-[10px] text-forge-dim/70">⚠ {v.warnings.join('; ')}</span>}
      </div>

      <AssetBody asset={asset} />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hasChannel && asset.status !== 'published' && (
          <select
            value={asset.channel ?? 'manual'}
            onChange={(e) => onChannel(e.target.value)}
            className="rounded border border-forge-border bg-forge-panel px-1.5 py-0.5 text-[10px] text-forge-dim focus:border-forge-ember focus:outline-none"
          >
            {CHANNEL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <Button variant="ghost" onClick={onCopy} title="Copy to clipboard"><Copy size={13} /></Button>
        {asset.status === 'draft' && (
          <>
            <Button variant="ghost" onClick={onApprove} disabled={!!v && !v.ok} title={v && !v.ok ? `Fix first: ${v.issues.join('; ')}` : 'Approve'}><Check size={13} /> Approve</Button>
            <Button variant="ghost" onClick={onReject} title="Reject"><X size={13} /></Button>
          </>
        )}
        {asset.status === 'scheduled' && (asset.channel === 'x' || asset.channel === 'linkedin') ? (
          // Already queued through the real social rail — the send happens from the approval Queue.
          <span className="text-[10px] text-forge-ember">queued — approve it in the Queue to post</span>
        ) : (asset.status === 'approved' || asset.status === 'scheduled') && (
          <Button
            onClick={onPublish}
            title={asset.channel === 'x' || asset.channel === 'linkedin'
              ? 'Queue as a real social post (posts via Ayrshare after you approve it in the Queue)'
              : 'Open the prefilled composer, then mark published'}
          ><Send size={13} /> Publish</Button>
        )}
        {asset.status === 'published' && asset.published_at && (
          <span className="text-[10px] text-forge-dim/70">published {timeAgo(asset.published_at)}</span>
        )}
      </div>
    </div>
  );
}

export default function Marketing() {
  const { apps } = usePortfolio();
  const { campaigns, assetsByCampaign, loading, runningId, runCampaign, setAssetChannel, approveAsset, rejectAsset, publishAsset, deleteCampaign } = useMarketing();
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [brief, setBrief] = useState('');
  const [appId, setAppId] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const onRun = async () => {
    if (!subject.trim()) { toast('info', 'Tell Garvis what to market.'); return; }
    setProgress('Starting…');
    try {
      const id = await runCampaign({ subject: subject.trim(), brief: brief.trim() || undefined, appId: appId || null, onProgress: setProgress });
      if (id) { setOpenId(id); setSubject(''); setBrief(''); toast('success', 'Campaign ready — review the drafts below.'); }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The marketing worker failed.');
    } finally {
      setProgress(null);
    }
  };

  const copy = async (a: MarketingAsset) => {
    try { await navigator.clipboard.writeText(copyText(a.kind, a.content)); toast('success', 'Copied.'); }
    catch { toast('error', 'Could not copy.'); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Megaphone size={20} className="text-forge-ember" />
          <div>
            <h1 className="font-display text-xl font-semibold">Marketing worker</h1>
            <p className="text-sm text-forge-dim">Tell Garvis what to grow — it comes back with strategy, a calendar, posts, an email, and a landing page.</p>
          </div>
        </div>

        {/* Intake — the "talk to Garvis" front door for marketing. */}
        <Card className="mb-6 p-4">
          <label className="mb-1 block text-xs font-medium text-forge-dim">What should Garvis market?</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. my mom's real-estate business in Lake Geneva"
            className="mb-3 w-full rounded border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink focus:border-forge-ember focus:outline-none"
          />
          <label className="mb-1 block text-xs font-medium text-forge-dim">Brief / goal <span className="text-forge-dim/60">(optional)</span></label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            placeholder="What's the goal? Who's the audience? Anything Garvis should know."
            className="mb-3 w-full rounded border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink focus:border-forge-ember focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="rounded border border-forge-border bg-forge-panel px-2 py-1.5 text-xs text-forge-dim focus:border-forge-ember focus:outline-none"
            >
              <option value="">External — not a portfolio app</option>
              {apps.map((a) => <option key={a.id} value={a.id}>Link to: {a.name}</option>)}
            </select>
            <Button onClick={onRun} loading={!!runningId} disabled={!!runningId}><Sparkles size={15} /> Run marketing worker</Button>
            {progress && <Spinner label={progress} />}
          </div>
          <p className="mt-2 text-[11px] text-forge-dim/60">Everything comes back as drafts you review. Social posts queue through the real approval spine (they post via Ayrshare after you approve); email opens a prefilled composer. Nothing goes out without you.</p>
        </Card>

        {loading ? (
          <div className="py-16 text-center"><Spinner label="Loading campaigns…" /></div>
        ) : campaigns.length === 0 ? (
          <EmptyState icon={<Megaphone size={28} />} title="No campaigns yet" body="Give Garvis a brief above and it'll produce a full first-draft campaign in under a minute." />
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const open = openId === c.id;
              const cAssets = (assetsByCampaign[c.id] ?? []).slice().sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
              const grouped = KIND_ORDER.map((k) => ({ kind: k, items: cAssets.filter((a) => a.kind === k) })).filter((g) => g.items.length > 0);
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start gap-2">
                    <button onClick={() => setOpenId(open ? null : c.id)} className="mt-0.5 text-forge-dim hover:text-forge-ink">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold">{c.subject}</span>
                        <Badge tone={CAMPAIGN_TONE[c.status]}>{c.status === 'generating' && c.id === runningId ? (progress ?? 'generating') : c.status}</Badge>
                        <span className="text-[11px] text-forge-dim/60">{timeAgo(c.created_at)}</span>
                      </div>
                      {c.summary && <p className="mt-1 text-xs text-forge-dim">{c.summary}</p>}
                    </div>
                    <button onClick={() => { if (window.confirm('Delete this campaign and its assets? This can\'t be undone.')) deleteCampaign(c.id); }} className="text-forge-dim/60 hover:text-forge-err" title="Delete campaign"><Trash2 size={14} /></button>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-3 animate-fadeInUp">
                      {grouped.length === 0 && <p className="text-xs text-forge-dim">No assets — the worker may still be running or have failed.</p>}
                      {grouped.map((g) => (
                        <div key={g.kind}>
                          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-forge-dim">{KIND_LABEL[g.kind]} · {g.items.length}</p>
                          <div className="space-y-2">
                            {g.items.map((a) => (
                              <AssetCard
                                key={a.id}
                                asset={a}
                                onApprove={() => approveAsset(a.id)}
                                onReject={() => rejectAsset(a.id)}
                                onPublish={() => {
                                  void publishAsset(a)
                                    .then((r) => toast(r === 'queued' ? 'info' : 'success', r === 'queued'
                                      ? 'Queued as a real social post — approve it in the Queue and it posts via Ayrshare.'
                                      : 'Composer opened — marked published.'))
                                    .catch((e) => toast('error', e instanceof Error ? e.message : 'Publish failed — the asset is unchanged.'));
                                }}
                                onChannel={(ch) => setAssetChannel(a.id, ch)}
                                onCopy={() => copy(a)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
