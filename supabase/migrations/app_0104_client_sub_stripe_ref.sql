-- app_0104_client_sub_stripe_ref.sql — honest MRR both ways.
-- When a client pays a recurring plan, Stripe creates a subscription. To mark that sale CANCELED when
-- the client later churns (customer.subscription.deleted), the webhook must map the Stripe
-- subscription back to our sale — so we record its id on activation. Without this, a churned client
-- stays 'active' and keeps counting toward MRR (MRR would only ever go up, which isn't honest).
-- Additive + idempotent.

alter table public.client_subscriptions add column if not exists stripe_subscription_id text;
create index if not exists idx_client_subs_stripe_sub on public.client_subscriptions(stripe_subscription_id);
