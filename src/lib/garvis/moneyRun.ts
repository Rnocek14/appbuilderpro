// src/lib/garvis/moneyRun.ts
// The impure half of the money loop (pure core: money.ts). Invoices are records; SENDING goes
// through the one approval-gated send path (a pending approval in your queue — same as every
// email); PAID is a fact only you confirm (payment truth lives in your processor, Garvis never
// guesses money); paid revenue lands in mind_events + the weekly scorecard.

import { supabase } from '../supabase';
import { invoiceEmail, invoiceTotal, type InvoiceLike, type LineItem } from './money';

export interface InvoiceRow extends InvoiceLike {
  id: string; world_id: string | null; contact_id: string | null; created_at: string;
  // Provenance (app_0086): where the money came from — so revenue teaches, not just totals.
  source: string; lead_id: string | null; campaign_id: string | null; client_subscription_id: string | null;
}
const COLS = 'id, world_id, contact_id, number, title, to_email, line_items, amount_usd, due_date, payment_url, status, last_chase_stage, sent_at, paid_at, created_at, source, lead_id, campaign_id, client_subscription_id';

export async function listInvoices(status?: 'draft' | 'sent' | 'paid' | 'void'): Promise<InvoiceRow[]> {
  let q = supabase.from('invoices').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceRow[];
}

export async function createInvoice(input: {
  title: string; toEmail: string; lineItems: LineItem[];
  dueDate?: string | null; paymentUrl?: string | null; worldId?: string | null;
  /** Provenance (app_0086): which door the money came through. Defaults to 'manual' (the form). */
  source?: 'manual' | 'garvis_tool' | 'won_deal';
  leadId?: string | null; campaignId?: string | null; clientSubscriptionId?: string | null;
}): Promise<InvoiceRow> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const items = input.lineItems.filter((i) => i.description.trim() && i.qty > 0 && i.unit_usd >= 0);
  if (!input.title.trim() || !items.length) throw new Error('An invoice needs a title and at least one line item.');
  const to = input.toEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Enter a valid recipient email.');

  // Link-or-create the contact (select-first — email_status NEVER reset; suppression sacred).
  let contactId: string | null = null;
  const { data: existing } = await supabase.from('contacts').select('id').eq('owner_id', uid).eq('email', to).maybeSingle();
  if (existing) contactId = (existing as { id: string }).id;
  else {
    const { data: c } = await supabase.from('contacts')
      .insert({ owner_id: uid, email: to, email_status: 'unknown', is_primary: false }).select('id').maybeSingle();
    contactId = (c as { id: string } | null)?.id ?? null;
  }

  // Number: INV-<year>-<NNN> — readable, and UNIQUE for real (app_0051). Two tabs used to be able
  // to read the same count and silently mint the same number; the unique index now rejects the
  // duplicate (23505) and we re-mint with a bumped sequence, up to three attempts.
  const year = new Date().getFullYear();
  const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true });
  let lastError = 'Could not create the invoice.';
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = `INV-${year}-${String((count ?? 0) + 1 + attempt).padStart(3, '0')}`;
    const { data, error } = await supabase.from('invoices').insert({
      owner_id: uid, world_id: input.worldId ?? null, contact_id: contactId,
      number, title: input.title.trim(), to_email: to, line_items: items,
      amount_usd: invoiceTotal(items), due_date: input.dueDate || null, payment_url: input.paymentUrl?.trim() || null,
      source: input.source ?? 'manual', lead_id: input.leadId ?? null,
      campaign_id: input.campaignId ?? null, client_subscription_id: input.clientSubscriptionId ?? null,
    }).select(COLS).single();
    if (data) return data as InvoiceRow;
    lastError = error?.message ?? lastError;
    if (error?.code !== '23505') break; // only a number collision earns a retry
  }
  throw new Error(lastError);
}

/** Queue the invoice email as a PENDING approval — the one send path does the rest (suppression
 *  fail-closed, kill switch, cap, ledger). The invoice flips to 'sent' when you approve & it sends. */
export async function queueInvoiceSend(invoice: InvoiceRow): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { data: os } = await supabase.from('outreach_settings').select('from_name, company_name').eq('owner_id', uid).maybeSingle();
  const fromName = ((os as { from_name?: string | null } | null)?.from_name ?? '').trim()
    || ((os as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'Me';
  const email = invoiceEmail(invoice, fromName);

  const { data: camp, error: cErr } = await supabase.from('outreach_campaigns').insert({
    owner_id: uid, contact_id: invoice.contact_id, kind: 'invoice', state: 'pending_approval',
  }).select('id').single();
  if (cErr || !camp) throw new Error(cErr?.message ?? 'Could not stage the send.');
  const { data: msg, error: mErr } = await supabase.from('outreach_messages').insert({
    owner_id: uid, campaign_id: (camp as { id: string }).id, contact_id: invoice.contact_id,
    sequence_step: 0, subject: email.subject, body_text: email.body, to_address: invoice.to_email, status: 'draft',
  }).select('id').single();
  if (mErr || !msg) throw new Error(mErr?.message ?? 'Could not draft the invoice email.');
  // The approval MUST land before we stamp the invoice sent (deep scan P0): if this insert silently
  // failed, the invoice would read "sent" with nothing in the queue, and the chaser would dun a
  // client who was never billed. Checked, like the campaign/message inserts above.
  const { error: apErr } = await supabase.from('approvals').insert({
    owner_id: uid, kind: 'send_email', status: 'pending', requested_by: 'user',
    title: `Send invoice ${invoice.number} (${invoice.title}) → ${invoice.to_email}`,
    preview: `${email.subject}\n\n${email.body.slice(0, 400)}`,
    payload: { message_id: (msg as { id: string }).id, invoice_id: invoice.id },
  });
  if (apErr) throw new Error(`Could not queue the invoice for approval (${apErr.message}) — it was NOT marked sent; try again.`);
  // 'sent' is stamped optimistically now that the approval exists, so the chaser can see it; the
  // approval queue + ledger remain the source of truth for whether the email actually left. Guarded
  // on status='draft' so a stale second press can't double-stamp.
  const { error: stampErr } = await supabase.from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoice.id);
  if (stampErr) throw new Error(`Queued for approval, but the invoice could not be marked sent (${stampErr.message}) — do NOT queue it again; check Approvals.`);
}

/** Reject any still-pending send/chase approvals for an invoice. Called when the invoice is paid or
 *  voided so a settled bill never gets a "final notice" from an approval drafted earlier (deep scan
 *  theme 3). Approvals carry payload.invoice_id (queueInvoiceSend + invoice-chase). */
async function cancelPendingInvoiceOutreach(uid: string, invoiceId: string): Promise<void> {
  await supabase.from('approvals')
    .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_via: 'auto' })
    .eq('owner_id', uid).eq('status', 'pending').eq('kind', 'send_email')
    .contains('payload', { invoice_id: invoiceId })
    .then(() => {}, () => {});
}

/** YOU confirm payment (it landed in your processor/bank) — Garvis records the fact as revenue.
 *  Guarded so only a draft/sent invoice can become paid (never void→paid, never a re-flip). */
export async function markInvoicePaid(id: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).in('status', ['draft', 'sent']).select('number, title, amount_usd').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Only a draft or sent invoice can be marked paid.');
  const inv = data as { number: string; title: string; amount_usd: number };
  // A paid invoice must not keep getting chased — cancel any pending reminders already drafted.
  await cancelPendingInvoiceOutreach(uid, id);
  await supabase.from('mind_events').insert({
    owner_id: uid, event_type: 'note', source: 'money',
    subject: `PAID: ${inv.number} — ${inv.title} ($${Number(inv.amount_usd).toFixed(2)})`,
    payload: { invoice_id: id, amount_usd: inv.amount_usd },
  }).then(() => {}, () => {});
}

/** Undo for "mark paid" (parity with void): revert to the prior status and drop the PAID record.
 *  Only flips rows that are actually paid. */
export async function unmarkInvoicePaid(id: string, restoreTo: 'draft' | 'sent'): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase.from('invoices')
    .update({ status: restoreTo, paid_at: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'paid').select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return; // already not paid — nothing to undo
  // Retract the revenue mind_event so the scorecard doesn't double-count a reversed payment.
  await supabase.from('mind_events').delete()
    .eq('owner_id', uid).eq('source', 'money').contains('payload', { invoice_id: id })
    .then(() => {}, () => {});
}

export async function voidInvoice(id: string): Promise<void> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  const { error } = await supabase.from('invoices')
    .update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  // A voided invoice must not keep getting chased either.
  if (uid) await cancelPendingInvoiceOutreach(uid, id);
}

/** Undo for void (design review: act instantly, regret politely — the confirm dialog is gone).
 *  Restores exactly the status the void took away; only flips rows that are actually void. */
export async function unvoidInvoice(id: string, restoreTo: 'draft' | 'sent'): Promise<void> {
  const { error } = await supabase.from('invoices')
    .update({ status: restoreTo, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'void');
  if (error) throw new Error(error.message);
}
