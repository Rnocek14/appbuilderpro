// src/lib/garvis/buildBrief.ts
// Constellation → build brief. Turns an exploration (the focused idea + the reasoning thread that led
// to it + the branches/variations explored + the research and sources gathered + the open questions)
// into ONE structured brief the app builder can consume — so a rabbit hole becomes a fully-briefed
// build instead of a thin one-line seed you'd have to re-explain by hand.
//
// Pure + graph-only (open questions passed in by the caller, which holds the live leads). Testable.

import type { ClusterGraph, Cluster } from './clustering';

function understandingOf(c: Cluster): string {
  const u = c.artifacts.find((a) => a.id === 'understanding') ?? c.artifacts.find((a) => a.kind === 'research');
  return (u?.detail ?? '').trim();
}

function sourcesOf(c: Cluster): string[] {
  return c.artifacts
    .filter((a) => (a.kind === 'link' || a.source === 'wikipedia' || a.source === 'wikimedia') && a.url)
    .map((a) => `${(a.title || a.url || '').trim()} — ${a.url}`);
}

function ancestorsOf(byId: Map<string, Cluster>, id: string): Cluster[] {
  const out: Cluster[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  let guard = 0;
  while (cur && guard++ < 40) { const c = byId.get(cur); if (!c) break; out.unshift(c); cur = c.parentId; }
  return out;
}

export interface BuildBrief { prompt: string; brief: string; nodeCount: number; wholeWorld: boolean }

export interface CompileOpts {
  /** Include the whole world, not just the focused thread. Defaults to auto (small worlds → whole). */
  wholeWorld?: boolean;
  /** Currents/tangents the user hasn't followed yet — real open questions worth carrying. */
  openQuestions?: string[];
}

export function compileBuildBrief(graph: ClusterGraph, focusId: string, opts: CompileOpts = {}): BuildBrief | null {
  const byId = new Map(graph.clusters.map((c) => [c.id, c]));
  const focus = byId.get(focusId);
  if (!focus) return null;

  // Auto: a shallow world (few nodes) is best carried whole; a big one, just the focused thread.
  const wholeWorld = opts.wholeWorld ?? graph.clusters.length <= 8;

  const ancestors = ancestorsOf(byId, focusId);
  const children = graph.clusters.filter((c) => c.parentId === focusId);
  const branches = wholeWorld ? graph.clusters.filter((c) => c.id !== focusId) : children;

  const L: string[] = [];
  L.push('# Build brief — compiled from your exploration', '');
  L.push('## The idea', focus.title + (focus.summary ? ` — ${focus.summary}` : ''));
  if (focus.trajectory) L.push(`Direction: ${focus.trajectory}`);
  const fu = understandingOf(focus);
  if (fu) L.push('', fu);
  L.push('');

  if (ancestors.length) {
    L.push('## How this idea was reached (the reasoning thread)');
    L.push([...ancestors, focus].map((c) => c.title).join('  →  '));
    L.push('');
  }

  if (branches.length) {
    L.push(wholeWorld ? '## Everything explored in this world' : '## Variations & branches explored from here');
    for (const c of branches.slice(0, 40)) {
      L.push(`- **${c.title}**${c.summary ? ` — ${c.summary}` : ''}`);
      if (!wholeWorld) { const u = understandingOf(c); if (u) L.push(`  ${u.slice(0, 300)}`); }
    }
    L.push('');
  }

  const scope = wholeWorld ? graph.clusters : [...ancestors, focus, ...children];
  const sources = new Set<string>();
  for (const c of scope) sourcesOf(c).forEach((s) => sources.add(s));
  if (sources.size) {
    L.push('## Research sources gathered');
    [...sources].slice(0, 25).forEach((s) => L.push(`- ${s}`));
    L.push('');
  }

  const oq = (opts.openQuestions ?? []).map((q) => q.trim()).filter(Boolean);
  if (oq.length) {
    L.push('## Open questions I was still chasing');
    oq.slice(0, 12).forEach((q) => L.push(`- ${q}`));
    L.push('');
  }

  L.push('## What to build');
  L.push(
    'Turn this exploration into a real app. The idea above is the seed; the thread, branches, research, ' +
    'and open questions are the context I gathered — use them to make smart decisions instead of asking ' +
    'me to re-explain. Where the exploration left a genuine fork, follow the strongest option and note it.',
  );

  const brief = L.join('\n').slice(0, 12000);
  const prompt =
    `Build an app from this exploration: "${focus.title}".` +
    (focus.summary ? ` ${focus.summary}` : '') +
    ' (The full research, the reasoning thread, and the variations I explored are in the project Brain — use them.)';

  return { prompt, brief, nodeCount: scope.length, wholeWorld };
}
