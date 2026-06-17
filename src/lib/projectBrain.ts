// src/lib/projectBrain.ts
// The "Project Brain" — persistent context the assistant carries into every conversation:
// the app's vision, goals, decisions, and constraints. Stored as a file in project_files
// (path below) so it needs no DB migration and is versioned alongside the project. It is
// NOT part of the generated app — it lives under /.fableforge/ and is filtered from the
// file tree and excluded from app code context.

import { supabase } from './supabase';

export const BRAIN_PATH = '/.fableforge/brain.md';
export const MAP_PATH = '/.fableforge/project-map.md';
export const ROADMAP_PATH = '/.fableforge/roadmap.md';
export const IDEATION_PATH = '/.fableforge/ideation.md';
/** Files under this prefix are project metadata, not app source. */
export const META_PREFIX = '/.fableforge/';

export const DOCS_PREFIX = '/.fableforge/docs/';

export const DEFAULT_BRAIN = `## North Star
The one sentence that captures what this is and why it matters.

## Vision
What is this app, and who is it for?

## Goals
-

## Key decisions
-

## Constraints & preferences
-
`;

/** Read the brain for a project. Returns '' if none has been written yet. */
export async function getBrain(projectId: string): Promise<string> {
  const { data } = await supabase
    .from('project_files')
    .select('content')
    .eq('project_id', projectId)
    .eq('path', BRAIN_PATH)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.content ?? '';
}

/** Create or update the brain. Marked updated_by_ai:false — it's the human's intent. */
export async function saveBrain(projectId: string, content: string): Promise<void> {
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: BRAIN_PATH, content, updated_by_ai: false },
    { onConflict: 'project_id,path' },
  );
}

/** Read the saved project map for a project. '' if none generated yet. */
export async function getMap(projectId: string): Promise<string> {
  const { data } = await supabase
    .from('project_files')
    .select('content')
    .eq('project_id', projectId)
    .eq('path', MAP_PATH)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.content ?? '';
}

/** Persist the generated project map. Marked updated_by_ai:true — it's machine-derived. */
export async function saveMap(projectId: string, content: string): Promise<void> {
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: MAP_PATH, content, updated_by_ai: true },
    { onConflict: 'project_id,path' },
  );
}

/** Read the saved roadmap. '' if none generated yet. */
export async function getRoadmap(projectId: string): Promise<string> {
  const { data } = await supabase
    .from('project_files')
    .select('content')
    .eq('project_id', projectId)
    .eq('path', ROADMAP_PATH)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.content ?? '';
}

/** Persist the generated roadmap. */
export async function saveRoadmap(projectId: string, content: string): Promise<void> {
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: ROADMAP_PATH, content, updated_by_ai: true },
    { onConflict: 'project_id,path' },
  );
}

/** Read the saved ideation directions. '' if none. */
export async function getIdeation(projectId: string): Promise<string> {
  const { data } = await supabase
    .from('project_files').select('content')
    .eq('project_id', projectId).eq('path', IDEATION_PATH).is('deleted_at', null).maybeSingle();
  return data?.content ?? '';
}

/** Persist generated ideation directions. */
export async function saveIdeation(projectId: string, content: string): Promise<void> {
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: IDEATION_PATH, content, updated_by_ai: true },
    { onConflict: 'project_id,path' },
  );
}

/** True for project-metadata files (brain, project map, roadmap) that are not app source. */
export function isMetaFile(path: string): boolean {
  return path.startsWith(META_PREFIX);
}

/** Wrap brain text as a context block for prompts. Empty string if there's no brain yet. */
export function brainContext(brain: string): string {
  const trimmed = brain.trim();
  if (!trimmed) return '';
  return `PROJECT BRAIN — the app's vision, goals, and decisions. Honor these in everything you do; ` +
    `flag it if a request contradicts them:\n${trimmed}\n\n`;
}

/** Wrap the project map as a context block. Empty string if no map yet. */
export function mapContext(map: string): string {
  const trimmed = map.trim();
  if (!trimmed) return '';
  return `PROJECT MAP — an overview of what the app currently contains, what is stubbed/incomplete, ` +
    `and known gaps. Use it to reason about the whole project and what to do next:\n${trimmed}\n\n`;
}

/** Wrap the saved roadmap as a context block. Empty string if none. */
export function roadmapContext(roadmap: string): string {
  const trimmed = roadmap.trim();
  if (!trimmed) return '';
  return `ROADMAP — the project's current phased plan of what to build next. Use it when the user ` +
    `asks what's next or how the app is doing:\n${trimmed}\n\n`;
}

// ---- Uploaded documents (kept after upload: viewable AND part of context) ----

export interface BrainDoc {
  path: string;
  name: string;
}

/** Persist an uploaded document's extracted text so it stays available and viewable. */
export async function saveDoc(projectId: string, filename: string, text: string): Promise<void> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  await supabase.from('project_files').upsert(
    { project_id: projectId, path: `${DOCS_PREFIX}${safe}`, content: text, updated_by_ai: false },
    { onConflict: 'project_id,path' },
  );
}

/** List the documents uploaded to this project's brain. */
export async function listDocs(projectId: string): Promise<BrainDoc[]> {
  const { data } = await supabase
    .from('project_files')
    .select('path')
    .eq('project_id', projectId)
    .like('path', `${DOCS_PREFIX}%`)
    .is('deleted_at', null);
  return (data ?? []).map((f) => ({ path: f.path, name: f.path.slice(DOCS_PREFIX.length) }));
}

/** Read one uploaded document's text. */
export async function getDoc(projectId: string, path: string): Promise<string> {
  const { data } = await supabase
    .from('project_files')
    .select('content')
    .eq('project_id', projectId)
    .eq('path', path)
    .maybeSingle();
  return data?.content ?? '';
}
