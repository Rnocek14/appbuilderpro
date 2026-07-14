// src/lib/garvis/producersCore.ts
// Pure core of the PRODUCERS layer (no Supabase, no DOM; verified by producers.verify.ts).
// The producers are what turn a studio tool press into FINISHED work instead of a framework:
// real web-researched briefs with citations, ready-to-publish social posts tied to the world's
// own photos, shot-by-shot video scripts, evidence-grounded campaign angles. This file holds the
// prompt contracts and the tolerant parsers; the impure half (producers.ts) does the search + AI.
//
// Honesty rules live here too: research cites its sources by number and never invents a stat;
// social posts reference REAL vault photos (by caption) or say "shoot this", never a stock image;
// every parser degrades gracefully — a malformed model reply yields fewer items, never a throw.

import type { WorldDNA, BusinessContext } from './genesis';

export interface FinishedPost { caption: string; visual: string; tags: string[] }
export interface ResearchSource { title: string; url: string; snippet: string }

// ---------------------------------------------------------------------------
// Research — actual web research, synthesized and cited
// ---------------------------------------------------------------------------

/** Search queries for real MARKET research (distinct from marketIntel's PROSPECT queries): the
 *  landscape, competitors, pricing, and demand for THIS business — derived from its DNA. */
export function researchQueries(dna: WorldDNA | null, ctx: BusinessContext | null): string[] {
  const what = ctx?.craft || dna?.businessType || ctx?.business_name || '';
  const where = ctx?.locale || '';
  const offering = ctx?.offerings?.[0] || dna?.idealCustomers?.[0] || '';
  const out = [
    [what, where && `in ${where}`, 'market trends'].filter(Boolean).join(' '),
    [what, offering && `${offering}`, 'pricing', where].filter(Boolean).join(' '),
    [what, where, 'competitors OR top providers'].filter(Boolean).join(' '),
  ].map((q) => q.replace(/\s+/g, ' ').trim()).filter((q) => q.length > 3);
  return [...new Set(out)].slice(0, 3);
}

export const RESEARCH_SYSTEM = `You are Garvis doing real market research for one business. You are
given SEARCH RESULTS (numbered, each a title + snippet + url) and the business DNA. Write a sharp,
useful market brief GROUNDED ONLY in those results.

Rules:
- Cite every factual claim with [n] pointing at the numbered source it came from.
- If the results don't answer something important, say so under "STILL UNKNOWN" — never invent a
  statistic, price, or name. "The snippets don't give a median price" is a valid, useful sentence.
- Structure: LANDSCAPE (what the market looks like) · COMPETITORS (who else, what they do) ·
  PRICING SIGNALS (real numbers from the snippets, cited) · DEMAND (who's buying, why now) ·
  YOUR OPENING (one paragraph: where this business wins) · STILL UNKNOWN (what to research next).
- Plain text. No markdown fences. Concrete and brief — a page, not an essay.`;

/** Render numbered sources for the research prompt + the artifact's SOURCES footer. */
export function formatSources(sources: ResearchSource[]): string {
  return sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet}\n${s.url}`).join('\n\n');
}

/** Append a real SOURCES section (the cited URLs) so the brief is checkable, not a black box. */
export function appendSources(brief: string, sources: ResearchSource[]): string {
  if (!sources.length) return brief;
  const list = sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n');
  return `${brief.trim()}\n\nSOURCES (what this brief is grounded in):\n${list}`;
}

// ---------------------------------------------------------------------------
// Social — ready-to-publish posts, not a content plan
// ---------------------------------------------------------------------------

export const SOCIAL_SYSTEM = `You are Garvis writing FINISHED, ready-to-publish social posts for one
business — copy the owner can paste today, not a plan describing what to post.

You are given the business DNA/voice, the brand tone, and a list of the owner's REAL photos (name +
caption). Write 5 posts. Each post MUST use this exact block format:

POST
caption: <the full caption — hook in the first line, then 1-3 short lines, then one clear CTA. The
business's real voice. No hashtags inside the caption.>
visual: <which of the REAL photos to use, by its caption; or "shoot: <one concrete shot>" if none
fit. NEVER invent a stock image.>
tags: <3-6 specific hashtags, space-separated, each starting with #>

Rules: every caption is complete and specific to THIS business (use its real offerings, audience,
locale). Vary the angle across the 5 (proof, process, education, story, offer). Never invent facts,
prices, or results not in the context. Output ONLY the five POST blocks, nothing else.`;

/** Parse the model's POST blocks into finished posts. Tolerant: missing fields degrade, bad blocks
 *  drop, never throws. A caption is required (a post with no words is not a post). */
export function parseSocialPosts(text: string): FinishedPost[] {
  const blocks = text.split(/^\s*POST\s*$/im).map((b) => b.trim()).filter(Boolean);
  const out: FinishedPost[] = [];
  for (const b of blocks) {
    const caption = grab(b, 'caption');
    if (!caption || caption.length < 12) continue;               // a real caption or nothing
    const visual = grab(b, 'visual') || 'shoot: a shot that fits this caption';
    const tagsRaw = grab(b, 'tags') || '';
    const tags = [...new Set((tagsRaw.match(/#[\w]+/g) ?? []).map((t) => t.toLowerCase()))].slice(0, 6);
    out.push({ caption: caption.slice(0, 600), visual: visual.slice(0, 200), tags });
  }
  return out.slice(0, 8);
}

/** Pull a "label: value" field from a block; value may span lines until the next known label. */
function grab(block: string, label: string): string {
  const re = new RegExp(`^\\s*${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:caption|visual|tags)\\s*:|$)`, 'im');
  return (re.exec(block)?.[1] ?? '').trim();
}

/** Render a finished post as artifact detail — copy-paste ready, the tags on their own line. */
export function postToDetail(p: FinishedPost): string {
  return `${p.caption}\n\n${p.tags.join(' ')}\n\n— VISUAL: ${p.visual}`;
}

// ---------------------------------------------------------------------------
// Video — a shot-by-shot script, not an outline
// ---------------------------------------------------------------------------

export const VIDEO_SYSTEM = `You are Garvis scripting ONE short-form vertical video (30-45s) for a
business — a real shoot script the owner could hand to a phone camera today.

Given the DNA/voice, offerings, and the owner's real photos, write:
TITLE line · HOOK (0-3s: the first spoken/on-screen line that stops the scroll) · then 4-6 SHOTS,
each as "0-3s | SHOT: <what's on screen> | VO/TEXT: <the words>" · CTA shot · a one-line SHOT LIST
· CAPTIONS: on. Ground everything in THIS business — its real work, audience, locale. Never invent
results or prices. Plain text, no markdown fences.`;

// ---------------------------------------------------------------------------
// Reel — a multi-scene vertical storyboard for a FACELESS AI-video account. The honest seed the
// clip engine later fills: each scene carries a generation PROMPT (what an AI clip should show —
// original entertainment, never a real place/person/listing), an on-screen CAPTION, and a VO line.
// ---------------------------------------------------------------------------

export const REEL_SYSTEM = `You are Garvis storyboarding ONE short-form vertical reel (9-30s, 9:16) for
a FACELESS AI-VIDEO account — an entertainment account whose footage is generated by AI. This is
honest because the account is faceless entertainment and the content IS the product; you are NOT
depicting any real person, place, business, or event.

Given the account's niche/persona and voice, write a storyboard the clip engine can generate:
HOOK: <the scroll-stopping first line or visual — the first second is everything>
then 4-6 SCENE blocks, each in this EXACT format:

SCENE
prompt: <a concrete text-to-video generation prompt for THIS beat — subject, action, setting, style,
camera move. Describe an ORIGINAL, generic, or fantastical shot fit for a faceless account. NEVER
name or depict a real person, brand, place, or event, and never imply real footage.>
caption: <the on-screen text for this beat — carries the story with sound off>
vo: <one spoken line for this beat, or "—" for none>

Rules: one idea across the reel, escalating to a payoff that loops. Keep it in the account's niche and
voice. No real-world claims, no impersonation. Output ONLY the HOOK line then the SCENE blocks.`;

export interface ReelScene { prompt: string; caption: string; vo: string }
export interface ReelStoryboard { hook: string; scenes: ReelScene[] }

/** Parse the model's HOOK + SCENE blocks into a storyboard. Tolerant: a scene needs a prompt OR a
 *  caption to count; missing fields degrade; never throws. Returns null when nothing usable. */
export function parseReel(text: string): ReelStoryboard | null {
  const hook = (/^\s*HOOK\s*:\s*(.+)$/im.exec(text)?.[1] ?? '').trim().slice(0, 200);
  const grabField = (block: string, label: string): string => {
    const re = new RegExp(`^\\s*${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:prompt|caption|vo)\\s*:|$)`, 'im');
    return (re.exec(block)?.[1] ?? '').trim();
  };
  const blocks = text.split(/^\s*SCENE\s*$/im).map((b) => b.trim()).filter(Boolean);
  const scenes: ReelScene[] = [];
  for (const b of blocks) {
    if (!/^\s*(?:prompt|caption|vo)\s*:/im.test(b)) continue;      // the pre-HOOK preamble isn't a scene
    const prompt = grabField(b, 'prompt').slice(0, 500);
    const caption = grabField(b, 'caption').slice(0, 200);
    if (!prompt && !caption) continue;                              // a scene needs something to show or say
    let vo = grabField(b, 'vo').slice(0, 240);
    if (vo === '—' || vo === '-') vo = '';
    scenes.push({ prompt, caption, vo });
  }
  if (!scenes.length) return null;
  return { hook, scenes: scenes.slice(0, 8) };
}

/** Render a storyboard as artifact detail — human-readable scenes plus the honest "not yet a video"
 *  line. The clip engine reads the per-scene prompts; the owner reads this. */
export function reelToDetail(sb: ReelStoryboard): string {
  const lines: string[] = [];
  if (sb.hook) lines.push(`HOOK — ${sb.hook}`, '');
  sb.scenes.forEach((s, i) => {
    lines.push(`SCENE ${i + 1}`);
    if (s.prompt) lines.push(`  clip: ${s.prompt}`);
    if (s.caption) lines.push(`  caption: ${s.caption}`);
    if (s.vo) lines.push(`  voiceover: ${s.vo}`);
    lines.push('');
  });
  const vo = sb.scenes.map((s) => s.vo).filter(Boolean).join(' ');
  if (vo) lines.push(`FULL VOICEOVER SCRIPT:`, vo, '');
  lines.push('— This is the storyboard, not yet a video. Clip generation renders each scene\'s prompt into real footage (credit-gated, coming online); every finished reel carries the platform\'s made-with-AI label and posts only through Approvals.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Ads — launch-ready assets at REAL platform limits (paste into Ads Manager)
// ---------------------------------------------------------------------------

// The platform facts, encoded (current as of mid-2026): Meta headline 40 chars / description 30 /
// primary text ~125 shown before truncation; Google RSA 15 headlines ≤30 chars / 4 descriptions
// ≤90. The parser ENFORCES limits — an over-limit asset is trimmed at a word boundary, never
// shipped broken.
export const AD_LIMITS = {
  metaPrimary: 125, metaHeadline: 40, metaDescription: 30,
  googleHeadline: 30, googleDescription: 90,
  googleHeadlinesMax: 15, googleDescriptionsMax: 4,
} as const;

export interface AdAssets {
  metaPrimaries: string[];       // 2-3 primary-text variants
  metaHeadlines: string[];       // 3-5, ≤40 chars
  metaDescriptions: string[];    // 1-3, ≤30 chars
  googleHeadlines: string[];     // up to 15, ≤30 chars
  googleDescriptions: string[];  // up to 4, ≤90 chars
  keywords: string[];            // with match-type notation: [exact] "phrase" broad
  negatives: string[];
}

export const ADS_SYSTEM = `You are Garvis writing LAUNCH-READY ad assets for one business — copy the
owner pastes into Meta Ads Manager and Google Ads today. You get the business DNA/voice, its real
photos, its research findings, and any compliance rules for its industry (follow them exactly).

Output EXACTLY these labeled sections, nothing else:

META_PRIMARY (3 lines, each a complete primary text ≤125 chars: hook first, one proof, one CTA)
META_HEADLINES (4 lines, each ≤40 chars)
META_DESCRIPTIONS (2 lines, each ≤30 chars)
GOOGLE_HEADLINES (10-12 lines, each ≤30 chars — mix: what it is, the benefit, the location, the
  offer, a proof point. Google mixes these, so each must stand alone)
GOOGLE_DESCRIPTIONS (4 lines, each ≤90 chars)
KEYWORDS (8-12 lines: [exact match] in brackets, "phrase match" in quotes, broad bare — buyer-intent
  terms for THIS business and locale, never generic)
NEGATIVES (4-8 lines: terms that waste money — jobs, free, DIY, wrong locations)

Rules: the business's real voice and real facts only — never invent prices, results, or claims.
One line per asset, no numbering, no markdown.`;

const trimAt = (s: string, n: number): string => {
  const t = s.trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trim();
};

const SECTION_LABELS = ['META_PRIMARY', 'META_HEADLINES', 'META_DESCRIPTIONS', 'GOOGLE_HEADLINES', 'GOOGLE_DESCRIPTIONS', 'KEYWORDS', 'NEGATIVES'] as const;

/** Split the model output into labeled sections by header positions (index-sliced — a lazy regex
 *  with the m-flag would stop at the first line-end, which is exactly the bug this replaces). */
function splitSections(text: string): Map<string, string[]> {
  const headerRe = new RegExp(`^\\s*(${SECTION_LABELS.join('|')})\\b[^\\n]*$`, 'gim');
  const hits: { label: string; start: number; bodyStart: number }[] = [];
  for (const m of text.matchAll(headerRe)) {
    hits.push({ label: m[1].toUpperCase(), start: m.index ?? 0, bodyStart: (m.index ?? 0) + m[0].length });
  }
  const out = new Map<string, string[]>();
  for (let i = 0; i < hits.length; i++) {
    const body = text.slice(hits[i].bodyStart, i + 1 < hits.length ? hits[i + 1].start : undefined);
    const lines = body.split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 1);
    if (!out.has(hits[i].label)) out.set(hits[i].label, lines);
  }
  return out;
}

function section(text: string, label: string): string[] {
  return splitSections(text).get(label.toUpperCase()) ?? [];
}

/** Parse + ENFORCE platform limits. Tolerant: missing sections yield empty arrays; over-limit
 *  lines are word-boundary trimmed; caps applied. isLaunchReady() decides if enough survived. */
export function parseAdAssets(text: string): AdAssets {
  return {
    metaPrimaries: section(text, 'META_PRIMARY').map((l) => trimAt(l, AD_LIMITS.metaPrimary)).slice(0, 3),
    metaHeadlines: section(text, 'META_HEADLINES').map((l) => trimAt(l, AD_LIMITS.metaHeadline)).slice(0, 5),
    metaDescriptions: section(text, 'META_DESCRIPTIONS').map((l) => trimAt(l, AD_LIMITS.metaDescription)).slice(0, 3),
    googleHeadlines: section(text, 'GOOGLE_HEADLINES').map((l) => trimAt(l, AD_LIMITS.googleHeadline)).slice(0, AD_LIMITS.googleHeadlinesMax),
    googleDescriptions: section(text, 'GOOGLE_DESCRIPTIONS').map((l) => trimAt(l, AD_LIMITS.googleDescription)).slice(0, AD_LIMITS.googleDescriptionsMax),
    keywords: section(text, 'KEYWORDS').map((l) => l.slice(0, 80)).slice(0, 12),
    negatives: section(text, 'NEGATIVES').map((l) => l.slice(0, 60)).slice(0, 8),
  };
}

/** Enough real assets to be worth shipping? (Below this, the expertise floor is more honest.) */
export function isLaunchReady(a: AdAssets): boolean {
  return a.metaPrimaries.length >= 2 && a.metaHeadlines.length >= 3
    && a.googleHeadlines.length >= 6 && a.googleDescriptions.length >= 2 && a.keywords.length >= 5;
}

/** Render the Meta ad artifact — paste-ready, with the tracking URL and the category reminder. */
export function metaAdDetail(a: AdAssets, landingUrl: string | null, complianceNote: string | null): string {
  const url = landingUrl ? `${landingUrl}${landingUrl.includes('?') ? '&' : '?'}src=meta-ads` : '[EDIT: landing URL]?src=meta-ads';
  return [
    'META (Facebook/Instagram) — paste into Ads Manager',
    '',
    'PRIMARY TEXT (test these against each other):',
    ...a.metaPrimaries.map((p, i) => `${i + 1}. ${p}`),
    '',
    `HEADLINES (≤${AD_LIMITS.metaHeadline} chars): ${a.metaHeadlines.join(' | ')}`,
    `DESCRIPTIONS (≤${AD_LIMITS.metaDescription} chars): ${a.metaDescriptions.join(' | ')}`,
    '',
    `FINAL URL (keep the src — it lands leads in YOUR ledger): ${url}`,
    'CREATIVE: your real vault photos — 1:1 and 4:5 crops; video 9:16 if the studio has one.',
    complianceNote ? `\nCOMPLIANCE: ${complianceNote}` : null,
  ].filter((l): l is string => l !== null).join('\n');
}

/** Render the Google Ads artifact — RSA-ready. */
export function googleAdDetail(a: AdAssets, landingUrl: string | null, complianceNote: string | null): string {
  const url = landingUrl ? `${landingUrl}${landingUrl.includes('?') ? '&' : '?'}src=google-ads` : '[EDIT: landing URL]?src=google-ads';
  return [
    'GOOGLE ADS (Responsive Search Ad) — paste into the RSA form',
    '',
    `HEADLINES (each ≤${AD_LIMITS.googleHeadline} chars — Google mixes them):`,
    ...a.googleHeadlines.map((h) => `- ${h}`),
    '',
    `DESCRIPTIONS (each ≤${AD_LIMITS.googleDescription} chars):`,
    ...a.googleDescriptions.map((d) => `- ${d}`),
    '',
    'KEYWORDS ([exact] "phrase" broad):',
    ...a.keywords.map((k) => `- ${k}`),
    '',
    'NEGATIVE KEYWORDS (stop wasted spend):',
    ...a.negatives.map((n) => `- ${n}`),
    '',
    `FINAL URL (keep the src — it lands leads in YOUR ledger): ${url}`,
    complianceNote ? `\nCOMPLIANCE: ${complianceNote}` : null,
  ].filter((l): l is string => l !== null).join('\n');
}

// ---------------------------------------------------------------------------
// Angle — grounded in the world's real research, not free-floating
// ---------------------------------------------------------------------------

export const ANGLE_SYSTEM = `You are Garvis synthesizing ONE sharp campaign angle for a business.
You are given the DNA and the business's OWN research findings (if any). Produce:
ANGLE (a single memorable line) · PREMISE (why this audience responds to it) · WHY IT WORKS (3
bullets, each tied to a real finding or DNA fact — cite the finding) · CAMPAIGN SHAPE (the sequence
of touches). If there are no research findings, say the angle is provisional and name the one scan
that would confirm it. Never invent market facts. Plain text.`;

/** Build the research-grounding block for the angle prompt from the world's research artifacts. */
export function researchContext(findings: { title: string; detail: string }[]): string {
  if (!findings.length) return 'RESEARCH FINDINGS: none on record yet — mark the angle provisional.';
  return `RESEARCH FINDINGS (ground the angle in these):\n${findings
    .map((f, i) => `[${i + 1}] ${f.title}: ${f.detail.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n')}`;
}

// ---------------------------------------------------------------------------
// 6. CREATIVE DEPTH — direction steering, the idea engine, the business plan
// ---------------------------------------------------------------------------
// The one-shot problem, fixed at the contract level: every regeneration can be STEERED (the
// owner's direction in their words) and is DIVERGENT BY DEFAULT (prior concepts are handed to
// the model as "do not repeat"). Ideas come in validated batches with a diversity gate — near-
// duplicates are collapsed so ten ideas are ten ideas, not one idea worn five ways. The business
// plan parser enforces SUBSTANCE per section (a thin plan is rejected and falls to the floor).

/** The steering block appended to producer prompts. '' when there's nothing to steer by. */
export function steerBlock(direction?: string, avoid?: string[]): string {
  const parts: string[] = [];
  if (direction?.trim()) parts.push(`DIRECTION FROM THE OWNER (follow it): ${direction.trim().slice(0, 300)}`);
  if (avoid?.length) {
    parts.push(`PRIOR WORK ALREADY MADE — do NOT repeat these concepts; take a genuinely different angle:\n${avoid.slice(0, 8).map((a) => `- ${a.replace(/\s+/g, ' ').slice(0, 120)}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

export const IDEAS_SYSTEM = `You are a senior creative director generating campaign ideas for ONE
specific small business. Rules: every idea must reference THIS business's actual offer, audience,
or locale (from the context) — an idea that could apply to any business is a failure. Each idea is
a different MECHANISM (different hook, channel, or audience entry point), not the same idea
rephrased. No generic filler ("post consistently", "engage your audience"). Format each as:
IDEA: <punchy title>
HOOK: <the one line that makes a stranger stop>
WHY: <why THIS business's audience responds — tie to a context fact>
FIRST STEP: <the concrete first action, doable this week>
Nothing else between blocks. Plain text.`;

export interface Idea { title: string; hook: string; why: string; firstStep: string }

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3));
function similar(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size) > 0.6;
}

/** Parse + de-duplicate ideas. Near-duplicate titles/hooks collapse (diversity gate); ideas
 *  missing any field are dropped. Tolerant: malformed text yields fewer ideas, never a throw. */
export function parseIdeas(text: string): Idea[] {
  const out: Idea[] = [];
  const blocks = text.split(/^IDEA:\s*/m).slice(1);
  for (const b of blocks) {
    const title = b.split('\n')[0]?.trim() ?? '';
    const hook = /^HOOK:\s*(.+)$/m.exec(b)?.[1]?.trim() ?? '';
    const why = /^WHY:\s*(.+)$/m.exec(b)?.[1]?.trim() ?? '';
    const firstStep = /^FIRST STEP:\s*(.+)$/m.exec(b)?.[1]?.trim() ?? '';
    if (!title || !hook || !why || !firstStep) continue;
    if (out.some((i) => similar(i.title, title) || similar(i.hook, hook))) continue; // diversity gate
    out.push({ title: title.slice(0, 120), hook: hook.slice(0, 200), why: why.slice(0, 300), firstStep: firstStep.slice(0, 300) });
  }
  return out;
}

export function ideasToDetail(ideas: Idea[], studioLabel: string): string {
  return ideas.map((i, n) =>
    `${n + 1}. ${i.title}\n   Hook: ${i.hook}\n   Why it fits: ${i.why}\n   First step: ${i.firstStep}\n   → Build it: press this studio's generator with the direction "${i.title}".`,
  ).join('\n\n') + `\n\n(${ideas.length} distinct ${studioLabel} ideas — press Ideas again with a direction to explore another vein.)`;
}

export const PLAN_SYSTEM = `You write an OPERATOR'S business plan for one specific small business —
a working document the owner runs the next 90 days from, not an investor deck. Ground every claim
in the provided context/research; for any number you cannot know (prices, budgets, capacity), write
[YOU FILL: what's needed] instead of inventing it. Use EXACTLY these section headers, each with
real substance (specific to THIS business, minimum several sentences):
== POSITIONING ==
== OFFER & PRICING ==
== TOP 3 CHANNEL PLAYS ==
== 90-DAY PLAN ==
== KPIS & WEEKLY SCORECARD ==
== RISKS & HONEST UNKNOWNS ==
Plain text. No markdown headers other than the == sections.`;

export const PLAN_SECTIONS = ['POSITIONING', 'OFFER & PRICING', 'TOP 3 CHANNEL PLAYS', '90-DAY PLAN', 'KPIS & WEEKLY SCORECARD', 'RISKS & HONEST UNKNOWNS'] as const;
const PLAN_MIN_SECTION_CHARS = 180; // substance gate — a one-liner section = a thin plan

/** Shared section gate: all headers present, each with real substance. `thin` names failures so
 *  callers reject honestly instead of shipping a thin document. */
function gateSections(text: string, sections: readonly string[], minChars: number): { ok: boolean; thin: string[] } {
  const thin: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const name = sections[i];
    const start = text.indexOf(`== ${name} ==`);
    if (start < 0) { thin.push(name); continue; }
    const next = i + 1 < sections.length ? text.indexOf(`== ${sections[i + 1]} ==`) : text.length;
    const body = text.slice(start + name.length + 6, next > start ? next : text.length).trim();
    if (body.length < minChars) thin.push(name);
  }
  return { ok: thin.length === 0, thin };
}

/** Validate a generated plan: all sections present, each with real substance. */
export function parsePlan(text: string): { ok: boolean; thin: string[] } {
  return gateSections(text, PLAN_SECTIONS, PLAN_MIN_SECTION_CHARS);
}

// ---------------------------------------------------------------------------
// FEATURE SPEC — the PRODUCT-work document (feature_lab studios). "I work for WealthCharts and
// want to create features" ends in one of these: a working spec a PM/engineer could pick up,
// not a vibe. Same anti-thin discipline as the business plan: named sections, substance gates,
// [YOU FILL] holes instead of invented facts about a platform Garvis hasn't seen.
// ---------------------------------------------------------------------------

export const SPEC_SYSTEM = `You write a FEATURE SPEC for one specific platform/product — a working
document a product person could hand to an engineer, not a pitch. Ground every claim in the
provided context/research about THIS platform and its users; for anything you cannot know (internal
architecture, existing metrics, team capacity), write [YOU FILL: what's needed] instead of
inventing it. Propose ONE feature (the direction given, or the strongest candidate from context)
and spec it. Use EXACTLY these section headers, each with real substance:
== THE PROBLEM ==
== WHO IT SERVES ==
== HOW IT WORKS (V1 SCOPE) ==
== DATA & DEPENDENCIES ==
== SUCCESS METRIC ==
== RISKS & OPEN QUESTIONS ==
V1 scope means the smallest shippable version — name what is deliberately OUT of v1.
Plain text. No markdown headers other than the == sections.`;

export const SPEC_SECTIONS = ['THE PROBLEM', 'WHO IT SERVES', 'HOW IT WORKS (V1 SCOPE)', 'DATA & DEPENDENCIES', 'SUCCESS METRIC', 'RISKS & OPEN QUESTIONS'] as const;
const SPEC_MIN_SECTION_CHARS = 140; // a spec section can be tighter than a plan's, but never a one-liner

/** Validate a generated feature spec — rejection names its thin sections. */
export function parseSpec(text: string): { ok: boolean; thin: string[] } {
  return gateSections(text, SPEC_SECTIONS, SPEC_MIN_SECTION_CHARS);
}
