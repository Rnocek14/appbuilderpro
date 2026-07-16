// src/lib/garvis/automation/triggersRun.ts
// THE TRIGGER RUNNER — the impure half of the trigger engine. Loads the signed-in owner's active
// triggers + their customers + the fire ledger, computes what's due with the PURE core (triggers.ts),
// and enqueues ONE approval-gated send per due customer through the existing one send path. Nothing
// sends here: each lands in the approval queue, exactly like a cold pitch — the human still owns the
// trigger out. Mirrors outreach.ts `queuePitch` so suppression, caps, CAN-SPAM, and unsubscribe all
// come for free from send-email.
//
// IDEMPOTENCY: claim-first. We insert the trigger_fires ledger row before doing any work; the unique
// index (trigger, customer, due date) rejects a duplicate/concurrent fire, so a customer is never
// double-contacted for the same due date. If the downstream enqueue fails, we release the claim so the
// next run retries it — a failed fire is never silently lost.
//
// This is the SINGLE-TENANT runner (owner acts for themselves). The autonomous version — running on the
// standing-worker heartbeat, and for external clients under the operator-membership overlay (tentpole
// #2) — reuses this exact logic; it does not replace it.

import { supabase } from '../../supabase';
import { enqueueApproval } from '../execution';
import { dueFires, renderTemplate, fireKey, type TriggerDef, type CustomerRec, type AnchorField } from './triggers';

export interface TriggerRunSummary {
  triggers: number;   // active triggers considered
  due: number;        // customers found due across all triggers
  queued: number;     // approvals successfully enqueued
  skipped: number;    // already-fired claims (idempotency working)
  errors: number;     // fires that failed downstream (claim released for retry)
}

interface TriggerRow {
  id: string; list_id: string; label: string; capability_id: string;
  anchor_field: AnchorField; offset_days: number; window_days: number;
  status: 'active' | 'paused'; template_subject: string; template_body: string;
}
interface CustomerRow {
  id: string; email: string | null; name: string | null;
  last_service_at: string | null; last_visit_at: string | null;
  purchase_at: string | null; next_due_at: string | null;
}

/** Run every active trigger for the signed-in owner. Best-effort per fire; one failure never sinks the
 *  run. `nowIso` is injectable for testing/replay; defaults to the current time. */
export async function runTriggersForOwner(nowIso?: string): Promise<TriggerRunSummary> {
  const summary: TriggerRunSummary = { triggers: 0, due: 0, queued: 0, skipped: 0, errors: 0 };
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) return summary;
  const now = nowIso ?? new Date().toISOString();

  // Reconcile stranded claims: a prior run that died AFTER claiming a fire but BEFORE enqueuing leaves a
  // trigger_fires row with approval_id = null that would block that (customer, due-date) forever. Release
  // any older than 10 minutes so they retry, instead of being silently lost.
  const staleCutoff = new Date(Date.parse(now) - 10 * 60 * 1000).toISOString();
  await supabase.from('trigger_fires').delete()
    .eq('owner_id', uid).is('approval_id', null).lt('created_at', staleCutoff);

  const { data: trigData } = await supabase.from('automation_triggers')
    .select('*').eq('owner_id', uid).eq('status', 'active');
  const triggers = (trigData ?? []) as TriggerRow[];
  summary.triggers = triggers.length;

  // Customers are shared across triggers on the same list — fetch each list once, not per trigger.
  const customersByList = new Map<string, CustomerRec[]>();
  const customersFor = async (listId: string): Promise<CustomerRec[]> => {
    const cached = customersByList.get(listId);
    if (cached) return cached;
    const { data: custData } = await supabase.from('customers')
      .select('*').eq('owner_id', uid).eq('list_id', listId);
    const mapped: CustomerRec[] = ((custData ?? []) as CustomerRow[]).map((c) => ({
      id: c.id, email: c.email, name: c.name,
      anchors: {
        last_service_at: c.last_service_at, last_visit_at: c.last_visit_at,
        purchase_at: c.purchase_at, next_due_at: c.next_due_at,
      },
    }));
    customersByList.set(listId, mapped);
    return mapped;
  };

  for (const t of triggers) {
    const def: TriggerDef = {
      id: t.id, anchorField: t.anchor_field, offsetDays: t.offset_days,
      windowDays: t.window_days, status: t.status,
    };

    const customers = await customersFor(t.list_id);

    const { data: fireData } = await supabase.from('trigger_fires')
      .select('customer_id, fired_for').eq('owner_id', uid).eq('trigger_id', t.id);
    const firedKeys = ((fireData ?? []) as { customer_id: string; fired_for: string }[])
      .map((f) => fireKey(f.customer_id, f.fired_for));

    const plan = dueFires(def, customers, firedKeys, now);
    summary.due += plan.length;

    for (const fire of plan) {
      // CLAIM-FIRST: reserve the fire in the ledger; a duplicate/concurrent fire hits the unique index.
      const { data: claim, error: claimErr } = await supabase.from('trigger_fires')
        .insert({ owner_id: uid, trigger_id: t.id, customer_id: fire.customerId, fired_for: fire.firedFor })
        .select('id').maybeSingle();
      // Only a unique-violation (23505) means "already fired" (idempotency working). Any other error is
      // a real failure to retry next run — counting it as "skipped" would hide it.
      if (claimErr) { if ((claimErr as { code?: string }).code === '23505') summary.skipped++; else summary.errors++; continue; }
      if (!claim) { summary.skipped++; continue; }
      const fireId = (claim as { id: string }).id;

      try {
        const cust = customers.find((c) => c.id === fire.customerId)!;
        const subject = renderTemplate(t.template_subject, cust).trim() || t.label;
        const body = renderTemplate(t.template_body, cust);

        // Contact: SELECT-FIRST — never reset an existing contact's email_status (suppression sacred).
        let contactId: string | null = null;
        const { data: existing } = await supabase.from('contacts')
          .select('id').eq('owner_id', uid).eq('email', fire.email).maybeSingle();
        if (existing) {
          contactId = (existing as { id: string }).id;
        } else {
          const { data: c } = await supabase.from('contacts')
            .insert({ owner_id: uid, email: fire.email, email_status: 'unknown', is_primary: true })
            .select('id').maybeSingle();
          if (c) {
            contactId = (c as { id: string }).id;
          } else {
            // A concurrent insert won the race — re-select rather than orphan the message's contact link.
            const { data: again } = await supabase.from('contacts')
              .select('id').eq('owner_id', uid).eq('email', fire.email).maybeSingle();
            contactId = again ? (again as { id: string }).id : null;
          }
        }

        const { data: camp, error: campErr } = await supabase.from('outreach_campaigns')
          .insert({ owner_id: uid, contact_id: contactId, kind: 'automation', state: 'pending_approval' })
          .select('id').single();
        if (campErr || !camp) throw new Error(campErr?.message ?? 'campaign insert failed');
        const campaignId = (camp as { id: string }).id;

        const { data: msg, error: msgErr } = await supabase.from('outreach_messages')
          .insert({
            owner_id: uid, campaign_id: campaignId, contact_id: contactId, sequence_step: 0,
            subject, body_text: body, to_address: fire.email, status: 'draft',
          }).select('id').single();
        if (msgErr || !msg) throw new Error(msgErr?.message ?? 'message insert failed');
        const messageId = (msg as { id: string }).id;

        const approvalId = await enqueueApproval({
          kind: 'send_email',
          title: `${t.label} → ${fire.email}`,
          preview: `${subject}\n\n${body}`,
          payload: { message_id: messageId, campaign_id: campaignId },
        });

        await supabase.from('trigger_fires').update({ approval_id: approvalId }).eq('id', fireId);
        summary.queued++;
      } catch {
        // Release the claim so the fire retries next run — a failed fire is never silently lost.
        await supabase.from('trigger_fires').delete().eq('id', fireId);
        summary.errors++;
      }
    }
  }
  return summary;
}
