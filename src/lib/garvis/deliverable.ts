// src/lib/garvis/deliverable.ts
// DELIVERABLE GENERATOR — pure core (no Supabase, no DOM; verified by deliverable.verify.ts).
//
// The #2 objective class. Where the answering desk (assist.ts) drafts a reply you paste into a
// thread, this produces a PORTABLE, FORMATTED DOCUMENT you hand to someone — a proposal, report,
// one-pager, brief, or letter — grounded in this world's knowledge, and EXPORTED (Markdown, print
// to PDF, or a real .docx). This module owns the DOCUMENT CONTRACT, the parse, the honesty gate,
// and the deterministic serializers (markdown + the Word document body). Everything impure —
// retrieval, the model call, zipping the .docx, persistence — lives in deliverableRun.ts.
//
// The honesty line is the same discipline as the rest of Garvis, tuned for documents: a deliverable
// may legitimately be composed from the owner's own brief even with no knowledge base behind it (a
// proposal is the owner's words), but it must NEVER invent a price, date, name, term, or number —
// anything it needs and doesn't have comes back as "[needs your input: …]" for the owner to fill
// before it leaves. The owner always reviews and sends; nothing is auto-delivered.

import { extractGaps } from './assist';

export type DocType = 'proposal' | 'report' | 'one_pager' | 'brief' | 'letter' | 'summary';

export interface DocSection {
  heading: string; // '' for a lead paragraph before the first heading
  body: string;
}

export interface DeliverSource {
  id: string;
  title: string;
  snippet: string;
  where: string | null;
}

export interface Deliverable {
  docType: DocType;
  title: string;
  subject: string;              // who/what it's for — carried for the record + batch labeling
  sections: DocSection[];
  sources: DeliverSource[];
  grounded: boolean;            // true when knowledge-base sources backed it (vs. the owner's brief alone)
  refusal: string | null;       // set when the draft was too thin to stand as a document
  gaps: string[];               // "[needs your input: …]" markers pulled out of the body
  costUsd: number;
}

/** The document types this generator knows, each with the section skeleton it composes to. The
 *  skeleton is a STARTING SHAPE the model fills or adapts — not a rigid form. */
export const DOC_TYPES: Record<DocType, { label: string; blurb: string; sections: string[] }> = {
  proposal:  { label: 'Proposal',  blurb: 'A pitch you send to win the work.',        sections: ['Overview', 'Scope of work', 'Approach', 'Timeline', 'Investment', 'Next steps'] },
  report:    { label: 'Report',    blurb: 'Findings written up for someone to read.', sections: ['Summary', 'Background', 'Findings', 'Recommendations'] },
  one_pager: { label: 'One-pager', blurb: 'A single-page overview.',                  sections: ['What it is', 'Why it matters', 'How it works', 'Get in touch'] },
  brief:     { label: 'Brief',     blurb: 'A short directive that aligns people.',     sections: ['Objective', 'Background', 'Deliverables', 'Constraints'] },
  letter:    { label: 'Letter',    blurb: 'A formal message to a person.',            sections: ['Opening', 'Body', 'Close'] },
  summary:   { label: 'Summary',   blurb: 'A condensed version of source material.',  sections: ['Overview', 'Key points', 'Details'] },
};

export function isDocType(v: string): v is DocType {
  return Object.prototype.hasOwnProperty.call(DOC_TYPES, v);
}

// ---------------------------------------------------------------------------
// The document contract
// ---------------------------------------------------------------------------

export const DELIVER_SYSTEM = `You are Garvis writing a finished, ready-to-hand-over DOCUMENT on the
owner's behalf. Produce the complete document — the reader will receive exactly what you write.
Rules:
- Structure it with the SECTION HEADINGS provided as a starting shape; adapt or drop a section if the
  document genuinely doesn't need it, but keep it professional and complete.
- Ground every factual claim in the SOURCES when they are provided (the owner's real materials). Do
  NOT invent prices, dates, names, terms, numbers, quantities, or commitments. If a specific you need
  is not available, either write around it or mark it inline EXACTLY as "[needs your input: <what>]"
  so the owner fills it before sending. Never guess a specific.
- Write in the owner's voice and tone. Direct, specific, no filler, never "as an AI".
- OUTPUT MARKDOWN ONLY: one "# Title" line, then each section as "## Heading" followed by its prose.
  Use "- " bullets and short paragraphs where they help. No code fences, no commentary before or after.`;

/** Build the user turn: the document type + its skeleton, who it's for, the owner's brief (their
 *  instructions and any facts they typed), the retrieved knowledge base, and the owner's tone. */
export function buildDeliverUser(
  docType: DocType,
  subject: string,
  brief: string,
  sources: DeliverSource[],
  tone: string | null,
): string {
  const meta = DOC_TYPES[docType];
  const kb = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}${s.where ? ` (${s.where})` : ''}: ${s.snippet.replace(/\s+/g, ' ').trim()}`).join('\n')
    : '(no knowledge base was attached — compose from the brief only, and mark any missing specific as [needs your input: …])';
  return [
    tone ? `OWNER'S VOICE: ${tone}` : '',
    `DOCUMENT: a ${meta.label.toLowerCase()} — ${meta.blurb}`,
    `SUGGESTED SECTIONS (adapt as needed): ${meta.sections.join(' · ')}`,
    `FOR: ${subject.trim().slice(0, 300) || '(unspecified — keep it general)'}`,
    ``,
    `KNOWLEDGE BASE (ground factual claims in these; never invent beyond them):`,
    kb,
    ``,
    `OWNER'S BRIEF (what they want this document to say / do):`,
    (brief.trim() || '(no extra brief — build a strong default from the type and subject)').slice(0, 4000),
    ``,
    `Write the complete ${meta.label.toLowerCase()} now, in markdown.`,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Parsing the model's markdown into a structured document
// ---------------------------------------------------------------------------

/** Parse "# Title / ## Heading / body" markdown into a title + sections. Deterministic and tolerant:
 *  content before the first "##" becomes a lead section (heading ''), and a document with no headings
 *  at all becomes a single section so nothing is ever dropped. */
export function parseDocument(raw: string, docType: DocType, subject: string): { title: string; sections: DocSection[] } {
  const clean = (raw ?? '').replace(/```+\w*\n?|```+/g, '').trim();
  const fallbackTitle = `${DOC_TYPES[docType].label}${subject.trim() ? ` — ${subject.trim()}` : ''}`;
  if (!clean) return { title: fallbackTitle, sections: [] };

  const lines = clean.split('\n');
  let title = '';
  const sections: DocSection[] = [];
  let cur: DocSection | null = null;
  const push = () => { if (cur && cur.body.trim()) { cur.body = cur.body.trim(); sections.push(cur); } cur = null; };

  for (const line of lines) {
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^#{2,}\s+(.+)$/.exec(line);
    if (h2) { push(); cur = { heading: h2[1].trim(), body: '' }; continue; }
    if (h1 && !title) { title = h1[1].trim(); continue; }
    if (!cur) cur = { heading: '', body: '' };
    cur.body += (cur.body ? '\n' : '') + line;
  }
  push();

  // A document with body but no headings at all → keep it as one untitled section.
  return { title: title || fallbackTitle, sections };
}

// ---------------------------------------------------------------------------
// The honesty gate
// ---------------------------------------------------------------------------

/** Total visible characters across all section bodies — the "is there really a document here?" test. */
function bodyLength(sections: DocSection[]): number {
  return sections.reduce((n, s) => n + s.body.replace(/\s+/g, ' ').trim().length, 0);
}

/**
 * Decide whether a generated document may stand. Unlike the answering desk, an empty knowledge base
 * does NOT force a refusal — a deliverable can legitimately be composed from the owner's own brief.
 * The gate refuses only when the draft is too thin to be a real document, and it always surfaces the
 * "[needs your input: …]" gaps so the owner fills every invented-specific risk before it leaves.
 */
export function decideDeliverable(input: {
  docType: DocType; subject: string; title: string; sections: DocSection[];
  sources: DeliverSource[]; costUsd?: number;
}): Deliverable {
  const costUsd = input.costUsd ?? 0;
  const sections = input.sections;
  const grounded = input.sources.length > 0;

  if (sections.length === 0 || bodyLength(sections) < 80) {
    return {
      docType: input.docType, title: input.title, subject: input.subject,
      sections: [], sources: input.sources, grounded: false, gaps: [], costUsd,
      refusal: 'The draft came back too thin to stand as a document — give it a fuller brief (what it should say, for whom) or attach source material to the world, and I’ll build the real thing.',
    };
  }

  const allBody = sections.map((s) => s.body).join('\n');
  return {
    docType: input.docType, title: input.title, subject: input.subject,
    sections, sources: input.sources, grounded, refusal: null,
    gaps: extractGaps(allBody), costUsd,
  };
}

// ---------------------------------------------------------------------------
// Deterministic serializers — the exports
// ---------------------------------------------------------------------------

/** The document as portable Markdown (the .md export and the on-record detail). */
export function toMarkdown(doc: Deliverable): string {
  const parts = [`# ${doc.title}`];
  for (const s of doc.sections) {
    parts.push(s.heading ? `## ${s.heading}\n\n${s.body}` : s.body);
  }
  return parts.join('\n\n');
}

/** Plain text (the copy-to-clipboard export) — headings kept, markdown bullets softened to •. */
export function toPlainText(doc: Deliverable): string {
  const parts = [doc.title, ''];
  for (const s of doc.sections) {
    if (s.heading) { parts.push(s.heading.toUpperCase(), ''); }
    parts.push(s.body.replace(/^\s*[-*]\s+/gm, '• '), '');
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const xmlEsc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One Word paragraph. `opts.bold`/`opts.size` (half-points) style the run; bullets get an indent. */
function docxPara(text: string, opts: { bold?: boolean; size?: number; bullet?: boolean } = {}): string {
  const rPr = `${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : ''}`;
  const ind = opts.bullet ? '<w:ind w:left="360" w:hanging="180"/>' : '';
  const spacing = '<w:spacing w:after="120"/>';
  const pPr = `<w:pPr>${spacing}${ind}</w:pPr>`;
  const bullet = opts.bullet ? '• ' : '';
  return `<w:p>${pPr}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(bullet + text)}</w:t></w:r></w:p>`;
}

/** The body of word/document.xml (the run half wraps it with the static OOXML boilerplate + zip).
 *  Pure and deterministic so it can be verified without a zip library or a browser. */
export function docxDocumentXml(doc: Deliverable): string {
  const paras: string[] = [docxPara(doc.title, { bold: true, size: 44 })];
  for (const s of doc.sections) {
    if (s.heading) paras.push(docxPara(s.heading, { bold: true, size: 30 }));
    for (const raw of s.body.split(/\n+/)) {
      const line = raw.trim();
      if (!line) continue;
      const b = /^[-*]\s+(.+)$/.exec(line);
      paras.push(b ? docxPara(b[1], { bullet: true }) : docxPara(line));
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body>',
    paras.join(''),
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
    '</w:body></w:document>',
  ].join('');
}

/** A saved deliverable becomes a record on the world's shelf so the ledger learns which documents
 *  were kept vs. rewritten. Deterministic id from type+subject; kind 'doc', source 'garvis'. */
export function deliverableArtifact(doc: Deliverable): { id: string; kind: 'doc'; title: string; detail: string; source: 'garvis' } {
  const key = `${doc.docType}:${doc.subject}`;
  let h = 5381;
  for (const ch of key) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  const id = `doc-${(h >>> 0).toString(36)}`;
  const cited = doc.sources.map((s, i) => `[${i + 1}] ${s.title}`).join(' · ');
  const detail = `${toMarkdown(doc)}${cited ? `\n\n— grounded in: ${cited}` : ''}`;
  return { id, kind: 'doc', title: doc.title.slice(0, 80), detail, source: 'garvis' };
}
