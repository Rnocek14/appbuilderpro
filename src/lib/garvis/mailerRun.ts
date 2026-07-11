// src/lib/garvis/mailerRun.ts
// Impure half of the direct-mail product: load the world's real materials for the designer,
// save a design as a studio artifact (so it lives in the area like any other work and round-trips
// via parseMailerDetail), and log a real mail batch. Sending mail is the operator's physical act
// (print → vendor → mailbox); Garvis records what actually went out so the ledger and reflection
// count mail as real outreach. Every write is owner-scoped; a logged batch also drops a mind_event
// so the world's heartbeat sees it.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import { getBrandKit } from './artifacts';
import { compileMailer, mailerToDetail, type MailerSpec, type MailerBrand } from './mailer';
import type { BusinessContext } from './genesis';

export interface VaultImage { name: string; url: string; caption: string | null; label: string | null }

export interface MailerMaterials {
  ctx: BusinessContext | null;
  brand: MailerBrand | null;
  images: VaultImage[];         // real vault photos, hero-graded first (label 'website'/'hero')
}

/** Everything the designer needs, all from the world's own rows — never stock, never invented. */
export async function loadMailerMaterials(worldId: string): Promise<MailerMaterials> {
  const [{ data: world }, brand, { data: files }] = await Promise.all([
    supabase.from('knowledge_worlds').select('business_context').eq('id', worldId).maybeSingle(),
    getBrandKit(worldId).catch(() => null),
    supabase.from('cluster_files')
      .select('name, url, caption, label, kind, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(60),
  ]);
  const images = ((files ?? []) as VaultImage[])
    .map((f) => ({ name: f.name, url: f.url, caption: f.caption, label: f.label }))
    // Hero-graded photos first — intake labels the best ones 'website'/'hero'.
    .sort((a, b) => rank(b.label) - rank(a.label));
  return {
    ctx: (world?.business_context as BusinessContext | null) ?? null,
    brand: brand ? { palette: brand.palette, fonts: brand.fonts, compliance_line: brand.compliance_line } : null,
    images,
  };
}

function rank(label: string | null): number {
  if (!label) return 0;
  const l = label.toLowerCase();
  if (l.includes('hero') || l.includes('website')) return 2;
  if (l.includes('proof') || l.includes('portfolio')) return 1;
  return 0;
}

/** Save the postcard design as a studio artifact in this area (upsert by a stable slug so
 *  re-saves version rather than duplicate). Returns the artifact slug. */
export async function saveMailerDesign(clusterId: string, spec: MailerSpec, title: string): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const slug = `postcard-${spec.concept.replace('_', '-')}`;
  const { error } = await supabase.from('knowledge_artifacts').upsert({
    owner_id: uid, cluster_id: clusterId, slug, kind: 'post',
    title, detail: mailerToDetail(spec), source: 'garvis-chat',
  }, { onConflict: 'cluster_id,slug' });
  if (error) throw new Error(`Could not save the design: ${error.message}`);
  return slug;
}

export interface MailBatchRow {
  id: string; title: string; piece_count: number; channel: string;
  status: 'planned' | 'printed' | 'mailed' | 'canceled'; vendor: string | null;
  cost_usd: number | null; mailed_at: string | null; created_at: string;
}

export async function listMailBatches(worldId: string): Promise<MailBatchRow[]> {
  const { data } = await supabase.from('mail_batches')
    .select('id, title, piece_count, channel, status, vendor, cost_usd, mailed_at, created_at')
    .eq('world_id', worldId).order('created_at', { ascending: false }).limit(40);
  return (data ?? []) as MailBatchRow[];
}

/** Log a mail batch. `status` is the operator's honest report of what actually happened —
 *  'mailed' stamps mailed_at and drops a mind_event so the world counts it as real outreach. */
export async function logMailBatch(input: {
  worldId: string; clusterId: string | null; artifactSlug: string | null;
  title: string; pieceCount: number; status: MailBatchRow['status']; vendor?: string; costUsd?: number | null; notes?: string;
}): Promise<MailBatchRow> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (input.pieceCount < 0) throw new Error('Piece count cannot be negative.');
  const mailedAt = input.status === 'mailed' ? new Date().toISOString() : null;
  const { data, error } = await supabase.from('mail_batches').insert({
    owner_id: uid, world_id: input.worldId, cluster_id: input.clusterId, artifact_slug: input.artifactSlug,
    title: input.title, piece_count: Math.floor(input.pieceCount), channel: 'postcard',
    status: input.status, vendor: input.vendor ?? null, cost_usd: input.costUsd ?? null,
    notes: input.notes ?? null, mailed_at: mailedAt,
  }).select('id, title, piece_count, channel, status, vendor, cost_usd, mailed_at, created_at').single();
  if (error || !data) throw new Error(`Could not log the batch: ${error?.message ?? 'unknown error'}`);

  await recordMindEvent(uid, {
    event_type: input.status === 'mailed' ? 'artifact_imported' : 'note', source: 'workweb',
    subject: input.status === 'mailed'
      ? `Mailed "${input.title}" — ${input.pieceCount} piece${input.pieceCount === 1 ? '' : 's'}`
      : `Logged a ${input.status} mail batch: ${input.title}`,
    payload: { world_id: input.worldId, pieces: input.pieceCount, status: input.status, channel: 'postcard' },
  });
  return data as MailBatchRow;
}

/** Update a batch's state as it moves planned → printed → mailed (or canceled). */
export async function setMailBatchStatus(id: string, worldId: string, status: MailBatchRow['status']): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const patch: Record<string, unknown> = { status };
  if (status === 'mailed') patch.mailed_at = new Date().toISOString();
  const { data, error } = await supabase.from('mail_batches').update(patch).eq('id', id).eq('owner_id', uid).select('piece_count, title');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Batch not found.');
  if (status === 'mailed') {
    const row = data[0] as { piece_count: number; title: string };
    await recordMindEvent(uid, {
      event_type: 'artifact_imported', source: 'workweb',
      subject: `Mailed "${row.title}" — ${row.piece_count} piece${row.piece_count === 1 ? '' : 's'}`,
      payload: { world_id: worldId, pieces: row.piece_count, status: 'mailed', channel: 'postcard' },
    });
  }
}

/** Convenience: compile a first-draft design from the world's materials for a concept. */
export function draftMailer(materials: MailerMaterials, concept: MailerSpec['concept'], offer: string): MailerSpec {
  const ctx = materials.ctx ?? {
    business_name: '', principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null,
  };
  const hero = materials.images[0] ?? null;
  return compileMailer({
    ctx, brand: materials.brand, concept,
    imageUrl: hero?.url ?? null, imageAlt: hero?.caption ?? null, offer,
  });
}
