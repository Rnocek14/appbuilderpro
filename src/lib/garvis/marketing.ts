// src/lib/garvis/marketing.ts
// Pure helpers for the Marketing Worker — Garvis's first DO-layer worker that produces real
// deliverables. Owns the per-stage prompts, the tolerant parsers, and (crucially) the VERIFIER:
// deterministic acceptance checks per asset. The research is unanimous that verification, not
// generation, is where autonomous systems fail — so the Verifier is first-class and code-enforced,
// like applyStrategicGuard. Orchestration (the chained model calls + persistence) lives in useMarketing.

import type { MarketingAssetKind } from '../../types';

export interface VerifyResult { ok: boolean; issues: string[]; warnings: string[] }

// ---------- kind-specific content shapes (stored as jsonb) ----------
export interface StrategyContent { positioning: string; audience: string; channels: string[]; key_messages: string[] }
export interface CalendarEntry { when: string; channel: string; theme: string }
export interface PostContent { platform: string; hook: string; body: string; cta: string; hashtags: string[] }
export interface EmailContent { subject: string; body: string; cta: string }
export interface LandingSection { heading: string; body: string }
export interface LandingContent { headline: string; subhead: string; sections: LandingSection[]; cta: string }

// ============================ prompts ============================

export const STRATEGY_SYSTEM = `You are Garvis's marketing strategist. Given a brief about a product or business, produce a tight,
HONEST go-to-market core: positioning, the specific target audience, the 2-4 channels that actually fit
this audience (not a generic list), the key messages, and a 2-week content calendar.

Ground everything in the brief. Do not invent traction, awards, or features not implied. If the brief is
thin, make reasonable, clearly-grounded assumptions rather than fabricating specifics.

Output EXACTLY ONE JSON object, no prose, no fences:
{
  "summary": "one sentence: the strategy in a line",
  "strategy": { "positioning": "...", "audience": "...", "channels": ["..."], "key_messages": ["...", "..."] },
  "calendar": [ { "when": "Week 1, Mon", "channel": "Instagram", "theme": "..." } ]
}`;

export const POSTS_SYSTEM = `You are Garvis's social copywriter. Using the strategy provided, write platform-aware social posts that
earn attention fast and drive the goal. Each post needs a scroll-stopping hook, a tight body, a single
clear CTA, and a few relevant hashtags. Match the channel's norms (e.g. keep X posts within ~280 chars).

Output EXACTLY ONE JSON object, no prose, no fences:
{ "posts": [ { "platform": "Instagram", "hook": "...", "body": "...", "cta": "...", "hashtags": ["#..."] } ] }`;

export const ASSETS_SYSTEM = `You are Garvis's conversion copywriter. Using the strategy provided, write (1) a launch email and (2)
landing-page copy. The email needs a compelling subject, a body that builds to one CTA. The landing page
needs a headline, a subhead, at least 3 sections (each a heading + body), and a single primary CTA.

Ground everything in the strategy/audience. Output EXACTLY ONE JSON object, no prose, no fences:
{
  "email": { "subject": "...", "body": "...", "cta": "..." },
  "landing": { "headline": "...", "subhead": "...", "sections": [ { "heading": "...", "body": "..." } ], "cta": "..." }
}`;

function ctx(subject: string, brief: string | null | undefined, extra?: string): string {
  return [
    `SUBJECT (what we're marketing): ${subject}`,
    brief ? `BRIEF / GOAL: ${brief}` : '',
    extra ? extra : '',
  ].filter(Boolean).join('\n');
}

export function buildStrategyUser(subject: string, brief: string | null | undefined, profile?: string | null): string {
  return [ctx(subject, brief, profile ? `WHAT IT IS (from Garvis's profile):\n${profile}` : ''), '', 'Return the single JSON object now.'].join('\n');
}

export function buildPostsUser(strategyJson: string, count = 5): string {
  return [`STRATEGY:\n${strategyJson}`, '', `Write ${count} posts spread across the chosen channels. Return the single JSON object now.`].join('\n');
}

export function buildAssetsUser(strategyJson: string): string {
  return [`STRATEGY:\n${strategyJson}`, '', 'Return the single JSON object now.'].join('\n');
}

// ============================ tolerant parse ============================

function extractJson<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    return JSON.parse(clean.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);

export interface ParsedStrategy { summary: string; strategy: StrategyContent; calendar: CalendarEntry[] }

export function parseStrategy(raw: string): ParsedStrategy | null {
  const o = extractJson<Record<string, unknown>>(raw);
  if (!o) return null;
  const s = (o.strategy ?? {}) as Record<string, unknown>;
  const cal = Array.isArray(o.calendar) ? (o.calendar as Record<string, unknown>[]) : [];
  return {
    summary: str(o.summary),
    strategy: { positioning: str(s.positioning), audience: str(s.audience), channels: strArr(s.channels), key_messages: strArr(s.key_messages) },
    calendar: cal.map((c) => ({ when: str(c.when), channel: str(c.channel), theme: str(c.theme) })).filter((c) => c.when || c.theme),
  };
}

export function parsePosts(raw: string): PostContent[] {
  const o = extractJson<Record<string, unknown>>(raw);
  const arr = o && Array.isArray(o.posts) ? (o.posts as Record<string, unknown>[]) : [];
  return arr
    .map((p) => ({ platform: str(p.platform) || 'social', hook: str(p.hook), body: str(p.body), cta: str(p.cta), hashtags: strArr(p.hashtags) }))
    .filter((p) => p.hook || p.body);
}

export interface ParsedAssets { email: EmailContent; landing: LandingContent }

export function parseAssets(raw: string): ParsedAssets | null {
  const o = extractJson<Record<string, unknown>>(raw);
  if (!o) return null;
  const e = (o.email ?? {}) as Record<string, unknown>;
  const l = (o.landing ?? {}) as Record<string, unknown>;
  const sections = Array.isArray(l.sections) ? (l.sections as Record<string, unknown>[]) : [];
  return {
    email: { subject: str(e.subject), body: str(e.body), cta: str(e.cta) },
    landing: {
      headline: str(l.headline), subhead: str(l.subhead), cta: str(l.cta),
      sections: sections.map((s) => ({ heading: str(s.heading), body: str(s.body) })).filter((s) => s.heading || s.body),
    },
  };
}

// ============================ the Verifier ============================

/**
 * Deterministic acceptance check per asset kind. `ok` gates publishing — a draft that fails
 * verification can't be approved-to-publish until fixed. issues = must-fix; warnings = advisory.
 */
export function verifyAsset(kind: MarketingAssetKind, content: Record<string, unknown>): VerifyResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const s = (k: string) => str(content[k]);

  if (kind === 'strategy') {
    if (!s('positioning')) issues.push('missing positioning');
    if (!s('audience')) issues.push('missing target audience');
    if (strArr(content.channels).length === 0) issues.push('no channels chosen');
    if (strArr(content.key_messages).length === 0) warnings.push('no key messages');
  } else if (kind === 'calendar') {
    const entries = Array.isArray(content.entries) ? (content.entries as Record<string, unknown>[]) : [];
    if (entries.length === 0) issues.push('calendar is empty');
    if (entries.some((e) => !str(e.theme))) warnings.push('some calendar slots have no theme');
  } else if (kind === 'social_post') {
    if (!s('hook')) issues.push('no hook (the scroll-stopper)');
    if (!s('body')) issues.push('empty body');
    if (!s('cta')) issues.push('no call to action');
    if (strArr(content.hashtags).length === 0) warnings.push('no hashtags');
    if (s('platform').toLowerCase() === 'x' && s('body').length > 280) warnings.push('body exceeds ~280 chars for X');
  } else if (kind === 'email') {
    if (!s('subject')) issues.push('no subject line');
    if (!s('body')) issues.push('empty body');
    if (!s('cta')) issues.push('no call to action');
    if (s('subject').length > 80) warnings.push('subject is long (>80 chars)');
  } else if (kind === 'landing_page') {
    if (!s('headline')) issues.push('no headline');
    if (!s('cta')) issues.push('no primary CTA');
    const sections = Array.isArray(content.sections) ? (content.sections as unknown[]) : [];
    if (sections.length < 2) issues.push('needs at least 2 sections');
    if (!s('subhead')) warnings.push('no subhead');
  }

  return { ok: issues.length === 0, issues, warnings };
}
