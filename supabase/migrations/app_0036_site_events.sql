-- app_0036_site_events.sql — G5 INSTRUMENTATION: the sensory organ. Generated websites finally
-- report back to the world that built them: lead-form submissions, visits (with ?src attribution
-- so a postcard QR is traceable to the site visit it caused), clicks. Three tables:
--
--   site_channels — one write-token per world's site. The channel id IS the bearer token embedded
--                   in the generated site's form code, so it must be unguessable (uuid) and
--                   revocable (revoked_at). Write-only: knowing the token lets you POST events,
--                   never read anything.
--   site_events   — the raw honest record: something hit the site. INSERTed only by the
--                   site-events edge function (service role); owners read their own.
--   leads         — a form submission that carried a real email. The inbound half of the audience:
--                   a lead consented to be answered, so the edge fn links (or creates) a contact —
--                   NEVER modifying an existing contact's email_status (suppression is sacred).
--
-- Additive + idempotent. Owner RLS mirrors the house model (owner_id = auth.uid()).

create table if not exists public.site_channels (
  id          uuid primary key default gen_random_uuid(),   -- this IS the ingest token
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,  -- stamped at bind time
  label       text not null default 'website',
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
alter table public.site_channels enable row level security;
drop policy if exists "site_channels owner all" on public.site_channels;
create policy "site_channels owner all" on public.site_channels
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_site_channels_world on public.site_channels(world_id);

create table if not exists public.site_events (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.site_channels(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  kind        text not null check (kind in ('visit', 'lead', 'click', 'qr')),
  path        text,                            -- page path, capped by the edge fn
  source      text,                            -- ?src= attribution (postcard, social, email, …)
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.site_events enable row level security;
drop policy if exists "site_events owner read" on public.site_events;
create policy "site_events owner read" on public.site_events
  for select using (owner_id = auth.uid());
-- No owner INSERT policy: rows arrive only via the service-role edge function.
create index if not exists idx_site_events_world on public.site_events(world_id, created_at desc);
create index if not exists idx_site_events_kind on public.site_events(world_id, kind, created_at desc);

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  channel_id  uuid references public.site_channels(id) on delete set null,
  contact_id  uuid references public.contacts(id) on delete set null,
  name        text,
  email       text not null,
  phone       text,
  message     text,
  source      text not null default 'website', -- website | postcard-qr | social | …
  status      text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at  timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists "leads owner all" on public.leads;
create policy "leads owner all" on public.leads
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_leads_world on public.leads(world_id, status, created_at desc);
