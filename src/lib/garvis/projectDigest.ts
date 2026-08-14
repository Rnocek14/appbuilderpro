// src/lib/garvis/projectDigest.ts
// THE PROJECT DIGEST — pure core (verified by projectDigest.verify.ts). The concierge knew the
// operator's apps by NAME and DESCRIPTION only; it had never seen a line of their code. Sending
// the code itself on every ask is the expensive mistake (~40k tokens a question). This is the
// cheap middle: a small, always-fresh picture of each project — file tree + the human's brain +
// a generated summary — that costs a few thousand tokens and answers what the operator actually
// asks ("what does the caregiver app do", "what's left on the stroke app").
//
// AUTO-REFRESH BY FINGERPRINT, NOT BY HOOK. The digest carries a fingerprint of the source files
// it was generated from. Every read recomputes the fingerprint from the live rows and compares:
// drift means stale, and stale means regenerate. Nothing has to remember to invalidate it, so it
// cannot be missed by a new write path — builder generation, agentic edits, imports, and manual
// saves are all caught by construction.
//
// Honesty spine: a stale-but-unrefreshable summary is LABELLED stale rather than presented as
// current, and the free layer (tree + brain, no AI, no cost) always stands on its own.

export interface DigestFile { path: string; content: string }

export interface ParsedDigest {
  fingerprint: string;
  summary: string;
}

/** Project metadata lives here — never part of the app's source, never fingerprinted. */
export const META_PREFIX = '/.fableforge/';
export const DIGEST_PATH = '/.fableforge/digest.md';

const SKIP = [/^\/node_modules\//, /^\/dist\//, /^\/build\//, /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/];
const BINARY = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|mp3|pdf|zip)$/i;

/** The files that define what the app IS — what a summary should describe and what staleness
 *  should track. Metadata, vendored code, lockfiles and binaries are all excluded. */
export function sourceFiles(files: DigestFile[]): DigestFile[] {
  return files.filter((f) =>
    f.path.startsWith('/')
    && !f.path.startsWith(META_PREFIX)
    && !SKIP.some((re) => re.test(f.path))
    && !BINARY.test(f.path));
}

const djb2 = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return h;
};
const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

/** A deterministic fingerprint of the project's source. Order-independent (row order from the DB
 *  is not stable), content-sensitive (a same-length edit still moves it), and cheap — plain
 *  string work, no network. */
export function fingerprintFiles(files: DigestFile[]): string {
  const src = sourceFiles(files);
  const parts = src
    .map((f) => `${f.path}:${f.content.length}:${hex(djb2(f.content))}`)
    .sort();
  return `${src.length}-${hex(djb2(parts.join('\n')))}`;
}

const FINGERPRINT_RE = /^<!--\s*digest\s+fingerprint:\s*([\w-]+)\s*-->/;

/** Serialize the digest for storage as a project file. The fingerprint rides in the file itself,
 *  so staleness needs no second table and no migration. */
export function formatDigest(fingerprint: string, summary: string): string {
  return `<!-- digest fingerprint: ${fingerprint} -->\n${summary.trim()}\n`;
}

/** Read a stored digest. Null when absent or unparseable — both mean "regenerate". */
export function parseDigest(raw: string | null | undefined): ParsedDigest | null {
  if (!raw) return null;
  const m = FINGERPRINT_RE.exec(raw.trim());
  if (!m) return null;
  const summary = raw.trim().slice(m[0].length).trim();
  return summary ? { fingerprint: m[1]!, summary } : null;
}

/** Stale = no digest, or the source moved since it was written. */
export function isDigestStale(stored: ParsedDigest | null, currentFingerprint: string): boolean {
  return !stored || stored.fingerprint !== currentFingerprint;
}

const TREE_LIMIT = 60;

/** A compact file tree — the free layer's backbone. Deterministic, capped, and honest about
 *  what it truncated. */
export function projectTree(files: DigestFile[], limit = TREE_LIMIT): string {
  const paths = sourceFiles(files).map((f) => f.path).sort();
  if (!paths.length) return '(no source files yet)';
  const shown = paths.slice(0, limit).join('\n');
  return paths.length > limit ? `${shown}\n…and ${paths.length - limit} more files` : shown;
}

const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n).trimEnd()}…`);

export interface ProjectContextInput {
  name: string;
  description?: string | null;
  /** The human-written brain (vision, goals, decisions) — never AI-generated. */
  brain?: string | null;
  /** The generated summary, when one exists. */
  summary?: string | null;
  /** True when `summary` predates the current source and could not be refreshed. */
  summaryStale?: boolean;
  files: DigestFile[];
}

/** Compose what the brain tier actually sees for one project. Small by construction: the tree is
 *  capped, the brain and summary are clipped, and a stale summary is labelled rather than passed
 *  off as current. Returns '' for a project with nothing to say. */
export function composeProjectContext(p: ProjectContextInput): string {
  const lines: string[] = [`PROJECT: ${p.name}`];
  const desc = p.description?.trim();
  if (desc) lines.push(desc);

  const src = sourceFiles(p.files);
  lines.push('', `FILES (${src.length}):`, projectTree(p.files));

  const brain = p.brain?.trim();
  // A brain that is still the untouched template says nothing — skip it rather than pad the
  // prompt with empty headings.
  if (brain && !/^##\s*North Star\s*\nThe one sentence/.test(brain)) {
    lines.push('', "THE OPERATOR'S NOTES (their own words):", clip(brain, 1500));
  }

  const summary = p.summary?.trim();
  if (summary) {
    lines.push('', p.summaryStale
      ? 'WHAT THE CODE DOES (summary is OUT OF DATE — files changed since it was written; describe it as "as of the last summary"):'
      : 'WHAT THE CODE DOES:', clip(summary, 2000));
  }
  return lines.join('\n');
}

/** The instruction for generating a summary: describe what EXISTS, never speculate. */
export const SUMMARY_SYSTEM =
  'You summarize a codebase for an assistant that answers its owner\'s questions about it. '
  + 'Write 4-8 short lines of plain prose: what the app is and does, its main screens or features, '
  + 'its stack, and anything notably incomplete (stubs, TODOs, empty handlers). '
  + 'Describe ONLY what the files actually show — never guess at intent, never describe features '
  + 'you cannot see in the code, and never pad. No headings, no bullet lists, no preamble.';

/** Build the summary request from the trimmed context the caller selected. */
export function summaryPrompt(name: string, tree: string, code: string): string {
  return `APP NAME: ${name}\n\nFILE TREE:\n${tree}\n\nSOURCE (most relevant files):\n${code}`;
}
