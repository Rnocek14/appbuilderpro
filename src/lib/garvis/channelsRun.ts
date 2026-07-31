// src/lib/garvis/channelsRun.ts
// Impure half of the GROWTH-CHANNEL engine: channel + episode CRUD (app_0123) and the seams the
// Fact Channel Studio drives — draft a cited script (fact-script), illustrate scenes
// (generate-image), narrate (tts-voiceover via videoRun), render + finalize (render-video), and
// queue the finished episode through the ONE approval-gated publisher (queueSocialPost). Nothing
// here posts; the Queue does. Pure logic lives in factChannel.ts.

import { supabase } from '../supabase';
import { parseFactScript, type FactScript } from './factChannel';
import { queueSocialPost } from './socialRun';
import { withDisclosure, type AiProvenance } from './mediaProvenance';

export interface GrowthChannel {
  id: string; world_id: string | null; cluster_id: string | null;
  name: string; handle: string; niche: string; persona: string;
  platforms: string[]; cadence_per_week: number; monetization_mode: string;
  voice: string; music_mood: 'warm' | 'upbeat' | 'cinematic' | 'minimal';
  visual_style: string; status: 'active' | 'paused'; created_at: string;
}

export interface ChannelEpisode {
  id: string; channel_id: string; cluster_id: string | null;
  title: string; topic: string; script: FactScript | null; hook_index: number;
  status: 'draft' | 'rendered' | 'queued' | 'posted' | 'failed';
  render_id: string | null; video_url: string | null; srt_url: string | null;
  caption: string; post_id: string | null; error: string | null; created_at: string;
}

const CHANNEL_COLS = 'id, world_id, cluster_id, name, handle, niche, persona, platforms, cadence_per_week, monetization_mode, voice, music_mood, visual_style, status, created_at';
const EPISODE_COLS = 'id, channel_id, cluster_id, title, topic, script, hook_index, status, render_id, video_url, srt_url, caption, post_id, error, created_at';

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

export async function listEpisodes(channelId: string, limit = 20): Promise<ChannelEpisode[]> {
  const { data, error } = await supabase.from('channel_episodes').select(EPISODE_COLS)
    .eq('channel_id', channelId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChannelEpisode[];
}

/** Draft a cited script for this channel and save it as a draft episode. Returns the episode plus
 *  the parse warnings (needs_review etc.) so the studio surfaces them immediately. */
export async function draftEpisode(channel: GrowthChannel, topic?: string): Promise<{ episode: ChannelEpisode; warnings: string[] }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const recent = await listEpisodes(channel.id, 20).catch(() => [] as ChannelEpisode[]);
  const { data, error } = await supabase.functions.invoke('fact-script', {
    body: {
      niche: channel.niche || channel.name, topic: topic?.trim() || undefined,
      persona: channel.persona || undefined, targetSeconds: 75,
      avoidTitles: recent.map((e) => e.title).filter(Boolean),
    },
  });
  if (error) throw new Error(error.message);
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
}>): Promise<void> {
  const { error } = await supabase.from('channel_episodes')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Illustrate one scene through the metered generate-image seam (provenance is stamped there). */
export async function generateSceneImage(prompt: string, clusterId: string | null, caption: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-image', {
    body: { prompt, size: '1024x1536', clusterId: clusterId ?? undefined, caption, label: 'ai-generated' },
  });
  if (error) throw new Error(error.message);
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
