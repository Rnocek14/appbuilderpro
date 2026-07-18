// src/lib/garvis/paperworkExtract.ts
// TEMPLATE EXTRACTION (pure core) — the Paperwork Engine's missing front half: a client's real
// document (pasted from their sample) becomes a reusable {{token}} template compatible with the
// EXISTING merge/sign rail (esignCore's TOKEN format, mergePaperwork's visible-gap discipline,
// the approval-gated DocuSign send). Extraction never invents document language: everything that
// doesn't vary stays verbatim; only clearly deal-specific values become tokens.
//
// The result PRE-FILLS the Paperwork studio's editor — the operator reviews and saves; nothing
// lands as a template without their eyes on it. Verified by paperworkExtract.verify.ts.

import { templateTokens } from './esign';

export interface ExtractedField { token: string; label: string; hint: string }
export interface ExtractedTemplate {
  name: string;
  doc_kind: string;
  body: string;
  fields: ExtractedField[];
}

export const MAX_FIELDS = 24;

export const EXTRACT_TEMPLATE_SYSTEM = `You convert ONE real sample document into a reusable fill-in template for a
document-signing system. The operator will re-use it for many deals/clients.

Return STRICT JSON only (no fences, no preamble):
{"name":"<template name, <=60 chars, from what the document IS>",
 "doc_kind":"agreement"|"listing"|"disclosure"|"invoice"|"letter"|"other",
 "body":"<the FULL document text with each deal-specific value replaced by a {{token}}>",
 "fields":[{"token":"<snake_case token>","label":"<human label>","hint":"<what goes here, from context>"}]}

RULES:
- Keep every non-varying word VERBATIM — clauses, boilerplate, headings stay exactly as written. You are
  tokenizing, not rewriting, and never "improving" legal language.
- Tokenize ONLY values that clearly vary per use: names, addresses, dates, prices, percentages, durations,
  property/deal identifiers. When unsure whether something varies, LEAVE IT VERBATIM.
- Tokens are snake_case inside double braces: {{client_name}}, {{listing_price}}. Reuse the SAME token for
  the same value appearing multiple times.
- Every token in body appears once in fields, with a label and a grounded hint ("the seller's full legal
  name as written on the deed" — from the document's own context, never invented facts).
- If the text is not actually a document (a chat message, a fragment under ~200 chars), return
  {"name":"","doc_kind":"other","body":"","fields":[]} — never fabricate a template.`;

/** Strip markdown fences defensively (house parser discipline). */
function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```[a-z]*\n?([\s\S]*?)\n?```$/.exec(t);
  return m ? m[1].trim() : t;
}

/**
 * Parse gauntlet. Returns null when nothing usable came back (caller shows the honest error).
 * Fields are reconciled AGAINST THE BODY: orphan fields (no matching token) are dropped, tokens
 * missing a field get one generated from the token name — the body is the source of truth.
 */
export function parseExtractedTemplate(raw: string): ExtractedTemplate | null {
  let obj: unknown;
  try { obj = JSON.parse(stripFences(raw)); } catch { return null; }
  const o = (obj ?? {}) as Record<string, unknown>;
  const body = typeof o.body === 'string' ? o.body.trim() : '';
  if (body.length < 200) return null; // refused or fabricated-thin — no template
  const name = (typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Extracted template').slice(0, 60);
  const doc_kind = typeof o.doc_kind === 'string' && ['agreement', 'listing', 'disclosure', 'invoice', 'letter', 'other'].includes(o.doc_kind)
    ? o.doc_kind : 'other';

  const bodyTokens = templateTokens(body).map((t) => t.trim());
  const rawFields = Array.isArray(o.fields) ? o.fields : [];
  const byToken = new Map<string, ExtractedField>();
  for (const f of rawFields) {
    const ff = (f ?? {}) as Record<string, unknown>;
    const token = typeof ff.token === 'string' ? ff.token.trim() : '';
    if (!token || !bodyTokens.includes(token)) continue; // orphan → dropped; the body is truth
    if (byToken.has(token)) continue;
    byToken.set(token, {
      token,
      label: (typeof ff.label === 'string' && ff.label.trim() ? ff.label.trim() : token.replace(/_/g, ' ')).slice(0, 60),
      hint: (typeof ff.hint === 'string' ? ff.hint.trim() : '').slice(0, 160),
    });
  }
  // Tokens the model used but forgot to list — generated, never lost.
  for (const t of bodyTokens) {
    if (!byToken.has(t)) byToken.set(t, { token: t, label: t.replace(/_/g, ' '), hint: '' });
  }
  const fields = [...byToken.values()].slice(0, MAX_FIELDS);

  // A "template" with zero variable fields is just a copy of the sample — refuse it honestly so
  // the operator pastes a better sample instead of saving something that can never be filled.
  if (fields.length === 0) return null;
  // Field order follows body appearance — the fill form reads like the document.
  fields.sort((a, b) => bodyTokens.indexOf(a.token) - bodyTokens.indexOf(b.token));

  return { name, doc_kind, body, fields };
}
