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
import { complete, completeVision, corsHeaders, parseJson, modelForPlan } from '../_shared/ai.ts';
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
  cluster_id?: string;
  /** G2: images enter the brain as pixels — client sends a downscaled base64 (<=~1.5MB). */
  image_base64?: string;
}

const SUMMARY_SYSTEM = `You classify a document for a personal AI "second brain". Given the title and
text, return STRICT JSON only:
{"summary": "1-3 plain sentences on what this is and why it matters",
 "concepts": ["<=8 key entities/topics, lowercase"],
 "why_matters": "one sentence: what decision or work this could change — grounded ONLY in the text",
 "question": "one question this raises that the text cannot answer, or null"}
No preamble, no markdown fences. Never invent facts not in the text.`;

// G2 — photos are not just assets, they are understanding. The caption is the image's text
// body: it gets summarized-as-caption, embedded, classified, and recommended in ONE pass.
const VISION_SYSTEM = `You are cataloguing an image for a business's living asset library (often
artwork, products, or process shots). Look at the image and return STRICT JSON only:
{"caption": "1-2 sentences: what this actually shows",
 "subject": "the main subject, short",
 "style": "visual style, short (e.g. abstract geometric, photoreal, hand-drawn)",
 "medium": "what it appears to be made with/of, or null",
 "colors": ["<=4 dominant colors, plain words"],
 "mood": "one or two words",
 "themes": ["<=5 lowercase theme tags"],
 "suggested_use": ["subset of: website, social, video, print — where this image would work best"],
 "quality_note": "one honest note: hero-grade / usable / weak (blurry, dark, cluttered) and why",
 "why_matters": "one sentence: what this adds to the business's asset base",
 "question": "one question worth asking the owner about this image, or null"}
Describe ONLY what is visible. Never invent an artist, title, price, or location. No markdown fences.`;

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
    const isImage = !!body.image_base64 && (body.mime ?? '').startsWith('image/');
    if (!text && !body.source_url && !isImage) return json({ error: 'extracted_text, image_base64, or source_url is required.' }, 400);
    if (body.image_base64 && body.image_base64.length > 2_400_000) return json({ error: 'Image too large — the client should downscale before ingest.' }, 413);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // OWNERSHIP GATE: world_id / cluster_id / app_id are caller-supplied and this function writes
    // with the service role — verify they belong to the caller or drop them. Never write across
    // tenants because a client lied about an id.
    if (body.world_id) {
      const { data: w } = await admin.from('knowledge_worlds').select('id').eq('id', body.world_id).eq('owner_id', user.id).maybeSingle();
      if (!w) body.world_id = undefined;
    }
    if (body.cluster_id) {
      const { data: c } = await admin.from('knowledge_clusters').select('id').eq('id', body.cluster_id).eq('owner_id', user.id).maybeSingle();
      if (!c) body.cluster_id = undefined;
    }

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
      cluster_id: body.cluster_id ?? null,
      extracted_text: text.slice(0, 200000),
      status: 'uploaded',
    }).select('id').single();
    if (insErr || !docRow) return json({ error: `Could not save document: ${insErr?.message}` }, 500);
    const documentId = (docRow as { id: string }).id;

    // 2) Understand the upload — ONE metered call whether text or pixels. Text: summary +
    //    concepts + why-this-matters. Image: vision caption + style/theme/mood/use + the same
    //    why-this-matters discipline. Best-effort — an upload is still kept un-enriched.
    let summary = '';
    let concepts: string[] = [];
    let whyMatters: string | null = null;
    let openQuestion: string | null = null;
    let vision: Record<string, unknown> | null = null;
    if (text || isImage) {
      try {
        await checkCredits(admin, user.id, 'discover');
        const plan = await getUserPlan(admin, user.id);
        const m = modelForPlan(plan);
        const strArr = (v: unknown, cap: number) =>
          (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').map((x: string) => x.toLowerCase().trim()).filter(Boolean).slice(0, cap);
        if (isImage) {
          const r = await completeVision(
            VISION_SYSTEM,
            `TITLE: ${title}\nCatalogue this image. JSON only.`,
            [{ mediaType: body.mime ?? 'image/jpeg', base64: body.image_base64! }],
            { provider: m.provider, model: m.model, maxTokens: 600 },
          );
          await spendCredits(admin, user.id, { costUsd: r.costUsd, kind: 'discover', provider: m.provider, model: m.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
          const p = parseJson<Record<string, unknown>>(r.text) ?? {};
          summary = String(p.caption ?? '').trim().slice(0, 1000);
          const themes = strArr(p.themes, 5);
          concepts = [...new Set([...themes, String(p.style ?? '').toLowerCase().trim(), String(p.medium ?? '').toLowerCase().trim()])].filter(Boolean).slice(0, 8);
          whyMatters = String(p.why_matters ?? '').trim().slice(0, 400) || null;
          openQuestion = String(p.question ?? '').trim().slice(0, 300) || null;
          const uses = strArr(p.suggested_use, 4).filter((u) => ['website', 'social', 'video', 'print'].includes(u));
          vision = {
            subject: String(p.subject ?? '').slice(0, 120), style: String(p.style ?? '').slice(0, 120),
            medium: String(p.medium ?? '').slice(0, 120) || null, colors: strArr(p.colors, 4),
            mood: String(p.mood ?? '').slice(0, 60), themes, suggested_use: uses,
            quality_note: String(p.quality_note ?? '').slice(0, 200),
          };
        } else {
          const r = await complete(
            [
              { role: 'system', content: SUMMARY_SYSTEM },
              { role: 'user', content: `TITLE: ${title}\n\nTEXT:\n${text.slice(0, 24000)}` },
            ],
            { provider: m.provider, model: m.model, maxTokens: 500 },
          );
          await spendCredits(admin, user.id, { costUsd: r.costUsd, kind: 'discover', provider: m.provider, model: m.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
          const parsed = parseJson<{ summary?: string; concepts?: string[]; why_matters?: string; question?: string }>(r.text) ?? {};
          summary = (parsed.summary ?? '').trim().slice(0, 1000);
          concepts = (parsed.concepts ?? []).filter((c) => typeof c === 'string').map((c) => c.toLowerCase().trim()).filter(Boolean).slice(0, 8);
          whyMatters = (parsed.why_matters ?? '').trim().slice(0, 400) || null;
          openQuestion = (parsed.question ?? '').trim().slice(0, 300) || null;
        }
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

    if (embeddingsConfigured() && (text || summary)) {
      // Images embed their CAPTION + themes — the caption is the image's text body.
      const visionTags = vision ? [vision.subject, vision.style, (vision.themes as string[]).join(' ')].filter(Boolean).join(' · ') : '';
      const embedText = [title, summary, visionTags, text.slice(0, 6000)].filter(Boolean).join('\n\n');
      const vec = await embedOne(embedText);
      if (vec) {
        await admin.from('embeddings').upsert({
          owner_id: user.id, subject_type: 'document', subject_id: documentId, chunk_ix: 0,
          content: embedText.slice(0, 8000), embedding: toVectorLiteral(vec), model: EMBED_MODEL,
        }, { onConflict: 'owner_id,subject_type,subject_id,chunk_ix' });

        // 3b) CHUNK THE REST — chunk 0 covers only the head (title+summary+first 6k), so semantic
        // recall over anything past ~page 3 was silently zero (deep scan P2). Split the remaining
        // text into overlapping windows and embed each. Bounded (MAX_CHUNKS) to cap cost/time.
        const CHUNK = 1800, OVERLAP = 200, MAX_CHUNKS = 11;
        if (text.length > 6000) {
          const body = text.slice(6000);
          let ix = 1;
          for (let pos = 0; pos < body.length && ix <= MAX_CHUNKS; pos += (CHUNK - OVERLAP)) {
            const piece = body.slice(pos, pos + CHUNK).trim();
            if (piece.length < 80) break;
            const cvec = await embedOne(piece);
            if (!cvec) break; // embedding hiccup — stop rather than spin; the head is already indexed
            await admin.from('embeddings').upsert({
              owner_id: user.id, subject_type: 'document', subject_id: documentId, chunk_ix: ix,
              content: piece.slice(0, 8000), embedding: toVectorLiteral(cvec), model: EMBED_MODEL,
            }, { onConflict: 'owner_id,subject_type,subject_id,chunk_ix' });
            ix++;
          }
        }

        // 4) CLASSIFY — nearest neighbors across the brain (excluding this doc). The nearest doc/artifact
        //    that already has a world becomes the suggested home; the rest are surfaced as connections.
        // _k is raised (was 8) to offset chunk fan-out: a neighbor doc now owns up to ~12 chunk
        // vectors, so a small _k could be filled by one dominant doc and starve distinct neighbors
        // after the dedup-by-subject below (deep scan verification).
        const { data: matches } = await admin.rpc('match_embeddings', {
          _owner: user.id, _query: toVectorLiteral(vec), _k: 24,
          _subject_type: null, _min_similarity: 0.3, _exclude_subject: documentId,
        });
        // Dedup by subject_id — a neighbor doc now has multiple chunks, so keep only its best hit.
        const seenSubj = new Set<string>();
        connections = ((matches ?? []) as typeof connections)
          .filter((mtch) => (seenSubj.has(mtch.subject_id) ? false : (seenSubj.add(mtch.subject_id), true)))
          .slice(0, 5);

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

    // Why-this-matters feeds the world's heartbeat: the question lands in open_questions
    // (capped at 5) so fresh uploads sharpen tomorrow morning, not just the archive.
    const homeWorld = body.world_id ?? suggestedWorldId;
    if (openQuestion && homeWorld) {
      const { data: intel } = await admin.from('world_intelligence')
        .select('id, open_questions').eq('world_id', homeWorld).eq('owner_id', user.id).maybeSingle();
      if (intel) {
        const qs = [...new Set([openQuestion, ...(((intel.open_questions as string[] | null) ?? []))])].slice(0, 5);
        await admin.from('world_intelligence').update({ open_questions: qs }).eq('id', intel.id);
      }
    }

    // Finalize: record summary/concepts + the classification proposal in meta. world_id stays as the
    // user provided (or null) — the SUGGESTION is a proposal, not an auto-file.
    await admin.from('documents').update({
      summary: summary || null,
      concepts,
      status: summary ? 'classified' : 'extracted',
      meta: {
        suggested_world_id: suggestedWorldId, connection_count: connections.length,
        ...(vision ? { vision } : {}),
        ...(whyMatters ? { why_matters: whyMatters } : {}),
        ...(openQuestion ? { open_question: openQuestion } : {}),
      },
    }).eq('id', documentId);

    return json({
      document_id: documentId,
      status: summary ? 'classified' : 'extracted',
      summary,
      concepts,
      vision,
      why_matters: whyMatters,
      open_question: openQuestion,
      suggested_world_id: suggestedWorldId,
      connections,
      insight_id: insightId,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return json({ error: e.message, remaining: e.remaining }, 402);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
