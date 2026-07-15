// src/lib/garvis/genesis.ts
// PROJECT GENESIS — pure core (no Supabase, no DOM; verified by genesis.verify.ts).
//
// The capability that decides whether Garvis is an operating system or a demo collection:
// Intent → WORLD DNA → generated Work Web. Two stages, deliberately:
//
//   1. DNA (business synthesis) — before designing anything, understand the business the way an
//      operator would: what kind of business, how it makes money, who buys, what assets matter,
//      what the operational loop is. EVERYTHING downstream (web, website, marketing, lead finder,
//      emails, pricing, CRM) derives from this one record, so it exists first and is stored.
//   2. GENESIS (web synthesis) — the DNA becomes production areas, composed ONLY from the fixed
//      vocabulary existing code already executes: the 7 archetypes, the 17 flavors, the tool
//      registry. Genesis generates DATA that existing validators accept — never new vocabulary.
//      That single constraint is what prevents chaos.
//
// Trust rules (same discipline as parseReflection's evidence gate):
//   * every generated cluster carries a RATIONALE — why THIS business needs it — and every draft
//     names at least one deliberate OMISSION ("no direct mail: the business is visual and
//     relationship-driven"). A structure that can't explain itself doesn't ship.
//   * genesis never invents facts. Unknown price, location, links → null + a QUESTION for the
//     user. The questions channel is how thin intents stay honest.
//   * every play step's draft must stand WITHOUT AI (the zero-keys floor, same as plays.ts).
//   * nothing becomes a world until the user approves the draft. Genesis PROPOSES; the user
//     CHARTERS.

import {
  validateTemplate, ARCHETYPES, FLAVORS,
  type WebTemplate, type TemplateNode, type Archetype, type Flavor,
} from './workweb';
import { slugify } from './clustering';

// ---------------------------------------------------------------------------
// World DNA — the business, synthesized
// ---------------------------------------------------------------------------

export interface WorldDNA {
  businessType: string | null;
  revenueModel: string | null;
  idealCustomers: string[];
  valueProposition: string | null;
  salesCycle: string | null;
  brandPersonality: string | null;
  coreAssets: string[];
  growthChannels: string[];
  operationalLoop: string | null;
  successMetrics: string[];
  constraints: string[];
}

/** Merge tokens for every generator — THE WORLD's voice, never another world's. */
export interface BusinessContext {
  business_name: string;
  principal: string | null;     // "the artist", "Dr. Chen", …
  craft: string | null;         // what they actually do
  offerings: string[];
  audience: string | null;
  locale: string | null;
  links: Record<string, string>;
  tone: string | null;
}

export interface DnaDraft {
  title: string;
  objective: string | null;
  dna: WorldDNA;
  businessContext: BusinessContext;
  questions: string[];
}

// ---------------------------------------------------------------------------
// Data-driven plays — campaign copy as data, so genesis can write it
// ---------------------------------------------------------------------------

// A subset of clustering.ts's ArtifactKind — what a generated play step may produce.
export type PlayDataKind = 'doc' | 'research' | 'post' | 'image' | 'video';

export interface PlayDataStep {
  targetSlug: string;
  artifact: { slug: string; kind: PlayDataKind; title: string };
  draft: string;              // the deterministic floor — useful with zero AI keys
  aiPrompt: string | null;    // optional enrichment instruction
}

export interface PlayEmail { step: number; subject: string; body: string }

export interface PlayData {
  title: string;
  objective: string;
  steps: PlayDataStep[];
  emails: PlayEmail[];        // touch 0 + curated follow-ups, token-merged at queue time
}

export interface GenesisRationale {
  clusters: Record<string, string>;          // slug → why this business needs it
  omissions: { what: string; why: string }[];
}

export interface GenesisDraft {
  title: string;
  objective: string | null;
  dna: WorldDNA;
  businessContext: BusinessContext;
  template: WebTemplate;
  play: PlayData | null;
  rationale: GenesisRationale;
  questions: string[];
  intakeRequests: string[];
  firstMoves: string[];
}

// ---------------------------------------------------------------------------
// Prompt contracts — strict JSON, evidence discipline
// ---------------------------------------------------------------------------

export const DNA_SYSTEM = `You are Garvis synthesizing the DNA of a business from a user's intent —
the way a sharp operator sizes up a venture before designing anything. Return STRICT JSON:

{"title":"short world title (2-5 words)",
 "objective":"one sentence: what winning looks like",
 "dna":{"businessType":"...","revenueModel":"how money is actually made",
  "idealCustomers":["concrete segment", "..."],"valueProposition":"...",
  "salesCycle":"impulse / considered / long relationship — and why",
  "brandPersonality":"...","coreAssets":["what the business already has or must build"],
  "growthChannels":["..."],"operationalLoop":"the repeating cycle that produces revenue",
  "successMetrics":["..."],"constraints":["real limits: budget, time, geography, capacity"]},
 "businessContext":{"business_name":"...","principal":"who fronts it (or null)",
  "craft":"what they do, plainly","offerings":["..."],"audience":"one line",
  "locale":null,"links":{},"tone":"voice for all copy"},
 "questions":["a thing you could NOT know from the intent and refused to invent"]}

HARD RULES:
- NEVER invent facts: names, prices, locations, URLs. Unknown → null/empty AND a question.
- 3-8 idealCustomers, concrete segments — never "everyone". If the intent has NO external
  customers (a personal system, an internal operation, a private registry), name the real
  stakeholders/beneficiaries instead and SAY SO in questions — never fabricate a market that
  doesn't exist. For such intents ALSO write revenueModel as "none — personal/internal system",
  growthChannels as [], and salesCycle as "n/a" — commercial machinery must not be invented for a
  system that has none.
- Every DNA field must follow from the stated intent or the common structure of that business
  type; when you generalize, generalize about the TYPE, not this specific business.
- No markdown fences. JSON only.`;

export const GENESIS_SYSTEM = `You are Garvis designing the WORK WEB for a business whose DNA is
provided in the context — the production areas a real operator would need. You compose ONLY from
this fixed vocabulary (existing machinery executes it; anything else will be rejected):

ARCHETYPES (exactly 7): intel (knowing) · audience (who) · studio (making) · launch (acting,
always approval-gated) · loop (following up) · ledger (learning) · vault (holding)
FLAVORS (exactly 17): generic direct_mail email social video landing market brand crm lists ads feature_lab assist deliver data tracker content_growth

THE SHAPE FOLLOWS THE OBJECTIVE — not every world is a marketing operation:
- MARKETING/GROWTH intent (grow a business, get customers): the classic shape — intel, audience,
  studios for the growth channels, launch, loop, ledger, vault.
- CONTENT-GROWTH / FACELESS-VIDEO-NETWORK intent (the user runs a PORTFOLIO of faceless niche
  accounts and grows them with AI-generated short video — "brainrot accounts", "faceless AI reels",
  "grow and sell Instagram/TikTok accounts", "a content farm", "post AI videos to a bunch of niche
  pages"): design a CONTENT NETWORK. The content itself is the product (entertainment), so AI-
  generated video is honest here — it is the deliberate inverse of a real-business marketing world.
  Shape it as: intel (flavor generic OR market: niche + trend research and an idea backlog), audience
  (flavor lists: the ACCOUNT ROSTER — each account a distinct niche persona), one or more studio areas
  with flavor content_growth (the reel factory — an idea becomes a multi-scene vertical storyboard),
  launch (flavor social: approval-gated posting to the accounts), loop (per-account posting cadence),
  ledger (per-account growth + cost-vs-revenue), and vault (flavor brand: a brand kit per persona).
  Every account is a GENUINE distinct brand, never a sockpuppet clone; keep audience+launch because
  this world posts. Seed the vault/intel play with the FIRST personas + niches to define.
- PRODUCT/PLATFORM intent (the user BUILDS or WORKS FOR a product — "I work at X", feature
  ideation, improving a platform, internal tooling): design a PRODUCT LAB instead — intel
  (flavor market: the platform, its users, competitors, complaints), one or more studio areas
  with flavor feature_lab (feature concepts + specs), vault (source material, screenshots,
  docs), ledger. OMIT audience/launch/loop entirely unless the intent explicitly asks for
  outreach — a feature lab has nothing to mail.
- OPERATOR-ASSISTANT / STANDING-JOB intent (the user has a RECURRING TASK over a body of
  knowledge — "answer my support emails from a database of answers", "triage tickets", "reply
  to inquiries using our policies", "draft responses from our docs"): design an ANSWERING DESK.
  The knowledge base is the whole point, so vault is central (the policies, canned answers, past
  replies, docs the drafts stand on). Add intel (flavor generic: the domain — who writes in and
  what they ask), exactly one studio with flavor assist (the desk where an incoming item becomes
  a grounded draft), and ledger (which drafts were kept vs rewritten — the desk learns its gaps).
  OMIT audience/launch/loop — there is no outreach list and nothing is auto-sent; the human
  always copies and sends. Seed the vault's play with the FIRST knowledge entries to add (a
  return policy, a shipping FAQ, a canned answer), never fake outreach emails: "emails": [].
- DELIVERABLE / DOCUMENT-PRODUCTION intent (the user regularly PRODUCES FORMATTED DOCUMENTS to
  hand to someone — "help me write proposals for my clients", "generate reports from our data",
  "make me one-pagers", "draft contracts from our terms"): design a DOCUMENT STUDIO. The vault
  holds the raw material the documents draw on (rate cards, terms, past proposals, boilerplate).
  Add intel (flavor generic: the recipients and what a strong document for them contains), exactly
  one studio with flavor deliver (where a finished, exportable document is produced — one or a
  batch), and ledger (which documents were kept vs rewritten). OMIT audience/launch/loop — the
  user hands the document off themselves; nothing is auto-delivered. Seed the vault's play with
  the FIRST source materials to add (a rate card, a terms sheet, a past proposal), "emails": [].
- DATA / NUMBERS-ANALYSIS intent (the user wants to WORK WITH STRUCTURED DATA — "analyze my sales
  spreadsheet", "help me make sense of these numbers", "track metrics from a CSV", "summarize
  survey results"): design a DATA WORKSPACE. The vault holds the datasets (CSV uploads). Add intel
  (flavor generic: what questions they're trying to answer with the data), exactly one studio with
  flavor data (where a CSV becomes a typed table, computed statistics, and honest charts), and
  ledger (the analyses run over time). OMIT audience/launch/loop — this is analysis, not outreach.
  Seed the vault's play with what data to bring in first (the spreadsheet, the export, the log),
  "emails": [].
- PERSONAL / INTERNAL REGISTRY intent (the user wants to KEEP RECORDS for themselves or their
  operation — "remember everything about my clients", "track my expenses", "keep a log of my
  decisions / jobs / workouts"): design a REGISTRY. There is no market and no audience — never
  invent one. The vault holds source records (receipts, contracts, exported notes). Add intel
  (flavor generic: the QUESTIONS this registry must answer and when — that list is its real
  schema), exactly one studio with flavor tracker (the registry where entries are logged and
  become queryable memory), and ledger (what's on record over time). OMIT audience/launch/loop.
  Seed the vault's play with the FIRST records to log (the active clients, this month's expenses,
  the open decisions), "emails": [].

Return STRICT JSON:
{"template":{"nodes":[{"slug":"kebab-case","title":"...","summary":"one line",
   "archetype":"...","flavor":"...","children":[]}]},
 "rationale":{"clusters":{"<slug>":"why THIS business needs this area — grounded in the DNA"},
   "omissions":[{"what":"an area you deliberately left out","why":"grounded in the DNA"}]},
 "play":{"title":"...","objective":"...",
   "steps":[{"targetSlug":"...","artifact":{"slug":"...","kind":"doc","title":"..."},
     "draft":"complete useful text that stands WITHOUT AI — the zero-keys floor",
     "aiPrompt":"how to enrich this draft, or null"}],
   "emails":[{"step":0,"subject":"...","body":"..."}]},
 "intakeRequests":["assets the user should upload"],
 "firstMoves":["the first concrete actions"]}

HARD RULES:
- 6-16 nodes. At least one vault, one intel, one ledger. Include launch only if an audience
  area exists. Children only one level deep.
- EVERY node gets a rationale entry. At least one omission with its why.
- DERIVE the structure from the DNA: revenue model shapes the ledger, growth channels shape the
  studios, ideal customers shape the audience areas. Do not emit a generic template.
- 4-8 play steps. 2-3 emails WHEN the design includes an audience/launch area; a world with no
  outreach (e.g. a product lab) gets "emails": [] — never seed sends nobody will make. Every
  draft/email uses {{tokens}} for business facts, and ONLY these tokens are legal:
  {{business_name}} {{principal}} {{craft}} {{audience}} {{offerings}}
  {{tone}} {{locale}} — plus {{first_name}} in EMAILS only (resolved per recipient at send time).
  Any other {{token}} does not exist and will show to the user as raw text — if a fact has no
  token and isn't in the DNA, write around it or add a question. NEVER invent specifics.
- No markdown fences. JSON only.`;

// ---------------------------------------------------------------------------
// Tolerant parsing + the quality gauntlet
// ---------------------------------------------------------------------------

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v: unknown, max = 400): string | null => str(v, max) || null;
const strArr = (v: unknown, cap = 8, max = 200): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, cap);

function extractJson(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

export function parseDNA(raw: string): DnaDraft | null {
  const p = extractJson(raw);
  if (!p) return null;
  const d = (p.dna ?? {}) as Record<string, unknown>;
  const b = (p.businessContext ?? {}) as Record<string, unknown>;
  const title = str(p.title, 80);
  if (!title) return null;
  const links: Record<string, string> = {};
  if (b.links && typeof b.links === 'object') {
    for (const [k, v] of Object.entries(b.links as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) links[str(k, 40)] = str(v, 300);
    }
  }
  return {
    title,
    objective: strOrNull(p.objective, 300),
    dna: {
      businessType: strOrNull(d.businessType),
      revenueModel: strOrNull(d.revenueModel),
      idealCustomers: strArr(d.idealCustomers),
      valueProposition: strOrNull(d.valueProposition),
      salesCycle: strOrNull(d.salesCycle),
      brandPersonality: strOrNull(d.brandPersonality),
      coreAssets: strArr(d.coreAssets),
      growthChannels: strArr(d.growthChannels),
      operationalLoop: strOrNull(d.operationalLoop),
      successMetrics: strArr(d.successMetrics),
      constraints: strArr(d.constraints),
    },
    businessContext: {
      business_name: str(b.business_name, 120) || title,
      principal: strOrNull(b.principal, 120),
      craft: strOrNull(b.craft, 200),
      offerings: strArr(b.offerings),
      audience: strOrNull(b.audience, 300),
      locale: strOrNull(b.locale, 120),
      links,
      tone: strOrNull(b.tone, 200),
    },
    questions: strArr(p.questions, 6, 300),
  };
}

export interface GenesisParseResult {
  draft: GenesisDraft | null;
  problems: string[];   // hard failures — no draft
  warnings: string[];   // repairs made, stated plainly (nothing is repaired silently)
}

const VALID_KINDS: PlayDataKind[] = ['doc', 'research', 'post', 'image', 'video'];

export function parseGenesis(raw: string, dnaDraft: DnaDraft): GenesisParseResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const p = extractJson(raw);
  if (!p) return { draft: null, problems: ['The synthesis did not return valid JSON.'], warnings };

  // --- nodes: coerce, de-collide, bound ---
  const rawNodes = ((p.template as Record<string, unknown> | undefined)?.nodes ?? []) as unknown[];
  const seen = new Set<string>();
  const takeNode = (n: unknown, depth: number): TemplateNode | null => {
    const r = n as Record<string, unknown>;
    const title = str(r?.title, 80);
    if (!title) return null;
    const archetype = str(r?.archetype, 20) as Archetype;
    if (!(archetype in ARCHETYPES)) {
      warnings.push(`Dropped "${title}" — unknown archetype "${str(r?.archetype, 20) || '?'}".`);
      return null;
    }
    let flavor = str(r?.flavor, 20) as Flavor;
    if (!FLAVORS.includes(flavor)) {
      if (r?.flavor) warnings.push(`"${title}": unknown flavor "${str(r?.flavor, 20)}" → generic.`);
      flavor = 'generic';
    }
    let slug = slugify(str(r?.slug, 60) || title);
    if (!slug) return null;
    if (seen.has(slug)) {
      let i = 2;
      while (seen.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
      warnings.push(`Duplicate slug renamed to "${slug}".`);
    }
    seen.add(slug);
    const children = depth === 0
      ? ((Array.isArray(r?.children) ? r.children : []) as unknown[])
          .map((c) => takeNode(c, 1)).filter((c): c is TemplateNode => !!c)
      : [];
    if (depth === 1 && Array.isArray(r?.children) && (r.children as unknown[]).length) {
      warnings.push(`"${title}": grandchildren dropped — the web is at most two levels deep.`);
    }
    return { slug, title, summary: str(r?.summary, 200) || title, archetype, flavor, children };
  };
  let nodes = rawNodes.map((n) => takeNode(n, 0)).filter((n): n is TemplateNode => !!n);

  const flatCount = (ns: TemplateNode[]): number => ns.reduce((a, n) => a + 1 + (n.children?.length ?? 0), 0);
  if (flatCount(nodes) < 4) {
    return { draft: null, problems: [`Only ${flatCount(nodes)} usable areas — too thin to be a working web.`], warnings };
  }
  while (flatCount(nodes) > 16 && nodes.length > 1) {
    const cut = nodes.pop()!;
    warnings.push(`Trimmed "${cut.title}" — webs cap at 16 areas; start focused, grow later.`);
  }

  // --- coverage: every world must know, hold, and learn ---
  const have = (a: Archetype) => nodes.some((n) => n.archetype === a || n.children?.some((c) => c.archetype === a));
  const addCanonical = (node: TemplateNode, why: string) => {
    let slug = node.slug;
    if (seen.has(slug)) { let i = 2; while (seen.has(`${slug}-${i}`)) i++; slug = `${slug}-${i}`; }
    seen.add(slug);
    nodes.push({ ...node, slug });
    warnings.push(why);
    return slug;
  };
  const added: Record<string, string> = {};
  if (!have('vault')) added[addCanonical({ slug: 'brand', title: 'Brand & Assets', summary: 'Identity, files, and source material.', archetype: 'vault', flavor: 'brand', children: [] }, 'Added a Brand vault — every world needs a place to hold identity and assets.')] = 'Added by the validator: every world needs a vault for identity and assets.';
  if (!have('intel')) added[addCanonical({ slug: 'intel', title: 'Intel', summary: 'Research and strategy for this business.', archetype: 'intel', flavor: 'market', children: [] }, 'Added an Intel area — every world needs a place to know.')] = 'Added by the validator: every world needs an intel area.';
  if (!have('ledger')) added[addCanonical({ slug: 'results', title: 'Results', summary: 'What happened: sends, replies, sales.', archetype: 'ledger', flavor: 'generic', children: [] }, 'Added a Results ledger — every world needs a place to learn.')] = 'Added by the validator: every world needs a ledger to learn from.';
  if (have('launch') && !have('audience')) {
    added[addCanonical({ slug: 'audience', title: 'Audience', summary: 'Who this business can reach.', archetype: 'audience', flavor: 'lists', children: [] }, 'Added an Audience area — launch areas need someone to reach.')] = 'Added by the validator: launch requires an audience.';
  }

  // --- rationale: a structure that can't explain itself doesn't ship ---
  const rat = (p.rationale ?? {}) as Record<string, unknown>;
  const clusters: Record<string, string> = {};
  const ratIn = (rat.clusters ?? {}) as Record<string, unknown>;
  const allSlugs: string[] = [];
  const walk = (ns: TemplateNode[]) => { for (const n of ns) { allSlugs.push(n.slug); if (n.children) walk(n.children); } };
  walk(nodes);
  for (const slug of allSlugs) {
    const why = str(ratIn[slug], 300) || added[slug] || '';
    if (!why) warnings.push(`"${slug}" has no rationale — genesis should say why every area exists.`);
    clusters[slug] = why || '(no reason given)';
  }
  const omissions = ((Array.isArray(rat.omissions) ? rat.omissions : []) as Record<string, unknown>[])
    .map((o) => ({ what: str(o?.what, 120), why: str(o?.why, 300) }))
    .filter((o) => o.what && o.why)
    .slice(0, 6);
  if (!omissions.length) warnings.push('No omissions stated — a design that leaves nothing out was not designed.');

  // --- play: data-driven, zero-keys floor enforced ---
  const slugSet = new Set(allSlugs);
  let play: PlayData | null = null;
  const rp = p.play as Record<string, unknown> | undefined;
  if (rp && Array.isArray(rp.steps)) {
    const steps: PlayDataStep[] = [];
    for (const s of rp.steps as Record<string, unknown>[]) {
      const target = slugify(str(s?.targetSlug, 60));
      const art = (s?.artifact ?? {}) as Record<string, unknown>;
      const draft = str(s?.draft, 8000);
      if (!slugSet.has(target)) { warnings.push(`Play step dropped — targets unknown area "${target || '?'}".`); continue; }
      if (draft.length < 40) { warnings.push(`Play step for "${target}" dropped — its draft fails the zero-AI floor.`); continue; }
      const kind = (VALID_KINDS.includes(str(art.kind, 12) as PlayDataKind) ? str(art.kind, 12) : 'doc') as PlayDataKind;
      steps.push({
        targetSlug: target,
        artifact: { slug: slugify(str(art.slug, 60) || str(art.title, 60) || `${target}-draft`), kind, title: str(art.title, 120) || 'Draft' },
        draft,
        aiPrompt: strOrNull(s?.aiPrompt, 600),
      });
      if (steps.length >= 8) break;
    }
    const emails: PlayEmail[] = ((Array.isArray(rp.emails) ? rp.emails : []) as Record<string, unknown>[])
      .map((e, i) => ({ step: i, subject: str(e?.subject, 160), body: str(e?.body, 4000) }))
      .filter((e) => e.subject && e.body.length >= 40)
      .slice(0, 3);
    if (steps.length) {
      play = { title: str(rp.title, 120) || 'Opening play', objective: str(rp.objective, 300) || 'Fill the web with working drafts.', steps, emails };
    }
  }

  // --- final structural validation through the EXISTING gate ---
  const template: WebTemplate = {
    id: `gen-${slugify(dnaDraft.title).slice(0, 40) || 'world'}`,
    title: dnaDraft.title,
    description: dnaDraft.objective ?? '',
    playIds: [],           // data plays live beside the template, not in PLAYS
    nodes,
  };
  const structural = validateTemplate(template, []);
  if (structural.length) return { draft: null, problems: structural, warnings };

  return {
    draft: {
      title: dnaDraft.title,
      objective: dnaDraft.objective,
      dna: dnaDraft.dna,
      businessContext: dnaDraft.businessContext,
      template,
      play,
      rationale: { clusters, omissions },
      questions: dnaDraft.questions,
      intakeRequests: strArr(p.intakeRequests, 8, 200),
      firstMoves: strArr(p.firstMoves, 6, 200),
    },
    problems,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Token merge — the world's own voice in every draft
// ---------------------------------------------------------------------------

/** Replace {{tokens}} with the world's business context. Unknown or empty values leave the token
 *  VISIBLE — a draft that needs a fact the world doesn't have should show the hole, not hide it. */
export function mergeTokens(text: string, ctx: BusinessContext, extra: Record<string, string> = {}): string {
  const table: Record<string, string> = {
    business_name: ctx.business_name,
    principal: ctx.principal ?? '',
    craft: ctx.craft ?? '',
    audience: ctx.audience ?? '',
    offerings: ctx.offerings.join(', '),
    tone: ctx.tone ?? '',
    locale: ctx.locale ?? '',
    ...extra,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const v = table[key];
    return v ? v : whole;
  });
}

/** Structural invariants every world must satisfy before it can be instantiated. The parse gauntlet
 *  auto-repairs these on synthesis, but a user can prune a draft below them via removeDraftNode — so
 *  approveDraft re-checks here (deep scan): no zero/thin worlds, and every world can know, hold, and
 *  learn. Returns a list of human-readable violations ([] means the draft is sound). */
// ---------------------------------------------------------------------------
// Go-to-market plan — turn the synthesized DNA into an ACTIONABLE money + marketing plan the owner
// can judge BEFORE approving a world. Pure and deterministic: it only organizes what the DNA already
// says (revenue model, buyers, channels, metrics) into a plan, and shows a visible [bracketed hole]
// wherever the DNA is thin — it never invents a price, a number, or a market.
// ---------------------------------------------------------------------------

export interface PlanSection { heading: string; lines: string[] }

/** A structured GTM plan derived from the DNA: positioning, how it makes money, the marketing
 *  channels (best first), the first 90 days, and what to measure. Honest holes where the DNA is thin. */
export function growthPlan(dna: WorldDNA): PlanSection[] {
  const has = (s: string | null | undefined): s is string => !!(s && s.trim());
  const sections: PlanSection[] = [];

  sections.push({ heading: 'Positioning', lines: [
    has(dna.valueProposition) ? dna.valueProposition : '[define the one-sentence value proposition]',
    has(dna.brandPersonality) ? `Voice: ${dna.brandPersonality}.` : '',
  ].filter(Boolean) });

  const money: string[] = [];
  money.push(has(dna.revenueModel) ? `How it makes money: ${dna.revenueModel}.` : '[no revenue model set — how does this earn?]');
  money.push(dna.idealCustomers.length ? `Who pays: ${dna.idealCustomers.slice(0, 4).join('; ')}.` : '[who is the paying customer?]');
  if (has(dna.salesCycle)) money.push(`Sales cycle: ${dna.salesCycle}.`);
  money.push('Pricing: set it from 3–5 real comparable prices before committing — never guess a number.');
  sections.push({ heading: 'How it makes money', lines: money });

  const ch = dna.growthChannels.slice(0, 4);
  sections.push({ heading: 'Marketing — best channels first', lines: ch.length
    ? ch.map((c, i) => `${i + 1}. ${c}`)
    : ['[no channels identified — pick the 2–3 places the buyer already is, master one before adding the next]'] });

  sections.push({ heading: 'First 90 days', lines: [
    has(dna.operationalLoop)
      ? `Run this loop weekly: ${dna.operationalLoop}.`
      : 'Weeks 1–2: brand + landing page + one channel live. Weeks 3–8: publish on cadence, capture leads. Weeks 9–12: double down on the channel with the lowest cost per lead.',
    'Ship one channel well before adding the next — focus beats spread.',
  ] });

  const kpis = dna.successMetrics.slice(0, 5);
  sections.push({ heading: 'What to measure', lines: [
    ...(kpis.length ? kpis.map((k) => `• ${k}`) : ['• leads captured', '• conversion to customer']),
    '• cost per lead, per channel — the number that says what to scale and what to kill.',
  ] });

  if (dna.constraints.length) {
    sections.push({ heading: 'Honest constraints', lines: dna.constraints.slice(0, 4).map((c) => `• ${c}`) });
  }
  return sections;
}

/** An honest one-line read of whether this world can actually earn — used so the draft never
 *  over-promises. A world with no revenue model is called out as internal/non-commercial (which may
 *  be correct); an incomplete money model names exactly what's missing. */
export function planMoneyVerdict(dna: WorldDNA): { canMakeMoney: boolean; line: string } {
  const rev = (dna.revenueModel ?? '').toLowerCase();
  if (!rev || /\bnone\b|personal|internal|\bn\/a\b|no revenue|not a revenue/.test(rev)) {
    return { canMakeMoney: false, line: 'No revenue model — this reads as an internal/non-commercial system, so there is nothing to monetize (that may be exactly right).' };
  }
  const hasBuyers = dna.idealCustomers.length > 0;
  const hasChannels = dna.growthChannels.length > 0;
  if (hasBuyers && hasChannels) {
    return { canMakeMoney: true, line: `Can make money: ${dna.revenueModel} — sold to ${dna.idealCustomers[0]}, reached via ${dna.growthChannels.slice(0, 2).join(' + ')}.` };
  }
  const gaps: string[] = [];
  if (!hasBuyers) gaps.push('no paying customer named');
  if (!hasChannels) gaps.push('no growth channels');
  return { canMakeMoney: false, line: `The money model is incomplete (${gaps.join(', ')}) — fill this in before it can earn.` };
}

export function structuralViolations(t: WebTemplate): string[] {
  const flat = (t.nodes ?? []).flatMap((n) => [n, ...(n.children ?? [])]);
  const has = (a: Archetype) => flat.some((n) => n.archetype === a);
  const v: string[] = [];
  if (flat.length < 3) v.push('a world needs at least a few areas — this draft has too few');
  if (!has('vault')) v.push('no vault to hold identity and assets');
  if (!has('intel')) v.push('no intel area to know the market');
  if (!has('ledger')) v.push('no ledger to learn what happened');
  if (has('launch') && !has('audience')) v.push('a launch area needs an audience to reach');
  return v;
}
