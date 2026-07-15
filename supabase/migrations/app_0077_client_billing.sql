-- app_0077_client_billing.sql — SELL THE TIERS. The agency's own client-billing ledger: who bought
-- which offer (Website, or Website + Automation), what they pay, and whether they're live.
--
-- This is DISTINCT from the FableForge SaaS billing (stripe_subscriptions / profiles.plan), which bills
-- the operator for using the app builder. THIS bills the operator's LOCAL-BUSINESS CLIENTS — a plumber
-- paying the operator for a rebuilt site + automations. The buyer is not a FableForge auth user, so it
-- can't ride the existing user-scoped billing; it's the operator's own book of business.
--
-- v1 fulfils via Stripe Payment Links (created by the operator in Stripe — zero code): the app records
-- the sale, shows the right link to send, and the operator marks a client active once paid. The fully
-- automated Checkout + webhook path layers on later (it needs Stripe keys to build + test safely).
--
-- Owner-scoped RLS throughout. Additive + idempotent.

-- 1) The operator's two Payment Links (set once, reused for every client) -------------------------
create table if not exists public.agency_billing_settings (
  owner_id                 uuid primary key references public.profiles(id) on delete cascade,
  website_payment_link     text,   -- Stripe Payment Link URL for the "New Website" offer
  automation_payment_link  text,   -- Stripe Payment Link URL for the "Website + Automation" offer
  updated_at               timestamptz not null default now()
);
alter table public.agency_billing_settings enable row level security;
drop policy if exists "agency_billing_settings owner all" on public.agency_billing_settings;
create policy "agency_billing_settings owner all" on public.agency_billing_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 2) The client ledger: one row per business the operator has sold (or is selling) a tier ---------
create table if not exists public.client_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  business_name       text not null,
  email               text,
  business_profile_id uuid,                       -- link back to the prospect, when known
  preview_site_id     uuid,                       -- the rebuilt site we pitched, when known
  tier                text not null check (tier in ('website', 'website_automation')),
  cadence             text not null check (cadence in ('one_time', 'monthly')),
  price_cents         integer not null default 0, -- the agreed price (monthly for retainers)
  status              text not null default 'pending' check (status in ('pending', 'active', 'canceled')),
  notes               text,
  created_at          timestamptz not null default now(),
  activated_at        timestamptz
);
alter table public.client_subscriptions enable row level security;
drop policy if exists "client_subscriptions owner all" on public.client_subscriptions;
create policy "client_subscriptions owner all" on public.client_subscriptions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_client_subs_owner_status on public.client_subscriptions(owner_id, status, created_at desc);
