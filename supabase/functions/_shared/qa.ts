// src/lib/qaCheck.ts
// Pure self-QA logic (no DB / no side effects) so it's unit-testable. Static checks over
// generated source: unresolved relative imports, Node built-ins (don't exist in the browser),
// disallowed packages, and a missing entry file.

import { generatedImportable } from './depRegistry.ts';

export interface QAIssue {
  path: string;
  severity: 'error' | 'warning';
  message: string;
}

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'stream', 'util', 'child_process',
  'events', 'buffer', 'url', 'zlib', 'net', 'tls', 'dns', 'process', 'assert', 'querystring',
]);
// Always-present packages plus the ones the build/edit prompts actively recommend (they load on
// demand from the CDN). Anything outside this set is a WARNING (not an error) — kept in sync with
// PLATFORM_CONSTRAINTS / GENERATE_CORE in prompts.ts so the generation QA gate doesn't flag the
// libraries we tell the model to use.
// Derived from the one dependency truth — a package joins the allowlist by joining the
// registry (scope 'generated'), never by being typed here.
const ALLOWED_TS = new Set(generatedImportable());
const ALLOWED_JS = new Set(['react']);

const CODE_RE = /\.(t|j)sx?$/;
const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css'];

function parseSpecifiers(content: string): string[] {
  const specs: string[] = [];
  // Static imports/exports, side-effect imports, AND dynamic import('…') — React.lazy routes
  // (lazy(() => import('./pages/X'))) are dynamic imports; missing them let apps ship with
  // App.tsx routing to pages that were never generated (blank app, Vite resolve error).
  const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const s = m[1] ?? m[2] ?? m[3];
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

/** Resolve a relative/absolute import to the actual project path it points at, or null. */
function resolvePath(importer: string, spec: string, fileSet: Set<string>): string | null {
  const dir = importer.slice(0, importer.lastIndexOf('/'));
  const base = spec.startsWith('/') ? normalize(spec) : normalize(`${dir}/${spec}`);
  for (const e of RESOLVE_EXTS) if (fileSet.has(base + e)) return base + e;
  for (const e of RESOLVE_EXTS.filter(Boolean)) if (fileSet.has(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}

function resolves(importer: string, spec: string, fileSet: Set<string>): boolean {
  return resolvePath(importer, spec, fileSet) !== null;
}

interface ModuleExports { names: Set<string>; hasDefault: boolean; hasWildcard: boolean }

/** What a module exports — parsed statically (regex, no AST). Conservative: a barrel `export * from`
 *  sets hasWildcard so importers of it are never flagged (we can't know its re-exported names). */
function extractExports(content: string): ModuleExports {
  const names = new Set<string>();
  let hasDefault = /\bexport\s+default\b/.test(content);
  let hasWildcard = false;
  for (const m of content.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim().replace(/^type\s+/, '');
      if (!seg) continue;
      const as = /\bas\s+([A-Za-z0-9_$]+)/.exec(seg);
      const name = as ? as[1] : seg.split(/\s+/)[0];
      if (name === 'default') hasDefault = true; else if (name && name !== '*') names.add(name);
    }
  }
  for (const m of content.matchAll(/\bexport\s*\*\s*(?:as\s+([A-Za-z0-9_$]+)\s+)?from\b/g)) {
    if (m[1]) names.add(m[1]); else hasWildcard = true;
  }
  return { names, hasDefault, hasWildcard };
}

interface ImportBinding { spec: string; names: string[]; wantsDefault: boolean; namespace: boolean }

/** Parse `import <clause> from '<spec>'` statements into their bound names. */
function parseImports(content: string): ImportBinding[] {
  const out: ImportBinding[] = [];
  for (const m of content.matchAll(/\bimport\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const spec = m[2];
    if (/\*\s+as\s+/.test(clause)) { out.push({ spec, names: [], wantsDefault: false, namespace: true }); continue; }
    const braced = /\{([\s\S]*?)\}/.exec(clause);
    const names: string[] = [];
    let defaultViaBrace = false;
    if (braced) {
      for (const part of braced[1].split(',')) {
        const seg = part.trim().replace(/^type\s+/, '');
        if (!seg) continue;
        const left = seg.split(/\s+as\s+/)[0].split(/\s+/)[0];
        if (left === 'default') defaultViaBrace = true; // `import { default as X }` needs a DEFAULT export, not a named one
        else if (left) names.push(left);
      }
    }
    // a leading identifier before the brace (or the whole clause if no brace) is a default import
    const beforeBrace = clause.split('{')[0].replace(/^type\s+/, '').replace(/,\s*$/, '').trim();
    const wantsDefault = defaultViaBrace || (!!beforeBrace && /^[A-Za-z0-9_$]+$/.test(beforeBrace));
    out.push({ spec, names, wantsDefault, namespace: false });
  }
  return out;
}

/** Flag named/default imports that the TARGET module doesn't actually export — a very common,
 *  app-breaking AI mistake the regex-resolve check alone misses. Only runs for imports that resolve
 *  to a known code file, and skips barrels (export *) to avoid false positives. */
function missingExportIssues(files: { path: string; content: string }[], fileSet: Set<string>): QAIssue[] {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const cache = new Map<string, ModuleExports>();
  const exportsOf = (path: string): ModuleExports => {
    let e = cache.get(path);
    if (!e) { e = extractExports(byPath.get(path) ?? ''); cache.set(path, e); }
    return e;
  };
  const issues: QAIssue[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    for (const imp of parseImports(f.content)) {
      if (!(imp.spec.startsWith('.') || imp.spec.startsWith('/'))) continue; // packages handled elsewhere
      if (imp.namespace) continue;
      const target = resolvePath(f.path, imp.spec, fileSet);
      if (!target || !CODE_RE.test(target)) continue; // unresolved (reported elsewhere) or non-code (css)
      const ex = exportsOf(target);
      if (ex.hasWildcard) continue; // barrel re-export — can't know its names
      const flag = (msg: string) => { const k = `${f.path}|${msg}`; if (!seen.has(k)) { seen.add(k); issues.push({ path: f.path, severity: 'error', message: msg }); } };
      if (imp.wantsDefault && !ex.hasDefault) flag(`'${imp.spec}' has no default export — fix the import or add the export.`);
      for (const n of imp.names) if (!ex.names.has(n)) flag(`'${imp.spec}' does not export '${n}' — fix the import name or add the export.`);
    }
  }
  return issues;
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
        } else if (!allowed.has(pkg) && !pkg.startsWith('@radix-ui/')) {
          issues.push({ path: f.path, severity: 'warning', message: `Imports '${pkg}', which isn't in the allowed package list` });
        }
      }
    }
  }

  // Cross-file export resolution: a named/default import the target module doesn't export.
  issues.push(...missingExportIssues(files, fileSet));

  const hasEntry = fileSet.has('/src/App.tsx') || fileSet.has('/App.js') || [...fileSet].some((p) => /\/App\.(t|j)sx?$/.test(p));
  if (!hasEntry) issues.push({ path: '/src/App.tsx', severity: 'error', message: 'No App entry file found' });

  // Dead-navigation check: a <Link>/<NavLink to>/navigate() pointing at a path with no matching
  // <Route> is a broken click (the "added a nav item that goes nowhere" bug). Conservative: only
  // runs when the app actually defines routes, exempts home/external/catch-all, and matches on the
  // first path segment so param routes (/post/:id) don't false-positive.
  issues.push(...deadLinkIssues(files));

  // In-page anchors break HashRouter apps: <a href="#id"> changes the ROUTE, not the scroll
  // position — the user lands on a nonexistent route (blank screen).
  issues.push(...anchorIssues(files));

  // A routed app with no catch-all renders a BLANK screen for any unknown URL.
  issues.push(...catchAllIssues(files));

  // Truncated/malformed source: a stream cut mid-file leaves unbalanced braces and cryptic
  // downstream errors ("no corresponding closing tag") — flag the file itself for a full rewrite.
  issues.push(...truncationIssues(files));

  // RLS lint: a public table created without row level security is readable/writable by anyone
  // holding the anon key — the most common security hole in generated Supabase apps.
  issues.push(...rlsIssues(files));

  // Interaction integrity: the checks above prove the app COMPILES and NAVIGATES. These prove its
  // controls actually do something when a person uses them. See interactionIssues() for why this
  // layer exists and what it deliberately cannot replace.
  issues.push(...interactionIssues(files));

  return issues;
}

/* ============================================================================================
 * INTERACTION INTEGRITY
 *
 * Everything else in this file answers "will it build?". This section answers "will it respond?".
 *
 * The gap it closes: a generated app can pass every static check — imports resolve, routes exist,
 * nothing is truncated — and still ship a button that does nothing, a handler that throws the
 * instant it is clicked, or a control no keyboard can reach. Those are invisible to a compiler and
 * obvious to a person in about four seconds.
 *
 * HONEST LIMIT, stated where it cannot be missed: this is the STATIC half of behavioural QA. It
 * reads source; it never runs the app. It cannot tell you that a flow makes sense, that state
 * updates land, that an async path renders its error branch, or that the thing feels right. The
 * browser tier is a separate harness (see scripts/prototype-walkthrough.mjs for the pattern that
 * drives a real page and holds it to the promises it makes on screen). Do not read a clean
 * interaction lint as "the app works".
 *
 * Every check here is deliberately CONSERVATIVE, because these issues feed the generator's
 * self-heal loop: a false positive makes the model rewrite working code. Where a pattern is
 * ambiguous (a spread that might supply the handler, a name that might come from anywhere) the
 * check stays silent.
 * ========================================================================================== */

/** Identifiers a handler may reference with no local declaration. */
const HANDLER_GLOBALS = new Set([
  'alert', 'confirm', 'prompt', 'print', 'close', 'open', 'fetch', 'console', 'window', 'document',
  'history', 'location', 'navigator', 'localStorage', 'sessionStorage', 'requestAnimationFrame',
]);

/** Elements that are not focusable or clickable for a keyboard user without help. */
const NON_INTERACTIVE = ['div', 'span', 'li', 'td', 'tr', 'section', 'article', 'header', 'footer', 'img', 'p'];

/**
 * The attribute text of every opening `<tag ...>`, brace- and quote-aware so an arrow function in a
 * prop (`onClick={() => a > b}`) does not truncate the match at its `>`.
 */
function openingTags(content: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const start = m.index + m[0].length;
    let i = start, depth = 0, quote = '';
    while (i < content.length) {
      const c = content[i];
      if (quote) { if (c === quote && content[i - 1] !== '\\') quote = ''; }
      else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      i++;
    }
    out.push(content.slice(start, i));
  }
  return out;
}

/**
 * Comments are prose, not code, and scanning them produces both false positives and false
 * negatives. Both showed up on the first real run against generated apps: a comment reading
 * "the clickable element is a real <button>" was reported as a dead button, and a comment
 * documenting `onClick={handleShare}` made the undefined-handler check believe the name was
 * defined (it counts occurrences, and the comment was the second one). Strings are blanked first
 * so a `//` inside a URL or a quoted snippet cannot swallow the rest of a line.
 */
function stripComments(src: string): string {
  const blanked = src.replace(
    /(`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g,
    (m) => m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[0],
  );
  let out = '';
  for (let i = 0; i < src.length; i++) {
    if (blanked[i] === '/' && blanked[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } out += '\n'; }
    else if (blanked[i] === '/' && blanked[i + 1] === '*') { while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i++; }
    else if (blanked[i] === '{' && blanked[i + 1] === '/' && blanked[i + 2] === '*') { // {/* JSX comment */}
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/' && src[i + 2] === '}')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '   '; i += 2;
    } else out += src[i];
  }
  return out;
}

/**
 * Blank the CONTENTS of every template literal, keeping length and newlines. Used only by the
 * tag-shape rules: html assembled in a backtick string is injected markup whose handlers are wired
 * by delegation, so judging it as JSX produces confident, wrong findings.
 */
function maskTemplateLiterals(src: string): string {
  let out = '', i = 0;
  while (i < src.length) {
    if (src[i] === '`') {
      out += '`'; i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      if (i < src.length) { out += '`'; i++; }
    } else { out += src[i]; i++; }
  }
  return out;
}

function interactionIssues(fileList: { path: string; content: string }[]): QAIssue[] {
  const files = fileList.map((f) => ({ path: f.path, content: stripComments(f.content) }));
  const out: QAIssue[] = [];
  const seen = new Set<string>();
  const flag = (path: string, severity: QAIssue['severity'], message: string) => {
    const k = `${path}|${message}`;
    if (seen.has(k)) return;              // one voice per file per problem, not one per occurrence
    seen.add(k);
    out.push({ path, severity, message });
  };

  for (const f of files) {
    if (!/\.(t|j)sx$/.test(f.path)) continue;          // JSX only — plain modules have no controls

    // Markup built inside a template literal is INJECTED html, not JSX: its handlers are attached
    // by delegation somewhere else, and the JSX rules cannot see that. Masking those regions stops
    // a real, correctly-wired control being reported as dead — which is what happened to the code
    // block's Copy button, whose listener is a `closest('.ff-code-copy')` delegate.
    // Only the tag-shape rules use the masked copy; the identifier count in rule 2 does not, so a
    // handler genuinely referenced inside a template string still counts as defined.
    const masked = maskTemplateLiterals(f.content);

    // 1. A button that cannot do anything. The single most common "looks finished, isn't" defect.
    for (const attrs of openingTags(masked, 'button')) {
      if (/\{\s*\.\.\./.test(attrs)) continue;                       // a spread may carry the handler
      if (/\bon[A-Z]\w*\s*=/.test(attrs)) continue;                  // any handler at all is enough
      if (/\btype\s*=\s*["']submit["']/.test(attrs)) continue;       // submits via its form
      if (/\bform\s*=/.test(attrs)) continue;
      if (/\bdisabled(\s|=|$)/.test(attrs)) continue;                // deliberately inert
      flag(f.path, 'error',
        'A <button> has no event handler and is not type="submit" — it renders but does nothing when clicked. Wire it to a handler, make it type="submit" inside its form, or remove it.');
    }

    // 2. A handler bound to a name this file never defines — a ReferenceError on first click.
    //    Heuristic chosen for near-zero false positives: if the identifier is DECLARED, IMPORTED,
    //    DESTRUCTURED or a parameter anywhere in the file it necessarily appears more than once.
    for (const m of f.content.matchAll(/\bon[A-Z]\w*\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
      const name = m[1];
      if (HANDLER_GLOBALS.has(name)) continue;
      const uses = f.content.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g'))?.length ?? 0;
      if (uses > 1) continue;
      flag(f.path, 'error',
        `A handler is bound to '${name}', which is never defined, imported or destructured in this file — clicking it throws a ReferenceError. Define '${name}' or point the handler at the real function.`);
    }

    // 3. A click handler on an element no keyboard can reach — a div ACTING AS A BUTTON.
    //
    //    Narrowed after pointing this at 172 real .tsx files and getting 12 findings, all 12 of
    //    them wrong. Real UI code is full of click handlers that are not controls at all:
    //    full-surface modal backdrops, click-away dismissers, and stopPropagation guards on the
    //    panel inside a backdrop. None of those is something a keyboard user needs to "reach" —
    //    Escape closes them — so flagging them was pure noise, and noise in a self-heal loop makes
    //    a generator rewrite working code. What remains is the case actually worth catching: an
    //    element with an onClick that DOES something, dressed as a control.
    for (const tag of NON_INTERACTIVE) {
      for (const attrs of openingTags(masked, tag)) {
        const onClick = attrs.match(/\bonClick\s*=\s*\{([\s\S]*?)\}\s*(?=\s[a-zA-Z-]+=|$)/);
        if (!onClick) continue;
        if (/\{\s*\.\.\./.test(attrs)) continue;
        if (/\brole\s*=/.test(attrs) && /\btabIndex\s*=/.test(attrs)) continue;
        const body = onClick[1];
        // a full-surface overlay is a backdrop, not a control
        if (/\b(fixed|absolute)\b[^"']*\binset-0\b|backdrop|overlay|scrim/.test(attrs)) continue;
        // a propagation guard is not an action
        if (/^\s*\(?\s*e\s*\)?\s*=>\s*e\.stopPropagation\(\)\s*$/.test(body)) continue;
        // a pure dismiss — closing what is already open — is reachable by Escape, not by Tab
        if (/^\s*\(?\s*\)?\s*=>\s*(set\w+\((null|false)\)|on?Close\(\)|close\(\)|dismiss\(\))\s*$/.test(body)) continue;
        // a prop passed straight through: the decision belongs to the caller, not here
        if (/^\s*on[A-Z]\w*\s*$/.test(body)) continue;
        flag(f.path, 'warning',
          `<${tag}> has onClick but no role + tabIndex — it works with a mouse and is unreachable by keyboard. Use a <button>, or add role="button" tabIndex={0} and a key handler.`);
      }
    }

    // 4. A form with no submit path: pressing Enter in a field reloads the page and loses the input.
    for (const attrs of openingTags(masked, 'form')) {
      if (/\{\s*\.\.\./.test(attrs)) continue;
      if (/\bonSubmit\s*=/.test(attrs)) continue;
      if (/\baction\s*=/.test(attrs)) continue;
      flag(f.path, 'warning',
        '<form> has no onSubmit — pressing Enter in a field reloads the page and discards what was typed. Add onSubmit={e => { e.preventDefault(); ... }}.');
    }
  }
  return out;
}

/** Unbalanced-brace count (strings/comments stripped first). Positive = unclosed '{'. */
function braceDelta(content: string): number {
  const src = content
    .replace(/`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  let d = 0;
  for (const ch of src) { if (ch === '{') d++; else if (ch === '}') d--; }
  return d;
}

/** Whether a source file looks cut off mid-stream (|brace delta| >= 2 to avoid noise). Used by the
 *  edit/generate streams to DROP a max_tokens-truncated tail file instead of persisting half a file. */
export function looksTruncated(content: string): boolean {
  return Math.abs(braceDelta(content)) >= 2;
}

/** Unbalanced-brace detector (strings/comments stripped first; |delta| >= 2 to avoid noise). */
function truncationIssues(files: { path: string; content: string }[]): QAIssue[] {
  const out: QAIssue[] = [];
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    const d = braceDelta(f.content);
    if (Math.abs(d) >= 2) {
      out.push({
        path: f.path, severity: 'error',
        message: `File appears truncated or malformed (${d > 0 ? `${d} unclosed` : `${Math.abs(d)} extra`} '{' braces) — read it and rewrite the COMPLETE file.`,
      });
    }
  }
  return out;
}

/** <a href="#section"> in a HashRouter app navigates to route "#section" (blank screen). #/route links are fine. */
function anchorIssues(files: { path: string; content: string }[]): QAIssue[] {
  const out: QAIssue[] = [];
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    for (const m of f.content.matchAll(/<a\b[^>]*\bhref=["']#(?!\/)([^"']+)["']/g)) {
      out.push({
        path: f.path, severity: 'error',
        message: `In-page anchor href="#${m[1]}" breaks HashRouter routing — it navigates to a nonexistent route (blank screen) instead of scrolling. Use onClick={() => document.getElementById('${m[1]}')?.scrollIntoView({ behavior: 'smooth' })} instead.`,
      });
    }
  }
  return out;
}

/** A routed app should have a catch-all <Route path="*"> so unknown URLs show a 404, not a blank screen. */
function catchAllIssues(files: { path: string; content: string }[]): QAIssue[] {
  let routesFile: string | null = null;
  let hasRoutes = false;
  let hasCatchAll = false;
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    if (/<Route\b[^>]*\bpath=/.test(f.content)) { hasRoutes = true; routesFile = routesFile ?? f.path; }
    if (/<Route\b[^>]*\bpath=["'][^"']*\*["']/.test(f.content)) hasCatchAll = true;
  }
  if (!hasRoutes || hasCatchAll || !routesFile) return [];
  return [{
    path: routesFile, severity: 'warning',
    message: 'No catch-all route — an unknown URL renders a blank screen. Add <Route path="*" element={<NotFound />} /> with a designed 404 page linking home.',
  }];
}

/**
 * RLS lint for generated migrations: every table created in /supabase/migrations/*.sql must have
 * `alter table <t> enable row level security`, and (once enabled) at least one `create policy`.
 * Missing RLS = error (open to the world via the anon key); RLS with no policy = warning (locked
 * to service-role only — sometimes intentional, e.g. automation internals).
 */
function rlsIssues(files: { path: string; content: string }[]): QAIssue[] {
  const out: QAIssue[] = [];
  for (const f of files) {
    if (!/^\/supabase\/migrations\/.+\.sql$/i.test(f.path)) continue;
    const sql = f.content
      .replace(/--[^\n]*/g, '')          // strip line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')  // strip block comments
      .toLowerCase();
    const created = new Set<string>();
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?/g)) {
      const schema = m[1] ?? 'public';
      if (schema === 'public') created.add(m[2]);
    }
    if (created.size === 0) continue;
    const rlsEnabled = new Set<string>();
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?\s+enable\s+row\s+level\s+security/g)) {
      rlsEnabled.add(m[2]);
    }
    const hasPolicy = new Set<string>();
    for (const m of sql.matchAll(/create\s+policy\s+(?:"[^"]*"|[a-z0-9_]+)\s+on\s+(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?/g)) {
      hasPolicy.add(m[2]);
    }
    for (const t of created) {
      if (!rlsEnabled.has(t)) {
        out.push({ path: f.path, severity: 'error', message: `Table '${t}' is created without ROW LEVEL SECURITY — anyone with the anon key can read/write it. Add \`alter table ${t} enable row level security;\` plus the appropriate policies.` });
      } else if (!hasPolicy.has(t)) {
        out.push({ path: f.path, severity: 'warning', message: `Table '${t}' has RLS enabled but no CREATE POLICY — app users can't read/write it (service-role only). Intentional for internal tables; otherwise add policies.` });
      }
    }
  }
  return out;
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

export interface MissingModule {
  /** The project path the file should be created at (extension inferred). */
  path: string;
  /** Who imports it and the exact import lines — tells a generator what the file must export. */
  importers: { path: string; lines: string[] }[];
}

/**
 * Local imports that point at files which DON'T EXIST — the worst generated-app failure (the model
 * rewrote App.tsx to route to pages it never emitted; Vite dies on the first one). Returned as
 * concrete target paths so a repair pass can create each file directly with a dedicated call,
 * instead of asking one bounded fix stream to write N whole pages (which is what fails to converge).
 * Pure. Extension inference: an explicit extension is kept; otherwise .tsx for TS projects (a
 * superset that also holds plain code), .js for legacy JS-runtime projects.
 */
export function missingLocalModules(files: { path: string; content: string }[]): MissingModule[] {
  const fileSet = new Set(files.map((f) => f.path));
  const isTs = [...fileSet].some((p) => p.endsWith('.tsx') || p.endsWith('.ts'));
  const byTarget = new Map<string, MissingModule>();
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    for (const spec of parseSpecifiers(f.content)) {
      if (!(spec.startsWith('.') || spec.startsWith('/'))) continue;
      if (resolves(f.path, spec, fileSet)) continue;
      const dir = f.path.slice(0, f.path.lastIndexOf('/'));
      const base = spec.startsWith('/') ? normalize(spec) : normalize(`${dir}/${spec}`);
      const target = /\.[a-z]+$/i.test(base) ? base : base + (isTs ? '.tsx' : '.js');
      let m = byTarget.get(target);
      if (!m) { m = { path: target, importers: [] }; byTarget.set(target, m); }
      let imp = m.importers.find((i) => i.path === f.path);
      if (!imp) { imp = { path: f.path, lines: [] }; m.importers.push(imp); }
      for (const line of f.content.split('\n')) {
        if (line.includes(`'${spec}'`) || line.includes(`"${spec}"`)) {
          const t = line.trim();
          if (t && !imp.lines.includes(t)) imp.lines.push(t);
        }
      }
    }
  }
  return [...byTarget.values()];
}

/** A compact message describing the issues, for handing to the assistant to fix. */
export function issuesToFixRequest(issues: QAIssue[]): string {
  const lines = issues.map((i) => `- [${i.severity}] ${i.path}: ${i.message}`);
  return `These static checks failed — find the root cause of each and fix it surgically:\n${lines.join('\n')}`;
}
