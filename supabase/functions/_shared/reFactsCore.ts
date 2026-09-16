// supabase/functions/_shared/reFactsCore.ts
// A MISSING FACT STAYS MISSING. Pure: no Deno, no DOM, no Supabase. Verified by
// src/lib/garvis/reFacts.verify.ts.
//
// The operating plan's rule — "never invent a marketing fact when data is missing" — needs something
// to enforce against, and app_0139 gives it: a claim, its sources, and the date it must be re-checked.
// This core decides one thing, the same way everywhere: MAY this fact appear in published copy?
//
// Shaped after bespokeHonest() in src/lib/preview/bespokeSite.ts, which is the house's strongest
// honesty precedent: a deterministic gate over GENERATED output that fails toward safety ("a false
// positive costs a bespoke page … a lie never reaches a real business"). The weaker form — linting a
// static array, as automationCards.verify does — cannot see generated copy at all.
//
// Three layers, one rule (the disclosure-gate shape): the composer renders holes, the queue refuses,
// and the publisher re-checks server-side at send time — because a fact can go stale between the
// approval and the post.

export type FactStatus = 'draft' | 'verified' | 'stale' | 'retired';

export interface FactRecord {
  id: string;
  claim: string;
  valueText: string | null;
  status: FactStatus;
  reviewedAt: string | null;
  reviewDueAt: string | null;   // null = evergreen
  sourceCount: number;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Tolerant reader for a DB row (snake_case) or a wire object (camelCase). */
export function parseFact(raw: unknown): FactRecord | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = str(o.id).trim();
  const claim = str(o.claim).trim();
  if (!id || !claim) return null;
  const s = str(o.status).trim();
  const status: FactStatus =
    s === 'verified' || s === 'stale' || s === 'retired' ? s : 'draft';
  const n = o.sourceCount ?? o.source_count;
  return {
    id, claim, status,
    valueText: str(o.valueText ?? o.value_text).trim() || null,
    reviewedAt: str(o.reviewedAt ?? o.reviewed_at).trim() || null,
    reviewDueAt: str(o.reviewDueAt ?? o.review_due_at).trim() || null,
    sourceCount: typeof n === 'number' && Number.isFinite(n) ? n : 0,
  };
}

/** WHY this fact cannot be published, named. Empty string = it can. `now` is injected. */
export function citationBlocker(f: FactRecord, nowIso: string): string {
  if (f.status === 'retired') return `"${f.claim}" was retired — it is no longer true.`;
  if (f.status === 'draft') return `"${f.claim}" has not been verified by anyone yet.`;
  if (f.sourceCount <= 0) return `"${f.claim}" carries no source — verify it against one first.`;
  if (f.status === 'stale') return `"${f.claim}" is marked stale — re-check it and set a new review date.`;
  if (f.reviewDueAt) {
    const due = Date.parse(f.reviewDueAt), now = Date.parse(nowIso);
    if (Number.isFinite(due) && Number.isFinite(now) && due <= now) {
      return `"${f.claim}" was due for re-check on ${f.reviewDueAt.slice(0, 10)} — confirm it before publishing.`;
    }
  }
  return '';
}

export function isCitable(f: FactRecord, nowIso: string): boolean {
  return citationBlocker(f, nowIso) === '';
}

export interface RenderResult {
  text: string;
  /** One line per unusable or unknown fact — what the operator must go and check. */
  holes: string[];
  usedFactIds: string[];
}

// Two patterns on purpose: the /g one is consumed by .replace (which resets lastIndex), while .test
// on a /g regex ADVANCES lastIndex and would alternate true/false across calls. Never share them.
const PLACEHOLDER_G = /\{\{fact:([A-Za-z0-9_-]+)\}\}/g;
const PLACEHOLDER = /\{\{fact:[A-Za-z0-9_-]+\}\}/;

/** Replace {{fact:<id>}} with the verified value, or leave a VISIBLE hole. Never substitutes a
 *  plausible phrase for a fact nobody checked — that is the entire point of the file. */
export function renderWithFacts(template: string, facts: FactRecord[], nowIso: string): RenderResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const holes: string[] = [];
  const used: string[] = [];
  const text = (template ?? '').replace(PLACEHOLDER_G, (_m, id: string) => {
    const f = byId.get(id);
    if (!f) {
      holes.push(`No fact record for "${id}" — add it with a source before this can publish.`);
      return `[VERIFY: ${id}]`;
    }
    const blocker = citationBlocker(f, nowIso);
    if (blocker) {
      holes.push(blocker);
      return `[VERIFY: ${f.claim}]`;
    }
    used.push(f.id);
    return f.valueText ?? f.claim;
  });
  return { text, holes, usedFactIds: [...new Set(used)] };
}

/** The SERVER-SIDE re-check at send time: a fact can go stale between approval and publication.
 *  Returns a named block reason, or null to proceed. Mirrors disclosureGate's signature. */
export function factGate(factIds: string[], facts: FactRecord[], nowIso: string): string | null {
  const byId = new Map(facts.map((f) => [f.id, f]));
  for (const id of factIds) {
    const f = byId.get(id);
    if (!f) return `A fact this post relies on is missing (${id}) — it cannot publish.`;
    const blocker = citationBlocker(f, nowIso);
    if (blocker) return blocker;
  }
  return null;
}

/** Copy that still has a hole in it must never reach the queue. */
export function hasUnresolvedHole(text: string): boolean {
  return /\[VERIFY:/.test(text ?? '') || PLACEHOLDER.test(text ?? '');
}
