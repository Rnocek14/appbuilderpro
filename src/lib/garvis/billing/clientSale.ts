// src/lib/garvis/billing/clientSale.ts
// PURE helpers for the prospect → operator sale (verified by clientSale.verify.ts). The client clicks
// "Make it mine" on their demo, we create a pending client_subscriptions row and send them to the
// operator's Stripe Payment Link; on payment the webhook flips the sale to active and publishes.
// No I/O here — just the deterministic tier math, the payment-link URL building, and the "what to do
// when it's paid" decision the edge function + webhook share. Deno-safe (imported by edge functions).

// .ts extension on the value import (CLIENT_TIERS): this module is imported by the client-checkout +
// stripe-webhook EDGE functions (Deno strict resolver). clientTiers is pure, so it resolves cleanly.
import { CLIENT_TIERS, type TierId, type Cadence } from './clientTiers.ts';

export interface TierTerms {
  id: TierId;
  name: string;
  cadence: Cadence;
  /** The agency_billing_settings column holding this tier's Stripe Payment Link. */
  linkField: 'website_payment_link' | 'automation_payment_link';
  /** A sensible default price to record on the sale (the operator can edit; the real charge is
   *  whatever their Payment Link is set to). Cents. */
  defaultCents: number;
}

const TERMS: Record<TierId, TierTerms> = {
  website: { id: 'website', name: tierName('website'), cadence: 'one_time', linkField: 'website_payment_link', defaultCents: 150000 },
  website_automation: { id: 'website_automation', name: tierName('website_automation'), cadence: 'monthly', linkField: 'automation_payment_link', defaultCents: 50000 },
};

function tierName(id: TierId): string {
  return CLIENT_TIERS.find((t) => t.id === id)?.name ?? id;
}

/** Validate a raw tier string to a known TierId, or null. Never trusts client input blindly. */
export function normalizeTier(raw: string | null | undefined): TierId | null {
  const t = (raw ?? '').trim();
  return t === 'website' || t === 'website_automation' ? t : null;
}

/** The full terms for a tier (cadence, which payment-link column, default price). */
export function tierTerms(tier: TierId): TierTerms {
  return TERMS[tier];
}

/** Append Stripe's client_reference_id (our sale id, so the webhook can find the row) and a prefilled
 *  email to a Payment Link, preserving any query the link already carries. Returns null if the link
 *  isn't a usable http(s) URL — we never send a prospect to a broken or non-Stripe destination. */
export function buildPaymentUrl(link: string | null | undefined, clientReferenceId: string, email?: string | null): string | null {
  const base = (link ?? '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(base)) return null;
  const sep = base.includes('?') ? '&' : '?';
  let url = `${base}${sep}client_reference_id=${encodeURIComponent(clientReferenceId)}`;
  const em = (email ?? '').trim();
  if (em) url += `&prefilled_email=${encodeURIComponent(em)}`;
  return url;
}

/** What the webhook should do when a sale is paid, given the demo's hosting state:
 *   - already live (has a live_url)     → 'convert' (nothing to deploy; just record + notify)
 *   - a rendered site is stashed        → 'publish' (auto-publish it now, no browser needed)
 *   - nothing rendered yet              → 'notify'  (tell the operator to click Go Live once)
 *  Honest by construction: we never claim a site is live when we couldn't publish it. */
export function saleActionOnPaid(state: { alreadyLive: boolean; hasStashedHtml: boolean }): 'convert' | 'publish' | 'notify' {
  if (state.alreadyLive) return 'convert';
  if (state.hasStashedHtml) return 'publish';
  return 'notify';
}
