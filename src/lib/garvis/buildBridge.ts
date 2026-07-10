// src/lib/garvis/buildBridge.ts
// G3 impure half: carry a world INTO the app builder, and bind the created project BACK to the
// world. The handoff rides the same localStorage channel the constellation handoff proved out
// ('ff:build-brief' seeds prompt+brief → planContext → the FIRST generation), plus a binding
// payload consumed after project creation: photos metadata-copied into project_assets (same
// public bucket — zero data movement), the assets.md manifest written, projects.world_id
// stamped, and an 'app' artifact recorded in the originating cluster so the world tracks its
// own website as state.

import { supabase } from '../supabase';
import { recordMindEvent } from './mindStore';
import { getBrandKit } from './artifacts';
import { compileWebsiteBrief, type WebsitePhoto } from './websiteBrief';
import { assetsContext, type ProjectAsset } from '../../hooks/useAssets';
import type { WorldDNA, BusinessContext } from './genesis';

const KEY_BRIEF = 'ff:build-brief';
const KEY_WORLD = 'ff:world-build';

export interface WorldBuildHandoff {
  worldId: string;
  clusterId: string;
  worldTitle: string;
  prompt: string;             // the seeded prompt — binding only happens if the user still builds THIS
  assets: { name: string; url: string; alt: string }[];
}

/** Compile the world's website brief and stage the handoff. Returns the route to navigate to. */
export async function buildFromWorld(worldId: string, clusterId: string): Promise<string> {
  const [{ data: world }, { data: intel }, brand, { data: files }] = await Promise.all([
    supabase.from('knowledge_worlds').select('title, dna, business_context').eq('id', worldId).maybeSingle(),
    supabase.from('world_intelligence').select('objective').eq('world_id', worldId).maybeSingle(),
    getBrandKit(worldId).catch(() => null),
    supabase.from('cluster_files')
      .select('name, url, kind, caption, label, cluster_id, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(60),
  ]);
  if (!world) throw new Error('World not found.');

  const dna = (world.dna as WorldDNA | null) ?? null;
  const ctx = (world.business_context as BusinessContext | null) ?? null;
  const photos: WebsitePhoto[] = ((files ?? []) as { name: string; url: string; caption: string | null; label: string | null }[])
    .map((f) => ({ name: f.name, url: f.url, caption: f.caption, label: f.label }));

  const compiled = compileWebsiteBrief({
    worldTitle: world.title as string,
    objective: (intel?.objective as string | null) ?? null,
    dna, ctx, brand, photos,
  });

  const handoff: WorldBuildHandoff = {
    worldId, clusterId, worldTitle: world.title as string,
    prompt: compiled.prompt,
    assets: photos.map((p) => ({ name: p.name, url: p.url, alt: p.caption ?? '' })),
  };
  try {
    localStorage.setItem(KEY_BRIEF, JSON.stringify({ prompt: compiled.prompt, brief: compiled.brief }));
    localStorage.setItem(KEY_WORLD, JSON.stringify(handoff));
  } catch { /* prompt-only seed still works */ }
  return '/new?from=world';
}

export function readWorldHandoff(): WorldBuildHandoff | null {
  try {
    const raw = localStorage.getItem(KEY_WORLD);
    if (!raw) return null;
    return JSON.parse(raw) as WorldBuildHandoff;
  } catch { return null; }
}

export function clearWorldHandoff(): void {
  try { localStorage.removeItem(KEY_WORLD); } catch { /* ignore */ }
}

/** After the project exists: copy asset metadata, write the manifest, stamp provenance, and
 *  record the app as an artifact IN the world. Best-effort per step — a partial bind still
 *  leaves a working project; failures surface in the console, never block the build. */
export async function bindProjectToWorld(projectId: string, handoff: WorldBuildHandoff): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return;

  if (handoff.assets.length) {
    const rows = handoff.assets.slice(0, 40).map((a) => ({
      owner_id: uid, project_id: projectId, name: a.name, url: a.url, alt: a.alt, source: 'world' as const,
    }));
    const { data: inserted } = await supabase.from('project_assets').insert(rows).select('*');
    if (inserted?.length) {
      await supabase.from('project_files').upsert(
        { project_id: projectId, path: '/.fableforge/assets.md', content: assetsContext(inserted as ProjectAsset[]), updated_by_ai: false },
        { onConflict: 'project_id,path' },
      );
    }
  }

  await supabase.from('projects').update({ world_id: handoff.worldId }).eq('id', projectId);

  await supabase.from('knowledge_artifacts').upsert({
    owner_id: uid, cluster_id: handoff.clusterId, slug: 'website-app',
    kind: 'link', title: `Website app — built from this world`,
    detail: `The generated site for ${handoff.worldTitle}. Open the editor to refine it; deploys route through Approvals.`,
    url: `/project/${projectId}`, source: 'garvis',
  }, { onConflict: 'cluster_id,slug' });

  await recordMindEvent(uid, {
    event_type: 'note', source: 'workweb',
    subject: `Started the website build for ${handoff.worldTitle} (${handoff.assets.length} artwork photos attached)`,
    payload: { world_id: handoff.worldId, project_id: projectId },
  });
}
