// src/lib/garvis/marketIntel.ts
// G4 — MARKET INTELLIGENCE, pure core (verified by marketIntel.verify.ts).
// "Who is likely to benefit from this business?" is a REASONING problem before a search problem:
// the research plan derives DETERMINISTICALLY from the World DNA (ideal customers × offerings ×
// locale), searches run read-only through existing rails, and fit is an evidence-labeled verdict
// (strong/possible/weak + a grounded reason) — never an invented score. Contacting anyone stays
// behind contacts + the approval spine.

import type { WorldDNA, BusinessContext } from './genesis';

export interface ScanCategory { name: string; queries: string[] }
export interface ResearchPlan { categories: ScanCategory[]; trendQuestions: string[] }

/** The plan is a pure derivation of the DNA — same DNA, same plan, no model call needed. */
export function researchPlanFor(dna: WorldDNA | null, ctx: BusinessContext | null): ResearchPlan {
  const offerings = ctx?.offerings?.length ? ctx.offerings : dna?.businessType ? [dna.businessType] : [];
  const offer = offerings.slice(0, 2).join(' and ') || 'this business';
  const locale = ctx?.locale ? ` ${ctx.locale}` : '';
  const categories: ScanCategory[] = (dna?.idealCustomers ?? []).slice(0, 6).map((cust) => ({
    name: cust,
    queries: [
      `${cust}${locale} directory`,
      `${cust}${locale} ${offer}`,
    ].map((q) => q.replace(/\s+/g, ' ').trim()),
  }));
  const trendQuestions = [
    dna?.businessType ? `What is changing in the ${dna.businessType} market right now?` : null,
    offerings[0] ? `Who is buying ${offerings[0]} this year, and why?` : null,
  ].filter((q): q is string => !!q);
  return { categories, trendQuestions };
}

export interface ProspectCandidate { name: string; url: string | null; snippet: string }

/** Normalize Serper organic results into candidates — dedup by link, cap, tolerate garbage. */
export function parseSerperOrganic(data: unknown, cap = 8): ProspectCandidate[] {
  const organic = (data as { organic?: unknown[] } | null)?.organic;
  if (!Array.isArray(organic)) return [];
  const seen = new Set<string>();
  const out: ProspectCandidate[] = [];
  for (const r of organic as { title?: string; link?: string; snippet?: string }[]) {
    const name = (r?.title ?? '').trim().slice(0, 160);
    const url = (r?.link ?? '').trim().slice(0, 500) || null;
    if (!name) continue;
    const key = url ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, url, snippet: (r?.snippet ?? '').trim().slice(0, 400) });
    if (out.length >= cap) break;
  }
  return out;
}

export const FIT_SYSTEM = `You judge whether found businesses plausibly need what ONE specific
business sells. You are given that business's DNA and a list of candidates with the exact search
snippets they were found with. Return STRICT JSON:
{"fits":[{"name":"<candidate name verbatim>","fit":"strong|possible|weak",
  "reason":"one sentence grounded ONLY in the snippet + the DNA — cite what in the snippet suggests it"}]}
HARD RULES: judge every candidate; never invent facts about a candidate beyond its snippet;
when the snippet is too thin to judge, fit is "weak" with the reason "snippet too thin to judge".
No markdown fences. JSON only.`;

export type FitLabel = 'strong' | 'possible' | 'weak' | 'unknown';
export interface FitVerdict { name: string; fit: FitLabel; reason: string }

export function parseFits(raw: string): FitVerdict[] {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
    if (start === -1 || end <= start) return [];
    const p = JSON.parse(clean.slice(start, end + 1)) as { fits?: unknown[] };
    return (Array.isArray(p.fits) ? p.fits : [])
      .map((f) => {
        const r = f as Record<string, unknown>;
        const fit = ['strong', 'possible', 'weak'].includes(String(r?.fit)) ? String(r.fit) as FitLabel : 'unknown';
        return { name: String(r?.name ?? '').slice(0, 160), fit, reason: String(r?.reason ?? '').trim().slice(0, 300) };
      })
      .filter((f) => f.name && (f.fit === 'unknown' || f.reason)); // a labeled fit without a reason is dropped
  } catch { return []; }
}
