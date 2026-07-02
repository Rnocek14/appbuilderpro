-- Stripe billing foundation: platform subscriptions (free/pro tiers) + webhook idempotency.
-- Webhooks are TRIGGERS only — canonical state is always re-fetched from Stripe (syncSubscription)
-- because event delivery has no ordering guarantee.

alter table public.profiles add column if not exists stripe_customer_id text unique;

create table if not exists public.stripe_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_subscription_id text,
  status text,                          -- active | trialing | past_due | canceled | ...
  price_id text,
  tier text not null default 'free',    -- free | pro
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.stripe_subscriptions enable row level security;
create policy "own subscription" on public.stripe_subscriptions
  for select using (auth.uid() = user_id);
-- writes: service role only (webhook/sync) — no client policies.

-- Processed Stripe event ids: a redelivered webhook is a no-op.
create table if not exists public.stripe_events (
  id text primary key,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- service-role only; no client policies.
