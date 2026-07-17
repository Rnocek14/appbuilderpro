// src/lib/garvis/socialRun.ts
// Impure half of social auto-posting: validate a draft (client-side, same core the edge re-checks),
// snapshot it into social_posts, and enqueue ONE publish_post approval. Nothing posts here — after
// the owner approves in the Queue, social-publish sends it (or Ayrshare schedules it) through her
// connected accounts.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';
import { checkDraft, PLATFORM_LABEL, type SocialDraft, type Platform, type PostStatus } from './social';

export interface SocialPostRow {
  id: string; body: string; platforms: string[]; media_urls: string[];
  scheduled_for: string | null; status: PostStatus | 'queued' | 'canceled';
  provider_post_id: string | null; error: string | null; created_at: string;
}

/** Validate + snapshot + enqueue. Returns the approval id. Refuses exactly what a platform would. */
export async function queueSocialPost(input: {
  text: string; platforms: string[]; mediaUrls?: string[]; scheduleAt?: string | null; worldId?: string | null;
}): Promise<{ postId: string; warnings: string[] }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const draft: SocialDraft = {
    text: input.text, platforms: input.platforms,
    mediaUrls: input.mediaUrls ?? [], scheduleAt: input.scheduleAt ?? null,
  };
  const chk = checkDraft(draft, new Date().toISOString());
  if (!chk.ok) throw new Error(chk.reason ?? 'Not sendable.');

  const { data: row, error } = await supabase.from('social_posts').insert({
    owner_id: uid, world_id: input.worldId ?? null, body: draft.text.trim(),
    platforms: draft.platforms, media_urls: draft.mediaUrls ?? [],
    scheduled_for: draft.scheduleAt ?? null, status: 'queued',
  }).select('id').single();
  if (error || !row) throw new Error(`Could not queue the post: ${error?.message ?? 'unknown'}`);

  const names = (draft.platforms as Platform[]).map((p) => PLATFORM_LABEL[p] ?? p).join(', ');
  const when = draft.scheduleAt ? ` — scheduled for ${draft.scheduleAt.slice(0, 16)}` : '';
  const approvalId = await enqueueApproval({
    worldId: input.worldId ?? null,
    kind: 'publish_post',
    title: `Post to ${names}${when}`,
    preview: `${draft.text.slice(0, 400)}${draft.text.length > 400 ? '…' : ''}`,
    payload: { post_row_id: row.id },
  });
  await supabase.from('social_posts').update({ approval_id: approvalId }).eq('id', row.id);
  return { postId: row.id as string, warnings: chk.warnings };
}

export async function listSocialPosts(limit = 12): Promise<SocialPostRow[]> {
  const { data, error } = await supabase.from('social_posts')
    .select('id, body, platforms, media_urls, scheduled_for, status, provider_post_id, error, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SocialPostRow[];
}

export async function cancelSocialPost(id: string): Promise<void> {
  const { data, error } = await supabase.from('social_posts')
    .update({ status: 'canceled' }).eq('id', id).eq('status', 'queued').select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Only a still-queued post can be canceled.');
}
