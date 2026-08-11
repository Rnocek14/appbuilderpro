// src/lib/garvis/brandBoardRun.ts
// Impure half of the branding board: load the real brand (name + palette + existing logo), generate a
// logo concept through the image model (honest degrade when the key is off), and — when the owner picks
// one — set it as the world's brand logo.

import { supabase } from '../supabase';
import { getBrandKit, saveBrandKit } from './artifacts';
import { loadWeb } from './workwebRun';
import { inferRealEstate } from './studioKit';
import { generateImageAsset } from './imagegenRun';
import { buildLogoPrompt, withGeneratedLogo, logoStyleById, LOGO_STYLES, type BrandContent, type BrandMaterials } from './brandBoard';

export async function loadBrandMaterials(worldId: string): Promise<BrandMaterials> {
  const [brand, web] = await Promise.all([getBrandKit(worldId).catch(() => null), loadWeb(worldId).catch(() => null)]);
  const businessName = brand?.name || web?.title || '';
  return {
    businessName,
    palette: brand?.palette ?? [],
    logoUrl: brand?.logo_url ?? null,
    realEstate: inferRealEstate(businessName),
  };
}

/** The world's intel notes for the board's research rail — real artifacts from intel areas,
 *  newest first, trimmed for the rail. Empty on any failure (the rail just doesn't render). */
export async function loadResearchNotes(worldId: string): Promise<{ title: string; body: string }[]> {
  try {
    const { data: clusters } = await supabase.from('knowledge_clusters')
      .select('id, charter').eq('world_id', worldId).limit(60);
    const intelIds = ((clusters ?? []) as { id: string; charter: { archetype?: string } | null }[])
      .filter((c) => c.charter?.archetype === 'intel').map((c) => c.id);
    if (!intelIds.length) return [];
    const { data: arts } = await supabase.from('knowledge_artifacts')
      .select('title, detail, created_at').in('cluster_id', intelIds)
      .order('created_at', { ascending: false }).limit(6);
    return ((arts ?? []) as { title: string; detail: string | null }[])
      .map((a) => ({ title: a.title, body: (a.detail ?? '').replace(/\s+/g, ' ').trim().slice(0, 220) }))
      .filter((a) => a.body.length > 0);
  } catch { return []; }
}

export type LogoResult =
  | { ok: true; content: BrandContent }
  | { ok: false; kind: 'unavailable' | 'error'; message: string; setup?: string[] };

/** Generate a logo concept. Uses the tile's own prompt (already palette-informed); an `extra` style nudge
 *  re-derives the prompt for the tile's style. Degrades honestly when the provider key isn't set. */
export async function generateLogo(args: {
  content: BrandContent; materials: BrandMaterials; clusterId: string | null; extra?: string | null;
}): Promise<LogoResult> {
  const style = logoStyleById(args.content.styleId) ?? LOGO_STYLES[0];
  const prompt = args.extra != null && args.extra.trim()
    ? buildLogoPrompt(args.materials, style, args.extra)
    : args.content.prompt;
  try {
    const res = await generateImageAsset({ prompt, size: '1024x1024', clusterId: args.clusterId, caption: `${style.label} logo concept`, label: 'ai-logo' });
    if (!res.available) return { ok: false, kind: 'unavailable', message: 'Logo generation needs an image key.', setup: res.setup };
    if (!res.ok || !res.url) return { ok: false, kind: 'error', message: res.error || 'The image model returned nothing.' };
    return { ok: true, content: withGeneratedLogo({ ...args.content, prompt }, res.url) };
  } catch (e) {
    return { ok: false, kind: 'error', message: e instanceof Error ? e.message : 'Logo generation failed.' };
  }
}

/** Set a chosen concept as the world's brand logo. */
export async function setBrandLogo(worldId: string, url: string): Promise<void> {
  await saveBrandKit(worldId, { logo_url: url });
}
