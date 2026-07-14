// src/lib/garvis/repoGenesis.ts
// SPIN UP A WORLD FROM A REPO — pure (verified by repoGenesis.verify.ts).
//
// Genesis takes an INTENT and synthesizes a world (genesis.ts). This module turns a code repo into
// that intent: it reads the real signal a repo carries — the <title> / <meta description> of
// index.html, the package.json name + description, the README's first substantive paragraph
// (SKIPPING Lovable / CRA / Vite scaffolding boilerplate, which is not product signal), the doc and
// page filenames — and distills a grounded product brief. It never invents: whatever the repo does
// not state (audience, pricing, revenue) is left unsaid so Genesis asks about it instead of guessing.
// This is extraction only; the two-stage DNA → Work Web synthesis is unchanged.

export interface RepoFile { path: string; text: string }

export interface RepoRef { owner: string; repo: string }

export interface RepoSignal {
  name: string | null;       // best product name (package.json name / <title> lead / repo name)
  title: string | null;      // the raw <title> if present ("NeuroRecover - AI-Powered ...")
  tagline: string | null;    // one-liner: meta description → og:description → package.json description
  readmeLead: string | null; // first real README paragraph, boilerplate stripped (null when all boilerplate)
  stack: string[];           // detected frameworks/libraries, human-readable
  docTopics: string[];       // doc/*.md filenames → domain hints
  surfaces: string[];        // src/pages names → product surfaces
}

// README scaffolding that carries ZERO product meaning — recognize and skip it so a template README
// (Lovable / Create React App / Vite) never becomes the product's description.
const BOILERPLATE_RE = [
  /welcome to your lovable project/i,
  /\blovable\b/i,                       // any mention of the scaffold tool is boilerplate, not product
  /this project was bootstrapped with \[?create react app/i,
  /getting started with create react app/i,
  /^#?\s*(react|vite|vue|next\.js)\s*\+?\s*(typescript)?\s*(template|starter)?\s*$/i,
  /npm run dev/i, /npm start/i, /npm i\b/i, /available scripts/i,
  /simply visit|start prompting/i,
  /preferred ide|clone (the|this) repo|install the necessary dependencies|navigate to the/i,
  /github codespaces?|edit a file directly in github/i,
  /^[-*]\s*(vite|react|typescript|javascript|vue|svelte|angular|next\.?js|nuxt|tailwind(\s*css)?|shadcn(-ui)?|node(\.?js)?|npm|bun|pnpm|yarn)\s*$/i,  // a bare tech-stack bullet is scaffolding
];

function looksLikeBoilerplate(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  return BOILERPLATE_RE.some((re) => re.test(l));
}

function findFile(files: RepoFile[], match: (path: string) => boolean): RepoFile | null {
  return files.find((f) => match(f.path.toLowerCase())) ?? null;
}

// Package names that scaffolds leave behind — not a real product name. e.g. "vite_react_shadcn_ts",
// "my-app", "react-app", "vite-project", "frontend".
function looksLikeScaffoldName(name: string): boolean {
  const n = name.toLowerCase();
  if (/(^|[-_])(vite|react|next|vue|svelte|shadcn|nuxt|expo)([-_]|$)/.test(n) && !/\s/.test(n)) return true;
  return /_ts$|template|starter|boilerplate|scaffold|^(my[-_])?app$|^project$|^frontend$|^client$|^web$|^example$/.test(n);
}

/** package.json → name, description, and a flat list of dependency ids. Tolerant of bad JSON. */
export function parsePkgJson(text: string): { name: string | null; description: string | null; deps: string[] } {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const deps = [
      ...Object.keys((j.dependencies as Record<string, unknown>) ?? {}),
      ...Object.keys((j.devDependencies as Record<string, unknown>) ?? {}),
    ];
    const name = typeof j.name === 'string' ? j.name.trim() : null;
    const description = typeof j.description === 'string' && j.description.trim() ? j.description.trim() : null;
    return { name: name || null, description, deps };
  } catch {
    return { name: null, description: null, deps: [] };
  }
}

/** index.html → <title> and the best available description (meta description, then og:description). */
export function parseHtmlMeta(text: string): { title: string | null; description: string | null } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.trim() || null;
  const metaDesc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(text)?.[1]?.trim();
  const ogDesc = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(text)?.[1]?.trim();
  return { title: title, description: (metaDesc || ogDesc || null) };
}

/** The README's first substantive paragraph, with template scaffolding removed. Null if it's all
 *  boilerplate (a Lovable/CRA README that says nothing about the actual product). */
export function readmeLead(text: string): string | null {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paras) {
    const lines = p.split('\n').map((l) => l.replace(/^#+\s*/, '').trim());
    if (lines.every(looksLikeBoilerplate)) continue;               // whole block is scaffolding
    const clean = lines.filter((l) => l && !looksLikeBoilerplate(l)).join(' ').trim();
    // Skip a bare title heading and generic section headers.
    if (clean.length < 24) continue;
    if (/^(project info|how can i|what technologies|table of contents)/i.test(clean)) continue;
    return clean.slice(0, 600);
  }
  return null;
}

// Dependency id → human framework label. Only the ones worth telling Genesis about (they shape
// "this is a web app / SaaS", not the whole lockfile).
const STACK_LABELS: [RegExp, string][] = [
  [/^react$/, 'React'], [/^next$/, 'Next.js'], [/^vue$/, 'Vue'], [/^svelte/, 'Svelte'],
  [/^vite$/, 'Vite'], [/^@supabase\/supabase-js$/, 'Supabase'], [/^tailwindcss$/, 'Tailwind'],
  [/^@radix-ui\//, 'shadcn/Radix UI'], [/^stripe$/, 'Stripe'], [/^@stripe\//, 'Stripe'],
  [/^expo$/, 'Expo / React Native'], [/^react-native$/, 'React Native'],
  [/^three$/, 'Three.js'], [/^openai$/, 'OpenAI'], [/^@anthropic-ai\//, 'Anthropic'],
];

export function detectStack(deps: string[]): string[] {
  const out: string[] = [];
  for (const [re, label] of STACK_LABELS) {
    if (deps.some((d) => re.test(d)) && !out.includes(label)) out.push(label);
  }
  return out;
}

const IGNORED_DOCS = /^(readme|license|contributing|code_of_conduct|changelog|security|ci)$/i;

/** Doc filenames (docs/*.md) as domain hints — "clinical-evidence" tells you more than any README. */
function docTopicsFrom(files: RepoFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const m = /(?:^|\/)docs\/([^/]+)\.mdx?$/i.exec(f.path);
    if (!m) continue;
    const topic = m[1].replace(/[-_]/g, ' ').replace(/\bv?\d+ ?spec\b/i, '').replace(/\s+/g, ' ').trim();
    if (topic && !IGNORED_DOCS.test(m[1]) && !out.includes(topic)) out.push(topic);
    if (out.length >= 10) break;
  }
  return out;
}

/** Page component names (src/pages/*) as product surfaces. */
function surfacesFrom(files: RepoFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const m = /(?:^|\/)src\/pages\/([A-Za-z0-9]+)\.(?:tsx|jsx)$/.exec(f.path);
    if (!m) continue;
    const name = m[1].replace(/([a-z])([A-Z])/g, '$1 $2');   // "NotFound" → "Not Found"
    if (!/^(index|not ?found|app)$/i.test(m[1]) && !out.includes(name)) out.push(name);
    if (out.length >= 12) break;
  }
  return out;
}

/** Distill fetched repo files into the structured signal. Extraction only — never invents. */
export function distillRepo(files: RepoFile[], ref: RepoRef): RepoSignal {
  const pkg = findFile(files, (p) => /(^|\/)package\.json$/.test(p));
  const html = findFile(files, (p) => /(^|\/)index\.html$/.test(p));
  const readme = findFile(files, (p) => /(^|\/)readme\.md$/.test(p));

  const pkgInfo = pkg ? parsePkgJson(pkg.text) : { name: null, description: null, deps: [] };
  const meta = html ? parseHtmlMeta(html.text) : { title: null, description: null };
  const lead = readme ? readmeLead(readme.text) : null;

  // Product name: a REAL package name (not the repo slug, not a scaffold slug like
  // "vite_react_shadcn_ts") → the <title>'s lead → repo name.
  const titleLead = meta.title ? meta.title.split(/\s*[-|–—:]\s*/)[0].trim() : null;
  const realPkgName = pkgInfo.name && pkgInfo.name !== ref.repo && !looksLikeScaffoldName(pkgInfo.name) ? pkgInfo.name : null;
  const name = realPkgName || titleLead || ref.repo || null;

  return {
    name: name || null,
    title: meta.title,
    tagline: meta.description || pkgInfo.description || null,
    readmeLead: lead,
    stack: detectStack(pkgInfo.deps),
    docTopics: docTopicsFrom(files),
    surfaces: surfacesFrom(files),
  };
}

/** Whether the distilled signal is rich enough to synthesize from — otherwise the caller should ask
 *  the user to describe the product instead of feeding Genesis a near-empty brief. */
export function hasEnoughSignal(s: RepoSignal): boolean {
  return !!(s.tagline || s.readmeLead || (s.title && s.title !== s.name) || s.docTopics.length);
}

/** Compose the Genesis INTENT from the signal — natural language, grounded ONLY in what was read.
 *  Inferences are flagged as inferences and gaps are handed to Genesis (which turns unknowns into
 *  questions rather than fabricating a market). This string is what generateDraft() consumes. */
export function repoIntent(s: RepoSignal, ref: RepoRef): string {
  const parts: string[] = [];
  const label = s.name ?? ref.repo;
  const what = s.tagline ?? s.readmeLead;
  parts.push(what ? `${label} — ${what}` : `${label} (a software product from the GitHub repo ${ref.owner}/${ref.repo}).`);
  if (s.title && s.tagline && !s.tagline.includes(s.title) && s.title !== label) parts.push(`Positioning line: "${s.title}".`);
  if (s.readmeLead && s.readmeLead !== what) parts.push(s.readmeLead);
  if (s.stack.length) parts.push(`It is a software product built with ${s.stack.join(', ')}.`);
  if (s.docTopics.length) parts.push(`Its own documentation covers: ${s.docTopics.slice(0, 6).join('; ')} — use these as domain signal for what the product actually does.`);
  if (s.surfaces.length) parts.push(`Product surfaces (screens): ${s.surfaces.slice(0, 8).join(', ')}.`);
  parts.push('Design a marketing operation to GROW this product AND make money from it. Be specific about how it makes money (the revenue model), WHO pays (the ideal customer), a pricing approach (as a hypothesis to validate from real comparables — never an invented number), and the 2-3 best marketing channels for THIS kind of product and buyer. Infer these from what the product is; where the audience, pricing, or revenue model is not evident from the above, ASK rather than invent — do not fabricate customers, prices, results, or claims.');
  return parts.join('\n');
}
