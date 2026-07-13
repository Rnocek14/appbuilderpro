-- app_0067_timelines.sql — TRANSACTION TIMELINES. The lakegen harvest's most authentically
-- real-estate-shaped idea, rebuilt in house style: a contract-to-close (or listing-to-live)
-- checklist instantiated from a template with offset days against an anchor date. Steps can become
-- REMINDERS (app_0039/app_0062) so the clock fires them — deadlines that actually ring, not rows
-- that wait to be noticed. Owner RLS; world pinned. Additive + idempotent.

create table if not exists public.transaction_timelines (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  world_id    uuid not null references public.knowledge_worlds(id) on delete cascade,
  title       text not null,
  kind        text not null check (kind in ('listing', 'purchase')),
  anchor_date date not null,
  status      text not null default 'active' check (status in ('active', 'closed')),
  created_at  timestamptz not null default now()
);
alter table public.transaction_timelines enable row level security;
drop policy if exists "transaction_timelines owner all" on public.transaction_timelines;
create policy "transaction_timelines owner all" on public.transaction_timelines
  for all using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.knowledge_worlds w where w.id = world_id and w.owner_id = auth.uid())
  );
create index if not exists idx_timelines_world on public.transaction_timelines(world_id, created_at desc);

create table if not exists public.timeline_steps (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  timeline_id  uuid not null references public.transaction_timelines(id) on delete cascade,
  title        text not null,
  due_date     date,
  offset_days  int not null default 0,
  position     int not null default 0,
  done         boolean not null default false,
  done_at      timestamptz
);
alter table public.timeline_steps enable row level security;
drop policy if exists "timeline_steps owner all" on public.timeline_steps;
create policy "timeline_steps owner all" on public.timeline_steps
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists idx_timeline_steps_timeline on public.timeline_steps(timeline_id, position);
