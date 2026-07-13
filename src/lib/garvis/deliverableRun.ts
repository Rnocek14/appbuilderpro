// src/lib/garvis/deliverableRun.ts
// Impure half of the Deliverable Generator: ground a document in this world's knowledge base, draft
// it with the model, and package the real exports. The pure contract + honesty gate live in
// deliverable.ts; this half does retrieval, the model call, the .docx zip, and batch fan-out.

import JSZip from 'jszip';
import { supabase } from '../supabase';
import { retrieveSources } from './ask';
import {
  DELIVER_SYSTEM, buildDeliverUser, parseDocument, decideDeliverable, docxDocumentXml,
  type DocType, type Deliverable, type DeliverSource,
} from './deliverable';

/** The world's own voice, so documents sound like the owner (best-effort; null is fine). */
async function worldTone(worldId: string): Promise<string | null> {
  const { data } = await supabase.from('knowledge_worlds').select('business_context').eq('id', worldId).maybeSingle();
  const tone = (data as { business_context?: { tone?: string | null } } | null)?.business_context?.tone;
  return (typeof tone === 'string' && tone.trim()) ? tone.trim() : null;
}

/** Retrieve this world's knowledge for the document's subject + brief (grounding is optional for a
 *  deliverable — a document can be composed from the brief alone — so a miss is fine, not a refusal). */
async function groundFor(worldId: string, subject: string, brief: string): Promise<DeliverSource[]> {
  const query = `${subject}\n${brief}`.trim();
  if (query.length < 3) return [];
  const raw = await retrieveSources(query, { worldId, k: 6 }).catch(() => []);
  return raw.map((s) => ({ id: s.id, title: s.title, snippet: s.snippet, where: s.area ?? s.world ?? null }));
}

/** Generate ONE document: ground it, draft it, parse it, and run the honesty gate. A thrown model
 *  error propagates so the studio can show it honestly rather than fabricate a document. */
export async function generateDeliverable(input: {
  worldId: string; docType: DocType; subject: string; brief: string;
}): Promise<Deliverable> {
  const subject = (input.subject ?? '').trim();
  const brief = (input.brief ?? '').trim();
  const sources = await groundFor(input.worldId, subject, brief);
  const tone = await worldTone(input.worldId).catch(() => null);

  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: { system: DELIVER_SYSTEM, context: '', history: [], message: buildDeliverUser(input.docType, subject, brief, sources, tone) },
  });
  if (error) throw new Error(error.message);
  const reply = ((data as { text?: string })?.text ?? '').trim();
  const costUsd = ((data as { costUsd?: number })?.costUsd) ?? 0;

  const { title, sections } = parseDocument(reply, input.docType, subject);
  return decideDeliverable({ docType: input.docType, subject, title, sections, sources, costUsd });
}

/** Generate the SAME document type across a LIST of subjects — "twenty proposals from a list". Runs
 *  sequentially to stay gentle on the model; each result carries its own subject + gate verdict. Never
 *  throws for one bad item — a failed subject comes back as a refusal so the batch always completes. */
export async function generateBatch(input: {
  worldId: string; docType: DocType; brief: string; subjects: string[];
}): Promise<Deliverable[]> {
  const subjects = input.subjects.map((s) => s.trim()).filter(Boolean).slice(0, 25);
  const out: Deliverable[] = [];
  for (const subject of subjects) {
    try {
      out.push(await generateDeliverable({ worldId: input.worldId, docType: input.docType, subject, brief: input.brief }));
    } catch (e) {
      out.push(decideDeliverable({
        docType: input.docType, subject, title: subject, sections: [], sources: [],
      }));
      // The gate turns the empty sections into an honest refusal; note the real reason in it.
      const last = out[out.length - 1];
      last.refusal = `Couldn’t generate this one: ${e instanceof Error ? e.message : 'unknown error'}. The rest of the batch continued.`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The .docx export — a real Office Open XML package, zipped with the boilerplate parts.
// ---------------------------------------------------------------------------

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** Package a Deliverable into a real .docx Blob (Word/Pages/Google Docs all open it). */
export async function buildDocxBlob(doc: Deliverable): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', docxDocumentXml(doc));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
