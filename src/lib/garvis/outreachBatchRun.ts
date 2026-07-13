// src/lib/garvis/outreachBatchRun.ts
// Impure half of bulk send: snapshot a segment of contacts into an outreach_batches row and
// enqueue ONE send_batch approval. Nothing sends here — after the owner approves in the Queue,
// the standing worker drains the batch through THE ONE SEND PATH (send-email), every gate
// re-checked per recipient. Compose-time honesty: unsupported merge tokens refuse loudly, and
// the owner sees the real reachable count (with named exclusions) before anything is queued.

import { supabase } from '../supabase';
import { enqueueApproval } from './execution';
import { composeBatchRecipients, unknownTokens, batchProgress, type BatchRecipient } from './outreachBatch';

export type BatchSegment = 'all' | 'new' | 'contacted' | 'qualified' | 'customer';

export interface BatchRow {
  id: string; subject: string; status: 'queued' | 'draining' | 'done' | 'canceled';
  recipients: BatchRecipient[]; sent_count: number; skipped_count: number;
  created_at: string; finished_at: string | null;
}

export async function segmentCount(segment: BatchSegment): Promise<number> {
  let q = supabase.from('contacts').select('id', { count: 'exact', head: true });
  if (segment !== 'all') q = q.eq('stage', segment);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Create the batch + its ONE approval. Returns honest compose results. */
export async function createBatch(input: {
  segment: BatchSegment; subject: string; body: string; worldId?: string | null;
}): Promise<{ batchId: string; queued: number; excluded: { email: string; reason: string }[] }> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) throw new Error('Give the batch a subject.');
  if (!body) throw new Error('Write the body first.');
  const bad = unknownTokens(`${subject}\n${body}`);
  if (bad.length > 0) {
    throw new Error(`Unsupported merge tokens: ${bad.map((t) => `{{${t}}}`).join(', ')}. Only {{name}} and {{first_name}} merge — anything else would send literally.`);
  }

  let q = supabase.from('contacts').select('id, email, full_name, email_status').limit(2000);
  if (input.segment !== 'all') q = q.eq('stage', input.segment);
  const { data: contacts, error } = await q;
  if (error) throw new Error(error.message);

  const { recipients, excluded } = composeBatchRecipients(contacts ?? []);
  if (recipients.length === 0) {
    throw new Error(excluded.length > 0
      ? `Nothing sendable in that segment — all ${excluded.length} excluded (${excluded[0].reason}${excluded.length > 1 ? ', …' : ''}).`
      : 'That segment has no contacts.');
  }

  const { data: batch, error: insErr } = await supabase.from('outreach_batches').insert({
    owner_id: uid, world_id: input.worldId ?? null, subject, body_text: body,
    recipients, status: 'queued',
  }).select('id').single();
  if (insErr || !batch) throw new Error(`Could not create the batch: ${insErr?.message ?? 'unknown error'}`);

  const approvalId = await enqueueApproval({
    kind: 'send_batch',
    title: `Send "${subject}" to ${recipients.length} contact${recipients.length === 1 ? '' : 's'}`,
    preview: `${body.slice(0, 280)}${body.length > 280 ? '…' : ''}\n\nThe clock drains this under your daily cap; every recipient re-checks suppression at send time.`,
    payload: { batch_id: batch.id, recipient_count: recipients.length },
  });
  await supabase.from('outreach_batches').update({ approval_id: approvalId }).eq('id', batch.id);

  return { batchId: batch.id as string, queued: recipients.length, excluded };
}

export async function listBatches(limit = 10): Promise<BatchRow[]> {
  const { data, error } = await supabase.from('outreach_batches')
    .select('id, subject, status, recipients, sent_count, skipped_count, created_at, finished_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BatchRow[];
}

/** Cancel a queued/draining batch — remaining pending recipients simply never send. */
export async function cancelBatch(id: string): Promise<void> {
  const { data, error } = await supabase.from('outreach_batches')
    .update({ status: 'canceled', finished_at: new Date().toISOString() })
    .eq('id', id).in('status', ['queued', 'draining']).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Batch already finished — nothing to cancel.');
}

export function batchLine(b: BatchRow): string {
  const p = batchProgress(b.recipients ?? []);
  if (b.status === 'queued') return `waiting for approval — ${p.pending} to send`;
  if (b.status === 'draining') return `draining: ${p.sent} sent, ${p.skipped} skipped, ${p.pending} to go`;
  if (b.status === 'canceled') return `canceled — ${p.sent} had already sent`;
  return `done: ${p.sent} sent${p.skipped > 0 ? `, ${p.skipped} skipped` : ''}`;
}
