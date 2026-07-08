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
