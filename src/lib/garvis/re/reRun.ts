// src/lib/garvis/re/reRun.ts
// Impure half of the real-estate marketing workspace: read the communities and their sourced facts,
// read the live state the studio opens on, and turn a draft into an approval-bound post.
//
// Nothing here decides anything consequential. Queueing goes through queueSocialPost, which writes
// the immutable version and enqueues a publish_post approval; the human approves in the Queue; the
// publisher sends that version. This module can draft, read and queue — it can never approve.

import { supabase } from '../../supabase';
import { queueSocialPost, computeMediaDigests, type PostBinding } from '../socialRun';
import { draft, type DraftKind } from '../reDraft';
import { parseFact, renderWithFacts, hasUnresolvedHole, citationBlocker, type FactRecord } from '../reFacts';
import { describeSchedule } from '../reSchedule';

export interface Community { id: string; slug: string; name: string; kind: string; boundaryNote: string | null }
export interface FactWithSources extends FactRecord { communityId: string | null }

const readCommunity = (c: Record<string, unknown>): Community => ({
  id: String(c.id), slug: String(c.slug), name: String(c.name), kind: String(c.kind),
  boundaryNote: (c.boundary_note as string | null) ?? null,
});

export async function listCommunities(worldId: string | null): Promise<Community[]> {
  let q = supabase.from('re_communities').select('id, slug, name, kind, boundary_note').order('name');
  if (worldId) q = q.eq('world_id', worldId);
  const { data, error } = await q.limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(readCommunity);
}

export async function createCommunity(input: {
  worldId: string | null; name: string; slug: string; kind?: string; boundaryNote?: string;
}): Promise<Community> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.name.trim()) throw new Error('Name the community.');
  const { data, error } = await supabase.from('re_communities').insert({
    owner_id: uid, world_id: input.worldId, name: input.name.trim(),
    slug: (input.slug || input.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    kind: input.kind ?? 'community', boundary_note: input.boundaryNote?.trim() || null,
  }).select('id, slug, name, kind, boundary_note').single();
  if (error) throw new Error(error.message);
  return readCommunity(data as Record<string, unknown>);
}

/** Facts with their source COUNT — the gate needs the count, not the rows. */
export async function listFacts(communityId: string): Promise<FactWithSources[]> {
  const { data, error } = await supabase.from('re_facts')
    .select('id, community_id, claim, value_text, status, reviewed_at, review_due_at, re_fact_sources(count)')
    .eq('community_id', communityId).order('created_at', { ascending: true }).limit(200);
  if (error) throw new Error(error.message);
  const out: FactWithSources[] = [];
  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const embedded = raw.re_fact_sources;
    const sourceCount = Array.isArray(embedded) ? Number((embedded[0] as { count?: number } | undefined)?.count ?? 0) : 0;
    const f = parseFact({ ...raw, source_count: sourceCount });
    if (f) out.push({ ...f, communityId: (raw.community_id as string | null) ?? null });
  }
  return out;
}

/** A fact and its source arrive TOGETHER — a claim with no source is not a fact here, so there is
 *  no path in this module that creates one. */
export async function addFact(input: {
  worldId: string | null; communityId: string; claim: string; valueText: string;
  sourceUrl: string; sourceTitle?: string; sourceKind?: string; quote?: string;
  reviewedBy: string; reviewDueAt?: string | null;
}): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.claim.trim()) throw new Error('Write the claim — what is it you are saying?');
  if (!input.valueText.trim()) throw new Error('Write the verified value — the specific thing you checked.');
  if (!input.sourceUrl.trim() && !input.quote?.trim()) {
    throw new Error('A fact needs a source: a link, or a quote from the document you read.');
  }
  if (!input.reviewedBy.trim()) throw new Error('Who verified this? A fact needs a name behind it.');

  const { data: fact, error } = await supabase.from('re_facts').insert({
    owner_id: uid, world_id: input.worldId, community_id: input.communityId,
    claim: input.claim.trim(), value_text: input.valueText.trim(),
    status: 'verified', reviewed_at: new Date().toISOString(),
    review_due_at: input.reviewDueAt ?? null, reviewed_by: input.reviewedBy.trim(),
  }).select('id').single();
  if (error || !fact) throw new Error(`Could not save the fact: ${error?.message ?? 'unknown'}`);

  const { error: srcErr } = await supabase.from('re_fact_sources').insert({
    owner_id: uid, fact_id: (fact as { id: string }).id,
    url: input.sourceUrl.trim() || null, title: input.sourceTitle?.trim() || null,
    source_kind: input.sourceKind ?? 'official', quote: input.quote?.trim() || null,
  });
  if (srcErr) {
    // A fact without its source is exactly what these tables exist to prevent — retire it rather
    // than leave a citable-looking row behind.
    await supabase.from('re_facts').update({ status: 'retired' }).eq('id', (fact as { id: string }).id);
    throw new Error(`Could not save the source, so the fact was not kept: ${srcErr.message}`);
  }
}

export interface DraftResult {
  text: string;
  factIds: string[];
  /** Everything standing between this draft and the Queue, named. */
  blockers: string[];
}

/** Compose from a community's CITABLE facts. An uncitable fact is left out and named — the operator
 *  is told what to go and verify, never handed a sentence that papers over it. */
export function composeDraft(input: {
  kind: DraftKind; communityName: string; facts: FactWithSources[];
  agentName?: string; complianceLine?: string | null; nowIso?: string;
}): DraftResult {
  const now = input.nowIso ?? new Date().toISOString();
  const citable = input.facts.filter((f) => citationBlocker(f, now) === '');
  const skipped = input.facts.map((f) => citationBlocker(f, now)).filter(Boolean);

  const d = draft({
    kind: input.kind, communityName: input.communityName,
    facts: citable.map((f) => ({ id: f.id, claim: f.claim, valueText: f.valueText })),
    agentName: input.agentName, complianceLine: input.complianceLine,
  });
  const rendered = renderWithFacts(d.template, citable, now);
  return { text: rendered.text, factIds: rendered.usedFactIds, blockers: [...d.needs, ...rendered.holes, ...skipped] };
}

/** A real photo from her phone becomes a public URL the post can carry. This is the ONLY way a
 *  listing-campaign post gets media, and deliberately: the file is hers (owner-scoped path in the
 *  public-read assets bucket, the same one the site builder uses), it is never AI-generated (no
 *  provenance row is written, so the disclosure gate correctly stays quiet), and the bytes are
 *  digested at queue time so the approval binds to THIS picture, not to a URL that could be
 *  re-pointed. Instagram, TikTok and YouTube refuse a text-only post — this is what unlocks them. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function uploadPostPhoto(file: File, worldId: string | null): Promise<string> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!file.type.startsWith('image/')) throw new Error('That is not a photo. Pick a JPG, PNG or HEIC.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('That photo is over 10 MB — most phones can export a smaller copy.');
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'photo';
  const path = `${uid}/re/${worldId ?? 'no-world'}/${Date.now()}-${clean}`;
  const up = await supabase.storage.from('project-assets').upload(path, file, { contentType: file.type });
  if (up.error) throw new Error(`Could not upload the photo: ${up.error.message}`);
  return supabase.storage.from('project-assets').getPublicUrl(path).data.publicUrl;
}

/** Draft → immutable version → pending approval. The human decides in the Queue. */
export async function queueDraft(input: {
  text: string; platforms: string[]; mediaUrls?: string[]; worldId: string | null;
  campaignId?: string | null; factIds: string[]; complianceLine?: string | null;
  scheduleLocal?: string | null; scheduleTz?: string; linkUrl?: string | null;
}): Promise<{ postId: string; versionId: string; warnings: string[] }> {
  if (hasUnresolvedHole(input.text)) {
    throw new Error('This draft still has an unverified fact in it — fill or remove every [VERIFY: …] first.');
  }
  const mediaUrls = input.mediaUrls ?? [];
  const binding: PostBinding = {
    factIds: input.factIds,
    complianceLine: input.complianceLine ?? null,
    scheduleLocal: input.scheduleLocal ?? null,
    scheduleTz: input.scheduleTz ?? 'America/Chicago',
    mediaDigests: mediaUrls.length ? await computeMediaDigests(mediaUrls) : {},
    linkUrl: input.linkUrl ?? null,
  };
  return queueSocialPost({
    text: input.text, platforms: input.platforms, mediaUrls,
    worldId: input.worldId, campaignId: input.campaignId ?? null, binding,
  });
}

// ---------------------------------------------------------------------------
// The pulse — what the studio shows BEFORE the operator types anything.
// ---------------------------------------------------------------------------

export interface PulseState {
  awaitingDecision: number;
  nextScheduled: { body: string; whenLabel: string } | null;
  lastPublished: { body: string; url: string | null; metrics: string | null; status: string } | null;
  unansweredInquiries: number;
  needsAttention: string[];
}

export async function loadPulse(worldId: string | null, tz = 'America/Chicago'): Promise<PulseState> {
  const w = worldId;

  let pendingQ = supabase.from('approvals').select('id').eq('kind', 'publish_post').eq('status', 'pending').limit(50);
  if (w) pendingQ = pendingQ.eq('world_id', w);

  let nextQ = supabase.from('social_posts').select('body, scheduled_for')
    .in('status', ['queued', 'scheduled']).not('scheduled_for', 'is', null)
    .order('scheduled_for', { ascending: true }).limit(1);
  if (w) nextQ = nextQ.eq('world_id', w);

  let lastQ = supabase.from('social_posts').select('id, body, status, post_urls, error')
    .in('status', ['posted', 'failed', 'in_flight']).order('created_at', { ascending: false }).limit(1);
  if (w) lastQ = lastQ.eq('world_id', w);

  let leadsQ = supabase.from('leads').select('id').eq('status', 'new').limit(50);
  if (w) leadsQ = leadsQ.eq('world_id', w);

  const [pending, next, last, leads] = await Promise.all([pendingQ, nextQ, lastQ, leadsQ]);

  const nextRow = ((next.data ?? []) as Record<string, unknown>[])[0];
  const lastRow = ((last.data ?? []) as Record<string, unknown>[])[0];

  let metrics: string | null = null;
  if (lastRow?.id) {
    const { data: m } = await supabase.from('social_post_metrics')
      .select('likes, comments, impressions').eq('post_id', String(lastRow.id)).limit(10);
    const rows = (m ?? []) as Record<string, number | null>[];
    const sum = (k: string): number | null => {
      let any = false; let total = 0;
      for (const r of rows) { const v = r[k]; if (typeof v === 'number') { any = true; total += v; } }
      return any ? total : null;
    };
    const parts: string[] = [];
    for (const k of ['likes', 'comments', 'impressions']) {
      const v = sum(k);
      if (v !== null) parts.push(`${v} ${k}`);
    }
    // No numbers means NO numbers — never a fabricated zero (the social_post_metrics rule).
    metrics = parts.length ? parts.join(' · ') : null;
  }

  const needsAttention: string[] = [];
  if (lastRow?.status === 'failed' && lastRow.error) needsAttention.push(String(lastRow.error));
  if (lastRow?.status === 'in_flight') {
    needsAttention.push('A post was sent but the provider never confirmed it — it is being checked before anything is retried.');
  }

  const urls = (lastRow?.post_urls as Record<string, string> | null) ?? null;
  return {
    awaitingDecision: ((pending.data ?? []) as unknown[]).length,
    nextScheduled: nextRow
      ? { body: String(nextRow.body ?? ''), whenLabel: describeSchedule(String(nextRow.scheduled_for), tz) }
      : null,
    lastPublished: lastRow
      ? {
        body: String(lastRow.body ?? ''),
        url: urls ? (Object.values(urls)[0] ?? null) : null,
        metrics,
        status: String(lastRow.status ?? ''),
      }
      : null,
    unansweredInquiries: ((leads.data ?? []) as unknown[]).length,
    needsAttention,
  };
}
