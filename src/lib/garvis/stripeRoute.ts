// src/lib/garvis/stripeRoute.ts
// Client re-export of the ONE Stripe checkout routing core (_shared/stripeRouteCore.ts), shared
// with stripe-webhook so the verify suite (stripeRoute.verify.ts) exercises the exact code the
// webhook runs.

export {
  routeCheckoutSession, isUuid,
  type StripeRoute, type CheckoutFacts,
} from '../../../supabase/functions/_shared/stripeRouteCore';
