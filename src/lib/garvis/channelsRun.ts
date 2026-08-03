// src/lib/garvis/channelsRun.ts
// Impure half of the GROWTH-CHANNEL engine: channel + episode CRUD (app_0123) and the seams the
// Fact Channel Studio drives — draft a cited script (fact-script), illustrate scenes
// (generate-image), narrate (tts-voiceover via videoRun), render + finalize (render-video), and
// queue the finished episode through the ONE approval-gated publisher (queueSocialPost). Nothing
// here posts; the Queue does. Pure logic lives in factChannel.ts.

import { supabase } from '../supabase';
import { parseFactScript, type FactScript } from './factChannel';
import { episodePerf, channelBaseline, hookIntel, type EpisodePerf, type EpisodeMetricRow, type HookIntel } from './growthLoop';
import { queueSocialPost } from './socialRun';
import { invokeFailure } from './videoRun';
import { withDisclosure, type AiProvenance } from './mediaProvenance';
import { createOrder, deleteOrder, listOrders } from './standingRun';

export interface GrowthChannel {
  id: string; world_id: string | null; cluster_id: string | null;
  name: string; handle: string; niche: string; persona: string;
  platforms: string[]; cadence_per_week: number; monetization_mode: string;
  voice: string; music_mood: 'warm' | 'upbeat' | 'cinematic' | 'minimal';
  visual_style: string; status: 'active' | 'paused'; created_at: string;
  cta_url: string; cta_label: string;
}

export interface ChannelEpisode {
  id: string; channel_id: string; cluster_id: string | null;
  title: string; topic: string; script: FactScript | null; hook_index: number;
  status: 'draft' | 'rendered' | 'queued' | 'posted' | 'failed';
  render_id: string | null; video_url: string | null; srt_url: string | null;
  caption: string; post_id: string | null; error: string | null; created_at: string;
  /** Produced assets persisted for reuse — a B-cut re-renders with the SAME art for pennies. */
  assets: { imageUrls?: string[] };
  variant_of: string | null;
}

const CHANNEL_COLS = 'id, world_id, cluster_id, name, handle, niche, persona, platforms, cadence_per_week, monetization_mode, voice, music_mood, visual_style, status, created_at, cta_url, cta_label';
const EPISODE_COLS = 'id, channel_id, cluster_id, title, topic, script, hook_index, status, render_id, video_url, srt_url, caption, post_id, error, created_at, assets, variant_of';

export async function listChannels(worldId?: string | null): Promise<GrowthChannel[]> {
  let q = supabase.from('growth_channels').select(CHANNEL_COLS).order('created_at', { ascending: true }).limit(50);
  if (worldId) q = q.eq('world_id', worldId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GrowthChannel[];
}

export async function createChannel(input: {
  worldId: string | null; clusterId: string | null; name: string; niche: string; persona: string;
  platforms: string[]; visualStyle: string; voice?: string; musicMood?: GrowthChannel['music_mood'];
}): Promise<GrowthChannel> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!input.name.trim()) throw new Error('Name the channel first.');
  const { data, error } = await supabase.from('growth_channels').insert({
    owner_id: uid, world_id: input.worldId, cluster_id: input.clusterId,
    name: input.name.trim(), niche: input.niche.trim(), persona: input.persona.trim(),
    platforms: input.platforms, visual_style: input.visualStyle.trim(),
    voice: input.voice ?? 'nova', music_mood: input.musicMood ?? 'minimal',
  }).select(CHANNEL_COLS).single();
  if (error || !data) throw new Error(`Could not create the channel: ${error?.message ?? 'unknown'}`);
  return data as unknown as GrowthChannel;
}

/** THE CHANNEL CLOCK (app_0126): a daily episode_draft standing order — the worker drafts one
 *  cited script per day from the channel's own hook intel; the operator reviews → produces →
 *  approves. Draft-only by the standing-order honesty rule. */
export async function getChannelCadenceOrderId(channelId: string): Promise<string | null> {
  const orders = await listOrders().catch(() => []);
  const hit = orders.find((o) => o.kind === 'episode_draft' && (o.config as { channel_id?: string })?.channel_id === channelId);
  return hit?.id ?? null;
}

export async function setChannelCadence(channel: GrowthChannel, on: boolean): Promise<void> {
  const existing = await getChannelCadenceOrderId(channel.id);
  if (on && !existing) {
    await createOrder({
      worldId: channel.world_id, kind: 'episode_draft', label: `${channel.name} — daily episode draft`,
      cadence: 'daily', config: { channel_id: channel.id },
    });
  }
  if (!on && existing) await deleteOrder(existing);
}

/** Point the channel's attention at a destination — the app, shop, or page every caption links to. */
export async function setChannelCta(channelId: string, ctaUrl: string, ctaLabel: string): Promise<void> {
  const { error } = await supabase.from('growth_channels')
    .update({ cta_url: ctaUrl.trim(), cta_label: ctaLabel.trim(), updated_at: new Date().toISOString() })
    .eq('id', channelId);
  if (error) throw new Error(error.message);
}

export async function listEpisodes(channelId: string, limit = 20): Promise<ChannelEpisode[]> {
  const { data, error } = await supabase.from('channel_episodes').select(EPISODE_COLS)
    .eq('channel_id', channelId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChannelEpisode[];
}

export interface ChannelPerf {
  byEpisode: Map<string, EpisodePerf>;
  liveStatus: Map<string, string>;   // episode id → the social_posts row's real status ('posted'…)
  liveError: Map<string, string>;    // episode id → the post's failure reason, when it failed
  postedAt: Map<string, string>;     // episode id → the post's REAL posted_at (the pulse's clock)
  baseline: number | null;
  intel: HookIntel;
}

/** THE LOOP'S READ SIDE: join this channel's episodes to their posts' synced metrics and reduce
 *  through the pure core — per-episode reach, the channel median baseline, and the hook intel the
 *  next draft consumes. Episodes with no numbers stay 'unmeasured', never fake zeros. */
export async function loadChannelPerf(episodes: ChannelEpisode[]): Promise<ChannelPerf> {
  const withPost = episodes.filter((e) => e.post_id);
  const postIds = withPost.map((e) => e.post_id as string);
  const empty: ChannelPerf = { byEpisode: new Map(), liveStatus: new Map(), liveError: new Map(), postedAt: new Map(), baseline: null, intel: hookIntel([]) };
  if (!postIds.length) return empty;

  const [{ data: posts }, { data: metrics }] = await Promise.all([
    supabase.from('social_posts').select('id, status, error, posted_at').in('id', postIds).limit(200),
    supabase.from('social_post_metrics')
      .select('post_id, likes, comments, shares, impressions, video_views, saves, clicks, engagement, avg_watch_seconds, full_watch_rate, avg_view_pct')
      .in('post_id', postIds).limit(500),
  ]);
  const postRows = (posts ?? []) as { id: string; status: string; error: string | null; posted_at: string | null }[];
  const statusByPost = new Map(postRows.map((p) => [p.id, p.status]));
  const errorByPost = new Map(postRows.filter((p) => p.error).map((p) => [p.id, p.error as string]));
  const postedAtByPost = new Map(postRows.filter((p) => p.posted_at).map((p) => [p.id, p.posted_at as string]));
  const rowsByPost = new Map<string, EpisodeMetricRow[]>();
  for (const m of (metrics ?? []) as ({ post_id: string } & EpisodeMetricRow)[]) {
    const arr = rowsByPost.get(m.post_id) ?? [];
    arr.push(m);
    rowsByPost.set(m.post_id, arr);
  }

  const perfs: EpisodePerf[] = [];
  const byEpisode = new Map<string, EpisodePerf>();
  const liveStatus = new Map<string, string>();
  const liveError = new Map<string, string>();
  const postedAt = new Map<string, string>();
  for (const ep of withPost) {
    const st = statusByPost.get(ep.post_id as string);
    if (st) liveStatus.set(ep.id, st);
    const err = errorByPost.get(ep.post_id as string);
    if (err) liveError.set(ep.id, err);
    const at = postedAtByPost.get(ep.post_id as string);
    if (at) postedAt.set(ep.id, at);
    const script = ep.script ? parseFactScript(ep.script) : null;
    const hook = script?.ok ? (script.script.hooks[ep.hook_index] ?? script.script.hooks[0] ?? '') : '';
    const p = episodePerf(ep.id, ep.title, hook, rowsByPost.get(ep.post_id as string) ?? []);
    perfs.push(p);
    byEpisode.set(ep.id, p);
  }
  return { byEpisode, liveStatus, liveError, postedAt, baseline: channelBaseline(perfs), intel: hookIntel(perfs) };
}

/** Draft a cited script for this channel and save it as a draft episode. Returns the episode plus
 *  the parse warnings (needs_review etc.) so the studio surfaces them immediately. `intel` closes
 *  the loop: hooks that won/died on THIS channel steer the next draft's mechanisms. */
export async function draftEpisode(channel: GrowthChannel, topic?: string, intel?: HookIntel): Promise<{ episode: ChannelEpisode; warnings: string[] }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const recent = await listEpisodes(channel.id, 20).catch(() => [] as ChannelEpisode[]);
  const { data, error } = await supabase.functions.invoke('fact-script', {
    body: {
      niche: channel.niche || channel.name, topic: topic?.trim() || undefined,
      persona: channel.persona || undefined, targetSeconds: 75,
      avoidTitles: recent.map((e) => e.title).filter(Boolean),
      winningHooks: intel?.winningHooks?.length ? intel.winningHooks : undefined,
      quietHooks: intel?.quietHooks?.length ? intel.quietHooks : undefined,
    },
  });
  if (error) throw await invokeFailure(error, 'The script writer (fact-script)');
  const res = data as { ok?: boolean; script?: unknown; error?: string };
  if (!res.ok || !res.script) throw new Error(res.error ?? 'The script draft failed.');

  const parsed = parseFactScript(res.script);
  if (!parsed.ok) throw new Error(parsed.reason);

  const { data: row, error: insErr } = await supabase.from('channel_episodes').insert({
    owner_id: uid, channel_id: channel.id, cluster_id: channel.cluster_id,
    title: parsed.script.title, topic: topic?.trim() ?? '', script: parsed.script,
  }).select(EPISODE_COLS).single();
  if (insErr || !row) throw new Error(`Could not save the episode: ${insErr?.message ?? 'unknown'}`);
  return { episode: row as unknown as ChannelEpisode, warnings: parsed.warnings };
}

export async function updateEpisode(id: string, patch: Partial<{
  hook_index: number; status: ChannelEpisode['status']; render_id: string | null;
  video_url: string | null; srt_url: string | null; caption: string; post_id: string | null; error: string | null;
  assets: { imageUrls?: string[] };
}>): Promise<void> {
  const { error } = await supabase.from('channel_episodes')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** THE HOOK LAB: spin a B-CUT of a produced episode — the SAME script, art, and beats with a
 *  DIFFERENT hook variant. Because the parent's scene images are reused, the variant costs only a
 *  fresh voiceover + render (~$0.30) — a real hook A/B on otherwise-identical videos, which is the
 *  only comparison the loop can trust. Post cuts hours apart (or on different platforms) so each
 *  gets its own algorithm test window. */
export async function createVariantEpisode(parent: ChannelEpisode, hookIndex: number): Promise<ChannelEpisode> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (!parent.script) throw new Error('The parent episode has no script.');
  if (hookIndex === parent.hook_index) throw new Error('Pick a different hook than the parent cut.');
  const { data: row, error } = await supabase.from('channel_episodes').insert({
    owner_id: uid, channel_id: parent.channel_id, cluster_id: parent.cluster_id,
    title: `${parent.title} (hook ${hookIndex + 1})`, topic: parent.topic,
    script: parent.script, hook_index: hookIndex,
    assets: parent.assets ?? {}, variant_of: parent.id,
  }).select(EPISODE_COLS).single();
  if (error || !row) throw new Error(`Could not create the B-cut: ${error?.message ?? 'unknown'}`);
  return row as unknown as ChannelEpisode;
}

/** Illustrate one scene through the metered generate-image seam (provenance is stamped there). */
export async function generateSceneImage(prompt: string, clusterId: string | null, caption: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-image', {
    body: { prompt, size: '1024x1536', clusterId: clusterId ?? undefined, caption, label: 'ai-generated' },
  });
  if (error) throw await invokeFailure(error, 'The image generator (generate-image)');
  const res = data as { available?: boolean; ok?: boolean; url?: string; error?: string; setup?: string[] };
  if (res.available === false) throw new Error('Image generation isn\'t configured — set OPENAI_API_KEY (see System health).');
  if (!res.ok || !res.url) throw new Error(res.error ?? 'The image generation failed.');
  return res.url;
}

/** Queue a finished episode into the approval-gated publisher. The caption ALWAYS carries the AI
 *  disclosure (the server gate is fail-closed on it); the provenance rides the post row. */
export async function queueEpisodePost(input: {
  episode: ChannelEpisode; channel: GrowthChannel; caption: string; platforms: string[];
  videoUrl: string; provenance: AiProvenance; scheduleAt?: string | null;
}): Promise<{ postId: string; warnings: string[] }> {
  const text = withDisclosure(input.caption, input.provenance);
  const out = await queueSocialPost({
    text, platforms: input.platforms, mediaUrls: [input.videoUrl],
    scheduleAt: input.scheduleAt ?? null, worldId: input.channel.world_id,
    provenance: input.provenance,
  });
  await updateEpisode(input.episode.id, { status: 'queued', caption: text, post_id: out.postId });
  return out;
}
