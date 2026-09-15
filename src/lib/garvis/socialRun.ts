// src/lib/garvis/socialRun.ts
// Impure half of social auto-posting: validate a draft (client-side, same core the edge re-checks),
// snapshot it into social_posts, and enqueue ONE publish_post approval. Nothing posts here — after
// the owner approves in the Queue, social-publish sends it (or Ayrshare schedules it) through her
// connected accounts.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';
import { checkDraft, PLATFORM_LABEL, type SocialDraft, type Platform, type PostStatus } from './social';
import { boundPayload, bytesDigest, versionHash, type PostVersionContent } from './postVersion';
import { describeSchedule, localToInstant, scheduleCaveat } from './reSchedule';
import { complianceGate } from './publishGate';
import { hasUnresolvedHole } from './reFacts';
import type { AiProvenance } from './mediaProvenance';

export interface SocialPostRow {
  id: string; body: string; platforms: string[]; media_urls: string[];
  scheduled_for: string | null; status: PostStatus | 'queued' | 'in_flight' | 'canceled';
  provider_post_id: string | null; error: string | null; created_at: string;
  post_urls?: Record<string, string> | null;
}

/** What the operator is deciding on, beyond the words: when (in THEIR zone), which facts it leans
 *  on, and the brokerage line that must ride with it. All of it is hashed into the approval. */
export interface PostBinding {
  /** 'YYYY-MM-DDTHH:mm' as typed, resolved through the zone — not a browser-local instant. */
  scheduleLocal?: string | null;
  scheduleTz?: string;
  factIds?: string[];
  complianceLine?: string | null;
  /** url -> sha256 of the bytes now. Two generators re-upload to the same path, so a URL alone is
   *  not a stable reference to an image. */
  mediaDigests?: Record<string, string>;
}

/** Hash the bytes behind each media URL, so the approval binds the picture and not just its address.
 *  A URL we cannot read yields no digest — unverifiable is recorded as unverifiable, never as a
 *  digest of nothing. Bounded: a post carries a handful of files, not a library. */
export async function computeMediaDigests(urls: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const url of [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, 4)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      out[url] = await bytesDigest(await res.arrayBuffer());
    } catch { /* unreadable now — the publisher will report it as unverified, not as unchanged */ }
  }
  return out;
}

/** Validate + snapshot + enqueue. Refuses exactly what a platform would.
 *
 *  THE BINDING (app_0140): the content is written to an IMMUTABLE post_versions row and the approval
 *  carries { post_row_id, version_id, content_hash }. The publisher sends the VERSION, not the live
 *  row — so editing a post after approval no longer changes what goes out; it needs a new decision.
 *  The house already worked this way for content weeks (pieces_hash); posts just never did.
 *
 *  `provenance` records that attached media is AI-generated — it rides both the version and the
 *  social_posts row so the server-side publisher can hold the disclosure gate fail-closed.
 */
export async function queueSocialPost(input: {
  text: string; platforms: string[]; mediaUrls?: string[]; scheduleAt?: string | null; worldId?: string | null;
  provenance?: AiProvenance | null;
  campaignId?: string | null;
  binding?: PostBinding;
}): Promise<{ postId: string; versionId: string; warnings: string[] }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const bind = input.binding ?? {};
  const tz = (bind.scheduleTz ?? 'America/Chicago').trim() || 'America/Chicago';
  const warnings: string[] = [];

  // WHEN, in the operator's zone. A typed local time is resolved through the tz database, so "6:30"
  // means 6:30 where she is — in January and in July. An explicit instant still wins if one is given.
  let scheduleAt = input.scheduleAt ?? null;
  let scheduledLocal: string | null = bind.scheduleLocal?.trim() || null;
  if (scheduledLocal) {
    const r = localToInstant(scheduledLocal, tz);
    if (!r.ok) throw new Error(r.reason);
    scheduleAt = r.iso;
    const caveat = scheduleCaveat(r);
    if (caveat) warnings.push(caveat);          // told, never silently moved
  }

  const draft: SocialDraft = {
    text: input.text, platforms: input.platforms,
    mediaUrls: input.mediaUrls ?? [], scheduleAt: scheduleAt ?? null,
  };
  const chk = checkDraft(draft, new Date().toISOString());
  if (!chk.ok) throw new Error(chk.reason ?? 'Not sendable.');
  warnings.push(...chk.warnings);

  // A fact nobody verified must not become a confident sentence — and copy still carrying a hole
  // must never reach the Queue, where it would look like a finished decision.
  if (hasUnresolvedHole(draft.text)) {
    throw new Error('This still has an unverified fact in it — fill or remove every [VERIFY: …] before queueing.');
  }
  // The brokerage line publishes with the post, or the post does not publish.
  const complianceLine = bind.complianceLine?.trim() || null;
  const complianceProblem = complianceGate(draft.text, complianceLine);
  if (complianceProblem) throw new Error(complianceProblem);

  const { data: row, error } = await supabase.from('social_posts').insert({
    owner_id: uid, world_id: input.worldId ?? null, body: draft.text.trim(),
    platforms: draft.platforms, media_urls: draft.mediaUrls ?? [],
    scheduled_for: draft.scheduleAt ?? null, status: 'queued',
    ...(input.campaignId ? { campaign_id: input.campaignId } : {}),
    ...(input.provenance ? { ai_provenance: input.provenance } : {}),
  }).select('id').single();
  if (error || !row) throw new Error(`Could not queue the post: ${error?.message ?? 'unknown'}`);
  const postId = (row as { id: string }).id;

  const content: PostVersionContent = {
    body: draft.text.trim(),
    platforms: draft.platforms,
    mediaUrls: draft.mediaUrls ?? [],
    mediaDigests: bind.mediaDigests ?? {},
    scheduledFor: draft.scheduleAt ?? null,
    scheduledLocal,
    scheduleTz: tz,
    factIds: bind.factIds ?? [],
    complianceLine,
  };
  const contentHash = await versionHash(content);
  const { data: ver, error: verErr } = await supabase.from('post_versions').insert({
    owner_id: uid, post_id: postId,
    body: content.body, platforms: content.platforms, media_urls: content.mediaUrls,
    media_digests: content.mediaDigests, ai_provenance: input.provenance ?? null,
    scheduled_for: content.scheduledFor, scheduled_local: content.scheduledLocal,
    schedule_tz: content.scheduleTz, fact_ids: content.factIds,
    compliance_line: content.complianceLine, content_hash: contentHash,
  }).select('id').single();
  if (verErr || !ver) {
    // No version, no binding — and an unbound post is exactly what this change exists to prevent.
    await supabase.from('social_posts').update({ status: 'canceled', error: 'version write failed' }).eq('id', postId);
    throw new Error(`Could not record the approved version: ${verErr?.message ?? 'unknown'}`);
  }
  const versionId = (ver as { id: string }).id;
  await supabase.from('social_posts').update({ current_version_id: versionId }).eq('id', postId);

  const names = (draft.platforms as Platform[]).map((p) => PLATFORM_LABEL[p] ?? p).join(', ');
  const when = draft.scheduleAt ? ` — ${describeSchedule(draft.scheduleAt, tz)}` : '';
  const approvalId = await enqueueApproval({
    worldId: input.worldId ?? null,
    kind: 'publish_post',
    title: `Post to ${names}${when}`,
    preview: `${draft.text.slice(0, 400)}${draft.text.length > 400 ? '…' : ''}`,
    payload: { ...boundPayload(postId, versionId, contentHash) },
  });
  await supabase.from('social_posts').update({ approval_id: approvalId }).eq('id', postId);
  return { postId, versionId, warnings };
}

export async function listSocialPosts(limit = 12): Promise<SocialPostRow[]> {
  const { data, error } = await supabase.from('social_posts')
    .select('id, body, platforms, media_urls, scheduled_for, status, provider_post_id, post_urls, error, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SocialPostRow[];
}

/** Cancel a post that has not gone out.
 *
 *  A still-queued post is ours to stop. A post the PROVIDER has already accepted for scheduling is
 *  not: cancelling it here would mark it canceled in our database while it published on schedule
 *  anyway. Until the provider-side delete is wired (it needs the live endpoint verified against a
 *  real account, not assumed), this refuses and says exactly where the post actually is — a false
 *  "cancelled" is worse than an honest "I can't".
 *
 *  'in_flight' is likewise not cancellable: the provider may already have it. It reconciles first.
 */
export async function cancelSocialPost(id: string): Promise<void> {
  const { data, error } = await supabase.from('social_posts')
    .update({ status: 'canceled' }).eq('id', id).eq('status', 'queued').select('id');
  if (error) throw new Error(error.message);
  if (data?.length) return;

  const { data: row } = await supabase.from('social_posts')
    .select('status, provider_post_id').eq('id', id).maybeSingle();
  const status = (row as { status?: string } | null)?.status;
  if (status === 'scheduled') {
    throw new Error('This is already scheduled with the provider — cancel it in the provider dashboard; cancelling here would not stop it.');
  }
  if (status === 'in_flight') {
    throw new Error('This was sent to the provider and has not answered yet — it has to be reconciled before anything can be cancelled.');
  }
  throw new Error(status ? `This post is already ${status} — there is nothing to cancel.` : 'Only a still-queued post can be canceled.');
}

// ---- post analytics (app_0087) ----------------------------------------------
// Real numbers from the provider, or nothing. A post with no metrics row renders no numbers —
// never a fake zero. Rows are written only by the social-sync function (service role).

export interface PostMetricRow {
  post_id: string; platform: string; likes: number | null; comments: number | null;
  shares: number | null; impressions: number | null; synced_at: string;
}

export async function listSocialMetrics(postIds: string[]): Promise<Map<string, PostMetricRow[]>> {
  const out = new Map<string, PostMetricRow[]>();
  if (!postIds.length) return out;
  const { data } = await supabase.from('social_post_metrics')
    .select('post_id, platform, likes, comments, shares, impressions, synced_at')
    .in('post_id', postIds).limit(500);
  for (const r of (data ?? []) as PostMetricRow[]) {
    const arr = out.get(r.post_id) ?? [];
    arr.push(r);
    out.set(r.post_id, arr);
  }
  return out;
}

/** One-line honest summary for a post's synced metrics; '' when nothing has arrived. */
export function metricsLine(rows: PostMetricRow[] | undefined): string {
  if (!rows?.length) return '';
  const sum = (pick: (r: PostMetricRow) => number | null): number | null => {
    let any = false, total = 0;
    for (const r of rows) { const v = pick(r); if (v !== null) { any = true; total += v; } }
    return any ? total : null;
  };
  const parts: string[] = [];
  const likes = sum((r) => r.likes); if (likes !== null) parts.push(`${likes} like${likes === 1 ? '' : 's'}`);
  const comments = sum((r) => r.comments); if (comments !== null) parts.push(`${comments} comment${comments === 1 ? '' : 's'}`);
  const shares = sum((r) => r.shares); if (shares !== null) parts.push(`${shares} share${shares === 1 ? '' : 's'}`);
  const imp = sum((r) => r.impressions); if (imp !== null) parts.push(`${imp} impression${imp === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** Owner-initiated sync — pull fresh numbers now instead of waiting for the 6-hour clock.
 *  `reason` carries the function's honest degrade message (no connection vs plan-gated). */
export async function syncSocialNow(): Promise<{ synced: number; available: boolean; reason: string | null }> {
  const { data, error } = await supabase.functions.invoke('social-sync', { body: {} });
  if (error) throw new Error(error.message);
  const r = data as { synced?: number; available?: boolean; error?: string };
  return { synced: r.synced ?? 0, available: r.available ?? true, reason: r.error ?? null };
}

// ---- per-business destinations (app_0084) -----------------------------------
// One Ayrshare connection, many brands: each business maps to its own Ayrshare Profile-Key so
// its posts land on ITS linked accounts. social-publish enforces the fail-closed rule — once any
// mapping exists, an unmapped business's post blocks instead of hitting the wrong brand.

export interface WorldSocialProfile { world_id: string; profile_key: string }

export async function listWorldSocialProfiles(): Promise<WorldSocialProfile[]> {
  const { data, error } = await supabase.from('world_social_profiles').select('world_id, profile_key');
  if (error) throw new Error(error.message);
  return (data ?? []) as WorldSocialProfile[];
}

export async function setWorldSocialProfile(worldId: string, profileKey: string): Promise<void> {
  const key = profileKey.trim();
  if (!key) throw new Error('Paste the Profile-Key first.');
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('world_social_profiles').upsert({
    owner_id: uid, world_id: worldId, profile_key: key, updated_at: new Date().toISOString(),
  }, { onConflict: 'world_id' });
  if (error) throw new Error(error.message);
}

export async function clearWorldSocialProfile(worldId: string): Promise<void> {
  const { error } = await supabase.from('world_social_profiles').delete().eq('world_id', worldId);
  if (error) throw new Error(error.message);
}
