// src/lib/preview/strategy.ts
// The BUSINESS INTELLIGENCE layer of the preview engine — pure types + normalizers for the three
// intelligence artifacts that sit between a raw Business Profile and a website that SELLS:
//
//   WebsiteStrategy — the marketing brief (who buys, why us, what the hero must say) that turns
//                     spec generation from "fill in fields" into "execute a strategy".
//   AuditReport     — the before/after value framing shown to the owner ("your site scores 38/100,
//                     here's what that costs you") — the thing that makes the preview feel like a
//                     gift instead of an ad.
//   OwnerCritique   — the owner-simulation review ("would I buy this? does it feel like MY
//                     business?") that drives one automatic refinement pass.
//
// All model output passes through the tolerant normalizers here; deterministic fallbacks mean the
// pipeline never dead-ends. No supabase, no model calls — unit-tested in spec.verify.ts.

import type { BusinessProfile } from './spec';

// ---------------------------------------------------------------------------
// Website strategy — the marketing brief
// ---------------------------------------------------------------------------

export interface WebsiteStrategy {
  positioning: string;        // one sentence: what this business IS to its ideal customer
  ideal_customer: string;     // who actually buys, in plain words
  tone: string;               // voice direction for all copy
  hero_strategy: string;      // what the hero must communicate in 3 seconds
  differentiators: string[];  // provable reasons to pick THIS business (grounded in profile)
  trust_builders: string[];   // proof elements to surface (reviews, years, guarantees)
  objections: string[];       // what makes a visitor hesitate — copy must pre-empt these
  offer_strategy: string;     // the CTA logic (free quote? book online? call now?)
  photo_strategy: string;     // how to use the available photos
  color_rationale: string;    // why this palette fits the trade + brand personality
  local_keywords: string[];   // SEO phrases to weave in naturally
}

const strArr = (v: unknown, cap = 8): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, cap) : []);
const str = (v: unknown, dflt: string): string => (typeof v === 'string' && v.trim() ? v.trim() : dflt);

/** Deterministic strategy from the profile alone — the no-model floor and hole-patcher. */
export function fallbackStrategy(profile: BusinessProfile): WebsiteStrategy {
  const loc = profile.location?.split(',')[0] ?? 'the local area';
  return {
    positioning: `${profile.business_name} is the dependable local choice for ${profile.industry.toLowerCase()} in ${loc}.`,
    ideal_customer: `Homeowners and locals in ${loc} who need ${profile.services[0]?.toLowerCase() ?? profile.industry.toLowerCase()} done right the first time.`,
    tone: profile.brand_style ?? 'direct, warm, professional',
    hero_strategy: `Lead with the outcome of ${profile.services[0]?.toLowerCase() ?? 'the core service'} and the strongest available proof; one unmissable call to action.`,
    differentiators: [
      profile.google_rating ? `${profile.google_rating.toFixed(1)}★ Google rating across ${profile.review_count ?? 'many'} reviews` : 'Locally owned and operated',
      ...(profile.description ? [profile.description] : []),
    ].slice(0, 4),
    trust_builders: [
      ...(profile.google_rating ? [`Google rating badge (${profile.google_rating.toFixed(1)}★)`] : []),
      ...(profile.review_snippets?.length ? ['Verbatim customer reviews'] : []),
      'Licensed & insured line', 'Free, no-obligation estimates',
    ].slice(0, 4),
    objections: ['Is this company legit?', 'Will they overcharge me?', 'How fast can they come out?'],
    offer_strategy: 'Free quote request form + click-to-call — remove every step between interest and contact.',
    photo_strategy: profile.photos.length ? 'Real photos as hero + proof of work; no stock imagery.' : 'No photos available — lead with color, type, and proof instead.',
    color_rationale: 'Palette follows the industry recipe defaults.',
    local_keywords: profile.seo_keywords?.slice(0, 8) ?? [],
  };
}

/** Coerce a model-produced strategy into a complete one (fallback patches every hole). */
export function normalizeStrategy(raw: unknown, profile: BusinessProfile): WebsiteStrategy {
  const f = fallbackStrategy(profile);
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    positioning: str(r.positioning, f.positioning),
    ideal_customer: str(r.ideal_customer, f.ideal_customer),
    tone: str(r.tone, f.tone),
    hero_strategy: str(r.hero_strategy, f.hero_strategy),
    differentiators: strArr(r.differentiators).length ? strArr(r.differentiators, 5) : f.differentiators,
    trust_builders: strArr(r.trust_builders).length ? strArr(r.trust_builders, 5) : f.trust_builders,
    objections: strArr(r.objections).length ? strArr(r.objections, 5) : f.objections,
    offer_strategy: str(r.offer_strategy, f.offer_strategy),
    photo_strategy: str(r.photo_strategy, f.photo_strategy),
    color_rationale: str(r.color_rationale, f.color_rationale),
    local_keywords: strArr(r.local_keywords, 10).length ? strArr(r.local_keywords, 10) : f.local_keywords,
  };
}

// ---------------------------------------------------------------------------
// Audit report — the value framing that makes owners feel the gap
// ---------------------------------------------------------------------------

export interface AuditProblem { issue: string; impact: string }

export interface AuditReport {
  score: number;          // 0-100 (their CURRENT site)
  grade: string;          // A-F
  headline: string;       // one plain-english sentence about what the score means for THEM
  problems: AuditProblem[];
  gains: string[];        // what the redesign delivers, in owner language (leads, not tech)
  summary: string;        // 2-3 sentence wrap-up, honest and non-hypey
}

export function gradeFor(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';
}

const GENERIC_IMPACT: Record<string, string> = {
  mobile: 'Over half of local searches happen on phones — a broken mobile layout sends them to a competitor.',
  slow: 'Every extra second of load time measurably drops the share of visitors who stay.',
  seo: 'Without basic SEO, Google shows competitors for searches that should find you.',
  form: 'No quote/contact form means every after-hours visitor is a lost lead.',
  ssl: 'Browsers mark non-HTTPS sites "Not secure" — an instant trust killer.',
  design: 'An outdated design reads as an inactive business, even when the work is excellent.',
};

function impactFor(issue: string): string {
  const k = issue.toLowerCase();
  for (const [key, impact] of Object.entries(GENERIC_IMPACT)) if (k.includes(key)) return impact;
  return 'Costs credibility with visitors comparing you against competitors.';
}

/** Deterministic audit from the profile's observed issues + score. */
export function fallbackAudit(profile: BusinessProfile): AuditReport {
  const score = Math.max(0, Math.min(100, profile.current_website_score ?? (profile.website ? 45 : 15)));
  const issues = profile.issues?.length ? profile.issues : (profile.website ? ['outdated design'] : ['no website found']);
  return {
    score,
    grade: gradeFor(score),
    headline: profile.website
      ? `${profile.business_name}'s current website scores ${score}/100 — likely losing leads to better-presented competitors.`
      : `${profile.business_name} has no website — invisible to everyone searching online right now.`,
    problems: issues.slice(0, 6).map((issue) => ({ issue, impact: impactFor(issue) })),
    gains: [
      'A modern, mobile-first site that loads fast on any phone',
      'A quote/contact path on every screen — visitors become leads',
      'Your real reviews and photos doing the selling',
      'Local SEO foundations so nearby searches find you',
    ],
    summary: `The work behind ${profile.business_name} clearly earns trust — the website just isn't showing it. The redesign puts your proof, services, and a clear next step in front of every visitor.`,
  };
}

export function normalizeAudit(raw: unknown, profile: BusinessProfile): AuditReport {
  const f = fallbackAudit(profile);
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const score = typeof r.score === 'number' ? Math.max(0, Math.min(100, Math.round(r.score))) : f.score;
  const problems = (Array.isArray(r.problems) ? r.problems : [])
    .map((p) => {
      const o = p as Record<string, unknown>;
      const issue = str(o?.issue, '');
      return issue ? { issue, impact: str(o.impact, impactFor(issue)) } : null;
    })
    .filter((p): p is AuditProblem => p !== null)
    .slice(0, 6);
  return {
    score,
    grade: gradeFor(score),
    headline: str(r.headline, f.headline),
    problems: problems.length ? problems : f.problems,
    gains: strArr(r.gains, 5).length ? strArr(r.gains, 5) : f.gains,
    summary: str(r.summary, f.summary),
  };
}

// ---------------------------------------------------------------------------
// Owner critique — the buy-test that drives the refinement pass
// ---------------------------------------------------------------------------

export interface CritiqueIssue { section: string; problem: string; fix: string }

export interface OwnerCritique {
  would_buy: boolean;
  feels_like_my_business: number; // 1-10
  weakest_part: string;
  issues: CritiqueIssue[];
}

export function normalizeCritique(raw: unknown): OwnerCritique {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const issues = (Array.isArray(r.issues) ? r.issues : [])
    .map((p) => {
      const o = p as Record<string, unknown>;
      const problem = str(o?.problem, '');
      return problem ? { section: str(o.section, 'general'), problem, fix: str(o.fix, '') } : null;
    })
    .filter((p): p is CritiqueIssue => p !== null)
    .slice(0, 8);
  const score = typeof r.feels_like_my_business === 'number' ? Math.max(1, Math.min(10, Math.round(r.feels_like_my_business))) : 7;
  return {
    would_buy: r.would_buy !== false,
    feels_like_my_business: score,
    weakest_part: str(r.weakest_part, ''),
    issues,
  };
}

/** Should the refine pass run? Only when the simulated owner found real problems — a clean
 *  critique shouldn't burn a second generation. (The design-aware critique finds two nits on
 *  nearly every draft — the 10-site live batch refined 10/10 at the old ≥2 threshold, doubling
 *  cost for marginal gains. Refine now means: wouldn't buy, weak identity, or a real pile.) */
export function critiqueWarrantsRefine(c: OwnerCritique): boolean {
  return !c.would_buy || c.feels_like_my_business <= 6 || c.issues.length >= 4;
}
