-- FableForge PLATFORM migration (not a generated-app migration).
-- Garvis MISSION ORCHESTRATOR — the Jarvis front door + the worker dispatch model.
--   * garvis_missions — a high-level objective ("grow Theory Thread") the founder hands Garvis.
--   * garvis_tasks    — the decomposed, worker-typed steps of a mission, each with a result + verify.
--
-- This is the orchestrator-workers pattern (Anthropic / Manus): a Planner decomposes the objective
-- into typed Tasks, the runner dispatches each to its Worker, results are verified and reported.
-- Reuses the bounded-autonomy chassis Garvis already has (status lifecycle, per-task result/verify).
-- Reuses app_0003 RLS + touch_updated_at. Additive + idempotent. Run AFTER app_0003.

do $$ begin create type mission_status as enum ('planning','planned','running','review','done','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type task_status as enum ('queued','running','blocked','done','failed','skipped');
exception when duplicate_object then null; end $$;

create table if not exists public.garvis_missions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  app_id      uuid references public.apps(id) on delete set null,  -- null = external / portfolio-wide
  objective   text not null,
  subject     text,                       -- what it's about (app name or external thing)
  status      mission_status not null default 'planning',
  summary     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_missions_owner on public.garvis_missions(owner_id, created_at desc);

create table if not exists public.garvis_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  mission_id  uuid not null references public.garvis_missions(id) on delete cascade,
  seq         int not null default 0,     -- execution order within the mission
  worker      text not null,              -- research | analytics | marketing | bug | builder
  title       text not null,
  input       jsonb not null default '{}'::jsonb,
  status      task_status not null default 'queued',
  result      jsonb,                      -- { summary, artifacts:[{kind,title,body}] }
  verify      jsonb,                      -- { ok, issues, warnings }
  cost_usd    numeric(10,4) default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tasks_mission on public.garvis_tasks(mission_id, seq);

drop trigger if exists trg_missions_touch on public.garvis_missions;
create trigger trg_missions_touch before update on public.garvis_missions for each row execute function public.touch_updated_at();
drop trigger if exists trg_tasks_touch on public.garvis_tasks;
create trigger trg_tasks_touch before update on public.garvis_tasks for each row execute function public.touch_updated_at();

alter table public.garvis_missions enable row level security;
alter table public.garvis_tasks    enable row level security;

drop policy if exists "garvis_missions owner all" on public.garvis_missions;
create policy "garvis_missions owner all" on public.garvis_missions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_missions admin read" on public.garvis_missions;
create policy "garvis_missions admin read" on public.garvis_missions for select using (public.is_admin());

drop policy if exists "garvis_tasks owner all" on public.garvis_tasks;
create policy "garvis_tasks owner all" on public.garvis_tasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "garvis_tasks admin read" on public.garvis_tasks;
create policy "garvis_tasks admin read" on public.garvis_tasks for select using (public.is_admin());

do $$ begin alter publication supabase_realtime add table public.garvis_missions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.garvis_tasks; exception when duplicate_object then null; end $$;
