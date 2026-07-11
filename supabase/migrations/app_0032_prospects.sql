-- app_0032_prospects.sql — G4 Market Intelligence: prospects a world FOUND, with evidence-labeled
-- fit. Read-only research output — contacting anyone still goes through contacts + the approval
-- spine. Fit is a LABEL with a grounded reason (strong/possible/weak), never an invented score.

create table if not exists public.prospects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  category    text not null,                 -- which ideal-customer segment the scan targeted
  name        text not null,
  url         text,
  snippet     text,                          -- what the search actually said (the evidence)
  fit         text not null default 'unknown' check (fit in ('strong', 'possible', 'weak', 'unknown')),
  fit_reason  text,                          -- grounded in the snippet/DNA, never invented
  status      text not null default 'new'    check (status in ('new', 'qualified', 'dropped', 'contacted')),
  created_at  timestamptz not null default now()
);

alter table public.prospects enable row level security;
drop policy if exists "prospects owner all" on public.prospects;
create policy "prospects owner all" on public.prospects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create unique index if not exists uq_prospects_world_url on public.prospects(world_id, url) where url is not null;
create index if not exists idx_prospects_world on public.prospects(world_id, status);
