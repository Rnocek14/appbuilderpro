// src/lib/garvis/profiles.ts
// Pure, supabase-free helpers for Garvis app-intelligence profiles. Split out (like objective.ts /
// knowledge.ts) so the prompt-build, tolerant-parse, digest, and staleness logic are unit-testable
// without a DB or a browser. The orchestration (fetch repo → rawComplete → upsert) lives in the
// useAppProfiles hook; context injection lives in index.ts.
//
// A profile is a GENERATED FACT about a product (what it is, where it stands, what's next) derived
// from its repo — NOT a durable judgment, so it is regenerable and not approval-gated.

import type { GarvisAppProfile } from '../../types';

/** Everything the generator reads about one app. Kept structural (no github.ts import) so this stays pure. */
export interface ProfileGenInput {
  name: string;
  slug?: string | null;
  storedStage?: string | null;
  storedDescription?: string | null;
  deployUrl?: string | null;
  repo?: {
    description?: string | null;
    homepage?: string | null;
    language?: string | null;
    stars?: number;
    openIssues?: number;
    archived?: boolean;
    pushedAt?: string | null;
    recentCommits?: { message: string; date: string | null }[];
    topIssues?: { title: string; comments: number }[];
  } | null;
  readme?: string | null;
}

/** The fields the model returns, normalized. Mirrors the writable columns of garvis_app_profiles. */
export interface ParsedProfile {
  purpose: string | null;
  audience: string | null;
  business_model: string | null;
  current_state: string | null;
  blocker: string | null;
  next_milestone: string | null;
  stage_assessment: string | null;
  confidence: number | null;
}

export const PROFILE_SYSTEM = `You are Garvis, profiling one product in a solo founder's portfolio from its code repository so
your future recommendations are grounded in what the product ACTUALLY is — not just its recent commits.

You are given the repo's metadata, its README, recent commit messages, and open issues. From ONLY
that evidence, infer a tight, honest profile. This is read-only analysis; you change nothing.

CALIBRATION (the founder relies on this — be trustworthy, not flattering):
- Ground every field in the evidence provided. If the evidence is thin, say so in that field rather
  than inventing a polished story. "Unclear from the repo" is a valid, useful answer.
- Never state a bare completeness percentage (false precision). Describe state against concrete bars:
  what exists, what's stubbed, what's missing.
- Do NOT assume commercial intent. It may be a learning project, a side project, or a real product —
  frame business_model accordingly (including "none — looks like a learning/side project").
- The single next_milestone must be the most useful, concrete next step given where it stands.

OUTPUT: respond with EXACTLY ONE JSON object and nothing else (no prose, no markdown fences):
{
  "purpose": "one or two sentences: what this product does",
  "audience": "who it serves",
  "business_model": "how it could make money, or 'none — learning/side project'",
  "current_state": "honest read of where it actually stands (what works vs stubbed vs missing)",
  "blocker": "the single biggest thing blocking progress right now",
  "next_milestone": "the single most useful concrete next step",
  "stage_assessment": "your read of its real stage (idea | building | launched | growing | paused | dormant) and why",
  "confidence": 0.0
}
Set confidence (0..1) to your honest read of how reliable this profile is given the evidence depth.`;

function fmtCommits(commits?: { message: string; date: string | null }[]): string {
  if (!commits || commits.length === 0) return '(none read)';
  return commits.map((c) => `- ${c.message}${c.date ? ` (${c.date.slice(0, 10)})` : ''}`).join('\n');
}

function fmtIssues(issues?: { title: string; comments: number }[]): string {
  if (!issues || issues.length === 0) return '(none open, or none read)';
  return issues.map((i) => `- ${i.title}${i.comments ? ` (${i.comments} comments)` : ''}`).join('\n');
}

/** Build the user prompt from the gathered repo evidence. */
export function buildProfileUser(input: ProfileGenInput): string {
  const r = input.repo;
  const lines = [
    `PRODUCT: ${input.name}${input.slug ? ` (${input.slug})` : ''}`,
    input.storedStage ? `STORED STAGE (may be wrong — assess it yourself): ${input.storedStage}` : '',
    input.deployUrl || r?.homepage ? `DEPLOY URL: ${input.deployUrl || r?.homepage}` : 'DEPLOY URL: none (not deployed)',
    '',
    'REPO METADATA:',
    `- description: ${r?.description ?? input.storedDescription ?? '(none)'}`,
    `- primary language: ${r?.language ?? '(unknown)'}`,
    `- archived: ${r?.archived ? 'yes' : 'no'}`,
    r?.pushedAt ? `- last pushed: ${r.pushedAt.slice(0, 10)}` : '- last pushed: (unknown)',
    typeof r?.openIssues === 'number' ? `- open issues: ${r.openIssues}` : '',
    typeof r?.stars === 'number' ? `- stars: ${r.stars}` : '',
    '',
    'RECENT COMMITS:',
    fmtCommits(r?.recentCommits),
    '',
    'OPEN ISSUES:',
    fmtIssues(r?.topIssues),
    '',
    'README:',
    input.readme ? input.readme : '(no README found)',
    '',
    'Return the single JSON profile object now.',
  ];
  return lines.filter((l) => l !== '').join('\n');
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

/** Tolerant JSON extract + normalize (mirrors directBrain's extractJson). Never throws — fail-soft. */
export function parseProfileResponse(rawText: string): ParsedProfile {
  let obj: Record<string, unknown> = {};
  try {
    const clean = rawText.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) obj = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    /* fall through to empty profile */
  }
  const confRaw = obj.confidence;
  const confidence = typeof confRaw === 'number' && Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : null;
  return {
    purpose: str(obj.purpose),
    audience: str(obj.audience),
    business_model: str(obj.business_model),
    current_state: str(obj.current_state),
    blocker: str(obj.blocker),
    next_milestone: str(obj.next_milestone),
    stage_assessment: str(obj.stage_assessment),
    confidence,
  };
}

/** True when a profile has no usable content (all fields empty) — used to skip persisting/injecting it. */
export function isProfileEmpty(p: ParsedProfile | GarvisAppProfile): boolean {
  return !p.purpose && !p.audience && !p.business_model && !p.current_state && !p.blocker && !p.next_milestone && !p.stage_assessment;
}

/** A profile is stale once it's older than maxAgeDays. nowMs is injectable for deterministic tests. */
export function isProfileStale(generatedAt: string | null | undefined, maxAgeDays = 14, nowMs = Date.now()): boolean {
  if (!generatedAt) return true;
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * The context digest: a compact block describing each profiled product, prepended to a run's input so
 * the brain reasons over WHAT EACH PRODUCT IS, not just its repo activity. Profiles with no content are
 * skipped. Returns '' when there is nothing to inject.
 */
export function buildProfilesDigest(profiles: GarvisAppProfile[], appNameById?: Record<string, string>): string {
  const usable = profiles.filter((p) => !isProfileEmpty(p));
  if (usable.length === 0) return '';
  const blocks = usable.map((p) => {
    const name = appNameById?.[p.app_id] ?? 'app';
    const parts = [
      p.purpose ? `purpose: ${p.purpose}` : '',
      p.audience ? `audience: ${p.audience}` : '',
      p.business_model ? `business model: ${p.business_model}` : '',
      p.current_state ? `state: ${p.current_state}` : '',
      p.blocker ? `blocker: ${p.blocker}` : '',
      p.next_milestone ? `next milestone: ${p.next_milestone}` : '',
    ].filter(Boolean);
    return `### ${name}\n${parts.join('\n')}`;
  });
  return `APP PROFILES (what each product is + where it stands — your grounding for recommendations):\n${blocks.join('\n\n')}`;
}
