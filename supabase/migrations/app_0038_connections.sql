-- app_0038_connections.sql — the ad-platform CONNECTIONS layer. Secrets live server-side only
-- (edge function env: META_ADS_ACCESS_TOKEN, GOOGLE_ADS_*); this table holds the NON-secret
-- per-user config (which ad account / customer id) and honest connection state. ad_metrics holds
-- PLATFORM-REPORTED numbers (spend/impressions/clicks) — labeled as such everywhere and never
-- merged with Garvis's own measured leads; spend is real money either way, so adaptive prefers
-- API-synced spend over the manual log when both exist (no double counting). Additive+idempotent.

create table if not exists public.connections (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  provider       text not null check (provider in ('meta_ads', 'google_ads')),
  config         jsonb not null default '{}'::jsonb,   -- {ad_account_id} / {customer_id} — ids, never secrets
  status         text not null default 'unconfigured' check (status in ('unconfigured', 'ready', 'error')),
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (owner_id, provider)
);
alter table public.connections enable row level security;
drop policy if exists "connections owner all" on public.connections;
create policy "connections owner all" on public.connections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.ad_metrics (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  world_id      uuid references public.knowledge_worlds(id) on delete set null,
  provider      text not null check (provider in ('meta_ads', 'google_ads')),
  date          date not null,
  campaign_name text not null,
  spend_usd     numeric not null default 0,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  created_at    timestamptz not null default now(),
  unique (owner_id, provider, date, campaign_name)
);
alter table public.ad_metrics enable row level security;
drop policy if exists "ad_metrics owner read" on public.ad_metrics;
create policy "ad_metrics owner read" on public.ad_metrics
  for select using (owner_id = auth.uid());
-- Writes arrive only via the ads-sync edge function (service role).
create index if not exists idx_ad_metrics_world on public.ad_metrics(world_id, provider, date desc);
