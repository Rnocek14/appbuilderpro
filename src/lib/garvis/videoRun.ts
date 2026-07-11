// src/lib/garvis/videoRun.ts
// Impure half of the video pillar: load the world's real materials for a storyboard, save a
// storyboard as a studio artifact (round-trips), and drive the render provider (POST edit → poll
// status → the mp4 url) through the render-video edge fn. The browser preview needs none of the
// render side — it plays the same storyboard locally.

import { supabase } from '../supabase';
import { getBrandKit } from './artifacts';
import { buildStoryboard, defaultScenes, toShotstackEdit, type Storyboard } from './storyboard';
import type { BusinessContext } from './genesis';

export interface VideoMaterials {
  ctx: BusinessContext | null;
  accent: string;
  photos: { url: string; caption: string | null }[];
}

/** The world's real photos + brand + context — the raw material a storyboard is built from. */
export async function loadVideoMaterials(worldId: string): Promise<VideoMaterials> {
  const [{ data: world }, brand, { data: files }] = await Promise.all([
    supabase.from('knowledge_worlds').select('business_context').eq('id', worldId).maybeSingle(),
    getBrandKit(worldId).catch(() => null),
    supabase.from('cluster_files')
      .select('url, caption, label, kind, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(30),
  ]);
  const rank = (label: string | null) => (label && /hero|website|proof/i.test(label) ? 1 : 0);
  const photos = ((files ?? []) as { url: string; caption: string | null; label: string | null }[])
    .sort((a, b) => rank(b.label) - rank(a.label))
    .map((f) => ({ url: f.url, caption: f.caption }));
  return {
    ctx: (world?.business_context as BusinessContext | null) ?? null,
    accent: brand?.palette?.[0] || '#FF8A3D',
    photos,
  };
}

/** The zero-AI default storyboard from a world's own photos — what the preview shows first. */
export function defaultStoryboardFor(m: VideoMaterials, title: string, aspect: Storyboard['aspect'] = '9:16'): Storyboard {
  const c = m.ctx;
  return buildStoryboard({
    title, aspect, accent: m.accent,
    scenes: defaultScenes({
      businessName: c?.business_name ?? title,
      craft: c?.craft ?? null,
      audience: c?.audience ?? null,
      offer: c?.offerings?.[0] ? `Ask about ${c.offerings[0]}` : null,
      photos: m.photos,
    }),
  });
}

const SB_MARK = '⟦storyboard⟧';

/** Save the storyboard as a studio artifact — human-readable shot list + a marked JSON footer. */
export async function saveStoryboard(clusterId: string, sb: Storyboard): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const human = [
    `VIDEO STORYBOARD — ${sb.title} (${sb.aspect}, ${sb.totalDurationS}s)`,
    '',
    ...sb.scenes.map((s, i) =>
      `${i + 1}. [${s.durationS}s] ${s.imageUrl ? 'PHOTO' : (s.shoot ?? 'card')}\n   ON-SCREEN: ${s.onScreen || '—'}\n   VO: ${s.voiceover || '—'}`),
    '',
    'CAPTIONS (SRT):', sb.captionsSrt || '(none)',
  ].join('\n');
  const { error } = await supabase.from('knowledge_artifacts').upsert({
    owner_id: uid, cluster_id: clusterId, slug: 'video-storyboard', kind: 'video',
    title: `Video — ${sb.title}`, detail: `${human}\n\n${SB_MARK}${JSON.stringify(sb)}`, source: 'garvis-chat',
  }, { onConflict: 'cluster_id,slug' });
  if (error) throw new Error(`Could not save the storyboard: ${error.message}`);
}

export interface RenderStart { available: boolean; ok?: boolean; id?: string; error?: string; setup?: string[] }
export interface RenderStatus { available: boolean; ok?: boolean; status?: string; url?: string | null; error?: string }

/** Kick a render. Returns the provider render id (poll pollRender), or an honest "not configured"
 *  with the setup steps — the browser preview stands regardless. */
export async function startRender(sb: Storyboard): Promise<RenderStart> {
  const { data, error } = await supabase.functions.invoke('render-video', {
    body: { mode: 'render', edit: toShotstackEdit(sb) },
  });
  if (error) throw new Error(error.message);
  return data as RenderStart;
}

export async function pollRender(id: string): Promise<RenderStatus> {
  const { data, error } = await supabase.functions.invoke('render-video', { body: { mode: 'status', id } });
  if (error) throw new Error(error.message);
  return data as RenderStatus;
}

/** When a render finishes, record the mp4 as an artifact in the area so it lives with the world. */
export async function saveRenderedVideo(clusterId: string, title: string, url: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return;
  await supabase.from('knowledge_artifacts').upsert({
    owner_id: uid, cluster_id: clusterId, slug: 'rendered-video', kind: 'video',
    title: `Rendered video — ${title}`, detail: `The finished mp4 for "${title}".`, url, source: 'garvis',
  }, { onConflict: 'cluster_id,slug' });
}
