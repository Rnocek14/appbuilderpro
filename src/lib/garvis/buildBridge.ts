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
  const [{ data: world }, { data: intel }, brand, { data: files }, { data: clusterRows }] = await Promise.all([
    supabase.from('knowledge_worlds').select('title, dna, business_context').eq('id', worldId).maybeSingle(),
    supabase.from('world_intelligence').select('objective, recommendation, reflection, open_questions').eq('world_id', worldId).maybeSingle(),
    getBrandKit(worldId).catch(() => null),
    supabase.from('cluster_files')
      .select('name, url, kind, caption, label, cluster_id, knowledge_clusters!inner(world_id)')
      .eq('knowledge_clusters.world_id', worldId).eq('kind', 'image').limit(60),
    supabase.from('knowledge_clusters').select('id').eq('world_id', worldId),
  ]);
  if (!world) throw new Error('World not found.');

  const dna = (world.dna as WorldDNA | null) ?? null;
  const ctx = (world.business_context as BusinessContext | null) ?? null;
  const photos: WebsitePhoto[] = ((files ?? []) as { name: string; url: string; caption: string | null; label: string | null }[])
    .map((f) => ({ name: f.name, url: f.url, caption: f.caption, label: f.label }));

  // KNOWLEDGE INTO THE BUILD (bones-audit fix): the world's real research briefs and reflection
  // lessons flow into the FIRST generation, so the site is grounded in accumulated work — not the
  // DNA alone. EARNED research only (seeded playbooks excluded — they're frameworks, not findings).
  const knowledge: string[] = [];
  const clusterIds = ((clusterRows ?? []) as { id: string }[]).map((c) => c.id);
  if (clusterIds.length) {
    const { data: research } = await supabase.from('knowledge_artifacts')
      .select('title, detail, source').in('cluster_id', clusterIds).eq('kind', 'research')
      .neq('source', 'garvis-seed').order('created_at', { ascending: false }).limit(6);
    for (const r of (research ?? []) as { title: string; detail: string | null }[]) {
      knowledge.push(`${r.title}${r.detail ? `: ${r.detail.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
    }
  }
  const reflection = intel?.reflection as { learned?: { text: string }[] } | null;
  for (const l of (reflection?.learned ?? []).slice(0, 4)) if (l?.text) knowledge.push(`Learned: ${l.text}`);
  if (intel?.recommendation) knowledge.push(`Direction: ${intel.recommendation}`);

  // G5: provision (or reuse) the world's site channel so the generated site reports visits and
  // leads back to THIS world. Fail-soft — a channel miss builds the old store-only form.
  const ingest = await ensureSiteChannel(worldId).catch(() => null);

  const compiled = compileWebsiteBrief({
    worldTitle: world.title as string,
    objective: (intel?.objective as string | null) ?? null,
    dna, ctx, brand, photos, knowledge, ingest,
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

/** G5: one write-only site channel per world. The channel id is the ingest token the generated
 *  site embeds; reuse an existing unrevoked channel so rebuilding never mints token churn. */
async function ensureSiteChannel(worldId: string): Promise<{ endpoint: string; token: string } | null> {
  const base = (import.meta.env?.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (!base) return null;
  const endpoint = `${base}/functions/v1/site-events`;
  const { data: existing } = await supabase.from('site_channels')
    .select('id').eq('world_id', worldId).is('revoked_at', null).limit(1).maybeSingle();
  if (existing) return { endpoint, token: (existing as { id: string }).id };
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return null;
  const { data: created, error } = await supabase.from('site_channels')
    .insert({ owner_id: uid, world_id: worldId }).select('id').single();
  if (error || !created) return null;
  return { endpoint, token: (created as { id: string }).id };
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

  // G5: stamp this project onto the world's site channel so events are attributable to the app
  // that produced them (the channel was provisioned at brief time; fail-soft if absent).
  await supabase.from('site_channels')
    .update({ project_id: projectId })
    .eq('world_id', handoff.worldId).is('revoked_at', null).is('project_id', null);

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
