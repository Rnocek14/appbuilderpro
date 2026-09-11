// supabase/functions/embed-sweep/index.ts
// THE NIGHTLY CONNECTION ENGINE (app_0142, best-in-class plan SW2.5). pgvector and
// match_embeddings have worked for months, but the ONLY code that ever filed a connection
// insight was ingest-document — at upload time. Material that arrived any other way (builder
// output, conversation artifacts, imports) was never embedded and never compared, so insights
// and the universe's filaments starved between uploads. This sweep closes the loop on a clock:
//
//   1. Find artifacts/documents with NO vector (left-join by absence — invalidation by
//      construction, nothing has to remember to enqueue).
//   2. Embed the missing batch (embed-worker's exact row shape and world-stamping).
//   3. Run the neighbor pass over each fresh vector and file 'connection' insights at the same
//      >= 0.5 real-similarity bar ingest-document uses — scores are measured, never invented.
//
// Honesty spine: embeddings unconfigured → an honest skip, never an error. Idempotent: the
// second run finds nothing missing and embeds 0. No firehose: at most a few insights per owner
// per night, deduped against pairs already filed. Spend is record-only (the embed-worker
// doctrine: fractions of a cent, blocking memory on an empty balance would be hostile).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { cronAuthorized } from '../_shared/cronGate.ts';
import { embedTexts, embeddingsConfigured, toVectorLiteral, EMBED_MODEL } from '../_shared/embeddings.ts';
import { spendCredits } from '../_shared/credits.ts';

const SCAN_LIMIT = 300;          // rows considered per subject type per run
const EMBED_BATCH = 96;          // vectors written per run (embed provider batch ceiling: 128)
const NEIGHBOR_K = 3;
const MIN_SIMILARITY = 0.5;      // the ingest-document bar — one notion of "genuinely related"
const MAX_INSIGHTS_PER_OWNER = 3;
const TIME_BUDGET_MS = 75_000;

interface Pending {
  owner_id: string;
  subject_type: 'artifact' | 'document';
  subject_id: string;
  label: string;
  content: string;
  world_id: string | null;
}

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!cronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
  if (!embeddingsConfigured()) return json({ ok: true, embedded: 0, insights: 0, reason: 'embeddings_not_configured' });

  const started = Date.now();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ---- 1. what has no vector yet -------------------------------------------------------
    const pending: Pending[] = [];

    const { data: arts } = await admin.from('knowledge_artifacts')
      .select('id, owner_id, title, detail, knowledge_clusters(world_id)')
      .order('created_at', { ascending: false }).limit(SCAN_LIMIT);
    const { data: docs } = await admin.from('documents')
      .select('id, owner_id, world_id, title, summary, extracted_text')
      .order('created_at', { ascending: false }).limit(SCAN_LIMIT);

    const ids = [...(arts ?? []).map((a: { id: string }) => a.id), ...(docs ?? []).map((d: { id: string }) => d.id)];
    if (!ids.length) return json({ ok: true, embedded: 0, insights: 0 });
    const { data: existing } = await admin.from('embeddings')
      .select('subject_id').in('subject_id', ids).in('subject_type', ['artifact', 'document']);
    const has = new Set(((existing ?? []) as { subject_id: string }[]).map((e) => e.subject_id));

    type ClusterRef = { world_id: string | null };
    for (const a of (arts ?? []) as { id: string; owner_id: string; title: string; detail: string | null; knowledge_clusters: ClusterRef | ClusterRef[] | null }[]) {
      if (has.has(a.id)) continue;
      const text = `${a.title}\n\n${a.detail ?? ''}`.trim();
      if (text.length < 24) continue;                        // a bare title carries no signal worth a vector
      const cluster = Array.isArray(a.knowledge_clusters) ? a.knowledge_clusters[0] : a.knowledge_clusters;
      pending.push({ owner_id: a.owner_id, subject_type: 'artifact', subject_id: a.id, label: a.title, content: text, world_id: cluster?.world_id ?? null });
    }
    for (const d of (docs ?? []) as { id: string; owner_id: string; world_id: string | null; title: string; summary: string | null; extracted_text: string | null }[]) {
      if (has.has(d.id)) continue;
      const text = `${d.title}\n\n${(d.extracted_text ?? d.summary ?? '')}`.trim();
      if (text.length < 24) continue;
      pending.push({ owner_id: d.owner_id, subject_type: 'document', subject_id: d.id, label: d.title, content: text, world_id: d.world_id });
    }

    const batch = pending.slice(0, EMBED_BATCH);
    if (!batch.length) return json({ ok: true, embedded: 0, insights: 0 });

    // ---- 2. embed + persist (embed-worker's exact shape) ---------------------------------
    const vecs = await embedTexts(batch.map((p) => p.content.slice(0, 8000)));
    if (!vecs) return json({ ok: false, embedded: 0, insights: 0, reason: 'embed_failed' }, 502);

    const rows = batch.map((p, i) => ({
      owner_id: p.owner_id, subject_type: p.subject_type, subject_id: p.subject_id, chunk_ix: 0,
      content: p.content.slice(0, 8000), embedding: toVectorLiteral(vecs[i]), model: EMBED_MODEL,
      world_id: p.world_id,
    }));
    const { error: upErr } = await admin.from('embeddings')
      .upsert(rows, { onConflict: 'owner_id,subject_type,subject_id,chunk_ix' });
    if (upErr) return json({ ok: false, embedded: 0, insights: 0, reason: `persist failed: ${upErr.message}` }, 500);

    // Record-only spend per owner (embed-worker's estimate: ~4 chars/token at list price).
    const charsByOwner = new Map<string, number>();
    for (const p of batch) charsByOwner.set(p.owner_id, (charsByOwner.get(p.owner_id) ?? 0) + p.content.length);
    for (const [owner, chars] of charsByOwner) {
      const tokens = Math.ceil(chars / 4);
      await spendCredits(admin, owner, {
        costUsd: (tokens / 1_000_000) * 0.02, kind: 'embed', provider: 'openai', model: EMBED_MODEL, inputTokens: tokens,
      });
    }

    // ---- 3. neighbor pass → connection insights ------------------------------------------
    let filed = 0;
    const perOwner = new Map<string, number>();
    const seenPairs = new Map<string, Set<string>>();        // owner → "idA|idB" (sorted) already filed

    for (let i = 0; i < batch.length; i++) {
      if (Date.now() - started > TIME_BUDGET_MS) break;      // stop filing, never stop honestly
      const p = batch[i];
      if ((perOwner.get(p.owner_id) ?? 0) >= MAX_INSIGHTS_PER_OWNER) continue;

      if (!seenPairs.has(p.owner_id)) {
        const { data: prior } = await admin.from('insights')
          .select('refs').eq('owner_id', p.owner_id).eq('kind', 'connection')
          .order('created_at', { ascending: false }).limit(200);
        const set = new Set<string>();
        for (const r of (prior ?? []) as { refs: { subject_id?: string }[] }[]) {
          const pair = (r.refs ?? []).map((x) => x.subject_id).filter(Boolean).sort().join('|');
          if (pair) set.add(pair);
        }
        seenPairs.set(p.owner_id, set);
      }

      const { data: matches } = await admin.rpc('match_embeddings', {
        _owner: p.owner_id, _query: toVectorLiteral(vecs[i]), _k: NEIGHBOR_K,
        _min_similarity: MIN_SIMILARITY, _exclude_subject: p.subject_id,
      });
      const top = ((matches ?? []) as { subject_type: string; subject_id: string; content: string; similarity: number }[])[0];
      if (!top || top.similarity < MIN_SIMILARITY) continue;

      const pairKey = [p.subject_id, top.subject_id].sort().join('|');
      const owned = seenPairs.get(p.owner_id)!;
      if (owned.has(pairKey)) continue;

      const { error: insErr } = await admin.from('insights').insert({
        owner_id: p.owner_id, kind: 'connection',
        title: `"${p.label.slice(0, 80)}" connects to something you already have`,
        body: `While sweeping the brain overnight, Garvis found this ${p.subject_type} is closely related (${Math.round(top.similarity * 100)}% similar) to existing material. Consider linking them.`,
        refs: [
          { subject_type: p.subject_type, subject_id: p.subject_id, label: p.label.slice(0, 80) },
          { subject_type: top.subject_type, subject_id: top.subject_id, label: (top.content ?? '').slice(0, 80) },
        ],
        score: Math.min(0.999, top.similarity),
      });
      if (!insErr) {
        owned.add(pairKey);
        perOwner.set(p.owner_id, (perOwner.get(p.owner_id) ?? 0) + 1);
        filed++;
      }
    }

    return json({ ok: true, embedded: rows.length, insights: filed, scanned: pending.length });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
