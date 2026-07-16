// src/lib/garvis/socialBoardRun.ts
// The impure half of the social board: load the world's real materials (name, area, brand, photos),
// generate a real per-platform AI image (honest degrade when the key is off or the kind needs a real
// photo), and QUEUE a post to the approval-gated publisher — the loop actually closes (unlike print).
// Nothing posts here; queueSocialPost snapshots the post and enqueues one publish_post approval.

import { supabase } from '../supabase';
import { loadMailerMaterials } from './mailerRun';
import { getBrandKit } from './artifacts';
import { loadWeb } from './workwebRun';
import { inferRealEstate } from './studioKit';
import { generateImageAsset } from './imagegenRun';
import { queueSocialPost } from './socialRun';
import { aiProvenance, withDisclosure } from './mediaProvenance';
import {
  socialImagePrompt, withGeneratedImage, sizeForPlatform, composeSocialText,
  type SocialContent, type SocialMaterials,
} from './socialBoard';

const provider = (p: SocialContent['platform']): string => (p === 'x' ? 'twitter' : p);

/** Load everything the social board needs, in the pure adapter's shape. */
export async function loadSocialMaterials(worldId: string): Promise<SocialMaterials> {
  const [m, brand, web, voiceRow] = await Promise.all([
    loadMailerMaterials(worldId),
    getBrandKit(worldId).catch(() => null),
    loadWeb(worldId).catch(() => null),
    // VOICE MEMORY: the most recent post the owner actually approved and published is the best
    // example of how they sound — board-copy's VOICE section matches its register, never copies it.
    supabase.from('social_posts').select('body').eq('status', 'posted')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then((r) => r.data, () => null),
  ]);
  const businessName = m.ctx?.business_name || web?.title || '';
  const bk = brand as ({ palette?: string[]; avatarUrl?: string | null; name?: string | null; logo_url?: string | null; headshots?: string[] } | null);
  return {
    businessName: businessName || bk?.name || '',
    area: m.ctx?.locale ?? null,
    realEstate: inferRealEstate(businessName || bk?.name || null),
    accent: m.brand?.palette?.[0] || bk?.palette?.[0] || '#FF8A3D',
    // The brand kit's real identity flows into the previews: explicit avatar, else the official
    // logo, else a headshot — the wire the audit found dead (logo saved but never shown anywhere).
    avatarUrl: bk?.avatarUrl ?? bk?.logo_url ?? bk?.headshots?.[0] ?? null,
    images: m.images.map((i) => ({ url: i.url, caption: i.caption, label: i.label })),
    tone: m.ctx?.tone ?? null,
    audience: m.ctx?.audience ?? null,
    offerings: m.ctx?.offerings ?? [],
    voiceExample: (voiceRow as { body?: string } | null)?.body?.slice(0, 800) ?? null,
  };
}

export type TileImageResult =
  | { ok: true; content: SocialContent }
  | { ok: false; kind: 'refused' | 'unavailable' | 'error'; message: string; setup?: string[] };

/** Generate (or regenerate) a tile's image at the platform's size. Refuses listing kinds; degrades
 *  honestly when the provider key isn't set. */
export async function generateSocialTileImage(args: {
  content: SocialContent; materials: SocialMaterials; clusterId: string | null; style?: string | null;
}): Promise<TileImageResult> {
  const prompt = socialImagePrompt(args.content, args.materials, args.style ?? null);
  if (!prompt.ok) return { ok: false, kind: 'refused', message: prompt.reason };
  try {
    const res = await generateImageAsset({
      prompt: prompt.prompt, size: sizeForPlatform(args.content.platform), clusterId: args.clusterId,
      caption: args.content.headline ?? args.content.caption.slice(0, 60), label: 'ai-social',
    });
    if (!res.available) return { ok: false, kind: 'unavailable', message: 'AI image generation isn’t connected yet.', setup: res.setup };
    if (!res.ok || !res.url) return { ok: false, kind: 'error', message: res.error || 'The image model returned nothing.' };
    return { ok: true, content: withGeneratedImage(args.content, res.url, prompt.note) };
  } catch (e) {
    return { ok: false, kind: 'error', message: e instanceof Error ? e.message : 'Image generation failed.' };
  }
}

/** Queue this tile to the approval-gated publisher — the loop closes here. Re-uses queueSocialPost, so
 *  it passes the exact same gate the network would (e.g. Instagram needs an image; the reason surfaces
 *  honestly if it can't). Returns any non-blocking warnings (char limits, etc.). */
/** Render the brand card as a REAL PNG via the render-design edge function. Returns null on any
 *  failure — callers degrade honestly instead of blocking the post. Not AI imagery: no disclosure. */
export async function renderBrandCardImage(content: SocialContent, materials: SocialMaterials, clusterId?: string | null): Promise<string | null> {
  try {
    const size = content.platform === 'instagram' ? '1080x1080' : '1200x628';
    const { data, error } = await supabase.functions.invoke('render-design', {
      body: {
        kind: 'brand_card', size, clusterId: clusterId ?? null,
        spec: {
          headline: content.headline ?? content.caption.slice(0, 80),
          business: materials.businessName || 'Your brand',
          area: materials.area, accent: materials.accent,
        },
      },
    });
    if (error) return null;
    const d = data as { ok?: boolean; url?: string };
    return d?.ok && d.url ? d.url : null;
  } catch { return null; }
}

export async function queueSocialTile(args: {
  content: SocialContent; worldId: string | null; scheduleAt?: string | null;
  /** When given, a brand-mode post gets its card RENDERED and attached instead of going out as text. */
  materials?: SocialMaterials | null; clusterId?: string | null;
}): Promise<{ warnings: string[] }> {
  const { content } = args;
  const base = composeSocialText(content.platform, content.caption, content.hashtags);
  // An AI-generated image on the post must be disclosed to the viewer (platform policy + our honesty
  // rules) — a real home photo or a rendered brand design is not AI, so it carries no label.
  const aiImage = content.imageMode === 'ai' && !!content.imageUrl;
  const text = aiImage ? withDisclosure(base, aiProvenance('image', 'gpt-image-1', Date.now())) : base;
  let media = content.imageUrl ? [content.imageUrl] : [];
  // THE TEXT-ONLY DEAD END, CLOSED: a brand-mode post now renders its card server-side and attaches
  // the PNG. If the render fails, the old honest warning still fires — nothing is silently dropped.
  if (!media.length && content.imageMode === 'brand' && args.materials) {
    const url = await renderBrandCardImage(content, args.materials, args.clusterId ?? null);
    if (url) media = [url];
  }
  const res = await queueSocialPost({
    text, platforms: [provider(content.platform)], mediaUrls: media,
    scheduleAt: args.scheduleAt ?? null, worldId: args.worldId,
  });
  const warnings = [...res.warnings];
  if (content.imageMode === 'brand' && !media.length) {
    warnings.unshift('Posting as text only — the brand card couldn’t be rendered this time. Add a photo, or try Queue again.');
  }
  return { warnings };
}
