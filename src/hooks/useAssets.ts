// src/hooks/useAssets.ts
// The project ASSET LIBRARY (Framer-parity): the user's own images — uploaded from disk or
// harvested from an existing website — stored in the public 'project-assets' bucket with a
// manifest row (name/url/alt/source). assetsContext() renders the manifest block injected into
// every build/edit so generated pages use these REAL photos instead of stock.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ASSETS_PATH } from '../lib/projectBrain';

export interface ProjectAsset {
  id: string;
  owner_id: string;
  project_id: string;
  name: string;
  url: string;
  alt: string;
  source: 'upload' | 'harvest';
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface HarvestCandidate { url: string; alt: string }

/** The manifest block injected into builds. '' when the project has no assets. */
export function assetsContext(assets: ProjectAsset[]): string {
  if (!assets.length) return '';
  const lines = assets.slice(0, 40).map((a) => `- ${a.name}: ${a.url}${a.alt ? ` (alt: ${a.alt})` : ''}`);
  return [
    'PROJECT ASSETS — the user\'s OWN images (already hosted, public URLs). Use THESE for heroes,',
    'galleries, ScrollScenes, and content imagery before any stock source; write real alt text:',
    ...lines,
  ].join('\n');
}

export function useAssets(projectId: string | undefined) {
  const { session } = useAuth();
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<ProjectAsset[]> => {
    if (!projectId || !session) return [];
    const { data } = await supabase.from('project_assets')
      .select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    const rows = (data as ProjectAsset[]) ?? [];
    setAssets(rows);
    setLoading(false);
    return rows;
  }, [projectId, session]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Persist the manifest as a META FILE (/.fableforge/assets.md) — it rides into every edit's
  // context exactly like the Project Brain does, on every path (direct, agentic, edge).
  const syncManifest = useCallback(async (rows: ProjectAsset[]) => {
    if (!projectId) return;
    await supabase.from('project_files').upsert(
      { project_id: projectId, path: ASSETS_PATH, content: assetsContext(rows), updated_by_ai: false },
      { onConflict: 'project_id,path' },
    );
  }, [projectId]);

  /** Upload images from disk into storage + manifest. Returns how many succeeded. */
  const upload = async (files: FileList | File[]): Promise<number> => {
    if (!projectId || !session) return 0;
    let ok = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const path = `${session.user.id}/${projectId}/${Date.now()}-${clean}`;
      const up = await supabase.storage.from('project-assets').upload(path, file, { contentType: file.type });
      if (up.error) continue;
      const url = supabase.storage.from('project-assets').getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from('project_assets')
        .insert({ owner_id: session.user.id, project_id: projectId, name: clean, url, source: 'upload' });
      if (!error) ok++;
    }
    await syncManifest(await refresh());
    return ok;
  };

  /** Good alt text materially improves what the model builds with an image. */
  const setAlt = async (id: string, alt: string): Promise<void> => {
    await supabase.from('project_assets').update({ alt }).eq('id', id);
    await syncManifest(await refresh());
  };

  const remove = async (asset: ProjectAsset): Promise<void> => {
    // Best-effort storage delete (harvested rows before copy, or already-gone objects, just skip).
    const marker = '/project-assets/';
    const i = asset.url.indexOf(marker);
    if (i !== -1) {
      const path = decodeURIComponent(asset.url.slice(i + marker.length).split('?')[0]);
      await supabase.storage.from('project-assets').remove([path]);
    }
    await supabase.from('project_assets').delete().eq('id', asset.id);
    await syncManifest(await refresh());
  };

  /** List a website's images (the harvest picker). Throws with a readable message on failure. */
  const harvestList = async (url: string): Promise<HarvestCandidate[]> => {
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url, mode: 'images' } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return (data?.images ?? []) as HarvestCandidate[];
  };

  /** Copy one remote image into this project's storage + manifest (survives the old site). */
  const importImage = async (url: string): Promise<void> => {
    if (!projectId) return;
    const { data, error } = await supabase.functions.invoke('fetch-url', { body: { url, mode: 'save', projectId } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    await syncManifest(await refresh());
  };

  return { assets, loading, refresh, upload, setAlt, remove, harvestList, importImage };
}
