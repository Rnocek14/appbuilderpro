-- THE OPPORTUNITY ENGINE: opportunities become a first-class concept — a job/RFP/grant/commission
-- as a structured row the hunt accumulates and the operator triages. Before this the system could
-- watch one page or find businesses, but a found "mural commission, $18k, deadline Aug 14" had
-- nowhere to live, dedupe, or be tracked to "applied".
--
-- Plus: standing_orders learns the 'opportunity_hunt' kind (scheduled Serper sweeps → fetch →
-- honest extraction → this table). Additive + idempotent.

alter table public.standing_orders drop constraint if exists standing_orders_kind_check;
alter table public.standing_orders
  add constraint standing_orders_kind_check
  check (kind in ('watch_url', 'cadence_digest', 'client_hunt', 'idea_stream', 'opportunity_hunt'));

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  world_id uuid references public.knowledge_worlds(id) on delete set null,  -- which business hunts for it (null = operator-wide)
  order_id uuid references public.standing_orders(id) on delete set null,   -- provenance: which hunt found it
  title text not null,
  summary text not null,                    -- what it is, from the page text only
  source_url text not null,
  kind text not null default 'other' check (kind in ('mural', 'public-art', 'grant', 'commission', 'job', 'other')),
  location text,                            -- null = the page didn't say (never guessed)
  budget_text text,                         -- verbatim from the page, else null
  deadline_text text,                       -- verbatim from the page, else null
  status text not null default 'new' check (status in ('new', 'saved', 'dismissed', 'applied')),
  dedupe_key text not null,                 -- host+path :: normalized title (opportunityHunt.dedupeKey)
  found_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create index if not exists idx_opportunities_owner_status on public.opportunities(owner_id, status, found_at desc);

alter table public.opportunities enable row level security;
drop policy if exists "opportunities owner all" on public.opportunities;
create policy "opportunities owner all" on public.opportunities
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
