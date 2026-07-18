-- THE CLIENT ENGAGEMENT LAYER: operating a business FOR someone becomes a first-class concept.
-- "Add my client Jane the realtor — I do her marketing" was an honest hole: worlds model
-- businesses, but nothing said WHOSE business a world is, what the operator does for them, or
-- what's still needed from them. An engagement is that record: the client, the scope, the intake
-- checklist, and (once its draft is approved) the world it operates.
--
-- world_id is nullable ON PURPOSE: onboarding creates the engagement immediately and drafts the
-- client's world through the normal genesis approval ceremony — the operator links the world in
-- the Client book after approving it. One engagement per world. Additive + idempotent.

create table if not exists public.client_engagements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid references public.knowledge_worlds(id) on delete set null,
  client_name text not null,
  client_email text,
  business text not null,                  -- what their business is, in the operator's words
  scope text not null,                     -- what the operator does for them ("marketing", "marketing + paperwork")
  status text not null default 'prospect' check (status in ('prospect', 'active', 'paused', 'ended')),
  intake jsonb not null default '[]'::jsonb,  -- [{ item: string, received: boolean }] — what's still needed from the client
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, world_id)
);

create index if not exists idx_client_engagements_owner on public.client_engagements(owner_id, status);

alter table public.client_engagements enable row level security;
drop policy if exists "client_engagements owner all" on public.client_engagements;
create policy "client_engagements owner all" on public.client_engagements
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
