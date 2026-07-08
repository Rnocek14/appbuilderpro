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

    // VECTORS mode — return embeddings without persisting (server-side key for the browser).
    if (Array.isArray(body.texts)) {
      const texts = body.texts.filter((t) => typeof t === 'string');
      if (!texts.length) return json({ vectors: [] });
      if (texts.length > 256) return json({ error: 'Max 256 texts per call.' }, 400);
      if (!embeddingsConfigured()) return json({ vectors: null, reason: 'embeddings_not_configured' });
      const vectors = await embedTexts(texts);
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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const rows = subjects.map((s, i) => ({
      owner_id: user.id,
      subject_type: s.subject_type,
      subject_id: s.subject_id,
      chunk_ix: Math.max(0, Math.floor(s.chunk_ix ?? 0)),
      content: s.content!.trim().slice(0, 8000),
      embedding: toVectorLiteral(vecs[i]),
      model: EMBED_MODEL,
    }));

    const { error } = await admin.from('embeddings').upsert(rows, { onConflict: 'owner_id,subject_type,subject_id,chunk_ix' });
    if (error) return json({ error: `Persist failed: ${error.message}` }, 500);

    return json({ embedded: rows.length, skipped: 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
