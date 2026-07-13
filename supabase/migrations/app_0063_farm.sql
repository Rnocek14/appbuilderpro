-- app_0063_farm.sql — THE FARM: geographic prospecting becomes real. The readiness audit found the
-- direct-mail pillar produced the creative but the LIST half lived entirely outside the system:
-- no geography entity, nowhere to store a postal address, no do-not-mail suppression. This adds:
--   farm_territories  — a named neighborhood/farm the operator works (zips are notes, not magic)
--   mail_recipients   — address-first households (email-never), deduped by normalized household key
--   do_not_mail       — postal suppression, sacred like email suppression: select-first-insert, never reset
--   mail_batches      — gains territory + batch-token links so a drop can be measured per neighborhood
-- Owner RLS everywhere; world_id pinned to an owned world (with-check), matching standing_orders.
-- Additive + idempotent.

create table if not exists public.farm_territories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  name        text not null,
  zips        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now()
);
alter table public.farm_territories enable row level security;
drop policy if exists "farm_territories owner all" on public.farm_territories;
create policy "farm_territories owner all" on public.farm_territories
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_farm_territories_world on public.farm_territories(world_id, created_at desc);

create table if not exists public.mail_recipients (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  territory_id   uuid not null references public.farm_territories(id) on delete cascade,
  world_id       uuid not null references public.knowledge_worlds(id) on delete cascade,
  full_name      text not null default '',
  situs_address1 text not null,
  situs_city     text not null default '',
  situs_state    text not null default '',
  situs_zip      text not null default '',
  mail_address1  text,                          -- owner mailing address when the source provides one
  mail_city      text,
  mail_state     text,
  mail_zip       text,
  is_absentee    boolean not null default false, -- computed at import: mailing differs from situs
  household_key  text not null,                  -- normalized situs — dedupe + do-not-mail key
  attrs          jsonb not null default '{}',    -- every other source column, kept (close date, price…)
  source         text,
  created_at     timestamptz not null default now()
);
alter table public.mail_recipients enable row level security;
drop policy if exists "mail_recipients owner all" on public.mail_recipients;
create policy "mail_recipients owner all" on public.mail_recipients
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create unique index if not exists uq_mail_recipients_household
  on public.mail_recipients(owner_id, territory_id, household_key);
create index if not exists idx_mail_recipients_territory on public.mail_recipients(territory_id);

create table if not exists public.do_not_mail (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  household_key text not null,
  address_label text not null default '',       -- human-readable line so the list stays auditable
  reason        text,
  created_at    timestamptz not null default now()
);
alter table public.do_not_mail enable row level security;
drop policy if exists "do_not_mail owner all" on public.do_not_mail;
create policy "do_not_mail owner all" on public.do_not_mail
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create unique index if not exists uq_do_not_mail_household on public.do_not_mail(owner_id, household_key);

-- A mail batch can now name the territory it dropped into and carry a per-batch attribution token
-- (the QR link's ?src value), so "the Maple Grove drop: N pieces, M scans" becomes answerable.
alter table public.mail_batches add column if not exists territory_id uuid references public.farm_territories(id) on delete set null;
alter table public.mail_batches add column if not exists batch_token text;
