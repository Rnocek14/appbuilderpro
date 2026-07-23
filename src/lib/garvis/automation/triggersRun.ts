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
import { dueFires, renderTemplate, fireKey, type TriggerDef, type CustomerRec, type AnchorField, type TriggerChannel } from './triggers';
import { toE164 } from '../sms';

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
  channel: TriggerChannel | null;
}
interface CustomerRow {
  id: string; email: string | null; phone: string | null; name: string | null;
  last_service_at: string | null; last_visit_at: string | null;
  purchase_at: string | null; next_due_at: string | null;
  consent_basis: string | null;
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
    // CONSENT PARITY with the autonomous drain (standing-worker): a cold-prospecting row must never
    // ride a warm recall/reminder trigger. Default missing/unset to warm_transactional (the schema
    // default), so only an explicitly cold row is filtered out.
    const mapped: CustomerRec[] = ((custData ?? []) as CustomerRow[])
      .filter((c) => (c.consent_basis ?? 'warm_transactional') === 'warm_transactional')
      .map((c) => ({
      id: c.id, email: c.email, phone: c.phone, name: c.name,
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
      windowDays: t.window_days, status: t.status, channel: t.channel ?? 'email',
    };

    const customers = await customersFor(t.list_id);

    const { data: fireData } = await supabase.from('trigger_fires')
      .select('customer_id, fired_for').eq('owner_id', uid).eq('trigger_id', t.id);
    const firedKeys = ((fireData ?? []) as { customer_id: string; fired_for: string }[])
      .map((f) => fireKey(f.customer_id, f.fired_for));

    const plan = dueFires(def, customers, firedKeys, now);
    summary.due += plan.length;

    for (const fire of plan) {
      // SMS: normalize the phone BEFORE claiming — an un-textable number is skipped, never enqueued as a
      // doomed approval (the window guard retires it). Email needs no pre-check; send-email gates.
      let e164: string | null = null;
      if (fire.channel === 'sms') {
        e164 = toE164(fire.to);
        if (!e164) { summary.skipped++; continue; }
      }

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

        // Contact: SELECT-FIRST per channel — never reset an existing contact's status/consent
        // (suppression sacred: a prior email unsubscribe or SMS STOP must stick).
        const contactId = fire.channel === 'sms'
          ? await resolveSmsContact(uid, e164!)
          : await resolveEmailContact(uid, fire.to);

        const { data: camp, error: campErr } = await supabase.from('outreach_campaigns')
          .insert({ owner_id: uid, contact_id: contactId, kind: 'automation', state: 'pending_approval' })
          .select('id').single();
        if (campErr || !camp) throw new Error(campErr?.message ?? 'campaign insert failed');
        const campaignId = (camp as { id: string }).id;

        // One message row + one approval, routed to the trigger's channel. The send path (send-email /
        // send-sms) re-checks every gate at send time; nothing leaves without the owner's approval.
        const approvalId = fire.channel === 'sms'
          ? await (async () => {
              const { data: msg, error: msgErr } = await supabase.from('outreach_messages')
                .insert({
                  owner_id: uid, campaign_id: campaignId, contact_id: contactId, sequence_step: 0,
                  channel: 'sms', subject: t.label, body_text: body, to_address: e164!, status: 'draft',
                }).select('id').single();
              if (msgErr || !msg) throw new Error(msgErr?.message ?? 'message insert failed');
              return enqueueApproval({
                kind: 'send_sms',
                title: `${t.label} → ${e164}`,
                preview: body,
                // Texting the client's OWN warm customer about their service → transactional consent basis.
                payload: { message_id: (msg as { id: string }).id, campaign_id: campaignId, sms_kind: 'transactional' },
              });
            })()
          : await (async () => {
              const { data: msg, error: msgErr } = await supabase.from('outreach_messages')
                .insert({
                  owner_id: uid, campaign_id: campaignId, contact_id: contactId, sequence_step: 0,
                  subject, body_text: body, to_address: fire.to, status: 'draft',
                }).select('id').single();
              if (msgErr || !msg) throw new Error(msgErr?.message ?? 'message insert failed');
              return enqueueApproval({
                kind: 'send_email',
                title: `${t.label} → ${fire.to}`,
                preview: `${subject}\n\n${body}`,
                payload: { message_id: (msg as { id: string }).id, campaign_id: campaignId },
              });
            })();

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

/** Resolve (find or create) the email contact for an automation send. SELECT-FIRST so an existing
 *  contact's email_status is never reset — suppression is sacred. Race-safe: a concurrent insert that
 *  wins the (owner, email) unique index is re-selected rather than orphaning the message's contact. */
async function resolveEmailContact(uid: string, email: string): Promise<string | null> {
  const { data: existing } = await supabase.from('contacts')
    .select('id').eq('owner_id', uid).eq('email', email).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: c } = await supabase.from('contacts')
    .insert({ owner_id: uid, email, email_status: 'unknown', is_primary: true })
    .select('id').maybeSingle();
  if (c) return (c as { id: string }).id;
  const { data: again } = await supabase.from('contacts')
    .select('id').eq('owner_id', uid).eq('email', email).maybeSingle();
  return again ? (again as { id: string }).id : null;
}

/** Resolve (find or create) the SMS contact for an automation text, keyed on the E.164 phone. Reusing
 *  an existing contact preserves its phone_status + sms_consent (a prior STOP must stick) — we NEVER
 *  re-grant consent on a match. A NEW contact is for a warm customer of the client's own list, texted
 *  about their own service, so it carries warm_transactional consent; send-sms still re-checks it and
 *  fails closed. No unique index on phone_e164, so we take the first match (limit 1), never .single(). */
async function resolveSmsContact(uid: string, e164: string): Promise<string | null> {
  const { data: existing } = await supabase.from('contacts')
    .select('id').eq('owner_id', uid).eq('phone_e164', e164).limit(1);
  if (existing && existing.length) return (existing[0] as { id: string }).id;
  const { data: c } = await supabase.from('contacts')
    .insert({
      owner_id: uid, phone: e164, phone_e164: e164, phone_status: 'unknown',
      sms_consent: 'warm_transactional', sms_consent_at: new Date().toISOString(), is_primary: true,
    })
    .select('id').maybeSingle();
  if (c) return (c as { id: string }).id;
  const { data: again } = await supabase.from('contacts')
    .select('id').eq('owner_id', uid).eq('phone_e164', e164).limit(1);
  return again && again.length ? (again[0] as { id: string }).id : null;
}
