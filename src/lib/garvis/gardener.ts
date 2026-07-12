// src/lib/garvis/gardener.ts
// THE GARDENER — pure core (no Supabase, no LLM; verified by gardener.verify.ts).
//
// As explorations multiply, someone has to notice what the explorer can't see from inside one
// world: the SAME thread growing in several of them. ("Your explorations of time, consciousness,
// and simulation theory all contain the same unresolved theme.") The gardener is deterministic and
// honest by construction: a recurring thread is a MEASURED lexical grouping across ≥2 distinct
// worlds — never an invented connection. (Embedding cosine can replace the lexical term later,
// exactly like relatedClusters; the contract here stays the same.)
//
// The gardener never merges, folds, or deletes anything — the universe only grows. It only
// SURFACES; the owner decides what to do with what keeps coming back.

import { titleSimilarity } from './clustering';

export interface GardenClusterIn {
  worldId: string;
  worldTitle: string;
  title: string;
  kind: string;
}

export interface RecurringThread {
  title: string;                                   // the most specific member title (longest — deterministic)
  worldCount: number;                              // distinct worlds it appears in — the evidence
  appearances: { worldTitle: string; title: string }[]; // one per world, first occurrence
}

const DEFAULT_THRESHOLD = 0.55;
const CAP = 5;

/**
 * Group clusters across worlds by title similarity (greedy, input order — deterministic), then
 * keep only groups that SPAN ≥2 DISTINCT WORLDS. Ten sub-questions inside one world are depth,
 * not recurrence — they never count. Artifact nodes are excluded (outputs recur for boring reasons).
 */
export function recurringThreads(
  rows: GardenClusterIn[],
  opts?: { threshold?: number; cap?: number },
): RecurringThread[] {
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const cap = opts?.cap ?? CAP;
  const usable = rows.filter((r) => r.title.trim() && r.kind !== 'artifact');

  const groups: { members: GardenClusterIn[] }[] = [];
  for (const row of usable) {
    const hit = groups.find((g) => titleSimilarity(g.members[0].title, row.title) >= threshold);
    if (hit) hit.members.push(row);
    else groups.push({ members: [row] });
  }

  const threads: RecurringThread[] = [];
  for (const g of groups) {
    const byWorld = new Map<string, GardenClusterIn>();
    for (const m of g.members) if (!byWorld.has(m.worldId)) byWorld.set(m.worldId, m);
    if (byWorld.size < 2) continue; // depth inside one world is not recurrence
    const members = [...byWorld.values()];
    const title = members.reduce((a, b) => (b.title.length > a.title.length ? b : a)).title;
    threads.push({
      title,
      worldCount: byWorld.size,
      appearances: members.map((m) => ({ worldTitle: m.worldTitle, title: m.title })),
    });
  }

  return threads
    .sort((a, b) => b.worldCount - a.worldCount || (a.title < b.title ? -1 : 1))
    .slice(0, cap);
}
