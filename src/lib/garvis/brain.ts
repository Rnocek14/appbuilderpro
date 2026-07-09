// src/lib/garvis/brain.ts
// Client seam for the PERSISTENT BRAIN (app_0021). Uploading a document = extract text in the browser
// (docExtract), store the file in the private `documents` bucket, then hand the text to the
// `ingest-document` edge function, which summarizes → embeds → classifies → proposes a home and
// surfaces "Garvis noticed…" insights. The vectors + AI key stay server-side; the browser only ever
// sees text + results.

import { supabase } from '../supabase';
import { extractText } from '../docExtract';

export interface BrainDocument {
  id: string;
  title: string;
  source_kind: string;
  summary: string | null;
  concepts: string[];
  status: string;
  world_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface BrainInsight {
  id: string;
  kind: 'noticed' | 'connection' | 'drift' | 'opportunity';
  title: string;
  body: string;
  refs: { subject_type: string; subject_id: string; label?: string }[];
  score: number;
  status: 'new' | 'surfaced' | 'dismissed' | 'actioned';
  created_at: string;
}

export interface IngestResult {
  document_id: string;
  status: string;
  summary: string;
  concepts: string[];
  suggested_world_id: string | null;
  connections: { subject_type: string; subject_id: string; similarity: number; content: string }[];
  insight_id: string | null;
}

/** Extract text from a file, store it privately, and ingest it into the brain. */
export async function uploadAndIngest(file: File, opts?: { worldId?: string; appId?: string }): Promise<IngestResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const text = await extractText(file); // throws on unsupported types (with a friendly message)

  // Store the original in the private bucket under the owner's folder (RLS path convention).
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const path = `${uid}/${crypto.randomUUID()}-${safeName}`;
  let storagePath: string | null = null;
  const up = await supabase.storage.from('documents').upload(path, file, { upsert: false });
  if (!up.error) storagePath = path; // storage is best-effort; the text is what matters for the brain

  const { data, error } = await supabase.functions.invoke('ingest-document', {
    body: {
      title: file.name.replace(/\.[^.]+$/, ''),
      extracted_text: text,
      source_kind: 'upload',
      mime: file.type || null,
      bytes: file.size,
      storage_path: storagePath,
      world_id: opts?.worldId ?? null,
      app_id: opts?.appId ?? null,
    },
  });
  if (error) throw new Error(error.message);
  return data as IngestResult;
}

/** Ingest a pasted note or a URL reference (no file). */
export async function ingestNote(title: string, text: string, opts?: { worldId?: string; sourceUrl?: string }): Promise<IngestResult> {
  const { data, error } = await supabase.functions.invoke('ingest-document', {
    body: {
      title: title.trim() || 'Note',
      extracted_text: text,
      source_kind: opts?.sourceUrl ? 'url' : 'note',
      source_url: opts?.sourceUrl ?? null,
      world_id: opts?.worldId ?? null,
    },
  });
  if (error) throw new Error(error.message);
  return data as IngestResult;
}

export async function listDocuments(limit = 50): Promise<BrainDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, source_kind, summary, concepts, status, world_id, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BrainDocument[];
}

export async function listInsights(status: 'new' | 'all' = 'new', limit = 30): Promise<BrainInsight[]> {
  let q = supabase
    .from('insights')
    .select('id, kind, title, body, refs, score, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status === 'new') q = q.in('status', ['new', 'surfaced']);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as BrainInsight[];
}

export async function setInsightStatus(id: string, status: BrainInsight['status']): Promise<void> {
  const { error } = await supabase.from('insights').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Attach a document to a world (confirming a classification proposal). */
export async function fileDocument(documentId: string, worldId: string): Promise<void> {
  const { error } = await supabase.from('documents').update({ world_id: worldId, status: 'linked' }).eq('id', documentId);
  if (error) throw new Error(error.message);
}

export interface WorldOption { id: string; title: string }
export async function listWorlds(): Promise<WorldOption[]> {
  const { data, error } = await supabase.from('knowledge_worlds').select('id, title').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorldOption[];
}

// ---------------------------------------------------------------------------
// G2 — image intake: photos enter the brain as understanding (vision caption →
// themes/style/mood → embedding → proposed home), approval-first like everything.
// ---------------------------------------------------------------------------

export interface ImageIngestResult extends IngestResult {
  vision: Record<string, unknown> | null;
  why_matters: string | null;
  open_question: string | null;
}

/** Downscale in-browser (max edge 1280) → jpeg base64 (no data: prefix) so the edge function
 *  never receives multi-MB originals. The ORIGINAL still lands in storage untouched. */
async function imageToBase64(file: File, maxDim = 1280, quality = 0.85): Promise<{ base64: string; mime: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { base64: dataUrl.split(',')[1] ?? '', mime: 'image/jpeg' };
}

export async function uploadAndIngestImage(file: File, opts?: { worldId?: string }): Promise<ImageIngestResult> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const path = `${uid}/${Date.now()}-${safeName}`;
  await supabase.storage.from('documents').upload(path, file, { upsert: false }); // best-effort original
  const { base64, mime } = await imageToBase64(file);
  const { data, error } = await supabase.functions.invoke('ingest-document', {
    body: {
      title: file.name, image_base64: base64, mime, bytes: file.size,
      storage_path: path, source_kind: 'upload', world_id: opts?.worldId,
    },
  });
  if (error) throw new Error(error.message);
  return data as ImageIngestResult;
}

/** File a document into a world AND a specific production area (G2's cluster precision). */
export async function fileDocumentToCluster(documentId: string, worldId: string, clusterId: string | null): Promise<void> {
  const { error } = await supabase.from('documents')
    .update({ world_id: worldId, cluster_id: clusterId, status: 'linked' }).eq('id', documentId);
  if (error) throw new Error(error.message);
}

export interface ClusterOption { id: string; title: string }
export async function listClustersForWorld(worldId: string): Promise<ClusterOption[]> {
  const { data } = await supabase.from('knowledge_clusters')
    .select('id, title').eq('world_id', worldId).not('charter', 'is', null).order('title');
  return (data ?? []) as ClusterOption[];
}
