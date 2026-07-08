// src/components/AssetsModal.tsx
// The project asset library UI: upload your own photos, or point at an existing website and
// import its images (copied into storage). Everything here lands in the ASSET MANIFEST that
// each build/edit receives, so generated pages use these real images.

import { useRef, useState } from 'react';
import { Download, Globe, ImagePlus, Trash2, Upload, Check, Copy } from 'lucide-react';
import { Button, Modal, Spinner } from './ui';
import { useToast } from '../context/ToastContext';
import { useAssets, type HarvestCandidate, type ProjectAsset } from '../hooks/useAssets';

function AssetCard({ a, onAlt, onRemove }: { a: ProjectAsset; onAlt: (alt: string) => void; onRemove: () => void }) {
  const [alt, setAltDraft] = useState(a.alt);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(a.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="overflow-hidden rounded-lg border border-forge-border bg-forge-panel">
      <div className="relative aspect-video bg-forge-bg">
        <img src={a.url} alt={a.alt || a.name} loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/80">{a.source}</span>
      </div>
      <div className="space-y-1.5 p-2">
        <p className="truncate font-mono text-[10px] text-forge-dim" title={a.name}>{a.name}</p>
        <input
          value={alt}
          onChange={(e) => setAltDraft(e.target.value)}
          onBlur={() => { if (alt !== a.alt) onAlt(alt); }}
          placeholder="Describe it (alt) — helps the AI place it well"
          className="w-full rounded border border-forge-border bg-forge-bg px-2 py-1 text-[11px] text-forge-ink placeholder:text-forge-dim/50 focus:border-forge-ember/60 focus:outline-none"
        />
        <div className="flex items-center gap-1">
          <button type="button" onClick={copy} title="Copy public URL" className="inline-flex items-center gap-1 rounded border border-forge-border px-1.5 py-0.5 text-[10px] text-forge-dim hover:text-forge-ink">
            {copied ? <Check size={10} className="text-forge-ok" /> : <Copy size={10} />} URL
          </button>
          <button type="button" onClick={onRemove} title="Delete asset" className="ml-auto inline-flex items-center rounded border border-forge-border p-1 text-forge-dim hover:border-forge-err/50 hover:text-forge-err">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssetsModal({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { assets, loading, upload, setAlt, remove, harvestList, importImage } = useAssets(open ? projectId : undefined);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<HarvestCandidate[] | null>(null);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  const scan = async () => {
    const url = siteUrl.trim();
    if (!url || scanning) return;
    setScanning(true);
    setCandidates(null);
    try {
      const imgs = await harvestList(/^https?:\/\//.test(url) ? url : `https://${url}`);
      setCandidates(imgs);
      if (!imgs.length) toast('info', 'No images found on that page.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not read that site.');
    } finally {
      setScanning(false);
    }
  };

  const doImport = async (u: string) => {
    setImporting((s) => new Set(s).add(u));
    try {
      await importImage(u);
      setCandidates((c) => c?.filter((x) => x.url !== u) ?? null);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting((s) => { const n = new Set(s); n.delete(u); return n; });
    }
  };

  const doUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const n = await upload(files);
    setUploading(false);
    if (n) toast('success', `Added ${n} image${n > 1 ? 's' : ''}.`);
    else toast('error', 'Upload failed.');
  };

  return (
    <Modal open={open} onClose={onClose} title="Project assets" size="lg">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto panel-scroll pr-1">
        <p className="text-xs text-forge-dim">
          Your real images beat stock every time. Upload photos or import them from an existing site —
          every build automatically uses what's here for heroes, galleries, and scroll scenes.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { void doUpload(e.target.files); e.target.value = ''; }} />
          <Button onClick={() => fileRef.current?.click()} loading={uploading}><Upload size={13} /> Upload images</Button>
          <div className="flex min-w-[240px] flex-1 items-center gap-1.5">
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void scan(); }}
              placeholder="Import from a website… (your old site's URL)"
              className="w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none"
            />
            <Button onClick={() => void scan()} loading={scanning} disabled={!siteUrl.trim()} className="shrink-0">
              <Globe size={13} /> Scan
            </Button>
          </div>
        </div>

        {candidates !== null && candidates.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-xs font-medium text-forge-ink">Found on that site — import the ones you own</p>
              <span className="text-[10px] text-forge-dim">{candidates.length} image{candidates.length > 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {candidates.map((c) => (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => void doImport(c.url)}
                  disabled={importing.has(c.url)}
                  title={c.alt || c.url}
                  className="group relative aspect-video overflow-hidden rounded-md border border-forge-border bg-forge-bg hover:border-forge-ember/60"
                >
                  <img src={c.url} alt={c.alt} loading="lazy" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    {importing.has(c.url) ? <Spinner /> : <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white"><Download size={12} /> Import</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-forge-ink">In this project</p>
          {loading ? (
            <Spinner label="Loading assets…" />
          ) : assets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-forge-border p-6 text-center">
              <ImagePlus size={20} className="mx-auto mb-2 text-forge-dim" />
              <p className="text-xs text-forge-dim">No assets yet — upload photos or scan your old site above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {assets.map((a) => (
                <AssetCard key={a.id} a={a} onAlt={(alt) => void setAlt(a.id, alt)} onRemove={() => void remove(a)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
