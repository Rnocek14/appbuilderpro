-- app_0130_lead_customers.sql — THE LEAD ENGINE SELLS ITSELF: customers of a market.
-- A market stops being a single-recipient pilot and becomes a product: each row here is a
-- contractor who receives the market's digest for their trade. The weekly digest is AUTO-DRAFTED
-- per customer as a PENDING approval (the invoice-chase pattern — the clock composes, the owner
-- approves, the one send path enforces every gate). Nothing sends itself; last_digest_at advances
-- when the draft is queued so a rejected draft doesn't re-draft until the next week.
--
-- Additive + idempotent. Plan: docs/lead-engine-master-plan.md · docs/lead-engine-data-plan.md.

create table if not exists public.le_customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid not null references public.knowledge_worlds(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null default '',
  email text not null,
  trade text not null default 'all',                -- a TRADES key, or 'all'
  status text not null default 'active' check (status in ('active', 'paused')),
  last_digest_at timestamptz,                       -- advanced when a digest draft is QUEUED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, world_id, email)
);

alter table public.le_customers enable row level security;
drop policy if exists "le_customers owner all" on public.le_customers;
create policy "le_customers owner all" on public.le_customers
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );

create index if not exists idx_le_customers_world on public.le_customers(world_id, status);
