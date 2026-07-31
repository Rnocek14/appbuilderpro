// src/lib/garvis/videoRun.ts
// Impure half of the video pillar: load the world's real materials for a storyboard, save a
// storyboard as a studio artifact (round-trips), and drive the render provider (POST edit → poll
// status → the mp4 url) through the render-video edge fn. The browser preview needs none of the
// render side — it plays the same storyboard locally.

import { supabase } from '../supabase';
import { getBrandKit } from './artifacts';
import { buildStoryboard, conceptScenes, toShotstackEdit, type EditOpts, type Storyboard, type VideoConcept } from './storyboard';
import type { AiProvenance } from './mediaProvenance';
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
export function defaultStoryboardFor(m: VideoMaterials, title: string, aspect: Storyboard['aspect'] = '9:16', concept: VideoConcept = 'proof_first'): Storyboard {
  const c = m.ctx;
  return buildStoryboard({
    title, aspect, accent: m.accent,
    scenes: conceptScenes({
      businessName: c?.business_name ?? title,
      craft: c?.craft ?? null,
      audience: c?.audience ?? null,
      offer: c?.offerings?.[0] ? `Ask about ${c.offerings[0]}` : null,
      photos: m.photos,
    }, concept),
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
export interface RenderStatus {
  available: boolean; ok?: boolean; status?: string; url?: string | null; error?: string;
  /** true when the returned url is the owner's durable storage copy (the provider's rots in 24h). */
  durable?: boolean; providerUrl?: string;
}

/** Kick a render. Returns the provider render id (poll pollRender), or an honest "not configured"
 *  with the setup steps — the browser preview stands regardless. `opts` layers voiceover clips, a
 *  hosted caption track, and a music bed onto the same edit. */
export async function startRender(sb: Storyboard, opts?: EditOpts): Promise<RenderStart> {
  const { data, error } = await supabase.functions.invoke('render-video', {
    body: { mode: 'render', edit: toShotstackEdit(sb, opts) },
  });
  if (error) throw new Error(error.message);
  return data as RenderStart;
}

/** Poll a render. With `clusterId`, a finished render is FINALIZED server-side: copied into durable
 *  storage (Shotstack URLs die in 24h) and recorded as a vault video row — with the AI-provenance
 *  stamp when the storyboard carried AI media, so the publish disclosure gate holds downstream. */
export async function pollRender(id: string, finalize?: { clusterId: string; aiProvenance?: AiProvenance | null }): Promise<RenderStatus> {
  const { data, error } = await supabase.functions.invoke('render-video', {
    body: { mode: 'status', id, clusterId: finalize?.clusterId, aiProvenance: finalize?.aiProvenance ?? undefined },
  });
  if (error) throw new Error(error.message);
  return data as RenderStatus;
}

/** Upload the storyboard's SRT captions as a small text asset so the render provider can fetch it.
 *  Returns the public URL, or null when the board has no captions. */
export async function saveSrtAsset(clusterId: string, sb: Storyboard): Promise<string | null> {
  if (!sb.captionsSrt) return null;
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const path = `${uid}/studio/${clusterId}/captions-${crypto.randomUUID()}.srt`;
  const { error } = await supabase.storage.from('project-assets')
    .upload(path, new Blob([sb.captionsSrt], { type: 'text/plain' }), { upsert: false });
  if (error) throw new Error(`Could not host the captions: ${error.message}`);
  return supabase.storage.from('project-assets').getPublicUrl(path).data.publicUrl;
}

export interface VoiceoverResult {
  available: boolean; ok?: boolean; error?: string; setup?: string[];
  clips?: { sceneIndex: number; url: string }[];
  provenance?: AiProvenance;
}

/** Generate per-scene voiceover mp3s for every scene with a narration line. The result carries the
 *  AI-audio provenance stamp — keep it with the render so the publish disclosure holds. */
export async function generateVoiceover(sb: Storyboard, clusterId: string, opts?: { voice?: string; provider?: 'openai' | 'elevenlabs' }): Promise<VoiceoverResult> {
  const { data, error } = await supabase.functions.invoke('tts-voiceover', {
    body: {
      scenes: sb.scenes.map((s) => ({ text: s.voiceover, seconds: s.durationS })),
      voice: opts?.voice, provider: opts?.provider, clusterId,
    },
  });
  if (error) throw new Error(error.message);
  return data as VoiceoverResult;
}

/** When a render finishes, record the mp4 as an artifact in the area so it lives with the world.
 *  Each render gets its OWN slug (keyed by render id) — renders never overwrite each other. */
export async function saveRenderedVideo(clusterId: string, title: string, url: string, renderId?: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return;
  const slug = `rendered-video-${renderId ?? Date.now()}`;
  await supabase.from('knowledge_artifacts').upsert({
    owner_id: uid, cluster_id: clusterId, slug, kind: 'video',
    title: `Rendered video — ${title}`, detail: `The finished mp4 for "${title}".`, url, source: 'garvis',
  }, { onConflict: 'cluster_id,slug' });
}
