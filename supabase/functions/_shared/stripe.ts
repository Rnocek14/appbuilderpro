// supabase/functions/_shared/stripe.ts
// Shared Stripe client + the ONE canonical sync: webhooks and success-redirects both funnel
// through syncSubscription so plan state always mirrors Stripe (no trust in event ordering).
// apiVersion pinned to dahlia (2026-03-25); note basil moved current_period_end onto items.

import Stripe from 'npm:stripe@18';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function stripeClient(): Stripe {
  return new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2026-03-25.dahlia' as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const PRO_PRICE_ID = () => Deno.env.get('STRIPE_PRO_PRICE_ID') ?? '';

/** Ensure the user has a Stripe customer; create + persist on first need. */
export async function ensureCustomer(stripe: Stripe, admin: SupabaseClient, userId: string, email?: string | null): Promise<string> {
  const { data: prof } = await admin.from('profiles').select('stripe_customer_id, email').eq('id', userId).single();
  const existing = (prof as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (existing) return existing;
  const customer = await stripe.customers.create({
    email: email ?? (prof as { email?: string } | null)?.email ?? undefined,
    metadata: { user_id: userId },
  });
  await admin.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId);
  return customer.id;
}

/**
 * Re-fetch the customer's subscription state from Stripe and mirror it into
 * stripe_subscriptions + profiles.plan. Idempotent; safe to call from any trigger.
 */
export async function syncSubscription(stripe: Stripe, admin: SupabaseClient, customerId: string): Promise<void> {
  const { data: prof } = await admin.from('profiles').select('id').eq('stripe_customer_id', customerId).single();
  const userId = (prof as { id?: string } | null)?.id;
  if (!userId) return;

  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
  // Most-relevant subscription: an active/trialing one, else the newest.
  const sub = subs.data.find((s) => s.status === 'active' || s.status === 'trialing') ?? subs.data[0] ?? null;

  const item = sub?.items.data[0];
  const active = !!sub && (sub.status === 'active' || sub.status === 'trialing');
  const tier = active ? 'pro' : 'free';
  // basil+: current_period_end lives on the subscription item.
  const periodEnd = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end
    ?? (sub as unknown as { current_period_end?: number } | null)?.current_period_end;

  await admin.from('stripe_subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: sub?.id ?? null,
    status: sub?.status ?? null,
    price_id: item?.price?.id ?? null,
    tier,
    cancel_at_period_end: sub?.cancel_at_period_end ?? false,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  // The plan column is what the credit gate reads (modelForPlan, monthly grants).
  await admin.from('profiles').update({ plan: tier }).eq('id', userId);
}
