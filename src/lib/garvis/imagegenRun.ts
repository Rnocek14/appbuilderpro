// src/lib/garvis/imagegenRun.ts
// Impure half of AI image generation: invoke the metered `generate-image` edge function and hand back
// the stored public URL. The honest prompt (and the refusal of listing types) is built by the pure
// buildImagePrompt in imagegen.ts; this only talks to the seam. Degrades honestly when the provider
// key isn't set (returns { available:false, setup }).

import { supabase } from '../supabase';

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';

export interface GenImageResult {
  available: boolean;
  ok?: boolean;
  url?: string;
  error?: string;
  setup?: string[];
}

export async function generateImageAsset(opts: {
  prompt: string; size?: ImageSize; clusterId?: string | null; caption?: string | null; label?: string;
}): Promise<GenImageResult> {
  const { data, error } = await supabase.functions.invoke('generate-image', {
    body: {
      prompt: opts.prompt, size: opts.size ?? '1536x1024',
      clusterId: opts.clusterId ?? null, caption: opts.caption ?? null, label: opts.label ?? 'ai-generated',
    },
  });
  if (error) throw new Error(error.message);
  return data as GenImageResult;
}
