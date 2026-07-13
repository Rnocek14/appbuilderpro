-- app_0066_mls.sql — MLS DATA RAIL. The audit's "every number-shaped artifact says 'fill from your
-- MLS'" gap: a RESO Web API feed (credentials sealed server-side in provider_connections) syncs
-- listings into mls_listings, and market stats are COMPUTED from these real rows — never from the
-- model's memory. No feed configured = honest empty state, never sample data.
-- Additive + idempotent. Owner RLS (world pin when set).

create table if not exists public.mls_listings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  listing_key   text not null,                 -- RESO ListingKey (the feed's identity)
  status        text not null default '',      -- RESO StandardStatus, as the feed said it
  list_price    numeric,
  close_price   numeric,
  address1      text not null default '',
  city          text not null default '',
  zip           text not null default '',
  property_type text not null default '',
  beds          numeric,
  baths         numeric,
  sqft          numeric,
  list_date     date,
  close_date    date,
  dom           int,
  modified_at   timestamptz,                   -- RESO ModificationTimestamp (sync cursor)
  synced_at     timestamptz not null default now()
);
alter table public.mls_listings enable row level security;
drop policy if exists "mls_listings owner all" on public.mls_listings;
create policy "mls_listings owner all" on public.mls_listings
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (world_id is null or exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid()))
  );
create unique index if not exists uq_mls_listings_key on public.mls_listings(owner_id, listing_key);
create index if not exists idx_mls_listings_status on public.mls_listings(owner_id, status);
create index if not exists idx_mls_listings_close on public.mls_listings(owner_id, close_date desc) where close_date is not null;
