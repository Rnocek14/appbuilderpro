// src/lib/branchCore.ts
// PURE feature-branch logic: overlay decoding, the composed branch view, three-way merge
// classification, and candidate building. No DB imports — verifiable with `verify:branches`.
// Storage ops (the copy-on-write writes, tombstones, discard) live in lib/branches.ts, which
// re-exports everything here; app code imports from './branches'.
//
// Storage layout (rows in project_files, invisible to Main because isMetaFile() hides the prefix):
//   /.fableforge/branches/<id>/files<path>  — working copy (real path appended, keeps its '/')
//   /.fableforge/branches/<id>/base<path>   — Main content frozen at the branch's first write
//   /.fableforge/branches/<id>/branch.json  — manifest: { deleted: [paths] } tombstones
//
// The base copies make merges safe: base vs Main-now vs branch is a real three-way diff, so
// "Main moved on" is detected per file instead of blindly overwriting.

export const BRANCHES_PREFIX = '/.fableforge/branches/';
// Mirrors projectBrain.META_PREFIX (not imported — that module pulls in the DB client).
const META_PREFIX = '/.fableforge/';

/** Minimal row shape the pure functions need — UI code passes full ProjectFile rows. */
export interface BranchRow { path: string; content: string }

export function branchWorkPath(branchId: string, path: string): string {
  return `${BRANCHES_PREFIX}${branchId}/files${path}`;
}
export function branchBasePath(branchId: string, path: string): string {
  return `${BRANCHES_PREFIX}${branchId}/base${path}`;
}
export function branchManifestPath(branchId: string): string {
  return `${BRANCHES_PREFIX}${branchId}/branch.json`;
}
export function isBranchRow(path: string): boolean {
  return path.startsWith(BRANCHES_PREFIX);
}

/** A branch's overlay, decoded from project_files rows. */
export interface BranchState {
  /** real path → branch working content */
  overrides: Map<string, string>;
  /** real path → Main content frozen at the branch's first write to that file */
  bases: Map<string, string>;
  /** real paths the branch deleted (tombstones from the manifest) */
  deleted: Set<string>;
}

export function readBranchState(rows: BranchRow[], branchId: string): BranchState {
  const workPrefix = `${BRANCHES_PREFIX}${branchId}/files/`;
  const basePrefix = `${BRANCHES_PREFIX}${branchId}/base/`;
  const manifest = branchManifestPath(branchId);
  const state: BranchState = { overrides: new Map(), bases: new Map(), deleted: new Set() };
  for (const r of rows) {
    if (r.path.startsWith(workPrefix)) state.overrides.set(r.path.slice(workPrefix.length - 1), r.content);
    else if (r.path.startsWith(basePrefix)) state.bases.set(r.path.slice(basePrefix.length - 1), r.content);
    else if (r.path === manifest) {
      try {
        const m = JSON.parse(r.content) as { deleted?: string[] };
        for (const p of m.deleted ?? []) state.deleted.add(p);
      } catch { /* corrupt manifest → no tombstones */ }
    }
  }
  // A write after a delete clears the tombstone logically even if the manifest write raced.
  for (const p of state.overrides.keys()) state.deleted.delete(p);
  return state;
}

/**
 * The branch's virtual file list: Main's rows with branch working copies overlaid (at their REAL
 * paths), tombstoned files removed, and branch bookkeeping rows hidden. Overridden entries reuse
 * the branch ROW object (so row ids/versions point at the branch copy — file history in the
 * editor shows the branch's own edits). Main's other meta rows (brain, map, prefs) pass through
 * unchanged so assistant context works exactly as on Main.
 */
export function composeBranchFiles<T extends BranchRow>(rows: T[], branchId: string): T[] {
  const workPrefix = `${BRANCHES_PREFIX}${branchId}/files/`;
  const state = readBranchState(rows, branchId);
  const workRows = new Map<string, T>();
  for (const r of rows) {
    if (r.path.startsWith(workPrefix)) workRows.set(r.path.slice(workPrefix.length - 1), r);
  }
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (isBranchRow(r.path)) continue;
    if (state.deleted.has(r.path)) continue;
    const work = workRows.get(r.path);
    out.push(work ? { ...work, path: r.path } : r);
    seen.add(r.path);
  }
  // Files the branch created that don't exist on Main yet.
  for (const [path, row] of workRows) {
    if (!seen.has(path) && !state.deleted.has(path)) out.push({ ...row, path });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merge classification — the three-way diff that drives the merge gate.
// ---------------------------------------------------------------------------

export type MergeAction =
  | 'take-branch'     // safe: Main hasn't moved (or file is new) → branch version lands as-is
  | 'noop'            // branch and Main already agree
  | 'conflict'        // both sides changed → needs resolution before Main is touched
  | 'delete'          // safe delete: Main still matches the branch's base
  | 'delete-skipped'; // branch deleted it but Main changed it since → keep Main's version, report

export interface BranchChange {
  path: string;
  kind: 'added' | 'edited' | 'deleted';
  action: MergeAction;
  base?: string;
  main?: string;
  branch?: string;
}

/** Three-way classify every branch change against Main's CURRENT content. */
export function classifyBranch(mainApp: Map<string, string>, state: BranchState): BranchChange[] {
  const changes: BranchChange[] = [];
  for (const [path, branch] of state.overrides) {
    const main = mainApp.get(path);
    const base = state.bases.get(path);
    if (main === branch) { changes.push({ path, kind: base === undefined ? 'added' : 'edited', action: 'noop' }); continue; }
    if (base === undefined) {
      // Branch created this file. If Main independently created a different one → conflict.
      changes.push(main === undefined
        ? { path, kind: 'added', action: 'take-branch', branch }
        : { path, kind: 'added', action: 'conflict', base: '', main, branch });
      continue;
    }
    // Main deleted a file the branch kept working on → the branch's active work wins (restore).
    if (main === undefined) { changes.push({ path, kind: 'edited', action: 'take-branch', branch }); continue; }
    changes.push(main === base
      ? { path, kind: 'edited', action: 'take-branch', branch }
      : { path, kind: 'edited', action: 'conflict', base, main, branch });
  }
  for (const path of state.deleted) {
    if (state.overrides.has(path)) continue; // a later write supersedes the tombstone
    const main = mainApp.get(path);
    const base = state.bases.get(path);
    if (main === undefined) { changes.push({ path, kind: 'deleted', action: 'noop' }); continue; }
    changes.push(base === undefined || main === base
      ? { path, kind: 'deleted', action: 'delete' }
      : { path, kind: 'deleted', action: 'delete-skipped', base, main });
  }
  return changes;
}

/**
 * Build the post-merge candidate file set. `resolutions` supplies the merged content for every
 * 'conflict' path — the caller must resolve them all first.
 */
export function buildCandidate(
  mainApp: Map<string, string>, changes: BranchChange[], resolutions: Map<string, string>,
): Map<string, string> {
  const out = new Map(mainApp);
  for (const c of changes) {
    if (c.action === 'take-branch') out.set(c.path, c.branch ?? '');
    else if (c.action === 'conflict') {
      const r = resolutions.get(c.path);
      if (r === undefined) throw new Error(`Unresolved merge conflict: ${c.path}`);
      out.set(c.path, r);
    } else if (c.action === 'delete') out.delete(c.path);
    // noop / delete-skipped: Main's version stands
  }
  return out;
}

/** Compact per-branch status for the UI (BranchBar counts). */
export interface BranchSummary {
  changes: BranchChange[];
  /** changes that would land on merge (everything but noop) */
  changed: number;
  conflicts: number;
  skippedDeletes: number;
}

export function summarizeBranch(rows: BranchRow[], branchId: string): BranchSummary {
  const mainApp = new Map<string, string>();
  for (const r of rows) if (!r.path.startsWith(META_PREFIX)) mainApp.set(r.path, r.content);
  const changes = classifyBranch(mainApp, readBranchState(rows, branchId));
  const active = changes.filter((c) => c.action !== 'noop');
  return {
    changes,
    changed: active.length,
    conflicts: active.filter((c) => c.action === 'conflict').length,
    skippedDeletes: active.filter((c) => c.action === 'delete-skipped').length,
  };
}
