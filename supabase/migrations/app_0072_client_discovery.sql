-- app_0072_client_discovery.sql — THE HANDS-OFF PROSPECTING LAYER for Win Clients. Replaces the
-- daily hunt's Serper-organic sweep with the swift-prep-pros model: discover REAL businesses through
-- Google Places (structured records — name, phone, address, website, category, geo), persist them as
-- a lead pool, and drive discovery from a SELF-EXHAUSTING work queue so the machine stops wasting
-- searches on markets it has already drained.
--
--   discovery_queries      one row per (business-type × city) combo the owner is hunting. The daily
--                          worker picks the next-best non-exhausted query, runs it, and marks it
--                          exhausted after two consecutive zero-insert runs (that market is tapped).
--   discovered_businesses  every real business Places returned, deduped per owner by place_id then by
--                          normalized website. This is the lead pool the demo/pitch step draws from —
--                          businesses with NO website are the strongest "I'll build you one" prospects.
--
-- HONESTY: these tables hold only what Google Places actually returned — never an invented business,
-- phone, or address. status moves new → built (a demo was made) or skipped; nothing here sends.
-- Owner RLS on both. Additive + idempotent.

-- ---------------------------------------------------------------------------------------------
-- The self-exhausting discovery work queue
-- ---------------------------------------------------------------------------------------------
create table if not exists public.discovery_queries (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles(id) on delete cascade,
  keyword               text not null,                 -- the business type, e.g. "roofers"
  city                  text not null,
  state                 text not null,                 -- 2-letter
  query_text            text not null,                 -- "roofers in Austin, TX" (the Places textQuery)
  last_run_at           timestamptz,
  last_inserted         integer not null default 0,
  total_inserted        integer not null default 0,
  run_count             integer not null default 0,
  consecutive_zero_runs integer not null default 0,
  exhausted             boolean not null default false, -- true once the market is drained (2 zero runs)
  created_at            timestamptz not null default now()
);
alter table public.discovery_queries enable row level security;
drop policy if exists "discovery_queries owner all" on public.discovery_queries;
create policy "discovery_queries owner all" on public.discovery_queries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- One row per owner per exact query — re-seeding is a no-op (on conflict do nothing).
create unique index if not exists uq_discovery_queries_owner_query
  on public.discovery_queries(owner_id, query_text);
-- The worker's "next-best" scan: non-exhausted, least-recently-run first.
create index if not exists idx_discovery_queries_pick
  on public.discovery_queries(owner_id, exhausted, last_run_at nulls first);

-- ---------------------------------------------------------------------------------------------
-- The persistent lead pool (Places records)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.discovered_businesses (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  place_id           text,                              -- Google Places id (primary dedupe key)
  company_name       text not null,
  keyword            text,                              -- the business type it was found under
  website            text,
  website_normalized text,                              -- host, lowercased, no scheme/www (dedupe key)
  phone              text,
  address            text,
  city               text,
  state              text,
  category           text,                              -- Places primaryType
  lat                double precision,
  lng                double precision,
  has_website        boolean not null default false,    -- false ⇒ strongest "build you a site" prospect
  status             text not null default 'new'
                       check (status in ('new', 'built', 'skipped')),
  preview_site_id    uuid references public.preview_sites(id) on delete set null,
  source_query_id    uuid references public.discovery_queries(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.discovered_businesses enable row level security;
drop policy if exists "discovered_businesses owner all" on public.discovered_businesses;
create policy "discovered_businesses owner all" on public.discovered_businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Dedupe: never store the same place twice, nor the same website twice, for one owner. Partial
-- uniques so many rows may have NULL place_id / website_normalized without colliding.
create unique index if not exists uq_discovered_owner_place
  on public.discovered_businesses(owner_id, place_id) where place_id is not null;
create unique index if not exists uq_discovered_owner_site
  on public.discovered_businesses(owner_id, website_normalized) where website_normalized is not null;
-- The build step's queue: this owner's un-built leads, no-website first (best prospects).
create index if not exists idx_discovered_build_queue
  on public.discovered_businesses(owner_id, status, has_website, created_at);
