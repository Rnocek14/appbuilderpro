// src/lib/garvis/strategies.ts
// THE STRATEGIES CORE — pure (exercised by the adversarial fuzz suite, gauntletFuzz.verify.ts).
// SW9.1: parse and validate model-proposed strategies at the trust boundary. The one law is the
// GROUNDING GATE: a strategy may claim basis 'measured' ONLY when every evidence line it cites
// matches a real allowed fact verbatim (the evidenceMatch normalization — spacing/case only)
// and at least one survives; anything less is RELABELED 'heuristic' with the fake citations
// dropped. Hostile input of any shape returns [] — never a throw, never an off-list value.

import { normalizeCitation } from './evidenceMatch';

export type StrategyBasis = 'measured' | 'heuristic';
export type StrategyStatus = 'proposed' | 'adopted' | 'retired';
export const STRATEGY_STATUSES: readonly StrategyStatus[] = ['proposed', 'adopted', 'retired'];
export const MAX_STRATEGIES = 4;
export const MIN_STRATEGIES = 2;

export interface StrategyDraft {
  title: string;
  rationale: string;
  basis: StrategyBasis;
  /** Verbatim fact lines the strategy stands on — VERIFIED ones only ever survive parsing. */
  evidence: string[];
}

/** Read a stored status defensively — an off-list value renders as 'proposed', never leaks. */
export function normalizeStatus(s: unknown): StrategyStatus {
  return (STRATEGY_STATUSES as readonly string[]).includes(s as string) ? (s as StrategyStatus) : 'proposed';
}

/** Parse a model's strategy proposals against the ONLY facts it was shown. Accepts a raw string
 *  (fences tolerated) or already-parsed JSON. Hostile anything → []. */
export function parseStrategies(raw: unknown, allowedEvidence: string[]): StrategyDraft[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')); }
    catch { return []; }
  }
  const arr = Array.isArray(parsed) ? parsed : (parsed as { strategies?: unknown } | null)?.strategies;
  if (!Array.isArray(arr)) return [];

  const allowed = new Map(allowedEvidence.map((f) => [normalizeCitation(f), f]));
  const out: StrategyDraft[] = [];
  for (const item of arr) {
    if (out.length >= MAX_STRATEGIES) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 100) : '';
    const rationale = typeof o.rationale === 'string' ? o.rationale.trim().slice(0, 600) : '';
    if (!title || !rationale) continue;
    const cited = Array.isArray(o.evidence) ? o.evidence.filter((e): e is string => typeof e === 'string') : [];
    // THE GROUNDING GATE: only citations that match the allowed facts verbatim survive; a
    // 'measured' claim with any dropped citation (or none at all) is relabeled heuristic.
    const verified = [...new Set(cited
      .map((e) => allowed.get(normalizeCitation(e)))
      .filter((f): f is string => !!f))];
    const claimedMeasured = o.basis === 'measured';
    const basis: StrategyBasis = claimedMeasured && verified.length > 0 && verified.length === new Set(cited.map(normalizeCitation)).size
      ? 'measured'
      : 'heuristic';
    out.push({ title, rationale, basis, evidence: verified });
  }
  return out;
}
