-- app_0042_world_goals.sql — THE GOALS SPINE: Garvis adapts every function toward what each
-- project is FOR. A goal is the owner's own statement of what a world is trying to achieve —
-- optionally measurable against rows the system already records honestly (leads, site visits),
-- optionally deadlined. The Next Move engine boosts moves that advance an active goal, producers
-- write toward it, and Ask states it — all grounded in this table, never invented.
--
-- HONESTY: progress is only ever computed from real owner-scoped rows (or the owner's own manual
-- number, labeled as such). A goal with no measurable metric shows "not measurable yet" — no
-- percentage theater. Additive + idempotent.

create table if not exists public.world_goals (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  world_id       uuid not null references public.knowledge_worlds(id) on delete cascade,
  title          text not null,                  -- the owner's words: "10 seller leads a month"
  why            text not null default '',       -- what this unlocks (their words, optional)
  metric_kind    text not null default 'none' check (metric_kind in ('leads', 'visits', 'manual', 'none')),
  target_value   numeric,                        -- e.g. 10 (leads) — null = directional goal
  current_manual numeric,                        -- owner-updated progress for metric 'manual'
  target_date    date,                           -- optional deadline; sharpens Next Move urgency
  status         text not null default 'active' check (status in ('active', 'achieved', 'paused', 'dropped')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.world_goals enable row level security;
drop policy if exists "world_goals owner all" on public.world_goals;
create policy "world_goals owner all" on public.world_goals
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists idx_world_goals_world on public.world_goals(world_id, status, created_at desc);
create index if not exists idx_world_goals_owner on public.world_goals(owner_id, status);
