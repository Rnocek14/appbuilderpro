// src/pages/PreviewEngine.tsx
// Admin side of the Business Website Preview Engine: paste (or demo-load) a Business Profile
// JSON, generate a preview site, and manage the fleet. This is the interactive front door to the
// same `ingestBusinessProfile` handoff the future scraper/lead-engine will call programmatically.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Sparkles, ExternalLink, RefreshCw, Trash2, Copy, Loader2, Camera, FileText, Inbox, KeyRound, Plus, Send } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card, Badge, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import {
  ingestBusinessProfile, listPreviewSites, regeneratePreviewSite, deletePreviewSite, previewUrlFor,
  listPublishRequests, getPreviewStats, setPublishRequestStatus,
  listIngestTokens, createIngestToken, revokeIngestToken,
  type PreviewSiteRow, type PublishRequestRow, type PreviewStats, type IngestToken,
} from '../lib/preview/engine';
import { queuePitch, lookupProfileEmail } from '../lib/garvis/outreach';
import { DEMO_PROFILES } from '../lib/preview/demoProfiles';
import { supabaseUrl } from '../lib/supabase';

const CLAIM_STATUSES = ['new', 'contacted', 'won', 'lost'] as const;
const STATUS_TONE: Record<string, 'ember' | 'warn' | 'ok' | 'dim'> = { new: 'ember', contacted: 'warn', won: 'ok', lost: 'dim' };

export default function PreviewEngine() {
  const { toast } = useToast();
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PreviewSiteRow[]>([]);
  const [requests, setRequests] = useState<(PublishRequestRow & { business_name?: string; slug?: string })[]>([]);
  const [stats, setStats] = useState<Record<string, PreviewStats>>({});
  const [regenId, setRegenId] = useState<string | null>(null);
  const [queuingId, setQueuingId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<IngestToken[]>([]);
  const [tokensOpen, setTokensOpen] = useState(false);

  const refresh = async () => {
    setRows(await listPreviewSites());
    setRequests(await listPublishRequests());
    setStats(await getPreviewStats());
    setTokens(await listIngestTokens());
  };
  useEffect(() => { void refresh(); }, []);

  const setStatus = async (id: string, status: PublishRequestRow['status']) => {
    const r = await setPublishRequestStatus(id, status);
    if (!r.ok) toast('error', r.error ?? 'Could not update.');
    await refresh();
  };

  const newToken = async () => {
    const t = await createIngestToken();
    if (!t) return toast('error', 'Could not create a token (is the pipeline migration applied?).');
    void navigator.clipboard?.writeText(t.token);
    toast('success', 'Token created and copied to clipboard.');
    await refresh();
  };

  const generate = async () => {
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return toast('error', 'That is not valid JSON.'); }
    setBusy(true);
    try {
      const res = await ingestBusinessProfile(raw);
      if (!res.ok) return toast('error', res.errors.join(' · '));
      toast('success', `Preview generated (${res.specSource === 'ai' ? 'AI spec' : 'fallback spec'}) — ${res.previewUrl}`);
      setJson('');
      await refresh();
    } finally { setBusy(false); }
  };

  const regen = async (id: string) => {
    setRegenId(id);
    try {
      const r = await regeneratePreviewSite(id);
      if (!r.ok) toast('error', r.error ?? 'Regeneration failed.');
      else { toast('success', 'Regenerated.'); await refresh(); }
    } finally { setRegenId(null); }
  };

  const remove = async (id: string) => { if (!window.confirm('Delete this preview site? This can’t be undone.')) return; await deletePreviewSite(id); await refresh(); };
  const copyLink = (slug: string) => { void navigator.clipboard.writeText(previewUrlFor(slug)); toast('success', 'Preview link copied.'); };
  const copyPitch = (pitch: string) => { void navigator.clipboard.writeText(pitch); toast('success', 'Pitch email copied.'); };

  // Turn a generated pitch into a real, approval-gated outreach message (replaces copy-to-clipboard).
  const queueSend = async (r: PreviewSiteRow) => {
    try {
      const prefill = (await lookupProfileEmail(r.profile_id)) ?? '';
      const to = window.prompt(`Send this pitch to which email?\n\nGarvis will draft the message and put it in the Queue — nothing sends until you approve it.`, prefill);
      if (!to) return;
      setQueuingId(r.id);
      await queuePitch({
        previewSiteId: r.id,
        businessProfileId: r.profile_id,
        businessName: r.business_name,
        industry: r.industry,
        pitch: r.pitch,
        previewUrl: previewUrlFor(r.slug),
        toEmail: to,
      });
      toast('success', 'Queued for approval. Review it in the Queue → send when ready.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not queue the pitch.');
    } finally {
      setQueuingId(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-forge-ember" />
          <h1 className="font-display text-xl font-semibold">Business Preview Engine</h1>
        </div>
        <p className="mt-1 text-sm text-forge-dim">
          Paste a Business Profile JSON (the scraper handoff format) and generate a ready-to-send website preview.
          The AI writes the copy, theme, and section plan — the site itself is assembled from the hand-built section library.
        </p>

        <Card className="mt-5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-forge-dim">Load a demo:</span>
            {DEMO_PROFILES.map((d) => (
              <button
                key={String(d.business_name)}
                onClick={() => setJson(JSON.stringify(d, null, 2))}
                className="rounded-full border border-forge-border px-3 py-1 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink"
              >
                {String(d.business_name)} · {String(d.industry)}
              </button>
            ))}
          </div>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder='{"business_name": "...", "industry": "...", "services": ["..."], ...}'
            className="mt-3 w-full rounded-lg border border-forge-border bg-forge-bg p-3 font-mono text-xs text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={() => void generate()} loading={busy} disabled={!json.trim()}>
              <Sparkles size={14} /> Generate preview site
            </Button>
            <span className="text-xs text-forge-dim">Saves the profile, generates the spec + pitch email, and creates a public preview URL.</span>
          </div>
        </Card>

        {requests.length > 0 && (
          <>
            <h2 className="mt-8 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-forge-ember">
              <Inbox size={12} /> Claims ({requests.filter((q) => q.status === 'new').length} new · {requests.filter((q) => q.status === 'won').length} won)
            </h2>
            <div className="mt-3 space-y-2">
              {requests.map((q) => (
                <Card key={q.id} className={`flex flex-wrap items-center gap-3 p-3 ${q.status === 'new' ? 'border-forge-ember/40' : ''}`}>
                  <Badge tone={STATUS_TONE[q.status] ?? 'dim'}>{q.status}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-forge-ink">{q.name} <span className="text-forge-dim">wants</span> {q.business_name ?? 'a preview'}</p>
                    <p className="mt-0.5 font-mono text-xs text-forge-dim">{q.contact}{q.message ? ` — “${q.message}”` : ''}</p>
                  </div>
                  <select
                    value={q.status}
                    onChange={(e) => void setStatus(q.id, e.target.value as PublishRequestRow['status'])}
                    aria-label="Claim status"
                    className="rounded-lg border border-forge-border bg-forge-panel px-2 py-1.5 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none"
                  >
                    {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {q.slug && (
                    <Link to={`/preview-site/${q.slug}`} target="_blank" className="rounded-lg border border-forge-border p-2 text-forge-dim hover:border-forge-ember/50 hover:text-forge-ink">
                      <ExternalLink size={14} />
                    </Link>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Scraper API — ingest tokens + the exact call the external lead engine makes. */}
        <h2 className="mt-8 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-forge-dim">
          <KeyRound size={12} /> Scraper API
          <button onClick={() => setTokensOpen((v) => !v)} className="ml-1 text-forge-ember hover:underline">{tokensOpen ? 'hide' : 'show'}</button>
        </h2>
        {tokensOpen && (
          <Card className="mt-3 p-4">
            <p className="text-xs text-forge-dim">
              Your scraper POSTs Business Profile JSON to the ingest endpoint with a token below — each call creates a
              live preview URL instantly (recipe spec; hit Regenerate here to run the full AI chain on it).
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-forge-border bg-forge-bg p-3 font-mono text-[10px] leading-relaxed text-forge-dim">
{`curl -X POST "${supabaseUrl}/functions/v1/ingest-profile" \\
  -H "content-type: application/json" -H "x-ingest-token: <TOKEN>" \\
  -d '{"business_name":"Joes Roofing","industry":"roofing","services":["Roof repair"]}'`}
            </pre>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => void newToken()}><Plus size={13} /> New token</Button>
              <span className="text-[11px] text-forge-dim">Tokens are shown once at creation (copied to clipboard) — treat them like passwords.</span>
            </div>
            {tokens.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-xs">
                    <Badge tone={t.revoked_at ? 'dim' : 'ok'}>{t.revoked_at ? 'revoked' : 'active'}</Badge>
                    <span className="font-mono text-forge-dim">{t.token.slice(0, 8)}…{t.token.slice(-4)}</span>
                    <span className="text-forge-dim/70">{t.label}</span>
                    {t.last_used_at && <span className="text-[10px] text-forge-dim/60">last used {new Date(t.last_used_at).toLocaleDateString()}</span>}
                    {!t.revoked_at && (
                      <button onClick={() => { void revokeIngestToken(t.id).then(refresh); }} className="ml-auto text-[11px] text-forge-dim hover:text-forge-err">revoke</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <h2 className="mt-8 text-xs font-medium uppercase tracking-wide text-forge-dim">Generated previews</h2>
        {rows.length === 0 ? (
          <div className="mt-3"><EmptyState icon={<Globe size={20} />} title="No previews yet" body="Load a demo profile above and hit Generate." /></div>
        ) : (
          <div className="mt-3 space-y-2">
            {rows.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-forge-ink">{r.business_name}</span>
                    <Badge tone="dim">{r.industry}</Badge>
                    <Badge tone={r.spec_source === 'ai' ? 'ok' : 'warn'}>{r.spec_source}</Badge>
                    <Badge tone="ember">{r.status}</Badge>
                    {r.audit && <Badge tone={r.audit.score < 55 ? 'err' : 'warn'}>audit {r.audit.score}/100</Badge>}
                    {r.critique && <Badge tone={r.critique.feels_like_my_business >= 8 ? 'ok' : 'warn'}>owner {r.critique.feels_like_my_business}/10</Badge>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-forge-dim">
                    /preview-site/{r.slug}
                    {stats[r.id] && (stats[r.id].views > 0 || stats[r.id].returns > 0) && (
                      <span className="ml-2 text-forge-ember">
                        {stats[r.id].views} view{stats[r.id].views === 1 ? '' : 's'}
                        {stats[r.id].engaged > 0 && ` · ${stats[r.id].engaged} engaged`}
                        {stats[r.id].returns > 0 && ` · ${stats[r.id].returns} return${stats[r.id].returns === 1 ? '' : 's'}`}
                        {stats[r.id].reportViews > 0 && ` · ${stats[r.id].reportViews} report`}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link to={`/preview-site/${r.slug}`} target="_blank" title="Open preview"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    <ExternalLink size={14} />
                  </Link>
                  <Link to={`/preview-site/${r.slug}/email-shot`} target="_blank" title="Email screenshot view"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    <Camera size={14} />
                  </Link>
                  <Link to={`/preview-site/${r.slug}/report`} target="_blank" title="Audit report (what the owner sees)"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    <FileText size={14} />
                  </Link>
                  <button onClick={() => copyLink(r.slug)} title="Copy preview link"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => copyPitch(r.pitch)} title="Copy pitch email"
                    className="rounded-lg border border-forge-border px-2.5 py-2 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    Pitch
                  </button>
                  <button onClick={() => void queueSend(r)} disabled={queuingId === r.id} title="Queue this pitch for approval + send"
                    className="flex items-center gap-1 rounded-lg border border-forge-border px-2.5 py-2 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink disabled:opacity-50">
                    {queuingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Queue
                  </button>
                  <button onClick={() => void regen(r.id)} disabled={regenId === r.id} title="Regenerate spec + pitch"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    {regenId === r.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                  <button onClick={() => void remove(r.id)} title="Delete"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-err/60 hover:text-forge-err">
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
