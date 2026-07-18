// src/lib/branches.ts
// Feature branches — threads that also fork the CODE, not just the conversation.
//
// A branch is a copy-on-write overlay on Main: the first time a branch edits a file, the file's
// Main content at that moment is frozen as the branch's BASE and the edit lands in a branch
// working copy. Untouched files always show Main's latest (an auto-rebasing overlay, like a PR
// that never goes stale). Everything is stored as namespaced rows in project_files — no schema
// migration, and isMetaFile() already hides the prefix from Main's preview, agent context, QA,
// and deploys.
//
// The pure logic (overlay decode, composed view, three-way classification, candidate build)
// lives in branchCore.ts so `verify:branches` can run it without a DB; this module adds the
// Supabase storage operations and re-exports the core, so app code imports only from here.

import { supabase } from './supabase';
import {
  readBranchState, branchWorkPath, branchBasePath, branchManifestPath, isBranchRow,
  BRANCHES_PREFIX, type BranchRow,
} from './branchCore';

export * from './branchCore';

/** Load every live row (path+content) for a project, paged like useProjectFiles for reliability. */
export async function loadProjectRows(projectId: string): Promise<BranchRow[]> {
  const PAGE = 100;
  const acc: BranchRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('project_files').select('path, content')
      .eq('project_id', projectId).is('deleted_at', null)
      .order('path').range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load project files: ${error.message}`);
    const batch = (data ?? []) as BranchRow[];
    acc.push(...batch);
    if (batch.length < PAGE) break;
  }
  return acc;
}

async function upsertRow(projectId: string, path: string, content: string): Promise<void> {
  // deleted_at: null resurrects a soft-deleted row (the unique key ignores deleted_at).
  const { error } = await supabase.from('project_files').upsert(
    { project_id: projectId, path, content, updated_by_ai: true, deleted_at: null },
    { onConflict: 'project_id,path' },
  );
  if (error) throw new Error(`Could not write ${path}: ${error.message}`);
}

async function softDeleteRow(projectId: string, path: string): Promise<void> {
  await supabase.from('project_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('project_id', projectId).eq('path', path);
}

async function readManifest(projectId: string, branchId: string): Promise<{ deleted: string[] }> {
  const { data } = await supabase
    .from('project_files').select('content')
    .eq('project_id', projectId).eq('path', branchManifestPath(branchId))
    .is('deleted_at', null).maybeSingle();
  try {
    const m = data?.content ? (JSON.parse(data.content) as { deleted?: string[] }) : {};
    return { deleted: m.deleted ?? [] };
  } catch { return { deleted: [] }; }
}

async function writeManifest(projectId: string, branchId: string, m: { deleted: string[] }): Promise<void> {
  await upsertRow(projectId, branchManifestPath(branchId), JSON.stringify(m, null, 2));
}

/**
 * Write a file on a branch. `freezeBase` is the Main content to freeze as this file's merge base —
 * pass it on the FIRST branch write to a Main file (when the branch has no live base row yet),
 * null otherwise (already frozen, or the file doesn't exist on Main).
 */
export async function writeBranchFile(
  projectId: string, branchId: string, path: string, content: string, freezeBase: string | null,
): Promise<void> {
  if (freezeBase !== null) await upsertRow(projectId, branchBasePath(branchId, path), freezeBase);
  await upsertRow(projectId, branchWorkPath(branchId, path), content);
}

/** Delete a file on a branch: drop the working copy and (for Main files) tombstone it. */
export async function deleteBranchFile(
  projectId: string, branchId: string, path: string, freezeBase: string | null, tombstone: boolean,
): Promise<void> {
  if (freezeBase !== null) await upsertRow(projectId, branchBasePath(branchId, path), freezeBase);
  await softDeleteRow(projectId, branchWorkPath(branchId, path));
  if (tombstone) {
    const m = await readManifest(projectId, branchId);
    if (!m.deleted.includes(path)) await writeManifest(projectId, branchId, { deleted: [...m.deleted, path] });
  }
}

export async function clearTombstone(projectId: string, branchId: string, path: string): Promise<void> {
  const m = await readManifest(projectId, branchId);
  if (m.deleted.includes(path)) await writeManifest(projectId, branchId, { deleted: m.deleted.filter((p) => p !== path) });
}

/**
 * Convenience for UI call sites (editor Save, file tree ops, message revert): derive the
 * freeze/tombstone decisions from the caller's already-loaded rows, then write.
 */
export async function saveBranchFile(
  projectId: string, branchId: string, rows: BranchRow[], path: string, content: string,
): Promise<void> {
  const state = readBranchState(rows, branchId);
  const main = rows.find((r) => r.path === path && !isBranchRow(r.path));
  const freeze = !state.bases.has(path) && main ? main.content : null;
  await writeBranchFile(projectId, branchId, path, content, freeze);
  if (state.deleted.has(path)) await clearTombstone(projectId, branchId, path);
}

/** UI-side delete on a branch (file tree / revert of a created file). */
export async function removeBranchFile(
  projectId: string, branchId: string, rows: BranchRow[], path: string,
): Promise<void> {
  const state = readBranchState(rows, branchId);
  const main = rows.find((r) => r.path === path && !isBranchRow(r.path));
  const freeze = main && !state.bases.has(path) ? main.content : null;
  await deleteBranchFile(projectId, branchId, path, freeze, !!main);
}

/** Throw away a branch's overlay entirely (working copies, bases, manifest). Main is untouched. */
export async function discardBranch(projectId: string, branchId: string): Promise<void> {
  await supabase.from('project_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('project_id', projectId).like('path', `${BRANCHES_PREFIX}${branchId}/%`);
}
