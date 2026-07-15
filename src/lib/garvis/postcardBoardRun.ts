// src/lib/garvis/postcardBoardRun.ts
// The impure half of the postcard board: load the world's real materials, generate a real AI image for a
// tile through the metered seam (honestly degrading when the key is off or the kind must use a real
// photo), and log a mailed batch. All the honesty + the compile is pure (postcardBoard.ts / mailer.ts);
// this only talks to Supabase + the image model.

import { loadMailerMaterials, logMailBatch } from './mailerRun';
import { generateImageAsset } from './imagegenRun';
import { postcardImagePrompt, withGeneratedImage, type PostcardContent, type PostcardMaterials } from './postcardBoard';

/** Load everything the board needs, in the pure adapter's shape (ctx + brand + real vault photos). */
export async function loadPostcardMaterials(worldId: string): Promise<PostcardMaterials> {
  const m = await loadMailerMaterials(worldId);
  return {
    ctx: m.ctx,
    brand: m.brand,
    images: m.images.map((i) => ({ url: i.url, caption: i.caption, label: i.label })),
  };
}

export type TileImageResult =
  | { ok: true; content: PostcardContent }
  | { ok: false; kind: 'refused' | 'unavailable' | 'error'; message: string; setup?: string[] };

/** Generate (or regenerate) a tile's front image from the honest prompt. Refuses listing kinds; degrades
 *  honestly with the setup steps when the provider key isn't configured. On success returns the tile
 *  with the AI image + provenance note applied. */
export async function generateTileImage(args: {
  content: PostcardContent; materials: PostcardMaterials; clusterId: string | null; style?: string | null;
}): Promise<TileImageResult> {
  const prompt = postcardImagePrompt(args.content, args.materials, args.style ?? null);
  if (!prompt.ok) return { ok: false, kind: 'refused', message: prompt.reason };
  try {
    const res = await generateImageAsset({
      prompt: prompt.prompt, size: '1536x1024', clusterId: args.clusterId,
      caption: args.content.spec.front.headline, label: 'ai-postcard',
    });
    if (!res.available) return { ok: false, kind: 'unavailable', message: 'AI image generation isn’t connected yet.', setup: res.setup };
    if (!res.ok || !res.url) return { ok: false, kind: 'error', message: res.error || 'The image model returned nothing.' };
    return { ok: true, content: withGeneratedImage(args.content, res.url, prompt.note) };
  } catch (e) {
    return { ok: false, kind: 'error', message: e instanceof Error ? e.message : 'Image generation failed.' };
  }
}

/** Honest "send": Garvis never mails; the operator prints/hands to a vendor and logs what went out, so
 *  the ledger + reflection count it as real outreach. */
export async function logPostcardMailed(args: {
  worldId: string; clusterId: string | null; title: string; pieceCount: number;
  status: 'planned' | 'printed' | 'mailed'; vendor?: string; costUsd?: number | null;
}): Promise<void> {
  await logMailBatch({
    worldId: args.worldId, clusterId: args.clusterId, artifactSlug: null,
    title: args.title, pieceCount: args.pieceCount, status: args.status,
    vendor: args.vendor, costUsd: args.costUsd ?? null,
  });
}
