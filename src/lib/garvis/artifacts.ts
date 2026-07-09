// src/lib/garvis/artifacts.ts
// Impure studio-shell seam (app_0026): artifact versions, cluster files, brand kits, and the studio
// chat transcript. Version history is automatic — the DB trigger (snapshot_artifact_version)
// snapshots the old content on every real change, so reviseArtifact is just an UPDATE; v1 survives.

import { supabase } from '../supabase';
import type { ArtifactKind } from './clustering';
import { slugify } from './clustering';
import type { StudioDecision, StudioTurn, BrandKitCtx } from './clusterChat';

// ---------------------------------------------------------------------------
// Artifacts + versions
// ---------------------------------------------------------------------------

export interface StudioArtifact {
  id: string;               // db uuid
  cluster_id: string;
  slug: string | null;
  kind: ArtifactKind;
  title: string;
  detail: string | null;
  source: string | null;
  revision: number;
  created_at: string;
}

export interface ArtifactVersion {
  id: string;
  version: number;
  title: string;
  detail: string | null;
  created_at: string;
}

export async function listClusterArtifacts(clusterId: string): Promise<StudioArtifact[]> {
  const { data, error } = await supabase
    .from('knowledge_artifacts')
    .select('id, cluster_id, slug, kind, title, detail, source, revision, created_at')
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StudioArtifact[];
}

export async function listVersions(artifactId: string): Promise<ArtifactVersion[]> {
  const { data, error } = await supabase
    .from('artifact_versions')
    .select('id, version, title, detail, created_at')
    .eq('artifact_id', artifactId)
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ArtifactVersion[];
}

/** Revise an artifact — the trigger snapshots the old content and bumps revision. detail may be null
 *  so a restore of a version with no detail preserves NULL instead of rewriting it as ''. */
export async function reviseArtifact(artifactId: string, patch: { title?: string; detail: string | null; source?: string }): Promise<void> {
  const { error } = await supabase.from('knowledge_artifacts').update({
    detail: patch.detail,
    ...(patch.title ? { title: patch.title } : {}),
    source: patch.source ?? 'garvis-chat',
  }).eq('id', artifactId);
  if (error) throw new Error(error.message);
}

/** Restore an old version — itself a revision, so the pre-restore state is preserved too. */
export async function restoreVersion(artifactId: string, version: ArtifactVersion): Promise<void> {
  await reviseArtifact(artifactId, { title: version.title, detail: version.detail, source: 'restore' });
}

/** Create a new artifact in a cluster with a stable, collision-safe slug. */
export async function createArtifact(input: {
  clusterId: string; slug?: string; kind: ArtifactKind; title: string; detail: string; source?: string;
}): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  let slug = input.slug || slugify(input.title).slice(0, 60) || 'artifact';
  const { data: clash } = await supabase.from('knowledge_artifacts')
    .select('id').eq('cluster_id', input.clusterId).eq('slug', slug).maybeSingle();
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase.from('knowledge_artifacts').insert({
    owner_id: uid, cluster_id: input.clusterId, slug,
    kind: input.kind, title: input.title, detail: input.detail, source: input.source ?? 'garvis-chat',
  }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the artifact.');
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Cluster files (binary in project-assets; reference row here)
// ---------------------------------------------------------------------------

export interface ClusterFile { id: string; name: string; url: string; kind: string; bytes: number | null; caption: string | null; label: string | null; created_at: string }

const fileKind = (f: File): 'image' | 'doc' | 'csv' | 'other' =>
  f.type.startsWith('image/') ? 'image'
  : f.name.toLowerCase().endsWith('.csv') ? 'csv'
  : /\.(pdf|docx?|md|txt)$/i.test(f.name) ? 'doc' : 'other';

export async function listClusterFiles(clusterId: string): Promise<ClusterFile[]> {
  const { data, error } = await supabase
    .from('cluster_files')
    .select('id, name, url, kind, bytes, caption, label, created_at')
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClusterFile[];
}

export async function uploadClusterFile(clusterId: string, file: File, meta?: { caption?: string | null; label?: string | null }): Promise<ClusterFile> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 100);
  const path = `${uid}/studio/${clusterId}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from('project-assets').upload(path, file, { upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data: pub } = supabase.storage.from('project-assets').getPublicUrl(path);
  const { data, error } = await supabase.from('cluster_files').insert({
    owner_id: uid, cluster_id: clusterId, name: file.name, url: pub.publicUrl,
    kind: fileKind(file), bytes: file.size,
    caption: meta?.caption ?? null, label: meta?.label ?? null,
  }).select('id, name, url, kind, bytes, caption, label, created_at').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the file reference.');
  return data as ClusterFile;
}

export async function deleteClusterFile(id: string): Promise<void> {
  const { error } = await supabase.from('cluster_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Brand kits (one per world; null world = owner default)
// ---------------------------------------------------------------------------

export interface BrandKit extends BrandKitCtx {
  id: string;
  world_id: string | null;
  logo_url: string | null;
  headshots: string[];
}

export async function getBrandKit(worldId: string): Promise<BrandKit | null> {
  const { data } = await supabase
    .from('brand_kits')
    .select('id, world_id, name, logo_url, palette, fonts, tone, headshots, compliance_line')
    .eq('world_id', worldId)
    .maybeSingle();
  return (data as BrandKit | null) ?? null;
}

export async function saveBrandKit(worldId: string, patch: {
  name?: string; tone?: string; palette?: string[]; fonts?: string[]; logo_url?: string; compliance_line?: string;
}): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const existing = await getBrandKit(worldId);
  if (existing) {
    const { error } = await supabase.from('brand_kits').update(patch).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('brand_kits').insert({ owner_id: uid, world_id: worldId, ...patch });
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Studio chat transcript
// ---------------------------------------------------------------------------

export interface StudioMessage extends StudioTurn { id: string; decision: StudioDecision | null; created_at: string }

export async function listStudioMessages(clusterId: string, limit = 20): Promise<StudioMessage[]> {
  const { data, error } = await supabase
    .from('studio_messages')
    .select('id, role, content, decision, created_at')
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as StudioMessage[]).reverse();
}

export async function saveStudioMessage(
  clusterId: string, role: 'user' | 'garvis', content: string,
  decision?: StudioDecision | null, costUsd = 0,
): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return; // transcript is best-effort; the work itself already happened
  await supabase.from('studio_messages').insert({
    owner_id: uid, cluster_id: clusterId, role, content: content.slice(0, 12000),
    decision: decision ?? null, cost_usd: costUsd,
  });
}
