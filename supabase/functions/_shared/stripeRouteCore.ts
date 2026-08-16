// supabase/functions/_shared/stripeRouteCore.ts — the ONE routing decision for a Stripe
// checkout.session event, PURE and verified (verify:striperoute). Consumed by stripe-webhook;
// re-exported client-side as src/lib/garvis/stripeRoute.ts.
//
// The order is load-bearing:
//   1. metadata.invoice_id (uuid) → 'invoice'. An invoice Payment Link WE minted stamps the
//      invoice id into metadata, and that names OUR invoice regardless of what happens to ride
//      client_reference_id — so the invoice branch is checked FIRST.
//   2. a uuid client_reference_id → 'client_sale' (a client paying the operator for their site).
//   3. everything else → 'saas' (FableForge's own top-ups and the operator's plan).
//   An unpaid session routes nowhere ('ignore').
//
// The route names the FIRST branch to TRY — the webhook's runtime lookups still fall through
// honestly (a uuid client_reference_id that matches no client sale is a credit top-up's user id,
// exactly as before this core existed).

export type StripeRoute = 'invoice' | 'client_sale' | 'saas' | 'ignore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed uuid — the guard that keeps garbage out of `.eq('id', …)` on uuid
 *  columns (a non-uuid there throws, 500s the webhook, and makes Stripe retry forever). */
export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

export interface CheckoutFacts {
  /** payment_status was 'paid' or 'no_payment_required'. */
  paid: boolean;
  /** session.metadata?.invoice_id — stamped by invoice-payment-link. */
  invoiceId: string | null;
  /** session.client_reference_id — a client sale's client_subscriptions id, or a top-up's user id. */
  clientReferenceId: string | null;
}

export function routeCheckoutSession(f: CheckoutFacts): StripeRoute {
  if (!f.paid) return 'ignore';
  if (isUuid(f.invoiceId)) return 'invoice';
  if (isUuid(f.clientReferenceId)) return 'client_sale';
  return 'saas';
}
