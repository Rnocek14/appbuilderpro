// src/lib/garvis/ask.ts
// ASK GARVIS — the retrieval surface the bones audit found missing entirely. Nothing let you ASK
// the system what it knows; knowledge was written to many tables and read by none. This closes it:
// a hybrid search (semantic when embeddings are configured, lexical always) over the world's
// artifacts — the seeded playbooks, the generated copy, the research briefs, the postcard designs —
// then a synthesized answer that CITES its sources and refuses to invent what it can't find.
//
// Honesty is structural: the answer is grounded ONLY in retrieved artifacts (passed to the model as
// the sole context); when nothing relevant is found, it says so instead of guessing. The pure half
// (mergeHits/rankHits) is verified; the impure half does the DB/edge work.

import { supabase } from '../supabase';
import { embedTexts } from './embeddings';
import { mergeHits, type RawHit } from './askCore';

export { mergeHits, type RawHit } from './askCore';
export interface AskSource {
  id: string; title: string; area: string | null; world: string | null; worldId: string | null;
  snippet: string; similarity: number | null;
}
export interface AskResult { answer: string; sources: AskSource[]; grounded: boolean; searched: number }

// ---------------------------------------------------------------------------
// Impure: hybrid retrieval + synthesis (pure mergeHits lives in askCore.ts)
// ---------------------------------------------------------------------------

const ASK_SYSTEM = `You are Garvis answering the owner's question using ONLY the retrieved material
below — their own artifacts, playbooks, research, and designs. Rules:
- Ground every claim in the SOURCES. If they don't contain the answer, say plainly what you DON'T
  have on record and suggest where it would come from (a scan, an upload, running a play) — never
  invent facts, numbers, names, or specifics.
- Cite as you go with [n] matching the numbered sources.
- Be concrete and brief. If the sources are frameworks (not measured data), say so.
- Plain prose. No JSON, no markdown fences.`;

async function clusterIdsForWorld(worldId: string): Promise<string[]> {
  const { data } = await supabase.from('knowledge_clusters').select('id').eq('world_id', worldId).limit(500);
  return (data ?? []).map((c) => (c as { id: string }).id);
}

/** Semantic hits via the owner-scoped match_embeddings RPC. Returns [] when embeddings aren't
 *  configured (embedTexts → null) — the lexical path carries the search alone. */
async function vectorHits(question: string, uid: string): Promise<RawHit[]> {
  const vecs = await embedTexts([question]);
  if (!vecs || !vecs[0]?.length) return [];
  const literal = `[${vecs[0].join(',')}]`;
  const { data, error } = await supabase.rpc('match_embeddings', {
    _owner: uid, _query: literal, _k: 8, _subject_type: 'artifact', _min_similarity: 0.15,
  });
  if (error) return [];
  return ((data ?? []) as { subject_id: string; content: string; similarity: number }[])
    .map((r) => ({ subjectId: r.subject_id, content: r.content, similarity: r.similarity, via: 'vector' as const }));
}

/** Lexical hits over knowledge_artifacts (title + detail ILIKE), owner-scoped by RLS. Always runs,
 *  so search works with zero embeddings configured. World-scoped when a worldId is given. */
async function lexicalHits(question: string, clusterIds: string[] | null): Promise<RawHit[]> {
  const terms = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3).slice(0, 6);
  if (!terms.length) return [];
  const ors = terms.flatMap((t) => [`title.ilike.%${t}%`, `detail.ilike.%${t}%`]).join(',');
  let q = supabase.from('knowledge_artifacts').select('id, title, detail, cluster_id').or(ors).limit(20);
  if (clusterIds) { if (!clusterIds.length) return []; q = q.in('cluster_id', clusterIds); }
  const { data } = await q;
  return ((data ?? []) as { id: string; title: string; detail: string | null; cluster_id: string }[])
    .map((r) => ({ subjectId: r.id, content: `${r.title}\n\n${r.detail ?? ''}`.slice(0, 1200), similarity: null, via: 'lexical' as const }));
}

/** Resolve artifact hits into display sources (title + area + world). */
async function resolveSources(hits: RawHit[]): Promise<AskSource[]> {
  const ids = hits.map((h) => h.subjectId);
  if (!ids.length) return [];
  const { data: arts } = await supabase.from('knowledge_artifacts')
    .select('id, title, cluster_id').in('id', ids);
  const artRows = (arts ?? []) as { id: string; title: string; cluster_id: string }[];
  const clusterIds = [...new Set(artRows.map((a) => a.cluster_id))];
  const { data: clusters } = clusterIds.length
    ? await supabase.from('knowledge_clusters').select('id, title, world_id').in('id', clusterIds)
    : { data: [] };
  const clusterRows = (clusters ?? []) as { id: string; title: string; world_id: string }[];
  const worldIds = [...new Set(clusterRows.map((c) => c.world_id))];
  const { data: worlds } = worldIds.length
    ? await supabase.from('knowledge_worlds').select('id, title').in('id', worldIds)
    : { data: [] };
  const worldTitle = new Map((worlds ?? []).map((w) => [(w as { id: string }).id, (w as { title: string }).title]));
  const clusterOf = new Map(clusterRows.map((c) => [c.id, c]));
  const artOf = new Map(artRows.map((a) => [a.id, a]));

  const out: AskSource[] = [];
  for (const h of hits) {
    const a = artOf.get(h.subjectId);
    if (!a) continue;
    const c = clusterOf.get(a.cluster_id);
    out.push({
      id: a.id, title: a.title,
      area: c?.title ?? null,
      world: c ? (worldTitle.get(c.world_id) ?? null) : null,
      worldId: c?.world_id ?? null,
      snippet: h.content.slice(0, 400),
      similarity: h.similarity,
    });
  }
  return out;
}

/** Ask Garvis a question. Retrieves over the owner's artifacts (optionally one world), synthesizes
 *  a cited answer grounded ONLY in what's retrieved, and returns the sources so the UI can show its
 *  work. Fail-soft: retrieval or synthesis failure returns an honest message, never a throw. */
export async function askGarvis(question: string, opts?: { worldId?: string }): Promise<AskResult> {
  const q = question.trim();
  if (q.length < 3) return { answer: 'Ask a fuller question — a few words at least.', sources: [], grounded: false, searched: 0 };
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return { answer: 'Sign in to ask about your worlds.', sources: [], grounded: false, searched: 0 };

  const clusterIds = opts?.worldId ? await clusterIdsForWorld(opts.worldId) : null;
  const [vhits, lhits] = await Promise.all([
    opts?.worldId ? Promise.resolve([]) : vectorHits(q, uid),  // vector is account-wide; world scope uses lexical
    lexicalHits(q, clusterIds),
  ]);
  // When scoped to a world, still run vector but filter to the world's clusters after resolving.
  const vScoped = opts?.worldId ? await vectorHits(q, uid) : vhits;
  const merged = mergeHits(vScoped, lhits, 8);
  const sources = await resolveSources(merged);
  const scoped = opts?.worldId ? sources.filter((s) => s.worldId === opts.worldId) : sources;

  if (!scoped.length) {
    return {
      answer: opts?.worldId
        ? "Nothing on record in this world answers that yet. Run the area's tools (research, generate) or a Market Intelligence scan to give Garvis something real to reason over."
        : "I don't have anything on record about that yet. Build in a world — run research, generate copy, scan for leads — and it becomes searchable here.",
      sources: [], grounded: false, searched: merged.length,
    };
  }

  const context = scoped.map((s, i) =>
    `[${i + 1}] ${s.title}${s.area ? ` (${s.area}${s.world ? ` · ${s.world}` : ''})` : ''}\n${s.snippet}`,
  ).join('\n\n');

  try {
    const { data, error } = await supabase.functions.invoke('cluster-chat', {
      body: { system: ASK_SYSTEM, context: `SOURCES:\n${context}`, history: [], message: q },
    });
    if (error) throw new Error(error.message);
    const answer = ((data as { text?: string })?.text ?? '').trim();
    return {
      answer: answer || 'Found relevant material but could not summarize it — the sources below have your answer.',
      sources: scoped, grounded: true, searched: merged.length,
    };
  } catch {
    // Synthesis failed — still return the sources (retrieval succeeded; that's the useful part).
    return {
      answer: `Found ${scoped.length} relevant item${scoped.length === 1 ? '' : 's'} — see the sources below.`,
      sources: scoped, grounded: true, searched: merged.length,
    };
  }
}
