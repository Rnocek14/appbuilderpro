// src/lib/importer.ts
// Import existing projects (e.g. from Lovable) via GitHub repo or zip upload.
// Lovable projects sync to GitHub, so a repo URL is the most common path.

import JSZip from 'jszip';
import { supabase } from './supabase';

export interface ImportedFile { path: string; content: string }
export interface ImportAnalysis {
  name: string;
  files: ImportedFile[];
  skipped: { path: string; reason: string }[];
  isVite: boolean;
  hasSupabase: boolean;
}

const SKIP_DIRS = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.vercel/', 'coverage/', '.idea/', '.vscode/'];
const SKIP_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', '.DS_Store'];
const TEXT_EXTS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'css', 'scss', 'html', 'md', 'mdx', 'txt',
  'svg', 'sql', 'toml', 'yml', 'yaml', 'env', 'gitignore', 'eslintrc', 'prettierrc', 'config',
];
const MAX_FILE_BYTES = 300_000; // skip giant files (likely assets/data dumps)
const MAX_FILES = 500;

function isTextPath(path: string): boolean {
  const base = path.split('/').pop() ?? '';
  if (base.startsWith('.')) return true; // dotfiles (.env.example, .gitignore...)
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
  return TEXT_EXTS.includes(ext);
}

function shouldSkip(path: string): string | null {
  if (SKIP_DIRS.some((d) => path.includes(d))) return 'dependency/build directory';
  const base = path.split('/').pop() ?? '';
  if (SKIP_FILES.includes(base)) return 'lockfile/system file';
  if (!isTextPath(path)) return 'binary asset (re-add via Storage if needed)';
  return null;
}

/** Parse a GitHub URL or "owner/repo" shorthand into parts. */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | null {
  const trimmed = input.trim().replace(/\.git$/, '');
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (short) return { owner: short[1], repo: short[2] };
  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith('github.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo, kind, ref] = parts;
    return { owner, repo, ref: kind === 'tree' && ref ? parts.slice(3).join('/') : undefined };
  } catch {
    return null;
  }
}

/** Download a repo as a zip via the GitHub API. Token needed for private repos. */
export async function fetchGitHubZip(owner: string, repo: string, ref?: string, token?: string): Promise<ArrayBuffer> {
  const url = `https://api.github.com/repos/${owner}/${repo}/zipball/${ref ?? ''}`;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) throw new Error('Repo not found. Private repos need a personal access token.');
  if (res.status === 401 || res.status === 403) throw new Error('Not authorized — check your access token.');
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return res.arrayBuffer();
}

/** Extract + filter project files from a zip (GitHub zipball or Lovable/manual export). */
export async function analyzeZip(data: ArrayBuffer | Blob, fallbackName: string): Promise<ImportAnalysis> {
  const zip = await JSZip.loadAsync(data);
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);

  // GitHub zipballs wrap everything in "owner-repo-sha/" — strip a common root folder.
  const roots = new Set(paths.map((p) => p.split('/')[0]));
  const root = roots.size === 1 && paths.every((p) => p.includes('/')) ? `${[...roots][0]}/` : '';

  const files: ImportedFile[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const raw of paths) {
    const path = '/' + raw.slice(root.length);
    const reason = shouldSkip(path);
    if (reason) { skipped.push({ path, reason }); continue; }
    const entry = zip.files[raw];
    const content = await entry.async('string');
    if (content.length > MAX_FILE_BYTES) { skipped.push({ path, reason: 'file too large' }); continue; }
    if (files.length >= MAX_FILES) { skipped.push({ path, reason: 'file limit reached' }); continue; }
    files.push({ path, content });
  }

  let name = fallbackName;
  const pkg = files.find((f) => f.path === '/package.json');
  if (pkg) {
    try { name = JSON.parse(pkg.content).name || name; } catch { /* keep fallback */ }
  }

  const allContent = files.map((f) => f.path).join('\n');
  return {
    name,
    files,
    skipped,
    isVite: files.some((f) => /\/vite\.config\.(ts|js|mjs)$/.test(f.path)),
    hasSupabase: files.some((f) => f.content.includes('@supabase/supabase-js')) || allContent.includes('/supabase/'),
  };
}

/** Create the project + bulk insert files (chunked to stay under request limits). */
export async function persistImport(
  userId: string,
  name: string,
  description: string,
  files: ImportedFile[],
  source: string,
): Promise<string> {
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ owner_id: userId, name, description, status: 'ready', template_slug: 'imported' })
    .select()
    .single();
  if (error || !project) throw new Error(error?.message ?? 'Could not create project');

  const CHUNK = 50;
  for (let i = 0; i < files.length; i += CHUNK) {
    const rows = files.slice(i, i + CHUNK).map((f) => ({
      project_id: project.id, path: f.path, content: f.content,
    }));
    const { error: fileErr } = await supabase.from('project_files').insert(rows);
    if (fileErr) throw new Error(`Failed at file batch ${i / CHUNK + 1}: ${fileErr.message}`);
  }

  await supabase.from('ai_messages').insert({
    project_id: project.id,
    user_id: userId,
    role: 'assistant',
    content: `Imported ${files.length} files from ${source}. Tell me what you'd like to change — I'll modify only the relevant files.`,
  });
  await supabase.from('audit_logs').insert({
    actor_id: userId, action: 'project.import', entity_type: 'project', entity_id: project.id,
    metadata: { source, file_count: files.length },
  });
  return project.id as string;
}
