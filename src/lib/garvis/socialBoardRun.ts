// src/lib/garvis/socialBoardRun.ts
// The impure half of the social board: load the world's real materials (name, area, brand, photos),
// generate a real per-platform AI image (honest degrade when the key is off or the kind needs a real
// photo), and QUEUE a post to the approval-gated publisher — the loop actually closes (unlike print).
// Nothing posts here; queueSocialPost snapshots the post and enqueues one publish_post approval.

import { loadMailerMaterials } from './mailerRun';
import { getBrandKit } from './artifacts';
import { loadWeb } from './workwebRun';
import { inferRealEstate } from './studioKit';
import { generateImageAsset } from './imagegenRun';
import { queueSocialPost } from './socialRun';
import {
  socialImagePrompt, withGeneratedImage, sizeForPlatform, composeSocialText,
  type SocialContent, type SocialMaterials,
} from './socialBoard';

const provider = (p: SocialContent['platform']): string => (p === 'x' ? 'twitter' : p);

/** Load everything the social board needs, in the pure adapter's shape. */
export async function loadSocialMaterials(worldId: string): Promise<SocialMaterials> {
  const [m, brand, web] = await Promise.all([
    loadMailerMaterials(worldId),
    getBrandKit(worldId).catch(() => null),
    loadWeb(worldId).catch(() => null),
  ]);
  const businessName = m.ctx?.business_name || web?.title || '';
  const bk = brand as ({ palette?: string[]; avatarUrl?: string | null; name?: string | null } | null);
  return {
    businessName: businessName || bk?.name || '',
    area: m.ctx?.locale ?? null,
    realEstate: inferRealEstate(businessName || bk?.name || null),
    accent: m.brand?.palette?.[0] || bk?.palette?.[0] || '#FF8A3D',
    avatarUrl: bk?.avatarUrl ?? null,
    images: m.images.map((i) => ({ url: i.url, caption: i.caption, label: i.label })),
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
export async function queueSocialTile(args: {
  content: SocialContent; worldId: string | null; scheduleAt?: string | null;
}): Promise<{ warnings: string[] }> {
  const { content } = args;
  const text = composeSocialText(content.platform, content.caption, content.hashtags);
  const media = content.imageUrl ? [content.imageUrl] : [];
  const res = await queueSocialPost({
    text, platforms: [provider(content.platform)], mediaUrls: media,
    scheduleAt: args.scheduleAt ?? null, worldId: args.worldId,
  });
  return { warnings: res.warnings };
}
