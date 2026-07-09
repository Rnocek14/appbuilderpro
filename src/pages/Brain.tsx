// src/pages/Brain.tsx
// The persistent-brain surface: drop a document, Garvis reads it, summarizes it, and files it into
// your universe — proposing where it belongs and surfacing "Garvis noticed…" connections. This is the
// file-intake half of the living brain (app_0021). Upload a .txt/.md/.docx; Garvis does the rest.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain as BrainIcon, Upload, Loader2, Sparkles, FileText, Link2, X, Check } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, Card, Badge, EmptyState, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/utils';
import {
  uploadAndIngest, listDocuments, listInsights, setInsightStatus, fileDocument, listWorlds,
  uploadAndIngestImage, fileDocumentToCluster, listClustersForWorld,
  type BrainDocument, type BrainInsight, type WorldOption, type IngestResult, type ClusterOption,
} from '../lib/garvis/brain';
import { normalizeIntake, isImageFile, defaultLabel, type IntakeItem } from '../lib/garvis/intake';
import { uploadClusterFile } from '../lib/garvis/artifacts';

interface PendingIntake {
  file: File;
  preview: string;          // objectURL for the thumb
  item: IntakeItem;
  worldId: string;          // '' = unchosen
  clusterId: string;        // '' = world-level only
  clusters: ClusterOption[];
}

export default function Brain() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<BrainDocument[]>([]);
  const [insights, setInsights] = useState<BrainInsight[]>([]);
  const [worlds, setWorlds] = useState<WorldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);
  const [pending, setPending] = useState<PendingIntake[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, i, w] = await Promise.all([listDocuments(), listInsights('new'), listWorlds()]);
      setDocs(d); setInsights(i); setWorlds(w);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load the brain.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const ingest = useCallback(async (file: File) => {
    setUploading(true);
    setLastResult(null);
    try {
      const result = await uploadAndIngest(file);
      setLastResult(result);
      toast('success', `Ingested "${file.name}".${result.connections.length ? ` Found ${result.connections.length} connection${result.connections.length === 1 ? '' : 's'}.` : ''}`);
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not ingest the document.');
    } finally {
      setUploading(false);
    }
  }, [toast, refresh]);

  // G2 — batch intake: images run through vision (caption → themes → embedding → proposed home)
  // and queue in a propose-sort-approve table; text docs keep the single-file path. Sequential on
  // purpose: each upload is metered and the review table fills as understanding arrives.
  const ingestMany = useCallback(async (files: File[]) => {
    const images = files.filter((f) => isImageFile(f.name, f.type));
    const docsIn = files.filter((f) => !isImageFile(f.name, f.type));
    for (const f of docsIn) await ingest(f);
    if (!images.length) return;
    setUploading(true);
    try {
      for (const f of images) {
        try {
          const res = await uploadAndIngestImage(f);
          const item = normalizeIntake(res, f.name);
          if (!item) { toast('error', `Could not catalogue ${f.name}.`); continue; }
          const worldId = item.suggestedWorldId ?? '';
          const clusters = worldId ? await listClustersForWorld(worldId).catch(() => []) : [];
          setPending((p) => [...p, { file: f, preview: URL.createObjectURL(f), item, worldId, clusterId: '', clusters }]);
        } catch (e) {
          toast('error', e instanceof Error ? e.message : `Could not ingest ${f.name}.`);
        }
      }
      toast('success', `Catalogued ${images.length} image${images.length === 1 ? '' : 's'} — review the proposed filing below.`);
    } finally {
      setUploading(false);
    }
  }, [ingest, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void ingestMany(files);
  }, [ingestMany]);

  const setPendingWorld = async (ix: number, worldId: string) => {
    const clusters = worldId ? await listClustersForWorld(worldId).catch(() => []) : [];
    setPending((p) => p.map((row, i) => (i === ix ? { ...row, worldId, clusterId: '', clusters } : row)));
  };

  const approvePending = async (ix: number) => {
    const row = pending[ix];
    if (!row || !row.worldId) return;
    try {
      await fileDocumentToCluster(row.item.documentId, row.worldId, row.clusterId || null);
      if (row.clusterId) {
        // The bridge: filing into a production area also lands the file in that studio,
        // caption and routing label riding along so generators can actually use it.
        await uploadClusterFile(row.clusterId, row.file, { caption: row.item.summary, label: defaultLabel(row.item.vision) });
      }
      URL.revokeObjectURL(row.preview);
      setPending((p) => p.filter((_, i) => i !== ix));
      toast('success', `Filed ${row.item.title}.`);
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not file it.');
    }
  };

  const skipPending = (ix: number) => {
    setPending((p) => {
      const row = p[ix];
      if (row) URL.revokeObjectURL(row.preview);
      return p.filter((_, i) => i !== ix);
    });
  };

  const fileToWorld = async (documentId: string, worldId: string) => {
    try {
      await fileDocument(documentId, worldId);
      toast('success', 'Filed into your universe.');
      await refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not file the document.');
    }
  };

  const dismiss = async (id: string) => {
    setInsights((prev) => prev.filter((x) => x.id !== id));
    try { await setInsightStatus(id, 'dismissed'); } catch { /* optimistic */ }
  };

  const worldName = (id: string | null) => worlds.find((w) => w.id === id)?.title ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-forge-border bg-forge-panel">
            <BrainIcon size={20} className="text-forge-ember" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-forge-ink">Brain</h1>
            <p className="text-sm text-forge-dim">Drop a document — Garvis reads it, summarizes it, and connects it to what you already know.</p>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-forge-ember bg-forge-ember/5' : 'border-forge-border hover:border-forge-ember/40'}`}
        >
          <input
            ref={fileInput} type="file" multiple accept=".txt,.md,.docx,image/*" className="hidden"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void ingestMany(fs); e.target.value = ''; }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-forge-dim">
              <Loader2 size={24} className="animate-spin text-forge-ember" />
              <span>Reading, summarizing, and connecting…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-forge-dim">
              <Upload size={24} className="text-forge-ember" />
              <span className="font-medium text-forge-ink">Drop files or click to upload</span>
              <span className="text-xs">.txt, .md, .docx — or photos (Garvis catalogues them: caption, style, themes, where they'd work best)</span>
            </div>
          )}
        </div>

        {/* G2 — the propose-sort-approve table. Every row is what Garvis actually saw (caption,
            themes, an honest quality note) plus a PROPOSED home. Nothing files without approval. */}
        {pending.length > 0 && (
          <Card className="mt-4 p-4">
            <h2 className="mb-2 text-sm font-semibold text-forge-ink">Review & file — {pending.length} image{pending.length === 1 ? '' : 's'} awaiting your approval</h2>
            <div className="space-y-3">
              {pending.map((row, ix) => (
                <div key={row.item.documentId} className="flex flex-wrap gap-3 rounded-xl border border-forge-border p-3">
                  <img src={row.preview} alt={row.item.title} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-forge-ink/90">{row.item.summary || row.item.title}</p>
                    {row.item.vision && (
                      <p className="mt-0.5 text-xs text-forge-dim">
                        {[row.item.vision.style, row.item.vision.mood, row.item.vision.themes.join(', ')].filter(Boolean).join(' · ')}
                        {row.item.vision.suggested_use.length > 0 && <> · best for: <span className="text-forge-ember">{row.item.vision.suggested_use.join(', ')}</span></>}
                      </p>
                    )}
                    {row.item.vision?.quality_note && <p className="mt-0.5 text-[11px] text-forge-dim/80">{row.item.vision.quality_note}</p>}
                    {row.item.whyMatters && <p className="mt-1 text-xs text-forge-ink/70">{row.item.whyMatters}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={row.worldId}
                        onChange={(e) => void setPendingWorld(ix, e.target.value)}
                        className="rounded-lg border border-forge-border bg-forge-panel px-2 py-1 text-xs text-forge-ink"
                      >
                        <option value="">Choose a world…</option>
                        {worlds.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                      </select>
                      {row.worldId && (
                        <select
                          value={row.clusterId}
                          onChange={(e) => setPending((p) => p.map((r, i) => (i === ix ? { ...r, clusterId: e.target.value } : r)))}
                          className="rounded-lg border border-forge-border bg-forge-panel px-2 py-1 text-xs text-forge-ink"
                        >
                          <option value="">World only (no area)</option>
                          {row.clusters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                      )}
                      <Button size="sm" onClick={() => void approvePending(ix)} disabled={!row.worldId}><Check size={13} /> File it</Button>
                      <button onClick={() => skipPending(ix)} className="text-forge-dim hover:text-forge-warn" title="Skip — stays in the brain unfiled"><X size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Last-ingest result: the proposal */}
        {lastResult && (
          <Card className="mt-4 p-4">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 text-forge-ember" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-forge-ink">{lastResult.summary || 'Ingested. No summary available (add an embeddings/AI key to enrich).'}</p>
                {lastResult.concepts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lastResult.concepts.map((c) => <Badge key={c} tone="dim">{c}</Badge>)}
                  </div>
                )}
                {lastResult.suggested_world_id && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-forge-dim">Suggested home:</span>
                    <Badge tone="ember">{worldName(lastResult.suggested_world_id) ?? 'a world'}</Badge>
                    <Button size="sm" onClick={() => void fileToWorld(lastResult.document_id, lastResult.suggested_world_id!)}>
                      <Check size={13} /> File here
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* "Garvis noticed…" */}
        {insights.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-forge-dim">Garvis noticed</h2>
            <div className="space-y-2">
              {insights.map((ins) => (
                <Card key={ins.id} className="flex items-start gap-3 p-3">
                  <Link2 size={16} className="mt-0.5 text-forge-ember" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-forge-ink">{ins.title}</p>
                    <p className="text-xs text-forge-dim">{ins.body}</p>
                  </div>
                  <Badge tone="dim">{Math.round(ins.score * 100)}%</Badge>
                  <button onClick={() => void dismiss(ins.id)} title="Dismiss" className="text-forge-dim hover:text-forge-ink">
                    <X size={14} />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-forge-dim">Documents</h2>
          {loading ? (
            <Spinner label="Loading your brain…" />
          ) : docs.length === 0 ? (
            <EmptyState icon={<FileText size={20} />} title="No documents yet" body="Upload a research paper, spec, or note above to start building the brain." />
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <Card key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                  <FileText size={16} className="text-forge-dim" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-forge-ink">{d.title}</span>
                      <Badge tone="dim">{d.source_kind}</Badge>
                      {d.world_id ? <Badge tone="ok">{worldName(d.world_id) ?? 'filed'}</Badge> : <Badge tone="warn">unfiled</Badge>}
                    </div>
                    {d.summary && <p className="mt-0.5 truncate text-xs text-forge-dim">{d.summary}</p>}
                  </div>
                  {!d.world_id && worlds.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) void fileToWorld(d.id, e.target.value); }}
                      className="rounded-lg border border-forge-border bg-forge-panel px-2 py-1 text-xs text-forge-ink"
                    >
                      <option value="" disabled>File into…</option>
                      {worlds.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                    </select>
                  )}
                  <span className="text-[11px] text-forge-dim">{timeAgo(d.created_at)}</span>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
