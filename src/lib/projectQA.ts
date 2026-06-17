// src/lib/projectQA.ts
// Deterministic self-QA: static checks over the generated source that catch the most common
// ways a generated app breaks — unresolved relative imports, Node built-ins (don't exist in the
// browser), disallowed packages, and a missing entry file. No model call, no guessing.

import { supabase } from './supabase';
import { isMetaFile } from './projectBrain';

export interface QAIssue {
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'util', 'child_process',
  'events', 'buffer', 'url', 'zlib', 'net', 'tls', 'dns', 'process', 'assert', 'querystring',
]);
// Allowed packages differ by runtime: the TS/Vite apps allow a kit; the lightweight JS sandbox
// (edge chat-edit) allows only react.
const ALLOWED_TS = new Set([
  'react', 'react-dom', 'react-router-dom', 'lucide-react', 'recharts',
  '@supabase/supabase-js', 'date-fns', 'clsx',
]);
const ALLOWED_JS = new Set(['react']);

const CODE_RE = /\.(t|j)sx?$/;
const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css'];

/** Extract every import/export-from specifier from a source file. */
function parseSpecifiers(content: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const s = m[1] ?? m[2];
    if (s) specs.push(s);
  }
  return specs;
}

/** The npm package name for a bare specifier ('@scope/x/y' -> '@scope/x', 'a/b' -> 'a'). */
function packageName(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

/** Normalize a POSIX-ish path, resolving '.' and '..'. */
function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

/** Does a relative/absolute import resolve to a file that exists in the project? */
function resolves(importer: string, spec: string, fileSet: Set<string>): boolean {
  const dir = importer.slice(0, importer.lastIndexOf('/'));
  const base = spec.startsWith('/') ? normalize(spec) : normalize(`${dir}/${spec}`);
  for (const e of RESOLVE_EXTS) if (fileSet.has(base + e)) return true;
  for (const e of RESOLVE_EXTS.filter(Boolean)) if (fileSet.has(`${base}/index${e}`)) return true;
  return false;
}

/** Run the static checks. Pure — pass the project's app files (exclude meta files). */
export function validateProject(files: { path: string; content: string }[]): QAIssue[] {
  const issues: QAIssue[] = [];
  const fileSet = new Set(files.map((f) => f.path));
  const isTs = [...fileSet].some((p) => p.endsWith('.tsx') || p.endsWith('.ts'));
  const allowed = isTs ? ALLOWED_TS : ALLOWED_JS;

  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    for (const spec of parseSpecifiers(f.content)) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        if (!resolves(f.path, spec, fileSet)) {
          issues.push({ path: f.path, severity: 'error', message: `Import does not resolve: '${spec}'` });
        }
      } else {
        const pkg = packageName(spec);
        if (NODE_BUILTINS.has(pkg)) {
          issues.push({ path: f.path, severity: 'error', message: `Imports Node built-in '${pkg}' — not available in the browser` });
        } else if (!allowed.has(pkg)) {
          issues.push({ path: f.path, severity: 'warning', message: `Imports '${pkg}', which isn't in the allowed package list` });
        }
      }
    }
  }

  const hasEntry = fileSet.has('/src/App.tsx') || fileSet.has('/App.js') || [...fileSet].some((p) => /\/App\.(t|j)sx?$/.test(p));
  if (!hasEntry) issues.push({ path: '/src/App.tsx', severity: 'error', message: 'No App entry file found' });

  return issues;
}

/** Fetch the project's current files and validate them. */
export async function runQA(projectId: string): Promise<QAIssue[]> {
  const { data: files } = await supabase
    .from('project_files').select('path, content')
    .eq('project_id', projectId).is('deleted_at', null);
  const appFiles = (files ?? []).filter((f) => !isMetaFile(f.path));
  return validateProject(appFiles);
}

/** A compact message describing the issues, for handing to the assistant to fix. */
export function issuesToFixRequest(issues: QAIssue[]): string {
  const lines = issues.map((i) => `- [${i.severity}] ${i.path}: ${i.message}`);
  return `These static checks failed — find the root cause of each and fix it surgically:\n${lines.join('\n')}`;
}
