// src/lib/garvis/workweb.ts
// THE WORK WEB — pure model (no Supabase, no DOM; verified by workweb.verify.ts).
//
// A mission is not a checklist; it is a TERRITORY. The territory is a knowledge world; it
// decomposes into PRODUCTION AREAS (clusters). Each production area is three things at once:
//   a thought    — it lives in the knowledge graph like any idea,
//   a workspace  — it has tools appropriate to what it is,
//   a ledger     — its outputs and results accumulate on it.
// What turns a thought into a production area is a CHARTER: {archetype, flavor, status, refs} on
// knowledge_clusters.charter (app_0024). This module is the single source of truth for archetypes,
// the (archetype, flavor) → tools registry, and the web TEMPLATES a mission instantiates.
//
// Archetypes are the deep structure — the same seven cover real-estate marketing and app launches
// alike. Flavors only specialize which concrete tools appear. Adding a domain = adding a template
// and (maybe) a flavor's tool row — never a new subsystem.

// ---------------------------------------------------------------------------
// Charter
// ---------------------------------------------------------------------------

export type Archetype = 'intel' | 'audience' | 'studio' | 'launch' | 'loop' | 'ledger' | 'vault';
export type Flavor =
  | 'generic' | 'direct_mail' | 'email' | 'social' | 'video' | 'landing'
  | 'market' | 'brand' | 'crm' | 'lists' | 'ads'
  | 'feature_lab' // PRODUCT work: feature ideation + specs for a platform the owner builds or works for
  | 'assist'      // OPERATOR ASSISTANT: an answering desk — paste an item, get a reply grounded in this world's knowledge base
  | 'deliver'     // DELIVERABLE GENERATOR: a document studio — produce a portable, exportable proposal/report/one-pager
  | 'data';       // DATA & NUMBERS: an analysis workspace — a CSV becomes a typed table, real stats, honest charts
export type CharterStatus = 'dormant' | 'active' | 'waiting' | 'done';

export interface CharterRef { type: string; id: string; label?: string }

export interface Charter {
  archetype: Archetype;
  flavor: Flavor;
  status: CharterStatus;
  refs: CharterRef[];
}

export function makeCharter(archetype: Archetype, flavor: Flavor = 'generic'): Charter {
  return { archetype, flavor, status: 'dormant', refs: [] };
}

/** Tolerant reader for the jsonb column — never trust stored shape blindly. */
export function parseCharter(raw: unknown): Charter | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<Charter>;
  if (!c.archetype || !(c.archetype in ARCHETYPES)) return null;
  return {
    archetype: c.archetype as Archetype,
    flavor: (c.flavor && FLAVORS.includes(c.flavor as Flavor) ? c.flavor : 'generic') as Flavor,
    status: (['dormant', 'active', 'waiting', 'done'].includes(c.status as string) ? c.status : 'dormant') as CharterStatus,
    refs: Array.isArray(c.refs) ? (c.refs as CharterRef[]).filter((r) => r && r.type && r.id) : [],
  };
}

export const FLAVORS: Flavor[] = [
  'generic', 'direct_mail', 'email', 'social', 'video', 'landing', 'market', 'brand', 'crm', 'lists', 'ads', 'feature_lab', 'assist', 'deliver', 'data',
];

export interface ArchetypeMeta {
  label: string;      // what the workspace header says
  tagline: string;    // the one-line "what this area is for"
  tone: 'ember' | 'ok' | 'warn' | 'dim'; // Badge tone in the UI (forge palette stays in the page)
}

export const ARCHETYPES: Record<Archetype, ArchetypeMeta> = {
  intel:    { label: 'Intel',    tagline: 'Knowing — research, strategy, angles.',                    tone: 'ember' },
  audience: { label: 'Audience', tagline: 'Who — lists, segments, targets.',                          tone: 'ok' },
  studio:   { label: 'Studio',   tagline: 'Making — copy, creative, scripts, pages.',                 tone: 'ember' },
  launch:   { label: 'Launch',   tagline: 'Acting — send, print, publish, deploy. Approval-gated.',   tone: 'warn' },
  loop:     { label: 'Loop',     tagline: 'Following up — sequences, CRM tasks, automation.',         tone: 'ok' },
  ledger:   { label: 'Ledger',   tagline: 'Learning — sent, responses, results, ROI.',                tone: 'dim' },
  vault:    { label: 'Vault',    tagline: 'Holding — brand, assets, source documents.',               tone: 'dim' },
};

// ---------------------------------------------------------------------------
// Tools — the registry that makes a chartered cluster FEEL like a production
// area. Tool ids are the contract the impure layer (workwebRun.ts) and the UI
// switch on; adding a tool here without an executor is a verify failure.
// ---------------------------------------------------------------------------

export type ToolKind = 'generate' | 'upload' | 'queue' | 'view';

export interface WorkTool {
  id: string;
  label: string;
  hint: string;       // one line under the button — what will actually happen
  kind: ToolKind;
}

const T = (id: string, label: string, hint: string, kind: ToolKind): WorkTool => ({ id, label, hint, kind });

// Executable tool ids (workwebRun.ts implements exactly these; verified in workweb.verify.ts).
export const TOOL_IDS = [
  'research', 'gen-angle', 'gen-postcard', 'gen-social', 'gen-video-script', 'gen-landing',
  'gen-email-seq', 'gen-copy', 'gen-ads', 'gen-ideas', 'gen-plan', 'gen-features', 'gen-spec',
  'upload-list', 'view-contacts', 'queue-sequence', 'open-approvals',
  'import-docs', 'view-results', 'open-answering', 'open-documents', 'open-data',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

const STUDIO_BY_FLAVOR: Partial<Record<Flavor, WorkTool[]>> = {
  direct_mail: [T('gen-postcard', 'Generate postcard', 'Two copy variants land here as artifacts.', 'generate')],
  social:      [T('gen-social', 'Generate social posts', 'Three platform-ready posts land here.', 'generate')],
  video:       [T('gen-video-script', 'Generate video script', 'A 30-second script + shot list lands here.', 'generate')],
  landing:     [T('gen-landing', 'Generate landing page', 'A page outline lands here — build it in the Preview Engine.', 'generate')],
  email:       [T('gen-email-seq', 'Generate email sequence', 'A 3-touch sequence lands here as drafts.', 'generate')],
  ads:         [T('gen-ads', 'Generate ad campaign', 'Launch-ready Meta + Google assets — copy at platform limits, keywords, tracking URLs.', 'generate')],
  feature_lab: [
    T('gen-features', 'Generate feature concepts', 'Distinct, buildable feature concepts for THIS platform land here — diversity-gated, grounded in the research.', 'generate'),
    T('gen-spec', 'Write feature spec', 'A full spec (problem → v1 scope → success metric → risks) lands here. Steer it with a direction.', 'generate'),
  ],
  assist: [
    T('open-answering', 'Open the answering desk', 'Paste an incoming message — Garvis drafts a reply grounded ONLY in this world\'s knowledge base, cites what it used, and refuses when it has nothing on record. You copy and send.', 'view'),
  ],
  deliver: [
    T('open-documents', 'Open the document studio', 'Generate a finished, exportable document — proposal, report, one-pager, brief — grounded in this world\'s knowledge. Export to Markdown, print/PDF, or .docx; batch one per name in a list. You review and send.', 'view'),
  ],
  data: [
    T('open-data', 'Open the data workspace', 'Paste or upload a CSV — Garvis types the columns, computes honest per-column stats, and charts a real aggregation. Every number is computed, never guessed; the optional read narrates only those figures.', 'view'),
  ],
};

/** The (archetype, flavor) → tools registry. Every chartered cluster gets a non-empty tool list. */
export function toolsFor(charter: Charter): WorkTool[] {
  switch (charter.archetype) {
    case 'intel':
      return [
        T('research', 'Research this', 'Garvis researches and writes a brief into this area.', 'generate'),
        T('gen-angle', 'Synthesize angle', 'One sharp campaign angle from the research here.', 'generate'),
        T('import-docs', 'Import documents', 'Upload source material through the Brain — it files here.', 'view'),
      ];
    case 'audience':
      return [
        T('upload-list', 'Upload list (CSV)', 'name,email rows become contacts you can sequence.', 'upload'),
        T('view-contacts', 'View contacts', 'Everyone this area can reach.', 'view'),
      ];
    case 'studio':
      return [
        ...(STUDIO_BY_FLAVOR[charter.flavor] ?? [T('gen-copy', 'Generate copy', 'Draft copy for this area lands here as artifacts.', 'generate')]),
      ];
    case 'launch':
      return [
        T('queue-sequence', 'Queue send…', 'Pick a recipient — the message goes to Approvals, never straight out.', 'queue'),
        T('open-approvals', 'Open approvals', 'Everything waiting for your sign-off.', 'view'),
      ];
    case 'loop':
      return [
        T('gen-email-seq', 'Generate follow-up sequence', 'A 3-touch sequence lands here as drafts.', 'generate'),
        T('queue-sequence', 'Queue to contact…', 'Start the sequence for one recipient — step 1 goes to Approvals.', 'queue'),
        T('open-approvals', 'Open approvals', 'Everything waiting for your sign-off.', 'view'),
      ];
    case 'ledger':
      return [T('view-results', 'View results', 'Sent, responses, approvals — rolled up from the execution ledger.', 'view')];
    case 'vault':
      return [T('import-docs', 'Add to vault', 'Upload brand assets and documents through the Brain.', 'view')];
  }
}

// ---------------------------------------------------------------------------
// Templates — a web a mission can instantiate. Parent-first, slug-stable.
// ---------------------------------------------------------------------------

export interface TemplateNode {
  slug: string;              // stable kebab-case, unique within the template
  title: string;
  summary: string;
  archetype: Archetype;
  flavor?: Flavor;
  children?: TemplateNode[];
}

export interface WebTemplate {
  id: string;
  title: string;             // becomes the world title
  description: string;
  playIds: string[];         // plays that can run through this web (see plays.ts)
  nodes: TemplateNode[];
}

const N = (
  slug: string, title: string, summary: string, archetype: Archetype, flavor: Flavor = 'generic',
  children?: TemplateNode[],
): TemplateNode => ({ slug, title, summary, archetype, flavor, children });

/** Mom Real Estate Marketing — the first territory. Direct Mail is fully decomposed to show the
 *  cluster-as-production-area pattern; the rest start as single chartered areas that can grow. */
export const MOM_REAL_ESTATE_TEMPLATE: WebTemplate = {
  id: 'mom-real-estate',
  title: 'Mom Real Estate Marketing',
  description: 'Lake Geneva real estate command center — @properties brand, seller and buyer campaigns, direct mail, newsletter, social, video, landing pages, CRM.',
  playIds: ['lakefront-seller'],
  nodes: [
    N('brand', 'Brand', '@properties identity — logo, colors, tone, headshots, bio.', 'vault', 'brand'),
    N('lake-geneva-market', 'Lake Geneva Market', 'Market intel: inventory, lakefront comps, seasonality, buyer origin.', 'intel', 'market'),
    N('seller-campaigns', 'Seller Campaigns', 'Campaigns aimed at winning listings.', 'studio', 'generic'),
    N('buyer-campaigns', 'Buyer Campaigns', 'Campaigns aimed at buyer leads.', 'studio', 'generic'),
    N('direct-mail', 'Direct Mail', 'Postcards to owner lists — the highest-signal channel for luxury sellers.', 'launch', 'direct_mail', [
      N('direct-mail-strategy', 'Strategy', 'Angles: luxury seller, lakefront owner, private buyer demand.', 'intel', 'generic'),
      N('direct-mail-lists', 'Mailing Lists', 'Lakefront owners, luxury homeowners, expireds, past clients.', 'audience', 'lists'),
      N('direct-mail-creative', 'Creative', 'Postcard concepts, copy variants, design versions.', 'studio', 'direct_mail'),
      N('direct-mail-send', 'Print & Send', 'Vendor, quantity, cost — queued for approval before anything mails.', 'launch', 'direct_mail'),
      N('direct-mail-follow-up', 'Follow-Up', 'Email sequence, call script, CRM task for responders.', 'loop', 'email'),
      N('direct-mail-results', 'Results', 'Sent, responses, appointments, ROI.', 'ledger', 'generic'),
    ]),
    N('email-newsletter', 'Email Newsletter', 'The monthly Lake Geneva market letter.', 'loop', 'email'),
    N('social-content', 'Social Content', 'Instagram/Facebook posts and stories.', 'studio', 'social'),
    N('video-ideas', 'Video Ideas', 'Market updates, listing films, neighborhood tours.', 'studio', 'video'),
    N('landing-pages', 'Landing Pages', 'Campaign landing pages — built with the Preview Engine.', 'studio', 'landing'),
    N('mailing-lists', 'Mailing Lists', 'Master audience: all reachable contacts.', 'audience', 'lists'),
    N('crm-follow-up', 'CRM Follow-Up', 'Lead status, next touches, call notes.', 'loop', 'crm'),
    N('automation', 'Automation', 'What runs on its own — and its kill switches.', 'loop', 'generic'),
    N('results', 'Results', 'Whole-territory rollup: sends, replies, appointments, closings.', 'ledger', 'generic'),
    N('opportunities', 'Opportunities', 'What Garvis notices: expireds, price cuts, new lakefront inventory.', 'intel', 'generic'),
  ],
};

/** App Launch — the generality proof: the same seven archetypes run a software launch. */
export const APP_LAUNCH_TEMPLATE: WebTemplate = {
  id: 'app-launch',
  title: 'App Launch',
  description: 'Take one of your apps to launch: intel, waitlist, copy, landing, launch email, ship, measure.',
  playIds: [],
  nodes: [
    N('product-intel', 'Product Intel', 'Competitors, positioning, the one-sentence why.', 'intel', 'market'),
    N('waitlist', 'Waitlist', 'Early users and their emails.', 'audience', 'lists'),
    N('launch-copy', 'Launch Copy', 'Announcement copy, taglines, store text.', 'studio', 'generic'),
    N('brand-assets', 'Brand & Assets', 'Logo, screenshots, demo clips.', 'vault', 'brand'),
    N('landing-page', 'Landing Page', 'The launch page — built with the Preview Engine.', 'studio', 'landing'),
    N('launch-email', 'Launch Email', 'The announcement + two follow-ups.', 'loop', 'email'),
    N('ship-it', 'Ship It', 'Deploys and posts — all approval-gated.', 'launch', 'generic'),
    N('metrics', 'Metrics', 'Signups, activation, replies.', 'ledger', 'generic'),
  ],
};

export const WEB_TEMPLATES: WebTemplate[] = [MOM_REAL_ESTATE_TEMPLATE, APP_LAUNCH_TEMPLATE];

export function templateById(id: string): WebTemplate | null {
  return WEB_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Resolve which template a loaded web was instantiated from by its STRUCTURE, not its title —
 *  slugs are stable identity, titles are user-editable. The template wins when at least 3 of its
 *  node slugs exist in the web AND at least half its structure is present; ties go to the higher
 *  coverage. A renamed world keeps its play; a hand-built web matches nothing and gets none. */
export function templateForWeb(clusterSlugs: string[], templates: WebTemplate[] = WEB_TEMPLATES): WebTemplate | null {
  const have = new Set(clusterSlugs);
  let best: WebTemplate | null = null;
  let bestScore = 0;
  for (const t of templates) {
    const slugs = flattenTemplate(t).map((n) => n.slug);
    const matched = slugs.filter((s) => have.has(s)).length;
    const score = matched / slugs.length;
    if (matched >= 3 && score >= 0.5 && score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

export interface FlatNode {
  slug: string;
  parentSlug: string | null;
  depth: number;
  title: string;
  summary: string;
  charter: Charter;
}

/** Flatten a template parent-first (safe insertion order: a parent always precedes its children). */
export function flattenTemplate(t: WebTemplate): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: TemplateNode[], parentSlug: string | null, depth: number) => {
    for (const n of nodes) {
      out.push({
        slug: n.slug, parentSlug, depth, title: n.title, summary: n.summary,
        charter: makeCharter(n.archetype, n.flavor ?? 'generic'),
      });
      if (n.children?.length) walk(n.children, n.slug, depth + 1);
    }
  };
  walk(t.nodes, null, 0);
  return out;
}

/** Template integrity: unique slugs, kebab-case, parents precede children, tools exist for every
 *  charter, and every play id resolves. Returns human-readable problems (empty = valid). */
export function validateTemplate(t: WebTemplate, knownPlayIds: string[]): string[] {
  const problems: string[] = [];
  const flat = flattenTemplate(t);
  const seen = new Set<string>();
  for (const n of flat) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.slug)) problems.push(`slug "${n.slug}" is not kebab-case`);
    if (seen.has(n.slug)) problems.push(`duplicate slug "${n.slug}"`);
    if (n.parentSlug && !seen.has(n.parentSlug)) problems.push(`"${n.slug}" appears before its parent "${n.parentSlug}"`);
    seen.add(n.slug);
    const tools = toolsFor(n.charter);
    if (!tools.length) problems.push(`"${n.slug}" (${n.charter.archetype}) has no tools`);
    for (const tool of tools) {
      if (!(TOOL_IDS as readonly string[]).includes(tool.id)) problems.push(`"${n.slug}" tool "${tool.id}" is not a registered TOOL_ID`);
    }
  }
  for (const p of t.playIds) if (!knownPlayIds.includes(p)) problems.push(`unknown play "${p}"`);
  return problems;
}

// ---------------------------------------------------------------------------
// Audience CSV — pure parser so list upload is verifiable.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ParsedContact { name: string | null; email: string }
export interface ParsedList { contacts: ParsedContact[]; skipped: number }

/** Parse "name,email" / "email,name" / email-only CSV text. Dedupes by email (lowercased). */
export function parseAudienceCsv(text: string): ParsedList {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const contacts: ParsedContact[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const [i, line] of lines.entries()) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = cells.find((c) => EMAIL_RE.test(c))?.toLowerCase() ?? null;
    if (!email) {
      // tolerate one header row; count everything else as skipped
      if (i > 0 || !/name|email/i.test(line)) skipped++;
      continue;
    }
    if (seen.has(email)) { skipped++; continue; }
    seen.add(email);
    const name = cells.find((c) => c && !EMAIL_RE.test(c)) ?? null;
    contacts.push({ name: name || null, email });
  }
  return { contacts, skipped };
}

// ---------------------------------------------------------------------------
// Results rollup — pure math over rows the impure layer fetches.
// ---------------------------------------------------------------------------

export interface WebRollup {
  artifacts: number;
  pendingApprovals: number;
  approvedActions: number;
  messagesSent: number;
  replies: number;
}

export function rollupWeb(input: {
  artifactCount: number;
  approvalStatuses: string[];
  sentCount: number;
  replyCount: number;
}): WebRollup {
  return {
    artifacts: input.artifactCount,
    pendingApprovals: input.approvalStatuses.filter((s) => s === 'pending').length,
    approvedActions: input.approvalStatuses.filter((s) => s === 'approved').length,
    messagesSent: input.sentCount,
    replies: input.replyCount,
  };
}

/** Derive a charter's live status from its surroundings (never stored blindly — recomputed). */
export function deriveStatus(charter: Charter, artifactCount: number, pendingApprovals: number): CharterStatus {
  if (pendingApprovals > 0) return 'waiting';
  if (charter.status === 'done') return 'done';
  if (artifactCount > 0) return 'active';
  return 'dormant';
}
