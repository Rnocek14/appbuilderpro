// supabase/functions/embed-worker/index.ts
// Write-side of the persistent brain (app_0021): embeds text for one or more subjects and PERSISTS
// the vectors to public.embeddings (service role — the browser never holds the embeddings key and
// never writes vectors, per the app_0021 RLS: embeddings are owner-read, service-write only).
//
// Two request shapes (POST, authenticated):
//   1) PERSIST:  { subjects: [{ subject_type, subject_id, content, chunk_ix? }] }
//                → { embedded: n, skipped: m }  (upserts vectors into public.embeddings)
//   2) VECTORS:  { texts: ["...", ...] }
//                → { vectors: number[][] | null }  (returns vectors WITHOUT persisting — this is the
//                  server-side replacement for the browser holding an embeddings key; the client's
//                  src/lib/garvis/embeddings.ts calls this so the raw key never ships in the bundle)
// When embeddings aren't configured the brain degrades to lexical: {embedded:0} / {vectors:null}, never a hard error.
//
// Deploy: npx supabase functions deploy embed-worker
// Secrets: EMBEDDINGS_API_KEY (or OPENAI_API_KEY). Optional EMBEDDINGS_BASE_URL / EMBEDDINGS_MODEL.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/ai.ts';
import { embedTexts, embeddingsConfigured, toVectorLiteral, EMBED_MODEL } from '../_shared/embeddings.ts';
import { spendCredits } from '../_shared/credits.ts';

const SUBJECT_TYPES = new Set(['document', 'artifact', 'cluster', 'knowledge', 'business', 'app']);

interface SubjectIn {
  subject_type?: string;
  subject_id?: string;
  content?: string;
  chunk_ix?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    // AUTHZ — the caller must be a signed-in user; rows are stamped with their id, so an owner can
    // only ever embed under their own owner_id.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as { subjects?: SubjectIn[]; texts?: string[] };

    // Service-role client hoisted above both modes: the usage ledger below needs it in the VECTORS
    // path too, not just for persisting vectors.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Record-only usage ledger, deliberately NO checkCredits gate (audit 12 §1.2, unmetered call
    // sites): embeddings cost fractions of a cent, and blocking ingest on an empty balance would be
    // hostile — the brain would silently stop remembering what the owner just wrote. embedTexts
    // doesn't surface provider usage, so tokens use the standard ~4 chars/token estimate at the
    // text-embedding-3-small list price ($0.02/1M). spendCredits never throws.
    const recordEmbedSpend = (totalChars: number) => {
      const tokens = Math.ceil(totalChars / 4);
      return spendCredits(admin, user.id, {
        costUsd: (tokens / 1_000_000) * 0.02, kind: 'embed', provider: 'openai', model: EMBED_MODEL,
        inputTokens: tokens,
      });
    };

    // VECTORS mode — return embeddings without persisting (server-side key for the browser).
    if (Array.isArray(body.texts)) {
      const texts = body.texts.filter((t) => typeof t === 'string');
      if (!texts.length) return json({ vectors: [] });
      if (texts.length > 256) return json({ error: 'Max 256 texts per call.' }, 400);
      if (!embeddingsConfigured()) return json({ vectors: null, reason: 'embeddings_not_configured' });
      const vectors = await embedTexts(texts);
      if (vectors) await recordEmbedSpend(texts.reduce((n, t) => n + t.length, 0));
      return json({ vectors });
    }
    const subjects = (body.subjects ?? []).filter(
      (s) => s && SUBJECT_TYPES.has(s.subject_type ?? '') && s.subject_id && (s.content ?? '').trim(),
    );
    if (!subjects.length) return json({ error: 'No valid subjects. Each needs subject_type, subject_id, content.' }, 400);
    if (subjects.length > 128) return json({ error: 'Max 128 subjects per call.' }, 400);

    if (!embeddingsConfigured()) return json({ embedded: 0, skipped: subjects.length, reason: 'embeddings_not_configured' });

    const vecs = await embedTexts(subjects.map((s) => s.content!.trim()));
    if (!vecs) return json({ embedded: 0, skipped: subjects.length, reason: 'embed_failed' }, 502);

    // Record-only, no gate — see recordEmbedSpend above (audit 12 §1.2, unmetered call sites).
    await recordEmbedSpend(subjects.reduce((n, s) => n + s.content!.trim().length, 0));

    // WORLD STAMP (app_0114): every vector carries its world so match_embeddings can scope
    // retrieval — a world-scoped ask must never surface another client's documents. Resolved
    // SERVER-side (never trusted from the client): documents carry world_id directly; artifacts
    // and clusters resolve through their cluster's world. Unresolvable subjects stay null (global).
    const worldBySubject = new Map<string, string | null>();
    const docIds = subjects.filter((s) => s.subject_type === 'document').map((s) => s.subject_id!);
    const artIds = subjects.filter((s) => s.subject_type === 'artifact').map((s) => s.subject_id!);
    const cluIds = subjects.filter((s) => s.subject_type === 'cluster').map((s) => s.subject_id!);
    if (docIds.length) {
      const { data } = await admin.from('documents').select('id, world_id').in('id', docIds).eq('owner_id', user.id);
      for (const d of (data ?? []) as { id: string; world_id: string | null }[]) worldBySubject.set(`document:${d.id}`, d.world_id);
    }
    if (artIds.length) {
      const { data } = await admin.from('knowledge_artifacts')
        .select('id, knowledge_clusters(world_id)').in('id', artIds).eq('owner_id', user.id);
      for (const a of (data ?? []) as { id: string; knowledge_clusters: { world_id: string } | null }[]) {
        worldBySubject.set(`artifact:${a.id}`, a.knowledge_clusters?.world_id ?? null);
      }
    }
    if (cluIds.length) {
      const { data } = await admin.from('knowledge_clusters').select('id, world_id').in('id', cluIds).eq('owner_id', user.id);
      for (const c of (data ?? []) as { id: string; world_id: string | null }[]) worldBySubject.set(`cluster:${c.id}`, c.world_id);
    }

    const rows = subjects.map((s, i) => ({
      owner_id: user.id,
      subject_type: s.subject_type,
      subject_id: s.subject_id,
      chunk_ix: Math.max(0, Math.floor(s.chunk_ix ?? 0)),
      content: s.content!.trim().slice(0, 8000),
      embedding: toVectorLiteral(vecs[i]),
      model: EMBED_MODEL,
      world_id: worldBySubject.get(`${s.subject_type}:${s.subject_id}`) ?? null,
    }));

    const { error } = await admin.from('embeddings').upsert(rows, { onConflict: 'owner_id,subject_type,subject_id,chunk_ix' });
    if (error) return json({ error: `Persist failed: ${error.message}` }, 500);

    return json({ embedded: rows.length, skipped: 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
