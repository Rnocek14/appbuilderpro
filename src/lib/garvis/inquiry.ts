// src/lib/garvis/inquiry.ts
// THE DECISION LABORATORY — pure core (no LLM, no Supabase; verified by inquiry.verify.ts).
//
// Two instruments the Exploration Lab points at ideas:
//   COMPARE — two nodes side by side: claims, assumptions, strengths, problems — then the parts a
//     static table can't give: where they AGREE, where they CONFLICT, which assumptions the whole
//     disagreement HINGES on, and what evidence would DISCRIMINATE between them.
//   THEORY SCAFFOLD — turn "I think X" into a structured theory: claim, definitions, assumptions,
//     related work, supporting/contradicting observations, testable predictions — and the
//     non-negotiable heart of it, FALSIFIERS: what observation would prove this wrong. A scaffold
//     without falsifiers is rejected BY NAME. Agreement from the AI is not evidence; the
//     falsification question is what keeps the Lab from becoming an echo chamber.
//
// Both parsers are substance-gated (thin output → named gaps, never silently accepted) and both
// results become artifacts on the exact branch that spawned them — plus, for comparisons, a typed
// edge recording the discovered relationship on the map itself.

import { slugify, type Artifact, type EdgeType } from './clustering';

// ---------------------------------------------------------------------------
// COMPARE
// ---------------------------------------------------------------------------

export interface CompareSide {
  claim: string;
  assumptions: string[];
  strengths: string[];
  problems: string[];
}

export type CompareVerdict = 'contradicts' | 'complementary' | 'overlapping';

export interface Comparison {
  a: CompareSide;
  b: CompareSide;
  agree: string[];
  conflict: string[];
  hinges: string[];         // the assumptions the disagreement actually turns on
  discriminators: string[]; // what evidence/observation would tell them apart
  verdict: CompareVerdict;
  readout: string;          // 2-3 sentences of honest judgment, fact separated from interpretation
}

export const COMPARE_SYSTEM = `You run a decision laboratory. Given two ideas/theories/scenarios (A and B)
from someone's exploration, compare them HONESTLY — the goal is to sharpen a decision, not to write
an encyclopedia entry.

Rules of the bench:
- Separate fact from interpretation. If real evidence exists, name it; if it doesn't, say "no direct
  evidence" — NEVER invent studies, observations, or consensus.
- The interesting part is not the table — it is where they AGREE, where they CONFLICT, which
  assumptions the disagreement HINGES on, and what evidence would DISCRIMINATE between them.
- "discriminators" must be observations someone could actually look for, not restatements of the conflict.
- verdict: "contradicts" (both cannot be right), "complementary" (they answer different parts),
  "overlapping" (mostly the same idea in different clothes).
- readout: 2-3 sentences of straight judgment a smart friend would give.

Output EXACTLY ONE JSON object, no prose, no fences:
{"a":{"claim":"…","assumptions":["…"],"strengths":["…"],"problems":["…"]},
 "b":{"claim":"…","assumptions":["…"],"strengths":["…"],"problems":["…"]},
 "agree":["…"],"conflict":["…"],"hinges":["…"],"discriminators":["…"],
 "verdict":"contradicts|complementary|overlapping","readout":"…"}`;

export function buildCompareUser(
  a: { title: string; summary?: string; detail?: string },
  b: { title: string; summary?: string; detail?: string },
  worldTitle = '',
): string {
  const side = (label: string, s: { title: string; summary?: string; detail?: string }) => [
    `${label}: ${s.title}`,
    s.summary ? `summary: ${s.summary}` : '',
    s.detail ? `notes: ${s.detail.slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n');
  return [
    worldTitle ? `EXPLORATION: ${worldTitle}` : '',
    side('A', a),
    '',
    side('B', b),
    '',
    'Compare them now. Return the single JSON object.',
  ].filter(Boolean).join('\n');
}

const strs = (v: unknown, cap = 6): string[] =>
  Array.isArray(v) ? (v.filter((x) => typeof x === 'string' && x.trim()) as string[]).map((s) => s.trim()).slice(0, cap) : [];

function parseSide(v: unknown): CompareSide {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    claim: typeof o.claim === 'string' ? o.claim.trim() : '',
    assumptions: strs(o.assumptions),
    strengths: strs(o.strengths),
    problems: strs(o.problems),
  };
}

/** Substance-gated parse: a thin comparison names its gaps instead of shipping. */
export function parseComparison(raw: string): { cmp: Comparison | null; missing: string[] } {
  let o: Record<string, unknown>;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return { cmp: null, missing: ['everything — no JSON came back'] };
    o = JSON.parse(clean.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return { cmp: null, missing: ['everything — unparseable output'] };
  }
  const a = parseSide(o.a);
  const b = parseSide(o.b);
  const agree = strs(o.agree);
  const conflict = strs(o.conflict);
  const hinges = strs(o.hinges, 4);
  const discriminators = strs(o.discriminators, 4);
  const verdict: CompareVerdict = o.verdict === 'contradicts' || o.verdict === 'complementary' || o.verdict === 'overlapping'
    ? o.verdict : 'overlapping';
  const readout = typeof o.readout === 'string' ? o.readout.trim() : '';

  const missing: string[] = [];
  if (!a.claim) missing.push("A's core claim");
  if (!b.claim) missing.push("B's core claim");
  if (!a.assumptions.length || !b.assumptions.length) missing.push('assumptions on both sides');
  if (agree.length + conflict.length < 2) missing.push('real agreements/conflicts (got fewer than 2 total)');
  if (!discriminators.length) missing.push('discriminating evidence — what observation would tell them apart');
  if (readout.length < 40) missing.push('an honest readout (2-3 sentences)');
  if (missing.length) return { cmp: null, missing };

  return { cmp: { a, b, agree, conflict, hinges, discriminators, verdict, readout }, missing: [] };
}

/** The discovered relationship, recorded on the MAP itself as a typed edge. */
export const VERDICT_EDGE: Record<CompareVerdict, EdgeType> = {
  contradicts: 'contradicts',
  complementary: 'relates',
  overlapping: 'relates',
};

const bullets = (items: string[]): string => items.map((s) => `· ${s}`).join('\n');

/** Serialize a comparison into a durable, human-readable artifact body. */
export function comparisonDetail(aTitle: string, bTitle: string, c: Comparison): string {
  return [
    `A — ${aTitle}`, `claim: ${c.a.claim}`, bullets(c.a.assumptions.map((s) => `assumes: ${s}`)),
    c.a.strengths.length ? `strengths:\n${bullets(c.a.strengths)}` : '',
    c.a.problems.length ? `problems:\n${bullets(c.a.problems)}` : '',
    '',
    `B — ${bTitle}`, `claim: ${c.b.claim}`, bullets(c.b.assumptions.map((s) => `assumes: ${s}`)),
    c.b.strengths.length ? `strengths:\n${bullets(c.b.strengths)}` : '',
    c.b.problems.length ? `problems:\n${bullets(c.b.problems)}` : '',
    '',
    c.agree.length ? `WHERE THEY AGREE\n${bullets(c.agree)}` : '',
    c.conflict.length ? `WHERE THEY CONFLICT\n${bullets(c.conflict)}` : '',
    c.hinges.length ? `WHAT IT HINGES ON\n${bullets(c.hinges)}` : '',
    `WHAT WOULD SETTLE IT\n${bullets(c.discriminators)}`,
    '',
    `VERDICT: ${c.verdict}`,
    c.readout,
  ].filter(Boolean).join('\n');
}

export function comparisonArtifact(aTitle: string, bTitle: string, c: Comparison): Artifact {
  return {
    id: `compare-${slugify(aTitle).slice(0, 20)}-vs-${slugify(bTitle).slice(0, 20)}`,
    kind: 'research',
    title: `Compared: ${aTitle} vs ${bTitle}`,
    detail: comparisonDetail(aTitle, bTitle, c),
    source: 'lab',
  };
}

// ---------------------------------------------------------------------------
// THEORY SCAFFOLD
// ---------------------------------------------------------------------------

export interface TheoryScaffold {
  claim: string;
  definitions: string[];
  assumptions: string[];
  related: string[];       // existing theories/work and how this relates
  supporting: string[];    // observations in favor — real ones or "none yet", never invented
  contradicting: string[]; // evidence/tensions against
  predictions: string[];   // testable predictions
  falsifiers: string[];    // WHAT OBSERVATION WOULD PROVE THIS WRONG — mandatory
  experiments: string[];   // ways to actually test it
  open: string[];          // open problems
}

export const THEORY_SYSTEM = `You help a curious person turn a hunch into a STRUCTURED THEORY — as a
collaborator AND a critic. You are not here to agree; agreement from an AI is not evidence.

Rules of the scaffold:
- State the core claim in ONE falsifiable sentence (sharpen theirs; don't replace it with a different idea).
- Definitions: pin down the load-bearing terms so the claim can't hide in vagueness.
- Related: name REAL existing theories/work this touches and how it relates. If you're unsure a work
  exists, describe the school of thought instead of inventing a citation.
- Supporting: real observations in favor. If there are none yet, write exactly one entry: "none yet".
  NEVER fabricate studies, experiments, or consensus.
- Contradicting: the strongest honest tensions against it — steelman the opposition.
- Predictions: things that would be OBSERVED if the theory is true, phrased so someone could check.
- falsifiers (THE HEART): concrete observations that would prove it WRONG. If nothing could, say so
  in a falsifier entry ("unfalsifiable as stated: …") — that itself is the finding.
- Experiments: realistic ways to test it (thought experiments count, labeled as such).

Output EXACTLY ONE JSON object, no prose, no fences:
{"claim":"…","definitions":["term — meaning"],"assumptions":["…"],"related":["…"],
 "supporting":["…"],"contradicting":["…"],"predictions":["…"],"falsifiers":["…"],
 "experiments":["…"],"open":["…"]}`;

export function buildTheoryUser(statement: string, context = ''): string {
  return [
    `THE HUNCH: ${statement.slice(0, 600)}`,
    context ? `CONTEXT FROM THE EXPLORATION:\n${context.slice(0, 1200)}` : '',
    'Scaffold it now. Return the single JSON object.',
  ].filter(Boolean).join('\n');
}

/** Substance-gated parse. Falsifiers are NON-NEGOTIABLE — their absence is rejected by name. */
export function parseTheoryScaffold(raw: string): { scaffold: TheoryScaffold | null; missing: string[] } {
  let o: Record<string, unknown>;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return { scaffold: null, missing: ['everything — no JSON came back'] };
    o = JSON.parse(clean.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return { scaffold: null, missing: ['everything — unparseable output'] };
  }
  const scaffold: TheoryScaffold = {
    claim: typeof o.claim === 'string' ? o.claim.trim() : '',
    definitions: strs(o.definitions),
    assumptions: strs(o.assumptions),
    related: strs(o.related),
    supporting: strs(o.supporting),
    contradicting: strs(o.contradicting),
    predictions: strs(o.predictions),
    falsifiers: strs(o.falsifiers, 4),
    experiments: strs(o.experiments, 4),
    open: strs(o.open),
  };
  const missing: string[] = [];
  if (scaffold.claim.length < 15) missing.push('a one-sentence core claim');
  if (!scaffold.assumptions.length) missing.push('assumptions');
  if (!scaffold.predictions.length) missing.push('testable predictions');
  if (!scaffold.falsifiers.length) missing.push('falsifiers — what observation would prove this wrong (non-negotiable)');
  if (!scaffold.contradicting.length) missing.push('the honest case against it');
  if (missing.length) return { scaffold: null, missing };
  return { scaffold, missing: [] };
}

export const THEORY_ARTIFACT_ID = 'theory-scaffold';

export function theoryDetail(t: TheoryScaffold): string {
  const sec = (label: string, items: string[]) => (items.length ? `${label}\n${bullets(items)}` : '');
  return [
    `CLAIM: ${t.claim}`,
    sec('DEFINITIONS', t.definitions),
    sec('ASSUMPTIONS', t.assumptions),
    sec('RELATED WORK', t.related),
    sec('SUPPORTING OBSERVATIONS', t.supporting),
    sec('THE CASE AGAINST', t.contradicting),
    sec('TESTABLE PREDICTIONS', t.predictions),
    `WHAT WOULD PROVE THIS WRONG\n${bullets(t.falsifiers)}`,
    sec('POSSIBLE EXPERIMENTS', t.experiments),
    sec('OPEN PROBLEMS', t.open),
  ].filter(Boolean).join('\n\n');
}

export function theoryArtifact(t: TheoryScaffold): Artifact {
  return {
    id: THEORY_ARTIFACT_ID,
    kind: 'research',
    title: `Theory: ${t.claim.slice(0, 70)}`,
    detail: theoryDetail(t),
    source: 'lab',
  };
}
