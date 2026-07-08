// supabase/functions/ingest-document/index.ts
// The file/document intake pipeline (app_0021, docs/garvis-system-architecture.md §6 & Workflow).
// Given a document's TEXT (extracted client-side for PDFs/docx via pdf/mammoth, or raw for notes/urls),
// Garvis: (1) summarizes + extracts concepts, (2) persists the document, (3) embeds it (server-side,
// via embed-worker's shared helper), and (4) CLASSIFIES it — finds where it belongs by cosine
// proximity to everything already in the brain, and proposes a home + surfaces "Garvis noticed…"
// connections. Placement is a PROPOSAL (meta.suggested_world_id); the user confirms in the UI. Nothing
// is auto-filed, matching the vision's approval-first stance.
//
// Request (POST, authenticated):
//   { title, extracted_text, source_kind?, source_url?, mime?, bytes?, storage_path?, app_id?, world_id? }
// Response: { document_id, status, summary, concepts, suggested_world_id, connections, insight_id }
//
// Deploy: npx supabase functions deploy ingest-document
// Secrets: shares AI_PROVIDER/AI_MODEL + ANTHROPIC_API_KEY/OPENAI_API_KEY, and EMBEDDINGS_API_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { complete, corsHeaders, parseJson, modelForPlan } from '../_shared/ai.ts';
import { checkCredits, spendCredits, InsufficientCreditsError, getUserPlan } from '../_shared/credits.ts';
import { embedOne, embeddingsConfigured, toVectorLiteral, EMBED_MODEL } from '../_shared/embeddings.ts';

interface Body {
  title?: string;
  extracted_text?: string;
  source_kind?: string;
  source_url?: string;
  mime?: string;
  bytes?: number;
  storage_path?: string;
  app_id?: string;
  world_id?: string;
}

const SUMMARY_SYSTEM = `You classify a document for a personal AI "second brain". Given the title and
text, return STRICT JSON only:
{"summary": "1-3 plain sentences on what this is and why it matters", "concepts": ["<=8 key entities/topics, lowercase"]}
No preamble, no markdown fences. Never invent facts not in the text.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const title = (body.title ?? '').trim() || 'Untitled document';
    const text = (body.extracted_text ?? '').trim();
    if (!text && !body.source_url) return json({ error: 'extracted_text or source_url is required.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 1) Persist the document immediately (status uploaded) — so an upload is never lost even if the
    //    AI/embedding steps below fail. Status advances as each step succeeds.
    const { data: docRow, error: insErr } = await admin.from('documents').insert({
      owner_id: user.id,
      world_id: body.world_id ?? null,
      app_id: body.app_id ?? null,
      source_kind: (body.source_kind as string) ?? 'upload',
      title,
      storage_path: body.storage_path ?? null,
      source_url: body.source_url ?? null,
      mime: body.mime ?? null,
      bytes: body.bytes ?? null,
      extracted_text: text.slice(0, 200000),
      status: 'uploaded',
    }).select('id').single();
    if (insErr || !docRow) return json({ error: `Could not save document: ${insErr?.message}` }, 500);
    const documentId = (docRow as { id: string }).id;

    // 2) Summarize + extract concepts (best-effort — a document is still useful un-summarized).
    let summary = '';
    let concepts: string[] = [];
    if (text) {
      try {
        await checkCredits(admin, user.id, 'discover');
        const plan = await getUserPlan(admin, user.id);
        const m = modelForPlan(plan);
        const r = await complete(
          [
            { role: 'system', content: SUMMARY_SYSTEM },
            { role: 'user', content: `TITLE: ${title}\n\nTEXT:\n${text.slice(0, 24000)}` },
          ],
          { provider: m.provider, model: m.model, maxTokens: 500 },
        );
        await spendCredits(admin, user.id, { costUsd: r.costUsd, kind: 'discover', provider: m.provider, model: m.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
        const parsed = parseJson<{ summary?: string; concepts?: string[] }>(r.text) ?? {};
        summary = (parsed.summary ?? '').trim().slice(0, 1000);
        concepts = (parsed.concepts ?? []).filter((c) => typeof c === 'string').map((c) => c.toLowerCase().trim()).filter(Boolean).slice(0, 8);
      } catch (e) {
        if (e instanceof InsufficientCreditsError) {
          // Not fatal: keep the raw document, skip enrichment.
          await admin.from('documents').update({ status: 'extracted', error: 'out_of_credits_for_summary' }).eq('id', documentId);
        }
      }
    }

    // 3) Embed the document (title + summary + head of text) and persist the vector.
    let suggestedWorldId: string | null = null;
    let connections: { subject_type: string; subject_id: string; similarity: number; content: string }[] = [];
    let insightId: string | null = null;

    if (embeddingsConfigured()) {
      const embedText = [title, summary, text.slice(0, 6000)].filter(Boolean).join('\n\n');
      const vec = await embedOne(embedText);
      if (vec) {
        await admin.from('embeddings').upsert({
          owner_id: user.id, subject_type: 'document', subject_id: documentId, chunk_ix: 0,
          content: embedText.slice(0, 8000), embedding: toVectorLiteral(vec), model: EMBED_MODEL,
        }, { onConflict: 'owner_id,subject_type,subject_id,chunk_ix' });

        // 4) CLASSIFY — nearest neighbors across the brain (excluding this doc). The nearest doc/artifact
        //    that already has a world becomes the suggested home; the rest are surfaced as connections.
        const { data: matches } = await admin.rpc('match_embeddings', {
          _owner: user.id, _query: toVectorLiteral(vec), _k: 8,
          _subject_type: null, _min_similarity: 0.3, _exclude_subject: documentId,
        });
        connections = ((matches ?? []) as typeof connections).slice(0, 5);

        // Resolve a suggested world from the nearest document/cluster that has one.
        for (const mtch of connections) {
          if (mtch.subject_type === 'document') {
            const { data: d } = await admin.from('documents').select('world_id').eq('id', mtch.subject_id).maybeSingle();
            if (d?.world_id) { suggestedWorldId = d.world_id as string; break; }
          } else if (mtch.subject_type === 'cluster') {
            const { data: c } = await admin.from('knowledge_clusters').select('world_id').eq('id', mtch.subject_id).maybeSingle();
            if (c?.world_id) { suggestedWorldId = c.world_id as string; break; }
          }
        }

        // "Garvis noticed…" — only when there's a genuinely strong connection (score never invented).
        const top = connections[0];
        if (top && top.similarity >= 0.5) {
          const { data: ins } = await admin.from('insights').insert({
            owner_id: user.id,
            kind: 'connection',
            title: `"${title}" connects to something you already have`,
            body: `This document is closely related (${Math.round(top.similarity * 100)}% similar) to existing material in your universe. Consider linking them.`,
            refs: [
              { subject_type: 'document', subject_id: documentId, label: title },
              { subject_type: top.subject_type, subject_id: top.subject_id, label: (top.content ?? '').slice(0, 80) },
            ],
            score: Math.min(0.999, top.similarity),
          }).select('id').single();
          insightId = (ins as { id: string } | null)?.id ?? null;
        }
      }
    }

    // Finalize: record summary/concepts + the classification proposal in meta. world_id stays as the
    // user provided (or null) — the SUGGESTION is a proposal, not an auto-file.
    await admin.from('documents').update({
      summary: summary || null,
      concepts,
      status: 'classified',
      meta: { suggested_world_id: suggestedWorldId, connection_count: connections.length },
    }).eq('id', documentId);

    return json({
      document_id: documentId,
      status: 'classified',
      summary,
      concepts,
      suggested_world_id: suggestedWorldId,
      connections,
      insight_id: insightId,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return json({ error: e.message, remaining: e.remaining }, 402);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
