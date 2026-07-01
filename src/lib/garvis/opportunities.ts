// src/lib/garvis/opportunities.ts
// Pure helpers for Opportunity Detection — Garvis's proactive, cross-app brain. Given a digest of the
// WHOLE portfolio (every app + its profile/strategy/health), it surfaces opportunities the founder
// didn't ask for: cross-app synergies, clone/expansion plays, overlaps to consolidate, risks, quick
// wins, positioning gaps. Pure prompt + tolerant parse + dedupe; the data-gather + persist live in the hook.

import type { OpportunityType } from '../../types';

const TYPES = new Set<OpportunityType>(['synergy', 'expansion', 'consolidation', 'risk', 'quick_win', 'positioning']);

export interface DetectedOpportunity {
  title: string;
  type: OpportunityType;
  rationale: string;
  suggested_move: string;
  related_apps: string[];
  confidence: number | null;
}

export const OPPORTUNITY_SYSTEM = `You are Garvis, a solo founder's chief of staff, doing PROACTIVE portfolio analysis. The founder did not
ask a question — your job is to NOTICE things worth their attention by reasoning over the whole portfolio
as a SYSTEM, not a list of separate apps.

Look specifically for:
- SYNERGY: one app's output/audience/tech could feed another (e.g. a research app's content feeding another's marketing).
- EXPANSION: a working pattern that could be cloned or scaled (e.g. a hyperlocal app cloned to many cities; a niche widened).
- CONSOLIDATION: multiple apps solving overlapping problems that should merge or be cut.
- RISK: something quietly decaying — a core app gone dark, a dependency, a strategic asset stalling.
- QUICK_WIN: a small, high-leverage move available right now.
- POSITIONING: an unclaimed angle or differentiation across the portfolio.

RULES:
- Ground every opportunity in the actual portfolio data given. Cite the apps it involves in related_apps.
- Quality over quantity — surface the 3-6 SHARPEST opportunities, not a long list. If little is there, say so with fewer.
- Be honest, not hypey. No invented metrics or apps. Each needs a concrete suggested_move the founder could act on.
- Cross-app insights (involving 2+ apps) are the most valuable — prioritize them.

OUTPUT exactly one JSON object, no prose, no fences:
{
  "opportunities": [
    { "title": "short headline", "type": "synergy|expansion|consolidation|risk|quick_win|positioning",
      "rationale": "the grounded why, citing apps", "suggested_move": "the concrete next action",
      "related_apps": ["App A", "App B"], "confidence": 0.0 }
  ]
}`;

export function buildOpportunityUser(portfolioDigest: string): string {
  return [
    'PORTFOLIO (reason over this as a system):',
    portfolioDigest || '(no apps)',
    '',
    'Surface the sharpest opportunities now. Return the single JSON object.',
  ].join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    return JSON.parse(clean.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function parseOpportunities(raw: string): DetectedOpportunity[] {
  const o = extractJson(raw);
  const arr = o && Array.isArray(o.opportunities) ? (o.opportunities as Record<string, unknown>[]) : [];
  const out: DetectedOpportunity[] = [];
  for (const x of arr) {
    const title = str(x.title);
    const rationale = str(x.rationale);
    if (!title || !rationale) continue;
    const type = (TYPES.has(x.type as OpportunityType) ? x.type : 'synergy') as OpportunityType;
    const conf = typeof x.confidence === 'number' && Number.isFinite(x.confidence) ? Math.max(0, Math.min(1, x.confidence)) : null;
    const related = Array.isArray(x.related_apps) ? x.related_apps.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean) : [];
    out.push({ title, type, rationale, suggested_move: str(x.suggested_move), related_apps: related, confidence: conf });
  }
  return out;
}

/** Normalize a title for dedupe so a re-scan doesn't re-surface the same opportunity. */
export function oppKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Keep only opportunities whose normalized title isn't already known (existing non-dismissed set). */
export function dedupe(found: DetectedOpportunity[], knownKeys: Set<string>): DetectedOpportunity[] {
  const seen = new Set(knownKeys);
  const fresh: DetectedOpportunity[] = [];
  for (const o of found) {
    const k = oppKey(o.title);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(o);
  }
  return fresh;
}
