// src/pages/PreviewEngine.tsx
// Admin side of the Business Website Preview Engine: paste (or demo-load) a Business Profile
// JSON, generate a preview site, and manage the fleet. This is the interactive front door to the
// same `ingestBusinessProfile` handoff the future scraper/lead-engine will call programmatically.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Sparkles, ExternalLink, RefreshCw, Trash2, Copy, Loader2, Camera } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card, Badge, EmptyState } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { ingestBusinessProfile, listPreviewSites, regeneratePreviewSite, deletePreviewSite, previewUrlFor, type PreviewSiteRow } from '../lib/preview/engine';
import { DEMO_PROFILES } from '../lib/preview/demoProfiles';

export default function PreviewEngine() {
  const { toast } = useToast();
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PreviewSiteRow[]>([]);
  const [regenId, setRegenId] = useState<string | null>(null);

  const refresh = async () => setRows(await listPreviewSites());
  useEffect(() => { void refresh(); }, []);

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

  const remove = async (id: string) => { await deletePreviewSite(id); await refresh(); };
  const copyLink = (slug: string) => { void navigator.clipboard.writeText(previewUrlFor(slug)); toast('success', 'Preview link copied.'); };
  const copyPitch = (pitch: string) => { void navigator.clipboard.writeText(pitch); toast('success', 'Pitch email copied.'); };

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
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-forge-dim">/preview-site/{r.slug}</p>
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
                  <button onClick={() => copyLink(r.slug)} title="Copy preview link"
                    className="rounded-lg border border-forge-border p-2 text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => copyPitch(r.pitch)} title="Copy pitch email"
                    className="rounded-lg border border-forge-border px-2.5 py-2 text-xs text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink">
                    Pitch
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
