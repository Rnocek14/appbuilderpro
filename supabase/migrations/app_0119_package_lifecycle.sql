-- app_0119_package_lifecycle.sql
-- PACKAGE LIFECYCLE + OFFBOARDING (vertical slice §4-5). The pin (app_0115) recorded which
-- version a client runs; this makes the noun OPERATIONAL: pins carry a lifecycle
-- (active → paused → terminated) with client-specific overrides preserved across version
-- migrations; newly introduced outbound actions require RECORDED CONSENT before they arm
-- (package_consents — an upgrade may propose, never silently enable); and termination produces
-- an OFFBOARDING INVENTORY — the audit found sold sites run forever on the operator's
-- credentials with no takedown path. Nothing continues after a relationship ends without an
-- explicit retained-service entry.

alter table public.package_pins
  add column if not exists status text not null default 'active' check (status in ('active', 'paused', 'terminated')),
  add column if not exists paused_at timestamptz,
  add column if not exists terminated_at timestamptz,
  add column if not exists overrides jsonb not null default '{}',          -- client-specific deltas, survive migrate
  add column if not exists retained_services jsonb not null default '[]'; -- explicit post-termination retentions

comment on column public.package_pins.retained_services is
  'The ONLY legitimate way anything keeps running after termination: explicit entries [{service, reason, until}]. Empty = everything stops.';

create table if not exists public.package_consents (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  client_subscription_id  uuid not null references public.client_subscriptions(id) on delete cascade,
  package_id              uuid not null references public.service_packages(id) on delete cascade,
  action                  text not null,             -- the outbound action consented to (registry capability id)
  consented_at            timestamptz not null default now(),
  evidence                text not null,             -- how consent was given (their words / the signed doc / the call note)
  unique (client_subscription_id, action)
);

create table if not exists public.offboarding_inventories (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  world_id                uuid not null references public.knowledge_worlds(id) on delete cascade,
  client_subscription_id  uuid references public.client_subscriptions(id) on delete set null,
  inventory               jsonb not null,            -- the resolved checklist: hosting, domains, sites, keys, social, mailboxes, providers, automations, jobs, data, assets, billing, requests, reports, transfer obligations
  status                  text not null default 'draft' check (status in ('draft', 'resolved')),
  created_at              timestamptz not null default now(),
  resolved_at             timestamptz
);

create index if not exists idx_package_consents_sub on public.package_consents(client_subscription_id);
create index if not exists idx_offboarding_owner on public.offboarding_inventories(owner_id, status);

alter table public.package_consents enable row level security;
alter table public.offboarding_inventories enable row level security;
drop policy if exists package_consents_all on public.package_consents;
create policy package_consents_all on public.package_consents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists offboarding_inventories_all on public.offboarding_inventories;
create policy offboarding_inventories_all on public.offboarding_inventories
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
