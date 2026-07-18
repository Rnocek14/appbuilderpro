// src/lib/garvis/esignRun.ts
// Impure half of auto-paperwork: template CRUD, contact lookup for merges, queueing an envelope
// behind ONE send_for_signature approval, and the owner-scoped status poll. Nothing here talks to
// DocuSign — that lives exclusively in docusign-send behind the approval spine.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';
import { mergePaperwork, decideSendable, type EsignRecipient } from './esign';
import { EXTRACT_TEMPLATE_SYSTEM, parseExtractedTemplate, type ExtractedTemplate } from './paperworkExtract';

export interface PaperworkTemplate {
  id: string; name: string; doc_kind: string; body: string; updated_at: string;
}

export interface EnvelopeRow {
  id: string; title: string; status: string; recipients: EsignRecipient[];
  envelope_id: string | null; sent_at: string | null; completed_at: string | null; created_at: string;
}

export async function listTemplates(): Promise<PaperworkTemplate[]> {
  const { data, error } = await supabase.from('paperwork_templates')
    .select('id, name, doc_kind, body, updated_at').order('updated_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as PaperworkTemplate[];
}

export async function saveTemplate(input: { id?: string; name: string; docKind?: string; body: string; worldId?: string | null }): Promise<PaperworkTemplate> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const name = input.name.trim();
  if (!name) throw new Error('Name the template.');
  const row = {
    owner_id: uid, world_id: input.worldId ?? null, name,
    doc_kind: input.docKind ?? 'agreement', body: input.body, updated_at: new Date().toISOString(),
  };
  const q = input.id
    ? supabase.from('paperwork_templates').update(row).eq('id', input.id).select('id, name, doc_kind, body, updated_at').single()
    : supabase.from('paperwork_templates').insert(row).select('id, name, doc_kind, body, updated_at').single();
  const { data, error } = await q;
  if (error || !data) throw new Error(`Could not save the template: ${error?.message ?? 'unknown'}`);
  return data as PaperworkTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('paperwork_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ContactHit { id: string; full_name: string | null; email: string | null }

export async function searchContacts(q: string): Promise<ContactHit[]> {
  const needle = q.trim();
  if (needle.length < 2) return [];
  const { data, error } = await supabase.from('contacts')
    .select('id, full_name, email')
    .or(`full_name.ilike.%${needle.replace(/[%,()]/g, '')}%,email.ilike.%${needle.replace(/[%,()]/g, '')}%`)
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactHit[];
}

/** Queue a merged document for signature: the honesty gate refuses gaps CLIENT-side too, the row
 *  snapshots the exact text, and ONE approval goes to the Queue. docusign-send re-checks it all. */
export async function queueForSignature(input: {
  title: string; templateBody: string; fields: Record<string, string>;
  recipients: EsignRecipient[]; templateId?: string | null; worldId?: string | null;
}): Promise<{ envelopeRowId: string }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const title = input.title.trim();
  if (!title) throw new Error('Give the document a title.');

  const merged = mergePaperwork(input.templateBody, input.fields);
  const sendable = decideSendable(merged, input.recipients);
  if (!sendable.ok) throw new Error(sendable.reason ?? 'Not sendable.');

  const { data: row, error } = await supabase.from('esign_envelopes').insert({
    owner_id: uid, world_id: input.worldId ?? null, template_id: input.templateId ?? null,
    title, merged_body: merged.body, recipients: input.recipients, status: 'queued',
  }).select('id').single();
  if (error || !row) throw new Error(`Could not queue the envelope: ${error?.message ?? 'unknown'}`);

  const approvalId = await enqueueApproval({
    kind: 'send_for_signature',
    title: `Send "${title}" for signature → ${input.recipients.map((r) => r.email).join(', ')}`,
    preview: `${merged.body.slice(0, 400)}${merged.body.length > 400 ? '…' : ''}`,
    payload: { envelope_row_id: row.id },
  });
  await supabase.from('esign_envelopes').update({ approval_id: approvalId }).eq('id', row.id);
  return { envelopeRowId: row.id as string };
}

export async function listEnvelopes(limit = 12): Promise<EnvelopeRow[]> {
  const { data, error } = await supabase.from('esign_envelopes')
    .select('id, title, status, recipients, envelope_id, sent_at, completed_at, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvelopeRow[];
}

export async function pollEnvelopeStatus(rowId: string): Promise<{ status: string; recipients: EsignRecipient[] }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string; status?: string; recipients?: EsignRecipient[] }>(
    'docusign-send', { body: { action: 'status', row_id: rowId } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { status: data?.status ?? 'unknown', recipients: data?.recipients ?? [] };
}

/**
 * TEMPLATE EXTRACTION: a pasted sample document → a reviewed, tokenized template. One
 * credit-metered model call through the cluster-chat chokepoint; the parse gauntlet
 * (paperworkExtract.ts) reconciles fields against the body and refuses non-documents. The result
 * PRE-FILLS the studio editor — the operator reviews and saves; nothing persists here.
 */
export async function extractPaperworkTemplate(sampleText: string, hint?: string): Promise<ExtractedTemplate> {
  const sample = sampleText.trim();
  if (sample.length < 200) throw new Error('Paste the whole document — a fragment under ~200 characters cannot become a template.');
  const { data, error } = await supabase.functions.invoke('cluster-chat', {
    body: {
      system: EXTRACT_TEMPLATE_SYSTEM,
      context: hint ? `OPERATOR'S NOTE ABOUT THIS DOCUMENT: ${hint.slice(0, 300)}` : '',
      history: [],
      message: `THE SAMPLE DOCUMENT:\n${sample.slice(0, 24_000)}\n\nConvert it to a template now (strict JSON).`,
    },
  });
  if (error) throw new Error(error.message);
  const parsed = parseExtractedTemplate(((data as { text?: string })?.text ?? ''));
  if (!parsed) throw new Error('That did not extract into a usable template — make sure it is a full document (the extractor refuses fragments rather than fabricating).');
  return parsed;
}
