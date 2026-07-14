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
  money: MoneySignal;        // can this app actually take money yet, and what's the next move
}

// Can the app CHARGE today? The honest gate between marketing and revenue: a product with no way to
// take money earns nothing no matter how good the marketing is.
export interface MoneySignal {
  hasBilling: boolean;   // a payment SDK (Stripe/Paddle/…) is a dependency
  hasPricing: boolean;   // a priced offer is described (price text / "subscription" / "freemium")
  stage: 'no-offer' | 'offer-not-wired' | 'can-charge';
  nextMove: string;      // the single next step toward first dollars
}

const BILLING_DEP_RE = /^(stripe|@stripe\/|paddle|@paddle\/|lemonsqueezy|@lemonsqueezy\/|@paypal\/|braintree|razorpay|@revenuecat\/)/i;

/** Read whether an app can take money yet, and name the one blocker. hasBilling (a payment SDK in the
 *  deps) is the strong signal — it means money can actually move; pricing text without it means the
 *  offer exists but the till doesn't. */
export function moneyReadiness(deps: string[], text: string): MoneySignal {
  const hasBilling = deps.some((d) => BILLING_DEP_RE.test(d));
  const t = (text || '').toLowerCase();
  const hasPricing = /\$\d|\bper month\b|\/mo\b|\/yr\b|\bpricing\b|\bsubscription\b|\bfreemium\b|\bpaid (plan|tier)\b|\bupgrade to pro\b|\boffers?\b/.test(t);
  if (hasBilling) return { hasBilling, hasPricing, stage: 'can-charge', nextMove: 'Billing is already wired — the blocker to first dollars is TRAFFIC. Point the marketing engine at buyers with intent.' };
  if (hasPricing) return { hasBilling, hasPricing, stage: 'offer-not-wired', nextMove: 'There is a priced offer but no payment SDK in the app — wire Stripe/checkout so it can actually take money, THEN drive traffic.' };
  return { hasBilling, hasPricing, stage: 'no-offer', nextMove: 'No paid offer found — decide the paid tier and wire billing in the app FIRST; marketing a product that cannot charge earns nothing.' };
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

/** Route-based apps (TanStack Start, Remix, some Next) keep their head in a route file, NOT index.html
 *  — head() returns { title, meta:[{name:'description',content}] } objects. Pull title + description
 *  from that source so those apps aren't read as blank. Fuzzy on purpose: real string literals only. */
export function parseRouteHead(text: string): { title: string | null; description: string | null } {
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.trim() ||
    /\btitle\s*:\s*['"`]([^'"`]{3,})['"`]/i.exec(text)?.[1]?.trim() ||
    null;
  const description =
    /name\s*:\s*['"`]description['"`][\s\S]{0,80}?content\s*:\s*['"`]([^'"`]{8,})['"`]/i.exec(text)?.[1]?.trim() ||
    /content\s*:\s*['"`]([^'"`]{8,})['"`][\s\S]{0,80}?name\s*:\s*['"`]description['"`]/i.exec(text)?.[1]?.trim() ||
    null;
  return { title, description };
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
    money: moneyReadiness(pkgInfo.deps, [meta.title, meta.description, lead, readme?.text].filter(Boolean).join(' ')),
  };
}

/** Whether the distilled signal is rich enough to synthesize from — otherwise the caller should ask
 *  the user to describe the product instead of feeding Genesis a near-empty brief. */
export function hasEnoughSignal(s: RepoSignal): boolean {
  return !!(s.tagline || s.readmeLead || (s.title && s.title !== s.name) || s.docTopics.length);
}

// The adaptive money layer: read the app's signal and classify it into a monetization archetype so
// the plan fits THIS kind of app. It's a HYPOTHESIS the DNA synthesis refines — where the signal is
// too thin, it declines to classify and lets Genesis ask. Grounded in the real portfolio scan:
// health SaaS, privacy freemium, career/edu, newsletter media, research tool, B2B vertical CRM.
export interface AppClass { category: string; revenueModel: string | null; channels: string[]; rationale: string }

export function classifyApp(s: RepoSignal): AppClass {
  const text = [s.name, s.title, s.tagline, s.readmeLead, ...s.docTopics, ...s.surfaces].filter(Boolean).join(' ').toLowerCase();
  const stack = s.stack.map((x) => x.toLowerCase());
  const hasStripe = stack.includes('stripe');
  const any = (...keys: string[]) => keys.some((k) => text.includes(k));

  if (any('privacy', 'data broker', 'breach', 'delete my', 'footprint', 'unsubscribe', 'gdpr', 'ccpa'))
    return { category: 'B2C privacy/security SaaS', revenueModel: 'freemium subscription', channels: ['intent SEO (e.g. "remove me from data brokers", breach-check)', 'Product Hunt + privacy subreddits', 'paid search on privacy/safety intent'], rationale: 'privacy tooling with clear paid tiers' };
  if (any('stroke', 'rehab', 'therapy', 'clinical', 'patient', 'health', 'medical', 'recovery', 'motor skill'))
    return { category: 'B2C health SaaS', revenueModel: 'subscription', channels: ['clinician / therapist referrals', 'condition-specific content + SEO', 'caregiver & patient communities'], rationale: 'health/rehab product — trust- and evidence-led, special ad-category rules apply' };
  if (any('career', 'roadmap', 'resume', 'interview', 'profession'))
    return { category: 'B2C career/education SaaS', revenueModel: 'freemium subscription', channels: ['short-form video (TikTok/Reels/YouTube) on career pivots', 'long-tail career-path SEO', 'career & job subreddits/communities'], rationale: 'career guidance for individuals' };
  if (any('exam', 'prep', 'study', 'quiz', 'course', 'tutor', 'learn', 'flashcard', 'student'))
    return { category: 'education / test-prep', revenueModel: 'freemium subscription', channels: ['short-form + YouTube study content', 'SEO on the exam/subject', 'student communities (Discord/Reddit)'], rationale: 'learning product for students' };
  if (any('newsletter', 'news', 'brief', 'digest', ' media', 'local ', 'daily '))
    return { category: 'content / newsletter media', revenueModel: 'advertiser sponsorships (+ optional paid tier)', channels: ['local/topic SEO', 'community social + relevant groups', 'cross-promotion & referral'], rationale: 'audience-first media — monetize the audience, not a checkout' };
  if (any('research', 'scientific', 'papers', 'literature', 'discovery engine', 'academic', ' lab', 'hypothes'))
    return { category: 'B2B / research tool', revenueModel: 'B2B/academic seat subscription', channels: ['academic outbound (conferences, PIs, lab lists)', 'content / preprints proving value', 'enterprise sales to R&D'], rationale: 'research intelligence for teams/institutions' };
  if (any('crm', 'leads', 'outbound', 'pipeline', ' sales', 'quotes', 'tickets', 'campaigns'))
    return { category: 'B2B vertical SaaS / CRM', revenueModel: 'B2B SaaS seats or usage-based', channels: ['direct outbound + cold email', 'industry trade shows / associations', 'LinkedIn ABM'], rationale: 'B2B sales/ops tool' };
  if (any('api', 'sdk', 'cli', 'developer', 'devtool'))
    return { category: 'developer tool', revenueModel: hasStripe ? 'usage-based / freemium' : 'usage-based', channels: ['docs + dev-content SEO', 'GitHub / Hacker News / dev communities', 'integrations & partnerships'], rationale: 'tool for developers' };
  if (any('shop', 'store', 'marketplace', 'checkout', 'commerce', 'sellers', 'buyers'))
    return { category: 'marketplace / commerce', revenueModel: 'transaction fee / commission', channels: ['SEO + paid social', 'seed both supply and demand', 'referral / marketplace ops'], rationale: 'two-sided or commerce' };

  return { category: 'unclear from the repo', revenueModel: hasStripe ? 'paid (Stripe present) — exact model unclear' : null, channels: [], rationale: 'signal too thin to classify — Genesis should ask what it is and who pays' };
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
  const cls = classifyApp(s);
  if (cls.category !== 'unclear from the repo') {
    parts.push(`This looks like a ${cls.category}${cls.revenueModel ? `; a fitting money model is ${cls.revenueModel}` : ''}${cls.channels.length ? `, with the strongest channels likely: ${cls.channels.join('; ')}` : ''}. Treat this as a STARTING HYPOTHESIS to validate against the actual product — refine or correct it, and if it's wrong, say so.`);
  }
  const stageLine = s.money.stage === 'can-charge'
    ? 'MONETIZATION READINESS: the app already has billing wired, so it CAN take money today — the plan should focus on driving qualified traffic to the paid offer.'
    : s.money.stage === 'offer-not-wired'
      ? 'MONETIZATION READINESS: a priced offer exists but billing may not be wired — the plan must flag that the paid path has to work before spending on traffic.'
      : 'MONETIZATION READINESS: no clear paid offer was found in the repo — the plan should state the revenue model AND note that a way to charge must exist before marketing can earn.';
  parts.push(stageLine);
  parts.push('Design a marketing operation to GROW this product AND make money from it. Be specific about how it makes money (the revenue model), WHO pays (the ideal customer), a pricing approach (as a hypothesis to validate from real comparables — never an invented number), and the 2-3 best marketing channels for THIS kind of product and buyer. Infer these from what the product is; where the audience, pricing, or revenue model is not evident from the above, ASK rather than invent — do not fabricate customers, prices, results, or claims.');
  return parts.join('\n');
}
