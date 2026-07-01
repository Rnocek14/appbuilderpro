// src/lib/garvis/knowledge.ts
// Pure, supabase-free helpers for the Garvis knowledge ("Learn") layer. Split out so the approval
// gate and stub-honesty guarantees are unit-testable without a DB (same pattern as qaCheck.ts).
//
// Two invariants live here and are enforced by knowledge.verify.ts:
//  1. Only APPROVED knowledge ever enters Garvis's reasoning memory (selectApproved / buildKnowledgeDigest).
//  2. A generated short is ALWAYS marked script-only (normalizeShortScript) — the model cannot lie.

import type { GarvisKnowledge } from '../../types';

/** The approval gate, in pure form: only approved rows are part of Garvis's memory. */
export function selectApproved(rows: GarvisKnowledge[]): GarvisKnowledge[] {
  return rows.filter((r) => r.status === 'approved');
}

/**
 * Compact, model-readable digest of APPROVED knowledge for injection into a run's context. Filters to
 * approved internally (defense-in-depth) so a caller can hand it raw rows. Returns '' when there is
 * nothing approved, so callers can skip injection cleanly.
 */
export function buildKnowledgeDigest(rows: GarvisKnowledge[], max = 12): string {
  const approved = selectApproved(rows).slice(0, max);
  if (approved.length === 0) return '';
  const lines = approved.map((r) => {
    const conf = typeof r.confidence === 'number' ? ` (confidence ${r.confidence.toFixed(2)})` : '';
    return `- [${r.kind}] ${r.title}: ${r.body}${conf}`;
  });
  return `APPROVED LESSONS & DECISIONS (your accumulated, human-approved knowledge — weigh these):\n${lines.join('\n')}`;
}

// ---- generate_short_script contract ----

export interface ShortScriptInput {
  topic: string;
  audience?: string;
  goal?: string;
  source_material?: string;
  tone?: string;
  platform?: string;
  length?: string;
}

/**
 * A short SCRIPT — never a rendered video. `fidelity` and `required_approval` are part of the contract
 * so downstream code (and the brain) can never mistake this for a finished/published asset.
 */
export interface ShortScriptResult {
  hook: string;
  script: string;
  caption: string;
  cta: string;
  visual_beats: string[];
  confidence: number | null;
  fidelity: 'script_only';
  required_approval: true;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Coerce arbitrary model output into the ShortScriptResult contract. Stub-honesty is enforced here,
 * not trusted from the model: `fidelity` and `required_approval` are HARD-SET regardless of input, so
 * even if the model claims it produced a full video, the result says script-only.
 */
export function normalizeShortScript(raw: unknown): ShortScriptResult {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const beats = Array.isArray(o.visual_beats) ? o.visual_beats.map((b) => str(b)).filter(Boolean) : [];
  const conf = typeof o.confidence === 'number' ? o.confidence : null;
  return {
    hook: str(o.hook),
    script: str(o.script),
    caption: str(o.caption),
    cta: str(o.cta),
    visual_beats: beats,
    confidence: conf,
    fidelity: 'script_only', // never trust the model on this
    required_approval: true,
  };
}
