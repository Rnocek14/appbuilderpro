// src/lib/garvis/briefDocRun.ts
// Impure half of brief-this-upload: load a document's STORED text (documents.extracted_text — the
// same text retrieval grounds on), map each section to notes, reduce the notes to one brief, and
// persist it on the document's meta so a brief is computed once and reread free. The chunking math,
// prompt contracts, coverage honesty, and refusal gate live in briefDoc.ts (verified).

import { supabase } from '../supabase';
import {
  chunkForBrief, buildMapUser, buildReduceContext, coverageLine, decideBrief,
  BRIEF_MAP_SYSTEM, BRIEF_REDUCE_SYSTEM, MAX_MAP_CHUNKS, type DocBrief,
} from './briefDoc';

interface DocRow { id: string; title: string; extracted_text: string | null; meta: Record<string, unknown> | null }

async function callChat(system: string, context: string, message: string): Promise<{ text: string; costUsd: number }> {
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system, context, history: [], message },
  });
  if (error) throw new Error(error.message);
  return {
    text: ((data as { text?: string })?.text ?? '').trim(),
    costUsd: ((data as { costUsd?: number })?.costUsd) ?? 0,
  };
}

/** Brief one stored document. Computes map-reduce over its own text; persists to meta.brief. */
export async function briefDocument(documentId: string): Promise<DocBrief & { title: string }> {
  const { data, error } = await supabase.from('documents')
    .select('id, title, extracted_text, meta').eq('id', documentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Document not found.');
  const doc = data as DocRow;
  const text = (doc.extracted_text ?? '').trim();

  // The gate owns the no-text refusal — never summarize nothing.
  if (text.length < 80) {
    return { ...decideBrief({ sourceLength: text.length, reply: '', coverage: '' }), title: doc.title };
  }

  const allChunks = chunkForBrief(text);
  const mapped = allChunks.slice(0, MAX_MAP_CHUNKS); // coverage line reports any cut honestly
  let costUsd = 0;

  // MAP — each section to notes. Sections run sequentially (gentle on the gateway); a single failed
  // section becomes an honest placeholder rather than sinking the whole brief.
  const notes: string[] = [];
  for (let i = 0; i < mapped.length; i++) {
    try {
      const r = await callChat(BRIEF_MAP_SYSTEM, mapped[i], buildMapUser(i, mapped.length));
      costUsd += r.costUsd;
      notes.push(r.text || '(no notes returned for this section)');
    } catch (e) {
      notes.push(`(section ${i + 1} could not be read: ${e instanceof Error ? e.message.slice(0, 80) : 'error'})`);
    }
  }

  // REDUCE — one brief from the notes; the context builder marks anything that didn't fit.
  const { context, dropped } = buildReduceContext(notes);
  const coverage = coverageLine(allChunks.length, mapped.length, dropped);
  const r = await callChat(BRIEF_REDUCE_SYSTEM, context, `Compose the brief of "${doc.title}" now. ${coverage}`);
  costUsd += r.costUsd;

  const brief = decideBrief({ sourceLength: text.length, reply: r.text, coverage, costUsd });

  // Persist a standing brief on the document (merge meta — never clobber classification fields).
  if (!brief.refusal) {
    await supabase.from('documents').update({
      meta: { ...(doc.meta ?? {}), brief: { text: brief.brief, coverage: brief.coverage, at: new Date().toISOString() } },
    }).eq('id', doc.id).then(() => {}, () => { /* best-effort — the brief still returns */ });
  }
  return { ...brief, title: doc.title };
}

/** A previously computed brief, if the document has one (free reread). */
export function storedBrief(meta: Record<string, unknown> | null | undefined): { text: string; coverage: string; at: string } | null {
  const b = (meta as { brief?: { text?: string; coverage?: string; at?: string } } | null)?.brief;
  return (b && typeof b.text === 'string' && b.text.trim())
    ? { text: b.text, coverage: String(b.coverage ?? ''), at: String(b.at ?? '') }
    : null;
}
