// src/lib/pendingEdit.ts
// Pure (no supabase) types + helper for the review-before-write edit flow. A PendingEdit is a change
// set the model proposed but that has NOT been written yet — the UI diffs before/after and the user
// approves or discards. Kept dependency-free so buildPendingFiles is unit-testable.

export interface PendingFile {
  path: string;
  before: string; // current content ('' if the file is new)
  after: string;  // proposed content
  isNew: boolean;
}

export interface PendingEdit {
  changes: PendingFile[];
  deletions: string[];
  explanation: string;
  blocked: string[]; // files the guardrail refused (existing files the model couldn't see)
}

/** Pair each proposed change with the file's CURRENT content so the UI can render a real diff. */
export function buildPendingFiles(
  currentFiles: { path: string; content: string }[],
  changes: { path: string; content: string }[],
): PendingFile[] {
  const byPath = new Map(currentFiles.map((f) => [f.path, f.content]));
  return changes.map((c) => {
    const before = byPath.get(c.path);
    return {
      path: c.path,
      before: before ?? '',
      after: c.content,
      isNew: before === undefined,
    };
  });
}
