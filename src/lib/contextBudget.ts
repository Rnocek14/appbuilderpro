// src/lib/contextBudget.ts
// For large projects (especially imports), sending every file to the model on each
// edit wastes tokens and can overflow context. Instead: always send the full file
// tree, but full contents only for files likely relevant to the request.
//
// NOTE: supabase/functions/_shared/context.ts mirrors this for the edge functions —
// keep the two in sync if you change the heuristics.

export interface SlimFile { path: string; content: string }

const CHAR_BUDGET = 160_000; // ~40k tokens of file content
const ALWAYS_INCLUDE = [
  /^\/package\.json$/, /^\/App\.(js|tsx)$/, /^\/src\/App\.(jsx?|tsx)$/,
  /^\/src\/main\.(jsx?|tsx)$/, /^\/index\.html$/, /(routes|router)\.(jsx?|tsx)$/i,
  /^\/styles\.css$/, /^\/src\/index\.css$/,
];

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []);
}

/** Score a file's relevance to the change request. */
function score(file: SlimFile, words: Set<string>, errorText: string): number {
  let s = 0;
  const pathLower = file.path.toLowerCase();
  for (const w of words) {
    if (pathLower.includes(w)) s += 30;
  }
  if (errorText && errorText.includes(file.path)) s += 100;
  const contentLower = file.content.slice(0, 20_000).toLowerCase();
  for (const w of words) {
    if (contentLower.includes(w)) s += 5;
  }
  if (ALWAYS_INCLUDE.some((re) => re.test(file.path))) s += 50;
  if (pathLower.includes('test') || pathLower.endsWith('.md')) s -= 20;
  return s;
}

/**
 * Returns { tree, included } where tree lists every path and included carries
 * full contents for the most relevant files within the character budget.
 * Small projects come back untrimmed.
 */
export function selectContext(files: SlimFile[], message: string, previewError = ''):
  { tree: string[]; included: SlimFile[]; trimmed: boolean } {
  const tree = files.map((f) => f.path).sort();
  const total = files.reduce((n, f) => n + f.content.length, 0);
  if (total <= CHAR_BUDGET) return { tree, included: files, trimmed: false };

  const words = new Set([...tokenize(message), ...tokenize(previewError)]);
  const ranked = [...files].sort((a, b) => score(b, words, previewError) - score(a, words, previewError));

  const included: SlimFile[] = [];
  let used = 0;
  for (const f of ranked) {
    if (used + f.content.length > CHAR_BUDGET) continue;
    included.push(f);
    used += f.content.length;
  }
  return { tree, included, trimmed: true };
}

/**
 * Safe-edit guardrail: refuse writes/deletes to EXISTING files the model could NOT see in context
 * (trimmed out of a large project) — editing those from imagination silently destroys real code.
 * Creating brand-new files is always allowed. For small (untrimmed) projects every file is visible,
 * so nothing is ever blocked; this only bites on large real apps — exactly the risk case.
 */
export function applyEditGuardrail(
  appFiles: SlimFile[],
  message: string,
  previewError: string,
  changes: { path: string; content: string }[],
  deletions: string[],
): { safeChanges: { path: string; content: string }[]; safeDeletions: string[]; blocked: string[] } {
  const { included } = selectContext(appFiles, message, previewError);
  const visible = new Set(included.map((f) => f.path));
  const existing = new Set(appFiles.map((f) => f.path));
  const allow = (p: string) => visible.has(p) || !existing.has(p); // visible edit, or a new file
  const blocked: string[] = [];
  const safeChanges = changes.filter((c) => (allow(c.path) ? true : (blocked.push(c.path), false)));
  const safeDeletions = deletions.filter((p) => (allow(p) ? true : (blocked.includes(p) || blocked.push(p), false)));
  return { safeChanges, safeDeletions, blocked };
}

/** Serialize the selected context for the edit prompt. */
export function contextPayload(files: SlimFile[], message: string, previewError = ''): string {
  const { tree, included, trimmed } = selectContext(files, message, previewError);
  if (!trimmed) return JSON.stringify(included);
  return JSON.stringify({
    note: 'Large project: full file tree below, but contents provided only for likely-relevant files. ' +
      'Only modify files whose content you can see. If you need another file, say so in the explanation instead of guessing.',
    file_tree: tree,
    files: included,
  });
}
