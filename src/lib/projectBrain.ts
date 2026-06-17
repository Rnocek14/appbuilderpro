// src/lib/projectBrain.ts
// The "Project Brain" — persistent context the assistant carries into every conversation:
// the app's vision, goals, decisions, and constraints. Stored as a file in project_files
// (path below) so it needs no DB migration and is versioned alongside the project. It is
// NOT part of the generated app — it lives under /.fableforge/ and is filtered from the
// file tree and excluded from app code context.

import { supabase } from './supabase';

export const BRAIN_PATH = '/.fableforge/brain.md';
/** Files under this prefix are project metadata, not app source. */
export const META_PREFIX = '/.fableforge/';

export const DEFAULT_BRAIN = `# Project Brain

## Vision
What is this app, and who is it for? (one or two sentences)

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

/** True for project-metadata files (brain, future project map) that are not app source. */
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
