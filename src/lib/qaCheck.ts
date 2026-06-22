// src/lib/qaCheck.ts
// Pure self-QA logic (no DB / no side effects) so it's unit-testable. Static checks over
// generated source: unresolved relative imports, Node built-ins (don't exist in the browser),
// disallowed packages, and a missing entry file.

export interface QAIssue {
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'util', 'child_process',
  'events', 'buffer', 'url', 'zlib', 'net', 'tls', 'dns', 'process', 'assert', 'querystring',
]);
const ALLOWED_TS = new Set([
  'react', 'react-dom', 'react-router-dom', 'lucide-react', 'recharts',
  '@supabase/supabase-js', 'date-fns', 'clsx',
]);
const ALLOWED_JS = new Set(['react']);

const CODE_RE = /\.(t|j)sx?$/;
const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css'];

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

function packageName(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

function resolves(importer: string, spec: string, fileSet: Set<string>): boolean {
  const dir = importer.slice(0, importer.lastIndexOf('/'));
  const base = spec.startsWith('/') ? normalize(spec) : normalize(`${dir}/${spec}`);
  for (const e of RESOLVE_EXTS) if (fileSet.has(base + e)) return true;
  for (const e of RESOLVE_EXTS.filter(Boolean)) if (fileSet.has(`${base}/index${e}`)) return true;
  return false;
}

/** Run the static checks. Pure — pass the project's app files (meta files already excluded). */
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

  // Dead-navigation check: a <Link>/<NavLink to>/navigate() pointing at a path with no matching
  // <Route> is a broken click (the "added a nav item that goes nowhere" bug). Conservative: only
  // runs when the app actually defines routes, exempts home/external/catch-all, and matches on the
  // first path segment so param routes (/post/:id) don't false-positive.
  issues.push(...deadLinkIssues(files));

  return issues;
}

const firstSeg = (p: string) => p.replace(/^\/+/, '').split('/')[0] ?? '';

function deadLinkIssues(files: { path: string; content: string }[]): QAIssue[] {
  const routes = new Set<string>();
  const links: { file: string; target: string }[] = [];
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    for (const m of f.content.matchAll(/<Route\b[^>]*\bpath=["']([^"']+)["']/g)) routes.add(m[1]);
    for (const m of f.content.matchAll(/\bpath:\s*["']([^"']+)["']/g)) routes.add(m[1]);
    for (const re of [/<Link\b[^>]*\bto=["']([^"']+)["']/g, /<NavLink\b[^>]*\bto=["']([^"']+)["']/g, /\bnavigate\(\s*["']([^"']+)["']/g]) {
      for (const m of f.content.matchAll(re)) links.push({ file: f.path, target: m[1] });
    }
  }
  if (routes.size === 0) return []; // app doesn't use routing — nothing to validate
  const routeSegs = new Set([...routes].map(firstSeg));
  const catchAll = [...routes].some((r) => r.includes('*'));
  if (catchAll) return [];

  const out: QAIssue[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    const t = l.target;
    if (/^(https?:|mailto:|tel:|\/\/|#)/i.test(t) || t.includes('://')) continue; // external / hash
    const lp = t.split('?')[0].split('#')[0];
    if (lp === '' || lp === '/' || lp === '.') continue; // home always exists
    if (routeSegs.has(firstSeg(lp))) continue;
    const key = `${l.file}|${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path: l.file, severity: 'error', message: `Link/navigate to '${t}' has no matching <Route> — the navigation is dead. Add the route + its page, or fix the link.` });
  }
  return out;
}

/** A compact message describing the issues, for handing to the assistant to fix. */
export function issuesToFixRequest(issues: QAIssue[]): string {
  const lines = issues.map((i) => `- [${i.severity}] ${i.path}: ${i.message}`);
  return `These static checks failed — find the root cause of each and fix it surgically:\n${lines.join('\n')}`;
}
