// src/lib/garvis/closeWonRun.ts
// CLOSE THE DEAL — the client-hunt loop's missing last step. Before this, a warm reply to a cold
// site pitch stopped the sequence, marked the campaign 'replied', pinged the phone… and the trail
// ended: 'won' existed in the state enum but nothing ever wrote it, and nothing connected the yes
// to the client book. One click here: campaign → won (CAS-guarded, so a double-click can't create
// two clients), contact → customer, a client_subscriptions row with the real links back to the
// prospect and their rebuilt demo site, and the operator's Stripe payment link for the chosen
// tier handed back for the follow-through. Paperwork stays deliberate — e-sign sends YOUR
// agreement from Documents when you're ready; we don't auto-fire a template at a new client.

import { supabase } from '../supabase';
import { tierById, type TierId } from './billing/clientTiers';
import { getBillingSettings } from './billing/clientBilling';

export interface WonClose {
  subscriptionId: string;
  businessName: string;
  paymentLink: string | null;   // the operator's Stripe link for this tier (null = not set up yet)
  demoSlug: string | null;      // the pitched rebuild — /preview-site/<slug> — when known
  invoiceNumber: string | null; // draft invoice minted for a one-time deal (app_0086 provenance)
}

export async function closeCampaignWon(input: {
  campaignId: string; tier: TierId; priceUsd: number;
}): Promise<WonClose> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const tier = tierById(input.tier);
  if (!tier) throw new Error('Pick a tier.');
  const priceCents = Math.max(0, Math.round((Number.isFinite(input.priceUsd) ? input.priceUsd : 0) * 100));

  const { data: camp } = await supabase.from('outreach_campaigns')
    .select('id, state, contact_id, business_profile_id, preview_site_id')
    .eq('id', input.campaignId).maybeSingle();
  if (!camp) throw new Error('Campaign not found.');
  if (camp.state === 'won') throw new Error('Already marked won — see Clients.');

  // CAS the state first: exactly one caller gets to create the client row.
  const { data: claimed, error: casErr } = await supabase.from('outreach_campaigns')
    .update({ state: 'won', sequence_stopped: true })
    .eq('id', input.campaignId).neq('state', 'won').select('id');
  if (casErr) throw new Error(casErr.message);
  if (!claimed?.length) throw new Error('Already marked won — see Clients.');

  // Who the client is: prospect profile name first, then the contact, then honest fallback.
  let businessName = 'New client';
  let email: string | null = null;
  if (camp.business_profile_id) {
    const { data: bp } = await supabase.from('business_profiles')
      .select('business_name').eq('id', camp.business_profile_id).maybeSingle();
    if (bp?.business_name) businessName = bp.business_name as string;
  }
  if (camp.contact_id) {
    const { data: c } = await supabase.from('contacts')
      .select('full_name, email').eq('id', camp.contact_id).maybeSingle();
    email = (c?.email as string | null) ?? null;
    if (businessName === 'New client' && c?.full_name) businessName = c.full_name as string;
    // The relationship changed: they said yes. Fail-soft — the stage label never blocks the close.
    await supabase.from('contacts').update({ stage: 'customer' }).eq('id', camp.contact_id)
      .then(() => {}, () => {});
  }

  const { data: sub, error: subErr } = await supabase.from('client_subscriptions').insert({
    owner_id: uid, business_name: businessName, email,
    business_profile_id: camp.business_profile_id ?? null,
    preview_site_id: camp.preview_site_id ?? null,
    tier: tier.id, cadence: tier.cadence, price_cents: priceCents, status: 'pending',
    notes: `Won from cold-pitch reply (campaign ${String(camp.id).slice(0, 8)}).`,
  }).select('id').single();
  if (subErr || !sub) throw new Error(`Marked won, but could not add to the client book: ${subErr?.message ?? 'unknown'} — add them on the Clients page.`);

  let demoSlug: string | null = null;
  if (camp.preview_site_id) {
    const { data: site } = await supabase.from('preview_sites')
      .select('slug').eq('id', camp.preview_site_id).maybeSingle();
    demoSlug = (site?.slug as string | null) ?? null;
  }

  // Ledgers connect (app_0086): a one-time deal with a real price and a real email gets its DRAFT
  // invoice minted with full provenance — nothing sends, it just appears on Money ready to queue.
  // Monthly retainers bill through the Stripe payment link instead; no invoice invented for them.
  let invoiceNumber: string | null = null;
  if (tier.cadence === 'one_time' && priceCents > 0 && email) {
    try {
      const { createInvoice } = await import('./moneyRun');
      const inv = await createInvoice({
        title: `${tier.name} — ${businessName}`, toEmail: email,
        lineItems: [{ description: tier.name, qty: 1, unit_usd: priceCents / 100 }],
        source: 'won_deal', campaignId: camp.id as string, clientSubscriptionId: sub.id as string,
      });
      invoiceNumber = inv.number;
    } catch { /* the close stands on its own — a failed draft is re-creatable on Money */ }
  }

  const settings = await getBillingSettings().catch(() => ({ website_payment_link: null, automation_payment_link: null }));
  const paymentLink = tier.id === 'website' ? settings.website_payment_link : settings.automation_payment_link;

  await supabase.from('mind_events').insert({
    owner_id: uid, source: 'execution', event_type: 'note',
    subject: `🏆 Client won: ${businessName} — ${tier.name}${priceCents > 0 ? ` at $${(priceCents / 100).toFixed(0)}${tier.cadence === 'monthly' ? '/mo' : ''}` : ''}`,
    payload: { key: `won:${camp.id}`, campaign_id: camp.id, subscription_id: sub.id, tier: tier.id },
  }).then(() => {}, () => {});

  return { subscriptionId: sub.id as string, businessName, paymentLink, demoSlug, invoiceNumber };
}
